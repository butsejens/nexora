/**
 * CineLog — shared types for the torrent/debrid stream stack (Torrentio, Comet,
 * Meteor). These providers speak the public Stremio "stream resource" protocol:
 * `GET {endpoint}/stream/{movie|series}/{imdbId | imdbId:season:episode}.json`.
 *
 * Nothing here talks to the network — see `providers/` and `resolver.ts`.
 */

export type StreamProviderId = "torrentio" | "comet" | "meteor";

/** All three sit in one priority group, strictly above the legacy embed servers. */
export const AUTO_STREAM_PROVIDER_IDS: readonly StreamProviderId[] = [
  "torrentio",
  "comet",
  "meteor",
];

export type ResolutionTier = "4k" | "1080p" | "720p" | "480p" | "unknown";

export const RESOLUTION_ORDER: Record<ResolutionTier, number> = {
  "4k": 4,
  "1080p": 3,
  "720p": 2,
  "480p": 1,
  unknown: 0,
};

export interface ProviderRuntimeConfig {
  id: StreamProviderId;
  /** Base URL the user configured for this addon; empty = provider disabled. */
  endpoint: string;
  enabled: boolean;
  timeoutMs: number;
}

export interface StreamRequestContext {
  type: "movie" | "series";
  tmdbId: number;
  imdbId: string | null;
  title: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface DeviceCapabilities {
  supportsDolbyVision: boolean;
  supportsHdr: boolean;
}

export interface UserStreamPreferences {
  autoSelectBest: boolean;
  maxResolution: ResolutionTier;
  preferredLanguage: string;
  allowHdr: boolean;
  maxFileSizeGb: number | null;
}

/** One stream, already normalized from whatever shape a provider returned. */
export interface NormalizedStream {
  /** Stable id combining provider + provider-local key, used as list key. */
  id: string;
  providerId: StreamProviderId;
  /** Lower = higher priority. The three auto providers use 0/1/2. */
  providerPriority: number;
  label: string;
  /** Direct, playable URL if the addon already resolved one (e.g. via debrid). */
  playbackUrl: string | null;
  infoHash: string | null;
  magnetId: string | null;
  resolution: ResolutionTier;
  videoCodec: string | null;
  audioCodec: string | null;
  isHdr: boolean;
  isDolbyVision: boolean;
  /** Cached/instant (debrid) or otherwise reachable without a long fetch delay. */
  isCached: boolean;
  seeders: number | null;
  sizeBytes: number | null;
  languages: string[];
  /** False when the payload looks like the wrong title/season/episode. */
  matchesRequest: boolean;
}

export interface ScoredStream extends NormalizedStream {
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface ProviderStats {
  attempts: number;
  successes: number;
  failures: number;
  avgResponseMs: number;
}

export interface ProviderFetchOutcome {
  providerId: StreamProviderId;
  ok: boolean;
  error?: string;
  elapsedMs: number;
  streams: NormalizedStream[];
}

export interface StreamProviderAdapter {
  id: StreamProviderId;
  label: string;
  fetchStreams: (
    endpoint: string,
    context: StreamRequestContext,
    timeoutMs: number,
    signal?: AbortSignal,
    fetchFn?: typeof fetch,
  ) => Promise<NormalizedStream[]>;
}
