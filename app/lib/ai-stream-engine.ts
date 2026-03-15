/**
 * NEXORA AI STREAM ENGINE
 *
 * Ultra stream selection system for movies & series.
 *
 * When the user presses PLAY the engine:
 *  1. Discovers all available embed sources
 *  2. Probes each server in parallel (latency, reachability)
 *  3. Combines probe results with historical performance data
 *  4. Scores every provider on quality, speed, reliability, ad-safety
 *  5. Selects the best provider automatically
 *  6. Falls back seamlessly if playback fails
 *
 * Playback should feel comparable to Netflix / Prime Video.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StreamProvider {
  id: string;
  label: string;
}

/** Per-provider historical stats persisted in AsyncStorage. */
export interface ProviderStats {
  successes: number;
  failures: number;
  adPopups: number;
  totalLoadTimeMs: number;
  avgLoadTimeMs: number;
  bufferEvents: number;
  lastUsed: number;
  lastProbeLatencyMs: number;
  lastProbeStatus: number;
  recentResults: ("success" | "failure" | "adPopup")[]; // last 20
  consecutiveFailures: number; // track consecutive failures for fast blacklisting
}

/** Result of a real-time probe against a provider endpoint. */
export interface ProbeResult {
  providerId: string;
  reachable: boolean;
  latencyMs: number;
  httpStatus: number;
  contentTypeOk: boolean;
  hasPlayerFramework: boolean;  // detected actual player (jwplayer, hls.js, video.js, etc.)
  isErrorPage: boolean;         // detected 404/error/maintenance page
  redirectCount: number;        // number of redirects followed
}

/** The final ranked entry handed back to the player. */
export interface RankedProvider {
  provider: StreamProvider;
  score: number;
  probeLatencyMs: number;
  avgLoadTimeMs: number;
  successRate: number;
}

export type ProbeCache = Record<string, { result: ProbeResult; ts: number }>;

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATS_KEY = "@nexora_stream_engine_stats_v2";
const PROBE_CACHE_KEY = "@nexora_probe_cache";
const PROBE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RANKED_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RECENT_RESULTS_MAX = 20;
const PROBE_TIMEOUT_MS = 6000;

// Auto-blacklist: providers with >70% failure over 3+ attempts are removed
const BLACKLIST_MIN_ATTEMPTS = 3;
const BLACKLIST_FAIL_THRESHOLD = 0.7;
// Instant blacklist: 3+ consecutive failures
const CONSECUTIVE_FAIL_BLACKLIST = 3;

// Scoring weights
const W_SUCCESS_RATE = 35;
const W_LOAD_TIME = 25;
const W_PROBE_LATENCY = 15;
const W_AD_PENALTY = 20;
const W_FRESHNESS = 5;

// ─── In-memory cache ───────────────────────────────────────────────────────────

let _stats: Record<string, ProviderStats> | null = null;
let _probeCache: ProbeCache = {};
let _rankedCache: { providers: RankedProvider[]; ts: number } | null = null;

// ─── Stats persistence ─────────────────────────────────────────────────────────

export async function loadStats(): Promise<Record<string, ProviderStats>> {
  if (_stats) return _stats;
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    _stats = raw ? JSON.parse(raw) : {};
  } catch {
    _stats = {};
  }
  return _stats!;
}

async function persistStats(): Promise<void> {
  if (!_stats) return;
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(_stats));
  } catch {}
}

function ensureStats(providerId: string): ProviderStats {
  if (!_stats) _stats = {};
  if (!_stats[providerId]) {
    _stats[providerId] = {
      successes: 0,
      failures: 0,
      adPopups: 0,
      totalLoadTimeMs: 0,
      avgLoadTimeMs: 0,
      bufferEvents: 0,
      lastUsed: 0,
      lastProbeLatencyMs: 0,
      lastProbeStatus: 0,
      recentResults: [],
      consecutiveFailures: 0,
    };
  }
  return _stats[providerId];
}

// ─── Probe cache ───────────────────────────────────────────────────────────────

