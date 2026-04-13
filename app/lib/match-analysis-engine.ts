type TeamContext = {
  rank?: number | null;
  points?: number | null;
  goalDiff?: number | null;
  topScorer?: string | null;
  topScorerGoals?: number | null;
  topAssist?: string | null;
  topAssistCount?: number | null;
  formation?: string | null;
  cleanSheets?: number | null;
  gamesPlayed?: number | null;
  recentForm?: string | null;
  recentResults5?: string[] | null;
  recentResults10?: string[] | null;
  homeFormPts?: number | null;
  awayFormPts?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  xgFor?: number | null;
  xgAgainst?: number | null;
  injuries?: number | null;
  suspensions?: number | null;
  fatigueIndex?: number | null;
  congestionIndex?: number | null;
  lineupStrength?: number | null;
  lineupCertainty?: number | null;
  standingsPressure?: number | null;
  fifaRank?: number | null;
  marketValueProxy?: number | null;
  /** Season average possession % (0–100) */
  possession?: number | null;
  /** Season average shots per game */
  shotsPerGame?: number | null;
  /** Goals scored in recent 5 matches */
  recentGoalsScored?: number | null;
  /** Goals conceded in recent 5 matches */
  recentGoalsConceded?: number | null;
  /** Weighted AI form score (higher = better recent form) */
  aiFormScore?: number | null;
};

export type MatchAnalysisInput = {
  matchId?: string;
  competition?: string | null;
  competitionContext?: string | null;
  homeTeam: string;
  awayTeam: string;
  isLive?: boolean;
  minute?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string | null;
  isInternational?: boolean;
  /** Weather description string (e.g. "Rain", "Clear", "Cold 3°C") */
  weather?: string | null;
  stats?: {
    home?: Record<string, unknown>;
    away?: Record<string, unknown>;
  };
  events?: {
    type?: string;
    team?: string;
    minute?: number;
    detail?: string;
    player?: string;
    text?: string;
  }[];
  home?: TeamContext;
  away?: TeamContext;
  headToHead?: {
    homeWins: number;
    awayWins: number;
    draws: number;
    goalsHome?: number;
    goalsAway?: number;
  } | null;
  context?: {
    home?: TeamContext;
    away?: TeamContext;
    headToHead?: MatchAnalysisInput["headToHead"];
    competitionContext?: string | null;
    isInternational?: boolean;
  };
};

