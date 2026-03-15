/**
 * NEXORA STREAM MANAGER
 *
 * Unified stream management for movies & series playback.
 * Handles the full flow: discovery → validation → AI ranking → selection → fallback.
 *
 * When the user presses Play:
 * 1. Collect all available stream sources
 * 2. Validate and score them (probe reachability, latency)
 * 3. Automatically select the best server
 * 4. If playback fails, auto-fallback to the next ranked source
 *
 * All playback stays inside the app — no external popups or browser redirects.
 */

import {
  initEngine,
  selectBestProviders,
  quickRank,
  recordSuccess,
  recordFailure,
  recordAdPopup,
  isBlacklisted,
  invalidateRankedCache,
} from "./ai-stream-engine";
import type { StreamProvider } from "./ai-stream-engine";
import {
  initReliability,
  trackStartupSuccess,
  trackStartupFailure,
  trackRefreshSuccess,
  trackRefreshFailure,
  trackMidStreamDrop,
  trackPlaytime,
  getReliabilityScore,
  isProviderBlacklisted,
  rememberSource,
  getRecentSource,
} from "./stream-reliability";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StreamSource {
  providerId: string;
  label: string;
  embedUrl: string;
  score: number;
  probeLatencyMs: number;
  reliabilityScore: number;
  validated: boolean;
  reachable: boolean;
}

export interface StreamManagerState {
  sources: StreamSource[];
  currentIndex: number;
  currentSource: StreamSource | null;
  allFailed: boolean;
  engineReady: boolean;
  hasRecentSource: boolean;
}

export interface StreamManagerCallbacks {
  onSourceChanged: (source: StreamSource, index: number, total: number) => void;
  onAllFailed: () => void;
  onEngineReady: (sources: StreamSource[]) => void;
  onMidStreamRecovery?: (fromProvider: string, toProvider: string) => void;
}

// ─── Stream Providers ──────────────────────────────────────────────────────────

const STREAM_PROVIDERS: StreamProvider[] = [
  // ── Tier 1: Player detected via curl (confirmed working) ──
  { id: "vidsrcicu",    label: "Server 1"  },  // vidstack player, 613KB
  { id: "embedrise",    label: "Server 2"  },  // plyr + fluidplayer + mp4
  { id: "vidlink",      label: "Server 3"  },  // jwplayer
  { id: "111movies",    label: "Server 4"  },  // fluidplayer
  // ── Tier 2: iframe-based (video loads in sub-frame) ──
  { id: "2embedskin",   label: "Server 5"  },  // iframe, 12KB
  { id: "catflix",      label: "Server 6"  },  // iframe, 11KB
  { id: "moviesapi",    label: "Server 7"  },  // iframe → vidora.stream
  { id: "vidsrcio",     label: "Server 8"  },  // iframe, 59KB
  { id: "vidsrcnet",    label: "Server 9"  },  // iframe, 59KB
  { id: "cinebyu",      label: "Server 10" },  // iframe, 11KB
  { id: "streamm4u",    label: "Server 11" },  // iframe, 11KB
  // ── Tier 3: SPA/JS-rendered (player loads client-side in WebView) ──
  { id: "multiembed",   label: "Server 12" },  // 677KB SPA
  { id: "superembed",   label: "Server 13" },  // 677KB SPA
  { id: "videasy",      label: "Server 14" },  // 18KB SPA
  { id: "playersmashy", label: "Server 15" },  // 24KB SPA
  { id: "riveapp",      label: "Server 16" },  // 4.7KB SPA
  { id: "flickyhost",   label: "Server 17" },  // 9.8KB SPA
  { id: "vidsrcdev",    label: "Server 18" },  // 1.1KB SPA
  { id: "vidsrcnl",     label: "Server 19" },  // 1.6KB SPA
  { id: "embedplay",    label: "Server 20" },  // 4.5KB SPA
];

export { STREAM_PROVIDERS };

// ─── Embed URL builder ─────────────────────────────────────────────────────────

