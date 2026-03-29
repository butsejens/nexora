import { buildGroundedMatchAnalysis, type MatchAnalysisInput, type MatchAnalysisOutput } from "@/lib/match-analysis-engine";
import { buildProbabilityEngine, type ProbabilityEngineResult } from "@/lib/ai/probabilityEngine";

export type DataSignalCoverage = {
  form: boolean;
  standings: boolean;
  headToHead: boolean;
  injuries: boolean;
  liveStats: boolean;
  lineups: boolean;
};

export type PremiumAiPrediction = MatchAnalysisOutput & {
  probabilityEngine: ProbabilityEngineResult;
  dataSignals: DataSignalCoverage;
  mode: "prematch" | "live";
  liveAdaptive: boolean;
  modelVersion: string;
};

function hasForm(input: MatchAnalysisInput): boolean {
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;
  return Boolean(
    home?.recentForm ||
    away?.recentForm ||
    (Array.isArray(home?.recentResults5) && home?.recentResults5.length) ||
    (Array.isArray(away?.recentResults5) && away?.recentResults5.length)
  );
}

function hasStandings(input: MatchAnalysisInput): boolean {
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;
  return Boolean(home?.rank != null || away?.rank != null || home?.points != null || away?.points != null);
}

function hasHeadToHead(input: MatchAnalysisInput): boolean {
  return Boolean(input.headToHead || input.context?.headToHead);
}

function hasInjurySignals(input: MatchAnalysisInput): boolean {
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;
  return Boolean(home?.injuries != null || away?.injuries != null || home?.suspensions != null || away?.suspensions != null);
}

function hasLiveStats(input: MatchAnalysisInput): boolean {
  const homeStats = input.stats?.home || {};
  const awayStats = input.stats?.away || {};
  return Object.keys(homeStats).length > 0 || Object.keys(awayStats).length > 0;
}

function hasLineupSignals(input: MatchAnalysisInput): boolean {
  const home = input.home || input.context?.home;
  const away = input.away || input.context?.away;
  return Boolean(home?.formation || away?.formation || home?.lineupStrength != null || away?.lineupStrength != null);
}

export function runAiPredictionModel(input: MatchAnalysisInput, mode: "prematch" | "live"): PremiumAiPrediction {
  const base = buildGroundedMatchAnalysis(input);
  return {
    ...base,
    probabilityEngine: buildProbabilityEngine(base),
    dataSignals: {
      form: hasForm(input),
      standings: hasStandings(input),
      headToHead: hasHeadToHead(input),
      injuries: hasInjurySignals(input),
      liveStats: hasLiveStats(input),
      lineups: hasLineupSignals(input),
    },
    mode,
    liveAdaptive: mode === "live",
    modelVersion: "nexora-premium-ai-v2",
  };
}
