/**
 * Nexora – Persistent Cache Service
 *
 * Provides a structured key/value persistent store backed by AsyncStorage.
 *
 * Features:
 *   - TTL-based expiry
 *   - Stale-while-revalidate: expired entries are still readable as stale
 *   - In-memory read-through cache (avoids repeated AsyncStorage reads)
 *   - Batched write queue (avoids hammering AsyncStorage)
 *   - Type-safe generics
 *
 * This is the client-side counterpart to the server's in-memory cache.
 * Use React Query for query-scoped caching; use this for persistent data
 * that must survive app restarts (user prefs, sport follow state, watch progress).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "nx_cache_";
const WRITE_DEBOUNCE_MS = 300;

interface CacheEntry<T> {
  value: T;
  storedAt: number;    // epoch ms
  expiresAt: number;   // epoch ms; 0 = never
}

// In-memory layer: avoids repeated AsyncStorage reads in the same session
const mem = new Map<string, CacheEntry<unknown>>();

// Pending writes (debounced)
const pending = new Map<string, NodeJS.Timeout>();

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

/** Flush entry to AsyncStorage (debounced) */
function scheduleWrite(key: string, entry: CacheEntry<unknown>): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    pending.delete(key);
    try {
      await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
    } catch {
      // Storage full or unavailable — non-fatal
    }
  }, WRITE_DEBOUNCE_MS);
  pending.set(key, timer);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write a value to the cache.
 * @param ttlMs — TTL in milliseconds; 0 = no expiry
 */
export async function cacheSet<T>(key: string, value: T, ttlMs = 0): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    value,
    storedAt: now,
    expiresAt: ttlMs > 0 ? now + ttlMs : 0,
  };
  mem.set(key, entry as CacheEntry<unknown>);
  scheduleWrite(key, entry as CacheEntry<unknown>);
}

/**
 * Read a value from the cache.
 * Returns null if the entry does not exist or has expired.
 * For stale reads (expired but still valuable), use cacheGetStale().
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  // Check in-memory first
  const inMem = mem.get(key);
  if (inMem) {
    if (inMem.expiresAt === 0 || Date.now() <= inMem.expiresAt) {
      return inMem.value as T;
    }
    return null; // expired
  }

  // Fall through to AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    mem.set(key, entry as CacheEntry<unknown>);
    if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) return null;
    return entry.value;
  } catch {
    return null;
  }
}

/**
 * Read a value, returning stale data even if expired.
 * Useful for showing cached content while revalidating in background.
 */
export async function cacheGetStale<T>(key: string): Promise<T | null> {
  const inMem = mem.get(key);
  if (inMem) return inMem.value as T;

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    mem.set(key, entry as CacheEntry<unknown>);
    return entry.value;
  } catch {
    return null;
  }
}

/** Check age of a cached entry in milliseconds (returns Infinity if not cached) */
export async function cacheAge(key: string): Promise<number> {
  const inMem = mem.get(key);
  if (inMem) return Date.now() - inMem.storedAt;

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return Infinity;
    const entry = JSON.parse(raw) as CacheEntry<unknown>;
    return Date.now() - entry.storedAt;
  } catch {
    return Infinity;
  }
}

/** Delete a cached entry */
export async function cacheDel(key: string): Promise<void> {
  mem.delete(key);
  const t = pending.get(key);
  if (t) { clearTimeout(t); pending.delete(key); }
  try {
    await AsyncStorage.removeItem(storageKey(key));
  } catch {}
}

/** Load a set of cache keys into the in-memory layer (warm-up) */
export async function cacheWarmup(keys: string[]): Promise<void> {
  const storageKeys = keys.map(storageKey);
  try {
    const pairs = await AsyncStorage.multiGet(storageKeys);
    for (const [rawKey, rawValue] of pairs) {
      if (!rawValue) continue;
      const logicalKey = rawKey.startsWith(PREFIX) ? rawKey.slice(PREFIX.length) : rawKey;
      try {
        const entry = JSON.parse(rawValue) as CacheEntry<unknown>;
        mem.set(logicalKey, entry);
      } catch {}
    }
  } catch {}
}

/**
 * Clear all cache entries written by this service.
 * Use sparingly — prefer targeted cacheDel.
 */
export async function cacheClearAll(): Promise<void> {
  mem.clear();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const ours = allKeys.filter(k => k.startsWith(PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {}
}

// ─── TTL constants (shared across the app) ───────────────────────────────────

export const CacheTTL = {
  /** Sports live data: very short */
  LIVE_MATCH: 30 * 1000,                   // 30 seconds
  /** Current day sports: short */
  TODAY_SPORTS: 2 * 60 * 1000,             // 2 min
  /** Standings / leaderboards: medium */
  STANDINGS: 30 * 60 * 1000,              // 30 min
  /** Match detail: medium (updated when live) */
  MATCH_DETAIL: 5 * 60 * 1000,            // 5 min
  /** Team/player profiles: longer */
  TEAM_PROFILE: 2 * 60 * 60 * 1000,       // 2 hours
  /** Player images: very long (rarely change) */
  PLAYER_IMAGE: 7 * 24 * 60 * 60 * 1000,  // 7 days
  /** Logo maps: very long */
  LOGO_MAP: 7 * 24 * 60 * 60 * 1000,      // 7 days
  /** TMDB metadata: long */
  TMDB_METADATA: 24 * 60 * 60 * 1000,     // 24 hours
  /** Home rails: medium */
  HOME_RAILS: 60 * 60 * 1000,             // 1 hour
  /** Trailer info: long */
  TRAILER: 24 * 60 * 60 * 1000,           // 24 hours
  /** User follow state: no expiry (persistent) */
  USER_STATE: 0,
  /** Continue watching: no expiry */
  WATCH_PROGRESS: 0,
} as const;

// ─── Cache key factories ──────────────────────────────────────────────────────

export const CacheKey = {
  followedTeams: () => "user.followedTeams",
  followedMatches: () => "user.followedMatches",
  watchProgress: (contentId: string) => `user.watchProgress.${contentId}`,
  watchHistory: () => "user.watchHistory",
  moodPreferences: () => "user.moodPreferences",
  sportsHome: (date: string) => `sports.home.${date}`,
  standings: (league: string) => `sports.standings.${league}`,
  topScorers: (league: string) => `sports.topscorers.${league}`,
  topAssists: (league: string) => `sports.topassists.${league}`,
  matchDetail: (matchId: string) => `sports.match.${matchId}`,
  playerImage: (key: string) => `sports.playerImage.${key}`,
  logoMap: () => "sports.logoMap",
  tmdbMovie: (id: number) => `tmdb.movie.${id}`,
  tmdbSeries: (id: number) => `tmdb.series.${id}`,
  homeRails: () => "media.homeRails",
  trailer: (tmdbId: number) => `media.trailer.${tmdbId}`,
  recommendations: () => "media.recommendations",
} as const;
