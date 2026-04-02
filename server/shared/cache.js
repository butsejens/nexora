/**
 * Nexora – Unified Cache Layer
 *
 * Provides a single interface over:
 *   1. Redis (primary — available when REDIS_URL set)
 *   2. In-memory Map (always available — fallback when Redis is down)
 *
 * Features:
 *   - Inflight deduplication (prevents thundering herd)
 *   - Stale-while-serve (serves last known-good while re-fetching)
 *   - Last-good persistence (survives upstream outages)
 *   - Structured logging for hit/miss/stale events
 *   - TTL constants in one place
 *
 * Usage:
 *   import { cache, TTL } from './cache.js';
 *   const data = await cache.getOrFetch('sports:live', TTL.LIVE, async () => fetchLive());
 */

import { createClient } from 'redis';
import { createLogger } from './logger.js';

const log = createLogger('cache');

// ─── TTL Constants ────────────────────────────────────────────────────────────
export const TTL = Object.freeze({
  // Sports
  LIVE:            30_000,           // 30 s — live match data
  LIVE_STALE:      5  * 60_000,      // 5 min — stale-while-revalidate for live
  MATCHDAY:        3  * 60_000,      // 3 min — today/by-date
  FINISHED:        10 * 60_000,      // 10 min — finished results
  MATCH_DETAIL:    2  * 60_000,      // 2 min — individual match (lineups/events)
  STANDINGS:       15 * 60_000,      // 15 min — competition standings
  TEAM:            30 * 60_000,      // 30 min — team profile
  PLAYER:          30 * 60_000,      // 30 min — player profile
  COMPETITION:     60 * 60_000,      // 1 h — competition metadata

  // Media
  CATALOG:         10 * 60_000,      // 10 min — movie/series catalog
  MEDIA_DETAIL:    30 * 60_000,      // 30 min — movie/series detail
  TRENDING:        5  * 60_000,      // 5 min — trending lists
  TRAILER:         60 * 60_000,      // 1 h — trailer URLs
  HOMEPAGE:        5  * 60_000,      // 5 min — home feed

  // AI
  AI_SUMMARY:      10 * 60_000,      // 10 min — AI match summary
  AI_PREDICT:      5  * 60_000,      // 5 min — AI prediction (short hash TTL)

  // Updates
  UPDATE_META:     60 * 60_000,      // 1 h — update manifest

  // Last-good fallback (6 hours regardless of type)
  LAST_GOOD:       6  * 60 * 60_000,
});

// ─── Redis Client ─────────────────────────────────────────────────────────────
let redis = null;

export function initRedis(redisUrl) {
  if (!redisUrl) {
    log.info('Redis URL not set — using in-memory cache only');
    return;
  }
  redis = createClient({ url: redisUrl });
  redis.on('error', (err) => log.error('Redis error', { message: err.message }));
  redis.connect()
    .then(() => log.info('Redis connected'))
    .catch((err) => {
      log.error('Redis connect failed — falling back to in-memory', { message: err.message });
      redis = null;
    });
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────
// Map<key, { value, expiresAt, staleValue, staleAt }>
const store = new Map();

// Bound memory — evict oldest entries when approaching limit
const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 2000);

function evictIfNeeded() {
  if (store.size < MAX_ENTRIES) return;
  // Evict oldest 10%
  const entries = [...store.entries()].sort((a, b) => a[1].staleAt - b[1].staleAt);
  const toEvict = Math.ceil(MAX_ENTRIES * 0.1);
  for (let i = 0; i < toEvict; i++) store.delete(entries[i][0]);
}

// ─── Core Primitives ──────────────────────────────────────────────────────────
async function get(key) {
  // 1. Try Redis
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw !== null) {
        log.debug('cache hit (redis)', { key });
        return JSON.parse(raw);
      }
    } catch (e) {
      log.warn('Redis get failed', { key, message: e.message });
    }
  }
  // 2. Try in-memory
  const item = store.get(key);
  if (!item) return null;
  if (Date.now() <= item.expiresAt) {
    log.debug('cache hit (memory)', { key });
    return item.value;
  }
  log.debug('cache miss (expired)', { key });
  return null;
}

function getStale(key) {
  const item = store.get(key);
  return item?.staleValue ?? null;
}

async function set(key, value, ttlMs) {
  // 1. Redis
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { PX: ttlMs });
    } catch (e) {
      log.warn('Redis set failed', { key, message: e.message });
    }
  }
  // 2. In-memory (always — acts as L1)
  evictIfNeeded();
  const now = Date.now();
  store.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleValue: value,
    staleAt: now,
  });
}

async function del(key) {
  if (redis) {
    try { await redis.del(key); } catch {}
  }
  store.delete(key);
}

// Map<key, Promise<value>> — prevent thundering herd
const inflight = new Map();

// ─── High-Level API ───────────────────────────────────────────────────────────

/**
 * Get a cached value or fetch it fresh.
 *
 * @param {string}        key     - cache key
 * @param {number}        ttlMs   - TTL in milliseconds
 * @param {() => Promise} fetcher - async function that returns fresh value
 * @returns {{ value: unknown, isCached: boolean, isStale: boolean }}
 */
async function getOrFetch(key, ttlMs, fetcher) {
  const cached = await get(key);
  if (cached !== null) {
    return { value: cached, isCached: true, isStale: false };
  }

  // Inflight deduplication
  const existingInflight = inflight.get(key);
  if (existingInflight) {
    log.debug('joining inflight request', { key });
    const value = await existingInflight;
    return { value, isCached: false, isStale: false };
  }

  const p = (async () => {
    try {
      const value = await fetcher();
      await set(key, value, ttlMs);
      log.debug('cache set', { key, ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  const value = await p;
  return { value, isCached: false, isStale: false };
}

/**
 * Try to return fresh data; on any failure serve stale if available.
 * Logs the fallback clearly.
 *
 * @returns {{ value: unknown, isCached: boolean, isStale: boolean, isFallback: boolean }}
 */
async function getOrFetchWithStale(key, ttlMs, fetcher) {
  try {
    const result = await getOrFetch(key, ttlMs, fetcher);
    return { ...result, isFallback: false };
  } catch (err) {
    const stale = getStale(key)
      ?? getStale(`${key}__last_good`);

    if (stale !== null) {
      log.warn('serving stale cache after fetch failure', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return { value: stale, isCached: true, isStale: true, isFallback: true };
    }

    throw err;
  }
}

/**
 * Persist the last known-good value for a key.
 * Used for sports live endpoints to survive provider outages.
 *
 * @param {string}  key
 * @param {unknown} value
 * @param {number}  [ttlMs] - defaults to TTL.LAST_GOOD
 */
async function rememberLastGood(key, value, ttlMs = TTL.LAST_GOOD) {
  if (value === null || value === undefined) return;
  const isPayloadEmpty = (
    (Array.isArray(value) && value.length === 0) ||
    (value && typeof value === 'object' && !Array.isArray(value) &&
      'live' in value && 'upcoming' in value && 'finished' in value &&
      value.live.length + value.upcoming.length + value.finished.length === 0)
  );
  if (isPayloadEmpty) return;
  await set(`${key}__last_good`, value, ttlMs);
}

async function getLastGood(key) {
  return (await get(`${key}__last_good`)) ?? getStale(`${key}__last_good`) ?? null;
}

export const cache = { get, getStale, set, del, getOrFetch, getOrFetchWithStale, rememberLastGood, getLastGood };
