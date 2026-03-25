import { resolveTeamLogoUri } from "@/lib/logo-manager";

export type EnrichmentConfidence = "high" | "medium" | "low";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseNumber(value: unknown): number | null {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const text = normalizeText(value).replace(/,/g, ".");
  if (!text) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isGoodText(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  if (["n/a", "na", "not available", "unknown", "none", "null", "-"] .includes(text)) return false;
  return true;
}

function deriveAgeFromBirthDate(birthDate: unknown): number | null {
  const raw = normalizeText(birthDate);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - date.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < date.getUTCDate())) {
    age -= 1;
  }
  if (age < 14 || age > 50) return null;
  return age;
}

function parseMarketValue(value: unknown): number {
  const text = normalizeText(value).toLowerCase().replace(/€/g, "").replace(/\s+/g, "");
  if (!text) return 0;
  const n = Number(text.replace(/,/g, ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  if (text.includes("bn") || text.includes("b")) return n * 1_000_000_000;
  if (text.includes("m")) return n * 1_000_000;
  if (text.includes("k")) return n * 1_000;
  return n;
}

function computeConfidence(signals: boolean[]): EnrichmentConfidence {
  const yes = signals.filter(Boolean).length;
  if (yes >= 5) return "high";
  if (yes >= 3) return "medium";
  return "low";
}

function unwrapLeaderRows(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.entries)) return raw.entries;
  if (Array.isArray(raw?.leaders)) return raw.leaders;
  if (Array.isArray(raw?.leaderboard)) return raw.leaderboard;
  return [];
}

function extractLeaderMetric(row: any, kind: "topscorers" | "topassists"): number | null {
  return parseNumber(
    kind === "topassists"
      ? row?.assists ?? row?.displayValue ?? row?.value ?? row?.statValue ?? row?.stats?.assists ?? row?.stats?.assistsPerGame
      : row?.goals ?? row?.displayValue ?? row?.value ?? row?.statValue ?? row?.stats?.goals
  );
}

function collectLeaderRows(kind: "topscorers" | "topassists", payload: any): any[] {
  const rawRows = kind === "topscorers"
    ? [
        ...unwrapLeaderRows(payload?.scorers),
        ...unwrapLeaderRows(payload?.players),
        ...unwrapLeaderRows(payload?.topScorers),
        ...unwrapLeaderRows(payload?.leaders),
        ...unwrapLeaderRows(payload?.data),
      ]
    : [
        ...unwrapLeaderRows(payload?.assists),
        ...unwrapLeaderRows(payload?.topAssists),
        ...unwrapLeaderRows(payload?.players),
        ...unwrapLeaderRows(payload?.leaders),
        ...unwrapLeaderRows(payload?.data),
      ];

  const deduped = new Map<string, any>();
  for (const row of rawRows) {
    const name = normalizeText(row?.name || row?.player || row?.athlete?.displayName).toLowerCase();
    if (!name) continue;
    const team = normalizeText(row?.team || row?.teamName || row?.club?.name).toLowerCase();
    const key = `${name}|${team}`;
    const score = extractLeaderMetric(row, kind) ?? -1;
    const previous = deduped.get(key);
    const previousScore = previous ? extractLeaderMetric(previous, kind) ?? -1 : -1;
    const previousHasPhoto = Boolean(previous?.photo || previous?.image || previous?.headshot || previous?.theSportsDbPhoto);
    const currentHasPhoto = Boolean(row?.photo || row?.image || row?.headshot || row?.theSportsDbPhoto);
    if (!previous || score > previousScore || (score === previousScore && currentHasPhoto && !previousHasPhoto)) {
      deduped.set(key, row);
    }
  }

  return [...deduped.values()];
}

