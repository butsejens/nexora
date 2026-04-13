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
  normalizeTeamDNA,
  normalizeLiveMatchIntelligence,
  normalizeAIMatchExplanation,
  normalizePlayerMarketValue,
  normalizeMatchIntelligence,
  type NormalizedLeaderboardRow,
} from "@/lib/domain/normalizers";
import { deduplicateLeaderboard } from "@/lib/domain/identity-resolver";
import {
  fetchSportsLeagueResourceWithFallback,
  getLeaderboardRows,
} from "@/lib/sports-data";
import {
  enrichPlayerProfilePayload,
  enrichTeamDetailPayload,
} from "@/lib/sports-enrichment";
import { getSourcePriority, normalizePolicySource } from "@/lib/source-policy";
import {
  resolveFromSources,
  scoreByArrayBuckets,
  scoreByFilledFields,
} from "@/lib/services/sports-resolver";
import {
  resolvePlayerProfile,
  type PlayerProfileParams,
  type ResolvedPlayerProfile,
} from "@/lib/services/player-resolver";
export type {
  PlayerProfileParams,
  ResolvedPlayerProfile,
} from "@/lib/services/player-resolver";
import { getMatchdayYmd } from "@/lib/date/matchday";
import { generateAiMatchStoryCard } from "@/lib/ai/aiMatchStoryGenerator";
import { buildMatchIntelligence } from "@/lib/ai/match-intelligence";
import type { MatchAnalysisInput as EngineAnalysisInput } from "@/lib/match-analysis-engine";
import type {
  Match,
  MatchDetail,
  MatchEvent,
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
  TeamDNA,
  LiveMatchIntelligence,
  AIMatchExplanation,
  PlayerMarketValue,
  MatchIntelligenceModel,
} from "@/lib/domain/models";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function safeFetch<T>(
  route: string,
  fallback?: T,
  allowFallback = false,
): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = new Error(
        `[nexora:sports] HTTP ${res.status} for ${route} ${body}`.trim(),
      );
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

function unwrapApiEnvelope<T>(raw: any): T {
  if (
    raw &&
    typeof raw === "object" &&
    raw.ok !== undefined &&
    raw.data !== undefined
  ) {
    return raw.data as T;
  }
  // Reject legacy error shapes that lack the `ok` envelope (e.g. {"error":"..."})
  if (raw && typeof raw === "object" && raw.error && raw.ok === undefined) {
    return null as T;
  }
  return raw as T;
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
  const resolved = await resolveFromSources<SportsHomeData>({
    strategy: "sports-home",
    sources: [
      {
        source: "by-date",
        load: async () => {
          const raw = await safeFetch<any>(
            `/api/sports/by-date?date=${encodeURIComponent(today)}`,
            {},
            true,
          );
          return normalizeSportsHomePayload(raw);
        },
      },
      {
        source: "live",
        load: async () => {
          const raw = await safeFetch<any>("/api/sports/live", {}, true);
          return normalizeSportsHomePayload(raw);
        },
      },
    ],
    isUsable: hasSportsData,
    score: scoreByArrayBuckets,
    merge: (primary, secondary) => mergeSportsPayloads(primary, secondary),
    debug: true,
  });

  return resolved.data ?? { live: [], upcoming: [], finished: [] };
}

export async function getSportsByDate(
  dateYmd: string,
): Promise<SportsHomeData> {
  const isToday = dateYmd === getMatchdayYmd();
  const resolved = await resolveFromSources<SportsHomeData>({
    strategy: "sports-by-date",
    sources: [
      {
        source: "by-date",
        load: async () => {
          const raw = await safeFetch<any>(
            `/api/sports/by-date?date=${encodeURIComponent(dateYmd)}`,
            {},
            true,
          );
          return normalizeSportsHomePayload(raw);
        },
      },
      ...(isToday
        ? [
            {
              source: "live",
              load: async () => {
                const raw = await safeFetch<any>("/api/sports/live", {}, true);
                return normalizeSportsHomePayload(raw);
              },
            },
          ]
        : []),
    ],
    isUsable: hasSportsData,
    score: scoreByArrayBuckets,
    merge: (primary, secondary) => mergeSportsPayloads(primary, secondary),
    debug: true,
  });

  return resolved.data ?? { live: [], upcoming: [], finished: [] };
}

