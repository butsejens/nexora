import { useQuery } from "@tanstack/react-query";
import { fetchSportsLeagueResourceWithFallback } from "@/lib/sports-data";

export function useCompetition(leagueName: string, espnLeague: string) {
  return useQuery({
    queryKey: ["sports", "competition", leagueName, espnLeague],
    queryFn: async () => {
      const [standings, matches, teams] = await Promise.all([
        fetchSportsLeagueResourceWithFallback("standings", { leagueName, espnLeague }),
        fetchSportsLeagueResourceWithFallback("competition-matches", { leagueName, espnLeague }),
        fetchSportsLeagueResourceWithFallback("competition-teams", { leagueName, espnLeague }),
      ]);
      return { standings, matches, teams };
    },
    enabled: Boolean(leagueName && espnLeague),
  });
}
