/**
 * Nexora – Sport Competition Hooks
 *
 * Semantic React Query hooks for competition-level data:
 * standings, top scorers, top assists, teams, matches, combined insights.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getCompetitionStandings,
  getCompetitionTopScorers,
  getCompetitionTopAssists,
  getCompetitionTeams,
  getCompetitionMatches,
  getCompetitionInsights,
  sportKeys,
  type CompetitionInsightParams,
} from "@/lib/services/sports-service";

export type { CompetitionInsightParams };

// Competition data changes slowly — 5 min stale, 15 min GC.
const STALE = 5 * 60_000;
const GC = 15 * 60_000;

function hasCompetitionParam(params: CompetitionInsightParams | null | undefined): boolean {
  return Boolean(params?.espnLeague || params?.leagueName);
}

/** League standings table. */
export function useSportStandings(params: CompetitionInsightParams | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.standings(params ?? {}),
    queryFn: () => getCompetitionStandings(params!),
    enabled: enabled && hasCompetitionParam(params),
    staleTime: STALE,
    gcTime: GC,
    retry: 1,
  });
}

/** Top scorers leaderboard for a competition. */
export function useSportTopScorers(params: CompetitionInsightParams | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.topScorers(params ?? {}),
    queryFn: () => getCompetitionTopScorers(params!),
    enabled: enabled && hasCompetitionParam(params),
    staleTime: STALE,
    gcTime: GC,
    retry: 1,
  });
}

/** Top assists leaderboard for a competition. */
export function useSportTopAssists(params: CompetitionInsightParams | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.topAssists(params ?? {}),
    queryFn: () => getCompetitionTopAssists(params!),
    enabled: enabled && hasCompetitionParam(params),
    staleTime: STALE,
    gcTime: GC,
    retry: 1,
  });
}

/** All teams in a competition. */
export function useSportCompetitionTeams(
  params: { espnLeague: string; leagueName?: string } | null,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.competitionTeams(
      params ? (params as CompetitionInsightParams) : ({} as CompetitionInsightParams),
    ),
    queryFn: () => getCompetitionTeams(params!),
    enabled: enabled && Boolean(params?.espnLeague),
    staleTime: STALE,
    gcTime: GC,
    retry: 1,
  });
}

/** All scheduled/recent matches in a competition. */
export function useSportCompetitionMatches(
  params: { espnLeague: string; leagueName?: string } | null,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.competitionMatches(
      params ? (params as CompetitionInsightParams) : ({} as CompetitionInsightParams),
    ),
    queryFn: () => getCompetitionMatches(params!),
    enabled: enabled && Boolean(params?.espnLeague),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Combined competition overview: standings + top scorers + top assists in a single query.
 * Prefer this over calling the three individual hooks separately.
 */
export function useSportInsights(params: CompetitionInsightParams | null, enabled = true) {
  return useQuery({
    queryKey: sportKeys.competitionInsights(params ?? {}),
    queryFn: () => getCompetitionInsights(params!),
    enabled: enabled && hasCompetitionParam(params),
    staleTime: STALE,
    gcTime: GC,
    retry: 1,
  });
}