export async function getSportsLive(): Promise<SportsHomeData> {
  const today = getMatchdayYmd();
  const resolved = await resolveFromSources<SportsHomeData>({
    strategy: "sports-live",
    sources: [
      {
        source: "live",
        load: async () => {
          const raw = await safeFetch<any>("/api/sports/live", {}, true);
          return normalizeSportsHomePayload(raw);
        },
      },
      {
        source: "by-date",
        load: async () => {
          const raw = await safeFetch<any>(
            `/api/sports/by-date?date=${encodeURIComponent(today)}`,
            {},
            true,
          );
          return normalizeSportsHomePayload(raw);
        },
      },
    ],
    isUsable: hasSportsData,
    score: scoreByArrayBuckets,
    merge: (primary, secondary) => mergeSportsPayloads(primary, secondary),
    debug: true,
  });

  return resolved.data ?? { live: [], upcoming: [], finished: [] };
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

  // Unwrap canonical envelope { ok, data, meta } from modular routes
  const payload = raw?.data && raw?.ok !== undefined ? raw.data : raw;

  // Trust server-side bucketing; avoids client-side status drift when upstream
  // providers use non-standard status/detail combinations.
  return {
    live: mapList(payload?.live),
    upcoming: mapList(payload?.upcoming),
    finished: mapList(payload?.finished),
  };
}

function hasSportsData(payload: SportsHomeData): boolean {
  return (
    payload.live.length + payload.upcoming.length + payload.finished.length > 0
  );
}

