/**
 * PlayerImageService — caches photo candidates by source and resolves the
 * best URL for the current UI intent using the shared source policy.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { useSyncExternalStore } from "react";
import { getApiUrl } from "@/lib/query-client";
import {
  chooseBestPhotoCandidate,
  classifyPhotoSource,
  DEFAULT_PLAYER_PHOTO_FIELD,
  isTrustedPhotoUrl,
  normalizePolicySource,
  type PlayerPhotoFieldType,
} from "@/lib/source-policy";

export type { PlayerPhotoFieldType };

export type PlayerSeed = {
  id?: string | number;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
  photo?: string | null;
  photoSource?: string | null;
  theSportsDbPhoto?: string | null;
  photoCandidates?: Array<{ url: string; source?: string | null }> | null;
};

type CacheEntry = {
  candidates: Record<string, string>;
  ts: number;
};

const CACHE_KEY = "nexora_player_photos_v3";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const PERSIST_DEBOUNCE = 2000;

const photoCache = new Map<string, CacheEntry>();
const inflightPrefetches = new Map<string, Promise<void>>();
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

let cacheVersion = 0;
const cacheListeners = new Set<() => void>();

function bumpCacheVersion(): void {
  cacheVersion++;
  for (const listener of cacheListeners) listener();
}

function subscribeToCacheVersion(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

function getCacheVersionSnapshot(): number {
  return cacheVersion;
}

export function usePhotoCacheVersion(): number {
  return useSyncExternalStore(
    subscribeToCacheVersion,
    getCacheVersionSnapshot,
    getCacheVersionSnapshot,
  );
}

function isHttp(val: unknown): val is string {
  return (
    typeof val === "string" &&
    (/^https?:\/\//i.test(val) || String(val).startsWith("/api/"))
  );
}

function isSofascoreUrl(url: string): boolean {
  return /api\.sofascore\./i.test(url);
}

function isTransfermarktUrl(url: string): boolean {
  return /transfermarkt/i.test(url);
}

function proxyIfNeeded(url: string): string {
  if (isTransfermarktUrl(url) || isSofascoreUrl(url)) {
    const base = getApiUrl();
    return `${base}/api/img?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function cacheKey(player: PlayerSeed): string {
  const id = String(player.id ?? "").trim();
  if (/^\d+$/.test(id) && id.length >= 2) {
    const team = String(player.team ?? "")
      .trim()
      .toLowerCase();
    const league = String(player.league ?? "")
      .trim()
      .toLowerCase();
    return `id:${id}|t:${team || "_"}|l:${league || "_"}`;
  }
  const name = String(player.name ?? "")
    .trim()
    .toLowerCase();
  const team = String(player.team ?? "")
    .trim()
    .toLowerCase();
  return `n:${name}|t:${team}`;
}

function cacheKeys(player: PlayerSeed): string[] {
  const keys = [cacheKey(player)];
  const id = String(player.id ?? "").trim();
  if (/^\d+$/.test(id) && id.length >= 2) keys.push(`id:${id}`);
  const name = String(player.name ?? "")
    .trim()
    .toLowerCase();
  const team = String(player.team ?? "")
    .trim()
    .toLowerCase();
  if (name || team) keys.push(`n:${name}|t:${team}`);
  return [...new Set(keys.filter(Boolean))];
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      if (photoCache.size > MAX_ENTRIES) {
        const sorted = [...photoCache.entries()].sort(
          (a, b) => b[1].ts - a[1].ts,
        );
        photoCache.clear();
        for (const [key, value] of sorted.slice(0, MAX_ENTRIES)) {
          photoCache.set(key, value);
        }
      }
      const entries = [...photoCache.entries()].filter(
        ([, value]) => Date.now() - value.ts < CACHE_TTL,
      );
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch {
      // Persistence is best-effort.
    }
  }, PERSIST_DEBOUNCE);
}

export async function hydratePhotoCache(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<
      [string, CacheEntry | { url?: string; source?: string; ts?: number }]
    >;
    const now = Date.now();
    for (const [key, value] of entries) {
      const normalized = normalizeCacheEntry(value);
      if (!key || !normalized || now - normalized.ts > CACHE_TTL) continue;
      photoCache.set(key, normalized);
    }
  } catch {
    // Ignore hydration errors.
  }
}

export function getCachedPhoto(
  player: PlayerSeed,
  fieldType: PlayerPhotoFieldType = DEFAULT_PLAYER_PHOTO_FIELD,
): string | null {
  const best = chooseBestPhotoCandidate(fieldType, getCachedCandidates(player));
  return best ? proxyIfNeeded(best.url) : null;
}

export function resolvePlayerPhoto(
  player: PlayerSeed,
  fieldType: PlayerPhotoFieldType = DEFAULT_PLAYER_PHOTO_FIELD,
): string | null {
  const seedCandidates = extractSeedCandidates(player);
  if (seedCandidates.length) {
    const changed = writeCache(player, seedCandidates);
    if (changed) {
      schedulePersist();
      bumpCacheVersion();
    }
  }

  const best = chooseBestPhotoCandidate(fieldType, [
    ...seedCandidates,
    ...getCachedCandidates(player),
  ]);

  if (best) {
    if (__DEV__) {
      console.log(
        `[PhotoResolver] ${player.name}: ${fieldType} → ${best.source} ✓`,
      );
    }
    return proxyIfNeeded(best.url);
  }

  if (__DEV__) {
    console.log(
      `[PhotoResolver] ${player.name}: no photo (id=${player.id}, team=${player.team})`,
    );
  }
  return null;
}

export function seedPlayerPhotos(players: PlayerSeed[]): void {
  if (!Array.isArray(players)) return;
  let seeded = 0;
  for (const player of players) {
    const candidates = extractSeedCandidates(player);
    if (candidates.length && writeCache(player, candidates)) {
      seeded += 1;
    }
  }
  if (seeded > 0) {
    schedulePersist();
    bumpCacheVersion();
  }
  if (__DEV__) {
    console.log(
      `[PlayerImageService] Seeded ${seeded}/${players.length} player photo entries (cacheVersion=${cacheVersion}, cacheSize=${photoCache.size})`,
    );
  }
}

export function prefetchPlayerPhotos(
  players: PlayerSeed[],
  concurrency = 6,
  fieldType: PlayerPhotoFieldType = DEFAULT_PLAYER_PHOTO_FIELD,
): void {
  const urls: string[] = [];
  for (const player of players) {
    const url = resolvePlayerPhoto(player, fieldType);
    if (url && isHttp(url)) urls.push(url);
  }
  if (!urls.length) return;

  const unique = [...new Set(urls)];
  let cursor = 0;
  const run = async () => {
    while (cursor < unique.length) {
      const url = unique[cursor++];
      if (inflightPrefetches.has(url)) continue;
      const task = ExpoImage.prefetch(url, { cachePolicy: "memory-disk" })
        .then(() => {})
        .catch(() => {})
        .finally(() => inflightPrefetches.delete(url));
      inflightPrefetches.set(url, task);
      await task;
    }
  };
  for (let index = 0; index < Math.min(concurrency, unique.length); index++) {
    run();
  }
}

export function invalidatePlayerPhoto(player: PlayerSeed): void {
  for (const key of cacheKeys(player)) {
    photoCache.delete(key);
  }
  bumpCacheVersion();
  schedulePersist();
}

export function clearPhotoCache(): void {
  photoCache.clear();
  bumpCacheVersion();
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}

export function getPhotoCacheStats(): { size: number; hitExamples: string[] } {
  const examples: string[] = [];
  let count = 0;
  for (const [key, value] of photoCache) {
    if (count++ < 5) {
      examples.push(
        `${key} → ${Object.keys(value.candidates).join(",") || "none"}`,
      );
    }
  }
  return { size: photoCache.size, hitExamples: examples };
}

function normalizeCacheEntry(
  value:
    | CacheEntry
    | { url?: string; source?: string; ts?: number }
    | null
    | undefined,
): CacheEntry | null {
  if (!value) return null;

  const legacyUrl =
    typeof (value as { url?: string }).url === "string"
      ? String((value as { url?: string }).url || "").trim()
      : "";

  if (legacyUrl && isTrustedPhotoUrl(legacyUrl)) {
    return {
      candidates: {
        [classifyPhotoSource(legacyUrl, (value as { source?: string }).source)]:
          legacyUrl,
      },
      ts: Number((value as { ts?: number }).ts || Date.now()),
    };
  }

  const rawCandidates = (value as CacheEntry).candidates;
  if (!rawCandidates || typeof rawCandidates !== "object") return null;

  const candidates = Object.entries(rawCandidates).reduce<
    Record<string, string>
  >((accumulator, [source, url]) => {
    const candidateUrl = String(url || "").trim();
    if (!isTrustedPhotoUrl(candidateUrl)) return accumulator;
    accumulator[
      normalizePolicySource(source) || classifyPhotoSource(candidateUrl)
    ] = candidateUrl;
    return accumulator;
  }, {});

  if (!Object.keys(candidates).length) return null;
  return {
    candidates,
    ts: Number((value as CacheEntry).ts || Date.now()),
  };
}

function getCachedCandidates(
  player: PlayerSeed,
): Array<{ url: string; source: string }> {
  const pool = new Map<string, { url: string; source: string; ts: number }>();

  for (const key of cacheKeys(player)) {
    const entry = photoCache.get(key);
    if (!entry || Date.now() - entry.ts >= CACHE_TTL) continue;
    for (const [source, url] of Object.entries(entry.candidates)) {
      if (!isTrustedPhotoUrl(url)) continue;
      const normalizedSource =
        normalizePolicySource(source) || classifyPhotoSource(url);
      const existing = pool.get(normalizedSource);
      if (!existing || entry.ts > existing.ts) {
        pool.set(normalizedSource, {
          url,
          source: normalizedSource,
          ts: entry.ts,
        });
      }
    }
  }

  return [...pool.values()].map(({ ts: _ts, ...candidate }) => candidate);
}

function extractSeedCandidates(
  player: PlayerSeed,
): Array<{ url: string; source: string }> {
  const candidates: Array<{ url: string; source: string }> = [];

  for (const candidate of Array.isArray(player.photoCandidates)
    ? player.photoCandidates
    : []) {
    const url = String(candidate?.url ?? "").trim();
    if (!isTrustedPhotoUrl(url)) continue;
    candidates.push({
      url,
      source: classifyPhotoSource(url, candidate?.source),
    });
  }

  const photo = String(player.photo ?? "").trim();
  if (isTrustedPhotoUrl(photo)) {
    candidates.push({
      url: photo,
      source: classifyPhotoSource(photo, player.photoSource),
    });
  }

  const tsdb = String(player.theSportsDbPhoto ?? "").trim();
  if (isTrustedPhotoUrl(tsdb)) {
    candidates.push({ url: tsdb, source: "thesportsdb" });
  }

  const deduped = new Map<string, { url: string; source: string }>();
  for (const candidate of candidates) {
    const key = `${candidate.source}|${candidate.url}`;
    if (!deduped.has(key)) deduped.set(key, candidate);
  }
  return [...deduped.values()];
}

function writeCache(
  player: PlayerSeed,
  candidates: Array<{ url: string; source: string }>,
): boolean {
  if (!candidates.length) return false;

  let changed = false;
  const now = Date.now();

  for (const key of cacheKeys(player)) {
    const existing = normalizeCacheEntry(photoCache.get(key));
    const merged: Record<string, string> = {
      ...(existing?.candidates || {}),
    };
    for (const candidate of candidates) {
      if (!isTrustedPhotoUrl(candidate.url)) continue;
      const source =
        normalizePolicySource(candidate.source) ||
        classifyPhotoSource(candidate.url);
      if (merged[source] !== candidate.url) {
        merged[source] = candidate.url;
        changed = true;
      }
    }
    photoCache.set(key, { candidates: merged, ts: now });
  }

  return changed;
}