function enrichLeaderRow(row: any, kind: "topscorers" | "topassists", leagueName?: string): any {
  const name = normalizeText(row?.name || row?.player || row?.athlete?.displayName);
  const team = normalizeText(row?.team || row?.teamName || row?.club?.name);
  const statValue = extractLeaderMetric(row, kind);

  const playerId = normalizeText(row?.id || row?.playerId || row?.athleteId);
  const photo = normalizeText(row?.photo || row?.image || row?.headshot || row?.athlete?.headshot?.href || row?.theSportsDbPhoto) || null;
  const teamLogo = resolveTeamLogoUri(team, row?.teamLogo || null);
  const confidence = computeConfidence([
    Boolean(name),
    Boolean(team),
    statValue != null,
    Boolean(playerId),
    Boolean(photo),
    Boolean(teamLogo),
  ]);

  return {
    ...row,
    id: playerId || normalizeText(row?.id),
    name,
    team,
    photo,
    teamLogo,
    displayValue: statValue != null ? String(statValue) : "",
    goals: kind === "topscorers" ? statValue ?? row?.goals ?? null : row?.goals ?? null,
    assists: kind === "topassists" ? statValue ?? row?.assists ?? null : row?.assists ?? null,
    enrichment: {
      confidence,
      source: "shared-enrichment",
      leagueName: leagueName || null,
    },
  };
}

function enrichStandings(standings: any[], leagueName?: string): any[] {
  return (Array.isArray(standings) ? standings : [])
    .map((row, index) => {
      const team = normalizeText(row?.team || row?.name);
      const rank = parseNumber(row?.rank) ?? index + 1;
      const logo = resolveTeamLogoUri(team, row?.logo || row?.teamLogo || null);
      const points = parseNumber(row?.points ?? row?.pts) ?? 0;
      const played = parseNumber(row?.played ?? row?.gamesPlayed ?? row?.gp) ?? 0;
      const goalsFor = parseNumber(row?.goalsFor ?? row?.gf) ?? 0;
      const goalsAgainst = parseNumber(row?.goalsAgainst ?? row?.ga) ?? 0;
      const won = parseNumber(row?.won ?? row?.wins ?? row?.w) ?? 0;
      const drawn = parseNumber(row?.drawn ?? row?.draws ?? row?.d) ?? 0;
      const lost = parseNumber(row?.lost ?? row?.losses ?? row?.l) ?? 0;

      return {
        ...row,
        rank,
        team,
        logo,
        points,
        played,
        won,
        wins: won,
        drawn,
        draws: drawn,
        lost,
        losses: lost,
        goalsFor,
        goalsAgainst,
        gf: goalsFor,
        ga: goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
        goalDiff: goalsFor - goalsAgainst,
        enrichment: {
          confidence: computeConfidence([
            Boolean(team),
            Boolean(rank),
            played > 0,
            points >= 0,
            Boolean(logo),
          ]),
          source: "shared-enrichment",
          leagueName: leagueName || null,
        },
      };
    })
    .filter((row) => Boolean(row?.team));
}

function enrichCompetitionTeams(teams: any[], leagueName?: string): any[] {
  return (Array.isArray(teams) ? teams : [])
    .map((team) => {
      const name = normalizeText(team?.name || team?.displayName);
      return {
        ...team,
        name,
        logo: resolveTeamLogoUri(name, team?.logo || null),
        enrichment: {
          confidence: computeConfidence([
            Boolean(name),
            Boolean(team?.id),
            Boolean(team?.abbreviation),
          ]),
          source: "shared-enrichment",
          leagueName: leagueName || null,
        },
      };
    })
    .filter((team) => Boolean(team?.name));
}

function enrichCompetitionMatches(matches: any[]): any[] {
  return (Array.isArray(matches) ? matches : []).map((match) => {
    const homeTeam = normalizeText(match?.homeTeam);
    const awayTeam = normalizeText(match?.awayTeam);
    return {
      ...match,
      homeTeam,
      awayTeam,
      homeTeamLogo: resolveTeamLogoUri(homeTeam, match?.homeTeamLogo || null),
      awayTeamLogo: resolveTeamLogoUri(awayTeam, match?.awayTeamLogo || null),
      enrichment: {
        confidence: computeConfidence([
          Boolean(homeTeam),
          Boolean(awayTeam),
          Boolean(match?.startDate),
        ]),
        source: "shared-enrichment",
      },
    };
  });
}

