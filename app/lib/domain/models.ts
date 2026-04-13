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
  espnSlug: string; // e.g. "bel.1", "uefa.champions"
  displayName: string; // e.g. "Jupiler Pro League"
  country?: string;
  season?: number; // e.g. 2024
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
  form?: string | null; // e.g. "WWDLL"
  squadMarketValue?: string | null;
}

export interface TeamStanding extends TeamStats {
  rank: number;
  team: Team;
  groupPhase?: string | null;
  groupIndex?: number | null;
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
  from?: number | null; // year
  to?: number | null; // year; null = present
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

/** ESPN sport slugs as documented in github.com/pseudo-r/Public-ESPN-API */
export type SportSlug =
  | "soccer"
  | "basketball"
  | "football"
  | "hockey"
  | "baseball"
  | "racing"
  | "tennis"
  | "rugby"
  | "golf"
  | "mma"
  | "cricket"
  | "volleyball"
  | "lacrosse";

/** Normalized event from any ESPN sport (NBA, NFL, NHL, F1, ATP etc.) */
export interface MultiSportEvent {
  id: string;
  sport: SportSlug | string;
  espnLeague: string;
  league: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  statusDetail: string;
  /** Minute (soccer) or null */
  minute: number | null;
  /** Period / quarter / half (basketball, hockey, football) */
  period: number | null;
  /** Game clock display string (e.g. "3:25", "Halftime") */
  clock: string | null;
  startDate: string | null;
  startTime: string | null;
  venue: string | null;
  /** TV broadcast info */
  broadcast: string | null;
}

export interface MultiSportStandingEntry {
  teamId: string;
  teamName: string;
  abbreviation: string;
  logo: string | null;
  group: string;
  wins: number;
  losses: number;
  winPct: number;
  gamesBack: string | null;
  streak: string | null;
  stats: Record<string, string | number | null>;
}

export interface EspnNewsItem {
  id: string;
  headline: string;
  description: string;
  published: string;
  imageUrl: string | null;
  linkUrl: string | null;
  sport: string;
  league: string;
  author: string;
  categories: string[];
}

export interface MultiSportTeam {
  id: string;
  slug: string;
  displayName: string;
  shortName: string;
  abbreviation: string;
  location: string;
  color: string;
  alternateColor: string;
  logo: string | null;
  sport: string;
  league: string;
}

export interface MatchOdds {
  matchId: string;
  sport: string;
  league: string;
  odds: Array<{
    provider: string;
    moneylineHome: number | null;
    moneylineAway: number | null;
    spreadHome: number | null;
    spreadAway: number | null;
    overUnder: number | null;
    details: string;
  }>;
}

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
  sport?: SportSlug | string;
  espnLeague?: string | null;
  league?: string | null;
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
  photoSource?: string | null;
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
  events: Array<{
    minute: number;
    type: string;
    team: string;
    player?: string;
  }>;
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
  venue?: string | null;
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

// ─── 8. TEAM DNA ─────────────────────────────────────────────────────────────

export type PlayStyleLabel =
  | "high-press"
  | "mid-press"
  | "low-block"
  | "possession"
  | "counter-attack"
  | "direct"
  | "tiki-taka"
  | "long-ball"
  | "gegenpressing";

export type AttackWidthLabel = "wide" | "central" | "narrow" | "mixed";
export type DefensiveLineLabel = "high" | "medium" | "deep";
export type BuildUpLabel = "short-pass" | "long-ball" | "mixed";

/** A single quantified tactical metric with a display label and 0–100 value */
export interface TeamDNAMetric {
  /** Machine key — used for icon/style mapping */
  key: string;
  /** Human-readable label */
  label: string;
  /** Normalized value 0–100 */
  value: number;
  /** Optional contextual description */
  description?: string | null;
}

/**
 * Team DNA — tactical fingerprint derived from season stats.
 * Tells users HOW a team plays before the match starts.
 */
export interface TeamDNA {
  teamId: EntityId;
  teamName: string;
  season?: number | null;
  competition?: string | null;

  /** Primary tactical style labels (up to 3) */
  styleLabels: PlayStyleLabel[];
  /** Preferred formation(s) this season */
  formations: string[];

  /** Attack profile */
  attack: {
    width: AttackWidthLabel;
    setpieceThreat: number; // 0–100
    counterAttackSpeed: number; // 0–100
    goalScoringRate: number; // goals/90
    shotsPerGame: number;
  };

  /** Defence profile */
  defence: {
    line: DefensiveLineLabel;
    pressingIntensity: number; // 0–100: PPDA-derived or proxy
    cleanSheetRate: number; // 0–100
    goalsAllowedPerGame: number;
    tackles: number; // tackles/90
  };

  /** Build-up play */
  buildUp: {
    style: BuildUpLabel;
    possessionAvg: number; // %
    passAccuracy: number; // %
    shortPassRatio: number; // 0-100
  };

  /** Discipline */
  discipline: {
    yellowCardsPerGame: number;
    redCardsPerGame: number;
    foulsPerGame: number;
    foulsTaken: number;
  };

