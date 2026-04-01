/**
 * Nexora – Multi-Sport React Query Hooks
 *
 * Hooks for ESPN multi-sport data (NBA, NFL, NHL, MLB, F1, ATP/WTA, etc.)
 * based on the Public-ESPN-API endpoint catalogue.
 *
 * Data freshness strategy:
 *   - Live scoreboards: 30 s stale / 60 s GC (in-game updates)
 *   - Standings / teams: 5 min stale / 15 min GC
 *   - News: 2 min stale / 10 min GC
 *   - Odds: 1 min stale / 5 min GC
 */

import { useQuery } from "@tanstack/react-query";
import {
  getMultiSportScoreboard,
  getEspnNews,
  getMatchOdds,
  getMultiSportTeams,
  getMultiSportStandings,
  getMultiSportGameDetail,
  getMultiSportTeamDetail,
  getMultiSportRankings,
  sportKeys,
} from "@/lib/services/sports-service";
import type { SportSlug } from "@/lib/domain/models";

// ─── Timing constants ─────────────────────────────────────────────────────────

const LIVE_STALE = 30_000;
const LIVE_GC = 60_000;
const SLOW_STALE = 5 * 60_000;
const SLOW_GC = 15 * 60_000;
const NEWS_STALE = 2 * 60_000;
const NEWS_GC = 10 * 60_000;
const ODDS_STALE = 60_000;
const ODDS_GC = 5 * 60_000;

// ─── Core hook ────────────────────────────────────────────────────────────────

/**
 * Scoreboard for any ESPN sport + optional league/date.
 * Returns live, upcoming, and finished events.
 */
export function useMultiSportScoreboard(
  sport: SportSlug | string,
  league?: string,
  date?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.multiSportScoreboard(sport, league, date),
    queryFn: () => getMultiSportScoreboard(sport, league, date),
    enabled: enabled && Boolean(sport),
    staleTime: LIVE_STALE,
    gcTime: LIVE_GC,
    retry: 1,
  });
}

// ─── Per-sport convenience hooks ──────────────────────────────────────────────

/** NBA scoreboard for today (or specific date). */
export function useNbaToday(date?: string) {
  return useMultiSportScoreboard("basketball", "nba", date);
}

/** WNBA scoreboard for today (or specific date). */
export function useWnbaToday(date?: string) {
  return useMultiSportScoreboard("basketball", "wnba", date);
}

/** NFL scoreboard for today (or specific date). */
export function useNflToday(date?: string) {
  return useMultiSportScoreboard("football", "nfl", date);
}

/** NHL scoreboard for today (or specific date). */
export function useNhlToday(date?: string) {
  return useMultiSportScoreboard("hockey", "nhl", date);
}

/** MLB scoreboard for today (or specific date). */
export function useMlbToday(date?: string) {
  return useMultiSportScoreboard("baseball", "mlb", date);
}

/** Formula 1 scoreboard / race results. */
export function useF1Today(date?: string) {
  return useMultiSportScoreboard("racing", "f1", date);
}

/** ATP tennis scoreboard for today (or specific date). */
export function useAtpToday(date?: string) {
  return useMultiSportScoreboard("tennis", "atp", date);
}

/** WTA tennis scoreboard for today (or specific date). */
export function useWtaToday(date?: string) {
  return useMultiSportScoreboard("tennis", "wta", date);
}

/** UFC MMA results. */
export function useUfcToday(date?: string) {
  return useMultiSportScoreboard("mma", "ufc", date);
}

/** PGA Tour golf results. */
export function usePgaToday(date?: string) {
  return useMultiSportScoreboard("golf", "pga", date);
}

// ─── News ─────────────────────────────────────────────────────────────────────

/**
 * ESPN news feed from now.core.api.espn.com.
 * Optionally scoped to a sport/league.
 */