export function getEmbedUrl(
  provider: string,
  tmdbId: string,
  type: string,
  season: string,
  episode: string,
): string {
  const s = season || "1";
  const e = episode || "1";
  const isMovie = type !== "series";
  switch (provider) {
    // ── Tier 1: Player confirmed ──
    case "vidsrcicu":
      return isMovie ? `https://vidsrc.icu/embed/movie/${tmdbId}` : `https://vidsrc.icu/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedrise":
      return isMovie ? `https://embedrise.com/embed/movie/${tmdbId}` : `https://embedrise.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidlink":
      return isMovie ? `https://vidlink.pro/movie/${tmdbId}` : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;
    case "111movies":
      return isMovie ? `https://111movies.com/movie/${tmdbId}` : `https://111movies.com/tv/${tmdbId}/${s}/${e}`;
    // ── Tier 2: iframe-based ──
    case "2embedskin":
      return isMovie ? `https://www.2embed.skin/embed/movie/${tmdbId}` : `https://www.2embed.skin/embed/tv/${tmdbId}/${s}/${e}`;
    case "catflix":
      return isMovie ? `https://catflix.su/embed/movie/${tmdbId}` : `https://catflix.su/embed/tv/${tmdbId}/${s}/${e}`;
    case "moviesapi":
      return isMovie ? `https://moviesapi.club/movie/${tmdbId}` : `https://moviesapi.club/tv/${tmdbId}-${s}-${e}`;
    case "vidsrcio":
      return isMovie ? `https://vidsrc.io/embed/movie/${tmdbId}` : `https://vidsrc.io/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcnet":
      return isMovie ? `https://vidsrc.net/embed/movie/${tmdbId}` : `https://vidsrc.net/embed/tv/${tmdbId}/${s}/${e}`;
    case "cinebyu":
      return isMovie ? `https://player.cineby.ru/movie/${tmdbId}` : `https://player.cineby.ru/tv/${tmdbId}/${s}/${e}`;
    case "streamm4u":
      return isMovie ? `https://streamm4u.ws/embed/movie/${tmdbId}` : `https://streamm4u.ws/embed/tv/${tmdbId}/${s}/${e}`;
    // ── Tier 3: SPA / JS-rendered ──
    case "multiembed":
      return isMovie ? `https://multiembed.mov/directstream.php?video_id=tt${tmdbId}&tmdb=1` : `https://multiembed.mov/directstream.php?video_id=tt${tmdbId}&tmdb=1&s=${s}&e=${e}`;
    case "superembed":
      return isMovie ? `https://multiembed.mov/?video_id=tt${tmdbId}&tmdb=1` : `https://multiembed.mov/?video_id=tt${tmdbId}&tmdb=1&s=${s}&e=${e}`;
    case "videasy":
      return isMovie ? `https://player.videasy.net/movie/${tmdbId}` : `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`;
    case "playersmashy":
      return isMovie ? `https://player.smashy.stream/movie/${tmdbId}` : `https://player.smashy.stream/tv/${tmdbId}/${s}/${e}`;
    case "riveapp":
      return isMovie ? `https://rivestream.live/embed?type=movie&id=${tmdbId}` : `https://rivestream.live/embed?type=tv&id=${tmdbId}&season=${s}&episode=${e}`;
    case "flickyhost":
      return isMovie ? `https://flicky.host/embed/movie/?id=${tmdbId}` : `https://flicky.host/embed/tv/?id=${tmdbId}&s=${s}&e=${e}`;
    case "vidsrcdev":
      return isMovie ? `https://vidsrc.dev/embed/movie/${tmdbId}` : `https://vidsrc.dev/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcnl":
      return isMovie ? `https://player.vidsrc.nl/embed/movie/${tmdbId}` : `https://player.vidsrc.nl/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedplay":
      return isMovie ? `https://embedplay.net/embed/movie/${tmdbId}` : `https://embedplay.net/embed/tv/${tmdbId}/${s}/${e}`;
    default:
      return isMovie ? `https://vidsrc.icu/embed/movie/${tmdbId}` : `https://vidsrc.icu/embed/tv/${tmdbId}/${s}/${e}`;
  }
}

// ─── Autoplay params helper ────────────────────────────────────────────────────

