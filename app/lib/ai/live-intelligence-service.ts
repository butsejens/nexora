/**
 * Nexora – Live Intelligence Service
 *
 * Stateless functions for computing live match intelligence:
 *   - Win probability distribution over time
 *   - Momentum trend direction
 *   - Live match state classification
 *   - Event impact scoring
 *
 * All functions are pure — no side effects, no caching, no polling.
 * The hook layer (useLiveMatchIntelligence) handles state & timing.
 */

import type { MatchAnalysisOutput } from "@/lib/match-analysis-engine";

export type MomentumSnapshot = {
  minute: number | null;
  homePct: number;
  drawPct: number;
  awayPct: number;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type WinProbabilitySnapshot = {
  minute: number | null;
  home: number;
  draw: number;
  away: number;
};

export type MomentumTrend = {
  direction: "rising" | "falling" | "stable";
  side: "home" | "away" | "balanced";
  /** Magnitude of shift in last 3 snapshots (0–100) */
  shiftMagnitude: number;
  /** Human-readable trend description */
  description: string;
};

export type LiveMatchPhase =
  | "early" // 0–15'
  | "settled" // 15–35'
  | "pre-half" // 35–45'
  | "halftime" // 45–50'
  | "second-half-start" // 50–60'
  | "mid-second" // 60–75'
  | "closing" // 75–85'
  | "injury-time" // 85–90+
  | "extra-time"; // 90+

export type EventImpactScore = {
  event: string;
  impactOnHome: number; // -50 to +50
  impactOnAway: number; // -50 to +50
  isPivotal: boolean;
};

// ─── Win Probability ──────────────────────────────────────────────────────────

/**
 * Build a win probability snapshot from the analysis output.
 * Used to track how probabilities shift throughout the match.
 */
export function buildWinProbabilitySnapshot(
  analysis: MatchAnalysisOutput,
  minute: number | null,
): WinProbabilitySnapshot {
  return {
    minute,
    home: analysis.homePct,
    draw: analysis.drawPct,
    away: analysis.awayPct,
  };
}

/**
 * Compute the current win probability label.
 * Returns the team name or "Draw" based on highest probability.
 */
export function getWinProbabilityLabel(
  homeTeam: string,
  awayTeam: string,
  homePct: number,
  drawPct: number,
  awayPct: number,
): string {
  if (drawPct >= homePct && drawPct >= awayPct) return "Draw";
  if (homePct >= awayPct) return homeTeam;
  return awayTeam;
}

// ─── Momentum Trend ──────────────────────────────────────────────────────────

/**
 * Compute momentum trend from the last N snapshots.
 * Detects whether home or away is gaining control.
 */
export function computeMomentumTrend(
  history: MomentumSnapshot[],
  homeTeam: string,
  awayTeam: string,
): MomentumTrend {
  if (history.length < 2) {
    return {
      direction: "stable",
      side: "balanced",
      shiftMagnitude: 0,
      description: "Insufficient data to determine momentum trend.",
    };
  }

  // Compare recent vs earlier
  const recent = history.slice(-3);
  const earlierSlice = history.slice(0, Math.max(1, history.length - 3));
  const recentAvg =
    recent.reduce((sum, s) => sum + s.homePct, 0) / recent.length;
  const earlierAvg =
    earlierSlice.reduce((sum, s) => sum + s.homePct, 0) / earlierSlice.length;

  const shift = recentAvg - earlierAvg;
  const magnitude = Math.min(100, Math.abs(Math.round(shift * 2)));

  if (Math.abs(shift) < 3) {
    return {
      direction: "stable",
      side: recentAvg > 55 ? "home" : recentAvg < 45 ? "away" : "balanced",
      shiftMagnitude: magnitude,
      description:
        "The match dynamic is stable — neither team is gaining ground.",
    };
  }

  const rising = shift > 0;
  const dominantTeam = rising ? homeTeam : awayTeam;

  return {
    direction: rising ? "rising" : "falling",
    side: rising ? "home" : "away",
    shiftMagnitude: magnitude,
    description: `${dominantTeam} are gaining momentum with a ${magnitude}% shift in dominance.`,
  };
}

// ─── Match Phase ──────────────────────────────────────────────────────────────

/**
 * Classify the current phase of a live match.
 * Useful for adjusting UI emphasis and AI commentary tone.
 */
export function classifyMatchPhase(
  minute: number | null | undefined,
): LiveMatchPhase {
  const m = minute ?? 0;
  if (m <= 0) return "early";
  if (m <= 15) return "early";
  if (m <= 35) return "settled";
  if (m <= 45) return "pre-half";
  if (m <= 50) return "halftime";
  if (m <= 60) return "second-half-start";
  if (m <= 75) return "mid-second";
  if (m <= 85) return "closing";
  if (m <= 95) return "injury-time";
  return "extra-time";
}

/**
 * Get a human-readable phase description suitable for UI display.
 */
export function getPhaseDescription(phase: LiveMatchPhase): string {
  switch (phase) {
    case "early":
      return "Early stages";
    case "settled":
      return "Match settling";
    case "pre-half":
      return "Approaching halftime";
    case "halftime":
      return "Halftime";
    case "second-half-start":
      return "Second half underway";
    case "mid-second":
      return "Entering key phase";
    case "closing":
      return "Closing stages";
    case "injury-time":
      return "Injury time";
    case "extra-time":
      return "Extra time";
  }
}

// ─── Event Impact ─────────────────────────────────────────────────────────────

/**
 * Score the impact of a match event on each team's prospects.
 * Returns impact values from -50 (devastating) to +50 (transformative).
 */
export function scoreEventImpact(
  eventType: string,
  eventTeam: string,
  homeTeam: string,
  minute: number,
  homeScore: number,
  awayScore: number,
): EventImpactScore {
  const type = eventType.toLowerCase();
  const isHome = eventTeam
    .toLowerCase()
    .includes(homeTeam.toLowerCase().slice(0, 6));
  const lateMultiplier = minute >= 80 ? 1.5 : minute >= 70 ? 1.2 : 1.0;
  const scoreDiff = homeScore - awayScore;

  let homeImpact = 0;
  let awayImpact = 0;
  let isPivotal = false;

  if (type.includes("goal")) {
    const baseImpact = 30;
    const isEqualizer = isHome ? scoreDiff === -1 : scoreDiff === 1;
    const isGoAhead = isHome ? scoreDiff === 0 : scoreDiff === 0;
    const multiplier = isEqualizer ? 1.6 : isGoAhead ? 1.4 : 1.0;

    if (isHome) {
      homeImpact = Math.round(baseImpact * multiplier * lateMultiplier);
      awayImpact = -Math.round(baseImpact * 0.8 * multiplier * lateMultiplier);
    } else {
      awayImpact = Math.round(baseImpact * multiplier * lateMultiplier);
      homeImpact = -Math.round(baseImpact * 0.8 * multiplier * lateMultiplier);
    }
    isPivotal = isEqualizer || isGoAhead || minute >= 85;
  } else if (type.includes("red")) {
    const baseImpact = 25;
    if (isHome) {
      homeImpact = -Math.round(baseImpact * lateMultiplier);
      awayImpact = Math.round(baseImpact * 0.6 * lateMultiplier);
    } else {
      awayImpact = -Math.round(baseImpact * lateMultiplier);
      homeImpact = Math.round(baseImpact * 0.6 * lateMultiplier);
    }
    isPivotal = true;
  } else if (type.includes("penalty")) {
    const baseImpact = 20;
    if (isHome) {
      homeImpact = Math.round(baseImpact * lateMultiplier);
      awayImpact = -Math.round(baseImpact * 0.6 * lateMultiplier);
    } else {
      awayImpact = Math.round(baseImpact * lateMultiplier);
      homeImpact = -Math.round(baseImpact * 0.6 * lateMultiplier);
    }
    isPivotal = minute >= 75;
  } else if (type.includes("var")) {
    homeImpact = 0;
    awayImpact = 0;
    isPivotal = false;
  }

  return {
    event: eventType,
    impactOnHome: Math.max(-50, Math.min(50, homeImpact)),
    impactOnAway: Math.max(-50, Math.min(50, awayImpact)),
    isPivotal,
  };
}

// ─── Adaptive Refresh ─────────────────────────────────────────────────────────

/**
 * Compute the optimal refresh interval based on match state.
 * Returns 0 when polling should be disabled.
 *
 * Strategy:
 *   - Critical moments (recent goal/red): 4s
 *   - Normal live: 8s
 *   - Halftime / injury time delay: 20s
 *   - Not live: 0 (disabled)
 */
export function computeRefreshInterval(
  isLive: boolean,
  minute: number | null | undefined,
  recentCriticalEvent: boolean,
): number {
  if (!isLive) return 0;
  const m = minute ?? 0;
  if (m >= 45 && m <= 50) return 20_000; // halftime
  if (recentCriticalEvent) return 4_000;
  return 8_000;
}
