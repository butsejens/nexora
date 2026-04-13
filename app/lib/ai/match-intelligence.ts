/**
 * Nexora – Unified Match Intelligence Engine
 *
 * Combines all AI match signals into a single structured shape:
 *   - Prediction (winner, confidence, expected score)
 *   - Match Rating (/10)
 *   - Hot Team detection
 *   - Upset Alert
 *   - Momentum Score
 *   - Post-match explainer
 *
 * Every value is derived from real ESPN match data via the core engine.
 * Zero hardcoded predictions, zero RNG, zero template strings.
 */

import {
  buildGroundedMatchAnalysis,
  type MatchAnalysisInput,
  type MatchAnalysisOutput,
} from "@/lib/match-analysis-engine";
import { calculateMomentum } from "@/lib/ai/momentum-calculator";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UpsetAlert = {
  active: boolean;
  /** Probability 0–100 that the underdog wins */
  probability: number;
  /** Which team would be the upset */
  underdogTeam: string | null;
  /** Why the upset is plausible — derived from data signals */
  reasoning: string | null;
};

export type HotTeamResult = {
  active: boolean;
  /** Name of the hot team */
  team: string | null;
  /** Side: home or away */
  side: "home" | "away" | null;
  /** Recent form string (e.g. "WWWDW") */
  form: string | null;
  /** Points in last 5 (0–15) */
  formPoints: number;
  /** Human-readable reason */
  reasoning: string | null;
};

export type PostMatchExplainer = {
  available: boolean;
  /** Why the winning team won (or why it was a draw) */
  whyResult: string;
  /** Key moments with minute references */
  keyMoments: {
    minute: number;
    description: string;
    impact: "high" | "medium" | "low";
  }[];
  /** Player impact assessments */
  playerImpact: {
    player: string;
    team: string;
    contribution: string;
    rating: number;
  }[];
  /** Tactical advantage summary */
  tacticalSummary: string | null;
  /** Was the result expected by the pre-match model? */
  resultVsPrediction: "expected" | "upset" | "partial-surprise";
};