export function withAutoplayParams(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const params: [string, string][] = [
      ["autoplay", "1"], ["autoPlay", "1"], ["autostart", "true"],
      ["muted", "0"], ["mute", "0"], ["playsinline", "1"],
    ];
    for (const [key, value] of params) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

// ─── Allowed hosts for navigation guard ────────────────────────────────────────

export const ALLOWED_VIDEO_HOSTS = [
  // Embed providers
  "vidsrc", "vidlink", "videasy", "autoembed", "moviesapi",
  "embedrise", "111movies", "2embed", "catflix", "rivestream",
  "flicky", "multiembed", "cineby", "streamm4u", "embedplay",
  "smashy",
  // Player/CDN hosts
  "jwplayer", "cloudflare", "m3u8", "hls", "stream",
  "rabbitstream", "vidcloud", "upcloud", "streamtape", "filemoon", "mixdrop", "dood",
  "googlevideo", "akamaized", "cdn",
  "vidplay", "dokicloud", "megacloud", "rapid-cloud", "openstream", "voe.sx",
  "mp4upload", "streamlare", "supervideo", "wishfast", "fembed", "mycloud",
  "streamhub", "streamsb", "watchsb", "sbembed", "sbplay", "playhydrax", "hydrax",
  "gdriveplayer", "database.gdriveplayer", "streamsss", "streamwish",
  "closeload", "fastupload", "upstream",
];

// ─── Blocked embed host check ──────────────────────────────────────────────────
// Reject any embed URL pointing to YouTube, Google, social media, or other non-video hosts.
const BLOCKED_EMBED_HOSTS = [
  "youtube.com", "youtu.be", "youtube-nocookie.com",
  "google.com", "google.nl", "google.de", "google.co.uk", "google.co",
  "bing.com", "yahoo.com", "duckduckgo.com",
  "facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com",
  "reddit.com", "pinterest.com", "tumblr.com", "quora.com",
  "wikipedia.org", "imdb.com", "rottentomatoes.com", "metacritic.com",
  "netflix.com", "disneyplus.com", "hbomax.com", "hulu.com", "primevideo.com",
  "t.me", "telegram.org",
];

function isBlockedEmbedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_EMBED_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch { return false; }
}

// ─── Stream Manager Class ──────────────────────────────────────────────────────

export class StreamManager {
  private tmdbId: string;
  private type: string;
  private season: string;
  private episode: string;
  private sources: StreamSource[] = [];
  private currentIndex = 0;
  private engineReady = false;
  private callbacks: StreamManagerCallbacks;
  private retryCount = 0; // track retries before advancing
  private playbackStartedAt = 0; // for mid-stream recovery tracking
  private static MAX_RETRIES = 1; // retry current source once before advancing

  constructor(
    tmdbId: string,
    type: string,
    season: string,
    episode: string,
    callbacks: StreamManagerCallbacks,
  ) {
    this.tmdbId = tmdbId;
    this.type = type;
    this.season = season;
    this.episode = episode;
    this.callbacks = callbacks;
  }

