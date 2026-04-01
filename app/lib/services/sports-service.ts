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
  type NormalizedLeaderboardRow,
} from "@/lib/domain/normalizers";
import { deduplicateLeaderboard } from "@/lib/domain/identity-resolver";
import { fetchSportsLeagueResourceWithFallback, getLeaderboardRows } from "@/lib/sports-data";
import { enrichPlayerProfilePayload, enrichTeamDetailPayload } from "@/lib/sports-enrichment";
import { getMatchdayYmd } from "@/lib/date/matchday";
import type {
  Match,
  MatchDetail,
  MatchStats,
  MatchAnalysisInput,
  TeamStanding,
  CompetitionId,
  Player,
  Team,
  SportSlug,
  MultiSportEvent,
  MultiSportStandingEntry,
  MultiSportTeam,
  EspnNewsItem,
  MatchOdds,
} from "@/lib/domain/models";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function safeFetch<T>(route: string, fallback?: T, allowFallback = false): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = new Error(`[nexora:sports] HTTP ${res.status} for ${route} ${body}`.trim());
      if (allowFallback) {
        console.warn(String(error.message));
        return fallback as T;
      }
      throw error;
    }
    const data = (await res.json()) as T;
    return data;
  } catch (err: unknown) {
    if (!allowFallback) throw err;
    const msg = err instanceof Error ? err.message : String(err ?? "unknown");
    console.warn(`[nexora:sports] fetch failed for ${route}: ${msg}`);
    return fallback as T;
  }
}

function buildCompetitionScope(params: {
  leagueName?: string;
  espnLeague?: string;
  sport?: string;
}) {
  return {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague || params.leagueName || "unknown",
    sport: params.sport || "soccer",
  };
}

function buildCompetitionScopeKey(params: {
  leagueName?: string;
  espnLeague?: string;
  sport?: string;
}): string {
  const scope = buildCompetitionScope(params);
  return `${scope.sport}:${scope.espnLeague}:${scope.leagueName || scope.espnLeague}`;
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
  const today = getMatchdayYmd(); // Brussels/device TZ, not UTC
  const raw = await safeFetch<any>(`/api/sports/by-date?date=${encodeURIComponent(today)}`, {}, true);
  return normalizeSportsHomePayload(raw);
}

export async function getSportsByDate(dateYmd: string): Promise<SportsHomeData> {
  const raw = await safeFetch<any>(`/api/sports/by-date?date=${encodeURIComponent(dateYmd)}`, {}, true);
  return normalizeSportsHomePayload(raw);
}

export async function getSportsLive(): Promise<SportsHomeData> {
  const raw = await safeFetch<any>("/api/sports/live", {}, true);
  return normalizeSportsHomePayload(raw);
}

