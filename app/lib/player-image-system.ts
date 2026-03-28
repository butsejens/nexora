import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "react-native";
import * as FileSystem from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import {
  getEntityAliases,
  normalizeCountryName,
  normalizeEntityText,
  normalizePlayerName,
  normalizeTeamName,
  tokenOverlapScore,
} from "@/lib/entity-normalization";

type Nullable<T> = T | null | undefined;

export type PlayerSeed = {
  id?: string;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
  gender?: string;
  nationality?: string;
  birthDate?: string;
  age?: number;
  position?: string;
  photo?: string | null;
  theSportsDbPhoto?: string | null;
};

type PlayerImageEntry = {
  key: string;
  playerId?: string;
  name?: string;
  team?: string;
  league?: string;
  photoUrl: string | null;
  localUri: string | null;
  source: "espn" | "internal" | "gemini" | "fallback" | "none";
  confidence: number;
  updatedAt: number;
  expiresAt: number;
};

type PlayerProfileEntry = {
  key: string;
  data: any;
  updatedAt: number;
  expiresAt: number;
};

const IMAGE_CACHE_KEY = "nexora_player_image_cache_v2";
const PROFILE_CACHE_KEY = "nexora_player_profile_cache_v2";
const PRELOAD_META_KEY = "nexora_player_preload_meta_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_ENTRIES = 4500;
const MAX_PROFILE_ENTRIES = 2500;
const PLAYER_IMAGE_DIR = `${LegacyFileSystem.documentDirectory || LegacyFileSystem.cacheDirectory || ""}player-images/`;
const PRELOAD_LEAGUES = ["bel.1", "eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "ned.1", "uefa.champions"];

const imageCache = new Map<string, PlayerImageEntry>();
const profileCache = new Map<string, PlayerProfileEntry>();
const inflightImageRequests = new Map<string, Promise<string | null>>();
let loadedFromDisk = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let warmupPromise: Promise<void> | null = null;
let globalQueryClient: QueryClient | null = null;

function normalizeText(value: Nullable<string>): string {
  return String(value || "").trim();
}

function normalizeName(value: Nullable<string>): string {
  return normalizeEntityText(value);
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0).toString(36);
}

function scoreNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const jaccard = tokenOverlapScore(a, b);
  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  const starts = aParts[0] && bParts[0] && (aParts[0] === bParts[0] ? 0.15 : 0);
  return Math.min(1, jaccard + starts);
}

