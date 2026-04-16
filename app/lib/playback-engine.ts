import { apiRequest } from "./query-client";
import { streamLog } from "./stream-logger";

export type MediaType = "movie" | "series" | "trailer";

export type PlaybackSourceType = "stream" | "trailer" | "provider";

export interface PlaybackSource {
  id: string;
  label: string;
  type: PlaybackSourceType;
  url: string;
  quality?: string;
  providerName?: string;
  countryCode?: string;
}

export interface PlaybackPlan {
  primary: PlaybackSource | null;
  fallbacks: PlaybackSource[];
  diagnostics: {
    hasDirectStream: boolean;
    hasTrailer: boolean;
    providerCount: number;
    source: "direct" | "trailer" | "providers" | "none";
  };
}

interface ProviderCountryShape {
  link?: string;
  flatrate?: Array<{ provider_id?: number; provider_name?: string }>;
  rent?: Array<{ provider_id?: number; provider_name?: string }>;
  buy?: Array<{ provider_id?: number; provider_name?: string }>;
}

const BLOCKED_PLAYBACK_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "adservice.google.com",
  "popads.net",
  "exoclick",
  "propellerads",
  "trafficstars",
  "juicyads",
  "pushame",
  "clickadu",
  "hilltopads",
  "adsterra",
  "ad-maven",
  "admaven",
  "popcash.net",
  "trafficjunky",
  "pushground",
  "richpush",
  "bidswitch.net",
  "adnxs.com",
  "adsrvr.org",
  "serving-sys.com",
  "taboola.com",
  "outbrain.com",
  "mgid.com",
  "revcontent.com",
  "zedo.com",
  "lqm.io",
  "popunder.net",
  "adf.ly",
  "bc.vc",
  "sh.st",
];

// ─── Stream providers (ranked best→worst — tested 2026-06-05) ────────────────
// Hardcoded fallback; the app will try to fetch the live list from the server.

interface DynamicProvider {
  id: string;
  label: string;
  movieUrl: string;
  tvUrl: string;
}

const FALLBACK_PROVIDERS = [
  // ── Tier 1: Tested clean players (ex-Server 2–9) ──
  { id: "vidlinkpro", label: "Server 1" },
  { id: "vidfast", label: "Server 2" },
  { id: "videasy", label: "Server 3" },
  { id: "vidsrcnl", label: "Server 4" },
  { id: "warezcdn", label: "Server 5" },
  { id: "flicky", label: "Server 6" },
  { id: "moviesapi", label: "Server 7" },
  { id: "flickystream", label: "Server 8" },
  // ── Tier 2: Additional reliable providers (added 2026-04-13) ──
  { id: "autoembed", label: "Server 9" },
  { id: "embedsu", label: "Server 10" },
  { id: "111movies", label: "Server 11" },
  { id: "vidsrcstream", label: "Server 12" },
  { id: "2embedorg", label: "Server 13" },
];

// Dynamic provider cache — refreshed from server every 6 hours
let dynamicProviders: DynamicProvider[] | null = null;
let dynamicFetchedAt = 0;
const DYNAMIC_TTL = 6 * 60 * 60 * 1000; // 6 hours — matches server check interval

export const PREFERRED_SERVER_LABELS = FALLBACK_PROVIDERS.map(
  (provider) => provider.label,
);

/** Fetch live provider list from server; falls back silently on failure */
async function fetchDynamicProviders(): Promise<DynamicProvider[] | null> {
  try {
    const res = await apiRequest("GET", "/api/streams/providers");
    const json = (await res.json()) as {
      ok: boolean;
      data?: DynamicProvider[];
    };
    if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
      dynamicProviders = json.data;
      dynamicFetchedAt = Date.now();
      return dynamicProviders;
    }
  } catch {
    // Server unreachable — use fallback
  }
  return null;
}

/** Get the active provider list (dynamic or fallback) */
function getStreamProviders(): { id: string; label: string }[] {
  if (dynamicProviders && Date.now() - dynamicFetchedAt < DYNAMIC_TTL) {
    return dynamicProviders;
  }
  return FALLBACK_PROVIDERS;
}

/** Refresh dynamic providers in background (non-blocking) */
export function refreshStreamProviders(): void {
  fetchDynamicProviders().catch(() => {});
}

/** Returns  labels of the currently active providers (dynamic or fallback) */
export function getActiveProviderLabels(): string[] {
  return getStreamProviders().map((p) => p.label);
}

