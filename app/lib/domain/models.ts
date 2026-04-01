/**
 * Nexora – Normalized Domain Models
 *
 * These are the canonical shapes used throughout the app.
 * Raw API responses must never reach the UI layer directly.
 * All adapters and services must map to these types.
 *
 * Sections:
 *   1. Shared primitives
 *   2. Sports models
 *   3. Media models
 *   4. User / state models
 *   5. Recommendation models
 *   6. Download / offline models
 */

// ─── 1. SHARED PRIMITIVES ────────────────────────────────────────────────────

/** Opaque branded string for IDs to prevent accidental mixing */
export type EntityId = string;

/** ISO-8601 string */
export type ISODateString = string;

/** Data provenance — where the value ultimately came from */
export type SourceName =
  | "espn"
  | "sofascore"
  | "transfermarkt"
  | "thesportsdb"
  | "tmdb"
  | "football-logos"
  | "wikipedia"
  | "ai-enrichment"
  | "ui-avatars"
  | "local-assets"
  | "m3u"
  | "xtream"
  | "internal";

/** Confidence [0..1] for merged/enriched fields */
export type Confidence = number;

/** Metadata attached to any entity that was merged from multiple sources */
export interface SourceMeta {
  /** Primary source that contributed this entity's canonical identity */
  primarySource: SourceName;
  /** Sources whose data was merged into this entity */
  mergedSources: SourceName[];
  /** UTC timestamp when this entity was last fetched/merged */
  fetchedAt: ISODateString;
  /** Confidence in the overall entity match [0..1] */
  confidence: Confidence;
}

// ─── 2. SPORTS MODELS ────────────────────────────────────────────────────────

export interface CompetitionId {
  espnSlug: string;       // e.g. "bel.1", "uefa.champions"
  displayName: string;    // e.g. "Jupiler Pro League"
  country?: string;
  season?: number;        // e.g. 2024
  type: "league" | "cup" | "international";
}

export interface Competition {
  id: CompetitionId;
  logo?: string | null;
  /** Short label for UI chips, e.g. "JPL" */
  abbreviation?: string;
  currentPhase?: string;
  meta?: SourceMeta;
}

export interface TeamLogo {
  uri: string;
  source: SourceName;
  confidence: Confidence;
}

export interface Team {
  /** Canonical ID: ESPN team ID when available, else slugified name */
  id: EntityId;
  name: string;
  shortName?: string;
  alternateNames?: string[];
  country?: string;
  logo?: TeamLogo | null;
  color?: string;
  founded?: number | null;
  venue?: string;
  stadiumCapacity?: number | null;
  coach?: string | null;
  clubColors?: string[];
  /** Parent club when this is a B-team or youth team */
  parentTeamId?: EntityId | null;
  competition?: CompetitionId;
  meta?: SourceMeta;
}

export interface TeamStats {
  teamId: EntityId;
  competitionId: CompetitionId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  cleanSheets?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  form?: string | null;           // e.g. "WWDLL"
  squadMarketValue?: string | null;
}

export interface TeamStanding extends TeamStats {
  rank: number;
  team: Team;
  recentResults?: MatchResultSummary[];
  upcomingMatches?: MatchPreview[];
}

export interface PlayerImage {
  uri: string;
  source: SourceName;
  confidence: Confidence;
}

export interface Player {
  /** Canonical ID: ESPN ID when available, else slugified name+team */
  id: EntityId;
  espnId?: string | null;
  name: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  /** Date of birth, ISO-8601 */
  birthDate?: ISODateString | null;
  nationality?: string | null;
  position?: string | null;
  positionAbbr?: string | null;
  height?: string | null;
  weight?: string | null;
  shirtNumber?: number | null;
  marketValue?: string | null;
  teamId?: EntityId | null;
  teamName?: string | null;
  competitionId?: CompetitionId | null;
  image?: PlayerImage | null;
  /** Contract end date */
  contractUntil?: ISODateString | null;
  foot?: "left" | "right" | "both" | null;
  clubHistory?: ClubHistoryItem[];
  meta?: SourceMeta;
}

export interface ClubHistoryItem {
  teamId?: EntityId;
  teamName: string;
  logo?: string | null;
  from?: number | null;    // year
  to?: number | null;      // year; null = present
  appearances?: number | null;
  goals?: number | null;
}

export interface PlayerStats {
  playerId: EntityId;
  competitionId: CompetitionId;
  season?: number;
  goals?: number | null;
  assists?: number | null;
  appearances?: number | null;
  minutesPlayed?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  rating?: number | null;
}

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "delayed";

export interface MatchScore {
  home: number | null;
  away: number | null;
  /** Score after extra time or penalties if applicable */
  aggregate?: { home: number; away: number } | null;
  penalties?: { home: number; away: number } | null;
}

export interface MatchResultSummary {
  matchId: EntityId;
  opponent: string;
  isHome: boolean;
  status: MatchStatus;
  score?: MatchScore | null;
  date?: ISODateString | null;
}

