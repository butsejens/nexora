/**
 * Nexora – Sport Match Hooks
 *
 * Semantic React Query hooks for all match-related data.
 * All hooks delegate to sports-service, which normalizes domain models.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getSportsByDate,
  getSportsHome,
  getSportsLive,
  getMatchDetail,
  getMatchDetailRaw,
  getMatchStream,
  sportKeys,
} from "@/lib/services/sports-service";

/** Matches for a specific date (YYYY-MM-DD). Resolves into {live, upcoming, finished}. */
export function useMatches(date: string, enabled = true) {
  return useQuery({
    queryKey: sportKeys.homeByDate(date),
    queryFn: () => getSportsByDate(date),
    enabled: enabled && Boolean(date),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

/** Today's home feed (live + upcoming + finished). */
export function useTodayMatches(enabled = true) {
  return useQuery({
    queryKey: sportKeys.home(),
    queryFn: getSportsHome,
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

/** Live matches only — polls every 30 seconds automatically. */
export function useLiveMatches(enabled = true) {
  return useQuery({
    queryKey: sportKeys.live(),
    queryFn: getSportsLive,
    enabled,
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

/**
 * Full normalized match detail.
 * Returns {match, events, lineups, stats, analysisInput, meta}.
 */
export function useMatchDetail(matchId: string | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.matchDetail({ matchId: matchId! }),
    queryFn: () => getMatchDetail(matchId!),
    enabled: enabled && Boolean(matchId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Raw match detail — unprocessed server payload.
 * Prefer useMatchDetail. Use this when you need the raw shape for AI or manual enrichment.
 */
export function useMatchDetailRaw(
  params: { matchId: string; sport?: string; league?: string } | null,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.matchDetail({
      matchId: params?.matchId ?? "",
      sport: params?.sport,
      espnLeague: params?.league,
    }),
    queryFn: () => getMatchDetailRaw(params!),
    enabled: enabled && Boolean(params?.matchId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

/** Match stream URLs (used for live-stream embedding). Returns empty if not available. */
export function useMatchStream(
  params: { matchId: string; league?: string } | null,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.matchStream({
      matchId: params?.matchId ?? "",
      espnLeague: params?.league,
    }),
    queryFn: () => getMatchStream(params!),
    enabled: enabled && Boolean(params?.matchId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
  });
}