async function loadProbeCache(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PROBE_CACHE_KEY);
    if (raw) _probeCache = JSON.parse(raw);
  } catch {}
}

async function persistProbeCache(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROBE_CACHE_KEY, JSON.stringify(_probeCache));
  } catch {}
}

function getCachedProbe(providerId: string): ProbeResult | null {
  const entry = _probeCache[providerId];
  if (!entry) return null;
  if (Date.now() - entry.ts > PROBE_CACHE_TTL_MS) return null;
  return entry.result;
}

function setCachedProbe(providerId: string, result: ProbeResult): void {
  _probeCache[providerId] = { result, ts: Date.now() };
}

// ─── Server probing ────────────────────────────────────────────────────────────

/**
 * Probe a single provider endpoint.
 * Uses GET to validate actual page content.
 * Checks for video elements, player frameworks, error pages, and redirect chains.
 * Only allows sources that serve actual video player pages.
 */
async function probeProvider(
  providerId: string,
  embedUrl: string,
): Promise<ProbeResult> {
  // Check cache first
  const cached = getCachedProbe(providerId);
  if (cached) return cached;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    // Track redirects manually
    let redirectCount = 0;

    const res = await fetch(embedUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Range": "bytes=0-16384", // Fetch first 16KB for deeper analysis
      },
      redirect: "follow",
    });

    clearTimeout(timer);
    const latency = Date.now() - start;
    const ct = res.headers.get("content-type") || "";
    const finalUrl = res.url || embedUrl;

    // Detect redirects by comparing final URL domain to original
    try {
      const origHost = new URL(embedUrl).hostname;
      const finalHost = new URL(finalUrl).hostname;
      if (origHost !== finalHost) redirectCount++;
    } catch {}

    // Check if response is a direct video stream (best case)
    const isDirectVideo = /video\/|application\/x-mpegurl|application\/vnd\.apple\.mpegurl|application\/dash\+xml/i.test(ct);
    if (isDirectVideo) {
      const result: ProbeResult = {
        providerId,
        reachable: true,
        latencyMs: latency,
        httpStatus: res.status,
        contentTypeOk: true,
        hasPlayerFramework: true,
        isErrorPage: false,
        redirectCount,
      };
      setCachedProbe(providerId, result);
      return result;
    }

    const contentTypeOk = ct.includes("text/html") || ct.includes("application");

    // Read response body for deep content analysis
    let hasPlayerFramework = false;
    let isErrorPage = false;
    let hasVideoContent = false;
    try {
      const body = await res.text();
      const lower = body.toLowerCase();

      // Detect actual player frameworks (strong signal)
      hasPlayerFramework = /hls\.js|jwplayer|plyr[\.\s]|video\.js|videojs|clappr|shaka-player|dash\.js|fluidplayer|mediaelement|artplayer|dplayer/i.test(body);

      // Detect video elements or embed iframes (moderate signal)
      hasVideoContent = /<video[\s>]|<source[^>]+type=["']video|<iframe[^>]+src=["'][^"']*(?:player|embed|stream)/i.test(body)
        || /\.m3u8["'\s?]|\.mp4["'\s?]|\.mpd["'\s?]/i.test(body);

      // Detect error/maintenance/unavailable pages
      const titleMatch = body.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
      const titleText = titleMatch ? titleMatch[1].toLowerCase() : "";
      const headContent = lower.slice(0, 2000);

      isErrorPage = /404|not\s*found|error|unavailable|offline|maintenance|coming\s*soon|under\s*construction|access\s*denied|forbidden|suspended|domain.*(?:sale|expired|parked)/i.test(titleText)
        || (/404|not\s*found/i.test(headContent) && !hasVideoContent && !hasPlayerFramework)
        || (res.status === 403 || res.status === 404 || res.status === 410 || res.status === 503);

      // Detect pure redirect/ad pages (no video content, lots of links/ads)
      if (!hasVideoContent && !hasPlayerFramework) {
        const linkCount = (body.match(/<a\s/gi) || []).length;
        const scriptCount = (body.match(/<script/gi) || []).length;
        // Pages with many links but no video elements are likely landing/ad pages
        if (linkCount > 15 && scriptCount < 5) isErrorPage = true;
      }
    } catch {}

    const result: ProbeResult = {
      providerId,
      reachable: res.status < 500 && res.status !== 404 && !isErrorPage,
      latencyMs: latency,
      httpStatus: res.status,
      contentTypeOk: contentTypeOk && (hasVideoContent || hasPlayerFramework) && !isErrorPage,
      hasPlayerFramework,
      isErrorPage,
      redirectCount,
    };

    setCachedProbe(providerId, result);
    return result;
  } catch {
    const latency = Date.now() - start;
    const result: ProbeResult = {
      providerId,
      reachable: false,
      latencyMs: latency,
      httpStatus: 0,
      contentTypeOk: false,
      hasPlayerFramework: false,
      isErrorPage: true,
      redirectCount: 0,
    };
    setCachedProbe(providerId, result);
    return result;
  }
}

