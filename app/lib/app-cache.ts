/**
 * NEXORA APP CACHE
 *
 * Two-tier cache (memory + AsyncStorage) with TTL and stale-while-revalidate.
 * Used to seed TanStack Query on cold starts so screens feel instant.
 *
 * Usage:
 *   await preloadDiskCache();          // call once at bootstrap
 *   cacheSet("sports/live", data, 30_000);
 *   const cached = await cacheGet<T>("sports/live");
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";

const DISK_KEY = "nexora_api_cache_v1";
const MAX_DISK_ENTRIES = 100;

type CacheEntry = { data: unknown; expiresAt: number };

/** In-memory layer — survives JS bridge lifecycle, gone on app restart */
const mem = new Map<string, CacheEntry>();

let diskLoaded = false;
let diskLoadPromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ─── disk I/O ────────────────────────────────────────────────────────────────

async function loadDisk(): Promise<void> {
  if (diskLoaded) return;
  if (diskLoadPromise) return diskLoadPromise;

  diskLoadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(DISK_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      const now = Date.now();
      for (const [k, v] of Object.entries(parsed)) {
        if (v.expiresAt > now) mem.set(k, v);
      }
    } catch {
      // corrupt disk cache – ignore, will be rebuilt
    } finally {
      diskLoaded = true;
    }
  })();

  return diskLoadPromise;
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const now = Date.now();
      // Evict expired, keep newest MAX_DISK_ENTRIES
      const valid: [string, CacheEntry][] = [];
      for (const [k, v] of mem.entries()) {
        if (v.expiresAt > now) valid.push([k, v]);
      }
      const trimmed = valid
        .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
        .slice(0, MAX_DISK_ENTRIES);
      const toSave: Record<string, CacheEntry> = {};
      for (const [k, v] of trimmed) toSave[k] = v;
      await AsyncStorage.setItem(DISK_KEY, JSON.stringify(toSave));
    } catch {
      // ignore disk write failure
    }
  }, 800);
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Must be called early (before screens render) to load cached data from disk
 * into the memory layer so `cacheGet` is synchronous after this point.
 */
export async function preloadDiskCache(): Promise<void> {
  await loadDisk();
}

/** Read a cached value. Returns null if missing or expired. */
export function cacheGet<T>(key: string): T | null {
  const entry = mem.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    return null;
  }
  return entry.data as T;
}

/**
 * Read cache without evicting expired entries. Useful for stale fallback UX.
 */
export function cachePeek<T>(key: string): { data: T; isStale: boolean } | null {
  const entry = mem.get(key);
  if (!entry) return null;
  return {
    data: entry.data as T,
    isStale: entry.expiresAt < Date.now(),
  };
}

/** Return cached data even when stale (if present). */
export function cacheGetStale<T>(key: string): T | null {
  const peek = cachePeek<T>(key);
  return peek ? peek.data : null;
}

/** Write a value to cache with a TTL in milliseconds. */
export function cacheSet(key: string, data: unknown, ttlMs: number): void {
  mem.set(key, { data, expiresAt: Date.now() + ttlMs });
  scheduleSave();
}

/** Remove a single key. */
export function cacheDelete(key: string): void {
  mem.delete(key);
}

/** Clear all entries. */
export async function cacheClear(): Promise<void> {
  mem.clear();
  try {
    await AsyncStorage.removeItem(DISK_KEY);
  } catch {}
}

// ─── TanStack Query hydration ─────────────────────────────────────────────────

/**
 * Seed a QueryClient from disk cache entries so screens render immediately
 * on cold start without waiting for the network.
 */
export function hydrateQueryClientFromCache(
  queryClient: QueryClient,
  entries: { queryKey: readonly unknown[]; cacheKey: string }[]
): void {
  for (const { queryKey, cacheKey } of entries) {
    const cached = cacheGet(cacheKey);
    if (cached != null) {
      queryClient.setQueryData(queryKey, cached);
    }
  }
}

/**
 * After a successful fetch, persist the result so it can be hydrated on the
 * next cold start.
 */
export function persistQueryResult(
  cacheKey: string,
  data: unknown,
  ttlMs: number
): void {
  cacheSet(cacheKey, data, ttlMs);
}

// ─── Pre-defined TTLs ─────────────────────────────────────────────────────────

export const TTL = {
  /** Live sports data — very short, refresh aggressively */
  LIVE: 15_000,
  /** Today's matches — reasonable freshness */
  SPORTS_TODAY: 2 * 60_000,
  /** Standings / top scorers — can be stale for a while */
  STANDINGS: 10 * 60_000,
  /** Highlights / predictions — low churn */
  HIGHLIGHTS: 20 * 60_000,
  /** Trending movies/series — changes slowly */
  TRENDING: 10 * 60_000,
  /** Genres catalog — almost static */
  GENRES: 60 * 60_000,
  /** Deep detail cards */
  DETAIL: 30 * 60_000,
} as const;

/** Canonical cache keys shared between prefetch and screen queries. */
export function cacheKey(tag: string, ...parts: string[]): string {
  return [tag, ...parts].join(":");
}
