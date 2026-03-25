type TeamContext = {
  rank?: number | null;
  points?: number | null;
  goalDiff?: number | null;
  topScorer?: string | null;
  topScorerGoals?: number | null;
  topAssist?: string | null;
  topAssistCount?: number | null;
};

export type MatchAnalysisInput = {
  homeTeam: string;
  awayTeam: string;
  isLive?: boolean;
  minute?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  stats?: {
    home?: Record<string, unknown>;
    away?: Record<string, unknown>;
  };
  events?: Array<{ type?: string; team?: string; minute?: number; detail?: string }>;
  home: TeamContext;
  away: TeamContext;
};

export type MatchAnalysisOutput = {
  favored_side: "home" | "away" | "draw";
  confidence_score: number;
  key_factors: string[];
  likely_pattern: string;
  live_shift_summary: string | null;
  post_match_summary: string | null;
  prediction: "Home Win" | "Away Win" | "Draw";
  confidence: number;
  summary: string;
  keyFactors: string[];
  tacticalNotes: string[];
  matchPattern: string;
  confidenceReason: string;
  homePct: number;
  drawPct: number;
  awayPct: number;
};

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readStat(stats: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!stats) return null;
  for (const key of keys) {
    const value = num((stats as any)?.[key]);
    if (value != null) return value;
  }
  return null;
}

function buildCoverageSignals(input: MatchAnalysisInput): boolean[] {
  return [
    input.home.rank != null && input.away.rank != null,
    input.home.points != null && input.away.points != null,
    input.home.goalDiff != null && input.away.goalDiff != null,
    input.home.topScorerGoals != null || input.away.topScorerGoals != null,
    input.home.topAssistCount != null || input.away.topAssistCount != null,
    Boolean(input.stats?.home && input.stats?.away),
    Array.isArray(input.events) && input.events.length > 0,
    num(input.homeScore) != null && num(input.awayScore) != null,
    Boolean(input.minute != null),
  ];
}

function sideFromScore(score: number): "home" | "away" | "draw" {
  if (score > 0.16) return "home";
  if (score < -0.16) return "away";
  return "draw";
}

function toPrediction(side: "home" | "away" | "draw"): "Home Win" | "Away Win" | "Draw" {
  if (side === "home") return "Home Win";
  if (side === "away") return "Away Win";
  return "Draw";
}

function pctTriplet(score: number, confidence: number): { homePct: number; drawPct: number; awayPct: number } {
  const homeBase = clamp(34 + score * 28, 8, 84);
  const awayBase = clamp(34 - score * 28, 8, 84);
  const confidenceBoost = clamp((confidence - 50) * 0.12, 0, 7);
  const drawBase = clamp(100 - homeBase - awayBase - confidenceBoost, 8, 48);
  const total = homeBase + drawBase + awayBase;
  const homePct = Math.round((homeBase / total) * 100);
  const drawPct = Math.round((drawBase / total) * 100);
  const awayPct = Math.max(0, 100 - homePct - drawPct);
  return { homePct, drawPct, awayPct };
}