/** Build embed URL from dynamic data or hardcoded switch */
function getDynamicEmbedUrl(
  provider: { id: string; movieUrl?: string; tvUrl?: string },
  tmdbId: string,
  type: MediaType,
  season: string,
  episode: string,
): string {
  const isMovie = type !== "series";
  const s = season || "1";
  const e = episode || "1";

  // If we have dynamic URL templates from the server, use them
  if (provider.movieUrl && provider.tvUrl) {
    const dynamic = provider as DynamicProvider;
    const tpl = isMovie ? dynamic.movieUrl : dynamic.tvUrl;
    return tpl.replace("{tmdbId}", tmdbId).replace("{s}", s).replace("{e}", e);
  }

  // Otherwise fall back to the hardcoded switch
  return getEmbedUrl(provider.id, tmdbId, type, s, e);
}

function getEmbedUrl(
  provider: string,
  tmdbId: string,
  type: MediaType,
  season: string,
  episode: string,
): string {
  const s = season || "1";
  const e = episode || "1";
  const isMovie = type !== "series";
  switch (provider) {
    // ── Tier 1 (ex-Server 2–9): tested clean players ──
    case "vidlinkpro":
      return isMovie
        ? `https://vidlink.pro/movie/${tmdbId}`
        : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;
    case "vidfast":
      return isMovie
        ? `https://vidfast.pro/movie/${tmdbId}`
        : `https://vidfast.pro/tv/${tmdbId}/${s}/${e}`;
    case "videasy":
      return isMovie
        ? `https://player.videasy.net/movie/${tmdbId}`
        : `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcnl":
      return isMovie
        ? `https://player.vidsrc.nl/embed/movie/${tmdbId}`
        : `https://player.vidsrc.nl/embed/tv/${tmdbId}/${s}/${e}`;
    case "warezcdn":
      return isMovie
        ? `https://warezcdn.com/embed/movie/${tmdbId}`
        : `https://warezcdn.com/embed/tv/${tmdbId}/${s}/${e}`;
    case "flicky":
      return isMovie
        ? `https://flicky.host/embed/movie/?id=${tmdbId}`
        : `https://flicky.host/embed/tv/?id=${tmdbId}&s=${s}&e=${e}`;
    case "moviesapi":
      return isMovie
        ? `https://moviesapi.club/movie/${tmdbId}`
        : `https://moviesapi.club/tv/${tmdbId}-${s}-${e}`;
    case "flickystream":
      return isMovie
        ? `https://flickystream.ru/movie/${tmdbId}`
        : `https://flickystream.ru/tv/${tmdbId}/${s}/${e}`;
    // ── Tier 2: additional reliable providers ──
    case "autoembed":
      return isMovie
        ? `https://autoembed.cc/movie/tmdb-${tmdbId}`
        : `https://autoembed.cc/tv/tmdb-${tmdbId}/${s}/${e}`;
    case "embedsu":
      return isMovie
        ? `https://embed.su/embed/movie/${tmdbId}`
        : `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`;
    case "111movies":
      return isMovie
        ? `https://111movies.net/movie/${tmdbId}`
        : `https://111movies.net/tv/${tmdbId}/${s}/${e}`;
    case "vidsrcstream":
      return isMovie
        ? `https://vidsrc.stream/embed/movie/${tmdbId}`
        : `https://vidsrc.stream/embed/tv/${tmdbId}/${s}/${e}`;
    case "2embedorg":
      return isMovie
        ? `https://www.2embed.org/embed/movie?id=${tmdbId}`
        : `https://www.2embed.org/embed/tv?id=${tmdbId}&s=${s}&e=${e}`;
    default:
      return isMovie
        ? `https://vidlink.pro/movie/${tmdbId}`
        : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;
  }
}

function toSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function normalizeTmdbId(rawTmdbId: string, mediaType: MediaType): string {
  const raw = String(rawTmdbId || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;

  const moviePrefixed = raw.match(/^tmdb_m_(\d+)$/i);
  const seriesPrefixed = raw.match(/^tmdb_s_(\d+)$/i);
  if (mediaType === "movie" && moviePrefixed?.[1]) return moviePrefixed[1];
  if (mediaType === "series" && seriesPrefixed?.[1]) return seriesPrefixed[1];

  // Fallback for mixed routes that pass prefixed ids without strict type alignment.
  const anyPrefixed = raw.match(/^tmdb_[ms]_(\d+)$/i);
  if (anyPrefixed?.[1]) return anyPrefixed[1];

  // Last-resort extraction for strings containing numeric TMDB IDs.
  const anyDigits = raw.match(/(\d+)/);
  return anyDigits?.[1] || "";
}

function normalizeYouTubeEmbed(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const makeEmbed = (key: string) =>
    `https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0&playsinline=1`;

  if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return makeEmbed(raw);

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const fromQuery = String(parsed.searchParams.get("v") || "").trim();
    if (/^[A-Za-z0-9_-]{6,}$/.test(fromQuery)) return makeEmbed(fromQuery);

    const parts = parsed.pathname.split("/").filter(Boolean);
    const tail = String(parts[parts.length - 1] || "").trim();
    if (
      (host.includes("youtu.be") || host.includes("youtube")) &&
      /^[A-Za-z0-9_-]{6,}$/.test(tail)
    ) {
      return makeEmbed(tail);
    }
  } catch {
    const match = raw.match(
      /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/i,
    );
    if (match?.[1]) return makeEmbed(String(match[1]).trim());
  }

  return raw;
}

