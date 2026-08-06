/**
 * Nexora – Normalized Domain Models
 *
 * These are the canonical shapes used throughout the app.
 * Raw API responses must never reach the UI layer directly.
 * All adapters and services must map to these types.
 *
 * Sections:
 *   1. Shared primitives
 *   2. Media models
 *   3. User / state models
 *   4. Recommendation models
 *   5. Download / offline models
 */

// ─── 1. SHARED PRIMITIVES ────────────────────────────────────────────────────

/** Opaque branded string for IDs to prevent accidental mixing */
export type EntityId = string;

/** ISO-8601 string */
export type ISODateString = string;

/** Data provenance — where the value ultimately came from */
export type SourceName =
  | "tmdb"
  | "wikipedia"
  | "ai-enrichment"
  | "ui-avatars"
  | "local-assets"
  | "m3u"
  | "xtream"
  | "internal"
  | "espn"
  | "sofascore";

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

// ─── 3. MEDIA MODELS ─────────────────────────────────────────────────────────

/** TMDB is metadata only. It does not provide playable streams. */
export type MediaType = "movie" | "series";

export interface MediaId {
  tmdbId?: number | null;
  imdbId?: string | null;
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
 * TMDB items do NOT have this unless backed by a stream source.
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
  /** TMDB vote_average (0-10 scale) */
  rating?: number | null;
  /** TMDB vote count */
  ratingCount?: number | null;
  /** OMDB IMDb rating (0-10 scale) */
  imdbRating?: number | null;
  /** OMDB IMDb vote count */
  imdbVotes?: number | null;
  /** OMDB Rotten Tomatoes rating (0-100 scale, critics score) */
  rottenTomatoesRating?: number | null;
  /** OMDB Metacritic score (0-100 scale) */
  metacriticScore?: number | null;
  /** OMDB IMDb ID (tt...) */
  imdbId?: string | null;
  runtime?: number | null; // minutes
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
  reason:
    | "mood"
    | "because_you_watched"
    | "trending"
    | "genre_affinity"
    | "editorial"
    | "ai"
    | "rules";
  /** Human-readable explanation label */
  explanation?: string | null;
  score?: number | null;
}

// ─── 4. USER / STATE MODELS ──────────────────────────────────────────────────

export interface WatchProgress {
  contentId: EntityId;
  mediaType: MediaType | "channel";
  title: string;
  posterUri?: string | null;
  /** Progress ratio [0..1] */
  progress: number;
  currentTime: number; // seconds
  duration: number; // seconds
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
  genres?: number[];
  runtimePreference?: "short" | "medium" | "long" | null;
  language?: string;
}

// ─── 6. SPORTS / FOLLOW STATE MODELS (compatibility surface) ──────────────

export type SportSlug = string;

export type CompetitionId = {
  espnSlug: string;
  displayName: string;
  country?: string;
  season?: number;
  type?: "league" | "cup" | "international";
};

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "delayed";

export type EventType = string;

export interface Team {
  id: EntityId;
  name: string;
  shortName?: string | null;
  logoUri?: string | null;
  country?: string | null;
  alternateNames?: string[];
  logo?: { uri: string; source: SourceName; confidence: number } | null;
  color?: string | null;
  founded?: number | null;
  venue?: string | null;
  stadiumCapacity?: number | null;
  coach?: string | null;
  clubColors?: string[];
  parentTeamId?: string | null;
  meta?: SourceMeta | null;
}

export interface TeamStanding {
  team: Team;
  position?: number | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  points?: number | null;
  goalDiff?: number | null;
  rank?: number | null;
  groupPhase?: string | null;
  groupIndex?: number | null;
}

export interface TeamStats {
  teamId?: EntityId;
  competitionId?: CompetitionId;
  possession?: number | null;
  shotsOnTarget?: number | null;
  shots?: number | null;
  fouls?: number | null;
  corners?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  goalDifference?: number | null;
  points?: number | null;
  cleanSheets?: number | null;
  form?: string | null;
  squadMarketValue?: unknown;
}

export interface Player {
  id: EntityId;
  name?: string | null;
  team?: Team | null;
  position?: string | null;
  nationality?: string | null;
  imageUri?: string | null;
  espnId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
  birthDate?: string | null;
  positionAbbr?: string | null;
  height?: string | null;
  weight?: string | null;
  shirtNumber?: number | null;
  marketValue?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  image?: PlayerImage | null;
  contractUntil?: string | null;
  foot?: string | null;
  clubHistory?: string[];
  meta?: SourceMeta | null;
}

export interface PlayerStats {
  playerId?: EntityId;
  competitionId?: CompetitionId;
  season?: number | null;
  goals?: number | null;
  assists?: number | null;
  minutes?: number | null;
  rating?: number | null;
  minutesPlayed?: number | null;
  appearances?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
}

export interface PlayerImage {
  id?: EntityId;
  url?: string | null;
  width?: number | null;
  height?: number | null;
  uri?: string | null;
  source?: SourceName | null;
  confidence?: number | null;
}

export interface MatchTeamRef {
  id: EntityId;
  name?: string | null;
  shortName?: string | null;
  score?: number | null;
  logoUri?: string | null;
  logo?: { uri: string; source?: SourceName; confidence?: number } | null;
  [key: string]: unknown;
}

export interface MatchScore {
  home?: number | null;
  away?: number | null;
  aggregate?: number | null;
}

