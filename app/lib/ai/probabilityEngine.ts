import type { MatchAnalysisOutput } from "@/lib/match-analysis-engine";

export type ProbabilityEngineResult = {
  oneXTwo: {
    home: number;
    draw: number;
    away: number;
  };
  goals: {
    over25: number;
    under25: number;
    btts: number;
    expectedGoals: {
      home: number;
      away: number;
      total: number;
    };
  };
  confidence: {
    score: number;
    label: MatchAnalysisOutput["confidence_label"];
    reason: string;
  };
  keyFactors: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildProbabilityEngine(prediction: MatchAnalysisOutput): ProbabilityEngineResult {
  const home = clamp(Math.round(Number(prediction.homePct || 0)), 0, 100);
  const draw = clamp(Math.round(Number(prediction.drawPct || 0)), 0, 100);
  const away = clamp(100 - home - draw, 0, 100);
  const over25 = clamp(Math.round(Number(prediction.over25Pct || 0)), 0, 100);
  const btts = clamp(Math.round(Number(prediction.bothTeamsToScorePct || 0)), 0, 100);
  const confidence = clamp(Math.round(Number(prediction.confidence || 0)), 0, 100);

  return {
    oneXTwo: {
      home,
      draw,
      away,
    },
    goals: {
      over25,
      under25: 100 - over25,
      btts,
      expectedGoals: {
        home: Number(Number(prediction.xgHome || 0).toFixed(2)),
        away: Number(Number(prediction.xgAway || 0).toFixed(2)),
        total: Number((Number(prediction.xgHome || 0) + Number(prediction.xgAway || 0)).toFixed(2)),
      },
    },
    confidence: {
      score: confidence,
      label: prediction.confidence_label,
      reason: prediction.confidenceReason || "Confidence is inferred from edge separation and signal coverage.",
    },
    keyFactors: Array.isArray(prediction.keyFactors)
      ? prediction.keyFactors.slice(0, 4)
      : Array.isArray(prediction.key_factors)
        ? prediction.key_factors.slice(0, 4)
        : [],
  };
}
