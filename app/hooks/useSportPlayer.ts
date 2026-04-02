/**
 * Nexora – Sport Player Hook
 *
 * Semantic React Query hook for player profile data.
 * Returns a normalized Player domain model via sports-service.
 */

import { useQuery } from "@tanstack/react-query";
import { getPlayerProfile, sportKeys } from "@/lib/services/sports-service";
import type { PlayerProfileParams } from "@/lib/services/sports-service";

export type { PlayerProfileParams };

/** Player profile including stats, bio, and enriched metadata. */
export function useSportPlayer(
  params: string | PlayerProfileParams | null,
  enabled = true,
) {
  const resolved: PlayerProfileParams | null =
    typeof params === "string" ? { playerId: params } : params;
  return useQuery({
    queryKey: sportKeys.player(resolved?.playerId ?? ""),
    queryFn: () => getPlayerProfile(resolved!),
    enabled: enabled && Boolean(resolved?.playerId),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}
