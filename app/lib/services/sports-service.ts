/**
 * Nexora – Sports Domain Service
 *
 * Central access point for all sports data.
 * All methods:
 *   - use apiRequest (multi-base failover, auth-less public data)
 *   - normalize raw server responses into domain models
 *   - never expose raw API shapes to the UI
 *
 * Cache: React Query handles client-side caching.
 * Server: handles upstream caching + stale-while-revalidate.
 */

import { apiRequest } from "@/lib/query-client";
import {
  normalizeMatchFromServer,
  normalizeMatchEvents,
  normalizeMatchLineups,
  normalizeStandings,
  normalizeLeaderboardRow,
  normalizeCompetitionId,
  normalizePlayer,
  normalizeTeam,
  normalizeStanding,
  type NormalizedLeaderboardRow,
} from "@/lib/domain/normalizers";
import { deduplicateLeaderboard } from "@/lib/domain/identity-resolver";
import type {
  Match,
  MatchDetail,
  MatchStats,
  MatchAnalysisInput,
  TeamStanding,
  Competition,
  CompetitionId,
  Player,
  Team,
  FollowedTeam,
  FollowedMatch,
} from "@/lib/domain/models";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function safeFetch<T>(route: string, fallback: T): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function buildCompetitionId(params: {
  leagueName?: string;
  espnLeague?: string;
  country?: string;
  season?: number;
}): CompetitionId {
  return normalizeCompetitionId({
    espnSlug: params.espnLeague ?? params.leagueName ?? "",
    displayName: params.leagueName ?? params.espnLeague ?? "",
    country: params.country,
    season: params.season,
  });
}

// ─── Home / live feed ─────────────────────────────────────────────────────────

export interface SportsHomeData {
  live: Match[];
  upcoming: Match[];
  finished: Match[];
}

/**
 * Fetch the sports home / live feed.
 * Used by the main sports tab and the live badge.
 */
export async function getSportsHome(): Promise<SportsHomeData> {
  const raw = await safeFetch<any>("/api/sports/today", {});
  return normalizeSportsHomePayload(raw);
}

export async function getSportsByDate(dateYmd: string): Promise<SportsHomeData> {
  const raw = await safeFetch<any>(`/api/sports/by-date?date=${encodeURIComponent(dateYmd)}`, {});
  return normalizeSportsHomePayload(raw);
}

export async function getSportsLive(): Promise<SportsHomeData> {
  const raw = await safeFetch<any>("/api/sports/live", {});
  return normalizeSportsHomePayload(raw);
}

function normalizeSportsHomePayload(raw: any): SportsHomeData {
  const competitions = raw?.competitions as Record<string, CompetitionId> | undefined;

  const mapList = (list: any[]): Match[] => {
    if (!Array.isArray(list)) return [];
    return list.map(m => normalizeMatchFromServer(m));
  };

  return {
    live: mapList(raw?.live),
    upcoming: mapList(raw?.upcoming),
    finished: mapList(raw?.finished),
  };
}

// ─── Prefetch home ────────────────────────────────────────────────────────────

/**
 * Trigger server-side prefetch of home data (warms caches for all leagues).
 * Call on app startup without awaiting.
 */
export function prefetchSportsHome(): void {
  apiRequest("GET", "/api/sports/prefetch-home").catch(() => {/* fire and forget */});
}

// ─── Competition ──────────────────────────────────────────────────────────────

export interface CompetitionOverview {
  competition: CompetitionId;
  standings: TeamStanding[];
  topScorers: NormalizedLeaderboardRow[];
  topAssists: NormalizedLeaderboardRow[];
}

export async function getCompetitionStandings(params: {
  leagueName?: string;
  espnLeague?: string;
}): Promise<TeamStanding[]> {
  const league = params.espnLeague ?? params.leagueName ?? "";
  const raw = await safeFetch<any>(`/api/sports/standings/${encodeURIComponent(league)}`, {});
  const compId = buildCompetitionId(params);
  return normalizeStandings(raw?.standings ?? [], compId);
}

export async function getCompetitionTopScorers(params: {
  leagueName?: string;
  espnLeague?: string;
}): Promise<NormalizedLeaderboardRow[]> {
  const league = params.espnLeague ?? params.leagueName ?? "";
  const raw = await safeFetch<any>(`/api/sports/topscorers/${encodeURIComponent(league)}`, { scorers: [] });
  const compId = buildCompetitionId(params);
  const rows = [
    ...(raw?.scorers ?? []),
    ...(raw?.players ?? []),
    ...(raw?.topScorers ?? []),
  ].filter(Boolean);
  const normalized = rows.map(r => normalizeLeaderboardRow(r, "topscorers", compId));
  return deduplicateLeaderboard(normalized);
}

