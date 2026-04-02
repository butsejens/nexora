import { apiRequest } from "./query-client";

export type MediaType = "movie" | "series" | "livetv" | "trailer";

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

function toSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function normalizeYouTubeEmbed(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const makeEmbed = (key: string) => `https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0&playsinline=1`;

  if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return makeEmbed(raw);

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const fromQuery = String(parsed.searchParams.get("v") || "").trim();
    if (/^[A-Za-z0-9_-]{6,}$/.test(fromQuery)) return makeEmbed(fromQuery);

    const parts = parsed.pathname.split("/").filter(Boolean);
    const tail = String(parts[parts.length - 1] || "").trim();
    if ((host.includes("youtu.be") || host.includes("youtube")) && /^[A-Za-z0-9_-]{6,}$/.test(tail)) {
      return makeEmbed(tail);
    }
  } catch {
    const match = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/i);
    if (match?.[1]) return makeEmbed(String(match[1]).trim());
  }

  return raw;
}

function detectQuality(url: string): string {
  const text = String(url || "").toLowerCase();
  if (text.includes("2160") || text.includes("4k")) return "4K";
  if (text.includes("1080")) return "1080p";
  if (text.includes("720")) return "720p";
  if (text.includes("480")) return "480p";
  return "Auto";
}

function normalizeProviderSources(results: Record<string, ProviderCountryShape>): PlaybackSource[] {
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
    if (!link) continue;

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

async function fetchProviderResults(tmdbId: string, type: MediaType): Promise<Record<string, ProviderCountryShape>> {
  if (!tmdbId || (type !== "movie" && type !== "series")) return {};
  const path = type === "movie"
    ? `/api/movies/${encodeURIComponent(tmdbId)}/providers`
    : `/api/series/${encodeURIComponent(tmdbId)}/providers`;

  try {
    const response = await apiRequest("GET", path);
    if (!response.ok) return {};
    const payload = await response.json();
    return (payload && payload.results && typeof payload.results === "object") ? payload.results : {};
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
}): Promise<PlaybackPlan> {
  const rawStream = toSingle(input.streamUrl).trim();
  const rawTrailerKey = toSingle(input.trailerKey).trim();
  const rawEmbed = toSingle(input.embedUrl).trim();
  const rawTmdbId = toSingle(input.tmdbId).trim();
  const rawType = toSingle(input.type).trim().toLowerCase();

  const mediaType: MediaType = rawType === "series" || rawType === "tv"
    ? "series"
    : rawType === "movie"
      ? "movie"
      : rawType === "trailer"
        ? "trailer"
        : "livetv";

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

  const providerResults = await fetchProviderResults(rawTmdbId, mediaType);
  const providerSources = normalizeProviderSources(providerResults);

  if (directStream) {
    return {
      primary: directStream,
      fallbacks: [
        ...(trailerSource ? [trailerSource] : []),
        ...providerSources,
      ],
      diagnostics: {
        hasDirectStream: true,
        hasTrailer: Boolean(trailerSource),
        providerCount: providerSources.length,
        source: "direct",
      },
    };
  }

  if (trailerSource) {
    return {
      primary: trailerSource,
      fallbacks: providerSources,
      diagnostics: {
        hasDirectStream: false,
        hasTrailer: true,
        providerCount: providerSources.length,
        source: "trailer",
      },
    };
  }

  if (providerSources.length) {
    return {
      primary: providerSources[0],
      fallbacks: providerSources.slice(1),
      diagnostics: {
        hasDirectStream: false,
        hasTrailer: false,
        providerCount: providerSources.length,
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

export async function startSession(deviceId: string, streamUrl?: string): Promise<{
  ok: boolean;
  activeStreams?: number;
  maxStreams?: number;
  error?: string;
  sharingWarning?: string;
}> {
  try {
    const res = await apiRequest("POST", "/api/session/start", { deviceId, streamUrl });
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