function readAge(value: unknown): number | null {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePosition(value: Nullable<string>): string {
  const v = normalizeName(value);
  if (!v) return "";
  if (["cf", "st", "fw", "striker", "forward", "attacker"].includes(v)) return "forward";
  if (["rw", "lw", "winger", "rf", "lf"].includes(v)) return "wing";
  if (["am", "cm", "dm", "midfielder", "midfield", "cam", "cdm", "lm", "rm"].includes(v)) return "midfield";
  if (["cb", "lb", "rb", "lwb", "rwb", "defender", "defence", "defense", "back"].includes(v)) return "defense";
  if (["gk", "goalkeeper", "keeper"].includes(v)) return "goalkeeper";
  return v;
}

function normalizeNationality(value: Nullable<string>): string {
  return normalizeCountryName(value);
}

function aliasIntersection(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const bSet = new Set(b);
  return a.some((item) => bSet.has(item));
}

function profileMatchesSeed(player: PlayerSeed, profile: any): boolean {
  if (!profile) return false;

  const seedId = normalizeText(player.id);
  const profileId = normalizeText(profile?.id);
  if (/^\d+$/.test(seedId) && /^\d+$/.test(profileId) && seedId !== profileId) return false;

  const seedName = normalizeName(player.name);
  const profileName = normalizePlayerName(profile?.name || profile?.fullName || profile?.displayName);
  const seedNameAliases = getEntityAliases(seedName, "player");
  const profileNameAliases = getEntityAliases(profileName, "player");
  const nameScore = scoreNameSimilarity(seedName, profileName);
  if (seedName && profileName && nameScore < 0.58 && !aliasIntersection(seedNameAliases, profileNameAliases)) return false;

  const seedTeam = normalizeTeamName(player.team);
  const profileTeam = normalizeTeamName(profile?.currentClub || profile?.team || profile?.club?.name);
  if (seedTeam && profileTeam) {
    const teamScore = scoreNameSimilarity(seedTeam, profileTeam);
    const seedTeamAliases = getEntityAliases(seedTeam, "team");
    const profileTeamAliases = getEntityAliases(profileTeam, "team");
    if (teamScore < 0.45 && !aliasIntersection(seedTeamAliases, profileTeamAliases)) return false;
  }

  const seedNat = normalizeNationality(player.nationality);
  const profileNat = normalizeNationality(profile?.nationality || profile?.citizenship);
  if (seedNat && profileNat) {
    const natMatch = seedNat === profileNat || seedNat.includes(profileNat) || profileNat.includes(seedNat);
    if (!natMatch) return false;
  }

  const seedPos = normalizePosition(player.position);
  const profilePos = normalizePosition(profile?.position);
  if (seedPos && profilePos && seedPos !== profilePos) {
    // Do not reject if one side is a broader category of the other.
    const broadPosMatch =
      (seedPos === "forward" && (profilePos === "wing" || profilePos === "forward")) ||
      (profilePos === "forward" && (seedPos === "wing" || seedPos === "forward")) ||
      (seedPos === "midfield" && profilePos === "midfield") ||
      (seedPos === "defense" && profilePos === "defense");
    if (!broadPosMatch) return false;
  }

  const seedAge = readAge(player.age);
  const profileAge = readAge(profile?.age);
  if (seedAge && profileAge && Math.abs(seedAge - profileAge) > 4) return false;

  return true;
}

export function makePlayerCacheKey(player: PlayerSeed): string {
  const id = normalizeText(player.id);
  if (/^\d+$/.test(id)) return `id:${id}`;
  const name = normalizePlayerName(player.name);
  const team = normalizeTeamName(player.team);
  const league = normalizeName(player.league);
  const sport = normalizeName(player.sport || "soccer");
  const gender = normalizeName(player.gender);
  return `name:${name}|team:${team}|league:${league}|sport:${sport}|gender:${gender}`;
}

function composeNameKey(player: PlayerSeed, overrides?: { team?: string; league?: string }): string {
  const name = normalizePlayerName(player.name);
  const team = normalizeTeamName(overrides?.team ?? player.team);
  const league = normalizeName(overrides?.league ?? player.league);
  const sport = normalizeName(player.sport || "soccer");
  const gender = normalizeName(player.gender);
  return `name:${name}|team:${team}|league:${league}|sport:${sport}|gender:${gender}`;
}

function getPlayerAliasKeys(player: PlayerSeed, profile?: any): string[] {
  const keys = new Set<string>();
  const id = normalizeText(player.id || profile?.id);
  const name = normalizePlayerName(player.name || profile?.name || profile?.fullName || profile?.displayName);
  const team = normalizeTeamName(player.team || profile?.currentClub || profile?.team || profile?.club?.name);

  keys.add(makePlayerCacheKey(player));
  if (/^\d+$/.test(id)) keys.add(`id:${id}`);

  if (name) {
    for (const alias of getEntityAliases(name, "player")) {
      const aliasSeed = { ...player, name: alias };
      keys.add(composeNameKey(aliasSeed));
      keys.add(composeNameKey({ ...aliasSeed, team: "", league: "" }));
    }

    keys.add(composeNameKey(player));
    keys.add(composeNameKey({ ...player, team: "", league: "" }));

    const profileTeam = normalizeText(profile?.currentClub || profile?.team || profile?.club?.name);
    const profileLeague = normalizeText(profile?.league || profile?.competition || profile?.leagueName);
    if (profileTeam || profileLeague) {
      keys.add(composeNameKey(player, { team: profileTeam || player.team, league: profileLeague || player.league }));
    }

    if (team) {
      for (const teamAlias of getEntityAliases(team, "team")) {
        keys.add(composeNameKey(player, { team: teamAlias, league: player.league }));
      }
    }
  }

  return [...keys].filter(Boolean);
}

function getBestCacheEntry<T extends { expiresAt: number; confidence?: number; updatedAt?: number }>(
  map: Map<string, T>,
  keys: string[]
): T | null {
  let best: T | null = null;
  for (const key of keys) {
    const hit = map.get(key);
    if (!hit || isExpired(hit.expiresAt)) continue;
    if (!best) {
      best = hit;
      continue;
    }
    const bestConfidence = Number((best as any)?.confidence || 0);
    const hitConfidence = Number((hit as any)?.confidence || 0);
    if (hitConfidence > bestConfidence) {
      best = hit;
      continue;
    }
    if (hitConfidence === bestConfidence && Number(hit.updatedAt || 0) > Number((best as any)?.updatedAt || 0)) {
      best = hit;
    }
  }
  return best;
}

function now(): number {
  return Date.now();
}

function isExpired(ts: number): boolean {
  return ts <= now();
}

function isValidHttpUrl(value: Nullable<string>): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(String(value));
}

