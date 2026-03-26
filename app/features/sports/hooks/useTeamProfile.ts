import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useTeamProfile(teamId: string) {
  return useQuery({
    queryKey: ["sports", "team", teamId],
    queryFn: async () => apiRequestJson(`/api/sports/team/${encodeURIComponent(teamId)}`),
    enabled: Boolean(teamId),
  });
}
