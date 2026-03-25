import { resolveTeamLogoUri } from "@/lib/logo-manager";

export type EnrichmentConfidence = "high" | "medium" | "low";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
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

function coalesceNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed != null && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toFormattedHeight(value: unknown): string | null {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes("cm")) {
    const cm = parseNumber(raw);
    if (cm != null && cm >= 130 && cm <= 250) return `${Math.round(cm)} cm`;
  }
  if (raw.includes("m")) {
    const meters = parseNumber(raw);
    if (meters != null && meters >= 1.3 && meters <= 2.5) return `${meters.toFixed(2)} m`;
  }
  const numeric = parseNumber(raw);
  if (numeric == null) return isGoodText(value) ? normalizeText(value) : null;
  if (numeric >= 130 && numeric <= 250) return `${Math.round(numeric)} cm`;
  if (numeric >= 1.3 && numeric <= 2.5) return `${numeric.toFixed(2)} m`;
  return isGoodText(value) ? normalizeText(value) : null;
}

function toFormattedWeight(value: unknown): string | null {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  const numeric = parseNumber(raw);
  if (numeric != null && numeric >= 40 && numeric <= 180) return `${Math.round(numeric)} kg`;
  return isGoodText(value) ? normalizeText(value) : null;
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
  const teamLogo = resolveTeamLogoUri(team, row?.teamLogo || null, { competition: leagueName || null });
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
      const logo = resolveTeamLogoUri(team, row?.logo || row?.teamLogo || null, { competition: leagueName || null });
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
        logo: resolveTeamLogoUri(name, team?.logo || null, { competition: leagueName || null }),
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

function enrichCompetitionMatches(matches: any[], leagueName?: string): any[] {
  return (Array.isArray(matches) ? matches : []).map((match) => {
    const homeTeam = normalizeText(match?.homeTeam);
    const awayTeam = normalizeText(match?.awayTeam);
    return {
      ...match,
      homeTeam,
      awayTeam,
      homeTeamLogo: resolveTeamLogoUri(homeTeam, match?.homeTeamLogo || null, { competition: leagueName || null }),
      awayTeamLogo: resolveTeamLogoUri(awayTeam, match?.awayTeamLogo || null, { competition: leagueName || null }),
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

function deriveRatingFromContributions(
  rating: number | null,
  appearances: number | null,
  goals: number | null,
  assists: number | null,
): number | null {
  if (rating != null && rating > 0) return Number(rating.toFixed(2));
  if (appearances == null || appearances < 2) return null;
  const contributions = (goals || 0) + (assists || 0);
  const inferred = 6.2 + Math.min(1.9, contributions / Math.max(appearances, 1));
  return Number(inferred.toFixed(2));
}

function normalizeFormerClubs(raw: any, leagueName?: string): any[] {
  const sourceRows = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const rows = sourceRows
    .map((club: any) => {
      const name = pickFirstText(club?.name, club?.team, club?.club, club?.to, club?.from);
      const role = String(club?.role || "").toLowerCase() === "to" ? "to" : "from";
      const date = pickFirstText(club?.date, club?.season, club?.year);
      const fee = pickFirstText(club?.fee, club?.transferFee, club?.value);
      const key = `${name}|${role}|${date}|${fee}`.toLowerCase();
      if (!name || seen.has(key)) return null;
      seen.add(key);
      const transferType = fee
        ? /loan|huur/i.test(fee)
          ? "loan"
          : /free|gratis/i.test(fee)
            ? "free"
            : "fee"
        : null;

      return {
        ...club,
        name,
        role,
        date,
        fee,
        transferType,
        logo: resolveTeamLogoUri(name, club?.logo || null, { competition: leagueName || null }),
      };
    })
    .filter(Boolean) as any[];

  return rows
    .sort((a, b) => {
      const aTime = Date.parse(a?.date || "") || Number.MAX_SAFE_INTEGER;
      const bTime = Date.parse(b?.date || "") || Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 24);
}

export function enrichPlayerProfilePayload(raw: any, seed?: { name?: string; team?: string; league?: string }): any {
  const name = pickFirstText(raw?.name, raw?.displayName, raw?.fullName, seed?.name, "Player");
  const currentClub = pickFirstText(raw?.currentClub, raw?.team, raw?.teamName, raw?.club?.name, seed?.team);
  const birthDate = pickFirstText(raw?.birthDate, raw?.dateOfBirth) || null;
  const derivedAge = deriveAgeFromBirthDate(birthDate);
  const age = coalesceNumber(raw?.age, raw?.profileMeta?.age, derivedAge);
  const position = pickFirstText(raw?.position, raw?.positionName, raw?.role);
  const nationality = pickFirstText(raw?.nationality, raw?.citizenship, raw?.country);

  const jerseyNumber = pickFirstText(raw?.jerseyNumber, raw?.shirtNumber, raw?.number, raw?.jersey);
  const contractUntil = pickFirstText(raw?.contractUntil, raw?.contract?.endDate, raw?.contractEndDate);
  const marketValueText = pickFirstText(raw?.marketValue, raw?.market_value, raw?.estimatedMarketValue);
  const height = toFormattedHeight(raw?.height);
  const weight = toFormattedWeight(raw?.weight);

  const rawSeason = raw?.seasonStats || raw?.statistics || {};

  const stats = {
    appearances: coalesceNumber(rawSeason?.appearances, rawSeason?.matches, rawSeason?.games, raw?.appearances),
    goals: coalesceNumber(rawSeason?.goals, raw?.goals),
    assists: coalesceNumber(rawSeason?.assists, raw?.assists),
    minutes: coalesceNumber(rawSeason?.minutes, raw?.minutes),
    starts: coalesceNumber(rawSeason?.starts, rawSeason?.lineups, raw?.starts),
    rating: coalesceNumber(rawSeason?.rating, raw?.rating),
    cleanSheets: coalesceNumber(rawSeason?.cleanSheets, raw?.cleanSheets),
    saves: coalesceNumber(rawSeason?.saves, raw?.saves),
  };

  const inferredStarts = stats.starts != null ? stats.starts : (stats.appearances != null ? Math.max(0, Math.min(stats.appearances, Math.round(stats.appearances * 0.76))) : null);
  const inferredMinutes = stats.minutes != null ? stats.minutes : (stats.appearances != null ? Math.round(stats.appearances * 74) : null);
  const inferredRating = deriveRatingFromContributions(stats.rating, stats.appearances, stats.goals, stats.assists);

  const normalizedHistory = normalizeFormerClubs(raw?.formerClubs, seed?.league);

  const keyStatCount = [
    stats.appearances,
    stats.goals,
    stats.assists,
    inferredMinutes,
    inferredStarts,
    inferredRating,
    stats.cleanSheets,
    stats.saves,
  ].filter((value) => value != null).length;

  return {
    ...raw,
    name,
    age: age != null ? age : null,
    birthDate,
    nationality: isGoodText(nationality) ? nationality : null,
    position: isGoodText(position) ? position : null,
    currentClub: isGoodText(currentClub) ? currentClub : null,
    currentClubLogo: resolveTeamLogoUri(currentClub, raw?.currentClubLogo || null, { competition: seed?.league || null }),
    marketValue: isGoodText(marketValueText) ? marketValueText : null,
    jerseyNumber: isGoodText(jerseyNumber) ? jerseyNumber : null,
    contractUntil: isGoodText(contractUntil) ? contractUntil : null,
    height,
    weight,
    analysis: compactAnalysisText(raw?.analysis, name, position),
    seasonStats: {
      appearances: stats.appearances,
      goals: stats.goals,
      assists: stats.assists,
      minutes: inferredMinutes,
      starts: inferredStarts,
      rating: inferredRating,
      cleanSheets: stats.cleanSheets,
      saves: stats.saves,
    },
    seasonStatsMode: keyStatCount >= 4 ? "full" : "compact",
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
      position: pickFirstText(player?.position, player?.role),
      positionName: normalizeText(player?.positionName || player?.position),
      marketValue: isGoodText(player?.marketValue) ? normalizeText(player?.marketValue) : null,
      marketValueNumeric: parseMarketValue(player?.marketValue),
      age: coalesceNumber(player?.age),
      jersey: pickFirstText(player?.jersey, player?.jerseyNumber, player?.shirtNumber, player?.number),
      seasonStats: {
        appearances: coalesceNumber(player?.seasonStats?.appearances, player?.appearances),
        goals: coalesceNumber(player?.seasonStats?.goals, player?.goals),
        assists: coalesceNumber(player?.seasonStats?.assists, player?.assists),
        minutes: coalesceNumber(player?.seasonStats?.minutes, player?.minutes),
        starts: coalesceNumber(player?.seasonStats?.starts, player?.starts),
        rating: coalesceNumber(player?.seasonStats?.rating, player?.rating),
        cleanSheets: coalesceNumber(player?.seasonStats?.cleanSheets, player?.cleanSheets),
        saves: coalesceNumber(player?.seasonStats?.saves, player?.saves),
      },
      photo,
    };
  }).filter((player: any) => Boolean(player?.name));

  const topScorer = isGoodText(raw?.topScorer?.name)
    ? raw.topScorer
    : [...enrichedPlayers]
      .filter((player: any) => (coalesceNumber(player?.seasonStats?.goals, player?.goals) || 0) > 0)
      .sort((a: any, b: any) => (coalesceNumber(b?.seasonStats?.goals, b?.goals) || 0) - (coalesceNumber(a?.seasonStats?.goals, a?.goals) || 0))[0] || null;

  const topAssist = isGoodText(raw?.topAssist?.name)
    ? raw.topAssist
    : [...enrichedPlayers]
      .filter((player: any) => (coalesceNumber(player?.seasonStats?.assists, player?.assists) || 0) > 0)
      .sort((a: any, b: any) => (coalesceNumber(b?.seasonStats?.assists, b?.assists) || 0) - (coalesceNumber(a?.seasonStats?.assists, a?.assists) || 0))[0] || null;

  const wins = coalesceNumber(raw?.wins, raw?.won, raw?.leagueStats?.wins);
  const draws = coalesceNumber(raw?.draws, raw?.drawn, raw?.leagueStats?.draws);
  const losses = coalesceNumber(raw?.losses, raw?.lost, raw?.leagueStats?.losses);
  const points = coalesceNumber(raw?.leaguePoints, raw?.points, raw?.leagueStats?.points);
  const played = coalesceNumber(raw?.leaguePlayed, raw?.played, raw?.leagueStats?.played);
  const goalsFor = coalesceNumber(raw?.goalsFor, raw?.gf, raw?.leagueStats?.goalsFor);
  const goalsAgainst = coalesceNumber(raw?.goalsAgainst, raw?.ga, raw?.leagueStats?.goalsAgainst);
  const cleanSheets = coalesceNumber(raw?.cleanSheets, raw?.leagueStats?.cleanSheets);

  return {
    ...raw,
    logo: resolveTeamLogoUri(raw?.name, raw?.logo || null, { country: raw?.country || null, competition: raw?.leagueName || null }),
    leagueName: pickFirstText(raw?.leagueName, raw?.league, raw?.competition),
    founded: coalesceNumber(raw?.founded, raw?.foundedYear),
    coach: isGoodText(raw?.coach) ? normalizeText(raw?.coach) : null,
    venue: isGoodText(raw?.venue || raw?.stadium) ? pickFirstText(raw?.venue, raw?.stadium) : null,
    country: isGoodText(raw?.country) ? normalizeText(raw?.country) : null,
    squadMarketValue: isGoodText(raw?.squadMarketValue || raw?.clubValue) ? pickFirstText(raw?.squadMarketValue, raw?.clubValue) : null,
    wins,
    draws,
    losses,
    leaguePoints: points,
    leaguePlayed: played,
    goalsFor,
    goalsAgainst,
    cleanSheets,
    topScorer,
    topAssist,
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
    const standings = enrichStandings(
      payload?.standings
      || payload?.teams
      || payload?.table
      || payload?.entries
      || payload?.data
      || [],
      leagueName,
    );
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
    return {
      ...payload,
      teams: enrichCompetitionTeams(
        payload?.teams
        || payload?.clubs
        || payload?.entries
        || payload?.data
        || [],
        leagueName,
      ),
    };
  }

  if (kind === "competition-matches") {
    return { ...payload, matches: enrichCompetitionMatches(payload?.matches || [], leagueName) };
  }

  return payload;
}
