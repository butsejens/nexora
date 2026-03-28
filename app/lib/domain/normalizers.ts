/**
 * Nexora – Domain Normalizers
 *
 * Convert raw API responses into canonical domain models.
 * All UI code must consume normalized models, never raw API shapes.
 */

import type {
  Match, MatchStatus, MatchTeamRef, MatchScore,
  Team, TeamStanding, TeamStats, Competition, CompetitionId,
  Player, PlayerStats, PlayerImage,
  MatchEvent, EventType, MatchLineupPlayer, MatchLineupsData, MatchStats,
  Movie, Series, Episode, Season, Trailer, StreamSource,
  WatchHistoryItem, WatchProgress,
  SourceName, SourceMeta, EntityId, ISODateString,
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

function ensureFloat(v: unknown, fallback: number | null = null): number | null {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
function detectCompetitionType(slug: string, name: string): "league" | "cup" | "international" {
  if (/cup|copa|coupe|pokal|beker|fa$|knvb|coppa/i.test(slug) ||
      /cup|beker|pokal|copa|coupe|coppa/i.test(name)) {
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

function mapEspnStatusToMatchStatus(state: string, detail?: string): MatchStatus {
  const s = ensureStr(state).toLowerCase();
  const d = ensureStr(detail).toLowerCase();
  if (s === "in" || s === "inprogress") {
    if (d.includes("halftime") || d.includes("half time")) return "halftime";
    return "live";
  }
  if (s === "post" || s === "final") return "finished";
  if (s === "pre") return "scheduled";
  if (d.includes("postponed")) return "postponed";
  if (d.includes("cancel")) return "cancelled";
  return "scheduled";
}

export function normalizeMatchFromEspn(raw: any, competitionId: CompetitionId): Match {
  const homeComp = Array.isArray(raw.competitions) ? raw.competitions[0] : null;
  const competitors = homeComp?.competitors ?? [];
  const homeComp_ = competitors.find((c: any) => c.homeAway === "home") ?? competitors[0] ?? {};
  const awayComp_ = competitors.find((c: any) => c.homeAway === "away") ?? competitors[1] ?? {};

  const statusState = ensureStr(homeComp?.status?.type?.state ?? raw.status ?? "pre");
  const statusDetail = ensureStr(homeComp?.status?.type?.detail ?? "");

  const homeScore = ensureInt(homeComp_?.score);
  const awayScore = ensureInt(awayComp_?.score);

  const homeTeam: MatchTeamRef = {
    id: ensureStr(homeComp_?.team?.id, `home-${competitionId.espnSlug}`),
    name: ensureStr(homeComp_?.team?.displayName ?? homeComp_?.team?.name, "Home Team"),
    logo: homeComp_?.team?.logo || homeComp_?.team?.logos?.[0]?.href || null,
    score: homeScore,
    logoSource: "espn",
  };

  const awayTeam: MatchTeamRef = {
    id: ensureStr(awayComp_?.team?.id, `away-${competitionId.espnSlug}`),
    name: ensureStr(awayComp_?.team?.displayName ?? awayComp_?.team?.name, "Away Team"),
    logo: awayComp_?.team?.logo || awayComp_?.team?.logos?.[0]?.href || null,
    score: awayScore,
    logoSource: "espn",
  };

  return {
    id: ensureStr(raw.id, `match-${Date.now()}`),
    espnId: ensureStr(raw.id) || null,
    sofascoreId: raw.sofascoreId ?? null,
    homeTeam,
    awayTeam,
    competition: competitionId,
    status: mapEspnStatusToMatchStatus(statusState, statusDetail),
    score: {
      home: homeScore,
      away: awayScore,
    },
    startTime: raw.date ?? raw.startTime ?? null,
    minute: ensureInt(homeComp?.status?.displayClock) ?? ensureInt(raw.minute),
    venue: raw.venue ?? null,
    round: raw.round ?? null,
    hasStream: Boolean(raw.hasStream),
    meta: defaultSourceMeta("espn"),
  };
}

/** Normalize a match from the server's already-processed format */
export function normalizeMatchFromServer(raw: any): Match {
  const competition = normalizeCompetitionId({
    espnSlug: ensureStr(raw.espnLeague ?? raw.competition?.espnSlug ?? ""),
    displayName: ensureStr(raw.leagueName ?? raw.league ?? raw.competition?.displayName ?? ""),
    country: raw.competition?.country,
  });

  // Extract home team name - prioritize object.name over string or fallback
  const homeTeamName = typeof raw.homeTeam === "string"
    ? ensureStr(raw.homeTeam)  // If it's already a string, use it directly (no "Home" fallback)
    : ensureStr(raw.homeTeam?.name ?? raw.homeTeamName);  // Extract name from object or use homeTeamName field

  // Extract away team name - same logic
  const awayTeamName = typeof raw.awayTeam === "string"
    ? ensureStr(raw.awayTeam)  // If it's already a string, use it directly (no "Away" fallback)
    : ensureStr(raw.awayTeam?.name ?? raw.awayTeamName);  // Extract name from object or use awayTeamName field

  return {
    id: ensureStr(raw.id, `m-${Date.now()}`),
    espnId: raw.espnId ?? raw.id ?? null,
    sofascoreId: raw.sofascoreId ?? null,
    homeTeam: {
      id: ensureStr(typeof raw.homeTeam === "object" ? raw.homeTeam?.id : raw.homeTeamId, ""),
      name: homeTeamName,  // No "Home" fallback
      logo: (typeof raw.homeTeam === "object" ? raw.homeTeam?.logo : null) ?? raw.homeTeamLogo ?? null,
      score: ensureInt(raw.score?.home ?? raw.homeScore),
      logoSource: (raw.homeTeam as any)?.logoSource ?? "espn",
    },
    awayTeam: {
      id: ensureStr(typeof raw.awayTeam === "object" ? raw.awayTeam?.id : raw.awayTeamId, ""),
      name: awayTeamName,  // No "Away" fallback
      logo: (typeof raw.awayTeam === "object" ? raw.awayTeam?.logo : null) ?? raw.awayTeamLogo ?? null,
      score: ensureInt(raw.score?.away ?? raw.awayScore),
      logoSource: (raw.awayTeam as any)?.logoSource ?? "espn",
    },
    competition,
    status: normalizeDomainMatchStatus({
      status: raw.status ?? "scheduled",
      detail: raw.detail ?? raw.statusDetail,
      minute: raw.minute,
      homeScore: raw.score?.home ?? raw.homeScore,
      awayScore: raw.score?.away ?? raw.awayScore,
      startDate: raw.startTime ?? raw.date,
    }) as MatchStatus,
    score: {
      home: ensureInt(raw.score?.home ?? raw.homeScore),
      away: ensureInt(raw.score?.away ?? raw.awayScore),
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
  const key = ensureStr(raw).toLowerCase().replace(/[^a-z_]/g, "");
  return EVENT_TYPE_MAP[key] ?? "other";
}

export function normalizeMatchEvent(raw: any, matchId: EntityId, index: number): MatchEvent {
  const team = ensureStr(raw.team ?? raw.side ?? "home") as "home" | "away";
  return {
    id: ensureStr(raw.id, `evt-${matchId}-${index}`),
    matchId,
    type: normalizeEventType(raw.type ?? raw.eventType ?? raw.incident_type ?? "other"),
    minute: ensureInt(raw.minute ?? raw.time, 0) ?? 0,
    minuteExtra: ensureInt(raw.minuteExtra ?? raw.addedTime),
    playerId: ensureStr(raw.playerId ?? raw.player?.id) || null,
    playerName: ensureStr(raw.playerName ?? raw.player?.name) || null,
    relatedPlayerId: ensureStr(raw.relatedPlayerId ?? raw.assist?.id ?? raw.substituteIn?.id) || null,
    relatedPlayerName: ensureStr(raw.relatedPlayerName ?? raw.assist?.name ?? raw.substituteIn?.name) || null,
    team: team === "away" ? "away" : "home",
    description: raw.description ?? null,
    isHome: team !== "away",
  };
}

export function normalizeMatchEvents(rawEvents: any[], matchId: EntityId): MatchEvent[] {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents
    .filter(Boolean)
    .map((e, i) => normalizeMatchEvent(e, matchId, i))
    .sort((a, b) => a.minute - b.minute);
}

// ─── Lineups ──────────────────────────────────────────────────────────────────

function normalizeLineupPlayer(raw: any, isStarter: boolean): MatchLineupPlayer {
  return {
    playerId: ensureStr(raw.id ?? raw.playerId, `p-${Math.random()}`),
    name: ensureStr(raw.name ?? raw.displayName, "Unknown"),
    position: raw.position ?? raw.positionName ?? null,
    positionAbbr: raw.positionAbbr ?? raw.positionCode ?? null,
    shirtNumber: ensureInt(raw.shirtNumber ?? raw.jersey),
    isStarter,
    image: raw.image ?? raw.headshot ?? null,
    rating: ensureFloat(raw.rating),
  };
}

export function normalizeMatchLineups(raw: any, matchId: EntityId): MatchLineupsData | null {
  if (!raw || (!raw.home && !raw.away)) return null;

  const mapPlayers = (list: any[], starter: boolean) =>
    Array.isArray(list) ? list.map(p => normalizeLineupPlayer(p, starter)) : [];

  const homeStarters = mapPlayers(raw.home?.starters ?? raw.home?.players?.filter((p: any) => p.isStarter !== false), true);
  const homeSubs = mapPlayers(raw.home?.substitutes ?? raw.home?.players?.filter((p: any) => p.isStarter === false), false);
  const awayStarters = mapPlayers(raw.away?.starters ?? raw.away?.players?.filter((p: any) => p.isStarter !== false), true);
  const awaySubs = mapPlayers(raw.away?.substitutes ?? raw.away?.players?.filter((p: any) => p.isStarter === false), false);

  return {
    matchId,
    home: [...homeStarters, ...homeSubs],
    away: [...awayStarters, ...awaySubs],
    formation: {
      home: raw.home?.formation ?? undefined,
      away: raw.away?.formation ?? undefined,
    },
  };
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
      ? { uri: raw.logo, source: (raw.logoSource ?? "espn") as SourceName, confidence: 1 }
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

export function normalizeStanding(raw: any, competitionId: CompetitionId): TeamStanding {
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
  };
}

export function normalizeStandings(rawList: any[], competitionId: CompetitionId): TeamStanding[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter(Boolean)
    .map(r => normalizeStanding(r, competitionId))
    .sort((a, b) => (a.rank || 99) - (b.rank || 99));
}

// ─── Player ───────────────────────────────────────────────────────────────────

export function normalizePlayer(raw: any): Player {
  const image: PlayerImage | null = raw.image || raw.photo || raw.headshot
    ? {
        uri: ensureStr(raw.image ?? raw.photo ?? raw.headshot),
        source: (raw.imageSource ?? "espn") as SourceName,
        confidence: ensureFloat(raw.imageConfidence) ?? 0.8,
      }
    : null;

  return {
    id: ensureStr(raw.id ?? raw.espnId, slugify((raw.name ?? "player") + (raw.teamName ?? ""))),
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

export function normalizePlayerStats(raw: any, competitionId: CompetitionId): PlayerStats {
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

  const stats = normalizePlayerStats({
    id: player.id,
    goals: kind === "topscorers" ? (raw.goals ?? raw.value ?? raw.displayValue) : null,
    assists: kind === "topassists" ? (raw.assists ?? raw.value ?? raw.displayValue) : null,
    appearances: raw.appearances,
    minutesPlayed: raw.minutesPlayed,
  }, competitionId);

  return { player, stats };
}

// ─── Media ────────────────────────────────────────────────────────────────────

function tmdbImageUrl(path: string | null | undefined, size: "w500" | "w780" | "original" = "w780"): string | null {
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
    posterUri: tmdbImageUrl(raw.poster_path),
    backdropUri: tmdbImageUrl(raw.backdrop_path),
    releaseYear: raw.release_date ? new Date(raw.release_date).getFullYear() : null,
    originalLanguage: raw.original_language ?? null,
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((g: any) => ({ id: g.id, name: g.name }))
      : Array.isArray(raw.genre_ids)
        ? raw.genre_ids.map((id: number) => ({ id, name: "" }))
        : [],
    rating: ensureFloat(raw.vote_average),
    ratingCount: ensureInt(raw.vote_count),
    runtime: ensureInt(raw.runtime),
    status: raw.status ?? null,
    isPlayable: false, // TMDB is metadata only — caller must enrich with IPTV source
    isDownloadable: false,
    trailer: null,
    streamSources: [],
    budget: ensureInt(raw.budget),
    revenue: ensureInt(raw.revenue),
    collection: raw.belongs_to_collection
      ? { id: raw.belongs_to_collection.id, name: raw.belongs_to_collection.name }
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
    posterUri: tmdbImageUrl(raw.poster_path),
    backdropUri: tmdbImageUrl(raw.backdrop_path),
    releaseYear: raw.first_air_date ? new Date(raw.first_air_date).getFullYear() : null,
    originalLanguage: raw.original_language ?? null,
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((g: any) => ({ id: g.id, name: g.name }))
      : Array.isArray(raw.genre_ids)
        ? raw.genre_ids.map((id: number) => ({ id, name: "" }))
        : [],
    rating: ensureFloat(raw.vote_average),
    ratingCount: ensureInt(raw.vote_count),
    runtime: ensureInt(raw.episode_run_time?.[0] ?? raw.runtime),
    status: raw.status ?? null,
    isPlayable: false,
    isDownloadable: false,
    trailer: null,
    streamSources: [],
    totalSeasons: ensureInt(raw.number_of_seasons),
    totalEpisodes: ensureInt(raw.number_of_episodes),
    networks: Array.isArray(raw.networks) ? raw.networks.map((n: any) => n.name) : [],
    seasons: undefined,
    meta: defaultSourceMeta("tmdb"),
  };
}

export function normalizeEpisodeFromTmdb(raw: any, seriesId: number, seasonNumber: number): Episode {
  return {
    id: ensureStr(raw.id, `ep-${seriesId}-${seasonNumber}-${raw.episode_number}`),
    seriesId: { tmdbId: seriesId },
    seasonNumber,
    episodeNumber: ensureInt(raw.episode_number) ?? 0,
    title: raw.name ?? null,
    overview: raw.overview ?? null,
    stillUri: tmdbImageUrl(raw.still_path, "w500"),
    airDate: raw.air_date ?? null,
    runtime: ensureInt(raw.runtime),
    rating: ensureFloat(raw.vote_average),
    streamSources: [],
    isPlayable: false,
  };
}

export function normalizeTrailerFromServer(raw: any, mediaId: { tmdbId?: number | null }): Trailer {
  return {
    id: ensureStr(raw.id ?? raw.key, `trailer-${mediaId.tmdbId}`),
    mediaId,
    title: raw.name ?? raw.title ?? undefined,
    youtubeKey: raw.key ?? raw.youtubeKey ?? null,
    embedUrl: raw.embedUrl ?? null,
    source: raw.site === "YouTube" || raw.source === "youtube" ? "youtube" : "provider",
    embedRestricted: raw.embedRestricted ?? false,
  };
}

// ─── Watch progress ───────────────────────────────────────────────────────────

export function normalizeWatchProgress(raw: any): WatchProgress {
  const duration = ensureFloat(raw.duration) ?? 0;
  const currentTime = ensureFloat(raw.currentTime ?? raw.position) ?? 0;
  const progress = duration > 0
    ? Math.min(1, currentTime / duration)
    : ensureFloat(raw.progress) ?? 0;

  return {
    contentId: ensureStr(raw.id ?? raw.contentId, `content-${Date.now()}`),
    mediaType: raw.type ?? "movie",
    title: ensureStr(raw.title, "Untitled"),
    posterUri: raw.poster ?? raw.posterUri ?? null,
    progress,
    currentTime,
    duration,
    season: ensureInt(raw.season),
    episode: ensureInt(raw.episode),
    episodeTitle: raw.episodeTitle ?? null,
    lastWatchedAt: raw.lastWatched ?? raw.lastWatchedAt ?? nowIso(),
    tmdbId: ensureInt(raw.tmdbId),
    year: ensureInt(raw.year),
  };
}

export function normalizeWatchHistoryItem(raw: any): WatchHistoryItem {
  return {
    ...normalizeWatchProgress(raw),
    backdropUri: raw.backdrop ?? raw.backdropUri ?? null,
    genreIds: Array.isArray(raw.genre_ids) ? raw.genre_ids : [],
  };
}