/**
 * Probe all providers in parallel.
 * Returns results in ~PROBE_TIMEOUT_MS max.
 */
export async function probeAllProviders(
  providers: StreamProvider[],
  getUrl: (id: string) => string | null,
): Promise<Map<string, ProbeResult>> {
  const results = new Map<string, ProbeResult>();

  const promises = providers.map(async (p) => {
    const url = getUrl(p.id);
    if (!url) {
      results.set(p.id, {
        providerId: p.id,
        reachable: false,
        latencyMs: 99999,
        httpStatus: 0,
        contentTypeOk: false,
        hasPlayerFramework: false,
        isErrorPage: true,
        redirectCount: 0,
      });
      return;
    }
    const res = await probeProvider(p.id, url);
    results.set(p.id, res);
  });

  await Promise.allSettled(promises);
  return results;
}

// ─── Recording outcomes ────────────────────────────────────────────────────────

export async function recordSuccess(
  providerId: string,
  loadTimeMs: number,
  adPopupsSeen: number,
): Promise<void> {
  const s = ensureStats(providerId);
  s.lastUsed = Date.now();
  s.consecutiveFailures = 0; // Reset consecutive failures on success

  if (adPopupsSeen > 2) {
    s.adPopups++;
    s.recentResults.push("adPopup");
  } else {
    s.successes++;
    s.totalLoadTimeMs += loadTimeMs;
    s.avgLoadTimeMs =
      s.successes > 0 ? Math.round(s.totalLoadTimeMs / s.successes) : 0;
    s.recentResults.push("success");
  }

  if (s.recentResults.length > RECENT_RESULTS_MAX) {
    s.recentResults = s.recentResults.slice(-RECENT_RESULTS_MAX);
  }
  await persistStats();
}

export async function recordFailure(providerId: string): Promise<void> {
  const s = ensureStats(providerId);
  s.lastUsed = Date.now();
  s.failures++;
  s.consecutiveFailures = (s.consecutiveFailures || 0) + 1;
  s.recentResults.push("failure");
  if (s.recentResults.length > RECENT_RESULTS_MAX) {
    s.recentResults = s.recentResults.slice(-RECENT_RESULTS_MAX);
  }
  await persistStats();
}

export async function recordAdPopup(providerId: string): Promise<void> {
  const s = ensureStats(providerId);
  s.lastUsed = Date.now();
  s.adPopups++;
  s.recentResults.push("adPopup");
  if (s.recentResults.length > RECENT_RESULTS_MAX) {
    s.recentResults = s.recentResults.slice(-RECENT_RESULTS_MAX);
  }
  await persistStats();
}

export async function recordBufferEvent(providerId: string): Promise<void> {
  const s = ensureStats(providerId);
  s.bufferEvents++;
  await persistStats();
}

// ─── AI Scoring & Ranking ──────────────────────────────────────────────────────