export function useEspnNews(sport?: string, league?: string, limit = 20) {
  return useQuery({
    queryKey: sportKeys.espnNews(sport, league),
    queryFn: () => getEspnNews(sport, league, limit),
    staleTime: NEWS_STALE,
    gcTime: NEWS_GC,
    retry: 1,
  });
}

// ─── Odds ─────────────────────────────────────────────────────────────────────

/**
 * Betting odds for a specific match from ESPN core API.
 * @param matchId ESPN event ID
 * @param sport   e.g. "basketball"
 * @param league  e.g. "nba"
 */
export function useMatchOdds(
  matchId: string | null | undefined,
  sport = "soccer",
  league = "eng.1",
) {
  return useQuery({
    queryKey: sportKeys.matchOdds(matchId ?? "", sport, league),
    queryFn: () => getMatchOdds(matchId!, sport, league),
    enabled: Boolean(matchId),
    staleTime: ODDS_STALE,
    gcTime: ODDS_GC,
    retry: 1,
  });
}

// ─── Teams + Standings ────────────────────────────────────────────────────────

/**
 * Full teams list for any ESPN sport + league.
 */
export function useMultiSportTeams(
  sport: SportSlug | string,
  league: string,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.multiSportTeams(sport, league),
    queryFn: () => getMultiSportTeams(sport, league),
    enabled: enabled && Boolean(sport) && Boolean(league),
    staleTime: SLOW_STALE,
    gcTime: SLOW_GC,
    retry: 1,
  });
}

/**
 * Standings table for any ESPN sport + league.
 * Uses the correct /apis/v2/ endpoint (not the stub /apis/site/v2/).
 */
export function useMultiSportStandings(
  sport: SportSlug | string,
  league: string,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.multiSportStandings(sport, league),
    queryFn: () => getMultiSportStandings(sport, league),
    enabled: enabled && Boolean(sport) && Boolean(league),
    staleTime: SLOW_STALE,
    gcTime: SLOW_GC,
    retry: 1,
  });
}

// ─── Game detail ──────────────────────────────────────────────────────────────

/**
 * Full game summary for any ESPN sport — box score, play-by-play, leaders, videos.
 * @param gameId ESPN event ID (from scoreboard response)
 * @param sport  ESPN sport slug — "basketball", "football", "hockey", "baseball"
 * @param league ESPN league slug — "nba", "nfl", "nhl", "mlb", etc.
 */
export function useMultiSportGameDetail(
  gameId: string | null | undefined,
  sport: SportSlug | string,
  league: string,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.multiSportGame(gameId ?? "", sport, league),
    queryFn: () => getMultiSportGameDetail(gameId!, sport, league),
    enabled: enabled && Boolean(gameId) && Boolean(sport) && Boolean(league),
    staleTime: LIVE_STALE,
    gcTime: LIVE_GC,
    retry: 1,
  });
}

// ─── Team detail ──────────────────────────────────────────────────────────────

/**
 * Detailed team profile — roster, record, next event, for any ESPN sport.
 */
export function useMultiSportTeamDetail(
  teamId: string | null | undefined,
  sport: SportSlug | string,
  league: string,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.multiSportTeamDetail(teamId ?? "", sport, league),
    queryFn: () => getMultiSportTeamDetail(teamId!, sport, league),
    enabled: enabled && Boolean(teamId) && Boolean(sport) && Boolean(league),
    staleTime: SLOW_STALE,
    gcTime: SLOW_GC,
    retry: 1,
  });
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

/**
 * Rankings / polls for college sports.
 * Works best for sport="football" + league="college-football"
 * and sport="basketball" + league="mens-college-basketball".
 */
export function useMultiSportRankings(
  sport: SportSlug | string,
  league: string,
  enabled = true,
) {
  return useQuery({
    queryKey: sportKeys.multiSportRankings(sport, league),
    queryFn: () => getMultiSportRankings(sport, league),
    enabled: enabled && Boolean(sport) && Boolean(league),
    staleTime: SLOW_STALE,
    gcTime: SLOW_GC,
    retry: 1,
  });
}
