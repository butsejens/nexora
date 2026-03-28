import { cacheGetStale, cacheSet } from "@/lib/services/cache-service";

export type StatsMode = "basic" | "pro";

type TeamStats = Record<string, unknown>;

const STATS_MODE_KEY = "ai:stats-mode:v1";

const BASIC_KEYS = [
  "possession",
  "shotsOnTarget",
  "shots",
  "passes",
  "corners",
  "fouls",
  "yellowCards",
  "redCards",
  "offsides",
];

export async function getStatsMode(): Promise<StatsMode> {
  const mode = await cacheGetStale<StatsMode>(STATS_MODE_KEY);
  return mode === "pro" ? "pro" : "basic";
}

export async function setStatsMode(mode: StatsMode): Promise<void> {
  await cacheSet(STATS_MODE_KEY, mode, 0);
}

export async function toggleStatsMode(current: StatsMode): Promise<StatsMode> {
  const next = current === "basic" ? "pro" : "basic";
  await setStatsMode(next);
  return next;
}

function pickBasicStats(stats: TeamStats): TeamStats {
  const entries = Object.entries(stats || {});
  return entries.reduce<TeamStats>((acc, [key, value]) => {
    const normalized = key.toLowerCase();
    const shouldKeep = BASIC_KEYS.some((token) => normalized.includes(token.toLowerCase()));
    if (shouldKeep) acc[key] = value;
    return acc;
  }, {});
}

export function filterStatsByMode(homeStats: TeamStats, awayStats: TeamStats, mode: StatsMode) {
  if (mode === "pro") {
    return { homeStats, awayStats, isReduced: false };
  }
  return {
    homeStats: pickBasicStats(homeStats),
    awayStats: pickBasicStats(awayStats),
    isReduced: true,
  };
}
