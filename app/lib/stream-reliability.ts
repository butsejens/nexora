/**
 * NEXORA STREAM RELIABILITY MEMORY
 *
 * Tracks stream source performance over time to improve future ranking.
 * Stores per-provider metrics: startup success, latency, buffering, failures.
 * Unreliable servers are deprioritized automatically.
 *
 * Also provides short-lived caching for stream validation results
 * and recently successful sources for quick re-playback.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProviderReliability {
  providerId: string;
  startupSuccesses: number;
  startupFailures: number;
  avgStartupMs: number;
  totalStartupMs: number;
  bufferingEvents: number;
  userVisibleErrors: number;
  refreshSuccesses: number;
  refreshFailures: number;
  lastSuccess: number;        // timestamp
  lastFailure: number;        // timestamp
  recentOutcomes: ("ok" | "fail" | "buffer" | "slow")[];  // last 30
  midStreamDrops: number;     // how many times playback died mid-stream
  totalPlaytimeMs: number;    // total successful playback time
}

export interface ValidationCache {
  url: string;
  valid: boolean;
  contentType: string;
  statusCode: number;
  latencyMs: number;
  ts: number;  // when cached
}

export interface RecentSource {
  tmdbId: string;
  type: string;
  season: string;
  episode: string;
  providerId: string;
  startupMs: number;
  ts: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const RELIABILITY_KEY = "@nexora_stream_reliability_v1";
const VALIDATION_CACHE_KEY = "@nexora_validation_cache_v1";
const RECENT_SOURCES_KEY = "@nexora_recent_sources_v1";
const VALIDATION_TTL_MS = 10 * 60 * 1000;        // 10 minutes (was 5)
const RECENT_SOURCES_TTL_MS = 60 * 60 * 1000;    // 1 hour
const MAX_RECENT_OUTCOMES = 30;
const MAX_RECENT_SOURCES = 50;
const MAX_VALIDATION_ENTRIES = 100;

// ─── In-memory state ───────────────────────────────────────────────────────────

let _reliability: Record<string, ProviderReliability> = {};
let _validationCache: Record<string, ValidationCache> = {};
let _recentSources: RecentSource[] = [];
let _loaded = false;

// ─── Persistence ───────────────────────────────────────────────────────────────

async function load(): Promise<void> {
  if (_loaded) return;
  try {
    const [relRaw, valRaw, srcRaw] = await AsyncStorage.multiGet([
      RELIABILITY_KEY, VALIDATION_CACHE_KEY, RECENT_SOURCES_KEY,
    ]);
    if (relRaw[1]) _reliability = JSON.parse(relRaw[1]);
    if (valRaw[1]) _validationCache = JSON.parse(valRaw[1]);
    if (srcRaw[1]) _recentSources = JSON.parse(srcRaw[1]);
  } catch {}
  _loaded = true;
}

async function persistReliability(): Promise<void> {
  try {
    await AsyncStorage.setItem(RELIABILITY_KEY, JSON.stringify(_reliability));
  } catch {}
}

async function persistValidationCache(): Promise<void> {
  try {
    // Prune old entries
    const now = Date.now();
    const keys = Object.keys(_validationCache);
    if (keys.length > MAX_VALIDATION_ENTRIES) {
      const sorted = keys.sort((a, b) => _validationCache[a].ts - _validationCache[b].ts);
      for (let i = 0; i < sorted.length - MAX_VALIDATION_ENTRIES; i++) {
        delete _validationCache[sorted[i]];
      }
    }
    for (const k of Object.keys(_validationCache)) {
      if (now - _validationCache[k].ts > VALIDATION_TTL_MS) delete _validationCache[k];
    }
    await AsyncStorage.setItem(VALIDATION_CACHE_KEY, JSON.stringify(_validationCache));
  } catch {}
}

async function persistRecentSources(): Promise<void> {
  try {
    // Prune old/excess entries
    const now = Date.now();
    _recentSources = _recentSources
      .filter(s => now - s.ts < RECENT_SOURCES_TTL_MS)
      .slice(-MAX_RECENT_SOURCES);
    await AsyncStorage.setItem(RECENT_SOURCES_KEY, JSON.stringify(_recentSources));
  } catch {}
}

// ─── Ensure entry ──────────────────────────────────────────────────────────────

function ensure(providerId: string): ProviderReliability {
  if (!_reliability[providerId]) {
    _reliability[providerId] = {
      providerId,
      startupSuccesses: 0,
      startupFailures: 0,
      avgStartupMs: 0,
      totalStartupMs: 0,
      bufferingEvents: 0,
      userVisibleErrors: 0,
      refreshSuccesses: 0,
      refreshFailures: 0,
      lastSuccess: 0,
      lastFailure: 0,
      recentOutcomes: [],
      midStreamDrops: 0,
      totalPlaytimeMs: 0,
    };
  }
  // Migrate old entries missing new fields
  const r = _reliability[providerId];
  if (r.midStreamDrops == null) r.midStreamDrops = 0;
  if (r.totalPlaytimeMs == null) r.totalPlaytimeMs = 0;
  return r;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function initReliability(): Promise<void> {
  await load();
}

/** Record a successful stream startup */
export async function trackStartupSuccess(providerId: string, startupMs: number): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.startupSuccesses++;
  r.totalStartupMs += startupMs;
  r.avgStartupMs = Math.round(r.totalStartupMs / r.startupSuccesses);
  r.lastSuccess = Date.now();
  r.recentOutcomes.push(startupMs > 10000 ? "slow" : "ok");
  if (r.recentOutcomes.length > MAX_RECENT_OUTCOMES) {
    r.recentOutcomes = r.recentOutcomes.slice(-MAX_RECENT_OUTCOMES);
  }
  persistReliability();
}