function normalizeSportsHomePayload(raw: any): SportsHomeData {
  const mapList = (list: any[]): Match[] => {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        try {
          return normalizeMatchFromServer(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Match[];
  };

  // Trust server-side bucketing; avoids client-side status drift when upstream
  // providers use non-standard status/detail combinations.
  return {
    live: mapList(raw?.live),
    upcoming: mapList(raw?.upcoming),
    finished: mapList(raw?.finished),
  };
}

export const getSportHome = getSportsHome;
export const getLiveMatches = getSportsLive;
export const getMatchday = getSportsByDate;
export async function getFinishedMatches(date: string): Promise<Match[]> {
  const data = await getSportsByDate(date);
  return data.finished;
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

export interface CompetitionInsightParams {
  leagueName?: string;
  espnLeague?: string;
  sport?: string;
}

export async function getCompetitionStandings(params: {
  leagueName?: string;
  espnLeague?: string;
}): Promise<TeamStanding[]> {
  const raw = await fetchSportsLeagueResourceWithFallback("standings", {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague,
  });
  const compId = buildCompetitionId(params);
  return normalizeStandings(raw?.standings ?? [], compId);
}

export async function getCompetitionTopScorers(params: {
  leagueName?: string;
  espnLeague?: string;
}): Promise<NormalizedLeaderboardRow[]> {
  const raw = await fetchSportsLeagueResourceWithFallback("topscorers", {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague,
    sequential: true,
  });
  const compId = buildCompetitionId(params);
  const rows = getLeaderboardRows("topscorers", raw).filter(Boolean);
  const normalized = rows.map(r => normalizeLeaderboardRow(r, "topscorers", compId));
  return deduplicateLeaderboard(normalized);
}

export async function getCompetitionTopAssists(params: {
  leagueName?: string;
  espnLeague?: string;
}): Promise<NormalizedLeaderboardRow[]> {
  const raw = await fetchSportsLeagueResourceWithFallback("topassists", {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague,
    sequential: true,
  });
  const compId = buildCompetitionId(params);
  const rows = getLeaderboardRows("topassists", raw).filter(Boolean);
  const normalized = rows.map(r => normalizeLeaderboardRow(r, "topassists", compId));
  return deduplicateLeaderboard(normalized);
}

export async function getCompetitionTeams(params: {
  espnLeague: string;
  leagueName?: string;
}): Promise<Team[]> {
  const raw = await fetchSportsLeagueResourceWithFallback("competition-teams", {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague,
  });
  if (!Array.isArray(raw?.teams)) return [];
  return raw.teams.map(normalizeTeam);
}

export async function getCompetitionMatches(params: {
  espnLeague: string;
  leagueName?: string;
}): Promise<Match[]> {
  const raw = await fetchSportsLeagueResourceWithFallback("competition-matches", {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague,
  });
  if (!Array.isArray(raw?.matches)) return [];
  const normalized: Match[] = (raw.matches as any[]).map(normalizeMatchFromServer);
  const statusRank = (m: Match): number => {
    const s = m.status;
    if (s === "live" || s === "halftime") return 0;
    if (s === "scheduled") return 1;
    return 2;
  };
  return [...normalized].sort((a, b) => statusRank(a) - statusRank(b));
}

export async function getCompetitionStats(params: {
  espnLeague: string;
  leagueName?: string;
}): Promise<Record<string, unknown>> {
  return fetchSportsLeagueResourceWithFallback("competition-stats", {
    leagueName: params.leagueName,
    espnLeague: params.espnLeague,
  });
}

export async function getCompetitionInsights(params: CompetitionInsightParams): Promise<CompetitionOverview> {
  const [standings, topScorers, topAssists] = await Promise.all([
    getCompetitionStandings(params),
    getCompetitionTopScorers(params),
    getCompetitionTopAssists(params),
  ]);

  return {
    competition: buildCompetitionId(params),
    standings,
    topScorers,
    topAssists,
  };
}

export const getCompetition = getCompetitionInsights;

// ─── Team ─────────────────────────────────────────────────────────────────────

export async function getTeamOverview(params: {
  teamId: string;
  sport?: string;
  league?: string;
  teamName?: string;
  countryCode?: string;
}): Promise<any> {
  // Server returns enriched Team shape including squad + recent results
  const query = new URLSearchParams();
  if (params.sport) query.set("sport", params.sport);
  if (params.league) query.set("league", params.league);
  if (params.teamName) query.set("teamName", params.teamName);
  if (params.countryCode) query.set("countryCode", params.countryCode);
  const route = `/api/sports/team/${encodeURIComponent(params.teamId)}${query.size ? `?${query.toString()}` : ""}`;
  const raw = await safeFetch(route, null, true);
  if (!raw) return null;
  return enrichTeamDetailPayload(raw);
}

export const getTeam = getTeamOverview;

// ─── Player ───────────────────────────────────────────────────────────────────

export async function getPlayerProfile(playerId: string): Promise<Player | null> {
  const raw = await safeFetch<any>(`/api/sports/player/${encodeURIComponent(playerId)}`, null, true);
  if (!raw) return null;
  const enriched = enrichPlayerProfilePayload(raw);
  return normalizePlayer(enriched);
}

export const getPlayer = getPlayerProfile;

// ─── Match detail ─────────────────────────────────────────────────────────────

export interface RawMatchDetail {
  match: any;
  events?: any[];
  lineups?: any;
  stats?: any;
}

export async function getMatchDetailRaw(params: {
  matchId: string;
  sport?: string;
  league?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params.sport) query.set("sport", params.sport);
  if (params.league) query.set("league", params.league);
  const route = `/api/sports/match/${encodeURIComponent(params.matchId)}${query.size ? `?${query.toString()}` : ""}`;
  return safeFetch<any>(route, null, true);
}

export async function getMatchStream(params: {
  matchId: string;
  league?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params.league) query.set("league", params.league);
  const route = `/api/sports/stream/${encodeURIComponent(params.matchId)}${query.size ? `?${query.toString()}` : ""}`;
  return safeFetch<any>(route, {}, true);
}

export async function getMatchDetail(matchId: string): Promise<MatchDetail | null> {
  const raw = await safeFetch<RawMatchDetail>(`/api/sports/match/${encodeURIComponent(matchId)}`, null as any, true);
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
    isLive: match.status === "live",
    minute: (match as any).minute ?? null,
    events: events.map(e => ({
      minute: e.minute,
      type: e.type,
      team: e.team,
      player: e.playerName ?? undefined,
    })),
    stats: stats?.entries,
  };
}

// ─── React Query key factories ────────────────────────────────────────────────
// Central place for all sports query keys — prevents key collisions between screens.

export const sportKeys = {
  home: () => ["sports", "home"] as const,
  homeByDate: (date: string) => ["sports", "home", date] as const,
  live: () => ["sports", "live"] as const,
  standings: (params: CompetitionInsightParams) => ["sports", "standings", buildCompetitionScopeKey(params)] as const,
  topScorers: (params: CompetitionInsightParams) => ["sports", "topscorers", buildCompetitionScopeKey(params)] as const,
  topAssists: (params: CompetitionInsightParams) => ["sports", "topassists", buildCompetitionScopeKey(params)] as const,
  competitionTeams: (params: CompetitionInsightParams) => ["sports", "teams", buildCompetitionScopeKey(params)] as const,
  competitionMatches: (params: CompetitionInsightParams) => ["sports", "matches", buildCompetitionScopeKey(params)] as const,
  competitionStats: (params: CompetitionInsightParams) => ["sports", "stats", buildCompetitionScopeKey(params)] as const,
  competitionInsights: (params: CompetitionInsightParams) => ["sports", "insights", buildCompetitionScopeKey(params)] as const,
  team: (params: { teamId: string; league?: string; sport?: string; countryCode?: string }) => ["sports", "team", params.teamId, params.sport || "soccer", params.league || "default", params.countryCode || ""] as const,
  player: (playerId: string) => ["sports", "player", playerId] as const,
  matchDetail: (params: { matchId: string; espnLeague?: string; sport?: string }) => ["sports", "match", params.matchId, params.sport || "soccer", params.espnLeague || "default"] as const,
  matchStream: (params: { matchId: string; espnLeague?: string }) => ["sports", "match-stream", params.matchId, params.espnLeague || "default"] as const,
  // Multi-sport keys
  multiSportScoreboard: (sport: string, league?: string, date?: string) =>
    ["sports", "multi", sport, league ?? "all", date ?? "today"] as const,
  multiSportTeams: (sport: string, league: string) =>
    ["sports", "multi", sport, league, "teams"] as const,
  multiSportTeamDetail: (teamId: string, sport: string, league: string) =>
    ["sports", "multi", sport, league, "team", teamId] as const,
  multiSportStandings: (sport: string, league: string) =>
    ["sports", "multi", sport, league, "standings"] as const,
  multiSportGame: (gameId: string, sport: string, league: string) =>
    ["sports", "multi", sport, league, "game", gameId] as const,
  multiSportRankings: (sport: string, league: string) =>
    ["sports", "multi", sport, league, "rankings"] as const,
  espnNews: (sport?: string, league?: string) =>
    ["sports", "news", sport ?? "all", league ?? "all"] as const,
  matchOdds: (matchId: string, sport?: string, league?: string) =>
    ["sports", "odds", matchId, sport ?? "soccer", league ?? "default"] as const,
} as const;

// ─── Multi-sport service functions ───────────────────────────────────────────

interface MultiSportScoreboardResult {
  sport: string;
  date: string;
  leagues: string[];
  live: MultiSportEvent[];
  upcoming: MultiSportEvent[];
  finished: MultiSportEvent[];
  total: number;
}

/**
 * Fetch scoreboard events for any ESPN sport.
 * @param sport  ESPN sport slug — "basketball", "football", "hockey", "baseball", "racing", "tennis", "rugby", "golf", "mma"
 * @param league Optional league slug — "nba", "nfl", "nhl", "mlb", "f1", "atp", etc.
 * @param date   Optional YYYY-MM-DD (defaults to today on server)
 */
export async function getMultiSportScoreboard(
  sport: SportSlug | string,
  league?: string,
  date?: string,
): Promise<MultiSportScoreboardResult> {
  const params = new URLSearchParams({ sport });
  if (league) params.set("league", league);
  if (date) params.set("date", date);
  return safeFetch<MultiSportScoreboardResult>(
    `/api/sports/multisport/scoreboard?${params}`,
    { sport, date: date ?? "", leagues: [], live: [], upcoming: [], finished: [], total: 0 },
    true,
  );
}

/**
 * Fetch ESPN news feed — optionally scoped to a sport and/or league.
 */
export async function getEspnNews(
  sport?: string,
  league?: string,
  limit = 20,
): Promise<EspnNewsItem[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sport) params.set("sport", sport);
  if (league) params.set("league", league);
  return safeFetch<EspnNewsItem[]>(`/api/sports/news?${params}`, [], true);
}

/**
 * Fetch betting odds for a specific match from ESPN core API.
 */
export async function getMatchOdds(
  matchId: string,
  sport = "soccer",
  league = "eng.1",
): Promise<MatchOdds | null> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<MatchOdds | null>(`/api/sports/match/${matchId}/odds?${params}`, null, true);
}