function isEspnPhoto(url: string): boolean {
  return /a\.espncdn\.com\/i\/headshots\//i.test(url);
}

function classifySource(url: string): PlayerImageEntry["source"] {
  if (isEspnPhoto(url)) return "espn";
  if (/wikipedia|wikimedia/i.test(url)) return "gemini";
  if (/ui-avatars\.com/i.test(url)) return "fallback";
  return "internal";
}

function scoreCandidate(url: string, player: PlayerSeed, meta?: { candidateName?: string; candidateTeam?: string }): number {
  let score = 0.20; // Base score improved
  
  // ESPN photos from numeric ID are very reliable
  if (isEspnPhoto(url) && /^\d+$/.test(normalizeText(player.id))) {
    score += 0.35; // Much higher confidence for ESPN numeric IDs
  } else if (isEspnPhoto(url)) {
    score += 0.15; // Lower if ID type unclear
  }
  
  // Trusted sources
  if (/thesportsdb|transfermarkt/i.test(url)) score += 0.22;
  if (/wikimedia|wikipedia/i.test(url)) score += 0.16;

  const playerName = normalizePlayerName(player.name);
  const candidateName = normalizePlayerName(meta?.candidateName || player.name);
  const playerTeam = normalizeTeamName(player.team);
  const candidateTeam = normalizeTeamName(meta?.candidateTeam || player.team);

  const nameSimilarity = scoreNameSimilarity(playerName, candidateName);
  score += nameSimilarity * 0.50;

  if (playerTeam && candidateTeam) {
    const teamSimilarity = scoreNameSimilarity(playerTeam, candidateTeam);
    score += teamSimilarity * 0.15;
  }

  if (normalizeText(player.id) && /^\d+$/.test(normalizeText(player.id))) {
    score += 0.08;
  }

  return Math.max(0, Math.min(1, score));
}

async function ensureImageDirectory(): Promise<void> {
  if (!PLAYER_IMAGE_DIR) return;
  try {
    await FileSystem.makeDirectoryAsync(PLAYER_IMAGE_DIR, { intermediates: true });
  } catch {
    // no-op
  }
}

async function cacheRemoteImageLocally(cacheKey: string, photoUrl: string): Promise<string | null> {
  if (!PLAYER_IMAGE_DIR || !isValidHttpUrl(photoUrl)) return null;
  await ensureImageDirectory();

  const extMatch = String(photoUrl).match(/\.(png|jpg|jpeg|webp)(\?|$)/i);
  const ext = (extMatch?.[1] || "jpg").toLowerCase();
  const fileName = `${hashString(`${cacheKey}:${photoUrl}`)}.${ext}`;
  const destination = `${PLAYER_IMAGE_DIR}${fileName}`;

  try {
    const existing = await FileSystem.getInfoAsync(destination);
    if (existing.exists) return destination;

    const result = await LegacyFileSystem.downloadAsync(photoUrl, destination);
    if (result.status >= 200 && result.status < 300) return result.uri;
  } catch {
    // ignore
  }

  return null;
}

