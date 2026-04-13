/**
 * Nexora – Football Statistics Engine
 * Based on: github.com/withqwerty/reep (football analytics)
 *
 * Provides:
 *   - Expected Goals (xG) calculation from shot data
 *   - Expected Assists (xA) estimation
 *   - Player performance ratings (Nexora Score)
 *   - Match result probability from xG totals
 *   - Top performer extraction from match stats
 *
 * All calculations are deterministic and pure (no side effects).
 * Sources: reep methodology + Dixon-Coles / logistic regression approximations.
 *
 * Usage:
 *   import { calcShotXg, calcMatchRating, getTopPerformers } from './football-stats.js';
 */

// ─── Expected Goals (xG) ─────────────────────────────────────────────────────

/**
 * Shot location coefficients for xG logistic model.
 * Derived from publicly available Statsbomb open data approximations.
 */
const XG_INTERCEPT = -1.36;
const XG_DIST_COEF = -0.0882; // distance from goal (metres)
const XG_ANGLE_COEF = 0.0724; // shot angle (degrees, 0 = straight on)
const XG_HEADER_MOD = -0.6; // headers are less likely to score
const XG_BIGCHANCE_MOD = 0.85; // big-chance flag boosts xG

/**
 * Logistic sigmoid function.
 * @param {number} x
 * @returns {number} probability 0–1
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calculate xG for a single shot.
 *
 * @param {object} shot
 * @param {number}  shot.distance   - distance from goal in metres (5–35)
 * @param {number}  shot.angle      - angle to goal in degrees (0–90)
 * @param {boolean} [shot.header]   - headed shot
 * @param {boolean} [shot.bigChance]- flagged as big chance
 * @returns {number} xG value 0–1
 */
export function calcShotXg({
  distance = 18,
  angle = 20,
  header = false,
  bigChance = false,
} = {}) {
  const linear =
    XG_INTERCEPT +
    XG_DIST_COEF * Number(distance) +
    XG_ANGLE_COEF * Number(angle) +
    (header ? XG_HEADER_MOD : 0) +
    (bigChance ? XG_BIGCHANCE_MOD : 0);
  return Math.min(1, Math.max(0, sigmoid(linear)));
}

/**
 * Sum xG for an array of shots.
 * @param {Array<{distance: number, angle: number, header?: boolean, bigChance?: boolean}>} shots
 * @returns {number}
 */
export function sumXg(shots = []) {
  return shots.reduce((acc, s) => acc + calcShotXg(s), 0);
}

// ─── Expected Assists (xA) ────────────────────────────────────────────────────

/**
 * Estimate xA from raw key-pass / chance-created data.
 * xA ≈ xG of the shot that followed the assist attempt.
 *
 * @param {Array<{shotXg: number}>} keyPasses
 * @returns {number}
 */
export function calcXA(keyPasses = []) {
  return keyPasses.reduce((acc, kp) => acc + (Number(kp.shotXg) || 0), 0);
}

// ─── Player Match Rating ──────────────────────────────────────────────────────

/**
 * Calculate a Nexora player performance score (0–10) from match stats.
 * Weights loosely follow the reep methodology (contribution-based).
 *
 * @param {object} stats
 * @param {number}  [stats.goals]
 * @param {number}  [stats.assists]
 * @param {number}  [stats.xG]
 * @param {number}  [stats.xA]
 * @param {number}  [stats.shotsOnTarget]
 * @param {number}  [stats.passAccuracy]  - 0–100
 * @param {number}  [stats.tackles]
 * @param {number}  [stats.interceptions]
 * @param {number}  [stats.yellowCards]
 * @param {number}  [stats.redCards]
 * @param {number}  [stats.minutesPlayed] - used to scale
 * @returns {number} rating 0–10 (1 decimal)
 */