function compactAnalysisText(text: unknown, name: string, position: string): string {
  const raw = normalizeText(text);
  if (raw.length >= 50 && !/temporarily unavailable|not available|unknown/i.test(raw)) return raw;
  if (!name) return "Profile summary not available yet.";
  if (position) return `${name} is profiled as a ${position}. Detailed analysis will appear when richer verified data is available.`;
  return `${name} has a limited verified data profile. Core fields are shown and will improve as more competition data is synced.`;
}

export function enrichPlayerProfilePayload(raw: any, seed?: { name?: string; team?: string; league?: string }): any {
  const name = normalizeText(raw?.name || seed?.name || "Player");
  const currentClub = normalizeText(raw?.currentClub || seed?.team);
  const birthDate = normalizeText(raw?.birthDate) || null;
  const derivedAge = deriveAgeFromBirthDate(birthDate);
  const age = parseNumber(raw?.age) ?? derivedAge;
  const position = normalizeText(raw?.position);
  const nationality = normalizeText(raw?.nationality);

  const stats = {
    appearances: parseNumber(raw?.seasonStats?.appearances),
    goals: parseNumber(raw?.seasonStats?.goals),
    assists: parseNumber(raw?.seasonStats?.assists),
    minutes: parseNumber(raw?.seasonStats?.minutes),
    starts: parseNumber(raw?.seasonStats?.starts),
    rating: parseNumber(raw?.seasonStats?.rating),
    cleanSheets: parseNumber(raw?.seasonStats?.cleanSheets),
    saves: parseNumber(raw?.seasonStats?.saves),
  };

  const inferredStarts = stats.starts != null ? stats.starts : (stats.appearances != null ? Math.max(0, Math.min(stats.appearances, Math.round(stats.appearances * 0.76))) : null);
  const inferredMinutes = stats.minutes != null ? stats.minutes : (stats.appearances != null ? Math.round(stats.appearances * 74) : null);

  const normalizedHistory = (Array.isArray(raw?.formerClubs) ? raw.formerClubs : [])
    .map((club: any) => ({
      ...club,
      name: normalizeText(club?.name),
      logo: resolveTeamLogoUri(club?.name, club?.logo || null),
    }))
    .filter((club: any) => Boolean(club?.name));

  return {
    ...raw,
    name,
    age: age != null ? age : null,
    birthDate,
    nationality: isGoodText(nationality) ? nationality : null,
    position: isGoodText(position) ? position : null,
    currentClub: isGoodText(currentClub) ? currentClub : null,
    currentClubLogo: resolveTeamLogoUri(currentClub, raw?.currentClubLogo || null),
    marketValue: isGoodText(raw?.marketValue) ? normalizeText(raw?.marketValue) : null,
    jerseyNumber: isGoodText(raw?.jerseyNumber) ? normalizeText(raw?.jerseyNumber) : null,
    contractUntil: isGoodText(raw?.contractUntil) ? normalizeText(raw?.contractUntil) : null,
    analysis: compactAnalysisText(raw?.analysis, name, position),
    seasonStats: {
      appearances: stats.appearances,
      goals: stats.goals,
      assists: stats.assists,
      minutes: inferredMinutes,
      starts: inferredStarts,
      rating: stats.rating,
      cleanSheets: stats.cleanSheets,
      saves: stats.saves,
    },
    formerClubs: normalizedHistory,
    enrichment: {
      confidence: computeConfidence([
        Boolean(name),
        age != null,
        Boolean(birthDate),
        Boolean(currentClub),
        Boolean(position),
        Boolean(nationality),
      ]),
      source: "shared-enrichment",
      leagueName: seed?.league || null,
    },
  };
}