  /** Individual metrics for radar/spider charts */
  metrics: TeamDNAMetric[];

  meta?: SourceMeta;
}

// ─── 9. LIVE MATCH INTELLIGENCE ──────────────────────────────────────────────

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface MatchMomentumSnapshot {
  /** Minutes elapsed at this snapshot */
  minute: number;
  /** Home momentum 0–100 */
  home: number;
  /** Away momentum 0–100 */
  away: number;
}

/**
 * Live Match Intelligence — real-time tactical and statistical read of
 * a match in progress.  Also available for finished matches as a summary.
 */
export interface LiveMatchIntelligence {
  matchId: EntityId;
  isLive: boolean;
  minute?: number | null;

  /** Overall match momentum (home 0–100, away = 100-home) */
  momentum: {
    home: number;
    away: number;
    dominantSide: "home" | "away" | "balanced";
    /** Intensity of play overall 0–100 */
    intensity: number;
    /** Rolling snapshots for sparkline chart */
    history: MatchMomentumSnapshot[];
  };

  /** Per-side threat levels */
  threat: {
    home: ThreatLevel;
    away: ThreatLevel;
  };

  /** Head-to-head stat comparison */
  statsComparison: Array<{
    label: string;
    homeValue: string | number;
    awayValue: string | number;
    /** Which side is ahead */
    advantage: "home" | "away" | "equal";
  }>;

  /** Narrative: key events in last 15 minutes */
  recentNarrative: string[];

  /** Flag: is this data live or reconstructed post-match */
  dataQuality: "live" | "reconstructed" | "limited";

  meta?: SourceMeta;
}

// ─── 10. AI MATCH EXPLANATION ────────────────────────────────────────────────

/**
 * AI-generated human-readable explanation of a match.
 * Generated client-side from the match analysis engine + LLM fallback.
 */
export interface AIMatchExplanation {
  matchId: EntityId;
  phase: "prematch" | "live" | "halftime" | "fulltime";
  headline: string;
  summary: string;
  keyFactors: string[];
  /** Data signals that were available */
  dataSignals: {
    form: boolean;
    standings: boolean;
    lineups: boolean;
    liveStats: boolean;
    headToHead: boolean;
    injuries: boolean;
  };
  /** Confidence 0–1 in narrative quality */
  confidence: number;
  generatedAt: ISODateString;
}

// ─── 11. PLAYER MARKET VALUE ─────────────────────────────────────────────────

export interface PlayerMarketValue {
  playerId: EntityId;
  playerName: string;
  /** Formatted string e.g. "€45.0M" */
  displayValue: string | null;
  /** Raw numeric value in EUR */
  numericValue: number | null;
  /** Source that provided the value */
  source: SourceName;
  /** Date the valuation was recorded */
  valuationDate?: ISODateString | null;
  /** Historic valuations for sparkline */
  history?: Array<{
    date: ISODateString;
    value: number;
    formatted: string;
  }> | null;
  meta?: SourceMeta;
}

// ─── 12. MATCH INTELLIGENCE ─────────────────────────────────────────────────

/**
 * Unified AI match intelligence — combines prediction, rating,
 * hot team, upset alert, momentum, and post-match explainer
 * into a single structured shape.
 */
export interface MatchIntelligenceModel {
  matchId: EntityId | null;
  phase: "prematch" | "live" | "halftime" | "fulltime";

  /** The team name or "Draw" */
  predictedWinner: string;
  prediction: "Home Win" | "Away Win" | "Draw";
  /** Confidence 0–100 */
  confidence: number;
  confidenceLabel: "Low" | "Medium" | "High" | "Elite";
  expectedScore: string;
  reasoning: string;
  keyFactors: string[];

  probabilities: {
    home: number;
    draw: number;
    away: number;
  };

  /** Entertainment/quality rating 1–10 */
  matchRating: number;
  matchRatingLabel: string;

  /** Home-biased momentum 0–100 */
  momentumScore: number;
  momentumSide: "home" | "away" | "balanced";

  upsetAlert: {
    active: boolean;
    probability: number;
    underdogTeam: string | null;
    reasoning: string | null;
  };

  hotTeam: {
    active: boolean;
    team: string | null;
    side: "home" | "away" | null;
    form: string | null;
    formPoints: number;
    reasoning: string | null;
  };

  postMatchExplainer: {
    available: boolean;
    whyResult: string;
    keyMoments: {
      minute: number;
      description: string;
      impact: "high" | "medium" | "low";
    }[];
    playerImpact: {
      player: string;
      team: string;
      contribution: string;
      rating: number;
    }[];
    tacticalSummary: string | null;
    resultVsPrediction: "expected" | "upset" | "partial-surprise";
  } | null;

  dataSignals: {
    form: boolean;
    standings: boolean;
    headToHead: boolean;
    injuries: boolean;
    liveStats: boolean;
    lineups: boolean;
  };
  dataQuality: "rich" | "moderate" | "limited";

  source: "nexora-match-intelligence";
  generatedAt: ISODateString;
}
