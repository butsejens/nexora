import { buildGroundedMatchAnalysis, type MatchAnalysisInput } from "../lib/match-analysis-engine";

type Scenario = {
  id: string;
  input: MatchAnalysisInput;
};

type CheckResult = {
  id: string;
  ok: boolean;
  notes: string[];
};

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function approxEqual(a: number, b: number, epsilon = 0.0001): boolean {
  return Math.abs(a - b) <= epsilon;
}

function runChecks(id: string, output: ReturnType<typeof buildGroundedMatchAnalysis>): CheckResult {
  const notes: string[] = [];
  const requiredNumberKeys = [
    "confidence",
    "homePct",
    "drawPct",
    "awayPct",
    "doubleChanceHomePct",
    "doubleChanceAwayPct",
    "bothTeamsToScorePct",
    "over15Pct",
    "under15Pct",
    "over25Pct",
    "under25Pct",
    "over35Pct",
    "under35Pct",
    "cleanSheetHomePct",
    "cleanSheetAwayPct",
    "xgHome",
    "xgAway",
    "scoreDrawRiskPct",
    "upsetProbabilityPct",
    "edgeScore",
    "pressureIndex",
    "momentumScore",
    "firstTeamToScorePct",
  ] as const;

  for (const key of requiredNumberKeys) {
    if (!isFiniteNumber(output[key])) {
      notes.push(`${key} is not a finite number`);
    }
  }

  const boundedPctKeys = [
    "confidence",
    "homePct",
    "drawPct",
    "awayPct",
    "doubleChanceHomePct",
    "doubleChanceAwayPct",
    "bothTeamsToScorePct",
    "over15Pct",
    "under15Pct",
    "over25Pct",
    "under25Pct",
    "over35Pct",
    "under35Pct",
    "cleanSheetHomePct",
    "cleanSheetAwayPct",
    "expectedGoalShareHomePct",
    "expectedGoalShareAwayPct",
    "firstTeamToScorePct",
    "scoreDrawRiskPct",
    "upsetProbabilityPct",
    "edgeScore",
    "pressureIndex",
    "momentumScore",
  ] as const;

  for (const key of boundedPctKeys) {
    const value = output[key];
    if (!isFiniteNumber(value) || value < 0 || value > 100) {
      notes.push(`${key} out of bounds [0,100]`);
    }
  }

  const total = output.homePct + output.drawPct + output.awayPct;
  if (!approxEqual(total, 100, 0.01)) {
    notes.push(`3-way percentage total != 100 (got ${total})`);
  }

  if (output.prediction !== "Home Win" && output.prediction !== "Away Win" && output.prediction !== "Draw") {
    notes.push("prediction is invalid");
  }

  if (output.source !== "nexora-match-intelligence") {
    notes.push("source is not nexora-match-intelligence");
  }

  if (!output.summary || typeof output.summary !== "string") {
    notes.push("summary missing");
  }

  if (!output.tip || typeof output.tip !== "string") {
    notes.push("tip missing");
  }

  if (!Array.isArray(output.keyFactors) || output.keyFactors.length === 0) {
    notes.push("keyFactors missing");
  }

  if (!Array.isArray(output.riskFactors)) {
    notes.push("riskFactors missing");
  }

  if (typeof output.predictedScore !== "string" || !/^\d+-\d+$/.test(output.predictedScore)) {
    notes.push(`predictedScore format invalid (${output.predictedScore})`);
  }

  return {
    id,
    ok: notes.length === 0,
    notes,
  };
}

