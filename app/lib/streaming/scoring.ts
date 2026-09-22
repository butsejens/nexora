/**
 * CineLog — deterministic stream scoring.
 *
 * Every factor below is documented in the feature spec: provider priority,
 * reachability/caching, resolution vs. device/connection reliability, codec,
 * HDR/Dolby Vision compatibility, seeders, size sanity, language and each
 * provider's historical success rate. No randomness — same inputs, same score.
 */

import {
  RESOLUTION_ORDER,
  type DeviceCapabilities,
  type NormalizedStream,
  type ProviderStats,
  type ScoredStream,
  type UserStreamPreferences,
} from "./types.ts";

const EXPECTED_GB_PER_HOUR: Record<string, number> = {
  "4k": 6,
  "1080p": 2.2,
  "720p": 1.1,
  "480p": 0.5,
  unknown: 1.5,
};

/**
 * A stream that fails a hard rule (exceeds the user's resolution/size cap, or
 * looks like the wrong episode) is dropped entirely — see `filterExcluded`.
 */
export function isHardExcluded(
  stream: NormalizedStream,
  prefs: UserStreamPreferences,
): boolean {
  if (!stream.matchesRequest) return true;
  if (stream.resolution !== "unknown") {
    const capRank = RESOLUTION_ORDER[prefs.maxResolution];
    if (RESOLUTION_ORDER[stream.resolution] > capRank) return true;
  }
  if (
    prefs.maxFileSizeGb &&
    stream.sizeBytes &&
    stream.sizeBytes > prefs.maxFileSizeGb * 1024 ** 3
  ) {
    return true;
  }
  if (stream.isDolbyVision && !prefs.allowHdr) return true;
  return false;
}

export function scoreStream(
  stream: NormalizedStream,
  prefs: UserStreamPreferences,
  device: DeviceCapabilities,
  stats: ProviderStats | undefined,
): ScoredStream {
  const breakdown: Record<string, number> = {};

  // Provider priority — the auto group (0/1/2) dwarfs legacy embed providers
  // (100+), so the three new sources always outrank the old list.
  breakdown.priority = Math.max(0, 300 - stream.providerPriority * 10);

  // Reachability: a direct/resolved URL beats a magnet the player can't open.
  breakdown.reachability = stream.playbackUrl ? 80 : stream.infoHash ? 10 : 0;

  breakdown.cached = stream.isCached ? 60 : 0;

  // Resolution, penalized when it's unlikely to play smoothly (not cached,
  // few seeders) so a reliable 1080p can outrank a shaky 4K source.
  const resRank = RESOLUTION_ORDER[stream.resolution];
  let resolutionScore = resRank * 25;
  const risky = !stream.isCached && (stream.seeders ?? 0) < 5;
  if (stream.resolution === "4k" && risky) resolutionScore -= 70;
  if (stream.resolution === "1080p" && risky) resolutionScore -= 20;
  breakdown.resolution = resolutionScore;

  breakdown.videoCodec =
    stream.videoCodec === "hevc" || stream.videoCodec === "av1"
      ? 8
      : stream.videoCodec === "h264"
        ? 12
        : 0;
  breakdown.audioCodec = stream.audioCodec ? 6 : 0;

  if (stream.isDolbyVision) {
    breakdown.hdr = device.supportsDolbyVision && prefs.allowHdr ? 20 : -60;
  } else if (stream.isHdr) {
    breakdown.hdr = device.supportsHdr && prefs.allowHdr ? 12 : -25;
  } else {
    breakdown.hdr = 0;
  }

  breakdown.seeders =
    stream.seeders == null ? 5 : Math.min(35, Math.log2(stream.seeders + 1) * 7);

  // Size sanity: penalize files far outside the expected range for their
  // claimed resolution (either a mislabeled remux or a broken/tiny sample).
  if (stream.sizeBytes && stream.resolution !== "unknown") {
    const expectedPerHourBytes =
      EXPECTED_GB_PER_HOUR[stream.resolution] * 1024 ** 3;
    // Assume a ~2h runtime as a rough baseline; only used as a sanity ratio.
    const ratio = stream.sizeBytes / (expectedPerHourBytes * 2);
    breakdown.sizeSanity = ratio < 0.15 || ratio > 6 ? -20 : 8;
  } else {
    breakdown.sizeSanity = 0;
  }

  breakdown.language = stream.languages.includes(prefs.preferredLanguage)
    ? 20
    : stream.languages.length === 0
      ? 5
      : 0;

  if (stats && stats.attempts > 0) {
    const successRate = stats.successes / stats.attempts;
    breakdown.providerTrackRecord = Math.round((successRate - 0.5) * 40);
  } else {
    breakdown.providerTrackRecord = 0;
  }

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  return { ...stream, score, scoreBreakdown: breakdown };
}

export function sortByScore(streams: ScoredStream[]): ScoredStream[] {
  return [...streams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.providerPriority !== b.providerPriority) {
      return a.providerPriority - b.providerPriority;
    }
    return (b.seeders ?? 0) - (a.seeders ?? 0);
  });
}
