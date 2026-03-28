export type TeamSide = "home" | "away";

export type MomentumInput = {
  homeStats?: Record<string, unknown> | null;
  awayStats?: Record<string, unknown> | null;
};

export type MomentumBreakdown = {
  possession: number;
  attacks: number;
  shots: number;
  xg: number;
};

export type MomentumModel = {
  hasData: boolean;
  homePct: number;
  awayPct: number;
  dominantSide: TeamSide | "balanced";
  intensity: number;
  breakdown: MomentumBreakdown;
};

const POSSESSION_KEYS = ["possession", "possessionPct", "ballPossession", "possession_percentage"];
const ATTACK_KEYS = ["attacks", "dangerousAttacks", "attackingThirdEntries", "finalThirdEntries"];
const SHOT_KEYS = ["shotsOnTarget", "shotsOnGoal", "shots", "totalShots"];
const XG_KEYS = ["xg", "expectedGoals", "xGoals", "xG"];

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).replace(/%/g, "").replace(/,/g, ".").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readStat(stats: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!stats) return null;
  for (const key of keys) {
    const direct = toNum(stats[key]);
    if (direct != null) return direct;
    const lower = Object.entries(stats).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    const fromLower = toNum(lower?.[1]);
    if (fromLower != null) return fromLower;
  }
  return null;
}

function ratio(home: number | null, away: number | null): number | null {
  if (home == null || away == null) return null;
  const total = home + away;
  if (total <= 0) return null;
  return Math.max(0, Math.min(1, home / total));
}

export function calculateMomentum({ homeStats, awayStats }: MomentumInput): MomentumModel {
  const possessionHomeRaw = readStat(homeStats, POSSESSION_KEYS);
  const possessionAwayRaw = readStat(awayStats, POSSESSION_KEYS);
  const possessionRatio = possessionHomeRaw != null && possessionAwayRaw != null
    ? ratio(possessionHomeRaw, possessionAwayRaw)
    : possessionHomeRaw != null
      ? Math.max(0, Math.min(1, possessionHomeRaw / 100))
      : null;

  const attacksRatio = ratio(readStat(homeStats, ATTACK_KEYS), readStat(awayStats, ATTACK_KEYS));
  const shotsRatio = ratio(readStat(homeStats, SHOT_KEYS), readStat(awayStats, SHOT_KEYS));
  const xgRatio = ratio(readStat(homeStats, XG_KEYS), readStat(awayStats, XG_KEYS));

  const weighted: { value: number; weight: number }[] = [];
  if (possessionRatio != null) weighted.push({ value: possessionRatio, weight: 0.3 });
  if (attacksRatio != null) weighted.push({ value: attacksRatio, weight: 0.25 });
  if (shotsRatio != null) weighted.push({ value: shotsRatio, weight: 0.25 });
  if (xgRatio != null) weighted.push({ value: xgRatio, weight: 0.2 });

  if (!weighted.length) {
    return {
      hasData: false,
      homePct: 50,
      awayPct: 50,
      dominantSide: "balanced",
      intensity: 0,
      breakdown: { possession: 0, attacks: 0, shots: 0, xg: 0 },
    };
  }

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const score = weighted.reduce((sum, entry) => sum + (entry.value * entry.weight), 0) / totalWeight;
  const homePct = Math.round(score * 100);
  const awayPct = 100 - homePct;
  const delta = Math.abs(homePct - awayPct);

  return {
    hasData: true,
    homePct,
    awayPct,
    dominantSide: delta < 8 ? "balanced" : homePct > awayPct ? "home" : "away",
    intensity: Math.min(100, Math.round(delta * 1.6 + weighted.length * 8)),
    breakdown: {
      possession: possessionRatio != null ? Math.round(possessionRatio * 100) : 0,
      attacks: attacksRatio != null ? Math.round(attacksRatio * 100) : 0,
      shots: shotsRatio != null ? Math.round(shotsRatio * 100) : 0,
      xg: xgRatio != null ? Math.round(xgRatio * 100) : 0,
    },
  };
}
