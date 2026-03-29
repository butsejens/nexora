import { useQuery } from "@tanstack/react-query";
import { fetchPlayer, type FetchPlayerParams } from "@/api/playerApi";

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function usePlayer(params: FetchPlayerParams) {
  return useQuery({
    queryKey: ["player", params.playerId, params.name, params.team, params.league, params.sport],
    queryFn: () => fetchPlayer(params),
    enabled: Boolean(params.playerId),
    staleTime: FIVE_MINUTES,
    gcTime: FIFTEEN_MINUTES,
    retry: 2,
  });
}