async function prefetchRuntimeImage(url: string): Promise<void> {
  if (!isValidHttpUrl(url)) return;
  try {
    await Image.prefetch(url);
  } catch {
    // no-op
  }
}

function trimCacheMap<T extends { updatedAt: number }>(map: Map<string, T>, max: number): void {
  if (map.size <= max) return;
  const sorted = [...map.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  map.clear();
  for (const [k, v] of sorted.slice(0, max)) map.set(k, v);
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      trimCacheMap(imageCache, MAX_IMAGE_ENTRIES);
      trimCacheMap(profileCache, MAX_PROFILE_ENTRIES);
      await AsyncStorage.multiSet([
        [IMAGE_CACHE_KEY, JSON.stringify([...imageCache.entries()])],
        [PROFILE_CACHE_KEY, JSON.stringify([...profileCache.entries()])],
        [PRELOAD_META_KEY, JSON.stringify({ updatedAt: now() })],
      ]);
    } catch {
      // ignore persistence errors
    }
  }, 300);
}

export async function hydratePlayerImageCaches(): Promise<void> {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    const [imagesRaw, profilesRaw] = await AsyncStorage.multiGet([IMAGE_CACHE_KEY, PROFILE_CACHE_KEY]).then((pairs) => pairs.map(([, v]) => v));

    if (imagesRaw) {
      const parsed = JSON.parse(imagesRaw) as Array<[string, PlayerImageEntry]>;
      for (const [k, v] of parsed || []) {
        if (!k || !v || isExpired(Number(v.expiresAt || 0))) continue;
        imageCache.set(k, v);
      }
    }
    if (profilesRaw) {
      const parsed = JSON.parse(profilesRaw) as Array<[string, PlayerProfileEntry]>;
      for (const [k, v] of parsed || []) {
        if (!k || !v || isExpired(Number(v.expiresAt || 0))) continue;
        profileCache.set(k, v);
      }
    }
  } catch {
    // ignore hydration errors
  }
}

export function getCachedPlayerImage(player: PlayerSeed): string | null {
  const hit = getBestCacheEntry(imageCache, getPlayerAliasKeys(player));
  if (!hit) return null;
  return hit.localUri || hit.photoUrl || null;
}

