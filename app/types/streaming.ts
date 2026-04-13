/**
 * Nexora Streaming — Core Type Definitions
 * Covers movies, series, episodes, live channels and shared entities.
 */

export type ContentType = "movie" | "series" | "live";

export type Genre =
  | "Action"
  | "Adventure"
  | "Animation"
  | "Comedy"
  | "Crime"
  | "Documentary"
  | "Drama"
  | "Fantasy"
  | "Horror"
  | "Mystery"
  | "Romance"
  | "Sci-Fi"
  | "Thriller"
  | "Family"
  | "History"
  | "Music"
  | "War"
  | "Western"
  | "Biographical";

export type LiveCategory =
  | "entertainment"
  | "news"
  | "kids"
  | "documentary"
  | "sports"
  | "music"
  | "lifestyle";

export type ContentRating =
  | "G"
  | "PG"
  | "PG-13"
  | "R"
  | "NC-17"
  | "TV-MA"
  | "TV-14"
  | "TV-PG"
  | "TV-Y7";

/** Shared fields for every piece of content */
export interface BaseContent {
  id: string;
  title: string;
  description: string;
  poster: string | null;
  backdrop: string | null;
  genres: Genre[];
  rating: number; // 0–10
  contentRating?: ContentRating;
  year: number;
  addedAt?: string; // ISO date
  isPremium?: boolean;
  isNew?: boolean;
  isFeatured?: boolean;
}

/** A feature film */
export interface Movie extends BaseContent {
  type: "movie";
  duration: number; // minutes
  director?: string;
  cast?: string[];
  streamUrl?: string | null;
  trailerUrl?: string | null;
  quality?: "4K" | "HD" | "SD";
  imdbId?: string;
}

/** A TV series */
export interface Series extends BaseContent {
  type: "series";
  seasons: Season[];
  totalSeasons: number;
  totalEpisodes: number;
  status: "ongoing" | "ended" | "upcoming";
  network?: string;
  streamUrl?: string | null; // first episode
  trailerUrl?: string | null;
}

export interface Season {
  id: string;
  number: number;
  title?: string;
  episodes: Episode[];
  year?: number;
  poster?: string | null;
}

export interface Episode {
  id: string;
  seasonId: string;
  seriesId: string;
  number: number;
  title: string;
  description: string;
  duration: number; // minutes
  thumbnail?: string | null;
  streamUrl?: string | null;
  airDate?: string;
}

/** A live TV channel */
export interface LiveChannel {
  id: string;
  name: string;
  logo: string | null;
  category: LiveCategory;
  streamUrl?: string | null;
  currentProgram?: LiveProgram | null;
  nextProgram?: LiveProgram | null;
  isHD?: boolean;
  isPremium?: boolean;
  sortOrder?: number;
}

export interface LiveProgram {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO
  endTime: string; // ISO
  thumbnail?: string | null;
  genre?: Genre;
}

/** Content + progress for "Continue Watching" rail */
export interface WatchProgress {
  contentId: string;
  type: "movie" | "series";
  title: string;
  poster: string | null;
  backdrop: string | null;
  progressSeconds: number;
  durationSeconds: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  lastWatchedAt: string;
}

/** A content rail shown on the home screen */
export interface ContentRailData {
  id: string;
  title: string;
  items: (Movie | Series)[];
  seeAllRoute?: string;
}

export type StreamContent = Movie | Series;