  /** Initialize: load engines, probe servers, rank, and select best */
  async init(): Promise<void> {
    // Init both engines in parallel
    await Promise.all([initEngine(), initReliability()]);

    // Check if we have a recent successful source for this content
    const recent = getRecentSource(this.tmdbId, this.type, this.season, this.episode);

    // Build URL getter for probing
    const urlGetter = (id: string) =>
      getEmbedUrl(id, this.tmdbId, this.type, this.season, this.episode);

    // Full probe + AI ranking
    const ranked = await selectBestProviders(STREAM_PROVIDERS, urlGetter);

    // Build stream sources with combined AI + reliability scores
    // Filter: blacklisted, unreachable (score=0), error-page providers, and blocked hosts
    this.sources = ranked
      .filter(r => {
        if (isBlacklisted(r.provider.id) || isProviderBlacklisted(r.provider.id)) return false;
        if (r.score === 0) return false; // probe detected error/unreachable/dead server
        // Reject providers whose embed URL points to a blocked host (YouTube, Google, etc.)
        const url = urlGetter(r.provider.id);
        if (url && isBlockedEmbedHost(url)) return false;
        return true;
      })
      .map(r => {
        const reliabilityScore = getReliabilityScore(r.provider.id);
        const embedUrl = urlGetter(r.provider.id)!;
      return {
        providerId: r.provider.id,
        label: r.provider.label,
        embedUrl,
        score: r.score,
        probeLatencyMs: r.probeLatencyMs,
        reliabilityScore,
        validated: true,
        reachable: r.probeLatencyMs < 99000,
      };
    });

    // If all providers are filtered out, include reachable ones as last resort
    if (this.sources.length === 0) {
      this.sources = ranked
        .filter(r => {
          if (r.score <= 0) return false;
          const url = urlGetter(r.provider.id);
          if (url && isBlockedEmbedHost(url)) return false;
          return true;
        })
        .map(r => {
        const reliabilityScore = getReliabilityScore(r.provider.id);
        const embedUrl = urlGetter(r.provider.id)!;
        return {
          providerId: r.provider.id,
          label: r.provider.label,
          embedUrl,
          score: r.score,
          probeLatencyMs: r.probeLatencyMs,
          reliabilityScore,
          validated: true,
          reachable: r.probeLatencyMs < 99000,
        };
      });
    }

    // If we have a recent successful source, move it to the top
    if (recent) {
      const recentIdx = this.sources.findIndex(s => s.providerId === recent.providerId);
      if (recentIdx > 0) {
        const [entry] = this.sources.splice(recentIdx, 1);
        this.sources.unshift(entry);
      }
    }

    this.engineReady = true;
    this.currentIndex = 0;
    this.callbacks.onEngineReady(this.sources);

    if (this.sources.length > 0) {
      this.callbacks.onSourceChanged(this.sources[0], 0, this.sources.length);
    } else {
      this.callbacks.onAllFailed();
    }
  }

  /** Get current state */
  getState(): StreamManagerState {
    return {
      sources: this.sources,
      currentIndex: this.currentIndex,
      currentSource: this.sources[this.currentIndex] || null,
      allFailed: this.currentIndex >= this.sources.length,
      engineReady: this.engineReady,
      hasRecentSource: !!getRecentSource(this.tmdbId, this.type, this.season, this.episode),
    };
  }

  /** Get the current embed URL with autoplay params */
  getCurrentEmbedUrl(): string | null {
    const source = this.sources[this.currentIndex];
    if (!source) return null;
    return withAutoplayParams(source.embedUrl);
  }

  /** Get the current raw embed URL (for nav guard) */
  getCurrentRawEmbedUrl(): string | null {
    return this.sources[this.currentIndex]?.embedUrl || null;
  }

  /** Get current provider ID */
  getCurrentProviderId(): string | null {
    return this.sources[this.currentIndex]?.providerId || null;
  }

  /** Record successful playback for the current source */
  async recordPlaybackSuccess(loadTimeMs: number, adPopupsSeen: number): Promise<void> {
    const source = this.sources[this.currentIndex];
    if (!source) return;

    await recordSuccess(source.providerId, loadTimeMs, adPopupsSeen);
    await trackStartupSuccess(source.providerId, loadTimeMs);
    await rememberSource(
      this.tmdbId, this.type, this.season, this.episode,
      source.providerId, loadTimeMs,
    );
    this.playbackStartedAt = Date.now();
  }

  /** Record failed playback and auto-advance to next source */
  async recordPlaybackFailure(adPopupsSeen: number): Promise<void> {
    const source = this.sources[this.currentIndex];
    if (!source) return;

    if (adPopupsSeen > 2) {
      await recordAdPopup(source.providerId);
    } else {
      await recordFailure(source.providerId);
    }
    await trackStartupFailure(source.providerId);
  }

  /** Move to next ranked source (called on failure or manual refresh) */
  async advanceToNext(adPopupsSeen = 0): Promise<boolean> {
    await this.recordPlaybackFailure(adPopupsSeen);
    this.currentIndex++;
    this.retryCount = 0;

    if (this.currentIndex >= this.sources.length) {
      this.callbacks.onAllFailed();
      return false;
    }

    this.callbacks.onSourceChanged(
      this.sources[this.currentIndex],
      this.currentIndex,
      this.sources.length,
    );
    return true;
  }