export function calcMatchRating(stats = {}) {
  const {
    goals = 0,
    assists = 0,
    xG = 0,
    xA = 0,
    shotsOnTarget = 0,
    passAccuracy = 75,
    tackles = 0,
    interceptions = 0,
    yellowCards = 0,
    redCards = 0,
    minutesPlayed = 90,
  } = stats;

  const minFactor = Math.min(1, Math.max(0, Number(minutesPlayed) / 90));

  let score = 6.0; // baseline

  // Attacking contribution
  score += Number(goals) * 1.2;
  score += Number(assists) * 0.8;
  score += Number(xG) * 0.5;
  score += Number(xA) * 0.3;
  score += Number(shotsOnTarget) * 0.1;

  // Passing quality
  const pa = Number(passAccuracy);
  if (pa >= 90) score += 0.4;
  else if (pa >= 80) score += 0.2;
  else if (pa < 60) score -= 0.3;

  // Defensive contribution
  score += Number(tackles) * 0.12;
  score += Number(interceptions) * 0.1;

  // Discipline
  score -= Number(yellowCards) * 0.5;
  score -= Number(redCards) * 2.0;

  // Scale by time on pitch
  score = 6.0 + (score - 6.0) * minFactor;

  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

// ─── Match Result Probability ─────────────────────────────────────────────────

/**
 * Estimate win/draw/loss probabilities from match xG totals.
 * Uses a Poisson approximation (Dixon-Coles simplified).
 *
 * @param {number} homeXg
 * @param {number} awayXg
 * @param {number} [maxGoals=8]
 * @returns {{ home: number, draw: number, away: number }} — probabilities sum to ~1
 */
export function calcResultProbability(homeXg, awayXg, maxGoals = 8) {
  const hXg = Math.max(0, Number(homeXg) || 1.3);
  const aXg = Math.max(0, Number(awayXg) || 1.0);

  function poisson(mean, k) {
    let logP = k * Math.log(mean) - mean;
    for (let i = 2; i <= k; i++) logP -= Math.log(i);
    return Math.exp(logP);
  }

  let pHome = 0,
    pDraw = 0,
    pAway = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poisson(hXg, h) * poisson(aXg, a);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }

  const total = pHome + pDraw + pAway;
  return {
    home: Math.round((pHome / total) * 1000) / 10,
    draw: Math.round((pDraw / total) * 1000) / 10,
    away: Math.round((pAway / total) * 1000) / 10,
  };
}

// ─── Top Performers ───────────────────────────────────────────────────────────

/**
 * Return the top N performers from a match based on Nexora score.
 *
 * @param {Array<object>} players - array of player stat objects
 * @param {number} [n=3]
 * @returns {Array<{ name: string, team: string, rating: number }>}
 */
export function getTopPerformers(players = [], n = 3) {
  return players
    .map((p) => ({ ...p, rating: calcMatchRating(p) }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, n);
}

// ─── League / Season Aggregation ─────────────────────────────────────────────

/**
 * Compute per-player season totals from an array of match stat objects.
 *
 * @param {Array<{ playerId: string, playerName: string, goals: number, assists: number, xG: number, xA: number }>} matchStats
 * @returns {Map<string, object>} keyed by playerId
 */
export function aggregateSeasonStats(matchStats = []) {
  const totals = new Map();
  for (const s of matchStats) {
    const id = String(s.playerId || s.playerName || "?");
    const existing = totals.get(id) || {
      playerId: id,
      playerName: s.playerName || id,
      team: s.team || "",
      apps: 0,
      goals: 0,
      assists: 0,
      xG: 0,
      xA: 0,
      minutesPlayed: 0,
    };
    existing.apps += 1;
    existing.goals += Number(s.goals ?? 0);
    existing.assists += Number(s.assists ?? 0);
    existing.xG += Number(s.xG ?? 0);
    existing.xA += Number(s.xA ?? 0);
    existing.minutesPlayed += Number(s.minutesPlayed ?? 0);
    totals.set(id, existing);
  }
  return totals;
}