export interface Match {
  id: EntityId;
  competitionId?: CompetitionId;
  homeTeam?: MatchTeamRef | Team | string | null;
  awayTeam?: MatchTeamRef | Team | string | null;
  score?: MatchScore | null;
  status: MatchStatus;
  startTime?: ISODateString | null;
  venue?: string | null;
  round?: string | null;
  season?: number | null;
  meta?: SourceMeta;
  espnId?: string | null;
  sofascoreId?: string | null;
  sport?: string | null;
  espnLeague?: string | null;
  league?: string | null;
  competition?: { displayName?: string | null; espnSlug?: string | null } | null;
  [key: string]: unknown;
}

export interface MatchDetail {
  match?: Match | null;
  events?: MatchEvent[];
  stats?: MatchStats | null;
  lineups?: MatchLineupsData | null;
  analysisInput?: MatchAnalysisInput;
  meta?: SourceMeta;
}

export interface MatchEvent {
  id: EntityId;
  type: EventType;
  minute?: number | null;
  minuteExtra?: number | null;
  teamId?: EntityId | null;
  playerId?: EntityId | null;
  playerName?: string | null;
  player?: string | null;
  relatedPlayerId?: EntityId | null;
  relatedPlayerName?: string | null;
  team?: "home" | "away" | null;
  description?: string | null;
  isHome?: boolean;
  matchId?: EntityId;
}

export interface MatchLineupPlayer {
  id?: EntityId;
  playerId?: EntityId;
  name?: string | null;
  position?: string | null;
  positionAbbr?: string | null;
  shirtNumber?: number | null;
  jerseyNumber?: number | null;
  isStarter?: boolean;
  image?: string | null;
  photoSource?: string | null;
  rating?: number | null;
}

export interface MatchLineupsData {
  matchId?: EntityId;
  home?: MatchLineupPlayer[];
  away?: MatchLineupPlayer[];
  formation?: { home?: string | null; away?: string | null };
}

export interface MatchStats {
  home?: TeamStats | null;
  away?: TeamStats | null;
  matchId?: EntityId;
  entries?: unknown[];
  [key: string]: unknown;
}

export interface Competition {
  id: CompetitionId;
  name: string;
  country?: string | null;
  type?: "league" | "cup" | "international";
}

export interface MatchAnalysisInput {
  matchId?: string;
  competition?: CompetitionId | { displayName?: string | null } | null;
  homeTeam?: Team | string | null;
  awayTeam?: Team | string | null;
  events?: MatchEvent[];
  stats?: MatchStats | unknown[] | null;
  status?: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: number | null;
  isLive?: boolean;
  [key: string]: unknown;
}

export interface FollowedTeam {
  teamId: EntityId;
  teamName: string;
  competitionId?: string | null;
  competition?: string | null;
  logoUri?: string | null;
  followedAt: ISODateString;
}

export interface FollowedMatch {
  matchId: EntityId;
  homeTeamName: string;
  awayTeamName: string;
  homeTeam?: string;
  awayTeam?: string;
  competitionId?: string | null;
  competition?: string | null;
  espnLeague?: string | null;
  startTime?: ISODateString | null;
  notificationsEnabled?: boolean;
  followedAt: ISODateString;
}

export type TeamDNA = {
  teamId?: string;
  teamName?: string;
  season?: number | null;
  competition?: string | null;
  styleLabels?: unknown[];
  formations?: string[];
  attack?: Record<string, unknown>;
  defence?: Record<string, unknown>;
  buildUp?: Record<string, unknown>;
  discipline?: Record<string, unknown>;
  [key: string]: unknown;
};
export type TeamDNAMetric = Record<string, unknown>;
export type PlayStyleLabel = string;
export type AttackWidthLabel = string;
export type DefensiveLineLabel = string;
export type BuildUpLabel = string;
export type ThreatLevel = "low" | "medium" | "high" | "critical";
export interface LiveMatchIntelligence {
  matchId?: EntityId;
  phase?: string | null;
  threatLevel?: ThreatLevel | null;
  narrative?: string | null;
  isLive?: boolean;
  [key: string]: unknown;
}
export interface AIMatchExplanation {
  matchId?: EntityId;
  phase?: string | null;
  summary?: string | null;
  headline?: string | null;
  [key: string]: unknown;
}
export interface PlayerMarketValue {
  playerId: EntityId;
  marketValue?: number | null;
  currency?: string | null;
  displayValue?: string | null;
  numericValue?: number | null;
  history?: Array<{ value?: number | null; source?: string | null }> | null;
  source?: string | null;
  [key: string]: unknown;
}
export type MatchIntelligenceModel = Record<string, unknown>;

export interface MultiSportEvent {
  id?: EntityId;
  matchId?: EntityId;
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  status?: string | null;
  startTime?: ISODateString | null;
  [key: string]: unknown;
}

export interface MultiSportStandingEntry {
  rank?: number | null;
  team?: Team | null;
  [key: string]: unknown;
}

export interface MultiSportTeam {
  id?: EntityId;
  name?: string | null;
  shortName?: string | null;
  logoUri?: string | null;
  [key: string]: unknown;
}

export interface EspnNewsItem {
  id?: EntityId;
  title?: string | null;
  url?: string | null;
  [key: string]: unknown;
}

export interface MatchOdds {
  matchId?: EntityId;
  bookmakers?: unknown[];
  [key: string]: unknown;
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

// ─── 8. TEAM DNA ─────────────────────────────────────────────────────────────