  /** Safely refresh: retry current source once, then advance to next */
  async safeRefresh(): Promise<{ retried: boolean; advanced: boolean }> {
    const source = this.sources[this.currentIndex];
    if (!source) return { retried: false, advanced: false };

    if (this.retryCount < StreamManager.MAX_RETRIES) {
      // Retry current source
      this.retryCount++;
      await trackRefreshSuccess(source.providerId);
      this.callbacks.onSourceChanged(
        source,
        this.currentIndex,
        this.sources.length,
      );
      return { retried: true, advanced: false };
    }

    // Already retried — advance to next
    await trackRefreshFailure(source.providerId);
    const advanced = await this.advanceToNext();
    return { retried: false, advanced };
  }

  /**
   * Handle mid-stream failure (playback died while user was watching).
   * Records the drop, tracks playtime, and auto-advances to next server.
   */
  async handleMidStreamFailure(): Promise<boolean> {
    const source = this.sources[this.currentIndex];
    if (!source) return false;

    // Record playtime and mid-stream drop
    if (this.playbackStartedAt > 0) {
      const playtime = Date.now() - this.playbackStartedAt;
      await trackPlaytime(source.providerId, playtime);
      this.playbackStartedAt = 0;
    }
    await trackMidStreamDrop(source.providerId);

    const oldProvider = source.providerId;
    this.currentIndex++;
    this.retryCount = 0;

    if (this.currentIndex >= this.sources.length) {
      this.callbacks.onAllFailed();
      return false;
    }

    const newSource = this.sources[this.currentIndex];
    this.callbacks.onMidStreamRecovery?.(oldProvider, newSource.providerId);
    this.callbacks.onSourceChanged(newSource, this.currentIndex, this.sources.length);
    return true;
  }

  /** Record playtime when user voluntarily stops playback */
  async recordPlaytimeOnStop(): Promise<void> {
    const source = this.sources[this.currentIndex];
    if (!source || this.playbackStartedAt === 0) return;
    const playtime = Date.now() - this.playbackStartedAt;
    await trackPlaytime(source.providerId, playtime);
    this.playbackStartedAt = 0;
  }

  /** Restart from scratch (re-probe and re-rank) */
  async restart(): Promise<void> {
    this.currentIndex = 0;
    this.retryCount = 0;
    this.engineReady = false;
    invalidateRankedCache(); // Force fresh probing
    await this.init();
  }

  /** Re-rank sources without re-probing (after recording outcomes) */
  rerank(): void {
    const newRanked = quickRank(STREAM_PROVIDERS);
    const newSources = newRanked
      .filter(r => {
        const url = getEmbedUrl(r.provider.id, this.tmdbId, this.type, this.season, this.episode);
        return !url || !isBlockedEmbedHost(url);
      })
      .map(r => {
      const reliabilityScore = getReliabilityScore(r.provider.id);
      const embedUrl = getEmbedUrl(r.provider.id, this.tmdbId, this.type, this.season, this.episode);
      return {
        providerId: r.provider.id,
        label: r.provider.label,
        embedUrl,
        score: r.score,
        probeLatencyMs: r.probeLatencyMs,
        reliabilityScore,
        validated: true,
        reachable: r.probeLatencyMs < 99000,
      };
    });
    // Keep current provider at current position, update the rest
    const currentId = this.sources[this.currentIndex]?.providerId;
    if (currentId) {
      const before = newSources.filter((_, i) => i < this.currentIndex);
      const current = newSources.find(s => s.providerId === currentId) || this.sources[this.currentIndex];
      const after = newSources.filter(s => s.providerId !== currentId);
      this.sources = [...before, current, ...after.slice(this.currentIndex)];
    } else {
      this.sources = newSources;
    }
  }

  /** Get total number of sources */
  getTotalSources(): number {
    return this.sources.length;
  }
}