function isSafePlaybackUrl(input: string): boolean {
  const raw = String(input || "").trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  const lower = raw.toLowerCase();
  return !BLOCKED_PLAYBACK_DOMAINS.some((domain) => lower.includes(domain));
}

function resolveStreamProviderSources(
  tmdbId: string,
  type: MediaType,
  season?: string,
  episode?: string,
): PlaybackSource[] {
  if (!tmdbId) return [];

  const out: PlaybackSource[] = [];
  const s = season || "1";
  const e = episode || "1";
  const providers = getStreamProviders();

  for (const provider of providers) {
    const url = getDynamicEmbedUrl(provider, tmdbId, type, s, e);
    if (!isSafePlaybackUrl(url)) continue;

    out.push({
      id: `stream-${provider.id}`,
      label: provider.label,
      type: "provider",
      url,
      quality: "Auto",
      providerName: provider.id,
    });
  }

  return out;
}

function detectQuality(url: string): string {
  const text = String(url || "").toLowerCase();
  if (text.includes("2160") || text.includes("4k")) return "4K";
  if (text.includes("1080")) return "1080p";
  if (text.includes("720")) return "720p";
  if (text.includes("480")) return "480p";
  return "Auto";
}

function normalizeProviderSources(
  results: Record<string, ProviderCountryShape>,
): PlaybackSource[] {
  const entries = Object.entries(results || {});
  if (!entries.length) return [];

  const preferred = ["NL", "US"];
  const countryCode = preferred.find((cc) => results[cc]) || entries[0][0];
  const countryData = results[countryCode] || {};

  const allProviders = [
    ...(Array.isArray(countryData.flatrate) ? countryData.flatrate : []),
    ...(Array.isArray(countryData.rent) ? countryData.rent : []),
    ...(Array.isArray(countryData.buy) ? countryData.buy : []),
  ];

  const dedup = new Set<number>();
  const providerSources: PlaybackSource[] = [];

  for (const provider of allProviders) {
    const pid = Number(provider?.provider_id || 0);
    if (!pid || dedup.has(pid)) continue;
    dedup.add(pid);
    const name = String(provider?.provider_name || "Provider");
    const link = String(countryData.link || "").trim();
    if (!link || !isSafePlaybackUrl(link)) continue;

    providerSources.push({
      id: `provider-${countryCode}-${pid}`,
      label: name,
      type: "provider",
      url: link,
      providerName: name,
      countryCode,
    });
  }

  return providerSources;
}

async function fetchProviderResults(
  tmdbId: string,
  type: MediaType,
): Promise<Record<string, ProviderCountryShape>> {
  if (!tmdbId || (type !== "movie" && type !== "series")) return {};
  const path =
    type === "movie"
      ? `/api/movies/${encodeURIComponent(tmdbId)}/providers`
      : `/api/series/${encodeURIComponent(tmdbId)}/providers`;

  try {
    const response = await apiRequest("GET", path);
    if (!response.ok) return {};
    const payload = await response.json();
    return payload && payload.results && typeof payload.results === "object"
      ? payload.results
      : {};
  } catch {
    return {};
  }
}

