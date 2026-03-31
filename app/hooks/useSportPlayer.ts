/**
 * Nexora – Sport Player Hook
 *
 * Semantic React Query hook for player profile data.
 * Returns a normalized Player domain model via sports-service.
 */

import { useQuery } from "@tanstack/react-query";
import { getPlayerProfile, sportKeys } from "@/lib/services/sports-service";

/** Player profile including stats, bio, and enriched metadata. */
export function useSportPlayer(playerId: string | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.player(playerId ?? ""),
    queryFn: () => getPlayerProfile(playerId!),
    enabled: enabled && Boolean(playerId),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}
