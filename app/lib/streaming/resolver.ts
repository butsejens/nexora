import { AUTO_PROVIDER_ADAPTERS } from "./providers/index.ts";
import { dedupeStreams } from "./dedupe.ts";
import { isHardExcluded, scoreStream, sortByScore } from "./scoring.ts";
import type {
  DeviceCapabilities,
  ProviderFetchOutcome,
  ProviderRuntimeConfig,
  ProviderStats,
  ScoredStream,
  StreamProviderId,
  StreamRequestContext,
  UserStreamPreferences,
} from "./types.ts";

export interface ResolveAutoStreamsOptions {
  configs: ProviderRuntimeConfig[];
  context: StreamRequestContext;
  prefs: UserStreamPreferences;
  device: DeviceCapabilities;
  stats: Partial<Record<StreamProviderId, ProviderStats>>;
  fetchFn?: typeof fetch;
}

export interface ResolveAutoStreamsResult {
  streams: ScoredStream[];
  outcomes: ProviderFetchOutcome[];
}

async function fetchOneProvider(
  config: ProviderRuntimeConfig,
  context: StreamRequestContext,
  fetchFn?: typeof fetch,
): Promise<ProviderFetchOutcome> {
  const adapter = AUTO_PROVIDER_ADAPTERS[config.id];
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, config.timeoutMs));

  try {
    const streams = await adapter.fetchStreams(
      config.endpoint,
      context,
      config.timeoutMs,
      controller.signal,
      fetchFn,
    );
    return { providerId: config.id, ok: true, elapsedMs: Date.now() - started, streams };
  } catch (error) {
    return {
      providerId: config.id,
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
      elapsedMs: Date.now() - started,
      streams: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches Torrentio/Comet/Meteor in parallel (one slow/offline provider never
 * blocks the others), normalizes + dedupes + scores everything, and returns a
 * ranked list. Callers are responsible for trying the top entry first and
 * walking down the list on playback failure.
 */
export async function resolveAutoStreams(
  options: ResolveAutoStreamsOptions,
): Promise<ResolveAutoStreamsResult> {
  const enabledConfigs = options.configs.filter(
    (config) => config.enabled && config.endpoint.trim().length > 0,
  );

  const outcomes = await Promise.all(
    enabledConfigs.map((config) => fetchOneProvider(config, options.context, options.fetchFn)),
  );

  const allStreams = outcomes.flatMap((outcome) => outcome.streams);
  const deduped = dedupeStreams(allStreams);
  const eligible = deduped.filter((stream) => !isHardExcluded(stream, options.prefs));
  const scored = eligible.map((stream) =>
    scoreStream(stream, options.prefs, options.device, options.stats[stream.providerId]),
  );

  return { streams: sortByScore(scored), outcomes };
}
