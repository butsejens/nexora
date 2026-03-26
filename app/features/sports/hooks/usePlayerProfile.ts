import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function usePlayerProfile(playerId: string) {
  return useQuery({
    queryKey: ["sports", "player", playerId],
    queryFn: async () => apiRequestJson(`/api/sports/player/${encodeURIComponent(playerId)}`),
    enabled: Boolean(playerId),
  });
}