export async function buildPlaybackPlan(input: {
  streamUrl?: string | string[];
  trailerKey?: string | string[];
  embedUrl?: string | string[];
  tmdbId?: string | string[];
  type?: string | string[];
  season?: string | string[];
  episode?: string | string[];
}): Promise<PlaybackPlan> {
  const rawStream = toSingle(input.streamUrl).trim();
  const rawTrailerKey = toSingle(input.trailerKey).trim();
  const rawEmbed = toSingle(input.embedUrl).trim();
  const rawTmdbId = toSingle(input.tmdbId).trim();
  const rawType = toSingle(input.type).trim().toLowerCase();
  const rawSeason = toSingle(input.season).trim() || "1";
  const rawEpisode = toSingle(input.episode).trim() || "1";

  const mediaType: MediaType =
    rawType === "series" || rawType === "tv"
      ? "series"
      : rawType === "movie"
        ? "movie"
        : rawType === "trailer"
          ? "trailer"
          : "movie";
  const normalizedTmdbId = normalizeTmdbId(rawTmdbId, mediaType);

  streamLog("info", "resolver", "Playback resolver input", {
    mediaType,
    rawTmdbId,
    normalizedTmdbId,
    season: rawSeason,
    episode: rawEpisode,
    hasDirectStream: Boolean(rawStream),
    hasEmbedUrl: Boolean(rawEmbed),
    hasTrailerKey: Boolean(rawTrailerKey),
  });

  const directStream = /^https?:\/\//i.test(rawStream)
    ? {
        id: "direct-stream",
        label: "Direct Stream",
        type: "stream" as const,
        url: rawStream,
        quality: detectQuality(rawStream),
      }
    : null;

  const trailerEmbed = normalizeYouTubeEmbed(rawTrailerKey || rawEmbed);
  const trailerSource = trailerEmbed
    ? {
        id: "trailer",
        label: "Official Trailer",
        type: "trailer" as const,
        url: trailerEmbed,
      }
    : null;

  const providerResults = await fetchProviderResults(normalizedTmdbId, mediaType);
  const providerSources = normalizeProviderSources(providerResults);
  const streamSources = resolveStreamProviderSources(
    normalizedTmdbId,
    mediaType,
    rawSeason,
    rawEpisode,
  );
  const mergedFallbacks = [...streamSources, ...providerSources];

  streamLog("info", "resolver", "Playback resolver source discovery", {
    normalizedTmdbId,
    streamSources: streamSources.length,
    providerSources: providerSources.length,
    mergedFallbacks: mergedFallbacks.length,
  });

  if (directStream) {
    streamLog("info", "resolver", "Playback resolver chose direct stream", {
      url: directStream.url,
      fallbackCount: mergedFallbacks.length,
    });
    return {
      primary: directStream,
      fallbacks: [
        ...mergedFallbacks,
        ...(trailerSource ? [trailerSource] : []),
      ],
      diagnostics: {
        hasDirectStream: true,
        hasTrailer: Boolean(trailerSource),
        providerCount: mergedFallbacks.length,
        source: "direct",
      },
    };
  }

  if (streamSources.length) {
    streamLog("info", "resolver", "Playback resolver chose provider stream", {
      selected: streamSources[0]?.label,
      url: streamSources[0]?.url,
      fallbackCount:
        streamSources.slice(1).length +
        providerSources.length +
        (trailerSource ? 1 : 0),
    });
    return {
      primary: streamSources[0],
      fallbacks: [
        ...streamSources.slice(1),
        ...providerSources,
        ...(trailerSource ? [trailerSource] : []),
      ],
      diagnostics: {
        hasDirectStream: false,
        hasTrailer: Boolean(trailerSource),
        providerCount: streamSources.length + providerSources.length,
        source: "providers",
      },
    };
  }

  if (trailerSource) {
    streamLog("warn", "resolver", "Playback resolver fell back to trailer", {
      url: trailerSource.url,
      fallbackCount: mergedFallbacks.length,
    });
    return {
      primary: trailerSource,
      fallbacks: mergedFallbacks,
      diagnostics: {
        hasDirectStream: false,
        hasTrailer: true,
        providerCount: mergedFallbacks.length,
        source: "trailer",
      },
    };
  }

  if (mergedFallbacks.length) {
    streamLog("warn", "resolver", "Playback resolver using merged fallback", {
      selected: mergedFallbacks[0]?.label,
      url: mergedFallbacks[0]?.url,
      fallbackCount: mergedFallbacks.slice(1).length,
    });
    return {
      primary: mergedFallbacks[0],
      fallbacks: mergedFallbacks.slice(1),
      diagnostics: {
        hasDirectStream: false,
        hasTrailer: false,
        providerCount: mergedFallbacks.length,
        source: "providers",
      },
    };
  }

  return {
    primary: null,
    fallbacks: [],
    diagnostics: {
      hasDirectStream: false,
      hasTrailer: false,
      providerCount: 0,
      source: "none",
    },
  };
}

export async function startSession(
  deviceId: string,
  streamUrl?: string,
): Promise<{
  ok: boolean;
  activeStreams?: number;
  maxStreams?: number;
  error?: string;
  sharingWarning?: string;
}> {
  try {
    const res = await apiRequest("POST", "/api/session/start", {
      deviceId,
      streamUrl,
    });
    return await res.json();
  } catch {
    return { ok: true };
  }
}

export async function sendHeartbeat(deviceId: string): Promise<void> {
  try {
    await apiRequest("POST", "/api/session/heartbeat", { deviceId });
  } catch {
    // no-op
  }
}

export async function stopSession(deviceId: string): Promise<void> {
  try {
    await apiRequest("POST", "/api/session/stop", { deviceId });
  } catch {
    // no-op
  }
}
