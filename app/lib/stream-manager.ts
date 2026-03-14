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
  { id: "videasy",      label: "Server 1"  },
  { id: "autoembed",    label: "Server 2"  },
  { id: "smashystream", label: "Server 3"  },
  { id: "vidsrccc",     label: "Server 4"  },
  { id: "embedrise",    label: "Server 5"  },
  { id: "vidsrcme",     label: "Server 6"  },
  { id: "vidsrcxyz",    label: "Server 7"  },
  { id: "111movies",    label: "Server 8"  },
  { id: "vidlink",      label: "Server 9"  },
  { id: "moviesapi",    label: "Server 10" },
  { id: "nontongo",     label: "Server 11" },
  { id: "vidsrcvip",    label: "Server 12" },
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
    case "autoembed":
      return isMovie ? `https://autoembed.co/movie/tmdb/${tmdbId}` : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`;
    case "smashystream":
      return isMovie ? `https://player.smashystream.com/movie/${tmdbId}` : `https://player.smashystream.com/tv/${tmdbId}/${s}/${e}`;
    case "videasy":
      return isMovie ? `https://player.videasy.net/movie/${tmdbId}` : `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`;
    case "embedrise":
      return isMovie ? `https://embedrise.com/embed/movie/${tmdbId}` : `https://embedrise.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrccc":
      return isMovie ? `https://vidsrc.cc/v2/embed/movie/${tmdbId}` : `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcxyz":
      return isMovie ? `https://vidsrc.xyz/embed/movie/${tmdbId}` : `https://vidsrc.xyz/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcvip":
      return isMovie ? `https://vidsrc.vip/embed/movie/${tmdbId}` : `https://vidsrc.vip/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcme":
      return isMovie ? `https://vidsrc.me/embed/movie?tmdb=${tmdbId}` : `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
    case "111movies":
      return isMovie ? `https://111movies.com/movie/${tmdbId}` : `https://111movies.com/tv/${tmdbId}/${s}/${e}`;
    case "vidlink":
      return isMovie ? `https://vidlink.pro/movie/${tmdbId}` : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;
    case "moviesapi":
      return isMovie ? `https://moviesapi.club/movie/${tmdbId}` : `https://moviesapi.club/tv/${tmdbId}-${s}-${e}`;
    case "nontongo":
      return isMovie ? `https://www.nontongo.win/embed/movie/${tmdbId}` : `https://www.nontongo.win/embed/tv/${tmdbId}/${s}/${e}`;
    default:
      return isMovie ? `https://autoembed.co/movie/tmdb/${tmdbId}` : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`;
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
  "vidsrc", "vidlink", "videasy", "autoembed", "moviesapi", "nontongo",
  "smashystream", "jwplayer", "cloudflare", "m3u8", "hls", "stream",
  "rabbitstream", "vidcloud", "upcloud", "streamtape", "filemoon", "mixdrop", "dood",
  "googlevideo", "akamaized", "cdn", "embedrise", "111movies", "vidsrcvip",
  "vidplay", "dokicloud", "megacloud", "rapid-cloud", "openstream", "voe.sx",
  "mp4upload", "streamlare", "supervideo", "wishfast", "fembed", "mycloud",
  "streamhub", "streamsb", "watchsb", "sbembed", "sbplay", "playhydrax", "hydrax",
  "gdriveplayer", "database.gdriveplayer", "streamsss", "streamwish",
  "closeload", "fastupload", "upstream",
];

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
    // Filter out blacklisted providers
    this.sources = ranked
      .filter(r => !isBlacklisted(r.provider.id) && !isProviderBlacklisted(r.provider.id))
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

    // If all providers are blacklisted, include them as last resort
    if (this.sources.length === 0) {
      this.sources = ranked.map(r => {
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
    const newSources = newRanked.map(r => {
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