export async function getCompetitionTopAssists(params: {
  leagueName?: string;
  espnLeague?: string;
}): Promise<NormalizedLeaderboardRow[]> {
  const league = params.espnLeague ?? params.leagueName ?? "";
  const raw = await safeFetch<any>(`/api/sports/topassists/${encodeURIComponent(league)}`, { assists: [] });
  const compId = buildCompetitionId(params);
  const rows = [
    ...(raw?.assists ?? []),
    ...(raw?.topAssists ?? []),
    ...(raw?.players ?? []),
  ].filter(Boolean);
  const normalized = rows.map(r => normalizeLeaderboardRow(r, "topassists", compId));
  return deduplicateLeaderboard(normalized);
}

export async function getCompetitionTeams(params: {
  espnLeague: string;
}): Promise<Team[]> {
  const raw = await safeFetch<any>(`/api/sports/competition-teams/${encodeURIComponent(params.espnLeague)}`, {});
  if (!Array.isArray(raw?.teams)) return [];
  return raw.teams.map(normalizeTeam);
}

export async function getCompetitionMatches(params: {
  espnLeague: string;
}): Promise<Match[]> {
  const raw = await safeFetch<any>(`/api/sports/competition-matches/${encodeURIComponent(params.espnLeague)}`, {});
  if (!Array.isArray(raw?.matches)) return [];
  return raw.matches.map(normalizeMatchFromServer);
}

export async function getCompetitionStats(params: {
  espnLeague: string;
}): Promise<Record<string, unknown>> {
  return safeFetch(`/api/sports/competition-stats/${encodeURIComponent(params.espnLeague)}`, {});
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export async function getTeamOverview(teamId: string): Promise<any> {
  // Server returns enriched Team shape including squad + recent results
  return safeFetch(`/api/sports/team/${encodeURIComponent(teamId)}`, null);
}

// ─── Player ───────────────────────────────────────────────────────────────────

export async function getPlayerProfile(playerId: string): Promise<Player | null> {
  const raw = await safeFetch<any>(`/api/sports/player/${encodeURIComponent(playerId)}`, null);
  if (!raw) return null;
  return normalizePlayer(raw);
}

// ─── Match detail ─────────────────────────────────────────────────────────────

export interface RawMatchDetail {
  match: any;
  events?: any[];
  lineups?: any;
  stats?: any;
}

export async function getMatchDetail(matchId: string): Promise<MatchDetail | null> {
  const raw = await safeFetch<RawMatchDetail>(`/api/sports/match/${encodeURIComponent(matchId)}`, null as any);
  if (!raw?.match && !raw) return null;

  const matchRaw = raw?.match ?? raw;
  const match = normalizeMatchFromServer(matchRaw);
  const events = normalizeMatchEvents(raw?.events ?? matchRaw?.events ?? [], match.id);
  const lineups = normalizeMatchLineups(raw?.lineups ?? matchRaw?.lineups ?? null, match.id);

  let stats: MatchStats | null = null;
  const rawStats = raw?.stats ?? matchRaw?.stats;
  if (rawStats && Array.isArray(rawStats?.entries)) {
    stats = { matchId: match.id, entries: rawStats.entries };
  }

  return {
    match,
    events,
    lineups,
    stats,
    analysisInput: buildAnalysisInput(match, events, stats),
    meta: {
      primarySource: "espn",
      mergedSources: match.sofascoreId ? ["espn", "sofascore"] : ["espn"],
      fetchedAt: new Date().toISOString(),
      confidence: 1,
    },
  };
}

function buildAnalysisInput(
  match: Match,
  events: ReturnType<typeof normalizeMatchEvents>,
  stats: MatchStats | null,
): MatchAnalysisInput {
  return {
    matchId: match.id,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    competition: match.competition.displayName,
    homeScore: match.score.home,
    awayScore: match.score.away,
    events: events.map(e => ({
      minute: e.minute,
      type: e.type,
      team: e.team,
      player: e.playerName ?? undefined,
    })),
    stats: stats?.entries,
  };
}

// ─── AI prediction ────────────────────────────────────────────────────────────

export async function predictMatch(matchId: string): Promise<any> {
  return safeFetch(`/api/sports/predict`, null);
}

export async function requestMatchPrediction(input: MatchAnalysisInput): Promise<any> {
  try {
    const res = await apiRequest("POST", "/api/sports/predict", input);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── React Query key factories ────────────────────────────────────────────────
// Central place for all sports query keys — prevents key collisions between screens.

export const sportKeys = {
  home: () => ["sports", "home"] as const,
  homeByDate: (date: string) => ["sports", "home", date] as const,
  live: () => ["sports", "live"] as const,
  standings: (league: string) => ["sports", "standings", league] as const,
  topScorers: (league: string) => ["sports", "topscorers", league] as const,
  topAssists: (league: string) => ["sports", "topassists", league] as const,
  competitionTeams: (league: string) => ["sports", "teams", league] as const,
  competitionMatches: (league: string) => ["sports", "matches", league] as const,
  competitionStats: (league: string) => ["sports", "stats", league] as const,
  team: (teamId: string) => ["sports", "team", teamId] as const,
  player: (playerId: string) => ["sports", "player", playerId] as const,
  matchDetail: (matchId: string, espnLeague: string) => ["sports", "match", matchId, espnLeague] as const,
  predict: (matchId: string) => ["sports", "predict", matchId] as const,
} as const;
