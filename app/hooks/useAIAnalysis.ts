import { useQuery } from "@tanstack/react-query";
import { fetchPlayerAnalysis, type FetchPlayerAnalysisParams } from "@/api/aiAnalysisApi";

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function useAIAnalysis(params: FetchPlayerAnalysisParams) {
  return useQuery({
    queryKey: ["player-ai-analysis", params.playerId, params.name, params.team, params.league, params.language],
    queryFn: () => fetchPlayerAnalysis(params),
    enabled: Boolean(params.playerId || params.name),
    staleTime: FIVE_MINUTES,
    gcTime: FIFTEEN_MINUTES,
    retry: 2,
  });
}