function computeScore(
  stats: ProviderStats,
  probe: ProbeResult | null,
): number {
  const total = stats.successes + stats.failures;

  // INSTANT REJECT: unreachable or error page
  if (probe && (!probe.reachable || probe.isErrorPage)) return 0;

  // INSTANT REJECT: consecutive failures
  if ((stats.consecutiveFailures || 0) >= CONSECUTIVE_FAIL_BLACKLIST) return 0;

  // 1. Success rate (0–100) — weighted by W_SUCCESS_RATE
  let successRate = 0.5; // default for untested
  if (total > 0) {
    successRate = stats.successes / total;
  }
  const successScore = successRate * W_SUCCESS_RATE;

  // 2. Load time score (0–100) — weighted by W_LOAD_TIME
  let loadScore = 50; // default for untested
  if (stats.avgLoadTimeMs > 0) {
    if (stats.avgLoadTimeMs < 2000) loadScore = 100;
    else if (stats.avgLoadTimeMs < 5000) loadScore = 80;
    else if (stats.avgLoadTimeMs < 10000) loadScore = 50;
    else if (stats.avgLoadTimeMs < 15000) loadScore = 20;
    else loadScore = 5;
  }
  const loadTimeScore = (loadScore / 100) * W_LOAD_TIME;

  // 3. Probe latency score (0–100) — weighted by W_PROBE_LATENCY
  let probeScore = 50; // default if no probe
  if (probe) {
    if (!probe.reachable) {
      probeScore = 0;
    } else if (probe.latencyMs < 500) {
      probeScore = 100;
    } else if (probe.latencyMs < 1000) {
      probeScore = 80;
    } else if (probe.latencyMs < 2000) {
      probeScore = 60;
    } else if (probe.latencyMs < 4000) {
      probeScore = 30;
    } else {
      probeScore = 10;
    }
    // Bonus for having a detected player framework
    if (probe.hasPlayerFramework) probeScore = Math.min(100, probeScore + 10);
    // Penalty for content-type issues
    if (!probe.contentTypeOk) probeScore = Math.max(0, probeScore - 20);
  }
  const latencyScore = (probeScore / 100) * W_PROBE_LATENCY;

  // 4. Ad penalty — weighted by W_AD_PENALTY
  let adPenalty = 0;
  if (total > 0) {
    const adRatio = stats.adPopups / total;
    adPenalty = adRatio * W_AD_PENALTY;
  }

  // 5. Freshness bonus — untested providers get a small boost
  let freshnessBonus = 0;
  if (total === 0) {
    freshnessBonus = W_FRESHNESS;
  } else if (total < 3) {
    freshnessBonus = W_FRESHNESS * 0.5;
  }

  // 6. Recent trend — if last 5 results are all failures, extra penalty
  const recent5 = stats.recentResults.slice(-5);
  let trendPenalty = 0;
  if (recent5.length >= 5 && recent5.every((r) => r === "failure")) {
    trendPenalty = 20; // increased from 15
  } else if (recent5.length >= 3 && recent5.every((r) => r !== "success")) {
    trendPenalty = 12; // increased from 8
  }

  // 7. Buffer penalty
  let bufferPenalty = 0;
  if (stats.successes > 0) {
    const bufferRatio = stats.bufferEvents / stats.successes;
    bufferPenalty = Math.min(bufferRatio * 10, 10);
  }

  // 8. Redirect penalty (new) — excessive redirects indicate ad/landing pages
  let redirectPenalty = 0;
  if (probe && probe.redirectCount > 0) {
    redirectPenalty = Math.min(probe.redirectCount * 5, 15);
  }

  const finalScore =
    successScore +
    loadTimeScore +
    latencyScore +
    freshnessBonus -
    adPenalty -
    trendPenalty -
    bufferPenalty -
    redirectPenalty;

  return Math.max(0, Math.min(100, finalScore));
}

/**
 * Rank all providers using historical + real-time probe data.
 *
 * Call this once at mount, and again after each record call.
 */