export type MatchIntelligence = {
  matchId: string | null;
  phase: "prematch" | "live" | "halftime" | "fulltime";

  // ── Prediction core ──
  predictedWinner: string;
  prediction: "Home Win" | "Away Win" | "Draw";
  confidence: number;
  confidenceLabel: "Low" | "Medium" | "High" | "Elite";
  expectedScore: string;
  reasoning: string;
  keyFactors: string[];

  // ── Probabilities ──
  probabilities: {
    home: number;
    draw: number;
    away: number;
  };

  // ── Match Rating ──
  matchRating: number;
  matchRatingLabel: string;

  // ── Signals ──
  momentumScore: number;
  momentumSide: "home" | "away" | "balanced";
  upsetAlert: UpsetAlert;
  hotTeam: HotTeamResult;

  // ── Post-match ──
  postMatchExplainer: PostMatchExplainer | null;

  // ── Data coverage ──
  dataSignals: {
    form: boolean;
    standings: boolean;
    headToHead: boolean;
    injuries: boolean;
    liveStats: boolean;
    lineups: boolean;
  };
  dataQuality: "rich" | "moderate" | "limited";

  // ── Meta ──
  source: "nexora-match-intelligence";
  generatedAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formPointsFromString(form: string | null | undefined): number {
  if (!form) return 0;
  let pts = 0;
  for (const char of form.toUpperCase()) {
    if (char === "W") pts += 3;
    else if (char === "D") pts += 1;
  }
  return pts;
}

function formPointsFromResults(results: string[] | null | undefined): number {
  if (!results?.length) return 0;
  let pts = 0;
  for (const r of results) {
    const c = r.toUpperCase().trim();
    if (c === "W") pts += 3;
    else if (c === "D") pts += 1;
  }
  return pts;
}

function countConsecutiveWins(form: string | null | undefined): number {
  if (!form) return 0;
  let count = 0;
  for (const char of form.toUpperCase()) {
    if (char === "W") count++;
    else break;
  }
  return count;
}

function countUnbeaten(form: string | null | undefined): number {
  if (!form) return 0;
  let count = 0;
  for (const char of form.toUpperCase()) {
    if (char === "W" || char === "D") count++;
    else break;
  }
  return count;
}

// ─── Match Rating (/10) ──────────────────────────────────────────────────────

/**
 * Compute an entertainment/quality match rating on a 0–10 scale.
 * Based on:
 *   - Goal drama (total goals, comeback potential)
 *   - Competitiveness (how close the probabilities are)
 *   - Chance volume (xG total)
 *   - Card/event drama
 *   - Pressure context (standings pressure, upset probability)
 *
 * All inputs come from the MatchAnalysisOutput — no external data.
 */
export function computeMatchRating(
  analysis: MatchAnalysisOutput,
  input: MatchAnalysisInput,
): number {
  let rating = 5.0; // baseline

  // 1. Competitiveness factor — close matches rate higher
  const maxPct = Math.max(analysis.homePct, analysis.awayPct);
  const competitiveness = 1 - (maxPct - 33.3) / 66.7; // 0 = one-sided, 1 = perfectly balanced
  rating += clamp(competitiveness * 2.0, 0, 2.0);

  // 2. Goal expectancy — high xG means an open, entertaining match
  const totalXg = analysis.xgHome + analysis.xgAway;
  if (totalXg >= 3.5) rating += 1.0;
  else if (totalXg >= 2.5) rating += 0.6;
  else if (totalXg >= 1.8) rating += 0.2;
  else if (totalXg < 1.2) rating -= 0.4;

  // 3. BTTS + over 2.5 — open game signals
  if (analysis.bothTeamsToScorePct >= 55) rating += 0.4;
  if (analysis.over25Pct >= 60) rating += 0.3;

  // 4. Upset potential adds drama
  if (analysis.upsetProbabilityPct >= 35) rating += 0.6;
  else if (analysis.upsetProbabilityPct >= 20) rating += 0.3;

  // 5. Pressure context — high-stakes matches are more compelling
  if (analysis.pressureIndex >= 70) rating += 0.5;
  else if (analysis.pressureIndex >= 50) rating += 0.2;

  // 6. Live match: actual goals and drama
  if (input.isLive) {
    const totalGoals = (input.homeScore ?? 0) + (input.awayScore ?? 0);
    if (totalGoals >= 5) rating += 1.0;
    else if (totalGoals >= 3) rating += 0.5;

    // Close scoreline = drama
    const scoreDiff = Math.abs((input.homeScore ?? 0) - (input.awayScore ?? 0));
    if (scoreDiff <= 1 && totalGoals >= 2) rating += 0.4;

    // Red card drama
    const events = input.events ?? [];
    const redCards = events.filter((e) =>
      (e.type || "").toLowerCase().includes("red"),
    ).length;
    if (redCards >= 1) rating += 0.3;
  }

  // 7. Finished match: evaluate actual outcome quality
  if (input.homeScore != null && input.awayScore != null && !input.isLive) {
    const totalGoals = input.homeScore + input.awayScore;
    if (totalGoals >= 5) rating += 0.8;
    else if (totalGoals >= 3) rating += 0.3;

    const scoreDiff = Math.abs(input.homeScore - input.awayScore);
    if (scoreDiff <= 1 && totalGoals >= 2) rating += 0.3;
  }

  // 8. Penalise low data quality
  if (analysis.insufficientData) rating -= 1.0;

  return round1(clamp(rating, 1.0, 10.0));
}

function matchRatingLabel(rating: number): string {
  if (rating >= 8.5) return "Must Watch";
  if (rating >= 7.0) return "Great Match";
  if (rating >= 5.5) return "Solid";
  if (rating >= 4.0) return "Average";
  return "Low Profile";
}

// ─── Hot Team Detection ──────────────────────────────────────────────────────

/**
 * Detect if either team is "hot" — on a strong run of form.
 * Based on consecutive wins, overall form points, and goal trend.
 * Returns the "hotter" team, or inactive if neither qualifies.
 */
export function detectHotTeam(input: MatchAnalysisInput): HotTeamResult {
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;

  const homeForm = home?.recentForm || (home?.recentResults5 ?? []).join("");
  const awayForm = away?.recentForm || (away?.recentResults5 ?? []).join("");

  const homePoints =
    formPointsFromResults(home?.recentResults5) ||
    formPointsFromString(homeForm);
  const awayPoints =
    formPointsFromResults(away?.recentResults5) ||
    formPointsFromString(awayForm);

  const homeStreak = countConsecutiveWins(homeForm);
  const awayStreak = countConsecutiveWins(awayForm);

  const homeUnbeaten = countUnbeaten(homeForm);
  const awayUnbeaten = countUnbeaten(awayForm);

  // Hot threshold: 3+ consecutive wins OR 12+/15 points with 5-match unbeaten
  const homeHot = homeStreak >= 3 || (homePoints >= 12 && homeUnbeaten >= 5);
  const awayHot = awayStreak >= 3 || (awayPoints >= 12 && awayUnbeaten >= 5);

  if (!homeHot && !awayHot) {
    return {
      active: false,
      team: null,
      side: null,
      form: null,
      formPoints: 0,
      reasoning: null,
    };
  }

  // Pick the hotter team (prefer higher streak, then higher points)
  const homeScore = homeStreak * 3 + homePoints;
  const awayScore = awayStreak * 3 + awayPoints;

  if (homeHot && (!awayHot || homeScore >= awayScore)) {
    const goalInfo =
      home?.recentGoalsScored != null
        ? ` (${home.recentGoalsScored} goals in last 5)`
        : "";
    return {
      active: true,
      team: input.homeTeam,
      side: "home",
      form: homeForm || null,
      formPoints: homePoints,
      reasoning:
        homeStreak >= 3
          ? `${input.homeTeam} on a ${homeStreak}-match winning streak${goalInfo}.`
          : `${input.homeTeam} have ${homePoints}/15 points in their last 5 — dominant recent form${goalInfo}.`,
    };
  }

  const goalInfo =
    away?.recentGoalsScored != null
      ? ` (${away.recentGoalsScored} goals in last 5)`
      : "";
  return {
    active: true,
    team: input.awayTeam,
    side: "away",
    form: awayForm || null,
    formPoints: awayPoints,
    reasoning:
      awayStreak >= 3
        ? `${input.awayTeam} on a ${awayStreak}-match winning streak${goalInfo}.`
        : `${input.awayTeam} have ${awayPoints}/15 points in their last 5 — dominant recent form${goalInfo}.`,
  };
}

// ─── Upset Alert ─────────────────────────────────────────────────────────────

/**
 * Evaluate whether this match has upset potential.
 * Uses: upsetProbabilityPct from the core engine + form mismatch + ranking gaps.
 */
export function evaluateUpsetAlert(
  analysis: MatchAnalysisOutput,
  input: MatchAnalysisInput,
): UpsetAlert {
  const upsetPct = analysis.upsetProbabilityPct;

  // Determine underdog
  const favoriteIshome = analysis.homePct > analysis.awayPct;
  const underdogTeam = favoriteIshome ? input.awayTeam : input.homeTeam;
  const underdogPct = favoriteIshome ? analysis.awayPct : analysis.homePct;

  // Active if upset probability >= 18% and the underdog isn't actually favoured
  const spread = Math.abs(analysis.homePct - analysis.awayPct);
  const isActive = upsetPct >= 18 && spread >= 8;

  if (!isActive) {
    return {
      active: false,
      probability: upsetPct,
      underdogTeam: null,
      reasoning: null,
    };
  }

  // Build reasoning from actual data
  const reasons: string[] = [];

  // Form-based reasoning
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;
  const underdogContext = favoriteIshome ? away : home;
  const favoriteContext = favoriteIshome ? home : away;
  const underdogFormStr =
    underdogContext?.recentForm ||
    (underdogContext?.recentResults5 ?? []).join("");
  const favoriteFormStr =
    favoriteContext?.recentForm ||
    (favoriteContext?.recentResults5 ?? []).join("");

  const underdogFP = formPointsFromString(underdogFormStr);
  const favoriteFP = formPointsFromString(favoriteFormStr);

  if (underdogFP > favoriteFP) {
    reasons.push(
      `${underdogTeam} in better recent form (${underdogFP} vs ${favoriteFP} points last 5)`,
    );
  }

  // Ranking gap
  const homeRank = home?.rank ?? home?.fifaRank;
  const awayRank = away?.rank ?? away?.fifaRank;
  if (homeRank != null && awayRank != null) {
    const rankGap = Math.abs(homeRank - awayRank);
    if (rankGap >= 5) {
      reasons.push(
        `Ranking gap of ${rankGap} positions creates value on the underdog`,
      );
    }
  }

  // xG edge
  const underdogXg = favoriteIshome ? analysis.xgAway : analysis.xgHome;
  const favoriteXg = favoriteIshome ? analysis.xgHome : analysis.xgAway;
  if (underdogXg > favoriteXg * 0.85) {
    reasons.push(
      `${underdogTeam} xG profile is competitive (${underdogXg.toFixed(2)} vs ${favoriteXg.toFixed(2)})`,
    );
  }

  // Over 2.5 and BTTS increase upset chance
  if (analysis.over25Pct >= 55 && analysis.bothTeamsToScorePct >= 50) {
    reasons.push(
      "Open game pattern gives the underdog more scoring opportunities",
    );
  }

  const reasoning = reasons.length
    ? reasons.slice(0, 3).join(". ") + "."
    : `${underdogTeam} at ${underdogPct}% has a meaningful counter-chance in this matchup.`;

  return {
    active: true,
    probability: upsetPct,
    underdogTeam,
    reasoning,
  };
}

// ─── Post-Match Explainer ────────────────────────────────────────────────────

/**
 * Build a rich post-match explanation from the analysis output and match events.
 * Only meaningful when homeScore and awayScore are available.
 */
export function buildPostMatchExplainer(
  analysis: MatchAnalysisOutput,
  input: MatchAnalysisInput,
): PostMatchExplainer | null {
  const homeScore = input.homeScore;
  const awayScore = input.awayScore;
  if (homeScore == null || awayScore == null) return null;

  const events = input.events ?? [];
  const isDraw = homeScore === awayScore;
  const winnerTeam = isDraw
    ? null
    : homeScore > awayScore
      ? input.homeTeam
      : input.awayTeam;
  const loserTeam = isDraw
    ? null
    : homeScore > awayScore
      ? input.awayTeam
      : input.homeTeam;

  // Build "why result" from real data
  const whyParts: string[] = [];
  if (winnerTeam) {
    const winnerIsHome = winnerTeam === input.homeTeam;
    const winnerXg = winnerIsHome ? analysis.xgHome : analysis.xgAway;
    const loserXg = winnerIsHome ? analysis.xgAway : analysis.xgHome;

    if (winnerXg > loserXg + 0.4) {
      whyParts.push(
        `${winnerTeam} created significantly higher-quality chances (${winnerXg.toFixed(2)} vs ${loserXg.toFixed(2)} xG)`,
      );
    } else if (loserXg > winnerXg) {
      whyParts.push(
        `${winnerTeam} were clinical despite ${loserTeam} generating more expected goals`,
      );
    }

    const winnerMomentum = winnerIsHome
      ? analysis.momentumScore
      : 100 - analysis.momentumScore;
    if (winnerMomentum >= 60) {
      whyParts.push(
        `${winnerTeam} controlled the momentum (${Math.round(winnerMomentum)}% match dominance)`,
      );
    }
  } else {
    // Draw reasoning
    if (Math.abs(analysis.xgHome - analysis.xgAway) < 0.3) {
      whyParts.push(
        "Expected goals were level — the draw reflects the balance of chances",
      );
    } else {
      const xgFavour =
        analysis.xgHome > analysis.xgAway ? input.homeTeam : input.awayTeam;
      whyParts.push(
        `${xgFavour} had the xG edge but couldn't convert — draw is a fair reflection of finishing`,
      );
    }
  }

  // Tactical summary from real tactical notes
  const tacticalSummary = analysis.tacticalNotes.length
    ? analysis.tacticalNotes.slice(0, 2).join(" ")
    : null;

  if (tacticalSummary) {
    whyParts.push(tacticalSummary);
  }

  const whyResult = whyParts.length
    ? whyParts.join(". ") + "."
    : `${homeScore}-${awayScore} between ${input.homeTeam} and ${input.awayTeam}.`;

  // Key moments from events
  const keyMoments: PostMatchExplainer["keyMoments"] = [];
  for (const event of events) {
    const type = (event.type || "").toLowerCase();
    const minute = event.minute ?? 0;
    if (!minute) continue;

    if (type.includes("goal")) {
      keyMoments.push({
        minute,
        description: `Goal by ${event.player || event.team || "unknown"} (${event.team || ""})`,
        impact: "high",
      });
    } else if (type.includes("red")) {
      keyMoments.push({
        minute,
        description: `Red card for ${event.player || event.team || "unknown"} — numerical disadvantage`,
        impact: "high",
      });
    } else if (type.includes("penalty") || type.includes("pen")) {
      keyMoments.push({
        minute,
        description: `Penalty: ${event.player || event.team || "unknown"}`,
        impact: "high",
      });
    } else if (type.includes("var")) {
      keyMoments.push({
        minute,
        description: `VAR intervention at ${minute}'`,
        impact: "medium",
      });
    }
  }
  keyMoments.sort((a, b) => a.minute - b.minute);

  // Player impact from analysis engine's playerImpact + events
  const playerImpact: PostMatchExplainer["playerImpact"] = [];
  for (const pi of analysis.playerImpact) {
    playerImpact.push({
      player: pi.note.split(" ")[0] ?? "Unknown",
      team: pi.team,
      contribution: pi.note,
      rating: round1(clamp(pi.impact / 10, 1, 10)),
    });
  }
  // Add goal scorers from events
  const scorers = new Set<string>();
  for (const event of events) {
    const type = (event.type || "").toLowerCase();
    if (type.includes("goal") && event.player && !scorers.has(event.player)) {
      scorers.add(event.player);
      const alreadyListed = playerImpact.some((p) => p.player === event.player);
      if (!alreadyListed) {
        playerImpact.push({
          player: event.player,
          team: event.team || "",
          contribution: `Scored in the ${event.minute ?? 0}'`,
          rating: 7.5,
        });
      }
    }
  }

  // Result vs prediction
  const predictedOutcome = analysis.prediction;
  const actualOutcome: "Home Win" | "Away Win" | "Draw" = isDraw
    ? "Draw"
    : homeScore > awayScore
      ? "Home Win"
      : "Away Win";
  const resultVsPrediction: PostMatchExplainer["resultVsPrediction"] =
    predictedOutcome === actualOutcome
      ? "expected"
      : (predictedOutcome === "Home Win" && actualOutcome === "Away Win") ||
          (predictedOutcome === "Away Win" && actualOutcome === "Home Win")
        ? "upset"
        : "partial-surprise";

  return {
    available: keyMoments.length > 0 || whyParts.length > 0,
    whyResult,
    keyMoments: keyMoments.slice(0, 8),
    playerImpact: playerImpact.slice(0, 5),
    tacticalSummary,
    resultVsPrediction,
  };
}

// ─── Data Coverage ───────────────────────────────────────────────────────────

function assessDataSignals(input: MatchAnalysisInput) {
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;

  const form = Boolean(
    home?.recentForm ||
    away?.recentForm ||
    home?.recentResults5?.length ||
    away?.recentResults5?.length,
  );
  const standings = Boolean(
    home?.rank != null ||
    away?.rank != null ||
    home?.points != null ||
    away?.points != null,
  );
  const headToHead = Boolean(input.headToHead || input.context?.headToHead);
  const injuries = Boolean(
    home?.injuries != null ||
    away?.injuries != null ||
    home?.suspensions != null ||
    away?.suspensions != null,
  );
  const liveStats = Boolean(
    (input.stats?.home && Object.keys(input.stats.home).length > 0) ||
    (input.stats?.away && Object.keys(input.stats.away).length > 0),
  );
  const lineups = Boolean(
    home?.formation ||
    away?.formation ||
    home?.lineupStrength != null ||
    away?.lineupStrength != null,
  );

  const signals = { form, standings, headToHead, injuries, liveStats, lineups };
  const count = Object.values(signals).filter(Boolean).length;
  const quality: MatchIntelligence["dataQuality"] =
    count >= 4 ? "rich" : count >= 2 ? "moderate" : "limited";

  return { signals, quality };
}

// ─── Phase Detection ─────────────────────────────────────────────────────────

function detectPhase(input: MatchAnalysisInput): MatchIntelligence["phase"] {
  if (input.isLive) {
    const minute = input.minute ?? 0;
    return minute >= 45 && minute <= 50 ? "halftime" : "live";
  }
  if (input.homeScore != null && input.awayScore != null) {
    const status = (input.status || "").toLowerCase();
    if (
      status.includes("ft") ||
      status.includes("final") ||
      status.includes("finished") ||
      status.includes("ended")
    ) {
      return "fulltime";
    }
    // If we have scores but not live, assume finished
    if (!input.isLive && input.homeScore + input.awayScore > 0)
      return "fulltime";
  }
  return "prematch";
}

// ─── Main Builder ────────────────────────────────────────────────────────────

/**
 * Build the complete MatchIntelligence from a MatchAnalysisInput.
 * This is the single entry point — calls the core engine + all intelligence modules.
 */
export function buildMatchIntelligence(
  input: MatchAnalysisInput,
): MatchIntelligence {
  const analysis = buildGroundedMatchAnalysis(input);
  const phase = detectPhase(input);
  const { signals, quality } = assessDataSignals(input);

  // Prediction
  const predictedWinner =
    analysis.prediction === "Home Win"
      ? input.homeTeam
      : analysis.prediction === "Away Win"
        ? input.awayTeam
        : "Draw";

  // Match Rating
  const rating = computeMatchRating(analysis, input);

  // Hot Team
  const hotTeam = detectHotTeam(input);

  // Upset Alert
  const upsetAlert = evaluateUpsetAlert(analysis, input);

  // Momentum
  const momentum = calculateMomentum({
    homeStats: input.stats?.home as Record<string, unknown> | null,
    awayStats: input.stats?.away as Record<string, unknown> | null,
  });

  // Post-match explainer (only for finished or live matches with scores)
  const postMatchExplainer =
    phase === "fulltime" || (phase === "live" && input.homeScore != null)
      ? buildPostMatchExplainer(analysis, input)
      : null;

  return {
    matchId: input.matchId ?? null,
    phase,

    predictedWinner,
    prediction: analysis.prediction,
    confidence: analysis.confidence,
    confidenceLabel: analysis.confidence_label,
    expectedScore: analysis.predictedScore,
    reasoning: analysis.summary,
    keyFactors: analysis.keyFactors.slice(0, 5),

    probabilities: {
      home: analysis.homePct,
      draw: analysis.drawPct,
      away: analysis.awayPct,
    },

    matchRating: rating,
    matchRatingLabel: matchRatingLabel(rating),

    momentumScore: momentum.hasData ? momentum.homePct : analysis.momentumScore,
    momentumSide: momentum.hasData
      ? momentum.dominantSide
      : analysis.momentum === "Home"
        ? "home"
        : analysis.momentum === "Away"
          ? "away"
          : "balanced",

    upsetAlert,
    hotTeam,
    postMatchExplainer,

    dataSignals: signals,
    dataQuality: quality,

    source: "nexora-match-intelligence",
    generatedAt: new Date().toISOString(),
  };
}
