/**
 * Nexora – Domain Normalizers
 *
 * Convert raw API responses into canonical domain models.
 * All UI code must consume normalized models, never raw API shapes.
 */

import type {
  Match,
  MatchStatus,
  MatchTeamRef,
  MatchScore,
  Team,
  TeamStanding,
  TeamStats,
  Competition,
  CompetitionId,
  Player,
  PlayerStats,
  PlayerImage,
  MatchEvent,
  EventType,
  MatchLineupPlayer,
  MatchLineupsData,
  MatchStats,
  Movie,
  Series,
  Episode,
  Season,
  Trailer,
  StreamSource,
  WatchHistoryItem,
  WatchProgress,
  SourceName,
  SourceMeta,
  EntityId,
  ISODateString,
  MatchIntelligenceModel,
} from "./models";
import { normalizeDomainMatchStatus } from "@/lib/match-state";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function nowIso(): ISODateString {
  return new Date().toISOString();
}

function ensureStr(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function ensureInt(v: unknown, fallback: number | null = null): number | null {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function ensureFloat(
  v: unknown,
  fallback: number | null = null,
): number | null {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampN(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function defaultSourceMeta(primary: SourceName): SourceMeta {
  return {
    primarySource: primary,
    mergedSources: [primary],
    fetchedAt: nowIso(),
    confidence: 1,
  };
}

// ─── Competition ──────────────────────────────────────────────────────────────

/** Map ESPN league slug → CompetitionId type */
function detectCompetitionType(
  slug: string,
  name: string,
): "league" | "cup" | "international" {
  if (
    /cup|copa|coupe|pokal|beker|fa$|knvb|coppa/i.test(slug) ||
    /cup|beker|pokal|copa|coupe|coppa/i.test(name)
  ) {
    return "cup";
  }
  if (/nations|world|euro|africa|asia|olympics|continental/i.test(name)) {
    return "international";
  }
  return "league";
}

export function normalizeCompetitionId(raw: {
  espnSlug: string;
  displayName: string;
  country?: string;
  season?: number;
}): CompetitionId {
  return {
    espnSlug: raw.espnSlug,
    displayName: raw.displayName,
    country: raw.country,
    season: raw.season,
    type: detectCompetitionType(raw.espnSlug, raw.displayName),
  };
}

// ─── Match ────────────────────────────────────────────────────────────────────

function mapEspnStatusToMatchStatus(
  state: string,
  detail?: string,
): MatchStatus {
  const s = ensureStr(state).toLowerCase();
  const d = ensureStr(detail).toLowerCase();
  if (d.includes("postponed") || s === "postponed") return "postponed";
  if (d.includes("cancel") || s === "cancelled" || s === "canceled")
    return "cancelled";
  if (d.includes("delay") || d.includes("suspend") || s === "delayed")
    return "delayed";
  if (s === "in" || s === "inprogress") {
    if (d.includes("halftime") || d.includes("half time")) return "halftime";
    return "live";
  }
  if (s === "post" || s === "final") return "finished";
  if (s === "pre") return "scheduled";
  return "scheduled";
}

/** Normalize a match from the server's already-processed format */
export function normalizeMatchFromServer(raw: any): Match {
  const competition = normalizeCompetitionId({
    espnSlug: ensureStr(
      raw.espnLeague ?? raw.leagueSlug ?? raw.competition?.espnSlug ?? "",
    ),
    displayName: ensureStr(
      raw.leagueName ?? raw.league ?? raw.competition?.displayName ?? "",
    ),
    country: raw.competition?.country,
  });

  // Extract home team name - prioritize object.name over string or fallback
  const homeTeamName =
    typeof raw.homeTeam === "string"
      ? ensureStr(raw.homeTeam) // If it's already a string, use it directly (no "Home" fallback)
      : ensureStr(raw.homeTeam?.name ?? raw.homeTeamName); // Extract name from object or use homeTeamName field

  // Extract away team name - same logic
  const awayTeamName =
    typeof raw.awayTeam === "string"
      ? ensureStr(raw.awayTeam) // If it's already a string, use it directly (no "Away" fallback)
      : ensureStr(raw.awayTeam?.name ?? raw.awayTeamName); // Extract name from object or use awayTeamName field

  const homeScoreRaw =
    raw?.score?.home ??
    raw?.homeScore ??
    raw?.homeTeam?.score ??
    raw?.home?.score ??
    raw?.teams?.home?.score;
  const awayScoreRaw =
    raw?.score?.away ??
    raw?.awayScore ??
    raw?.awayTeam?.score ??
    raw?.away?.score ??
    raw?.teams?.away?.score;

  return {
    id: ensureStr(raw.id, `m-${Date.now()}`),
    espnId: raw.espnId ?? raw.id ?? null,
    sofascoreId: raw.sofascoreId ?? null,
    sport: ensureStr(raw.sport, "soccer"),
    espnLeague: ensureStr(
      raw.espnLeague ?? raw.leagueSlug ?? raw.competition?.espnSlug,
      "",
    ),
    league: ensureStr(
      raw.leagueName ?? raw.league ?? raw.competition?.displayName,
      "Competition",
    ),
    homeTeam: {
      id: ensureStr(
        typeof raw.homeTeam === "object" ? raw.homeTeam?.id : raw.homeTeamId,
        "",
      ),
      name: homeTeamName, // No "Home" fallback
      logo:
        (typeof raw.homeTeam === "object" ? raw.homeTeam?.logo : null) ??
        raw.homeTeamLogo ??
        null,
      score: ensureInt(homeScoreRaw),
      logoSource: (raw.homeTeam as any)?.logoSource ?? "espn",
    },
    awayTeam: {
      id: ensureStr(
        typeof raw.awayTeam === "object" ? raw.awayTeam?.id : raw.awayTeamId,
        "",
      ),
      name: awayTeamName, // No "Away" fallback
      logo:
        (typeof raw.awayTeam === "object" ? raw.awayTeam?.logo : null) ??
        raw.awayTeamLogo ??
        null,
      score: ensureInt(awayScoreRaw),
      logoSource: (raw.awayTeam as any)?.logoSource ?? "espn",
    },
    competition,
    status: normalizeDomainMatchStatus({
      status: raw.status ?? "scheduled",
      detail: raw.detail ?? raw.statusDetail,
      minute: raw.minute,
      homeScore: homeScoreRaw,
      awayScore: awayScoreRaw,
      startDate: raw.startTime ?? raw.date,
    }) as MatchStatus,
    score: {
      home: ensureInt(homeScoreRaw),
      away: ensureInt(awayScoreRaw),
    },
    startTime: raw.startTime ?? raw.date ?? null,
    minute: ensureInt(raw.minute),
    venue: raw.venue ?? null,
    round: raw.round ?? null,
    hasStream: Boolean(raw.hasStream),
    meta: {
      primarySource: "espn",
      mergedSources: raw.sofascoreId ? ["espn", "sofascore"] : ["espn"],
      fetchedAt: nowIso(),
      confidence: 1,
    },
  };
}

// ─── Match events ─────────────────────────────────────────────────────────────

const EVENT_TYPE_MAP: Record<string, EventType> = {
  goal: "goal",
  yellow_card: "yellow_card",
  yellowcard: "yellow_card",
  yellowCard: "yellow_card",
  red_card: "red_card",
  redCard: "red_card",
  red: "red_card",
  second_yellow: "second_yellow",
  secondyellow: "second_yellow",
  substitution: "substitution",
  sub: "substitution",
  penalty_goal: "penalty_goal",
  penaltygoal: "penalty_goal",
  penalty: "penalty_goal",
  penalty_miss: "penalty_miss",
  penaltymiss: "penalty_miss",
  own_goal: "own_goal",
  owngoal: "own_goal",
  var: "var_decision",
  var_decision: "var_decision",
  kickoff: "kickoff",
  halftime: "halftime",
  half_time: "halftime",
  fulltime: "fulltime",
  full_time: "fulltime",
};

export function normalizeEventType(raw: string): EventType {
  const key = ensureStr(raw)
    .toLowerCase()
    .replace(/[^a-z_]/g, "");
  return EVENT_TYPE_MAP[key] ?? "other";
}

export function normalizeMatchEvent(
  raw: any,
  matchId: EntityId,
  index: number,
): MatchEvent {
  const team = ensureStr(raw.team ?? raw.side ?? "home") as "home" | "away";
  return {
    id: ensureStr(raw.id, `evt-${matchId}-${index}`),
    matchId,
    type: normalizeEventType(
      raw.type ?? raw.eventType ?? raw.incident_type ?? "other",
    ),
    minute: ensureInt(raw.minute ?? raw.time, 0) ?? 0,
    minuteExtra: ensureInt(raw.minuteExtra ?? raw.addedTime),
    playerId: ensureStr(raw.playerId ?? raw.player?.id) || null,
    playerName: ensureStr(raw.playerName ?? raw.player?.name) || null,
    relatedPlayerId:
      ensureStr(
        raw.relatedPlayerId ?? raw.assist?.id ?? raw.substituteIn?.id,
      ) || null,
    relatedPlayerName:
      ensureStr(
        raw.relatedPlayerName ?? raw.assist?.name ?? raw.substituteIn?.name,
      ) || null,
    team: team === "away" ? "away" : "home",
    description: raw.description ?? null,
    isHome: team !== "away",
  };
}

export function normalizeMatchEvents(
  rawEvents: any[],
  matchId: EntityId,
): MatchEvent[] {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents
    .filter(Boolean)
    .map((e, i) => normalizeMatchEvent(e, matchId, i))
    .sort((a, b) => a.minute - b.minute);
}

// ─── Lineups ──────────────────────────────────────────────────────────────────

function normalizeLineupPlayer(
  raw: any,
  isStarter: boolean,
): MatchLineupPlayer {
  const stableFallback = [
    String(raw?.name ?? raw?.displayName ?? "unknown")
      .toLowerCase()
      .trim(),
    String(raw?.shirtNumber ?? raw?.jersey ?? ""),
    isStarter ? "starter" : "bench",
  ]
    .filter(Boolean)
    .join("-");

  return {
    playerId: ensureStr(raw.id ?? raw.playerId, `p-${stableFallback}`),
    name: ensureStr(raw.name ?? raw.displayName, "Unknown"),
    position: raw.position ?? raw.positionName ?? null,
    positionAbbr: raw.positionAbbr ?? raw.positionCode ?? null,
    shirtNumber: ensureInt(raw.shirtNumber ?? raw.jersey),
    isStarter,
    image: raw.image ?? raw.photo ?? raw.headshot ?? null,
    photoSource: raw.photoSource ?? null,
    rating: ensureFloat(raw.rating),
  };
}

export function normalizeMatchLineups(
  raw: any,
  matchId: EntityId,
  options?: { homeTeamName?: string | null; awayTeamName?: string | null },
): MatchLineupsData | null {
  if (!raw) return null;

  const normalizeTeamName = (value: string | null | undefined) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const mapPlayers = (list: any[], starter: boolean) =>
    Array.isArray(list)
      ? list.map((p) => normalizeLineupPlayer(p, starter))
      : [];

  // Canonical helper: accepts blocks with starters/substitutes or players/bench
  const normalizeTeamBlock = (block: any) => {
    const startersList = mapPlayers(
      block?.starters ??
        block?.players?.filter((p: any) => p?.isStarter !== false) ??
        block?.players ??
        [],
      true,
    );
    const benchList = mapPlayers(
      block?.substitutes ??
        block?.bench ??
        block?.players?.filter((p: any) => p?.isStarter === false) ??
        [],
      false,
    );
    return {
      players: [...startersList, ...benchList],
      formation: block?.formation ?? undefined,
    };
  };

  // Shape A: explicit home/away object (legacy + current)
  if (raw?.home || raw?.away) {
    const home = normalizeTeamBlock(raw.home || {});
    const away = normalizeTeamBlock(raw.away || {});
    if (!home.players.length && !away.players.length) return null;
    return {
      matchId,
      home: home.players,
      away: away.players,
      formation: {
        home: home.formation,
        away: away.formation,
      },
    };
  }

  // Shape B: starters array from match detail endpoint
  if (Array.isArray(raw)) {
    const rows = raw.filter(Boolean);
    if (!rows.length) return null;

    const homeName = normalizeTeamName(options?.homeTeamName);
    const awayName = normalizeTeamName(options?.awayTeamName);

    const blocks = rows.map((block: any) => ({
      teamName: normalizeTeamName(block?.team),
      block,
    }));

    let homeBlock = blocks.find((entry: any) =>
      homeName && entry.teamName
        ? entry.teamName === homeName ||
          entry.teamName.includes(homeName) ||
          homeName.includes(entry.teamName)
        : false,
    )?.block;

    let awayBlock = blocks.find((entry: any) =>
      awayName && entry.teamName
        ? entry.teamName === awayName ||
          entry.teamName.includes(awayName) ||
          awayName.includes(entry.teamName)
        : false,
    )?.block;

    if (!homeBlock) homeBlock = rows[0] || null;
    if (!awayBlock) awayBlock = rows[1] || null;
    if (!homeBlock || !awayBlock) return null;

    const home = normalizeTeamBlock(homeBlock);
    const away = normalizeTeamBlock(awayBlock);
    if (!home.players.length && !away.players.length) return null;

    return {
      matchId,
      home: home.players,
      away: away.players,
      formation: {
        home: home.formation,
        away: away.formation,
      },
    };
  }

  return null;
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export function normalizeTeam(raw: any): Team {
  return {
    id: ensureStr(raw.id, slugify(raw.name ?? "team")),
    name: ensureStr(raw.name ?? raw.displayName, "Unknown Team"),
    shortName: raw.shortName ?? raw.abbreviation ?? undefined,
    alternateNames: raw.alternateNames ?? undefined,
    country: raw.country ?? undefined,
    logo: raw.logo
      ? {
          uri: raw.logo,
          source: (raw.logoSource ?? "espn") as SourceName,
          confidence: 1,
        }
      : null,
    color: raw.color ?? undefined,
    founded: ensureInt(raw.founded),
    venue: raw.venue ?? undefined,
    stadiumCapacity: ensureInt(raw.stadiumCapacity),
    coach: raw.coach ?? null,
    clubColors: Array.isArray(raw.clubColors) ? raw.clubColors : undefined,
    parentTeamId: raw.parentTeamId ?? null,
    meta: defaultSourceMeta((raw.source ?? "espn") as SourceName),
  };
}

// ─── Standings ────────────────────────────────────────────────────────────────

export function normalizeStanding(
  raw: any,
  competitionId: CompetitionId,
): TeamStanding {
  const team = normalizeTeam({
    id: raw.teamId ?? raw.id,
    name: raw.team ?? raw.teamName ?? raw.name ?? "Unknown",
    shortName: raw.shortName,
    logo: raw.teamLogo ?? raw.logo,
    color: raw.teamColor ?? raw.color,
    country: raw.country,
    source: "espn",
  });

  const stats: TeamStats = {
    teamId: team.id,
    competitionId,
    played: ensureInt(raw.played ?? raw.gamesPlayed ?? raw.GP) ?? 0,
    won: ensureInt(raw.won ?? raw.wins ?? raw.W) ?? 0,
    drawn: ensureInt(raw.drawn ?? raw.ties ?? raw.D) ?? 0,
    lost: ensureInt(raw.lost ?? raw.losses ?? raw.L) ?? 0,
    goalsFor: ensureInt(raw.goalsFor ?? raw.gf ?? raw.PF) ?? 0,
    goalsAgainst: ensureInt(raw.goalsAgainst ?? raw.ga ?? raw.PA) ?? 0,
    goalDifference: ensureInt(raw.goalDifference ?? raw.gd) ?? 0,
    points: ensureInt(raw.points ?? raw.pts ?? raw.PTS) ?? 0,
    cleanSheets: ensureInt(raw.cleanSheets),
    yellowCards: ensureInt(raw.yellowCards),
    redCards: ensureInt(raw.redCards),
    form: raw.form ?? null,
    squadMarketValue: raw.squadMarketValue ?? null,
  };

  return {
    ...stats,
    rank: ensureInt(raw.rank ?? raw.position) ?? 0,
    team,
    groupPhase: raw.groupPhase ? String(raw.groupPhase) : null,
    groupIndex: ensureInt(raw.groupIndex),
  };
}

export function normalizeStandings(
  rawList: any[],
  competitionId: CompetitionId,
): TeamStanding[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter(Boolean)
    .map((r) => normalizeStanding(r, competitionId))
    .sort((a, b) => (a.rank || 99) - (b.rank || 99));
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function normalizePlayer(raw: any): Player {
  const image: PlayerImage | null =
    raw.image || raw.photo || raw.headshot
      ? {
          uri: ensureStr(raw.image ?? raw.photo ?? raw.headshot),
          source: (raw.imageSource ?? "espn") as SourceName,
          confidence: ensureFloat(raw.imageConfidence) ?? 0.8,
        }
      : null;

  return {
    id: ensureStr(
      raw.id ?? raw.espnId,
      slugify((raw.name ?? "player") + (raw.teamName ?? "")),
    ),
    espnId: ensureStr(raw.espnId ?? raw.id) || null,
    name: ensureStr(raw.name ?? raw.displayName, "Unknown Player"),
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    age: ensureInt(raw.age),
    birthDate: raw.birthDate ?? raw.dateOfBirth ?? null,
    nationality: ensureStr(raw.nationality) || null,
    position: raw.position ?? null,
    positionAbbr: raw.positionAbbr ?? raw.positionCode ?? null,
    height: raw.height ?? null,
    weight: raw.weight ?? null,
    shirtNumber: ensureInt(raw.shirtNumber ?? raw.jersey),
    marketValue: raw.marketValue ?? null,
    teamId: ensureStr(raw.teamId) || null,
    teamName: ensureStr(raw.teamName ?? raw.team) || null,
    image,
    contractUntil: raw.contractUntil ?? null,
    foot: raw.foot ?? null,
    clubHistory: Array.isArray(raw.clubHistory) ? raw.clubHistory : undefined,
    meta: defaultSourceMeta((raw.source ?? "espn") as SourceName),
  };
}

export function normalizePlayerStats(
  raw: any,
  competitionId: CompetitionId,
): PlayerStats {
  return {
    playerId: ensureStr(raw.id ?? raw.playerId, "unknown"),
    competitionId,
    season: ensureInt(raw.season) ?? undefined,
    goals: ensureInt(raw.goals),
    assists: ensureInt(raw.assists),
    appearances: ensureInt(raw.appearances ?? raw.gamesPlayed),
    minutesPlayed: ensureInt(raw.minutesPlayed),
    yellowCards: ensureInt(raw.yellowCards),
    redCards: ensureInt(raw.redCards),
    rating: ensureFloat(raw.rating),
  };
}

// ─── Leaderboard row → Player+Stats ──────────────────────────────────────────

export interface NormalizedLeaderboardRow {
  player: Player;
  stats: PlayerStats;
}

export function normalizeLeaderboardRow(
  raw: any,
  kind: "topscorers" | "topassists",
  competitionId: CompetitionId,
): NormalizedLeaderboardRow {
  const player = normalizePlayer({
    id: raw.playerId ?? raw.id,
    espnId: raw.espnId,
    name: raw.name ?? raw.player,
    teamId: raw.teamId,
    teamName: raw.team ?? raw.teamName,
    nationality: raw.nationality,
    position: raw.position,
    age: raw.age,
    image: raw.image ?? raw.photo,
    imageSource: raw.imageSource,
    imageConfidence: raw.imageConfidence,
    source: raw.source,
  });

  const stats = normalizePlayerStats(
    {
      id: player.id,
      goals:
        kind === "topscorers"
          ? (raw.goals ?? raw.value ?? raw.displayValue)
          : null,
      assists:
        kind === "topassists"
          ? (raw.assists ?? raw.value ?? raw.displayValue)
          : null,
      appearances: raw.appearances,
      minutesPlayed: raw.minutesPlayed,
    },
    competitionId,
  );

  return { player, stats };
}

// ─── Media ────────────────────────────────────────────────────────────────────

function tmdbImageUrl(
  path: string | null | undefined,
  size: "w500" | "w780" | "original" = "w780",
): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function normalizeMovieFromTmdb(raw: any): Movie {
  return {
    id: { tmdbId: ensureInt(raw.id) },
    type: "movie",
    title: ensureStr(raw.title ?? raw.name, "Unknown Title"),
    originalTitle: raw.original_title ?? null,
    overview: raw.overview ?? null,
    tagline: raw.tagline ?? null,
    posterUri: tmdbImageUrl(raw.poster_path) ?? raw.poster ?? null,
    backdropUri: tmdbImageUrl(raw.backdrop_path) ?? raw.backdrop ?? null,
    releaseYear: raw.release_date
      ? new Date(raw.release_date).getFullYear()
      : null,
    originalLanguage: raw.original_language ?? null,
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((g: any) => ({ id: g.id, name: g.name }))
      : Array.isArray(raw.genre_ids)
        ? raw.genre_ids.map((id: number) => ({ id, name: "" }))
        : [],
    rating: ensureFloat(raw.vote_average) ?? ensureFloat(raw.rating) ?? null,
    ratingCount: ensureInt(raw.vote_count),
    runtime: ensureInt(raw.runtime),
    status: raw.status ?? null,
    isPlayable: false, // TMDB is metadata only — caller must enrich with stream sources
    isDownloadable: false,
    trailer: null,
    streamSources: [],
    budget: ensureInt(raw.budget),
    revenue: ensureInt(raw.revenue),
    collection: raw.belongs_to_collection
      ? {
          id: raw.belongs_to_collection.id,
          name: raw.belongs_to_collection.name,
        }
      : null,
    meta: defaultSourceMeta("tmdb"),
  };
}

export function normalizeSeriesFromTmdb(raw: any): Series {
  return {
    id: { tmdbId: ensureInt(raw.id) },
    type: "series",
    title: ensureStr(raw.name ?? raw.title, "Unknown Title"),
    originalTitle: raw.original_name ?? raw.original_title ?? null,
    overview: raw.overview ?? null,
    tagline: raw.tagline ?? null,
    posterUri: tmdbImageUrl(raw.poster_path) ?? raw.poster ?? null,
    backdropUri: tmdbImageUrl(raw.backdrop_path) ?? raw.backdrop ?? null,
    releaseYear: raw.first_air_date
      ? new Date(raw.first_air_date).getFullYear()
      : null,
    originalLanguage: raw.original_language ?? null,
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((g: any) => ({ id: g.id, name: g.name }))
      : Array.isArray(raw.genre_ids)
        ? raw.genre_ids.map((id: number) => ({ id, name: "" }))
        : [],
    rating: ensureFloat(raw.vote_average) ?? ensureFloat(raw.rating) ?? null,
    ratingCount: ensureInt(raw.vote_count),
    runtime: ensureInt(raw.episode_run_time?.[0] ?? raw.runtime),
    status: raw.status ?? null,
    isPlayable: false,
    isDownloadable: false,
    trailer: null,
    streamSources: [],
    totalSeasons: ensureInt(raw.number_of_seasons),
    totalEpisodes: ensureInt(raw.number_of_episodes),
    networks: Array.isArray(raw.networks)
      ? raw.networks.map((n: any) => n.name)
      : [],
    seasons: undefined,
    meta: defaultSourceMeta("tmdb"),
  };
}

export function normalizeTrailerFromServer(
  raw: any,
  mediaId: { tmdbId?: number | null },
): Trailer {
  return {
    id: ensureStr(raw.id ?? raw.key, `trailer-${mediaId.tmdbId}`),
    mediaId,
    title: raw.name ?? raw.title ?? undefined,
    youtubeKey: raw.key ?? raw.youtubeKey ?? null,
    embedUrl: raw.embedUrl ?? null,
    source:
      raw.site === "YouTube" || raw.source === "youtube"
        ? "youtube"
        : "provider",
    embedRestricted: raw.embedRestricted ?? false,
  };
}

// ─── Team DNA ────────────────────────────────────────────────────────────────

import type {
  TeamDNA,
  TeamDNAMetric,
  PlayStyleLabel,
  AttackWidthLabel,
  DefensiveLineLabel,
  BuildUpLabel,
  LiveMatchIntelligence,
  ThreatLevel,
  AIMatchExplanation,
  PlayerMarketValue,
} from "./models";

function toPercent(value: unknown, fallback = 0): number {
  const n = ensureFloat(value);
  if (n == null) return fallback;
  // If value looks like a decimal ratio (e.g. 0.55), convert to percent
  if (n > 0 && n <= 1) return Math.round(n * 100);
  return Math.round(Math.max(0, Math.min(100, n)));
}

function toRate(value: unknown, fallback = 0): number {
  const n = ensureFloat(value);
  return n != null && Number.isFinite(n) ? Number(n.toFixed(2)) : fallback;
}

function deriveStyleLabels(dna: {
  pressingIntensity: number;
  possessionAvg: number;
  counterAttackSpeed: number;
  passAccuracy: number;
  buildUpStyle: BuildUpLabel;
  goalsAllowedPerGame: number;
}): PlayStyleLabel[] {
  const labels: PlayStyleLabel[] = [];

  if (dna.pressingIntensity >= 70) labels.push("high-press");
  else if (dna.pressingIntensity >= 50) labels.push("mid-press");

  if (dna.possessionAvg >= 58 && dna.passAccuracy >= 85) {
    labels.push(dna.pressingIntensity >= 60 ? "gegenpressing" : "tiki-taka");
  } else if (dna.possessionAvg >= 55) {
    labels.push("possession");
  }

  if (dna.counterAttackSpeed >= 65 && dna.possessionAvg < 50) {
    labels.push("counter-attack");
  }

  if (dna.buildUpStyle === "long-ball") labels.push("long-ball");

  if (dna.pressingIntensity < 35 && dna.goalsAllowedPerGame < 1.2) {
    labels.push("low-block");
  }

  if (!labels.length) labels.push("mid-press");
  return labels.slice(0, 3) as PlayStyleLabel[];
}

function deriveAttackWidth(
  cornersPerGame: number,
  crossesPerGame: number,
): AttackWidthLabel {
  const crossScore = crossesPerGame + cornersPerGame * 0.5;
  if (crossScore >= 22) return "wide";
  if (crossScore <= 10) return "central";
  if (crossScore >= 16) return "mixed";
  return "narrow";
}

function deriveDefensiveLine(
  pressIntensity: number,
  goalsAllowed: number,
): DefensiveLineLabel {
  if (pressIntensity >= 65) return "high";
  if (pressIntensity <= 35 || goalsAllowed >= 1.8) return "deep";
  return "medium";
}

function deriveBuildup(
  passAccuracy: number,
  longBallRatio: number,
): BuildUpLabel {
  if (longBallRatio >= 40 || passAccuracy < 72) return "long-ball";
  if (passAccuracy >= 85 && longBallRatio < 20) return "short-pass";
  return "mixed";
}

export function normalizeTeamDNA(raw: any): TeamDNA {
  const teamId = ensureStr(raw.teamId ?? raw.id, `dna-${Date.now()}`);
  const teamName = ensureStr(raw.teamName ?? raw.name, "Unknown");

  const possessionAvg = toPercent(raw.possession ?? raw.possessionAvg, 50);
  const passAccuracy = toPercent(raw.passAccuracy ?? raw.passCompletion, 78);
  const pressingIntensity = toPercent(
    raw.pressingIntensity ?? raw.ppda ?? raw.pressScore,
    50,
  );
  const shotsPerGame = toRate(raw.shotsPerGame ?? raw.shots, 11);
  const goalsPerGame = toRate(raw.goalsPerGame ?? raw.goalsFor, 1.3);
  const goalsAllowedPerGame = toRate(
    raw.goalsAllowedPerGame ?? raw.goalsAgainst,
    1.2,
  );
  const cornersPerGame = toRate(raw.cornersPerGame ?? raw.corners, 4.5);
  const crossesPerGame = toRate(raw.crossesPerGame ?? raw.crosses, 14);
  const tacklesPerGame = toRate(raw.tacklesPerGame ?? raw.tackles, 14);
  const foulsPerGame = toRate(raw.foulsPerGame ?? raw.foulsCommitted, 10);
  const foulsTaken = toRate(raw.foulsTaken ?? raw.foulsReceived, 10);
  const yellowCardsPerGame = toRate(
    raw.yellowCardsPerGame ?? raw.yellowCards,
    1.5,
  );
  const redCardsPerGame = toRate(raw.redCardsPerGame ?? raw.redCards, 0.05);
  const cleanSheetRate = toPercent(raw.cleanSheetRate ?? raw.cleanSheets, 26);
  const longBallRatio = toPercent(raw.longBallRatio ?? raw.longPasses, 25);
  const counterAttackSpeed = toPercent(
    raw.counterAttackSpeed ?? raw.attacks,
    50,
  );
  const setpieceThreat = toPercent(raw.setpieceThreat ?? raw.corners, 45);

  const buildUpStyle = deriveBuildup(passAccuracy, longBallRatio);
  const defensiveLine = deriveDefensiveLine(
    pressingIntensity,
    goalsAllowedPerGame,
  );
  const attackWidth = deriveAttackWidth(cornersPerGame, crossesPerGame);
  const styleLabels = deriveStyleLabels({
    pressingIntensity,
    possessionAvg,
    counterAttackSpeed,
    passAccuracy,
    buildUpStyle,
    goalsAllowedPerGame,
  });

  const metrics: TeamDNAMetric[] = [
    {
      key: "pressing",
      label: "Pressing",
      value: pressingIntensity,
      description: "How aggressively the team wins the ball back",
    },
    {
      key: "possession",
      label: "Possession",
      value: possessionAvg,
      description: "Average ball possession %",
    },
    {
      key: "attack",
      label: "Attack",
      value: Math.min(100, Math.round(shotsPerGame * 6)),
      description: "Attacking output (shots/game)",
    },
    {
      key: "defence",
      label: "Defence",
      value: Math.round(100 - (goalsAllowedPerGame / 3) * 100),
      description: "Defensive solidity",
    },
    {
      key: "setpieces",
      label: "Set Pieces",
      value: setpieceThreat,
      description: "Threat from corners and free kicks",
    },
    {
      key: "passing",
      label: "Pass Accuracy",
      value: passAccuracy,
      description: "Short passing build-up quality",
    },
    {
      key: "counter",
      label: "Counter Speed",
      value: counterAttackSpeed,
      description: "Speed of transitional attacks",
    },
    {
      key: "discipline",
      label: "Discipline",
      value: Math.max(
        0,
        100 - Math.round(yellowCardsPerGame * 30 + redCardsPerGame * 100),
      ),
      description: "Cards and fouls discipline",
    },
  ];

  return {
    teamId,
    teamName,
    season: ensureInt(raw.season),
    competition: ensureStr(raw.competition ?? raw.league) || null,
    styleLabels,
    formations: Array.isArray(raw.formations)
      ? raw.formations
      : raw.formation
        ? [String(raw.formation)]
        : [],
    attack: {
      width: attackWidth,
      setpieceThreat,
      counterAttackSpeed,
      goalScoringRate: goalsPerGame,
      shotsPerGame,
    },
    defence: {
      line: defensiveLine,
      pressingIntensity,
      cleanSheetRate,
      goalsAllowedPerGame,
      tackles: tacklesPerGame,
    },
    buildUp: {
      style: buildUpStyle,
      possessionAvg,
      passAccuracy,
      shortPassRatio: Math.max(0, 100 - longBallRatio),
    },
    discipline: {
      yellowCardsPerGame,
      redCardsPerGame,
      foulsPerGame,
      foulsTaken,
    },
    metrics,
    meta: defaultSourceMeta((raw.source ?? "espn") as SourceName),
  };
}

// ─── Live Match Intelligence ──────────────────────────────────────────────────

function deriveThreatLevel(shotsOnTarget: number, danger: number): ThreatLevel {
  const score = shotsOnTarget * 20 + danger * 0.3;
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function normalizeLiveMatchIntelligence(
  raw: any,
  matchId: string,
): LiveMatchIntelligence {
  const homeStats = raw?.homeStats ?? raw?.stats?.home ?? {};
  const awayStats = raw?.awayStats ?? raw?.stats?.away ?? {};

  const readStatNum = (stats: any, keys: string[]): number => {
    for (const key of keys) {
      const v = stats[key] ?? stats[key.toLowerCase()];
      if (v != null) {
        const n = Number(String(v).replace(/%/, ""));
        if (Number.isFinite(n)) return n;
      }
    }
    return 0;
  };

  const homePoss = readStatNum(homeStats, [
    "possessionPct",
    "possession",
    "ballPossession",
  ]);
  const awayPoss = readStatNum(awayStats, [
    "possessionPct",
    "possession",
    "ballPossession",
  ]);
  const homeShots = readStatNum(homeStats, [
    "shotsOnTarget",
    "shots_on_target",
    "shotsOnGoal",
  ]);
  const awayShots = readStatNum(awayStats, [
    "shotsOnTarget",
    "shots_on_target",
    "shotsOnGoal",
  ]);
  const homeAttacks = readStatNum(homeStats, [
    "dangerousAttacks",
    "attacks",
    "totalShots",
  ]);
  const awayAttacks = readStatNum(awayStats, [
    "dangerousAttacks",
    "attacks",
    "totalShots",
  ]);

  const total = homePoss + awayPoss;
  const homeMom = total > 0 ? Math.round((homePoss / total) * 100) : 50;

  const statsComparison = Array.isArray(raw?.entries)
    ? raw.entries.map((e: any) => {
        const hv = Number(e.home ?? e.homeValue ?? 0);
        const av = Number(e.away ?? e.awayValue ?? 0);
        return {
          label: ensureStr(e.label ?? e.name, ""),
          homeValue: e.home ?? e.homeValue ?? 0,
          awayValue: e.away ?? e.awayValue ?? 0,
          advantage: hv > av ? "home" : av > hv ? "away" : "equal",
        } as const;
      })
    : [];

  const events: any[] = Array.isArray(raw?.events) ? raw.events : [];
  const minute = ensureInt(raw?.minute) ?? null;
  const recentMinute = (minute ?? 90) - 15;
  const recentNarrative = events
    .filter((e: any) => (ensureInt(e.minute) ?? 0) >= recentMinute)
    .slice(0, 5)
    .map((e: any) => {
      const t = ensureStr(e.type, "action");
      const p = ensureStr(e.playerName ?? e.player, "");
      const m = ensureInt(e.minute) ?? 0;
      const side = ensureStr(e.team, "");
      return `${m}' ${p ? `${p} – ` : ""}${t}${side ? ` (${side})` : ""}`;
    });

  return {
    matchId: ensureStr(matchId),
    isLive: Boolean(
      raw?.isLive ?? (raw?.status === "live" || raw?.status === "halftime"),
    ),
    minute,
    momentum: {
      home: homeMom,
      away: 100 - homeMom,
      dominantSide: homeMom > 55 ? "home" : homeMom < 45 ? "away" : "balanced",
      intensity: Math.min(
        100,
        Math.round(
          homeShots * 5 + awayShots * 5 + homeAttacks * 0.5 + awayAttacks * 0.5,
        ),
      ),
      history: Array.isArray(raw?.momentumHistory) ? raw.momentumHistory : [],
    },
    threat: {
      home: deriveThreatLevel(homeShots, homeAttacks),
      away: deriveThreatLevel(awayShots, awayAttacks),
    },
    statsComparison,
    recentNarrative,
    dataQuality:
      raw?.minute != null
        ? "live"
        : raw?.entries?.length
          ? "reconstructed"
          : "limited",
    meta: defaultSourceMeta("espn"),
  };
}

// ─── AI Match Explanation ─────────────────────────────────────────────────────

export function normalizeAIMatchExplanation(
  raw: any,
  matchId: string,
): AIMatchExplanation {
  const phase: AIMatchExplanation["phase"] =
    raw?.phase === "prematch" ||
    raw?.phase === "live" ||
    raw?.phase === "halftime" ||
    raw?.phase === "fulltime"
      ? raw.phase
      : "prematch";

  return {
    matchId: ensureStr(matchId),
    phase,
    headline: ensureStr(raw?.headline ?? raw?.title, "Match Analysis"),
    summary: ensureStr(raw?.summary ?? raw?.narrative, ""),
    keyFactors: Array.isArray(raw?.keyFactors)
      ? raw.keyFactors.slice(0, 5)
      : [],
    dataSignals: {
      form: Boolean(raw?.dataSignals?.form),
      standings: Boolean(raw?.dataSignals?.standings),
      lineups: Boolean(raw?.dataSignals?.lineups),
      liveStats: Boolean(raw?.dataSignals?.liveStats),
      headToHead: Boolean(raw?.dataSignals?.headToHead),
      injuries: Boolean(raw?.dataSignals?.injuries),
    },
    confidence: ensureFloat(raw?.confidence) ?? 0.5,
    generatedAt: ensureStr(raw?.generatedAt, new Date().toISOString()),
  };
}

// ─── Player Market Value ──────────────────────────────────────────────────────

function formatMarketValue(numericValue: number | null): string | null {
  if (numericValue == null || numericValue <= 0) return null;
  if (numericValue >= 1_000_000_000)
    return `€${(numericValue / 1_000_000_000).toFixed(2)}B`;
  if (numericValue >= 1_000_000)
    return `€${(numericValue / 1_000_000).toFixed(1)}M`;
  if (numericValue >= 1_000) return `€${Math.round(numericValue / 1_000)}K`;
  return `€${Math.round(numericValue)}`;
}

export function normalizePlayerMarketValue(
  raw: any,
  playerId: string,
): PlayerMarketValue {
  const rawNum = ensureFloat(
    raw?.numericValue ?? raw?.marketValueNumeric ?? raw?.value,
  );
  const numericValue = rawNum != null && rawNum > 0 ? rawNum : null;
  const displayValue =
    ensureStr(raw?.displayValue ?? raw?.marketValue) ||
    formatMarketValue(numericValue);

  return {
    playerId: ensureStr(playerId),
    playerName: ensureStr(raw?.playerName ?? raw?.name, "Unknown"),
    displayValue: displayValue || null,
    numericValue,
    source: (raw?.source ?? "transfermarkt") as SourceName,
    valuationDate: raw?.valuationDate ?? raw?.date ?? null,
    history: Array.isArray(raw?.history)
      ? raw.history.map((h: any) => ({
          date: ensureStr(h.date),
          value: Number(h.value ?? 0),
          formatted: formatMarketValue(Number(h.value ?? 0)) ?? "",
        }))
      : null,
    meta: defaultSourceMeta((raw?.source ?? "transfermarkt") as SourceName),
  };
}

// ─── Match Intelligence ───────────────────────────────────────────────────────

export function normalizeMatchIntelligence(
  raw: any,
  matchId: string,
): MatchIntelligenceModel {
  const validPrediction = ["Home Win", "Away Win", "Draw"].includes(
    raw?.prediction,
  )
    ? raw.prediction
    : "Draw";
  const validPhase = ["prematch", "live", "halftime", "fulltime"].includes(
    raw?.phase,
  )
    ? raw.phase
    : "prematch";

  return {
    matchId: ensureStr(matchId) || null,
    phase: validPhase,
    predictedWinner: ensureStr(raw?.predictedWinner, "Draw"),
    prediction: validPrediction,
    confidence: clampN(ensureFloat(raw?.confidence) ?? 50, 0, 100),
    confidenceLabel: ["Low", "Medium", "High", "Elite"].includes(
      raw?.confidenceLabel,
    )
      ? raw.confidenceLabel
      : "Medium",
    expectedScore: ensureStr(raw?.expectedScore, "0-0"),
    reasoning: ensureStr(raw?.reasoning, ""),
    keyFactors: Array.isArray(raw?.keyFactors)
      ? raw.keyFactors.filter((f: unknown) => typeof f === "string").slice(0, 5)
      : [],
    probabilities: {
      home: clampN(ensureFloat(raw?.probabilities?.home) ?? 33, 0, 100),
      draw: clampN(ensureFloat(raw?.probabilities?.draw) ?? 34, 0, 100),
      away: clampN(ensureFloat(raw?.probabilities?.away) ?? 33, 0, 100),
    },
    matchRating: clampN(ensureFloat(raw?.matchRating) ?? 5, 1, 10),
    matchRatingLabel: ensureStr(raw?.matchRatingLabel, "Solid"),
    momentumScore: clampN(ensureFloat(raw?.momentumScore) ?? 50, 0, 100),
    momentumSide: ["home", "away", "balanced"].includes(raw?.momentumSide)
      ? raw.momentumSide
      : "balanced",
    upsetAlert: {
      active: Boolean(raw?.upsetAlert?.active),
      probability: clampN(
        ensureFloat(raw?.upsetAlert?.probability) ?? 0,
        0,
        100,
      ),
      underdogTeam: raw?.upsetAlert?.underdogTeam ?? null,
      reasoning: raw?.upsetAlert?.reasoning ?? null,
    },
    hotTeam: {
      active: Boolean(raw?.hotTeam?.active),
      team: raw?.hotTeam?.team ?? null,
      side: ["home", "away"].includes(raw?.hotTeam?.side)
        ? raw.hotTeam.side
        : null,
      form: raw?.hotTeam?.form ?? null,
      formPoints: ensureInt(raw?.hotTeam?.formPoints) ?? 0,
      reasoning: raw?.hotTeam?.reasoning ?? null,
    },
    postMatchExplainer: raw?.postMatchExplainer?.available
      ? {
          available: true,
          whyResult: ensureStr(raw.postMatchExplainer.whyResult, ""),
          keyMoments: Array.isArray(raw.postMatchExplainer.keyMoments)
            ? raw.postMatchExplainer.keyMoments.slice(0, 8).map((m: any) => ({
                minute: ensureInt(m?.minute) ?? 0,
                description: ensureStr(m?.description, ""),
                impact: ["high", "medium", "low"].includes(m?.impact)
                  ? m.impact
                  : "medium",
              }))
            : [],
          playerImpact: Array.isArray(raw.postMatchExplainer.playerImpact)
            ? raw.postMatchExplainer.playerImpact.slice(0, 5).map((p: any) => ({
                player: ensureStr(p?.player, "Unknown"),
                team: ensureStr(p?.team, ""),
                contribution: ensureStr(p?.contribution, ""),
                rating: clampN(ensureFloat(p?.rating) ?? 6, 1, 10),
              }))
            : [],
          tacticalSummary: raw.postMatchExplainer.tacticalSummary ?? null,
          resultVsPrediction: [
            "expected",
            "upset",
            "partial-surprise",
          ].includes(raw.postMatchExplainer.resultVsPrediction)
            ? raw.postMatchExplainer.resultVsPrediction
            : "partial-surprise",
        }
      : null,
    dataSignals: {
      form: Boolean(raw?.dataSignals?.form),
      standings: Boolean(raw?.dataSignals?.standings),
      headToHead: Boolean(raw?.dataSignals?.headToHead),
      injuries: Boolean(raw?.dataSignals?.injuries),
      liveStats: Boolean(raw?.dataSignals?.liveStats),
      lineups: Boolean(raw?.dataSignals?.lineups),
    },
    dataQuality: ["rich", "moderate", "limited"].includes(raw?.dataQuality)
      ? raw.dataQuality
      : "limited",
    source: "nexora-match-intelligence",
    generatedAt: raw?.generatedAt ?? nowIso(),
  };
}
