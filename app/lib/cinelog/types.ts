/**
 * CineLog — domain types.
 *
 * Every screen and component consumes these shapes. Raw TMDB payloads never
 * leave `lib/cinelog/api.ts`.
 */

export type MediaType = "movie" | "series";

/** Stable CineLog identifier, e.g. `movie:603` or `series:1396`. */
export type MediaId = string;

export interface Genre {
  id: number;
  name: string;
}

/** Fields shared by movies and series in list and detail contexts. */
export interface MediaSummary {
  /** `${type}:${tmdbId}` — unique across both media types. */
  id: MediaId;
  tmdbId: number;
  type: MediaType;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  /** Release year (movies) or first-air year (series); 0 when unknown. */
  year: number;
  /** TMDB community score, 0–10. */
  rating: number;
  voteCount: number;
  genreIds: number[];
  genres: string[];
  popularity: number;
  releaseDate: string | null;
}

export interface Movie extends MediaSummary {
  type: "movie";
  /** Minutes; 0 when unknown. */
  runtime: number;
  tagline: string | null;
  status: string | null;
  certification: string | null;
  imdbId: string | null;
  directors: string[];
  writers: string[];
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  poster: string | null;
  overview: string;
}

export interface Series extends MediaSummary {
  type: "series";
  seasonCount: number;
  episodeCount: number;
  status: string | null;
  certification: string | null;
  networks: string[];
  creators: string[];
  /** Average episode runtime in minutes; 0 when unknown. */
  episodeRuntime: number;
  lastAirDate: string | null;
  seasons: SeasonSummary[];
}

export type MediaDetail = Movie | Series;

export interface Episode {
  id: string;
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string;
  still: string | null;
  runtime: number;
  airDate: string | null;
  rating: number;
}

export interface Season extends SeasonSummary {
  episodes: Episode[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  photo: string | null;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  photo: string | null;
}

export interface Trailer {
  key: string;
  name: string;
  type: string;
  official: boolean;
}

export interface Person {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string | null;
  photo: string | null;
  knownFor: MediaSummary[];
}

/** Detail payload for the movie/series pages. */
export interface TitleDetail<T extends MediaDetail = MediaDetail> {
  title: T;
  cast: CastMember[];
  crew: CrewMember[];
  trailers: Trailer[];
  similar: MediaSummary[];
  recommendations: MediaSummary[];
}

export interface PagedResult<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

export interface SearchResults {
  movies: MediaSummary[];
  series: MediaSummary[];
  people: PersonResult[];
}

export interface PersonResult {
  id: number;
  name: string;
  photo: string | null;
  knownForDepartment: string | null;
  knownForTitles: string[];
}

// ── Browse filters ───────────────────────────────────────────────────────────

export type MovieListKey =
  | "popular"
  | "trending"
  | "top_rated"
  | "now_playing"
  | "upcoming";

export type SeriesListKey =
  | "popular"
  | "trending"
  | "top_rated"
  | "airing_now"
  | "new_series";

// ── User library ─────────────────────────────────────────────────────────────

export type WatchState = "want_to_watch" | "watching" | "watched";

/** Poster-level snapshot stored locally so lists render without a network hop. */
export interface LibraryEntryRef {
  id: MediaId;
  tmdbId: number;
  type: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: number;
  rating: number;
  genres: string[];
  genreIds: number[];
  /** Only set for series. */
  seasonCount?: number;
  runtime?: number;
}

export interface WatchlistItem extends LibraryEntryRef {
  addedAt: string;
}

export interface FavoriteItem extends LibraryEntryRef {
  addedAt: string;
}

export interface UserRating extends LibraryEntryRef {
  /** 1–10 */
  score: number;
  ratedAt: string;
}

export interface WatchHistoryItem extends LibraryEntryRef {
  state: WatchState;
  watchedAt: string;
  /** Minutes credited towards "hours watched". */
  minutes: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

/** Continue-watching progress for a movie or a specific series episode. */
export interface WatchProgress extends LibraryEntryRef {
  /** 0–100 */
  percent: number;
  positionSeconds: number;
  durationSeconds: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  updatedAt: string;
}

/** Per-episode watched flags, keyed `s{season}e{episode}`. */
export type EpisodeWatchMap = Record<string, string>;

export interface Recommendation {
  item: MediaSummary;
  /** Human-readable explanation, e.g. "Because you watched Dune". */
  reason: string;
  score: number;
}