export type MatchAnalysisOutput = {
  favored_side: "home" | "away" | "draw";
  confidence_score: number;
  confidence_label: "Low" | "Medium" | "High" | "Elite";
  prediction: "Home Win" | "Away Win" | "Draw";
  confidence: number;
  summary: string;
  live_shift_summary: string | null;
  post_match_summary: string | null;
  matchPattern: string;
  likely_pattern: string;
  confidenceReason: string;
  key_factors: string[];
  keyFactors: string[];
  tacticalNotes: string[];
  matchInsight: string | null;
  h2hSummary: string | null;
  formHome: string | null;
  formAway: string | null;
  formGuide: {
    homeForm: string;
    awayForm: string;
  } | null;
  tacticalEdge: {
    homeStrengths: string[];
    homeWeaknesses: string[];
    awayStrengths: string[];
    awayWeaknesses: string[];
  } | null;
  homePct: number;
  drawPct: number;
  awayPct: number;
  doubleChanceHomePct: number;
  doubleChanceAwayPct: number;
  bothTeamsToScorePct: number;
  cleanSheetHomePct: number;
  cleanSheetAwayPct: number;
  over15Pct: number;
  under15Pct: number;
  over25Pct: number;
  under25Pct: number;
  over35Pct: number;
  under35Pct: number;
  xgHome: number;
  xgAway: number;
  expectedGoalShareHomePct: number;
  expectedGoalShareAwayPct: number;
  firstTeamToScore: string;
  firstTeamToScorePct: number;
  scoreDrawRiskPct: number;
  upsetProbabilityPct: number;
  edgeScore: number;
  pressureIndex: number;
  momentum: "Home" | "Away" | "Balanced";
  momentumScore: number;
  danger: "Home Attack" | "Away Attack" | "Balanced";
  riskLevel: "Low" | "Medium" | "High";
  riskFactors: {
    label: string;
    impact: number;
    tone: "positive" | "warning" | "critical";
  }[];
  playerImpact: { team: string; note: string; impact: number }[];
  attackingStrength: { home: number; away: number };
  defensiveStrength: { home: number; away: number };
  nextGoalProbability: number | null;
  predictedScore: string;
  tip: string;
  providerError?: boolean;
  insufficientData?: boolean;
  source: "nexora-match-intelligence";
  updatedAt: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

function asTeamContext(value?: TeamContext | null): TeamContext {
  return value || {};
}

function contextTeam(
  input: MatchAnalysisInput,
  side: "home" | "away",
): TeamContext {
  return asTeamContext(input[side] || input.context?.[side]);
}

function normalizeCompetition(input: MatchAnalysisInput): string {
  return String(
    input.competition ||
      input.competitionContext ||
      input.context?.competitionContext ||
      "",
  ).trim();
}

function normalizeEvents(input: MatchAnalysisInput) {
  return Array.isArray(input.events) ? input.events : [];
}

function normalizeStatValue(value: unknown): number | null {
  if (typeof value === "string") {
    const clean = value.replace(/%/g, "").replace(/,/g, ".").trim();
    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return num(value);
}

function readStat(
  stats: Record<string, unknown> | undefined,
  keys: string[],
): number | null {
  if (!stats) return null;
  for (const key of keys) {
    const direct = normalizeStatValue((stats as Record<string, unknown>)[key]);
    if (direct != null) return direct;
  }
  return null;
}

function normalizeResultTokens(
  results?: string[] | null,
  fallback?: string | null,
): string[] {
  if (Array.isArray(results) && results.length) {
    return results
      .map((result) =>
        String(result || "")
          .trim()
          .toUpperCase(),
      )
      .map((result) =>
        result.startsWith("W")
          ? "W"
          : result.startsWith("D")
            ? "D"
            : result.startsWith("L")
              ? "L"
              : "",
      )
      .filter(Boolean);
  }

  const compact = String(fallback || "")
    .toUpperCase()
    .replace(/[^WDL]/g, "")
    .split("")
    .filter(Boolean);
  return compact;
}

function formPoints(results: string[]): number {
  return results.reduce((total, result) => {
    if (result === "W") return total + 3;
    if (result === "D") return total + 1;
    return total;
  }, 0);
}

function weightedFormScore(results: string[]): number {
  if (!results.length) return 0;
  const recentLast = results.slice(-10);
  const weights = recentLast.map((_, index) => index + 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const weighted = recentLast.reduce((sum, result, index) => {
    const base = result === "W" ? 1 : result === "D" ? 0.35 : -0.9;
    return sum + base * weights[index];
  }, 0);
  return weighted / Math.max(1, totalWeight);
}

function poissonProbabilities(lambda: number, maxGoals = 6): number[] {
  const safeLambda = Math.max(0.05, lambda);
  const result: number[] = [];
  let prev = Math.exp(-safeLambda);
  result.push(prev);
  for (let goals = 1; goals <= maxGoals; goals += 1) {
    prev = prev * (safeLambda / goals);
    result.push(prev);
  }
  const total = result.reduce((sum, value) => sum + value, 0);
  return result.map((value) => value / Math.max(total, 1e-9));
}

function overThresholdProbability(
  homeLambda: number,
  awayLambda: number,
  threshold: number,
): number {
  const home = poissonProbabilities(homeLambda);
  const away = poissonProbabilities(awayLambda);
  let underOrEqual = 0;

  for (let homeGoals = 0; homeGoals < home.length; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals < away.length; awayGoals += 1) {
      if (homeGoals + awayGoals <= threshold) {
        underOrEqual += home[homeGoals] * away[awayGoals];
      }
    }
  }

  return clamp((1 - underOrEqual) * 100, 1, 99);
}

function cleanSheetProbability(opponentXg: number): number {
  return clamp(Math.exp(-Math.max(0.08, opponentXg)) * 100, 1, 95);
}

function scoreFromProbabilities(
  homePct: number,
  drawPct: number,
  awayPct: number,
): "Home Win" | "Away Win" | "Draw" {
  if (homePct >= drawPct && homePct >= awayPct) return "Home Win";
  if (awayPct >= homePct && awayPct >= drawPct) return "Away Win";
  return "Draw";
}

function favoredSide(
  outcome: MatchAnalysisOutput["prediction"],
): MatchAnalysisOutput["favored_side"] {
  if (outcome === "Home Win") return "home";
  if (outcome === "Away Win") return "away";
  return "draw";
}

function softmaxThreeWay(
  homeStrength: number,
  drawStrength: number,
  awayStrength: number,
) {
  const exps = [homeStrength, drawStrength, awayStrength].map((value) =>
    Math.exp(clamp(value, -4, 4)),
  );
  const total = exps.reduce((sum, value) => sum + value, 0);
  const homePct = pct((exps[0] / total) * 100);
  const drawPct = pct((exps[1] / total) * 100);
  const awayPct = 100 - homePct - drawPct;
  return { homePct, drawPct, awayPct };
}

function toConfidenceLabel(
  confidence: number,
): MatchAnalysisOutput["confidence_label"] {
  if (confidence >= 82) return "Elite";
  if (confidence >= 69) return "High";
  if (confidence >= 55) return "Medium";
  return "Low";
}

function riskLevelFromConfidence(
  confidence: number,
  liveChaos: number,
): MatchAnalysisOutput["riskLevel"] {
  if (confidence >= 74 && liveChaos < 0.28) return "Low";
  if (confidence >= 56) return "Medium";
  return "High";
}

function eventText(
  event: NonNullable<MatchAnalysisInput["events"]>[number],
): string {
  return `${event?.type || ""} ${event?.detail || ""} ${event?.text || ""}`.toLowerCase();
}

function scorelineFromXg(
  homeXg: number,
  awayXg: number,
  homeScore: number,
  awayScore: number,
  homePct: number,
  drawPct: number,
  awayPct: number,
): string {
  // Build Poisson probability matrix for all (h,a) pairs
  const homeProbs = poissonProbabilities(Math.max(0.15, homeXg), 7);
  const awayProbs = poissonProbabilities(Math.max(0.15, awayXg), 7);

  // Weight each scoreline by Poisson joint prob × outcome alignment.
  const homeW = homePct / 100;
  const drawW = drawPct / 100;
  const awayW = awayPct / 100;

  // Determine which outcome class is predicted
  const predictedOutcome =
    homePct > drawPct && homePct >= awayPct
      ? "home"
      : awayPct > drawPct && awayPct > homePct
        ? "away"
        : "draw";

  let bestScore = -1;
  let bestHome = 1;
  let bestAway = 0;

  for (let h = 0; h < homeProbs.length; h++) {
    for (let a = 0; a < awayProbs.length; a++) {
      if (h < homeScore || a < awayScore) continue; // respect live scores
      const poissonP = homeProbs[h] * awayProbs[a];

      // Determine which outcome this scoreline belongs to
      const scoreOutcome = h > a ? "home" : a > h ? "away" : "draw";

      // Primary: outcome alignment weight
      let outcomeWeight: number;
      if (h > a) outcomeWeight = homeW;
      else if (a > h) outcomeWeight = awayW;
      else outcomeWeight = drawW;
      const combined = poissonP * outcomeWeight;

      // Only consider scores from the predicted outcome class, unless
      // no valid score is found yet (e.g. live game with high homeScore)
      if (scoreOutcome !== predictedOutcome && bestScore > 0) continue;

      if (combined > bestScore) {
        bestScore = combined;
        bestHome = h;
        bestAway = a;
      }
    }
  }
  return `${bestHome}-${bestAway}`;
}

function buildH2HSummary(input: MatchAnalysisInput): string | null {
  const headToHead = input.headToHead || input.context?.headToHead;
  if (!headToHead) return null;
  const total =
    (headToHead.homeWins || 0) +
    (headToHead.awayWins || 0) +
    (headToHead.draws || 0);
  if (total <= 0) return null;
  return `${input.homeTeam} edge in H2H: ${headToHead.homeWins || 0}W-${headToHead.draws || 0}D-${headToHead.awayWins || 0}L over ${total} meetings.`;
}

function describeForm(
  teamName: string,
  form: string[],
  venuePoints: number | null | undefined,
  goalsFor: number | null | undefined,
  goalsAgainst: number | null | undefined,
): string {
  const compactForm = form.length ? form.join("") : "mixed data";
  const base = `${teamName} form trend is ${compactForm}.`;
  const venue =
    venuePoints != null
      ? ` Venue form: ${Math.round(venuePoints)}/15 pts.`
      : "";
  const goalLine =
    goalsFor != null || goalsAgainst != null
      ? ` Goal trend ${Math.round(goalsFor || 0)} for / ${Math.round(goalsAgainst || 0)} against.`
      : "";
  return `${base}${venue}${goalLine}`.trim();
}

function buildSummary(args: {
  homeTeam: string;
  awayTeam: string;
  outcome: MatchAnalysisOutput["prediction"];
  confidence: number;
  drivingSignals: string[];
  isLive: boolean;
  scoreline: string;
  minute: number | null;
  liveDriver: string | null;
  predictedScore?: string;
}): string {
  const leader =
    args.outcome === "Home Win"
      ? args.homeTeam
      : args.outcome === "Away Win"
        ? args.awayTeam
        : "Neither side";
  const reason = args.drivingSignals[0] || "balanced inputs";
  if (args.isLive) {
    const liveContext =
      args.minute != null ? ` after ${args.minute}'` : " live";
    const shift = args.liveDriver ? ` ${args.liveDriver}` : "";
    return `${leader === "Neither side" ? "The match remains finely balanced" : `${leader} hold the stronger live edge`}${liveContext} at ${args.scoreline}. ${reason}.${shift}`;
  }
  const scoreHint = args.predictedScore
    ? ` — predicted: ${args.predictedScore}`
    : "";
  return `${leader === "Neither side" ? "This match sets up as a narrow contest" : `${leader} project as the stronger side`} with ${args.confidence}% confidence${scoreHint}. ${reason}.`;
}

function buildLiveShiftSummary(args: {
  input: MatchAnalysisInput;
  momentum: MatchAnalysisOutput["momentum"];
  momentumDriver: string;
}): string | null {
  if (!args.input.isLive) return null;
  const minute = num(args.input.minute);
  const homeScore = Math.max(0, num(args.input.homeScore) ?? 0);
  const awayScore = Math.max(0, num(args.input.awayScore) ?? 0);
  const lean =
    args.momentum === "Home"
      ? args.input.homeTeam
      : args.momentum === "Away"
        ? args.input.awayTeam
        : "neither side";
  return `${args.input.homeTeam} ${homeScore}-${awayScore} ${args.input.awayTeam}${minute != null ? ` at ${minute}'` : ""}. Match balance leans toward ${lean} because ${args.momentumDriver}.`;
}

function buildPostMatchSummary(
  input: MatchAnalysisInput,
  predictedScore: string,
): string | null {
  if (input.isLive) return null;
  const homeScore = num(input.homeScore);
  const awayScore = num(input.awayScore);
  const status = String(input.status || "").toLowerCase();
  const finished =
    status.includes("ft") ||
    status.includes("finished") ||
    status.includes("full") ||
    status.includes("final");
  if (homeScore == null || awayScore == null || !finished) return null;
  return `Final score ${input.homeTeam} ${homeScore}-${awayScore} ${input.awayTeam}. Pre-match model line was ${predictedScore}.`;
}

function inferRiskFactors(args: {
  homeInjuries: number;
  awayInjuries: number;
  homeFatigue: number;
  awayFatigue: number;
  liveChaos: number;
  redSwing: number;
  drawPct: number;
  upsetProbabilityPct: number;
}) {
  const factors: MatchAnalysisOutput["riskFactors"] = [];
  if (args.homeInjuries >= 2 || args.awayInjuries >= 2) {
    factors.push({
      label: "Absences are affecting lineup stability",
      impact: pct((args.homeInjuries + args.awayInjuries) * 12),
      tone: "warning",
    });
  }
  if (args.homeFatigue >= 60 || args.awayFatigue >= 60) {
    factors.push({
      label: "Fatigue and schedule load raise late-game variance",
      impact: pct(Math.max(args.homeFatigue, args.awayFatigue)),
      tone: "warning",
    });
  }
  if (Math.abs(args.redSwing) >= 0.1) {
    factors.push({
      label: "Card state is materially reshaping the model",
      impact: pct(Math.abs(args.redSwing) * 100),
      tone: "critical",
    });
  }
  if (args.drawPct >= 28) {
    factors.push({
      label: "Draw band remains active",
      impact: pct(args.drawPct),
      tone: "positive",
    });
  }
  if (args.liveChaos >= 0.33) {
    factors.push({
      label: "Momentum swings are still volatile",
      impact: pct(args.liveChaos * 100),
      tone: "critical",
    });
  }
  if (args.upsetProbabilityPct >= 24) {
    factors.push({
      label: "Upset risk is above baseline",
      impact: pct(args.upsetProbabilityPct),
      tone: "warning",
    });
  }
  return factors.slice(0, 4);
}

function buildTip(
  outcome: MatchAnalysisOutput["prediction"],
  confidence: number,
  over25Pct: number,
  bttsPct: number,
  drawPct: number,
  homePct: number,
  awayPct: number,
  xgHome: number,
  xgAway: number,
  predictedScore: string,
): string {
  const winnerPct =
    outcome === "Home Win"
      ? homePct
      : outcome === "Away Win"
        ? awayPct
        : drawPct;
  if (drawPct >= 30 && confidence < 65) {
    const dcPct = Math.min(
      100,
      homePct > awayPct ? homePct + drawPct : awayPct + drawPct,
    );
    const safeSide =
      homePct > awayPct
        ? `1X (home or draw, ${dcPct}%)`
        : `X2 (draw or away, ${dcPct}%)`;
    return `Draw band is wide (${drawPct}%) — ${safeSide} is the safer double-chance market.`;
  }
  if (over25Pct >= 62 && bttsPct >= 54) {
    return `${outcome} + BTTS — xG spread ${xgHome.toFixed(1)} vs ${xgAway.toFixed(1)} supports goals on both sides. Model line: ${predictedScore}.`;
  }
  if (confidence >= 76) {
    return `${outcome} (${winnerPct}%) is the primary edge — model line ${predictedScore}. Confidence is strong at ${confidence}%.`;
  }
  return `${outcome} is the lean (${winnerPct}%) — model line ${predictedScore}. Monitor lineups and late team news.`;
}

/** Weather impact on xG — bad weather reduces scoring */
function weatherXgModifier(weather: string | null | undefined): number {
  if (!weather) return 0;
  const w = String(weather).toLowerCase();
  if (/heavy rain|downpour|storm|thunder|hail|snow|blizzard/.test(w))
    return -0.18;
  if (/rain|drizzle|shower|wet/.test(w)) return -0.1;
  if (/wind|gust|breezy/.test(w)) return -0.06;
  if (/fog|mist/.test(w)) return -0.04;
  // Extract temperature if present (e.g. "-2°C", "3°")
  const tempMatch = w.match(/(-?\d+)\s*°/);
  if (tempMatch) {
    const temp = Number(tempMatch[1]);
    if (temp <= 0) return -0.12;
    if (temp <= 5) return -0.06;
  }
  if (/cold|freez|frost|icy/.test(w)) return -0.08;
  if (/clear|sunny|warm|bright|fine/.test(w)) return 0.04;
  return 0;
}

/** Season-level possession/shots edge (prematch signal) */
function seasonDominanceEdge(home: TeamContext, away: TeamContext): number {
  let edge = 0;
  // Possession dominance: team that controls the ball creates more chances
  const homePoss = home.possession ?? null;
  const awayPoss = away.possession ?? null;
  if (homePoss != null && awayPoss != null) {
    edge += clamp(((homePoss - awayPoss) / 100) * 0.22, -0.18, 0.18);
  }
  // Shot volume: more shots = more goal opportunities
  const homeSpg = home.shotsPerGame ?? null;
  const awaySpg = away.shotsPerGame ?? null;
  if (homeSpg != null && awaySpg != null) {
    edge += clamp((homeSpg - awaySpg) * 0.02, -0.14, 0.14);
  }
  return clamp(edge, -0.28, 0.28);
}

/** Recent goal-scoring form from last 5 matches (independent of season totals) */
function recentGoalFormEdge(home: TeamContext, away: TeamContext): number {
  const homeScored = home.recentGoalsScored ?? null;
  const homeConceded = home.recentGoalsConceded ?? null;
  const awayScored = away.recentGoalsScored ?? null;
  const awayConceded = away.recentGoalsConceded ?? null;
  if (homeScored == null && awayScored == null) return 0;
  // Attacking form: who is scoring more recently?
  const attackDiff = ((homeScored ?? 5) - (awayScored ?? 5)) * 0.04;
  // Defensive form: who is conceding less?
  const defenseDiff = ((awayConceded ?? 5) - (homeConceded ?? 5)) * 0.03;
  return clamp(attackDiff + defenseDiff, -0.32, 0.32);
}

export function buildGroundedMatchAnalysis(
  rawInput: MatchAnalysisInput,
): MatchAnalysisOutput {
  const input: MatchAnalysisInput = {
    ...rawInput,
    home: contextTeam(rawInput, "home"),
    away: contextTeam(rawInput, "away"),
  };

  const home = asTeamContext(input.home);
  const away = asTeamContext(input.away);
  const statsHome = input.stats?.home || {};
  const statsAway = input.stats?.away || {};
  const events = normalizeEvents(input);
  const homeResults5 = normalizeResultTokens(
    home.recentResults5,
    home.recentForm,
  ).slice(-5);
  const awayResults5 = normalizeResultTokens(
    away.recentResults5,
    away.recentForm,
  ).slice(-5);
  const homeResults10 = normalizeResultTokens(
    home.recentResults10,
    home.recentForm,
  ).slice(-10);
  const awayResults10 = normalizeResultTokens(
    away.recentResults10,
    away.recentForm,
  ).slice(-10);
  const homeFormPoints5 = formPoints(homeResults5);
  const awayFormPoints5 = formPoints(awayResults5);
  const homeFormPoints10 = formPoints(homeResults10);
  const awayFormPoints10 = formPoints(awayResults10);
  const homeWeightedForm = weightedFormScore(homeResults10);
  const awayWeightedForm = weightedFormScore(awayResults10);

  const homeShots = readStat(statsHome, [
    "shotsOnTarget",
    "shots_on_goal",
    "shots_on_target",
    "shots",
    "totalShots",
    "total_shots",
  ]);
  const awayShots = readStat(statsAway, [
    "shotsOnTarget",
    "shots_on_goal",
    "shots_on_target",
    "shots",
    "totalShots",
    "total_shots",
  ]);
  const homePoss = readStat(statsHome, [
    "possession",
    "ball_possession",
    "possessionPct",
  ]);
  const awayPoss = readStat(statsAway, [
    "possession",
    "ball_possession",
    "possessionPct",
  ]);
  const homeDanger = readStat(statsHome, [
    "dangerousAttacks",
    "dangerous_attacks",
    "attacks",
  ]);
  const awayDanger = readStat(statsAway, [
    "dangerousAttacks",
    "dangerous_attacks",
    "attacks",
  ]);
  const homeCorners = readStat(statsHome, [
    "corner_kicks",
    "cornerKicks",
    "corners",
  ]);
  const awayCorners = readStat(statsAway, [
    "corner_kicks",
    "cornerKicks",
    "corners",
  ]);
  const homeRedCards = readStat(statsHome, ["red_cards", "redCards"]);
  const awayRedCards = readStat(statsAway, ["red_cards", "redCards"]);
  const homeYellowCards = readStat(statsHome, [
    "yellow_cards",
    "yellowCards",
    "cards",
  ]);
  const awayYellowCards = readStat(statsAway, [
    "yellow_cards",
    "yellowCards",
    "cards",
  ]);

  const homeScore = Math.max(0, num(input.homeScore) ?? 0);
  const awayScore = Math.max(0, num(input.awayScore) ?? 0);
  const minute = num(input.minute);
  const competition = normalizeCompetition(input);
  const international = Boolean(
    input.isInternational ||
    input.context?.isInternational ||
    /fifa|friendly|nations|euro|world cup|international/i.test(competition),
  );

  const venueEdge = international ? 0.06 : 0.16;
  const formEdge = clamp(
    (homeWeightedForm - awayWeightedForm) * 0.85,
    -0.65,
    0.65,
  );
  const formVolumeEdge = clamp(
    ((homeFormPoints10 - awayFormPoints10) / 30) * 0.45,
    -0.45,
    0.45,
  );
  // Venue-specific form — amplified when one side has extreme home/away splits
  const homeVenueRaw = home.homeFormPts ?? 7.5;
  const awayVenueRaw = away.awayFormPts ?? 7.5;
  const venueSplitStrength =
    Math.abs(homeVenueRaw - 7.5) + Math.abs(awayVenueRaw - 7.5);
  const venueFormMultiplier = venueSplitStrength > 8 ? 0.52 : 0.38;
  const venueFormEdge = clamp(
    ((homeVenueRaw - awayVenueRaw) / 15) * venueFormMultiplier,
    -0.48,
    0.48,
  );
  const goalTrendEdge = clamp(
    ((home.goalsFor ?? 0) -
      (away.goalsFor ?? 0) -
      ((home.goalsAgainst ?? 0) - (away.goalsAgainst ?? 0))) *
      0.04,
    -0.42,
    0.42,
  );
  const xgEdge = clamp(
    ((home.xgFor ?? 1.2) -
      (away.xgFor ?? 1.2) -
      ((home.xgAgainst ?? 1.2) - (away.xgAgainst ?? 1.2))) *
      0.32,
    -0.52,
    0.52,
  );
  const tableEdge = clamp(
    ((away.rank ?? 0) - (home.rank ?? 0)) * 0.02 +
      ((home.points ?? 0) - (away.points ?? 0)) * 0.01 +
      ((home.goalDiff ?? 0) - (away.goalDiff ?? 0)) * 0.008,
    -0.45,
    0.45,
  );
  const scorerEdge = clamp(
    ((home.topScorerGoals ?? 0) - (away.topScorerGoals ?? 0)) * 0.03 +
      ((home.topAssistCount ?? 0) - (away.topAssistCount ?? 0)) * 0.02,
    -0.28,
    0.28,
  );
  const lineupEdge = clamp(
    (((home.lineupStrength ?? 75) - (away.lineupStrength ?? 75)) / 100) * 0.34 +
      ((home.lineupCertainty ?? 0.5) - (away.lineupCertainty ?? 0.5)) * 0.22,
    -0.32,
    0.32,
  );
  // Suspensions have stronger impact than injuries (guaranteed 1+ game miss)
  const homeAbsenceImpact =
    (home.injuries ?? 0) * 0.05 + (home.suspensions ?? 0) * 0.09;
  const awayAbsenceImpact =
    (away.injuries ?? 0) * 0.05 + (away.suspensions ?? 0) * 0.09;
  const availabilityEdge = clamp(
    awayAbsenceImpact - homeAbsenceImpact,
    -0.42,
    0.42,
  );
  const fatigueEdge = clamp(
    (((away.fatigueIndex ?? away.congestionIndex ?? 35) -
      (home.fatigueIndex ?? home.congestionIndex ?? 35)) /
      100) *
      0.24,
    -0.22,
    0.22,
  );
  const pressureEdge = clamp(
    (((home.standingsPressure ?? 50) - (away.standingsPressure ?? 50)) / 100) *
      0.18,
    -0.18,
    0.18,
  );
  const h2h = input.headToHead || input.context?.headToHead;
  const h2hTotal =
    (h2h?.homeWins || 0) + (h2h?.awayWins || 0) + (h2h?.draws || 0);
  const h2hResultEdge =
    h2hTotal > 0
      ? clamp(
          (((h2h!.homeWins || 0) - (h2h!.awayWins || 0)) / h2hTotal) * 0.18,
          -0.18,
          0.18,
        )
      : 0;
  // H2H goals: if one side consistently outscores the other in head-to-head, that matters
  const h2hGoalEdge =
    h2h && h2hTotal > 0 && h2h.goalsHome != null && h2h.goalsAway != null
      ? clamp(((h2h.goalsHome - h2h.goalsAway) / h2hTotal) * 0.08, -0.12, 0.12)
      : 0;
  const h2hEdge = h2hResultEdge + h2hGoalEdge;
  // New: season-level dominance (possession + shots per game)
  const seasonEdge = seasonDominanceEdge(home, away);
  // New: recent goal-scoring form
  const recentGoalEdge = recentGoalFormEdge(home, away);
  // New: weather impact on xG (reduces/increases expected scoring)
  const weatherMod = weatherXgModifier(input.weather);

  const livePossEdge = clamp(
    (((homePoss ?? 50) - (awayPoss ?? 50)) / 100) * 0.26,
    -0.2,
    0.2,
  );
  const liveShotEdge = clamp(
    ((homeShots ?? 0) - (awayShots ?? 0)) * 0.03,
    -0.26,
    0.26,
  );
  const liveDangerEdge = clamp(
    ((homeDanger ?? 0) - (awayDanger ?? 0)) * 0.01,
    -0.22,
    0.22,
  );
  const liveCornerEdge = clamp(
    ((homeCorners ?? 0) - (awayCorners ?? 0)) * 0.018,
    -0.12,
    0.12,
  );
  const redSwing = clamp(
    ((awayRedCards ?? 0) - (homeRedCards ?? 0)) * 0.34,
    -0.68,
    0.68,
  );
  const disciplineSwing = clamp(
    ((awayYellowCards ?? 0) - (homeYellowCards ?? 0)) * 0.014,
    -0.08,
    0.08,
  );
  const scoreEdge = input.isLive
    ? clamp(
        (homeScore - awayScore) * (minute != null && minute >= 65 ? 0.42 : 0.3),
        -1.2,
        1.2,
      )
    : 0;

  let eventSwing = 0;
  let latestMomentumDriver: string | null = null;
  for (const event of events.slice(-12)) {
    const text = eventText(event);
    const teamTag = String(event.team || "").toLowerCase();
    const homeEvent =
      teamTag === "home" ||
      teamTag.includes(String(input.homeTeam).toLowerCase());
    const awayEvent =
      teamTag === "away" ||
      teamTag.includes(String(input.awayTeam).toLowerCase());
    let swing = 0;

    if (/goal|penalty scored|own goal/.test(text)) swing = 0.22;
    else if (/red card|second yellow/.test(text)) swing = 0.26;
    else if (/penalty|big chance|missed penalty/.test(text)) swing = 0.12;
    else if (/substitution|subbed|injury/.test(text)) swing = 0.06;
    else if (/halftime|half time/.test(text)) swing = 0.04;

    if (homeEvent && !awayEvent) {
      eventSwing += swing;
      if (swing >= 0.12)
        latestMomentumDriver = `${input.homeTeam} generated the latest decisive event swing`;
    } else if (awayEvent && !homeEvent) {
      eventSwing -= swing;
      if (swing >= 0.12)
        latestMomentumDriver = `${input.awayTeam} generated the latest decisive event swing`;
    }
  }
  eventSwing = clamp(eventSwing, -0.42, 0.42);

  const baseEdge =
    venueEdge +
    formEdge +
    formVolumeEdge +
    venueFormEdge +
    goalTrendEdge +
    xgEdge +
    tableEdge +
    scorerEdge +
    lineupEdge +
    availabilityEdge +
    fatigueEdge +
    pressureEdge +
    h2hEdge +
    seasonEdge +
    recentGoalEdge;
  const liveEdge =
    livePossEdge +
    liveShotEdge +
    liveDangerEdge +
    liveCornerEdge +
    redSwing +
    disciplineSwing +
    scoreEdge +
    eventSwing;
  const totalEdge = clamp(baseEdge + (input.isLive ? liveEdge : 0), -2.8, 2.8);
  // Calibrated to real football: ~45% home / ~27% draw / ~28% away for even match.
  // Draw decays as edge grows (clear favorites rarely draw).
  const drawStrength = clamp(
    -0.1 -
      Math.abs(totalEdge) * 0.58 -
      (input.isLive ? Math.min(0.35, Math.abs(scoreEdge) * 0.45) : 0),
    -2.0,
    0.15,
  );
  const homeStrength = 0.49 + totalEdge * 0.8;
  const awayStrength = -totalEdge * 0.8 + 0.04;
  const threeWay = softmaxThreeWay(homeStrength, drawStrength, awayStrength);

  // --- xG calibrated to real football averages ---
  // European leagues average: ~1.35 goals home, ~1.05 goals away per game.
  // The base should produce realistic xG even with sparse data, then adjust
  // up/down based on available signals.
  const homeRecentGoalsPerGame =
    home.recentGoalsScored != null ? home.recentGoalsScored / 5 : null;
  const awayRecentGoalsPerGame =
    away.recentGoalsScored != null ? away.recentGoalsScored / 5 : null;
  const homeRecentConcededPerGame =
    home.recentGoalsConceded != null ? home.recentGoalsConceded / 5 : null;
  const awayRecentConcededPerGame =
    away.recentGoalsConceded != null ? away.recentGoalsConceded / 5 : null;
  const h2hAvgHomeGoals =
    h2h && h2hTotal > 0 && h2h.goalsHome != null
      ? h2h.goalsHome / h2hTotal
      : null;
  const h2hAvgAwayGoals =
    h2h && h2hTotal > 0 && h2h.goalsAway != null
      ? h2h.goalsAway / h2hTotal
      : null;
  // Season goals per game (most reliable signal when available)
  const homeSeasonGpg =
    home.goalsFor != null && home.gamesPlayed && home.gamesPlayed >= 3
      ? home.goalsFor / home.gamesPlayed
      : null;
  const awaySeasonGpg =
    away.goalsFor != null && away.gamesPlayed && away.gamesPlayed >= 3
      ? away.goalsFor / away.gamesPlayed
      : null;
  const homeSeasonConcGpg =
    home.goalsAgainst != null && home.gamesPlayed && home.gamesPlayed >= 3
      ? home.goalsAgainst / home.gamesPlayed
      : null;
  const awaySeasonConcGpg =
    away.goalsAgainst != null && away.gamesPlayed && away.gamesPlayed >= 3
      ? away.goalsAgainst / away.gamesPlayed
      : null;

  const expectedHomeXgBase = clamp(
    // Base: league-average home goals
    1.35 +
      // Adjust by totalEdge — favored side gets a bump, underdog gets a drop
      totalEdge * 0.22 +
      // Season goals per game vs league average (strongest signal)
      (homeSeasonGpg != null ? (homeSeasonGpg - 1.35) * 0.45 : 0) +
      // Opponent concedes more/less than average
      (awaySeasonConcGpg != null ? (awaySeasonConcGpg - 1.35) * 0.35 : 0) +
      // Recent 5-match scoring form
      (homeRecentGoalsPerGame != null
        ? (homeRecentGoalsPerGame - 1.3) * 0.25
        : 0) +
      (awayRecentConcededPerGame != null
        ? (awayRecentConcededPerGame - 1.3) * 0.18
        : 0) +
      // xG data if available (replaces base entirely when present)
      (home.xgFor != null ? (home.xgFor - 1.35) * 0.5 : 0) +
      // Home form advantage
      (home.homeFormPts != null ? ((home.homeFormPts - 7.5) / 15) * 0.18 : 0) +
      // Shots per game above average
      (home.shotsPerGame != null ? (home.shotsPerGame - 12) * 0.014 : 0) +
      // Top scorer contribution
      (home.topScorerGoals != null && home.gamesPlayed
        ? Math.min(home.topScorerGoals / Math.max(home.gamesPlayed, 1), 1) *
          0.12
        : 0) +
      // H2H goals in this fixture
      (h2hAvgHomeGoals != null ? (h2hAvgHomeGoals - 1.2) * 0.12 : 0) -
      // Opponent defensive quality
      (away.cleanSheets != null && away.gamesPlayed
        ? (away.cleanSheets / Math.max(away.gamesPlayed, 1)) * 0.3
        : 0) -
      ((home.injuries ?? 0) + (home.suspensions ?? 0)) * 0.06,
    0.35,
    3.5,
  );
  const expectedAwayXgBase = clamp(
    // Base: league-average away goals
    1.05 -
      // Adjust by totalEdge — negative edge means away is favored
      totalEdge * 0.18 +
      // Season goals per game
      (awaySeasonGpg != null ? (awaySeasonGpg - 1.15) * 0.42 : 0) +
      // Opponent concedes
      (homeSeasonConcGpg != null ? (homeSeasonConcGpg - 1.15) * 0.32 : 0) +
      // Recent form
      (awayRecentGoalsPerGame != null
        ? (awayRecentGoalsPerGame - 1.2) * 0.22
        : 0) +
      (homeRecentConcededPerGame != null
        ? (homeRecentConcededPerGame - 1.2) * 0.16
        : 0) +
      // xG data
      (away.xgFor != null ? (away.xgFor - 1.15) * 0.48 : 0) +
      // Away form
      (away.awayFormPts != null ? ((away.awayFormPts - 6) / 15) * 0.16 : 0) +
      // Shots per game
      (away.shotsPerGame != null ? (away.shotsPerGame - 11) * 0.012 : 0) +
      // Top scorer
      (away.topScorerGoals != null && away.gamesPlayed
        ? Math.min(away.topScorerGoals / Math.max(away.gamesPlayed, 1), 1) * 0.1
        : 0) +
      // H2H
      (h2hAvgAwayGoals != null ? (h2hAvgAwayGoals - 1.0) * 0.1 : 0) -
      // Opponent defensive quality
      (home.cleanSheets != null && home.gamesPlayed
        ? (home.cleanSheets / Math.max(home.gamesPlayed, 1)) * 0.26
        : 0) -
      ((away.injuries ?? 0) + (away.suspensions ?? 0)) * 0.06,
    0.3,
    3.2,
  );

  const liveXgHomeBoost = input.isLive
    ? clamp(
        (homeShots ?? 0) * 0.05 +
          (homeDanger ?? 0) * 0.006 +
          ((homePoss ?? 50) - 50) * 0.008 +
          (scoreEdge < 0 ? 0.12 : 0),
        0,
        1.2,
      )
    : 0;
  const liveXgAwayBoost = input.isLive
    ? clamp(
        (awayShots ?? 0) * 0.05 +
          (awayDanger ?? 0) * 0.006 +
          ((awayPoss ?? 50) - 50) * 0.008 +
          (scoreEdge > 0 ? 0.12 : 0),
        0,
        1.2,
      )
    : 0;
  const xgHome = Number(
    clamp(
      expectedHomeXgBase +
        liveXgHomeBoost -
        (homeRedCards ?? 0) * 0.18 +
        weatherMod,
      0.18,
      3.9,
    ).toFixed(2),
  );
  const xgAway = Number(
    clamp(
      expectedAwayXgBase +
        liveXgAwayBoost -
        (awayRedCards ?? 0) * 0.18 +
        weatherMod,
      0.14,
      3.7,
    ).toFixed(2),
  );

  const totalXg = xgHome + xgAway;
  const bothTeamsToScorePct = pct(
    clamp((1 - Math.exp(-xgHome)) * (1 - Math.exp(-xgAway)) * 100, 6, 94),
  );
  const over15Pct = pct(overThresholdProbability(xgHome, xgAway, 1));
  const over25Pct = pct(overThresholdProbability(xgHome, xgAway, 2));
  const over35Pct = pct(overThresholdProbability(xgHome, xgAway, 3));
  const under15Pct = 100 - over15Pct;
  const under25Pct = 100 - over25Pct;
  const under35Pct = 100 - over35Pct;
  const cleanSheetHomePct = pct(cleanSheetProbability(xgAway));
  const cleanSheetAwayPct = pct(cleanSheetProbability(xgHome));
  const expectedGoalShareHomePct = pct((xgHome / Math.max(totalXg, 0.1)) * 100);
  const expectedGoalShareAwayPct = 100 - expectedGoalShareHomePct;
  const firstTeamToScorePct = pct(
    clamp(
      (xgHome / Math.max(totalXg, 0.1)) * 100 +
        (threeWay.homePct - threeWay.awayPct) * 0.18,
      12,
      88,
    ),
  );
  const firstTeamToScore =
    firstTeamToScorePct >= 52
      ? input.homeTeam
      : firstTeamToScorePct <= 48
        ? input.awayTeam
        : "Balanced";
  const scoreDrawRiskPct = pct(
    clamp(
      threeWay.drawPct * 0.72 +
        (100 - Math.abs(expectedGoalShareHomePct - expectedGoalShareAwayPct)) *
          0.22,
      6,
      82,
    ),
  );

  const modelFavoriteGap = Math.abs(baseEdge);
  const isHomeUnderdog = baseEdge < 0;
  const upsetProbabilityPct = pct(
    clamp(
      (isHomeUnderdog ? threeWay.homePct : threeWay.awayPct) *
        (modelFavoriteGap > 0.22 ? 1 : 0.72) +
        (input.isLive ? Math.max(0, Math.abs(scoreEdge) * 24) : 0),
      4,
      78,
    ),
  );

  const outcome = scoreFromProbabilities(
    threeWay.homePct,
    threeWay.drawPct,
    threeWay.awayPct,
  );
  const confidenceSignals = [
    homeResults5.length > 0,
    awayResults5.length > 0,
    home.homeFormPts != null || away.awayFormPts != null,
    home.goalsFor != null || away.goalsFor != null,
    home.xgFor != null || away.xgFor != null,
    Boolean(homeShots != null || awayShots != null),
    Boolean(homePoss != null || awayPoss != null),
    events.length > 0,
    h2h != null,
    home.lineupStrength != null || away.lineupStrength != null,
    home.injuries != null || away.injuries != null,
    home.possession != null || away.possession != null,
    home.shotsPerGame != null || away.shotsPerGame != null,
    home.recentGoalsScored != null || away.recentGoalsScored != null,
    Boolean(input.weather),
  ];
  const dataCoverage =
    confidenceSignals.filter(Boolean).length / confidenceSignals.length;
  const separation =
    Math.max(threeWay.homePct, threeWay.drawPct, threeWay.awayPct) -
    Math.min(threeWay.homePct, threeWay.drawPct, threeWay.awayPct);
  const liveChaos = clamp(
    (input.isLive
      ? Math.abs(eventSwing) * 0.5 +
        Math.abs(redSwing) * 0.35 +
        (minute != null && minute >= 70 && Math.abs(homeScore - awayScore) <= 1
          ? 0.18
          : 0)
      : 0) +
      (scoreDrawRiskPct / 100) * 0.14,
    0,
    1,
  );
  const confidence = pct(
    clamp(
      42 +
        dataCoverage * 32 +
        separation * 0.38 -
        liveChaos * 18 +
        Math.abs(totalEdge) * 9,
      32,
      93,
    ),
  );
  const confidenceLabel = toConfidenceLabel(confidence);
  const riskLevel = riskLevelFromConfidence(confidence, liveChaos);
  const momentumScore = pct(clamp(50 + liveEdge * 28 + scoreEdge * 18, 0, 100));
  const momentum: MatchAnalysisOutput["momentum"] =
    momentumScore >= 56 ? "Home" : momentumScore <= 44 ? "Away" : "Balanced";
  const danger: MatchAnalysisOutput["danger"] =
    expectedGoalShareHomePct >= 56
      ? "Home Attack"
      : expectedGoalShareHomePct <= 44
        ? "Away Attack"
        : "Balanced";
  const edgeScore = pct(
    clamp(
      Math.abs(totalEdge) * 28 +
        Math.abs(xgHome - xgAway) * 14 +
        separation * 0.22,
      0,
      100,
    ),
  );
  const pressureIndex = pct(
    clamp(
      (home.standingsPressure ?? 50) * 0.45 +
        (away.standingsPressure ?? 50) * 0.3 +
        (input.isLive ? (minute ?? 0) * 0.4 : 12),
      0,
      100,
    ),
  );

  const keyFactors = [
    threeWay.homePct > threeWay.awayPct
      ? `${input.homeTeam} rated ${threeWay.homePct}% — stronger across form, xG and venue signals.`
      : threeWay.awayPct > threeWay.homePct
        ? `${input.awayTeam} rated ${threeWay.awayPct}% — leads across form, xG and away-record metrics.`
        : `Balanced split: ${threeWay.homePct}% / ${threeWay.drawPct}% draw / ${threeWay.awayPct}% — signals are closely matched.`,
    home.homeFormPts != null || away.awayFormPts != null
      ? `${input.homeTeam} home form ${Math.round(home.homeFormPts ?? 8)}/15 vs ${input.awayTeam} away form ${Math.round(away.awayFormPts ?? 8)}/15.`
      : `${input.homeTeam} last 5 form ${homeResults5.join("") || "mixed"} vs ${input.awayTeam} ${awayResults5.join("") || "mixed"}.`,
    totalXg > 0
      ? `Projected xG sits at ${xgHome.toFixed(2)} - ${xgAway.toFixed(2)}${weatherMod !== 0 ? ` (weather adjusted ${weatherMod > 0 ? "+" : ""}${weatherMod.toFixed(2)})` : ""}.`
      : "Chance quality is currently driven by limited data.",
    input.isLive && (homeShots != null || awayShots != null)
      ? `Live pressure: shots ${Math.round(homeShots ?? 0)} - ${Math.round(awayShots ?? 0)}, dangerous attacks ${Math.round(homeDanger ?? 0)} - ${Math.round(awayDanger ?? 0)}.`
      : buildH2HSummary(input) ||
        "Historical edge is secondary to current-season profile.",
    (home.injuries ?? 0) +
      (home.suspensions ?? 0) +
      (away.injuries ?? 0) +
      (away.suspensions ?? 0) >
    0
      ? `Availability matters: absences ${input.homeTeam} ${Math.round((home.injuries ?? 0) + (home.suspensions ?? 0))}, ${input.awayTeam} ${Math.round((away.injuries ?? 0) + (away.suspensions ?? 0))}.`
      : `${input.homeTeam} lineup certainty ${pct((home.lineupCertainty ?? 0.55) * 100)}% vs ${input.awayTeam} ${pct((away.lineupCertainty ?? 0.55) * 100)}%.`,
  ]
    .filter(Boolean)
    .slice(0, 5);

  const tacticalNotes = [
    home.formation && away.formation
      ? `Shape battle: ${home.formation} against ${away.formation}.`
      : null,
    expectedGoalShareHomePct >= 56
      ? `${input.homeTeam} should create the higher-value chances if territory holds.`
      : null,
    expectedGoalShareHomePct <= 44
      ? `${input.awayTeam} profile better in transition and chance creation.`
      : null,
    input.isLive && momentum !== "Balanced"
      ? `${momentum === "Home" ? input.homeTeam : input.awayTeam} have the stronger live momentum profile right now.`
      : null,
    Math.abs(redSwing) >= 0.1
      ? "Card state is materially altering spacing and transition risk."
      : null,
    pressureIndex >= 66
      ? "Context pressure is high, so execution and set pieces matter more than usual."
      : null,
    weatherMod <= -0.1
      ? `Weather conditions (${input.weather}) are expected to reduce scoring and favour defensive solidity.`
      : null,
    seasonEdge > 0.12
      ? `${input.homeTeam} dominate possession and shot volume on a season basis.`
      : seasonEdge < -0.12
        ? `${input.awayTeam} dominate possession and shot volume on a season basis.`
        : null,
  ]
    .filter(Boolean)
    .slice(0, 5) as string[];

  const matchPattern = input.isLive
    ? momentum === "Balanced"
      ? "Live game state remains volatile with no fully dominant side."
      : `${momentum === "Home" ? input.homeTeam : input.awayTeam} are dictating the more dangerous live phases.`
    : over25Pct >= 60
      ? "Open game profile with repeat scoring sequences available."
      : scoreDrawRiskPct >= 40
        ? "Low-margin matchup where structure and efficiency decide the edge."
        : `${outcome === "Home Win" ? input.homeTeam : outcome === "Away Win" ? input.awayTeam : "Both sides"} should control the primary match rhythm.`;

  const matchInsight = competition
    ? `${competition} context raises the stakes${pressureIndex >= 64 ? ", with meaningful table pressure in play" : ""}.`
    : null;
  const h2hSummary = buildH2HSummary(input);
  const formHome = homeResults5.length ? homeResults5.join("") : null;
  const formAway = awayResults5.length ? awayResults5.join("") : null;
  const formGuide = {
    homeForm: describeForm(
      input.homeTeam,
      homeResults5,
      home.homeFormPts,
      home.goalsFor,
      home.goalsAgainst,
    ),
    awayForm: describeForm(
      input.awayTeam,
      awayResults5,
      away.awayFormPts,
      away.goalsFor,
      away.goalsAgainst,
    ),
  };
  const tacticalEdge = {
    homeStrengths: [
      home.homeFormPts != null && home.homeFormPts >= 9
        ? `Strong venue form (${Math.round(home.homeFormPts)}/15).`
        : null,
      xgHome > xgAway
        ? `Higher projected chance quality (${xgHome.toFixed(2)} xG).`
        : null,
      expectedGoalShareHomePct >= 56
        ? "Stronger early goal share projection."
        : null,
      home.possession != null &&
      away.possession != null &&
      home.possession > away.possession + 3
        ? `Possession dominance (${Math.round(home.possession)}% avg).`
        : null,
      home.shotsPerGame != null &&
      away.shotsPerGame != null &&
      home.shotsPerGame > away.shotsPerGame + 2
        ? `Higher shot volume (${home.shotsPerGame.toFixed(1)}/game).`
        : null,
    ]
      .filter(Boolean)
      .slice(0, 4) as string[],
    homeWeaknesses: [
      (home.injuries ?? 0) + (home.suspensions ?? 0) >= 2
        ? `Absences reduce lineup stability (${home.injuries ?? 0} injured, ${home.suspensions ?? 0} suspended).`
        : null,
      cleanSheetHomePct <= 38 ? "Clean-sheet ceiling is limited." : null,
      (home.fatigueIndex ?? 0) >= 60 ? "Fatigue load is elevated." : null,
      home.recentGoalsConceded != null && home.recentGoalsConceded >= 8
        ? `Leaking goals recently (${home.recentGoalsConceded} in last 5).`
        : null,
    ]
      .filter(Boolean)
      .slice(0, 3) as string[],
    awayStrengths: [
      away.awayFormPts != null && away.awayFormPts >= 8
        ? `Away form holds up well (${Math.round(away.awayFormPts)}/15).`
        : null,
      xgAway > xgHome
        ? `Higher projected chance quality (${xgAway.toFixed(2)} xG).`
        : null,
      expectedGoalShareHomePct <= 44
        ? "Transition threat is strong enough to flip the game state."
        : null,
      away.possession != null &&
      home.possession != null &&
      away.possession > home.possession + 3
        ? `Possession dominance (${Math.round(away.possession)}% avg).`
        : null,
      away.shotsPerGame != null &&
      home.shotsPerGame != null &&
      away.shotsPerGame > home.shotsPerGame + 2
        ? `Higher shot volume (${away.shotsPerGame.toFixed(1)}/game).`
        : null,
    ]
      .filter(Boolean)
      .slice(0, 4) as string[],
    awayWeaknesses: [
      (away.injuries ?? 0) + (away.suspensions ?? 0) >= 2
        ? `Absences reduce lineup stability (${away.injuries ?? 0} injured, ${away.suspensions ?? 0} suspended).`
        : null,
      cleanSheetAwayPct <= 38 ? "Clean-sheet ceiling is limited." : null,
      (away.fatigueIndex ?? 0) >= 60 ? "Fatigue load is elevated." : null,
      away.recentGoalsConceded != null && away.recentGoalsConceded >= 8
        ? `Leaking goals recently (${away.recentGoalsConceded} in last 5).`
        : null,
    ]
      .filter(Boolean)
      .slice(0, 3) as string[],
  };

  const attackingStrength = {
    home: pct(
      clamp(
        xgHome * 28 + (homeShots ?? 0) * 2.8 + (homeDanger ?? 0) * 0.36,
        18,
        96,
      ),
    ),
    away: pct(
      clamp(
        xgAway * 28 + (awayShots ?? 0) * 2.8 + (awayDanger ?? 0) * 0.36,
        18,
        96,
      ),
    ),
  };
  const defensiveStrength = {
    home: pct(
      clamp(
        cleanSheetHomePct +
          (home.cleanSheets ?? 0) * 3 -
          (home.injuries ?? 0) * 5,
        14,
        94,
      ),
    ),
    away: pct(
      clamp(
        cleanSheetAwayPct +
          (away.cleanSheets ?? 0) * 3 -
          (away.injuries ?? 0) * 5,
        14,
        94,
      ),
    ),
  };

  const nextGoalProbability =
    input.isLive && minute != null && minute < 90
      ? pct(clamp((totalXg / Math.max(1, minute)) * 18 * 100, 6, 89))
      : null;
  const predictedScore = scorelineFromXg(
    xgHome,
    xgAway,
    homeScore,
    awayScore,
    threeWay.homePct,
    threeWay.drawPct,
    threeWay.awayPct,
  );
  const confidenceReason = (() => {
    const winner =
      outcome === "Home Win"
        ? input.homeTeam
        : outcome === "Away Win"
          ? input.awayTeam
          : "Draw";
    const winnerPct =
      outcome === "Home Win"
        ? threeWay.homePct
        : outcome === "Away Win"
          ? threeWay.awayPct
          : threeWay.drawPct;
    const covered = confidenceSignals.filter(Boolean).length;
    if (confidence >= 78)
      return `${winner} (${winnerPct}%) — ${covered}/15 signals active, clear edge separation confirms the model.`;
    if (confidence >= 60)
      return `${winner} (${winnerPct}%) — edge is consistent across ${covered}/15 signals but volatility remains.`;
    return `${winner} (${winnerPct}%) — partial coverage (${covered}/15 signals), confidence stays conservative.`;
  })();
  const riskFactors = inferRiskFactors({
    homeInjuries: (home.injuries ?? 0) + (home.suspensions ?? 0),
    awayInjuries: (away.injuries ?? 0) + (away.suspensions ?? 0),
    homeFatigue: home.fatigueIndex ?? home.congestionIndex ?? 35,
    awayFatigue: away.fatigueIndex ?? away.congestionIndex ?? 35,
    liveChaos,
    redSwing,
    drawPct: threeWay.drawPct,
    upsetProbabilityPct,
  });
  const playerImpact = [
    home.topScorer
      ? {
          team: input.homeTeam,
          note: `${home.topScorer} is the main scoring reference.`,
          impact: pct((home.topScorerGoals ?? 1) * 7),
        }
      : null,
    away.topScorer
      ? {
          team: input.awayTeam,
          note: `${away.topScorer} is the main scoring reference.`,
          impact: pct((away.topScorerGoals ?? 1) * 7),
        }
      : null,
    home.topAssist || away.topAssist
      ? {
          team: home.topAssist ? input.homeTeam : input.awayTeam,
          note: `${home.topAssist || away.topAssist} can shift creation volume from wide and half-spaces.`,
          impact: pct(
            ((home.topAssistCount ?? 0) + (away.topAssistCount ?? 0)) * 8,
          ),
        }
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as { team: string; note: string; impact: number }[];
  const summary = buildSummary({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    outcome,
    confidence,
    drivingSignals: keyFactors,
    isLive: Boolean(input.isLive),
    scoreline: `${homeScore}-${awayScore}`,
    minute,
    liveDriver: latestMomentumDriver,
    predictedScore,
  });
  const liveShiftSummary = buildLiveShiftSummary({
    input,
    momentum,
    momentumDriver:
      latestMomentumDriver ||
      (momentum === "Balanced"
        ? "neither team has fully controlled the latest phase"
        : `${momentum === "Home" ? input.homeTeam : input.awayTeam} are winning territory and event pressure`),
  });
  const postMatchSummary = buildPostMatchSummary(input, predictedScore);
  const tip = buildTip(
    outcome,
    confidence,
    over25Pct,
    bothTeamsToScorePct,
    threeWay.drawPct,
    threeWay.homePct,
    threeWay.awayPct,
    xgHome,
    xgAway,
    predictedScore,
  );
  const insufficientData = dataCoverage <= 0.28;

  return {
    favored_side: favoredSide(outcome),
    confidence_score: confidence,
    confidence_label: confidenceLabel,
    prediction: outcome,
    confidence,
    summary,
    live_shift_summary: liveShiftSummary,
    post_match_summary: postMatchSummary,
    matchPattern,
    likely_pattern: matchPattern,
    confidenceReason,
    key_factors: keyFactors,
    keyFactors,
    tacticalNotes,
    matchInsight,
    h2hSummary,
    formHome,
    formAway,
    formGuide,
    tacticalEdge,
    homePct: threeWay.homePct,
    drawPct: threeWay.drawPct,
    awayPct: threeWay.awayPct,
    doubleChanceHomePct: clamp(threeWay.homePct + threeWay.drawPct, 0, 100),
    doubleChanceAwayPct: clamp(threeWay.awayPct + threeWay.drawPct, 0, 100),
    bothTeamsToScorePct,
    cleanSheetHomePct,
    cleanSheetAwayPct,
    over15Pct,
    under15Pct,
    over25Pct,
    under25Pct,
    over35Pct,
    under35Pct,
    xgHome,
    xgAway,
    expectedGoalShareHomePct,
    expectedGoalShareAwayPct,
    firstTeamToScore,
    firstTeamToScorePct,
    scoreDrawRiskPct,
    upsetProbabilityPct,
    edgeScore,
    pressureIndex,
    momentum,
    momentumScore,
    danger,
    riskLevel,
    riskFactors,
    playerImpact,
    attackingStrength,
    defensiveStrength,
    nextGoalProbability,
    predictedScore,
    tip,
    insufficientData,
    source: "nexora-match-intelligence",
    updatedAt: new Date().toISOString(),
  };
}