export function rankProviders(
  providers: StreamProvider[],
  probeResults?: Map<string, ProbeResult>,
): RankedProvider[] {
  const stats = _stats || {};

  const ranked: RankedProvider[] = providers.map((p) => {
    const s = stats[p.id] || ensureStats(p.id);
    const probe = probeResults?.get(p.id) ?? null;
    const score = computeScore(s, probe);
    const total = s.successes + s.failures;
    const successRate = total > 0 ? s.successes / total : 0.5;

    // Update probe latency in stats if we have a fresh probe
    if (probe && probe.reachable) {
      s.lastProbeLatencyMs = probe.latencyMs;
      s.lastProbeStatus = probe.httpStatus;
    }

    return {
      provider: p,
      score,
      probeLatencyMs: probe?.latencyMs ?? s.lastProbeLatencyMs,
      avgLoadTimeMs: s.avgLoadTimeMs,
      successRate,
    };
  });

  // Sort descending by score
  ranked.sort((a, b) => b.score - a.score);

  // Auto-blacklist: remove providers with >80% failure rate over 5+ attempts
  const healthy = ranked.filter((r) => {
    const s = stats[r.provider.id];
    if (!s) return true;
    const total = s.successes + s.failures;
    if (total < BLACKLIST_MIN_ATTEMPTS) return true;
    const failRate = s.failures / total;
    return failRate < BLACKLIST_FAIL_THRESHOLD;
  });
  const blacklisted = ranked.filter((r) => !healthy.includes(r));

  // Filter: unreachable servers go below healthy but above blacklisted
  if (probeResults) {
    const reachable = healthy.filter(
      (r) => probeResults.get(r.provider.id)?.reachable !== false,
    );
    const unreachable = healthy.filter(
      (r) => probeResults.get(r.provider.id)?.reachable === false,
    );
    return [...reachable, ...unreachable, ...blacklisted];
  }

  return [...healthy, ...blacklisted];
}

// ─── Engine initialization ─────────────────────────────────────────────────────

/**
 * Initialize the stream engine: load stats + probe cache from disk.
 */
export async function initEngine(): Promise<void> {
  await Promise.all([loadStats(), loadProbeCache()]);
}

/**
 * Full engine cycle: probe → rank → return ordered providers.
 *
 * @param providers    - full list of StreamProvider[]
 * @param getEmbedUrl  - function to build embed URL for a provider id
 * @param quick        - if true, skip probing and rank from history only
 */
export async function selectBestProviders(
  providers: StreamProvider[],
  getEmbedUrl: (id: string) => string | null,
  quick = false,
): Promise<RankedProvider[]> {
  await loadStats();

  // Check ranked cache first (15-min TTL)
  if (_rankedCache && Date.now() - _rankedCache.ts < RANKED_CACHE_TTL_MS) {
    return _rankedCache.providers;
  }

  let probeResults: Map<string, ProbeResult> | undefined;

  if (!quick) {
    await loadProbeCache();
    probeResults = await probeAllProviders(providers, getEmbedUrl);
    persistProbeCache(); // fire-and-forget
  }

  const result = rankProviders(providers, probeResults);
  _rankedCache = { providers: result, ts: Date.now() };
  return result;
}

/**
 * Quick re-rank without probing (after recording a result).
 */
export function quickRank(providers: StreamProvider[]): RankedProvider[] {
  return rankProviders(providers);
}

/**
 * Clear all engine data (for debugging / reset).
 */
export async function resetEngine(): Promise<void> {
  _stats = {};
  _probeCache = {};
  _rankedCache = null;
  await AsyncStorage.multiRemove([STATS_KEY, PROBE_CACHE_KEY]);
}

/** Check if a provider is auto-blacklisted (>70% fail over 3+ attempts OR 3+ consecutive failures) */
export function isBlacklisted(providerId: string): boolean {
  if (!_stats) return false;
  const s = _stats[providerId];
  if (!s) return false;
  // Consecutive failure blacklist
  if ((s.consecutiveFailures || 0) >= CONSECUTIVE_FAIL_BLACKLIST) return true;
  // Rate-based blacklist
  const total = s.successes + s.failures;
  if (total < BLACKLIST_MIN_ATTEMPTS) return false;
  return (s.failures / total) >= BLACKLIST_FAIL_THRESHOLD;
}

/** Invalidate ranked cache (force fresh probe on next init) */
export function invalidateRankedCache(): void {
  _rankedCache = null;
}
