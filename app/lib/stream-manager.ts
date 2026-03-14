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
} from "./ai-stream-engine";
import type { StreamProvider } from "./ai-stream-engine";
import {
  initReliability,
  trackStartupSuccess,
  trackStartupFailure,
  trackRefreshSuccess,
  getReliabilityScore,
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
}

// ─── Stream Providers ──────────────────────────────────────────────────────────

const STREAM_PROVIDERS: StreamProvider[] = [
  { id: "videasy",      label: "Server 1"  },
  { id: "vidlink",      label: "Server 2"  },
  { id: "vidsrcpro",    label: "Server 3"  },
  { id: "vidsrcto",     label: "Server 4"  },
  { id: "embedsu",      label: "Server 5"  },
  { id: "autoembed",    label: "Server 6"  },
  { id: "superembed",   label: "Server 7"  },
  { id: "vidbinge",     label: "Server 8"  },
  { id: "vidsrcme",     label: "Server 9"  },
  { id: "2embed",       label: "Server 10" },
  { id: "moviesapi",    label: "Server 11" },
  { id: "vidsrcxyz",    label: "Server 12" },
  { id: "multiembed",   label: "Server 13" },
  { id: "vidsrcicu",    label: "Server 14" },
  { id: "smashystream", label: "Server 15" },
  { id: "embedcc",      label: "Server 16" },
  { id: "rive",         label: "Server 17" },
  { id: "nontongo",     label: "Server 18" },
  { id: "111movies",    label: "Server 19" },
  { id: "frembed",      label: "Server 20" },
  { id: "primewire",    label: "Server 21" },
  { id: "flixhq",       label: "Server 22" },
  { id: "moviee",       label: "Server 23" },
  { id: "soapertv",     label: "Server 24" },
  { id: "cinescrape",   label: "Server 25" },
  { id: "gobilda",      label: "Server 26" },
  { id: "vidsrcrip",    label: "Server 27" },
  { id: "embedrise",    label: "Server 28" },
  { id: "remotestream", label: "Server 29" },
  { id: "warezcdn",     label: "Server 30" },
  { id: "filmxy",       label: "Server 31" },
  { id: "dbgo",         label: "Server 32" },
  { id: "cineby",       label: "Server 33" },
  { id: "hexa",         label: "Server 34" },
  { id: "nova",         label: "Server 35" },
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
    case "vidsrcto":
      return isMovie ? `https://vidsrc.to/embed/movie/${tmdbId}` : `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedsu":
      return isMovie ? `https://embed.su/embed/movie/${tmdbId}` : `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`;
    case "autoembed":
      return isMovie ? `https://autoembed.co/movie/tmdb/${tmdbId}` : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`;
    case "vidsrcpro":
      return isMovie ? `https://vidsrc.pro/embed/movie/${tmdbId}` : `https://vidsrc.pro/embed/tv/${tmdbId}?s=${s}&e=${e}`;
    case "2embed":
      return isMovie ? `https://www.2embed.cc/embed/${tmdbId}` : `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`;
    case "moviesapi":
      return isMovie ? `https://moviesapi.club/movie/${tmdbId}` : `https://moviesapi.club/tv/${tmdbId}-${s}-${e}`;
    case "vidsrcme":
      return isMovie ? `https://vidsrc.me/embed/movie?tmdb=${tmdbId}` : `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
    case "vidsrcxyz":
      return isMovie ? `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}` : `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
    case "vidlink":
      return isMovie ? `https://vidlink.pro/movie/${tmdbId}` : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;
    case "multiembed":
      return isMovie ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`;
    case "vidsrcicu":
      return isMovie ? `https://vidsrc.icu/embed/movie/${tmdbId}` : `https://vidsrc.icu/embed/tv/${tmdbId}/${s}/${e}`;
    case "videasy":
      return isMovie ? `https://player.videasy.net/movie/${tmdbId}` : `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`;
    case "nontongo":
      return isMovie ? `https://www.nontongo.win/embed/movie/${tmdbId}` : `https://www.nontongo.win/embed/tv/${tmdbId}/${s}/${e}`;
    case "111movies":
      return isMovie ? `https://111movies.com/movie/${tmdbId}` : `https://111movies.com/tv/${tmdbId}/${s}/${e}`;
    case "smashystream":
      return isMovie ? `https://player.smashystream.com/movie/${tmdbId}` : `https://player.smashystream.com/tv/${tmdbId}/${s}/${e}`;
    case "embedcc":
      return isMovie ? `https://www.embedcc.com/embed/movie/${tmdbId}` : `https://www.embedcc.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "rive":
      return isMovie ? `https://rivestream.live/embed?type=movie&id=${tmdbId}` : `https://rivestream.live/embed?type=tv&id=${tmdbId}&season=${s}&episode=${e}`;
    case "primewire":
      return isMovie ? `https://www.primewire.tf/embed/movie?tmdb=${tmdbId}` : `https://www.primewire.tf/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`;
    case "superembed":
      return isMovie ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`;
    case "vidbinge":
      return isMovie ? `https://vidbinge.dev/embed/movie/${tmdbId}` : `https://vidbinge.dev/embed/tv/${tmdbId}/${s}/${e}`;
    case "frembed":
      return isMovie ? `https://frembed.xyz/api/movie.php?id=${tmdbId}` : `https://frembed.xyz/api/serie.php?id=${tmdbId}&sa=${s}&epi=${e}`;
    case "flixhq":
      return isMovie ? `https://flixhq.to/embed/movie/${tmdbId}` : `https://flixhq.to/embed/tv/${tmdbId}/${s}/${e}`;
    case "moviee":
      return isMovie ? `https://moviee.tv/embed/movie/${tmdbId}` : `https://moviee.tv/embed/tv/${tmdbId}/${s}/${e}`;
    case "soapertv":
      return isMovie ? `https://soaper.live/embed/movie/${tmdbId}` : `https://soaper.live/embed/tv/${tmdbId}/${s}/${e}`;
    case "cinescrape":
      return isMovie ? `https://cinescrape.com/movie/${tmdbId}` : `https://cinescrape.com/tv/${tmdbId}/${s}/${e}`;
    case "gobilda":
      return isMovie ? `https://gobilda.co/embed/movie/${tmdbId}` : `https://gobilda.co/embed/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcrip":
      return isMovie ? `https://vidsrc.rip/embed/movie/${tmdbId}` : `https://vidsrc.rip/embed/tv/${tmdbId}/${s}/${e}`;
    case "embedrise":
      return isMovie ? `https://embedrise.com/embed/movie/${tmdbId}` : `https://embedrise.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "remotestream":
      return isMovie ? `https://remotestream.cc/embed/movie/${tmdbId}` : `https://remotestream.cc/embed/tv/${tmdbId}/${s}/${e}`;
    case "warezcdn":
      return isMovie ? `https://embed.warezcdn.com/filme/${tmdbId}` : `https://embed.warezcdn.com/serie/${tmdbId}/${s}/${e}`;
    case "filmxy":
      return isMovie ? `https://filmxy.vip/embed/${tmdbId}` : `https://filmxy.vip/embed/${tmdbId}/${s}/${e}`;
    case "dbgo":
      return isMovie ? `https://dbgo.fun/imdb.php?id=${tmdbId}` : `https://dbgo.fun/imdb.php?id=${tmdbId}&s=${s}&e=${e}`;
    case "cineby":
      return isMovie ? `https://cineby.ru/embed/movie/${tmdbId}` : `https://cineby.ru/embed/tv/${tmdbId}/${s}/${e}`;
    case "hexa":
      return isMovie ? `https://hexawatch.com/embed/movie/${tmdbId}` : `https://hexawatch.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "nova":
      return isMovie ? `https://novastream.top/embed/movie/${tmdbId}` : `https://novastream.top/embed/tv/${tmdbId}/${s}/${e}`;
    default:
      return isMovie ? `https://vidsrc.to/embed/movie/${tmdbId}` : `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
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
  "smashystream", "frembed", "jwplayer", "cloudflare", "m3u8", "hls", "stream",
  "rabbitstream", "vidcloud", "upcloud", "streamtape", "filemoon", "mixdrop", "dood",
  "googlevideo", "akamaized", "cdn", "vidbinge", "embedcc", "embedsu", "rive",
  "multiembed", "2embed", "primewire", "111movies",
  "flixhq", "moviee", "soaper", "cinescrape", "gobilda", "embedrise", "remotestream",
  "warezcdn", "filmxy", "dbgo", "cineby", "hexa", "nova",
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

  /** Safely refresh: retry current source first, then advance */
  async safeRefresh(): Promise<{ retried: boolean; advanced: boolean }> {
    const source = this.sources[this.currentIndex];
    if (!source) return { retried: false, advanced: false };

    // Track refresh attempt
    await trackRefreshSuccess(source.providerId);

    // Re-notify with current source (triggers WebView remount in player)
    this.callbacks.onSourceChanged(
      source,
      this.currentIndex,
      this.sources.length,
    );

    return { retried: true, advanced: false };
  }

  /** Restart from scratch (re-probe and re-rank) */
  async restart(): Promise<void> {
    this.currentIndex = 0;
    this.engineReady = false;
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