export function enrichTeamDetailPayload(raw: any): any {
  const players = Array.isArray(raw?.players) ? raw.players : [];
  const enrichedPlayers = players.map((player: any) => {
    const pName = normalizeText(player?.name || "");
    const photo = normalizeText(player?.photo || player?.headshot || player?.image || player?.theSportsDbPhoto) || null;

    return {
      ...player,
      name: pName,
      nationality: isGoodText(player?.nationality) ? normalizeText(player?.nationality) : "",
      position: normalizeText(player?.position),
      positionName: normalizeText(player?.positionName || player?.position),
      marketValue: isGoodText(player?.marketValue) ? normalizeText(player?.marketValue) : null,
      marketValueNumeric: parseMarketValue(player?.marketValue),
      photo,
    };
  }).filter((player: any) => Boolean(player?.name));

  return {
    ...raw,
    logo: resolveTeamLogoUri(raw?.name, raw?.logo || null),
    coach: isGoodText(raw?.coach) ? normalizeText(raw?.coach) : null,
    venue: isGoodText(raw?.venue) ? normalizeText(raw?.venue) : null,
    country: isGoodText(raw?.country) ? normalizeText(raw?.country) : null,
    players: [...enrichedPlayers].sort((a, b) => (Number(b?.marketValueNumeric || 0) - Number(a?.marketValueNumeric || 0))),
    enrichment: {
      confidence: computeConfidence([
        Boolean(raw?.name),
        Boolean(raw?.leagueName),
        enrichedPlayers.length > 0,
        Boolean(raw?.logo),
      ]),
      source: "shared-enrichment",
    },
  };
}

export function enrichSportsLeagueResource(kind: string, payload: any, context?: { leagueName?: string }): any {
  const leagueName = context?.leagueName;
  if (!payload || typeof payload !== "object") return payload;

  if (kind === "standings") {
    const standings = enrichStandings(payload?.standings || payload?.teams || [], leagueName);
    return { ...payload, standings, teams: standings };
  }

  if (kind === "topscorers") {
    const scorers = collectLeaderRows("topscorers", payload)
      .map((row: any) => enrichLeaderRow(row, "topscorers", leagueName))
      .filter((row: any) => Boolean(row?.name) && (parseNumber(row?.goals) ?? parseNumber(row?.displayValue) ?? -1) >= 0);
    return { ...payload, scorers, topScorers: scorers, players: scorers };
  }

  if (kind === "topassists") {
    const assists = collectLeaderRows("topassists", payload)
      .map((row: any) => enrichLeaderRow(row, "topassists", leagueName))
      .filter((row: any) => Boolean(row?.name) && (parseNumber(row?.assists) ?? parseNumber(row?.displayValue) ?? -1) >= 0);
    return { ...payload, assists, topAssists: assists, players: assists, leaders: assists };
  }

  if (kind === "competition-stats") {
    return {
      ...payload,
      totalGoals: parseNumber(payload?.totalGoals),
      totalMatches: parseNumber(payload?.totalMatches),
      avgGoalsPerMatch: parseNumber(payload?.avgGoalsPerMatch),
      bestAttack: enrichStandings(payload?.bestAttack || [], leagueName),
      bestDefense: enrichStandings(payload?.bestDefense || [], leagueName),
      mostWins: enrichStandings(payload?.mostWins || [], leagueName),
      mostDraws: enrichStandings(payload?.mostDraws || [], leagueName),
      leaderTable: enrichStandings(payload?.leaderTable || [], leagueName),
    };
  }

  if (kind === "competition-teams") {
    return { ...payload, teams: enrichCompetitionTeams(payload?.teams || [], leagueName) };
  }

  if (kind === "competition-matches") {
    return { ...payload, matches: enrichCompetitionMatches(payload?.matches || []) };
  }

  return payload;
}