/** Record a failed stream startup */
export async function trackStartupFailure(providerId: string): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.startupFailures++;
  r.lastFailure = Date.now();
  r.recentOutcomes.push("fail");
  if (r.recentOutcomes.length > MAX_RECENT_OUTCOMES) {
    r.recentOutcomes = r.recentOutcomes.slice(-MAX_RECENT_OUTCOMES);
  }
  persistReliability();
}

/** Record a buffering event */
export async function trackBuffering(providerId: string): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.bufferingEvents++;
  r.recentOutcomes.push("buffer");
  if (r.recentOutcomes.length > MAX_RECENT_OUTCOMES) {
    r.recentOutcomes = r.recentOutcomes.slice(-MAX_RECENT_OUTCOMES);
  }
  persistReliability();
}

/** Record a user-visible error */
export async function trackUserError(providerId: string): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.userVisibleErrors++;
  persistReliability();
}

/** Record a successful refresh */
export async function trackRefreshSuccess(providerId: string): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.refreshSuccesses++;
  persistReliability();
}

/** Record a mid-stream drop (playback died during watching) */
export async function trackMidStreamDrop(providerId: string): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.midStreamDrops++;
  r.recentOutcomes.push("fail");
  if (r.recentOutcomes.length > MAX_RECENT_OUTCOMES) {
    r.recentOutcomes = r.recentOutcomes.slice(-MAX_RECENT_OUTCOMES);
  }
  persistReliability();
}

/** Record successful playtime (called on player close or periodic heartbeat) */
export async function trackPlaytime(providerId: string, durationMs: number): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.totalPlaytimeMs += durationMs;
  persistReliability();
}

/** Check if provider should be considered blacklisted (>80% fail over 5+ attempts) */
export function isProviderBlacklisted(providerId: string): boolean {
  const r = _reliability[providerId];
  if (!r) return false;
  const total = r.startupSuccesses + r.startupFailures;
  if (total < 5) return false;
  return (r.startupFailures / total) >= 0.8;
}

/** Record a failed refresh */
export async function trackRefreshFailure(providerId: string): Promise<void> {
  await load();
  const r = ensure(providerId);
  r.refreshFailures++;
  persistReliability();
}

/** Get reliability score for a provider (0–100) */
export function getReliabilityScore(providerId: string): number {
  const r = _reliability[providerId];
  if (!r) return 50; // neutral for unknown
  const total = r.startupSuccesses + r.startupFailures;
  if (total === 0) return 50;

  // Base success rate (0-50)
  const successRate = r.startupSuccesses / total;
  let score = successRate * 50;

  // Startup speed bonus (0-20)
  if (r.avgStartupMs < 2000) score += 20;
  else if (r.avgStartupMs < 5000) score += 15;
  else if (r.avgStartupMs < 10000) score += 8;

  // Low buffering bonus (0-15)
  const bufferRatio = r.startupSuccesses > 0 ? r.bufferingEvents / r.startupSuccesses : 0;
  if (bufferRatio < 0.1) score += 15;
  else if (bufferRatio < 0.3) score += 10;
  else if (bufferRatio < 0.5) score += 5;

  // Mid-stream stability bonus (0-10)
  const dropRatio = r.startupSuccesses > 0 ? r.midStreamDrops / r.startupSuccesses : 0;
  if (dropRatio < 0.05) score += 10;
  else if (dropRatio < 0.15) score += 5;

  // Recent trend (0-15)
  const recent = r.recentOutcomes.slice(-10);
  const recentOk = recent.filter(x => x === "ok").length;
  score += (recentOk / Math.max(recent.length, 1)) * 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Validation Cache ──────────────────────────────────────────────────────────

/** Cache a validation result */
export async function cacheValidation(
  url: string,
  valid: boolean,
  contentType: string,
  statusCode: number,
  latencyMs: number,
): Promise<void> {
  await load();
  _validationCache[url] = { url, valid, contentType, statusCode, latencyMs, ts: Date.now() };
  persistValidationCache();
}

/** Get cached validation (returns null if expired or missing) */
export function getCachedValidation(url: string): ValidationCache | null {
  const entry = _validationCache[url];
  if (!entry) return null;
  if (Date.now() - entry.ts > VALIDATION_TTL_MS) {
    delete _validationCache[url];
    return null;
  }
  return entry;
}

// ─── Recent Sources (for fast re-playback) ─────────────────────────────────────

/** Remember a successful source for a content item */
export async function rememberSource(
  tmdbId: string,
  type: string,
  season: string,
  episode: string,
  providerId: string,
  startupMs: number,
): Promise<void> {
  await load();
  // Remove old entry for same content
  _recentSources = _recentSources.filter(
    s => !(s.tmdbId === tmdbId && s.type === type && s.season === season && s.episode === episode),
  );
  _recentSources.push({ tmdbId, type, season, episode, providerId, startupMs, ts: Date.now() });
  persistRecentSources();
}

/** Get recent successful source for content (or null) */
export function getRecentSource(
  tmdbId: string,
  type: string,
  season: string,
  episode: string,
): RecentSource | null {
  const entry = _recentSources.find(
    s => s.tmdbId === tmdbId && s.type === type && s.season === season && s.episode === episode,
  );
  if (!entry) return null;
  if (Date.now() - entry.ts > RECENT_SOURCES_TTL_MS) return null;
  return entry;
}

/** Clear all reliability data */
export async function resetReliability(): Promise<void> {
  _reliability = {};
  _validationCache = {};
  _recentSources = [];
  _loaded = false;
  await AsyncStorage.multiRemove([RELIABILITY_KEY, VALIDATION_CACHE_KEY, RECENT_SOURCES_KEY]);
}
