import { useQuery } from "@tanstack/react-query";
import { fetchMarketValue } from "@/api/marketValueApi";
import type { FetchPlayerParams } from "@/api/playerApi";

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function useMarketValue(params: FetchPlayerParams) {
  return useQuery({
    queryKey: ["player-market-value", params.playerId, params.name, params.team, params.league],
    queryFn: () => fetchMarketValue(params),
    enabled: Boolean(params.playerId || params.name),
    staleTime: FIVE_MINUTES,
    gcTime: FIFTEEN_MINUTES,
    retry: 2,
  });
}