export function getPlayerFallbackAvatar(name: Nullable<string>): string | null {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return null;
  
  // Use a more sophisticated fallback service with better avatars
  const initials = normalizedName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=300&background=random&color=fff&bold=true&format=png`;
}

export function getBestCachedOrSeedPlayerImage(player: PlayerSeed): string | null {
  const cached = getCachedPlayerImage(player);
  if (cached) return cached;

  // Prefer direct seed photos (from API) over ESPN fallback
  if (isValidHttpUrl(player.photo)) return String(player.photo);
  if (isValidHttpUrl(player.theSportsDbPhoto)) return String(player.theSportsDbPhoto);

  // Only use ESPN as last resort if we have a numeric ID
  const playerId = normalizeText(player.id);
  if (/^\d+$/.test(playerId) && playerId.length > 3) {
    return `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(playerId)}.png`;
  }

  // Fallback to initials avatar
  return getPlayerFallbackAvatar(player.name);
}

export async function resolvePlayerImageUri(
  player: PlayerSeed,
  options?: { allowNetwork?: boolean; preloadProfile?: boolean }
): Promise<string | null> {
  const cached = getCachedPlayerImage(player);
  if (cached) return cached;

  const resolved = await getPlayerImage(player, options);
  if (resolved) return resolved;

  return getBestCachedOrSeedPlayerImage(player);
}

export function getCachedPlayerProfile(player: PlayerSeed): any | null {
  const hit = getBestCacheEntry(profileCache, getPlayerAliasKeys(player));
  if (!hit) return null;
  return hit.data;
}

function mergeProfileIntoCache(player: PlayerSeed, profileData: any): void {
  const entries = getPlayerAliasKeys(player, profileData);
  const updatedAt = now();
  const expiresAt = updatedAt + CACHE_TTL_MS;
  for (const key of entries) {
    profileCache.set(key, {
      key,
      data: profileData,
      updatedAt,
      expiresAt,
    });
  }
  if (globalQueryClient) {
    globalQueryClient.setQueryData(["player-profile", player.id, player.name, player.team, player.league], profileData);
  }
  schedulePersist();
}

function mergeImageIntoCache(player: PlayerSeed, image: { photoUrl: string | null; localUri: string | null; confidence: number; source: PlayerImageEntry["source"] }): void {
  const entries = getPlayerAliasKeys(player);
  const updatedAt = now();
  const expiresAt = updatedAt + CACHE_TTL_MS;
  for (const key of entries) {
    imageCache.set(key, {
      key,
      playerId: normalizeText(player.id) || undefined,
      name: normalizeText(player.name) || undefined,
      team: normalizeText(player.team) || undefined,
      league: normalizeText(player.league) || undefined,
      photoUrl: image.photoUrl,
      localUri: image.localUri,
      source: image.source,
      confidence: image.confidence,
      updatedAt,
      expiresAt,
    });
  }
  schedulePersist();
}

async function getPlayerProfileFromApi(player: PlayerSeed): Promise<any | null> {
  const rawId = normalizeText(player.id);
  const name = encodeURIComponent(normalizeText(player.name));
  const team = encodeURIComponent(normalizeText(player.team));
  const leagueRaw = normalizeText(player.league || "eng.1") || "eng.1";
  const league = encodeURIComponent(leagueRaw);
  const routeId = encodeURIComponent(rawId || `lookup-${hashString(`${normalizeText(player.name)}|${normalizeText(player.team)}|${leagueRaw}`)}`);
  try {
    const response = await Promise.race([
      apiRequest("GET", `/api/sports/player/${routeId}?name=${name}&team=${team}&league=${league}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("player profile timeout")), 7000)),
    ]);
    const json = await response.json();
    if (!json || json?.error) return null;
    if (!profileMatchesSeed(player, json)) return null;
    return json;
  } catch {
    return null;
  }
}

function collectCandidates(player: PlayerSeed, profile: any | null): Array<{ url: string; source: PlayerImageEntry["source"]; confidence: number }> {
  const candidates: Array<{ url: string; source: PlayerImageEntry["source"]; confidence: number }> = [];
  const playerId = normalizeText(player.id);
  const seen = new Set<string>();

  const addCandidate = (url: string, source: PlayerImageEntry["source"], confidence: number) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, source, confidence });
  };

  // 1. Direct seed photos (from player API) — trusted first
  const seedPhotos = [player.photo, player.theSportsDbPhoto]
    .map((x) => normalizeText(x || ""))
    .filter((x) => isValidHttpUrl(x));
  for (const url of seedPhotos) {
    const source = classifySource(url);
    // Direct seed photos get high confidence since they come from the player record
    addCandidate(url, source, 0.96);
  }

  // 2. ESPN CDN from numeric ID — identity-locked, very high confidence
  if (/^\d+$/.test(playerId) && playerId.length > 3) {
    const espnUrl = `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(playerId)}.png`;
    addCandidate(espnUrl, "espn", 0.94);
  }

  // 3. Profile photos — scored normally
  const profilePhotos = [profile?.photo, profile?.theSportsDbPhoto, profile?.headshot, profile?.headshotUrl]
    .map((x) => normalizeText(x || ""))
    .filter((x) => isValidHttpUrl(x));
  for (const url of profilePhotos) {
    const source = classifySource(url);
    const confidence = scoreCandidate(url, player, {
      candidateName: profile?.name || player.name,
      candidateTeam: profile?.currentClub || player.team,
    });
    addCandidate(url, source, confidence);
  }

  // 4. Deterministic fallback image — never wrong identity, graceful degradation
  const fallbackName = normalizeText(profile?.name || player.name || "Player");
  if (fallbackName) {
    const fallbackUrl = getPlayerFallbackAvatar(fallbackName);
    if (fallbackUrl) {
      addCandidate(fallbackUrl, "fallback", 0.45);
    }
  }

  return candidates;
}