export function buildGroundedMatchAnalysis(input: MatchAnalysisInput): MatchAnalysisOutput {
  const factors: string[] = [];
  const tacticalNotes: string[] = [];

  const rankDelta = (num(input.away.rank) ?? 0) - (num(input.home.rank) ?? 0);
  const pointDelta = (num(input.home.points) ?? 0) - (num(input.away.points) ?? 0);
  const gdDelta = (num(input.home.goalDiff) ?? 0) - (num(input.away.goalDiff) ?? 0);
  const scorerDelta = (num(input.home.topScorerGoals) ?? 0) - (num(input.away.topScorerGoals) ?? 0);
  const assistDelta = (num(input.home.topAssistCount) ?? 0) - (num(input.away.topAssistCount) ?? 0);

  let modelScore = 0;

  if (input.home.rank != null && input.away.rank != null) {
    modelScore += clamp(rankDelta * 0.04, -0.32, 0.32);
    factors.push(`Ranking edge: ${input.homeTeam} #${input.home.rank} vs ${input.awayTeam} #${input.away.rank}`);
  }

  if (input.home.points != null && input.away.points != null) {
    modelScore += clamp(pointDelta * 0.008, -0.24, 0.24);
  }

  if (input.home.goalDiff != null && input.away.goalDiff != null) {
    modelScore += clamp(gdDelta * 0.01, -0.28, 0.28);
    factors.push(`Goal-difference trend: ${input.homeTeam} ${input.home.goalDiff ?? 0}, ${input.awayTeam} ${input.away.goalDiff ?? 0}`);
  }

  if (input.home.topScorerGoals != null || input.away.topScorerGoals != null) {
    modelScore += clamp(scorerDelta * 0.02, -0.18, 0.18);
    if (input.home.topScorer) factors.push(`${input.homeTeam} danger man: ${input.home.topScorer} (${input.home.topScorerGoals ?? 0})`);
    if (input.away.topScorer) factors.push(`${input.awayTeam} danger man: ${input.away.topScorer} (${input.away.topScorerGoals ?? 0})`);
  }

  if (input.home.topAssistCount != null || input.away.topAssistCount != null) {
    modelScore += clamp(assistDelta * 0.016, -0.14, 0.14);
  }

  const homeShots = readStat(input.stats?.home, ["shotsOnTarget", "shots_on_target", "shots"]);
  const awayShots = readStat(input.stats?.away, ["shotsOnTarget", "shots_on_target", "shots"]);
  const homePoss = readStat(input.stats?.home, ["possession", "possessionPct"]);
  const awayPoss = readStat(input.stats?.away, ["possession", "possessionPct"]);
  const homeCards = readStat(input.stats?.home, ["yellowCards", "cards", "fouls"]);
  const awayCards = readStat(input.stats?.away, ["yellowCards", "cards", "fouls"]);

  if (homeShots != null && awayShots != null) {
    modelScore += clamp((homeShots - awayShots) * 0.035, -0.24, 0.24);
    tacticalNotes.push(`Shot pressure: ${input.homeTeam} ${homeShots} on target vs ${input.awayTeam} ${awayShots}.`);
  }

  if (homePoss != null && awayPoss != null) {
    modelScore += clamp((homePoss - awayPoss) * 0.006, -0.12, 0.12);
    tacticalNotes.push(`Possession split is ${Math.round(homePoss)}-${Math.round(awayPoss)}.`);
  }

  if (homeCards != null && awayCards != null) {
    modelScore -= clamp((homeCards - awayCards) * 0.01, -0.08, 0.08);
  }

  const homeScore = num(input.homeScore) ?? 0;
  const awayScore = num(input.awayScore) ?? 0;
  const minute = num(input.minute) ?? null;
  const scoreDelta = homeScore - awayScore;

  if (input.isLive) {
    modelScore += clamp(scoreDelta * 0.22, -0.42, 0.42);
    if (minute != null) {
      const timeWeight = clamp((minute - 20) / 80, 0, 1);
      modelScore += clamp(scoreDelta * timeWeight * 0.18, -0.18, 0.18);
    }
  }

  const side = sideFromScore(modelScore);
  const coverageSignals = buildCoverageSignals(input);
  const coverageRatio = coverageSignals.filter(Boolean).length / coverageSignals.length;
  const confidence = Math.round(clamp(38 + Math.abs(modelScore) * 46 + coverageRatio * 28, 40, 92));
  const pcts = pctTriplet(modelScore, confidence);

  const likelyPattern = (() => {
    const totalShots = (homeShots ?? 0) + (awayShots ?? 0);
    if (input.isLive && minute != null && minute >= 70 && Math.abs(scoreDelta) <= 1) return "Late-phase control and set-piece swings are likely decisive.";
    if (totalShots >= 12) return "Open game profile with transitions and repeat high-value chances.";
    if (Math.abs(modelScore) < 0.2) return "Tight, low-margin contest where moments and discipline decide.";
    return side === "home"
      ? `${input.homeTeam} should dictate territory and chance volume.`
      : side === "away"
        ? `${input.awayTeam} carry stronger control indicators and transition threat.`
        : "Balanced contest with no dominant side across the available signals.";
  })();

  const liveShiftSummary = input.isLive
    ? `${input.homeTeam} ${homeScore}-${awayScore} ${input.awayTeam}${minute != null ? ` at ${minute}'` : ""}. Momentum leans ${side === "draw" ? "neutral" : side === "home" ? input.homeTeam : input.awayTeam} on current signal balance.`
    : null;

  const postMatchSummary = !input.isLive && (homeScore > 0 || awayScore > 0)
    ? `${input.homeTeam} ${homeScore}-${awayScore} ${input.awayTeam}. ${Math.abs(scoreDelta) <= 1 ? "Fine margins" : "Clear separation"} matched the model's pre-game indicators.`
    : null;

  const confidenceReason = coverageRatio >= 0.75
    ? "Confidence is supported by standings, scoring trends, and match-state signals."
    : coverageRatio >= 0.45
      ? "Confidence is moderate due to partial data coverage."
      : "Confidence is conservative because only limited verified signals are available.";

  const summary = `${side === "draw" ? "Balanced matchup" : `${side === "home" ? input.homeTeam : input.awayTeam} are favored`} (${confidence}% confidence). ${likelyPattern}`;

  return {
    favored_side: side,
    confidence_score: confidence,
    key_factors: factors.slice(0, 5),
    likely_pattern: likelyPattern,
    live_shift_summary: liveShiftSummary,
    post_match_summary: postMatchSummary,
    prediction: toPrediction(side),
    confidence,
    summary,
    keyFactors: factors.slice(0, 5),
    tacticalNotes: tacticalNotes.slice(0, 4),
    matchPattern: likelyPattern,
    confidenceReason,
    homePct: pcts.homePct,
    drawPct: pcts.drawPct,
    awayPct: pcts.awayPct,
  };
}
