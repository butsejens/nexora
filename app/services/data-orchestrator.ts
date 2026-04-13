import type { QueryClient } from "@tanstack/react-query";
import {
  getMatchDetailRaw,
  getMatchLineupsRaw,
  sportKeys,
} from "@/lib/services/sports-service";
import { seedPlayerPhotos, type PlayerSeed } from "@/lib/image-resolver";

/**
 * Page-only loading mode.
 *
 * Intentionally disables cross-screen prefetching so data is fetched only
 * when the destination page is actually opened.
 */

const PAGE_ONLY_MODE = false;

function logPrefetchBlocked(type: string, payload: Record<string, unknown>) {
  if (!__DEV__ || !PAGE_ONLY_MODE) return;
  console.info(`[page-only] blocked ${type} prefetch`, payload);
}

export interface MatchPrefetchParams {
  matchId: string;
  espnLeague?: string;
  leagueName?: string;
  sport?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  startDate?: string;
}

export function prefetchMatch(
  qc: QueryClient,
  params: MatchPrefetchParams,
): void {
  if (!params.matchId) return;

  const sport = String(params.sport || "soccer");
  const espnLeague = String(params.espnLeague || "");
  const home = String(params.homeTeam || "").trim();
  const away = String(params.awayTeam || "").trim();
  const date = String(params.startDate || "").slice(0, 10);

  void qc.prefetchQuery({
    queryKey: sportKeys.matchDetail({
      matchId: params.matchId,
      espnLeague,
      sport,
    }),
    queryFn: () =>
      getMatchDetailRaw({
        matchId: params.matchId,
        league: espnLeague,
        sport,
      }),
    staleTime: 5_000,
  });

  if (!home || !away) return;

  const lineupScope = {
    matchId: params.matchId,
    espnLeague,
    sport,
    home,
    away,
    date,
  };

  void qc.prefetchQuery({
    queryKey: sportKeys.matchLineups(lineupScope),
    queryFn: async () => {
      const payload = await getMatchLineupsRaw({
        matchId: params.matchId,
        league: espnLeague,
        sport,
        home,
        away,
        date: date || undefined,
      });
      seedLineupsPhotos({
        ...(payload && typeof payload === "object" ? payload : {}),
        homeTeam: home,
        awayTeam: away,
        league: espnLeague,
        sport,
      });
      return payload;
    },
    staleTime: 5_000,
  });
}

export interface TeamPrefetchParams {
  teamId: string;
  sport?: string;
  league?: string;
  teamName?: string;
  countryCode?: string;
}

export function prefetchTeam(
  _qc: QueryClient,
  params: TeamPrefetchParams,
): void {
  logPrefetchBlocked("team", {
    teamId: params.teamId,
    league: params.league || "",
  });
}

export interface PlayerPrefetchParams {
  playerId: string;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
  photo?: string;
  theSportsDbPhoto?: string;
}

export function prefetchPlayer(
  _qc: QueryClient,
  params: PlayerPrefetchParams,
): void {
  logPrefetchBlocked("player", {
    playerId: params.playerId,
    league: params.league || "",
  });
}

function normalizeLineupTeams(raw: any): any[] {
  if (Array.isArray(raw?.lineups)) return raw.lineups;
  if (raw?.home || raw?.away) return [raw.home, raw.away].filter(Boolean);
  if (Array.isArray(raw)) return raw;
  return [];
}

function toPlayerSeed(
  player: any,
  team: string,
  league: string,
  sport: string,
): PlayerSeed | null {
  const name = String(player?.name || "").trim();
  if (!name) return null;
  return {
    id: String(player?.id || "").trim() || undefined,
    name,
    team,
    league,
    sport,
    photo:
      player?.photo ||
      player?.image ||
      player?.headshot ||
      player?.avatar ||
      null,
    photoSource: player?.photoSource || null,
    theSportsDbPhoto: player?.theSportsDbPhoto || null,
    photoCandidates: Array.isArray(player?.photoCandidates)
      ? player.photoCandidates
      : null,
  };
}

export function seedLineupsPhotos(_lineups: {
  home?: { players?: any[] };
  away?: { players?: any[] };
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  sport?: string;
}): void {
  const teams = normalizeLineupTeams(_lineups);
  if (!teams.length) return;

  const league = String(_lineups.league || "");
  const sport = String(_lineups.sport || "soccer");
  const fallbackNames = [
    String(_lineups.homeTeam || ""),
    String(_lineups.awayTeam || ""),
  ];

  const seeds = teams
    .flatMap((team: any, index: number) => {
      const teamName = String(team?.team || fallbackNames[index] || "");
      return [...(team?.players || []), ...(team?.bench || [])]
        .map((player: any) => toPlayerSeed(player, teamName, league, sport))
        .filter(Boolean);
    })
    .filter(Boolean) as PlayerSeed[];

  if (!seeds.length) return;
  seedPlayerPhotos(seeds);
}
