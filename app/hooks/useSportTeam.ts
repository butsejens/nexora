/**
 * Nexora – Sport Team Hook
 *
 * Semantic React Query hook for team detail data.
 * Returns the enriched team overview including squad and recent results.
 */

import { useQuery } from "@tanstack/react-query";
import { getTeamOverview, sportKeys } from "@/lib/services/sports-service";

export interface UseSportTeamParams {
  teamId: string;
  sport?: string;
  league?: string;
  teamName?: string;
  countryCode?: string;
}

/** Team overview including squad, recent results, and enriched metadata. */
export function useSportTeam(params: UseSportTeamParams | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.team({
      teamId: params?.teamId ?? "",
      sport: params?.sport,
      league: params?.league,
      countryCode: params?.countryCode,
    }),
    queryFn: () => getTeamOverview(params!),
    enabled: enabled && Boolean(params?.teamId),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}