/**
 * Fetch teams list for any ESPN sport/league.
 */
export async function getMultiSportTeams(
  sport: SportSlug | string,
  league: string,
): Promise<MultiSportTeam[]> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<MultiSportTeam[]>(`/api/sports/multisport/teams?${params}`, [], true);
}

/**
 * Fetch standings for any ESPN sport/league.
 */
export async function getMultiSportStandings(
  sport: SportSlug | string,
  league: string,
): Promise<MultiSportStandingEntry[]> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<MultiSportStandingEntry[]>(`/api/sports/multisport/standings?${params}`, [], true);
}

/**
 * Fetch full game detail / box score for any ESPN sport.
 * Uses ESPN's summary endpoint which provides box scores, play-by-play, leaders, and videos.
 * @param gameId ESPN event ID
 * @param sport  ESPN sport slug — "basketball", "football", "hockey", "baseball", etc.
 * @param league ESPN league slug — "nba", "nfl", "nhl", "mlb", etc.
 */
export async function getMultiSportGameDetail(
  gameId: string,
  sport: SportSlug | string,
  league: string,
): Promise<any> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<any>(`/api/sports/multisport/game/${encodeURIComponent(gameId)}?${params}`, null, true);
}

/**
 * Fetch detail for a specific team in any ESPN sport/league.
 * Returns team info, current roster (up to 30 athletes), record, and next scheduled event.
 */
export async function getMultiSportTeamDetail(
  teamId: string,
  sport: SportSlug | string,
  league: string,
): Promise<any> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<any>(`/api/sports/multisport/teams/${encodeURIComponent(teamId)}?${params}`, null, true);
}

/**
 * Fetch rankings / polls for any ESPN sport+league that publishes them.
 * Primarily useful for college-football (AP Top 25, Coaches Poll) and college-basketball.
 */
export async function getMultiSportRankings(
  sport: SportSlug | string,
  league: string,
): Promise<any> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<any>(`/api/sports/multisport/rankings?${params}`, { rankings: [] }, true);
}
