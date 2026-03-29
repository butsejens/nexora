import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getCompetitionInsights,
  getCompetitionMatches,
  getTeamOverview,
  sportKeys,
} from "@/lib/services/sports-service";
import { normalizeTeamName } from "@/lib/entity-normalization";

type TeamResult = "W" | "D" | "L";

type RecentResult = {
  id: string;
  date: string | null;
  opponent: string;
  isHome: boolean;
  homeScore: number;
  awayScore: number;
  result: TeamResult;
};

type TeamFormSummary = {
  results: RecentResult[];
  sequence: TeamResult[];
  goalsScored: number;
  goalsConceded: number;
  aiFormScore: number;
};

type ComparisonMetric = {
  key: string;
  label: string;
  home: number | null;
  away: number | null;
  suffix?: string;
  decimals?: number;
};

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: unknown): number {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function sameTeam(a: unknown, b: unknown): boolean {
  const aa = normalizeTeamName(String(a || ""));
  const bb = normalizeTeamName(String(b || ""));
  if (!aa || !bb) return false;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

function computeResult(isHome: boolean, homeScore: number, awayScore: number): TeamResult {
  if (homeScore === awayScore) return "D";
  const win = isHome ? homeScore > awayScore : awayScore > homeScore;
  return win ? "W" : "L";
}

function computeFormScore(sequence: TeamResult[]): number {
  if (!sequence.length) return 0;
  const weights = [1, 1.15, 1.3, 1.45, 1.6];
  const points = sequence.reduce((acc, result, idx) => {
    const value = result === "W" ? 3 : result === "D" ? 1 : 0;
    return acc + value * weights[idx]!
  }, 0);
  const maxPoints = weights.reduce((acc, w) => acc + 3 * w, 0);
  return Math.round((points / maxPoints) * 100);
}

function pickTopContribution(players: any[]): any | null {
  if (!Array.isArray(players) || players.length === 0) return null;
  const scored = players
    .map((player) => {
      const goals = toNum(player?.seasonStats?.goals ?? player?.goals) || 0;
      const assists = toNum(player?.seasonStats?.assists ?? player?.assists) || 0;
      const rating = toNum(player?.seasonStats?.rating ?? player?.rating) || 0;
      const score = goals * 3 + assists * 2 + rating;
      return { player, score, goals, assists, rating };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0] || null;
}

function readStat(stats: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNum(stats?.[key]);
    if (value != null) return value;
  }
  return null;
}

export function useStandings(params: {
  leagueName: string;
  espnLeague: string;
  sport?: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const query = useQuery({
    queryKey: sportKeys.competitionInsights({
      leagueName: params.leagueName,
      espnLeague: params.espnLeague,
      sport: params.sport || "soccer",
    }),
    queryFn: () => getCompetitionInsights({
      leagueName: params.leagueName,
      espnLeague: params.espnLeague,
      sport: params.sport || "soccer",
    }),
    enabled: Boolean(params.espnLeague || params.leagueName),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const standings = useMemo(() => Array.isArray(query.data?.standings) ? query.data!.standings : [], [query.data]);
  const homeStanding = useMemo(
    () => standings.find((row: any) => sameTeam(row?.team, params.homeTeam)) || null,
    [standings, params.homeTeam],
  );
  const awayStanding = useMemo(
    () => standings.find((row: any) => sameTeam(row?.team, params.awayTeam)) || null,
    [standings, params.awayTeam],
  );

  return {
    ...query,
    standings,
    homeStanding,
    awayStanding,
  };
}

export function useTeamForm(params: {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeam: string;
  awayTeam: string;
  espnLeague: string;
  sport?: string;
}) {
  const homeTeamLookupId = String(params.homeTeamId || "").trim() || `name:${encodeURIComponent(String(params.homeTeam || ""))}`;
  const awayTeamLookupId = String(params.awayTeamId || "").trim() || `name:${encodeURIComponent(String(params.awayTeam || ""))}`;

  const homeQuery = useQuery({
    queryKey: sportKeys.team({
      teamId: homeTeamLookupId,
      league: params.espnLeague,
      sport: params.sport || "soccer",
    }),
    queryFn: () => getTeamOverview({
      teamId: homeTeamLookupId,
      league: params.espnLeague,
      sport: params.sport || "soccer",
      teamName: params.homeTeam,
    }),
    enabled: Boolean(homeTeamLookupId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const awayQuery = useQuery({
    queryKey: sportKeys.team({
      teamId: awayTeamLookupId,
      league: params.espnLeague,
      sport: params.sport || "soccer",
    }),
    queryFn: () => getTeamOverview({
      teamId: awayTeamLookupId,
      league: params.espnLeague,
      sport: params.sport || "soccer",
      teamName: params.awayTeam,
    }),
    enabled: Boolean(awayTeamLookupId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const normalizeRecent = (rows: any[]): TeamFormSummary => {
    const sorted = [...(Array.isArray(rows) ? rows : [])]
      .sort((a, b) => parseDate(b?.date) - parseDate(a?.date))
      .slice(0, 5)
      .map((row: any) => {
        const isHome = Boolean(row?.isHome);
        const homeScore = toNum(row?.homeScore) || 0;
        const awayScore = toNum(row?.awayScore) || 0;
        return {
          id: String(row?.id || `${row?.date || ""}_${row?.opponent || ""}`),
          date: String(row?.date || "") || null,
          opponent: String(row?.opponent || "Opponent"),
          isHome,
          homeScore,
          awayScore,
          result: computeResult(isHome, homeScore, awayScore),
        };
      });

    const sequence = sorted.map((row) => row.result);
    const goalsScored = sorted.reduce((acc, row) => acc + (row.isHome ? row.homeScore : row.awayScore), 0);
    const goalsConceded = sorted.reduce((acc, row) => acc + (row.isHome ? row.awayScore : row.homeScore), 0);

    return {
      results: sorted,
      sequence,
      goalsScored,
      goalsConceded,
      aiFormScore: computeFormScore(sequence),
    };
  };

  const homeForm = useMemo(() => normalizeRecent(homeQuery.data?.recentResults || []), [homeQuery.data]);
  const awayForm = useMemo(() => normalizeRecent(awayQuery.data?.recentResults || []), [awayQuery.data]);

  return {
    isLoading: homeQuery.isLoading || awayQuery.isLoading,
    isFetching: homeQuery.isFetching || awayQuery.isFetching,
    homeTeamOverview: homeQuery.data || null,
    awayTeamOverview: awayQuery.data || null,
    homeForm,
    awayForm,
  };
}

export function useH2H(params: {
  leagueName: string;
  espnLeague: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const query = useQuery({
    queryKey: sportKeys.competitionMatches({
      espnLeague: params.espnLeague,
      leagueName: params.leagueName,
    }),
    queryFn: () => getCompetitionMatches({
      espnLeague: params.espnLeague,
      leagueName: params.leagueName,
    }),
    enabled: Boolean(params.espnLeague),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const rows = useMemo(() => {
    const list = Array.isArray(query.data) ? query.data : [];
    const h2h = list.filter((match: any) => {
      const home = String(match?.homeTeam?.name || match?.homeTeam || "");
      const away = String(match?.awayTeam?.name || match?.awayTeam || "");
      const hasTeams =
        (sameTeam(home, params.homeTeam) && sameTeam(away, params.awayTeam)) ||
        (sameTeam(home, params.awayTeam) && sameTeam(away, params.homeTeam));
      const isFinal = String(match?.status || "").toLowerCase().includes("fin") || String(match?.status || "").toLowerCase() === "finished";
      return hasTeams && isFinal;
    })
      .sort((a: any, b: any) => parseDate(b?.startTime || b?.startDate) - parseDate(a?.startTime || a?.startDate))
      .slice(0, 5)
      .map((match: any) => {
        const mHome = String(match?.homeTeam?.name || match?.homeTeam || "");
        const mAway = String(match?.awayTeam?.name || match?.awayTeam || "");
        const homeScore = toNum(match?.score?.home ?? match?.homeScore) || 0;
        const awayScore = toNum(match?.score?.away ?? match?.awayScore) || 0;

        let winner: "home" | "away" | "draw" = "draw";
        if (homeScore > awayScore) winner = sameTeam(mHome, params.homeTeam) ? "home" : "away";
        if (awayScore > homeScore) winner = sameTeam(mAway, params.homeTeam) ? "home" : "away";

        return {
          id: String(match?.id || `${mHome}_${mAway}_${match?.startTime || ""}`),
          date: String(match?.startTime || match?.startDate || ""),
          homeTeam: mHome,
          awayTeam: mAway,
          homeScore,
          awayScore,
          winner,
          location:
            sameTeam(mHome, params.homeTeam)
              ? "home"
              : sameTeam(mAway, params.homeTeam)
                ? "away"
                : "neutral",
        };
      });

    return h2h;
  }, [query.data, params.homeTeam, params.awayTeam]);

  const summary = useMemo(() => {
    const base = { homeWins: 0, awayWins: 0, draws: 0 };
    for (const row of rows) {
      if (row.winner === "home") base.homeWins += 1;
      else if (row.winner === "away") base.awayWins += 1;
      else base.draws += 1;
    }
    return base;
  }, [rows]);

  return {
    ...query,
    rows,
    summary,
  };
}

export function useTeamStats(params: {
  homeStanding: any;
  awayStanding: any;
  homeForm: TeamFormSummary;
  awayForm: TeamFormSummary;
  homeOverview: any;
  awayOverview: any;
}) {
  const metric = (home: number | null, away: number | null, label: string, suffix = "", decimals = 1): ComparisonMetric => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    label,
    home,
    away,
    suffix,
    decimals,
  });

  const homePlayed = toNum(params.homeStanding?.played ?? params.homeOverview?.leaguePlayed) || 0;
  const awayPlayed = toNum(params.awayStanding?.played ?? params.awayOverview?.leaguePlayed) || 0;

  const homeGoalsFor = toNum(params.homeStanding?.goalsFor ?? params.homeOverview?.goalsFor);
  const awayGoalsFor = toNum(params.awayStanding?.goalsFor ?? params.awayOverview?.goalsFor);
  const homeGoalsAgainst = toNum(params.homeStanding?.goalsAgainst ?? params.homeOverview?.goalsAgainst);
  const awayGoalsAgainst = toNum(params.awayStanding?.goalsAgainst ?? params.awayOverview?.goalsAgainst);

  const homeShotsPg = readStat(params.homeOverview, ["shotsPerGame", "shots_per_game", "avgShots", "averageShots"]);
  const awayShotsPg = readStat(params.awayOverview, ["shotsPerGame", "shots_per_game", "avgShots", "averageShots"]);
  const homePoss = readStat(params.homeOverview, ["possession", "averagePossession", "possessionPct"]);
  const awayPoss = readStat(params.awayOverview, ["possession", "averagePossession", "possessionPct"]);

  const metrics: ComparisonMetric[] = [
    metric(homePlayed > 0 && homeGoalsFor != null ? homeGoalsFor / homePlayed : null, awayPlayed > 0 && awayGoalsFor != null ? awayGoalsFor / awayPlayed : null, "Goals / Match"),
    metric(homePlayed > 0 && homeGoalsAgainst != null ? homeGoalsAgainst / homePlayed : null, awayPlayed > 0 && awayGoalsAgainst != null ? awayGoalsAgainst / awayPlayed : null, "Conceded / Match"),
    metric(
      toNum(params.homeStanding?.cleanSheets ?? params.homeOverview?.cleanSheets),
      toNum(params.awayStanding?.cleanSheets ?? params.awayOverview?.cleanSheets),
      "Clean Sheets",
      "",
      0,
    ),
    metric(homeShotsPg, awayShotsPg, "Shots / Match"),
    metric(homePoss, awayPoss, "Possession", "%", 0),
  ];

  return {
    metrics,
    hasAnyMetric: metrics.some((m) => m.home != null || m.away != null),
  };
}

export function useKeyPlayers(params: {
  homeTeam: string;
  awayTeam: string;
  competitionInsights: any;
  homeOverview: any;
  awayOverview: any;
}) {
  const scorers = Array.isArray(params.competitionInsights?.topScorers)
    ? params.competitionInsights.topScorers
    : [];
  const assisters = Array.isArray(params.competitionInsights?.topAssists)
    ? params.competitionInsights.topAssists
    : [];

  const findByTeam = (rows: any[], teamName: string) =>
    rows.find((row: any) => sameTeam(row?.team, teamName)) || null;

  const homeTopScorer = findByTeam(scorers, params.homeTeam) || params.homeOverview?.topScorer || null;
  const awayTopScorer = findByTeam(scorers, params.awayTeam) || params.awayOverview?.topScorer || null;
  const homeAssist = findByTeam(assisters, params.homeTeam) || params.homeOverview?.topAssist || null;
  const awayAssist = findByTeam(assisters, params.awayTeam) || params.awayOverview?.topAssist || null;

  const homeAi = pickTopContribution(params.homeOverview?.players || []);
  const awayAi = pickTopContribution(params.awayOverview?.players || []);

  return {
    home: {
      topScorer: homeTopScorer,
      assistLeader: homeAssist,
      keyPlayer: homeAi,
    },
    away: {
      topScorer: awayTopScorer,
      assistLeader: awayAssist,
      keyPlayer: awayAi,
    },
  };
}

function normalizeAbsences(source: any): any[] {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function extractAbsences(teamOverview: any) {
  const injuries = normalizeAbsences(teamOverview?.injuries).map((row: any) => ({
    name: String(row?.name || row?.player || "Unknown"),
    reason: String(row?.reason || row?.type || "injury"),
    status: "injury",
  }));

  const suspensions = normalizeAbsences(teamOverview?.suspensions).map((row: any) => ({
    name: String(row?.name || row?.player || "Unknown"),
    reason: String(row?.reason || row?.type || "suspension"),
    status: "suspension",
  }));

  return [...injuries, ...suspensions].slice(0, 8);
}

export function useInjuries(params: { homeOverview: any; awayOverview: any }) {
  const home = extractAbsences(params.homeOverview);
  const away = extractAbsences(params.awayOverview);

  return {
    home,
    away,
    hasVerifiedData: home.length > 0 || away.length > 0,
  };
}

export function useLineups(params: {
  starters: any[];
  homeTeam: string;
  awayTeam: string;
}) {
  const teams = Array.isArray(params.starters) ? params.starters : [];

  const home = teams.find((team: any) => sameTeam(team?.team, params.homeTeam)) || teams[0] || null;
  const away = teams.find((team: any) => sameTeam(team?.team, params.awayTeam)) || teams[1] || null;

  return {
    home,
    away,
    hasLineups: Boolean(home || away),
  };
}

export function useMatchContext(params: {
  kickoffRaw?: string;
  venue?: string;
  city?: string;
  country?: string;
  referee?: string;
  weather?: string;
  competition?: string;
  round?: string;
}) {
  return useMemo(() => {
    const raw = String(params.kickoffRaw || "");
    const ts = Date.parse(raw);
    const hasDate = Number.isFinite(ts);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Brussels";

    const kickoffDate = hasDate
      ? new Intl.DateTimeFormat("nl-BE", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: timezone,
        }).format(new Date(ts))
      : "";

    const kickoffTime = hasDate
      ? new Intl.DateTimeFormat("nl-BE", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
        }).format(new Date(ts))
      : "";

    return {
      timezone,
      kickoffDate,
      kickoffTime,
      venue: String(params.venue || "").trim(),
      city: String(params.city || "").trim(),
      country: String(params.country || "").trim(),
      referee: String(params.referee || "").trim(),
      weather: String(params.weather || "").trim(),
      competition: String(params.competition || "").trim(),
      round: String(params.round || "").trim(),
    };
  }, [params.kickoffRaw, params.venue, params.city, params.country, params.referee, params.weather, params.competition, params.round]);
}