function chooseBestCandidate(player: PlayerSeed, candidates: Array<{ url: string; source: PlayerImageEntry["source"]; confidence: number }>): { url: string | null; source: PlayerImageEntry["source"]; confidence: number } {
  if (!candidates.length) return { url: null, source: "none", confidence: 0 };

  const name = normalizeName(player.name);
  const hasId = /^\d+$/.test(normalizeText(player.id)) && normalizeText(player.id).length > 3;
  const hasIdentityContext = Boolean(name) && (hasId || Boolean(normalizeName(player.team)));
  
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const winner = sorted[0];

  // ESPN photos with numeric IDs are identity-locked — very low threshold
  if (winner.source === "espn" && hasId && winner.confidence >= 0.40) {
    return { url: winner.url, source: winner.source, confidence: winner.confidence };
  }

  // Direct seed photos are trusted
  if (winner.source === "internal" && winner.confidence >= 0.85) {
    return { url: winner.url, source: winner.source, confidence: winner.confidence };
  }

  // Require higher confidence for other sources without ID
  const minConfidence = hasId ? 0.50 : hasIdentityContext ? 0.60 : 0.75;
  
  if (winner.confidence < minConfidence) {
    // Try to find a fallback avatar if we can't match
    const fallback = winner.source === "fallback" ? winner : sorted.find((c) => c.source === "fallback");
    if (fallback && hasIdentityContext) {
      return { url: fallback.url, source: fallback.source, confidence: fallback.confidence };
    }
    return { url: null, source: "none", confidence: 0 };
  }

  return { url: winner.url, source: winner.source, confidence: winner.confidence };
}

export async function getPlayerImage(player: PlayerSeed, options?: { allowNetwork?: boolean; preloadProfile?: boolean }): Promise<string | null> {
  await hydratePlayerImageCaches();
  const key = makePlayerCacheKey(player);
  const cached = imageCache.get(key);
  if (cached && !isExpired(cached.expiresAt) && (cached.localUri || cached.photoUrl)) {
    return cached.localUri || cached.photoUrl || null;
  }

  const inflight = inflightImageRequests.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    let profile = getCachedPlayerProfile(player);
    const allowNetwork = options?.allowNetwork !== false;

    if (!profile && allowNetwork) {
      profile = await getPlayerProfileFromApi(player);
      if (profile) mergeProfileIntoCache(player, profile);
    }

    const candidates = collectCandidates(player, profile);
    const winner = chooseBestCandidate(player, candidates);
    if (!winner.url) {
      mergeImageIntoCache(player, { photoUrl: null, localUri: null, confidence: 0, source: "none" });
      return null;
    }

    await prefetchRuntimeImage(winner.url);
    const localUri = await cacheRemoteImageLocally(key, winner.url);
    mergeImageIntoCache(player, {
      photoUrl: winner.url,
      localUri,
      confidence: winner.confidence,
      source: winner.source,
    });

    if (options?.preloadProfile && profile && globalQueryClient) {
      globalQueryClient.setQueryData(["player-profile", player.id, player.name, player.team, player.league], profile);
    }

    return localUri || winner.url;
  })();

  inflightImageRequests.set(key, task);
  try {
    return await task;
  } finally {
    inflightImageRequests.delete(key);
  }
}

function dedupePlayers(players: PlayerSeed[]): PlayerSeed[] {
  const map = new Map<string, PlayerSeed>();
  for (const player of players) {
    const key = makePlayerCacheKey(player);
    if (!map.has(key)) map.set(key, player);
  }
  return [...map.values()];
}

