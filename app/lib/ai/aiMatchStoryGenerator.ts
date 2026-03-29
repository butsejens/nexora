import type { MatchStory } from "@/lib/ai/ai-summary-service";
import type { PremiumAiPrediction } from "@/lib/ai/aiPredictionService";

export type AiStoryCard = {
  title: string;
  summary: string;
  keyFactors: string[];
  dataEvidence: string[];
};

function compactFactors(prediction: PremiumAiPrediction): string[] {
  if (Array.isArray(prediction.keyFactors) && prediction.keyFactors.length) {
    return prediction.keyFactors.slice(0, 3);
  }
  if (Array.isArray(prediction.key_factors) && prediction.key_factors.length) {
    return prediction.key_factors.slice(0, 3);
  }
  return ["The model has limited context for factor extraction."];
}

export function generateAiMatchStoryCard(args: {
  prediction: PremiumAiPrediction | null;
  liveStory?: MatchStory | null;
  isLive: boolean;
  homeTeam: string;
  awayTeam: string;
}): AiStoryCard | null {
  const { prediction, liveStory, isLive, homeTeam, awayTeam } = args;
  if (!prediction) return null;

  const outcome = prediction.prediction || "Balanced outcome";
  const summaryCore = isLive
    ? prediction.live_shift_summary || prediction.summary
    : prediction.summary;

  const summary = summaryCore || `${homeTeam} vs ${awayTeam} is currently modeled as ${outcome}.`;

  const dataEvidence = [
    prediction.dataSignals.form ? "Form signals integrated" : "No form feed available",
    prediction.dataSignals.standings ? "Standings and rank pressure included" : "No standings feed available",
    prediction.dataSignals.headToHead ? "H2H context included" : "No H2H feed available",
    prediction.dataSignals.injuries ? "Injury and suspension impact included" : "No injury feed available",
    prediction.dataSignals.lineups ? "Lineup certainty included" : "No lineup certainty available",
    prediction.dataSignals.liveStats ? "Live stat pressure included" : "No live stat feed available",
  ];

  const keyFactors = compactFactors(prediction);
  if (liveStory?.available && liveStory.turningPoint) {
    keyFactors.unshift(liveStory.turningPoint);
  }

  return {
    title: isLive ? "Live AI Match Story" : "Prematch AI Match Story",
    summary,
    keyFactors: keyFactors.slice(0, 4),
    dataEvidence,
  };
}
