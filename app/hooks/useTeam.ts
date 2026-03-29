import { useQuery } from "@tanstack/react-query";
import { fetchTeam, type FetchTeamParams } from "@/api/teamApi";

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function useTeam(params: FetchTeamParams) {
  return useQuery({
    queryKey: ["team", params.teamId, params.teamName, params.league, params.sport, params.countryCode],
    queryFn: () => fetchTeam(params),
    enabled: Boolean(params.teamId),
    staleTime: FIVE_MINUTES,
    gcTime: FIFTEEN_MINUTES,
    retry: 2,
  });
}