async function runBatches<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  const count = Math.max(1, Math.min(concurrency, 12));
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index], index);
      } catch {
        // continue with next
      }
    }
  }

  await Promise.all(Array.from({ length: count }, () => runOne()));
}

function mapTeamPlayers(teamData: any, league: string): PlayerSeed[] {
  const teamName = normalizeText(teamData?.name);
  const players = Array.isArray(teamData?.players) ? teamData.players : [];
  return players
    .map((player: any) => ({
      id: normalizeText(player?.id),
      name: normalizeText(player?.name),
      team: teamName,
      league,
      sport: "soccer",
      nationality: normalizeText(player?.nationality),
      age: Number(player?.age || 0) || undefined,
      photo: player?.photo || null,
      theSportsDbPhoto: player?.theSportsDbPhoto || null,
    }))
    .filter((player: PlayerSeed) => Boolean(player.name));
}

async function fetchTeamDetail(teamId: string, teamName: string, league: string): Promise<any | null> {
  if (!teamId) return null;
  try {
    const tn = encodeURIComponent(teamName || "");
    const response = await Promise.race([
      apiRequest("GET", `/api/sports/team/${encodeURIComponent(teamId)}?sport=soccer&league=${encodeURIComponent(league)}&teamName=${tn}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("team detail timeout")), 9000)),
    ]);
    const json = await response.json();
    if (!json || json?.error) return null;
    return json;
  } catch {
    return null;
  }
}

async function fetchStandings(league: string): Promise<any[]> {
  try {
    const response = await Promise.race([
      apiRequest("GET", `/api/sports/standings/${encodeURIComponent(league)}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("standings timeout")), 7000)),
    ]);
    const json = await response.json();
    if (Array.isArray(json?.standings)) return json.standings;
    if (Array.isArray(json?.teams)) return json.teams;
    return [];
  } catch {
    return [];
  }
}

async function collectStartupPlayers(queryClient: QueryClient): Promise<PlayerSeed[]> {
  const allPlayers: PlayerSeed[] = [];

  await runBatches(PRELOAD_LEAGUES, 3, async (league) => {
    const standings = await fetchStandings(league);
    queryClient.setQueryData(["standings", league], { standings, teams: standings });

    const topTeams = standings.slice(0, 12);
    await runBatches(topTeams, 4, async (team: any) => {
      const teamId = normalizeText(team?.teamId || team?.id);
      const teamName = normalizeText(team?.team || team?.name);
      if (!teamId || !teamName) return;

      const detail = await fetchTeamDetail(teamId, teamName, league);
      if (!detail) return;

      queryClient.setQueryData(["team-detail", teamId, "soccer", league], detail);
      allPlayers.push(...mapTeamPlayers(detail, league));
    });
  });

  return dedupePlayers(allPlayers);
}

export function preloadPlayerProfileInBackground(player: PlayerSeed): void {
  void (async () => {
    await hydratePlayerImageCaches();
    const key = makePlayerCacheKey(player);
    const cachedProfile = profileCache.get(key);
    if (cachedProfile && !isExpired(cachedProfile.expiresAt)) return;

    const profile = await getPlayerProfileFromApi(player);
    if (!profile) return;
    mergeProfileIntoCache(player, profile);
    if (profile?.photo || profile?.theSportsDbPhoto) {
      await getPlayerImage({ ...player, photo: profile.photo, theSportsDbPhoto: profile.theSportsDbPhoto }, { allowNetwork: false });
    }
  })();
}

export function startPlayerImageWarmup(queryClient: QueryClient): Promise<void> {
  globalQueryClient = queryClient;
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    await hydratePlayerImageCaches();
    const players = await collectStartupPlayers(queryClient);

    await runBatches(players, 6, async (player) => {
      await getPlayerImage(player, { allowNetwork: true, preloadProfile: true });
    });
  })().catch(() => undefined);

  return warmupPromise;
}

export function getPlayerImageWarmupStatus(): { totalImages: number; totalProfiles: number } {
  return {
    totalImages: imageCache.size,
    totalProfiles: profileCache.size,
  };
}