const scenarios: Scenario[] = [
  {
    id: "prematch-rich-data",
    input: {
      matchId: "prematch-rich",
      competition: "Premier League",
      homeTeam: "Arsenal",
      awayTeam: "Liverpool",
      home: {
        rank: 2,
        points: 69,
        goalDiff: 38,
        recentForm: "WWDWW",
        goalsFor: 67,
        goalsAgainst: 25,
        xgFor: 1.92,
        xgAgainst: 0.91,
        topScorer: "Saka",
        topScorerGoals: 17,
        topAssist: "Odegaard",
        topAssistCount: 9,
        lineupStrength: 0.9,
        lineupCertainty: 0.92,
        homeFormPts: 12,
      },
      away: {
        rank: 1,
        points: 72,
        goalDiff: 42,
        recentForm: "WWWDW",
        goalsFor: 71,
        goalsAgainst: 29,
        xgFor: 2.01,
        xgAgainst: 1.03,
        topScorer: "Salah",
        topScorerGoals: 19,
        topAssist: "Alexander-Arnold",
        topAssistCount: 10,
        lineupStrength: 0.91,
        lineupCertainty: 0.9,
        awayFormPts: 10,
      },
    },
  },
  {
    id: "live-halftime",
    input: {
      matchId: "live-halftime",
      competition: "La Liga",
      homeTeam: "Barcelona",
      awayTeam: "Atletico Madrid",
      isLive: true,
      status: "halftime",
      minute: 45,
      homeScore: 1,
      awayScore: 0,
      stats: {
        home: { possessionPct: 63, totalShots: 9, shotsOnTarget: 4, cornerKicks: 3, dangerousAttacks: 22 },
        away: { possessionPct: 37, totalShots: 4, shotsOnTarget: 1, cornerKicks: 1, dangerousAttacks: 11 },
      },
      events: [
        { type: "goal", team: "Barcelona", minute: 33 },
        { type: "yellow", team: "Atletico Madrid", minute: 41 },
      ],
      home: { rank: 3, points: 62, goalDiff: 27, recentForm: "WWLWD", lineupCertainty: 0.92 },
      away: { rank: 4, points: 58, goalDiff: 19, recentForm: "WDLWW", lineupCertainty: 0.88 },
    },
  },
  {
    id: "finished-match",
    input: {
      matchId: "finished-match",
      competition: "Serie A",
      homeTeam: "Inter",
      awayTeam: "Milan",
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      home: { rank: 1, points: 79, goalDiff: 47, recentForm: "WWWWW" },
      away: { rank: 2, points: 72, goalDiff: 33, recentForm: "WWDWL" },
    },
  },
  {
    id: "empty-stats",
    input: {
      matchId: "empty-stats",
      competition: "Bundesliga",
      homeTeam: "Leverkusen",
      awayTeam: "Leipzig",
      isLive: true,
      minute: 60,
      homeScore: 0,
      awayScore: 0,
      stats: {
        home: {},
        away: {},
      },
      events: [],
      home: {},
      away: {},
    },
  },
  {
    id: "incomplete-lineups",
    input: {
      matchId: "incomplete-lineups",
      competition: "Eredivisie",
      homeTeam: "Ajax",
      awayTeam: "PSV",
      home: {
        rank: 2,
        points: 61,
        lineupStrength: 0.55,
        lineupCertainty: 0.5,
        injuries: 4,
      },
      away: {
        rank: 1,
        points: 67,
        lineupStrength: 0.58,
        lineupCertainty: 0.52,
        injuries: 3,
      },
    },
  },
  {
    id: "friendly-low-data",
    input: {
      matchId: "friendly-low-data",
      competition: "International Friendly",
      isInternational: true,
      homeTeam: "Belgium",
      awayTeam: "Norway",
      home: { fifaRank: 4, lineupCertainty: 0.62 },
      away: { fifaRank: 18, lineupCertainty: 0.6 },
    },
  },
];

function main() {
  const results: CheckResult[] = [];

  for (const scenario of scenarios) {
    const output = buildGroundedMatchAnalysis(scenario.input);
    const checks = runChecks(scenario.id, output);
    results.push(checks);
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;

  console.log("Match Intelligence Validation");
  console.log("===========================");
  console.log(`Scenarios: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const fail of failed) {
      console.log(`- ${fail.id}`);
      for (const note of fail.notes) {
        console.log(`  - ${note}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nAll validation scenarios passed.");
}

main();