export interface MatchPreview {
  matchId: EntityId;
  opponent: string;
  isHome: boolean;
  date?: ISODateString | null;
}

export interface MatchTeamRef {
  id: EntityId;
  name: string;
  logo?: string | null;
  score?: number | null;
  logoSource?: SourceName;
}

export interface Match {
  id: EntityId;
  espnId?: string | null;
  sofascoreId?: string | null;
  homeTeam: MatchTeamRef;
  awayTeam: MatchTeamRef;
  competition: CompetitionId;
  status: MatchStatus;
  score: MatchScore;
  /** Kick-off time ISO-8601 */
  startTime?: ISODateString | null;
  /** Elapsed minutes when live */
  minute?: number | null;
  venue?: string | null;
  round?: string | null;
  /** Whether a live stream link is available */
  hasStream?: boolean;
  meta?: SourceMeta;
}

export type EventType =
  | "goal"
  | "yellow_card"
  | "red_card"
  | "second_yellow"
  | "substitution"
  | "penalty_goal"
  | "penalty_miss"
  | "own_goal"
  | "var_decision"
  | "kickoff"
  | "halftime"
  | "fulltime"
  | "extra_time_start"
  | "penalty_shootout_start"
  | "other";

export interface MatchEvent {
  id: EntityId;
  matchId: EntityId;
  type: EventType;
  minute: number;
  minuteExtra?: number | null;
  /** Primary player involved (scorer, carded player, player substituted out) */
  playerId?: EntityId | null;
  playerName?: string | null;
  /** Secondary player (assist, substitute-in) */
  relatedPlayerId?: EntityId | null;
  relatedPlayerName?: string | null;
  /** "home" or "away" */
  team: "home" | "away";
  description?: string | null;
  isHome?: boolean;
}

export interface MatchLineupPlayer {
  playerId: EntityId;
  name: string;
  position?: string | null;
  positionAbbr?: string | null;
  shirtNumber?: number | null;
  isStarter: boolean;
  image?: string | null;
  rating?: number | null;
}

export interface MatchLineupsData {
  matchId: EntityId;
  home: MatchLineupPlayer[];
  away: MatchLineupPlayer[];
  formation?: { home?: string; away?: string };
}

export interface MatchStatEntry {
  label: string;
  home: string | number;
  away: string | number;
}

export interface MatchStats {
  matchId: EntityId;
  entries: MatchStatEntry[];
}

/** Full match detail — all data in one normalized object */
export interface MatchDetail {
  match: Match;
  events: MatchEvent[];
  lineups?: MatchLineupsData | null;
  stats?: MatchStats | null;
  /** Raw input blob for AI analysis */
  analysisInput?: MatchAnalysisInput | null;
  meta?: SourceMeta;
}

/** Compact payload for AI prediction/analysis */
export interface MatchAnalysisInput {
  matchId: EntityId;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isLive?: boolean | null;
  minute?: number | null;
  events: Array<{ minute: number; type: string; team: string; player?: string }>;
  stats?: MatchStatEntry[];
  standings?: Array<{
    team: string;
    rank: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
    form?: string;
    cleanSheets?: number | null;
    gamesPlayed?: number | null;
  }>;
  headToHead?: {
    homeWins: number;
    awayWins: number;
    draws: number;
  } | null;
}

// ─── 3. MEDIA MODELS ─────────────────────────────────────────────────────────

/** TMDB is metadata only. It does not provide playable streams. */
export type MediaType = "movie" | "series";

export interface MediaId {
  tmdbId?: number | null;
  imdbId?: string | null;
  /** IPTV channel/stream ID if content is backed by IPTV */
  iptv?: string | null;
}

export interface MediaGenre {
  id: number;
  name: string;
}

export interface StreamSource {
  /** Opaque URL or embed token — may require server-signed access */
  uri: string;
  quality?: "4K" | "FHD" | "HD" | "SD" | "Auto" | null;
  lang?: string | null;
  /** Whether this source is directly playable (HLS/MP4) or is an embed page */
  type: "hls" | "mp4" | "embed" | "xtream" | "m3u";
  provider?: string | null;
}

/**
 * A piece of content that is actually downloadable/playable.
 * TMDB items do NOT have this unless backed by an IPTV source.
 */
export interface DownloadableAsset {
  id: EntityId;
  mediaId: MediaId;
  title: string;
  quality?: string | null;
  /** File size estimate in bytes */
  estimatedBytes?: number | null;
  streamSource: StreamSource;
  /** Whether offline playback is truly available */
  canDownload: boolean;
}

export interface Trailer {
  id: EntityId;
  mediaId: MediaId;
  title?: string;
  /** YouTube video ID if source is YouTube */
  youtubeKey?: string | null;
  /** Fallback embed URL if YouTube is not available */
  embedUrl?: string | null;
  source: "youtube" | "provider" | "tmdb" | "none";
  /** Whether embedding is known to be restricted */
  embedRestricted?: boolean;
}