function mergeSportsPayloads(
  primary: SportsHomeData,
  secondary: SportsHomeData,
): SportsHomeData {
  const deduped = new Map<string, Match>();
  for (const item of [
    ...primary.live,
    ...primary.upcoming,
    ...primary.finished,
    ...secondary.live,
    ...secondary.upcoming,
    ...secondary.finished,
  ]) {
    if (!item?.id) continue;
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }

  const all = [...deduped.values()];
  return {
    live: all.filter(
      (match) => match.status === "live" || match.status === "halftime",
    ),
    upcoming: all.filter((match) => match.status === "scheduled"),
    finished: all.filter((match) => match.status === "finished"),
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
  apiRequest("GET", "/api/sports/prefetch-home").catch(() => {
    /* fire and forget */
  });
}

// ─── Competition ──────────────────────────────────────────────────────────────

export interface CompetitionOverview {
  competition: CompetitionId;
  standings: TeamStanding[];
  topScorers: NormalizedLeaderboardRow[];
  topAssists: NormalizedLeaderboardRow[];
  phases?: any[];
  allStandings?: any[];
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
  const normalized = rows.map((r) =>
    normalizeLeaderboardRow(r, "topscorers", compId),
  );
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
  const normalized = rows.map((r) =>
    normalizeLeaderboardRow(r, "topassists", compId),
  );
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
  const raw = await fetchSportsLeagueResourceWithFallback(
    "competition-matches",
    {
      leagueName: params.leagueName,
      espnLeague: params.espnLeague,
    },
  );
  if (!Array.isArray(raw?.matches)) return [];
  const normalized: Match[] = (raw.matches as any[]).map(
    normalizeMatchFromServer,
  );
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

export async function getCompetitionInsights(
  params: CompetitionInsightParams,
): Promise<CompetitionOverview> {
  const [rawStandings, topScorers, topAssists] = await Promise.all([
    fetchSportsLeagueResourceWithFallback("standings", {
      leagueName: params.leagueName,
      espnLeague: params.espnLeague,
    }),
    getCompetitionTopScorers(params),
    getCompetitionTopAssists(params),
  ]);

  const standings = normalizeStandings(
    rawStandings?.standings ?? [],
    buildCompetitionId(params),
  );

  return {
    competition: buildCompetitionId(params),
    standings,
    topScorers,
    topAssists,
    phases: Array.isArray(rawStandings?.phases)
      ? rawStandings.phases
      : undefined,
    allStandings: Array.isArray(rawStandings?.allStandings)
      ? rawStandings.allStandings
      : undefined,
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
  const query = new URLSearchParams();
  if (params.sport) query.set("sport", params.sport);
  if (params.league) query.set("league", params.league);
  if (params.teamName) query.set("teamName", params.teamName);
  if (params.countryCode) query.set("countryCode", params.countryCode);

  const routeWithContext = `/api/sports/team/${encodeURIComponent(params.teamId)}${query.size ? `?${query.toString()}` : ""}`;
  const routeBasic = `/api/sports/team/${encodeURIComponent(params.teamId)}`;

  const resolved = await resolveFromSources<any>({
    strategy: "team-overview",
    sources: [
      {
        source: "team-context",
        load: async () => {
          const raw = await safeFetch(routeWithContext, null, true);
          return raw ? enrichTeamDetailPayload(raw) : null;
        },
      },
      {
        source: "team-basic",
        load: async () => {
          const raw = await safeFetch(routeBasic, null, true);
          return raw ? enrichTeamDetailPayload(raw) : null;
        },
      },
    ],
    isUsable: (value) => Boolean(value?.id || value?.name),
    score: (value) =>
      scoreByFilledFields(value, [
        "name",
        "logo",
        "players",
        "recentResults",
        "venue",
        "coach",
      ]),
    stopOnFirstUsable: true,
    stopOnScore: 0.7,
    debug: true,
  });

  return resolved.data;
}

export const getTeam = getTeamOverview;

// ─── Player ───────────────────────────────────────────────────────────────────

function buildPlayerScopeKey(
  params: string | PlayerProfileParams,
): readonly [string, string, string, string, string] {
  if (typeof params === "string") {
    return [params, "", "", "default", "soccer"] as const;
  }
  return [
    params.playerId,
    String(params.name || "")
      .trim()
      .toLowerCase(),
    String(params.team || "")
      .trim()
      .toLowerCase(),
    String(params.league || "default")
      .trim()
      .toLowerCase(),
    String(params.sport || "soccer")
      .trim()
      .toLowerCase(),
  ] as const;
}

export async function getPlayerProfile(
  playerIdOrParams: string | PlayerProfileParams,
): Promise<ResolvedPlayerProfile | null> {
  const params: PlayerProfileParams =
    typeof playerIdOrParams === "string"
      ? { playerId: playerIdOrParams }
      : playerIdOrParams;
  return resolvePlayerProfile(params);
}

export const getPlayer = getPlayerProfile;

// ─── Match detail ─────────────────────────────────────────────────────────────

export interface RawMatchDetail {
  match: any;
  events?: any[];
  lineups?: any;
  stats?: any;
  starters?: any;
}

export async function getMatchDetailRaw(params: {
  matchId: string;
  sport?: string;
  league?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params.sport) query.set("sport", params.sport);
  if (params.league) query.set("league", params.league);
  const routeWithContext = `/api/sports/match/${encodeURIComponent(params.matchId)}${query.size ? `?${query.toString()}` : ""}`;
  const routeBasic = `/api/sports/match/${encodeURIComponent(params.matchId)}`;

  const resolved = await resolveFromSources<any>({
    strategy: "match-detail-raw",
    sources: [
      {
        source: "match-context",
        load: async () => {
          const raw = await safeFetch<any>(routeWithContext, null, true);
          return unwrapApiEnvelope<any>(raw);
        },
      },
      {
        source: "match-basic",
        load: async () => {
          const raw = await safeFetch<any>(routeBasic, null, true);
          return unwrapApiEnvelope<any>(raw);
        },
      },
    ],
    isUsable: (value) => Boolean(value?.match || value?.id),
    score: (value) =>
      scoreByFilledFields(value?.match ?? value, [
        "id",
        "status",
        "homeTeam",
        "awayTeam",
        "events",
        "lineups",
      ]),
    stopOnFirstUsable: true,
    stopOnScore: 0.65,
    debug: true,
  });

  return resolved.data;
}

export async function getMatchLineupsRaw(params: {
  matchId: string;
  sport?: string;
  league?: string;
  home?: string;
  away?: string;
  date?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params.sport) query.set("sport", params.sport);
  if (params.league) query.set("league", params.league);
  if (params.home) query.set("home", params.home);
  if (params.away) query.set("away", params.away);
  if (params.date) query.set("date", params.date);
  const routeLineups = `/api/sports/match/${encodeURIComponent(params.matchId)}/lineups${query.size ? `?${query.toString()}` : ""}`;
  const routeMatch = `/api/sports/match/${encodeURIComponent(params.matchId)}${query.size ? `?${query.toString()}` : ""}`;

  const resolved = await resolveFromSources<any>({
    strategy: "match-lineups-raw",
    sources: [
      {
        source: "lineups-endpoint",
        load: async () => {
          const raw = await safeFetch<any>(routeLineups, null, true);
          return unwrapApiEnvelope<any>(raw);
        },
      },
      {
        source: "match-detail-endpoint",
        load: async () => {
          const raw = await safeFetch<any>(routeMatch, null, true);
          const payload = unwrapApiEnvelope<any>(raw);
          const lineups =
            payload?.lineups ?? payload?.starters ?? payload ?? null;
          if (!lineups) return null;
          return {
            lineups,
            source:
              Array.isArray(payload?.meta?.mergedSources) &&
              payload.meta.mergedSources.includes("sofascore")
                ? "sofascore"
                : "espn",
          };
        },
      },
    ],
    isUsable: (value) =>
      Boolean(
        (Array.isArray(value?.lineups) && value.lineups.length > 0) ||
        value?.lineups?.home ||
        value?.lineups?.away ||
        value?.home ||
        value?.away,
      ),
    score: (value) => {
      const rawLineups = value?.lineups ?? value;
      let completeness = 0;

      if (Array.isArray(rawLineups)) {
        const total = rawLineups.reduce(
          (acc: number, t: any) => acc + (t?.players?.length || 0),
          0,
        );
        if (total >= 22) completeness = 1;
        else if (total >= 11) completeness = 0.7;
        else if (total >= 1) completeness = 0.4;
      } else {
        completeness = scoreByFilledFields(rawLineups, ["home", "away"]);
      }

      const sourceScore = Math.max(
        0.25,
        1 -
          getSourcePriority(
            "match-lineups",
            normalizePolicySource(value?.source || "espn"),
          ) *
            0.2,
      );
      return Math.min(1, completeness * 0.65 + sourceScore * 0.35);
    },
    stopOnFirstUsable: true,
    stopOnScore: 0.9,
    debug: true,
  });

  return resolved.data?.lineups ?? resolved.data;
}

export async function getMatchStream(params: {
  matchId: string;
  league?: string;
  home?: string;
  away?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params.league) query.set("league", params.league);
  if (params.home) query.set("home", params.home);
  if (params.away) query.set("away", params.away);
  const route = `/api/sports/stream/${encodeURIComponent(params.matchId)}${query.size ? `?${query.toString()}` : ""}`;
  const raw = await safeFetch<any>(route, {}, true);
  const result = unwrapApiEnvelope<any>(raw);
  // Reject stale embed placeholders from old Render fallback
  if (result?.url && /embedme/i.test(result.url)) {
    return { ...result, url: null, rejected: "embed" };
  }
  return result;
}

export async function getMatchDetail(
  matchId: string,
): Promise<MatchDetail | null> {
  const rawEnvelope = await safeFetch<RawMatchDetail>(
    `/api/sports/match/${encodeURIComponent(matchId)}`,
    null as any,
    true,
  );
  const raw = unwrapApiEnvelope<RawMatchDetail>(rawEnvelope);
  if (!raw?.match && !raw) return null;

  const matchRaw = raw?.match ?? raw;
  const match = normalizeMatchFromServer(matchRaw);
  const events = normalizeMatchEvents(
    raw?.events ?? matchRaw?.events ?? [],
    match.id,
  );
  const lineups = normalizeMatchLineups(
    raw?.lineups ??
      matchRaw?.lineups ??
      matchRaw?.starters ??
      raw?.starters ??
      null,
    match.id,
    {
      homeTeamName: matchRaw?.homeTeam || match?.homeTeam?.name || "",
      awayTeamName: matchRaw?.awayTeam || match?.awayTeam?.name || "",
    },
  );

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
  events: MatchEvent[],
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
    events: events.map((e) => ({
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
  standings: (params: CompetitionInsightParams) =>
    ["sports", "standings", buildCompetitionScopeKey(params)] as const,
  topScorers: (params: CompetitionInsightParams) =>
    ["sports", "topscorers", buildCompetitionScopeKey(params)] as const,
  topAssists: (params: CompetitionInsightParams) =>
    ["sports", "topassists", buildCompetitionScopeKey(params)] as const,
  competitionTeams: (params: CompetitionInsightParams) =>
    ["sports", "teams", buildCompetitionScopeKey(params)] as const,
  competitionMatches: (params: CompetitionInsightParams) =>
    ["sports", "matches", buildCompetitionScopeKey(params)] as const,
  competitionStats: (params: CompetitionInsightParams) =>
    ["sports", "stats", buildCompetitionScopeKey(params)] as const,
  competitionInsights: (params: CompetitionInsightParams) =>
    ["sports", "insights", buildCompetitionScopeKey(params)] as const,
  team: (params: {
    teamId: string;
    league?: string;
    sport?: string;
    countryCode?: string;
  }) =>
    [
      "sports",
      "team",
      params.teamId,
      params.sport || "soccer",
      params.league || "default",
      params.countryCode || "",
    ] as const,
  player: (params: string | PlayerProfileParams) =>
    ["sports", "player", ...buildPlayerScopeKey(params)] as const,
  matchDetail: (params: {
    matchId: string;
    espnLeague?: string;
    sport?: string;
  }) =>
    [
      "sports",
      "match",
      params.matchId,
      params.sport || "soccer",
      params.espnLeague || "default",
    ] as const,
  matchLineups: (params: {
    matchId: string;
    espnLeague?: string;
    sport?: string;
    home?: string;
    away?: string;
    date?: string;
  }) =>
    [
      "sports",
      "match-lineups",
      params.matchId,
      params.sport || "soccer",
      params.espnLeague || "default",
      params.home || "",
      params.away || "",
      params.date || "",
    ] as const,
  matchStream: (params: { matchId: string; espnLeague?: string }) =>
    [
      "sports",
      "match-stream",
      params.matchId,
      params.espnLeague || "default",
    ] as const,
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
    [
      "sports",
      "odds",
      matchId,
      sport ?? "soccer",
      league ?? "default",
    ] as const,
  matchPrediction: (matchId: string, espnLeague?: string) =>
    ["sports", "predict", matchId, espnLeague ?? "default"] as const,
  // ─── New feature keys ──────────────────────────────────────────────────────
  teamDNA: (params: { teamId: string; league?: string; sport?: string }) =>
    [
      "sports",
      "team-dna",
      params.teamId,
      params.sport ?? "soccer",
      params.league ?? "default",
    ] as const,
  matchIntelligence: (params: {
    matchId: string;
    espnLeague?: string;
    sport?: string;
  }) =>
    [
      "sports",
      "intelligence",
      params.matchId,
      params.sport ?? "soccer",
      params.espnLeague ?? "default",
    ] as const,
  matchExplanation: (params: {
    matchId: string;
    phase?: string;
    espnLeague?: string;
  }) =>
    [
      "sports",
      "explanation",
      params.matchId,
      params.phase ?? "prematch",
      params.espnLeague ?? "default",
    ] as const,
  playerMarketValue: (params: string | PlayerProfileParams) =>
    ["sports", "player-value", ...buildPlayerScopeKey(params)] as const,
  unifiedIntelligence: (matchId: string) =>
    ["sports", "unified-intelligence", matchId] as const,
  matchDetailFull: (params: {
    matchId: string;
    espnLeague?: string;
    sport?: string;
  }) =>
    [
      "sports",
      "match-full",
      params.matchId,
      params.sport ?? "soccer",
      params.espnLeague ?? "default",
    ] as const,
} as const;

// ─── Team DNA ─────────────────────────────────────────────────────────────────

/**
 * Fetch Team DNA — tactical fingerprint built from ESPN season stats.
 * Includes pressing intensity, possession style, attack width, formation.
 */
export async function getTeamDNA(params: {
  teamId: string;
  sport?: string;
  league?: string;
  season?: number;
}): Promise<TeamDNA | null> {
  const query = new URLSearchParams();
  if (params.sport) query.set("sport", params.sport);
  if (params.league) query.set("league", params.league);
  if (params.season) query.set("season", String(params.season));
  const route = `/api/sports/team/${encodeURIComponent(params.teamId)}/dna${query.size ? `?${query.toString()}` : ""}`;
  const raw = await safeFetch<any>(route, null, true);
  const data = unwrapApiEnvelope<any>(raw);
  if (!data) return null;
  return normalizeTeamDNA(data);
}

// ─── Live Match Intelligence ──────────────────────────────────────────────────

/**
 * Fetch live match intelligence: momentum model, threat levels, stats
 * comparison, and narrative from ESPN match summary data.
 *
 * For live matches: 30s TTL (handled server-side).
 * For finished matches: serves reconstructed intelligence from final stats.
 */
export async function getLiveMatchIntelligence(params: {
  matchId: string;
  espnLeague?: string;
  sport?: string;
}): Promise<LiveMatchIntelligence | null> {
  const query = new URLSearchParams();
  if (params.espnLeague) query.set("league", params.espnLeague);
  if (params.sport) query.set("sport", params.sport);
  const route = `/api/sports/match/${encodeURIComponent(params.matchId)}/intelligence${query.size ? `?${query.toString()}` : ""}`;
  const raw = await safeFetch<any>(route, null, true);
  const data = unwrapApiEnvelope<any>(raw);
  if (!data) return null;
  return normalizeLiveMatchIntelligence(data, params.matchId);
}

// ─── AI Match Explanation ─────────────────────────────────────────────────────

/**
 * Generate an AI match explanation from the local match analysis engine.
 * This is computed CLIENT-SIDE — no server call needed.
 * Wraps aiMatchStoryGenerator into the normalized AIMatchExplanation model.
 */
export function generateMatchExplanation(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isLive: boolean;
  minute?: number | null;
  status?: string;
  prediction?: any | null;
  liveStory?: any | null;
}): AIMatchExplanation {
  const phase: AIMatchExplanation["phase"] = params.isLive
    ? params.minute != null && params.minute >= 45 && params.minute < 90
      ? "halftime"
      : "live"
    : params.homeScore != null
      ? "fulltime"
      : "prematch";

  const storyCard = generateAiMatchStoryCard({
    prediction: params.prediction,
    liveStory: params.liveStory,
    isLive: params.isLive,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
  });

  const headline =
    storyCard?.title ?? `${params.homeTeam} vs ${params.awayTeam}`;
  const summary =
    storyCard?.summary ??
    `A ${phase === "prematch" ? "prematch preview" : "match analysis"} for ${params.homeTeam} vs ${params.awayTeam}.`;

  const dataSignals = {
    form: Boolean(params.prediction?.dataSignals?.form),
    standings: Boolean(params.prediction?.dataSignals?.standings),
    lineups: Boolean(params.prediction?.dataSignals?.lineups),
    liveStats: Boolean(
      params.isLive && params.prediction?.dataSignals?.liveStats,
    ),
    headToHead: Boolean(params.prediction?.dataSignals?.headToHead),
    injuries: Boolean(params.prediction?.dataSignals?.injuries),
  };

  const confidence = Object.values(dataSignals).filter(Boolean).length / 6;

  return normalizeAIMatchExplanation(
    {
      phase,
      headline,
      summary,
      keyFactors: storyCard?.keyFactors ?? [],
      dataSignals,
      confidence,
      generatedAt: new Date().toISOString(),
    },
    params.matchId,
  );
}

// ─── Match Intelligence ───────────────────────────────────────────────────────

/**
 * Build unified AI match intelligence from a MatchAnalysisInput.
 * Computed CLIENT-SIDE — combines prediction, match rating, hot team,
 * upset alert, momentum, and post-match explainer into one shape.
 */
export function getMatchIntelligence(params: {
  matchId: string;
  analysisInput: EngineAnalysisInput;
}): MatchIntelligenceModel {
  const raw = buildMatchIntelligence(params.analysisInput);
  return normalizeMatchIntelligence(raw, params.matchId);
}

// ─── Player Market Value ──────────────────────────────────────────────────────

/**
 * Fetch player market value — resolves via the server's player profile endpoint
 * which already aggregates Transfermarkt + TheSportsDB market value signals.
 */
export async function getPlayerMarketValue(params: {
  playerId: string;
  name?: string;
  team?: string;
  league?: string;
}): Promise<PlayerMarketValue | null> {
  const profile = await resolvePlayerProfile({
    playerId: params.playerId,
    name: params.name,
    team: params.team,
    league: params.league,
  });
  if (!profile) return null;
  return normalizePlayerMarketValue(
    {
      numericValue: profile.marketValueNumeric ?? null,
      displayValue: profile.marketValue ?? null,
      playerName: profile.name ?? params.name,
      source: profile.valueSource ?? profile.valueMethod ?? profile.source,
      history: profile.marketValueHistory ?? null,
    },
    params.playerId,
  );
}

// ─── Full Match Detail Bundle ─────────────────────────────────────────────────

/**
 * Fetch match + lineups + stats in a single function call.
 * Uses parallel fetches for speed — all 3 round trips fire simultaneously.
 * On success: returns a complete MatchDetail with all sub-resources filled.
 * On partial failure: returns what's available (lineups/stats may be null).
 */
export async function getMatchDetailFull(params: {
  matchId: string;
  espnLeague?: string;
  sport?: string;
  home?: string;
  away?: string;
  date?: string;
}): Promise<MatchDetail | null> {
  const [detailRaw, lineupsRaw] = await Promise.all([
    getMatchDetailRaw({
      matchId: params.matchId,
      sport: params.sport,
      league: params.espnLeague,
    }),
    getMatchLineupsRaw({
      matchId: params.matchId,
      sport: params.sport,
      league: params.espnLeague,
      home: params.home,
      away: params.away,
      date: params.date,
    }).catch(() => null),
  ]);

  if (!detailRaw?.match && !detailRaw) return null;

  const matchRaw = detailRaw?.match ?? detailRaw;
  const match = normalizeMatchFromServer(matchRaw);
  const events = normalizeMatchEvents(
    detailRaw?.events ?? matchRaw?.events ?? [],
    match.id,
  );

  // Prefer server-bundled lineups, fall back to separate call
  const lineupsSource =
    detailRaw?.lineups ??
    matchRaw?.lineups ??
    matchRaw?.starters ??
    detailRaw?.starters ??
    lineupsRaw ??
    null;

  const lineups = normalizeMatchLineups(lineupsSource, match.id, {
    homeTeamName: matchRaw?.homeTeam || match?.homeTeam?.name || "",
    awayTeamName: matchRaw?.awayTeam || match?.awayTeam?.name || "",
  });

  let stats: MatchStats | null = null;
  const rawStats = detailRaw?.stats ?? matchRaw?.stats;
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
    {
      sport,
      date: date ?? "",
      leagues: [],
      live: [],
      upcoming: [],
      finished: [],
      total: 0,
    },
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
  return safeFetch<MatchOdds | null>(
    `/api/sports/match/${matchId}/odds?${params}`,
    null,
    true,
  );
}

// ─── Poisson prediction ───────────────────────────────────────────────────────

export interface PoissonPrediction {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  xG: { home: number; away: number; total: number };
  oneXTwo: { homeWin: number; draw: number; awayWin: number };
  goals: {
    over15?: number;
    under15?: number;
    over25: number;
    under25: number;
    over35?: number;
    under35?: number;
    btts: number;
  };
  doubleChance?: { homeOrDraw: number; awayOrDraw: number };
  cleanSheet?: { home: number; away: number };
  predictedScore?: string;
  topScores?: Array<{ home: number; away: number; pct: number }>;
  favoredSide?: "home" | "away" | "draw";
  verdict?: string;
  confidence: number;
  model: string;
  leagueAvgGoals: number;
  riskFactors: string[];
  form?: {
    home: {
      matches: number;
      goalsFor: number;
      goalsAgainst: number;
      record: string;
    } | null;
    away: {
      matches: number;
      goalsFor: number;
      goalsAgainst: number;
      record: string;
    } | null;
  };
  standings: {
    home: {
      rank: number;
      played: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
    } | null;
    away: {
      rank: number;
      played: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
    } | null;
  };
}

/**
 * Fetch server-side Poisson prediction for a match.
 * Uses real ESPN standings to compute attack/defence strengths.
 */
export async function getMatchPrediction(params: {
  matchId: string;
  espnLeague?: string;
  homeTeam?: string;
  awayTeam?: string;
  sport?: string;
}): Promise<PoissonPrediction | null> {
  const qs = new URLSearchParams();
  if (params.espnLeague) qs.set("league", params.espnLeague);
  if (params.homeTeam) qs.set("home", params.homeTeam);
  if (params.awayTeam) qs.set("away", params.awayTeam);
  if (params.sport) qs.set("sport", params.sport);
  const route = `/api/sports/match/${encodeURIComponent(params.matchId)}/predict${qs.toString() ? `?${qs}` : ""}`;
  const raw = await safeFetch<
    { ok: boolean; data?: PoissonPrediction } | PoissonPrediction | null
  >(route, null, true);
  if (!raw) return null;
  // Unwrap envelope if present
  if (
    "ok" in (raw as object) &&
    (raw as { ok: boolean; data?: PoissonPrediction }).data
  ) {
    return (raw as { ok: boolean; data: PoissonPrediction }).data;
  }
  return raw as PoissonPrediction;
}

/**
 * Fetch teams list for any ESPN sport/league.
 */
export async function getMultiSportTeams(
  sport: SportSlug | string,
  league: string,
): Promise<MultiSportTeam[]> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<MultiSportTeam[]>(
    `/api/sports/multisport/teams?${params}`,
    [],
    true,
  );
}

/**
 * Fetch standings for any ESPN sport/league.
 */
export async function getMultiSportStandings(
  sport: SportSlug | string,
  league: string,
): Promise<MultiSportStandingEntry[]> {
  const params = new URLSearchParams({ sport, league });
  return safeFetch<MultiSportStandingEntry[]>(
    `/api/sports/multisport/standings?${params}`,
    [],
    true,
  );
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
  return safeFetch<any>(
    `/api/sports/multisport/game/${encodeURIComponent(gameId)}?${params}`,
    null,
    true,
  );
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
  return safeFetch<any>(
    `/api/sports/multisport/teams/${encodeURIComponent(teamId)}?${params}`,
    null,
    true,
  );
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
  return safeFetch<any>(
    `/api/sports/multisport/rankings?${params}`,
    { rankings: [] },
    true,
  );
}