export interface Title {
  id: MediaId;
  type: MediaType;
  title: string;
  originalTitle?: string | null;
  overview?: string | null;
  tagline?: string | null;
  posterUri?: string | null;
  backdropUri?: string | null;
  releaseYear?: number | null;
  /** ISO-639-1 language code */
  originalLanguage?: string | null;
  genres?: MediaGenre[];
  rating?: number | null;
  ratingCount?: number | null;
  runtime?: number | null;         // minutes
  status?: string | null;
  /** Whether this title has actual playable sources */
  isPlayable: boolean;
  /** Whether download is supported (isPlayable required) */
  isDownloadable: boolean;
  trailer?: Trailer | null;
  streamSources?: StreamSource[];
  meta?: SourceMeta;
}

export interface Movie extends Title {
  type: "movie";
  budget?: number | null;
  revenue?: number | null;
  collection?: { id: number; name: string } | null;
}

export interface Episode {
  id: EntityId;
  seriesId: MediaId;
  seasonNumber: number;
  episodeNumber: number;
  title?: string | null;
  overview?: string | null;
  stillUri?: string | null;
  airDate?: ISODateString | null;
  runtime?: number | null;
  rating?: number | null;
  streamSources?: StreamSource[];
  isPlayable: boolean;
}

export interface Season {
  id: EntityId;
  seriesId: MediaId;
  seasonNumber: number;
  name?: string | null;
  overview?: string | null;
  posterUri?: string | null;
  airDate?: ISODateString | null;
  episodeCount?: number | null;
  episodes?: Episode[];
}

export interface Series extends Title {
  type: "series";
  seasons?: Season[];
  totalSeasons?: number | null;
  totalEpisodes?: number | null;
  networks?: string[];
  /** Current episode being watched (if continue watching) */
  continueAt?: { season: number; episode: number; progress: number } | null;
}

export interface RecommendationItem {
  rank: number;
  title: Title | Movie | Series;
  /** Why this was recommended */
  reason: "mood" | "because_you_watched" | "trending" | "genre_affinity" | "editorial" | "ai" | "rules";
  /** Human-readable explanation label */
  explanation?: string | null;
  score?: number | null;
}

// ─── 4. USER / STATE MODELS ──────────────────────────────────────────────────

export interface FollowedTeam {
  teamId: EntityId;
  teamName: string;
  logo?: string | null;
  competition?: string | null;
  followedAt: ISODateString;
}

export interface FollowedMatch {
  matchId: EntityId;
  homeTeam: string;
  awayTeam: string;
  competition?: string | null;
  espnLeague?: string | null;
  startTime?: ISODateString | null;
  notificationsEnabled: boolean;
  followedAt: ISODateString;
}

export interface WatchProgress {
  contentId: EntityId;
  mediaType: MediaType | "channel" | "sport";
  title: string;
  posterUri?: string | null;
  /** Progress ratio [0..1] */
  progress: number;
  currentTime: number;   // seconds
  duration: number;      // seconds
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  lastWatchedAt: ISODateString;
  tmdbId?: number | null;
  year?: number | null;
}

export interface WatchHistoryItem extends WatchProgress {
  backdropUri?: string | null;
  genreIds?: number[];
}

export interface MoodPreference {
  /** Mood label: "action", "comedy", "drama", "thriller", "horror", etc. */
  mood: string;
  /** Affinity weight [0..1] derived from watch history */
  affinity: number;
  lastUpdatedAt: ISODateString;
}

// ─── 5. RECOMMENDATION META ──────────────────────────────────────────────────

export interface RecommendationContext {
  userId?: string;
  moods?: MoodPreference[];
  recentlyWatched?: EntityId[];
  followedTeams?: EntityId[];
  genres?: number[];
  runtimePreference?: "short" | "medium" | "long" | null;
  language?: string;
}

// ─── 6. DOWNLOAD / OFFLINE MODELS ───────────────────────────────────────────

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadTask {
  taskId: EntityId;
  asset: DownloadableAsset;
  status: DownloadStatus;
  /** Progress [0..1] */
  progress: number;
  /** Downloaded bytes */
  downloadedBytes?: number | null;
  filePath?: string | null;
  startedAt?: ISODateString | null;
  completedAt?: ISODateString | null;
  error?: string | null;
}

export interface OfflineLibraryItem {
  taskId: EntityId;
  title: string;
  type: MediaType | "channel";
  posterUri?: string | null;
  filePath: string;
  fileSizeBytes?: number | null;
  downloadedAt: ISODateString;
  quality?: string | null;
  season?: number | null;
  episode?: number | null;
}

// ─── 7. ENTITY RESOLUTION ────────────────────────────────────────────────────

/**
 * Result of identity resolution — maps a raw external entity to a
 * canonical internal entity ID.
 */
export interface ResolutionResult<T> {
  entity: T;
  canonicalId: EntityId;
  confidence: Confidence;
  resolvedVia: string;
}
