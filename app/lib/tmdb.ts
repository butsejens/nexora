/**
 * Nexora — TMDB API Client
 *
 * Fetches real movie and TV series data from The Movie Database (TMDB).
 * Requires: EXPO_PUBLIC_TMDB_API_KEY in .env (get one at https://www.themoviedb.org/settings/api)
 *
 * Image base: https://image.tmdb.org/t/p/<size><path>
 * Sizes: w300 | w500 | w780 | w1280 | original
 */

import type { Genre, Movie, Series } from "@/types/streaming";
import { apiRequestJson } from "@/lib/query-client";

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? "";
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

type ApiEnvelope<T> = {
  ok: boolean;
  data: T | null;
  error?: { code: string; message: string } | null;
};

type MediaListItem = {
  id: number;
  type: "movie" | "series";
  title: string | null;
  overview: string | null;
  poster: string | null;
  backdrop: string | null;
  year: number | string | null;
  rating: number | null;
  voteCount?: number | null;
  genres?: Array<string | number>;
};

const MAX_ALLOWED_RATING = 9.99;
const MIN_VOTES_GENERAL = 80;
const MIN_VOTES_TOP_RATED = 300;

function sanitizeRating(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_ALLOWED_RATING) return 0;
  return parseFloat(num.toFixed(1));
}

function hasValidTitle(title: unknown): boolean {
  const value = String(title ?? "").trim();
  return value.length >= 2;
}

function hasValidYear(value: unknown): boolean {
  const year = normalizeYear(value as any);
  const now = new Date().getFullYear() + 1;
  return year >= 1900 && year <= now;
}

function isReliableItem(input: {
  title: unknown;
  posterPath: unknown;
  rating: unknown;
  voteCount?: unknown;
  year: unknown;
  topRated?: boolean;
}): boolean {
  if (!hasValidTitle(input.title)) return false;
  if (!input.posterPath) return false;
  if (!hasValidYear(input.year)) return false;

  const rating = Number(input.rating ?? 0);
  if (!Number.isFinite(rating) || rating <= 0 || rating > MAX_ALLOWED_RATING) {
    return false;
  }

  const minVotes = input.topRated ? MIN_VOTES_TOP_RATED : MIN_VOTES_GENERAL;
  const votes = Number(input.voteCount ?? 0);
  if (Number.isFinite(votes) && votes > 0 && votes < minVotes) return false;

  return true;
}

function normalizeYear(year: number | string | null | undefined): number {
  if (typeof year === "number") return year;
  if (typeof year === "string") {
    const parsed = parseInt(year.slice(0, 4), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeGenres(genres: Array<string | number> | undefined): Genre[] {
  if (!genres || genres.length === 0) return ["Drama"];
  const names = genres.filter((g): g is string => typeof g === "string");
  if (names.length === 0) return ["Drama"];
  return names
    .map((g) => {
      const normalized = g.trim();
      if (normalized === "Science Fiction") return "Sci-Fi";
      if (normalized === "Action & Adventure") return "Action";
      if (normalized === "Kids") return "Family";
      return normalized;
    })
    .filter(Boolean) as Genre[];
}

function mediaListItemToNexora(item: MediaListItem): Movie | Series {
  const safeRating = sanitizeRating(item.rating);
  const shared = {
    id: `${item.type === "movie" ? "tmdb_m" : "tmdb_s"}_${item.id}`,
    title: item.title ?? "",
    description: item.overview || "No description available.",
    poster: item.poster,
    backdrop: item.backdrop,
    genres: normalizeGenres(item.genres),
    rating: safeRating,
    year: normalizeYear(item.year),
    isNew: false,
    isFeatured: safeRating >= 7.5,
    addedAt: new Date().toISOString(),
  };

  if (item.type === "movie") {
    return {
      ...shared,
      type: "movie",
      duration: 0,
      quality: "HD",
    };
  }

  return {
    ...shared,
    type: "series",
    status: "ongoing",
    totalSeasons: 1,
    totalEpisodes: 0,
    seasons: [],
  };
}

async function fetchMediaEnvelope<T>(route: string): Promise<T | null> {
  try {
    const payload = await apiRequestJson<ApiEnvelope<T>>(route);
    if (!payload?.ok || payload.data == null) return null;
    return payload.data;
  } catch {
    return null;
  }
}

/** Build an absolute TMDB image URL. Returns null for missing paths. */
export function tmdbImg(
  path: string | null | undefined,
  size: "w300" | "w500" | "w780" | "w1280" | "original" = "w500",
): string | null {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

// ── TMDB genre ID → Nexora Genre mapping ──────────────────────────────────────
const GENRE_MAP: Record<number, Genre> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  14: "Fantasy",
  27: "Horror",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  53: "Thriller",
  10751: "Family",
  36: "History",
  10402: "Music",
  10752: "War",
  37: "Western",
  // TV-specific genre IDs
  10759: "Action", // Action & Adventure
  10762: "Family", // Kids
  10763: "Documentary", // News
  10765: "Sci-Fi", // Sci-Fi & Fantasy
  10768: "War", // War & Politics
};

function mapGenres(ids: number[]): Genre[] {
  const mapped = (ids ?? [])
    .map((id) => GENRE_MAP[id])
    .filter(Boolean) as Genre[];
  return mapped.length > 0 ? mapped : ["Drama"];
}

const SIX_MONTHS_AGO = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

function isNewRelease(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) > SIX_MONTHS_AGO;
}

// ── Raw TMDB response shapes (minimal — only fields we actually use) ──────────

interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count?: number;
  release_date: string;
  runtime?: number;
}

interface TmdbTv {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count?: number;
  first_air_date: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  networks?: { name: string }[];
}

interface TmdbListResult<T> {
  results: T[];
  total_pages?: number;
  total_results?: number;
}

interface TmdbMultiResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
}

// ── Base fetch ────────────────────────────────────────────────────────────────

async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  if (!API_KEY) {
    throw new Error(
      "EXPO_PUBLIC_TMDB_API_KEY is not configured. " +
        "Get a free key at https://www.themoviedb.org/settings/api and add it to app/.env",
    );
  }
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB ${endpoint} → HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Data mappers: TMDB → Nexora types ─────────────────────────────────────────

export function tmdbMovieToNexora(movie: TmdbMovie): Movie {
  const safeRating = sanitizeRating(movie.vote_average);
  return {
    id: `tmdb_m_${movie.id}`,
    type: "movie",
    title: movie.title ?? "",
    description: movie.overview || "No description available.",
    poster: tmdbImg(movie.poster_path, "w780"),
    backdrop: tmdbImg(movie.backdrop_path, "original"),
    genres: mapGenres(movie.genre_ids ?? []),
    rating: safeRating,
    year: movie.release_date
      ? parseInt(movie.release_date.substring(0, 4), 10)
      : 0,
    duration: movie.runtime ?? 0,
    quality: "HD",
    isNew: isNewRelease(movie.release_date),
    isFeatured: safeRating >= 7.5,
    addedAt: movie.release_date || new Date().toISOString(),
  };
}

export function tmdbTvToNexora(tv: TmdbTv): Series {
  const safeRating = sanitizeRating(tv.vote_average);
  const status =
    tv.status === "Ended"
      ? "ended"
      : tv.status === "In Production" || tv.status === "Planned"
        ? "upcoming"
        : "ongoing";
  return {
    id: `tmdb_s_${tv.id}`,
    type: "series",
    title: tv.name ?? "",
    description: tv.overview || "No description available.",
    poster: tmdbImg(tv.poster_path, "w780"),
    backdrop: tmdbImg(tv.backdrop_path, "original"),
    genres: mapGenres(tv.genre_ids ?? []),
    rating: safeRating,
    year: tv.first_air_date
      ? parseInt(tv.first_air_date.substring(0, 4), 10)
      : 0,
    status,
    totalSeasons: tv.number_of_seasons ?? 1,
    totalEpisodes: tv.number_of_episodes ?? 0,
    network: tv.networks?.[0]?.name,
    seasons: [],
    isNew: isNewRelease(tv.first_air_date),
    isFeatured: safeRating >= 7.8,
    addedAt: tv.first_air_date || new Date().toISOString(),
  };
}

/** Map a trending multi-search result (either movie or tv) to Nexora type */
function multiResultToNexora(r: TmdbMultiResult): Movie | Series {
  if (r.media_type === "movie") {
    return tmdbMovieToNexora({
      id: r.id,
      title: r.title ?? "",
      overview: r.overview,
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      genre_ids: r.genre_ids ?? [],
      vote_average: r.vote_average,
      release_date: r.release_date ?? "",
    });
  }
  return tmdbTvToNexora({
    id: r.id,
    name: r.name ?? "",
    overview: r.overview,
    poster_path: r.poster_path,
    backdrop_path: r.backdrop_path,
    genre_ids: r.genre_ids ?? [],
    vote_average: r.vote_average,
    first_air_date: r.first_air_date ?? "",
  });
}

// ── Public API functions ───────────────────────────────────────────────────────

/** Weekly trending movies + TV (up to 20). Filters to items with a backdrop. */
export async function getTrendingAll(): Promise<(Movie | Series)[]> {
  try {
    const data =
      await tmdbFetch<TmdbListResult<TmdbMultiResult>>("/trending/all/week");
    return data.results
      .filter(
        (r) =>
          (r.media_type === "movie" || r.media_type === "tv") &&
          isReliableItem({
            title: r.title ?? r.name,
            posterPath: r.poster_path,
            rating: r.vote_average,
            voteCount: r.vote_count,
            year: r.release_date ?? r.first_air_date,
          }),
      )
      .slice(0, 20)
      .map(multiResultToNexora);
  } catch {
    const home = await fetchMediaEnvelope<{
      trending: MediaListItem[];
      movies: MediaListItem[];
      series: MediaListItem[];
    }>("/api/media/home");
    if (!home) return [];
    return [
      ...(home.trending ?? []),
      ...(home.movies ?? []),
      ...(home.series ?? []),
    ]
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
        }),
      )
      .slice(0, 20)
      .map(mediaListItemToNexora);
  }
}

export async function getPopularMovies(): Promise<Movie[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMovie>>("/movie/popular");
    return data.results
      .filter((m) =>
        isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        }),
      )
      .slice(0, 20)
      .map(tmdbMovieToNexora);
  } catch {
    const media = await fetchMediaEnvelope<{ results: MediaListItem[] }>(
      "/api/media/movies?page=1&sort=popularity.desc",
    );
    return (media?.results ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
        }),
      )
      .slice(0, 20)
      .map(
        (item) => mediaListItemToNexora({ ...item, type: "movie" }) as Movie,
      );
  }
}

export async function getPopularTv(): Promise<Series[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbTv>>("/tv/popular");
    return data.results
      .filter((s) =>
        isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
        }),
      )
      .slice(0, 20)
      .map(tmdbTvToNexora);
  } catch {
    const media = await fetchMediaEnvelope<{ results: MediaListItem[] }>(
      "/api/media/series?page=1&sort=popularity.desc",
    );
    return (media?.results ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
        }),
      )
      .slice(0, 20)
      .map(
        (item) => mediaListItemToNexora({ ...item, type: "series" }) as Series,
      );
  }
}

export async function getTopRatedMovies(): Promise<Movie[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMovie>>("/movie/top_rated");
    return data.results
      .filter((m) =>
        isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
          topRated: true,
        }),
      )
      .slice(0, 20)
      .map(tmdbMovieToNexora);
  } catch {
    const media = await fetchMediaEnvelope<{ results: MediaListItem[] }>(
      "/api/media/movies?page=1&sort=vote_average.desc",
    );
    return (media?.results ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
          topRated: true,
        }),
      )
      .slice(0, 20)
      .map(
        (item) => mediaListItemToNexora({ ...item, type: "movie" }) as Movie,
      );
  }
}

export async function getTopRatedTv(): Promise<Series[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbTv>>("/tv/top_rated");
    return data.results
      .filter((s) =>
        isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
          topRated: true,
        }),
      )
      .slice(0, 20)
      .map(tmdbTvToNexora);
  } catch {
    const media = await fetchMediaEnvelope<{ results: MediaListItem[] }>(
      "/api/media/series?page=1&sort=vote_average.desc",
    );
    return (media?.results ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
          topRated: true,
        }),
      )
      .slice(0, 20)
      .map(
        (item) => mediaListItemToNexora({ ...item, type: "series" }) as Series,
      );
  }
}

/** Movies currently in theatres — used for "Recently Added" rail */
export async function getNowPlayingMovies(): Promise<Movie[]> {
  try {
    const data =
      await tmdbFetch<TmdbListResult<TmdbMovie>>("/movie/now_playing");
    return data.results
      .filter((m) =>
        isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        }),
      )
      .slice(0, 20)
      .map(tmdbMovieToNexora);
  } catch {
    const home = await fetchMediaEnvelope<{ movies: MediaListItem[] }>(
      "/api/media/home",
    );
    return (home?.movies ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
        }),
      )
      .slice(0, 20)
      .map(
        (item) => mediaListItemToNexora({ ...item, type: "movie" }) as Movie,
      );
  }
}

/** TV shows currently airing — used for "On Air" rail */
export async function getOnAirTv(): Promise<Series[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbTv>>("/tv/on_the_air");
    return data.results
      .filter((s) =>
        isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
        }),
      )
      .slice(0, 20)
      .map(tmdbTvToNexora);
  } catch {
    const home = await fetchMediaEnvelope<{ series: MediaListItem[] }>(
      "/api/media/home",
    );
    return (home?.series ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
        }),
      )
      .slice(0, 20)
      .map(
        (item) => mediaListItemToNexora({ ...item, type: "series" }) as Series,
      );
  }
}

/** Fetch a single movie by TMDB id, including credits & runtime */
export async function getMovieById(tmdbId: number): Promise<Movie> {
  try {
    const data = await tmdbFetch<
      TmdbMovie & {
        runtime: number;
        credits?: {
          cast: { name: string }[];
          crew: { name: string; job: string }[];
        };
      }
    >(`/movie/${tmdbId}`, { append_to_response: "credits" });
    const movie = tmdbMovieToNexora({
      ...data,
      genre_ids: (data as any).genres?.map((g: any) => g.id) ?? [],
    });
    if (data.runtime) (movie as any).duration = data.runtime;
    const director = data.credits?.crew.find((c) => c.job === "Director")?.name;
    if (director) (movie as any).director = director;
    const cast = data.credits?.cast.slice(0, 12).map((c) => c.name) ?? [];
    if (cast.length) (movie as any).cast = cast;
    return movie;
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/movie/${tmdbId}`);
    if (!media) throw new Error(`TMDB /movie/${tmdbId} unavailable`);
    return {
      id: `tmdb_m_${tmdbId}`,
      type: "movie",
      title: media.title ?? "",
      description: media.overview || "No description available.",
      poster: media.poster ?? null,
      backdrop: media.backdrop ?? null,
      genres: normalizeGenres(media.genres),
      rating: Number(media.rating ?? 0),
      year: normalizeYear(media.year),
      duration: Number(media.runtime ?? 0),
      quality: "HD",
      isNew: false,
      isFeatured: Number(media.rating ?? 0) >= 7.5,
      addedAt: media.releaseDate || new Date().toISOString(),
    };
  }
}

/** Fetch a single TV show by TMDB id */
export async function getTvById(tmdbId: number): Promise<Series> {
  try {
    const data = await tmdbFetch<
      TmdbTv & {
        number_of_seasons: number;
        number_of_episodes: number;
        status: string;
        networks: { name: string }[];
      }
    >(`/tv/${tmdbId}`);
    return tmdbTvToNexora({
      ...data,
      genre_ids: (data as any).genres?.map((g: any) => g.id) ?? [],
    });
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/series/${tmdbId}`);
    if (!media) throw new Error(`TMDB /tv/${tmdbId} unavailable`);
    return {
      id: `tmdb_s_${tmdbId}`,
      type: "series",
      title: media.title ?? "",
      description: media.overview || "No description available.",
      poster: media.poster ?? null,
      backdrop: media.backdrop ?? null,
      genres: normalizeGenres(media.genres),
      rating: Number(media.rating ?? 0),
      year: normalizeYear(media.year),
      status: media.status === "Ended" ? "ended" : "ongoing",
      totalSeasons: Number(media.seasonCount ?? 1),
      totalEpisodes: Number(media.episodeCount ?? 0),
      network: Array.isArray(media.networks) ? media.networks[0] : undefined,
      seasons: [],
      isNew: false,
      isFeatured: Number(media.rating ?? 0) >= 7.8,
      addedAt: media.firstAirDate || new Date().toISOString(),
    };
  }
}

/** Full-text search across movies and TV series */
export async function searchTmdb(query: string): Promise<(Movie | Series)[]> {
  if (!query.trim()) return [];
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMultiResult>>(
      "/search/multi",
      {
        query: query.trim(),
      },
    );
    return data.results
      .filter(
        (r) =>
          (r.media_type === "movie" || r.media_type === "tv") &&
          isReliableItem({
            title: r.title ?? r.name,
            posterPath: r.poster_path,
            rating: r.vote_average,
            voteCount: r.vote_count,
            year: r.release_date ?? r.first_air_date,
          }),
      )
      .slice(0, 20)
      .map(multiResultToNexora);
  } catch {
    const media = await fetchMediaEnvelope<{ results: MediaListItem[] }>(
      `/api/media/search?q=${encodeURIComponent(query.trim())}&type=all&page=1`,
    );
    return (media?.results ?? [])
      .filter((item) =>
        isReliableItem({
          title: item.title,
          posterPath: item.poster,
          rating: item.rating,
          voteCount: item.voteCount,
          year: item.year,
        }),
      )
      .slice(0, 20)
      .map(mediaListItemToNexora);
  }
}

// ── Genre / Discover ──────────────────────────────────────────────────────────

/**
 * Discover movies filtered by one or more TMDB genre IDs.
 * Uses /discover/movie?with_genres=<ids>&sort_by=popularity.desc
 */
export async function getMoviesByGenre(genreIds: number[]): Promise<Movie[]> {
  if (!genreIds.length) return [];
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMovie>>("/discover/movie", {
      with_genres: genreIds.join(","),
      sort_by: "popularity.desc",
    });
    return data.results
      .filter((m) =>
        isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        }),
      )
      .slice(0, 30)
      .map(tmdbMovieToNexora);
  } catch {
    return [];
  }
}

/**
 * Fetch ALL available movies for a genre across multiple TMDB pages.
 * Used for the genre browse page where we want every result, not just 20.
 */
export async function getMoviesByGenreAll(
  genreIds: number[],
  maxPages = 8,
): Promise<Movie[]> {
  if (!genreIds.length) return [];
  try {
    const first = await tmdbFetch<TmdbListResult<TmdbMovie>>(
      "/discover/movie",
      {
        with_genres: genreIds.join(","),
        sort_by: "popularity.desc",
        page: "1",
      },
    );
    const totalPages = Math.min(first.total_pages ?? 1, maxPages);
    const extraPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              tmdbFetch<TmdbListResult<TmdbMovie>>("/discover/movie", {
                with_genres: genreIds.join(","),
                sort_by: "popularity.desc",
                page: String(i + 2),
              }).catch(() => ({ results: [] as TmdbMovie[], total_pages: 0 })),
            ),
          )
        : [];
    const all = [first, ...extraPages].flatMap((d) => d.results ?? []);
    const seen = new Set<number>();
    return all
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        });
      })
      .map(tmdbMovieToNexora);
  } catch {
    return [];
  }
}

/**
 * Discover TV series filtered by one or more TMDB genre IDs.
 * Uses /discover/tv?with_genres=<ids>&sort_by=popularity.desc
 */
export async function getTvByGenre(genreIds: number[]): Promise<Series[]> {
  if (!genreIds.length) return [];
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
      with_genres: genreIds.join(","),
      sort_by: "popularity.desc",
    });
    return data.results
      .filter((s) =>
        isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
        }),
      )
      .slice(0, 30)
      .map(tmdbTvToNexora);
  } catch {
    return [];
  }
}

/**
 * Fetch ALL available TV series for a genre across multiple TMDB pages.
 * Used for the genre browse page where we want every result, not just 20.
 */
export async function getTvByGenreAll(
  genreIds: number[],
  maxPages = 8,
): Promise<Series[]> {
  if (!genreIds.length) return [];
  try {
    const first = await tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
      with_genres: genreIds.join(","),
      sort_by: "popularity.desc",
      page: "1",
    });
    const totalPages = Math.min(first.total_pages ?? 1, maxPages);
    const extraPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
                with_genres: genreIds.join(","),
                sort_by: "popularity.desc",
                page: String(i + 2),
              }).catch(() => ({ results: [] as TmdbTv[], total_pages: 0 })),
            ),
          )
        : [];
    const all = [first, ...extraPages].flatMap((d) => d.results ?? []);
    const seen = new Set<number>();
    return all
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
        });
      })
      .map(tmdbTvToNexora);
  } catch {
    return [];
  }
}

// ── Cast ──────────────────────────────────────────────────────────────────────

export interface TmdbCastMember {
  name: string;
  character: string;
  photo: string | null;
}

export async function getMovieCast(tmdbId: number): Promise<TmdbCastMember[]> {
  try {
    const data = await tmdbFetch<{
      cast: { name: string; character: string; profile_path: string | null }[];
    }>(`/movie/${tmdbId}/credits`);
    return data.cast.slice(0, 15).map((c) => ({
      name: c.name,
      character: c.character,
      photo: tmdbImg(c.profile_path, "w300"),
    }));
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/movie/${tmdbId}`);
    return (media?.cast ?? []).slice(0, 15).map((c: any) => ({
      name: c.name,
      character: c.character || "",
      photo: c.photo ?? null,
    }));
  }
}

export async function getTvCast(tmdbId: number): Promise<TmdbCastMember[]> {
  try {
    const data = await tmdbFetch<{
      cast: { name: string; character: string; profile_path: string | null }[];
    }>(`/tv/${tmdbId}/credits`);
    return data.cast.slice(0, 15).map((c) => ({
      name: c.name,
      character: c.character,
      photo: tmdbImg(c.profile_path, "w300"),
    }));
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/series/${tmdbId}`);
    return (media?.cast ?? []).slice(0, 15).map((c: any) => ({
      name: c.name,
      character: c.character || "",
      photo: c.photo ?? null,
    }));
  }
}

// ── Episodes ──────────────────────────────────────────────────────────────────

export interface TmdbSeasonInfo {
  season_number: number;
  episode_count: number;
  name: string;
  air_date?: string;
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  runtime?: number;
  still_path: string | null;
  air_date?: string;
}

/** Fetch all episodes for a single season. */
export async function getTvSeasonDetail(
  tvId: number,
  seasonNumber: number,
): Promise<TmdbEpisode[]> {
  const data = await tmdbFetch<{ episodes: TmdbEpisode[] }>(
    `/tv/${tvId}/season/${seasonNumber}`,
  );
  return data.episodes ?? [];
}

/** Fetch season list + first season episodes for a TV show. */
export async function getTvSeasons(tvId: number): Promise<{
  seasons: TmdbSeasonInfo[];
  firstSeasonEpisodes: TmdbEpisode[];
}> {
  try {
    const details = await tmdbFetch<{
      seasons: TmdbSeasonInfo[];
      number_of_seasons: number;
    }>(`/tv/${tvId}`);

    const realSeasons = (details.seasons ?? []).filter(
      (s) => s.season_number > 0,
    );
    const firstSeason = realSeasons[0];

    let firstSeasonEpisodes: TmdbEpisode[] = [];
    if (firstSeason) {
      try {
        firstSeasonEpisodes = await getTvSeasonDetail(
          tvId,
          firstSeason.season_number,
        );
      } catch {
        // silently ignore
      }
    }

    return { seasons: realSeasons, firstSeasonEpisodes };
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/series/${tvId}`);
    const seasons = (media?.seasons ?? [])
      .map((s: any) => ({
        season_number: Number(s.seasonNumber ?? 0),
        episode_count: Number(s.episodeCount ?? 0),
        name: s.name ?? `Season ${s.seasonNumber ?? ""}`,
        air_date: s.airDate ?? undefined,
      }))
      .filter((s: TmdbSeasonInfo) => s.season_number > 0);
    return { seasons, firstSeasonEpisodes: [] };
  }
}

// ── Recommendations ───────────────────────────────────────────────────────────

export async function getMovieRecommendations(
  tmdbId: number,
): Promise<(Movie | Series)[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMultiResult>>(
      `/movie/${tmdbId}/recommendations`,
    );
    return data.results
      .filter((r) => r.poster_path)
      .slice(0, 12)
      .map((r) =>
        tmdbMovieToNexora({
          ...r,
          title: r.title ?? r.name ?? "",
          release_date: r.release_date ?? "",
        } as TmdbMovie),
      );
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/movie/${tmdbId}`);
    return (media?.recommendations ?? [])
      .slice(0, 12)
      .map(mediaListItemToNexora);
  }
}

export async function getTvRecommendations(
  tmdbId: number,
): Promise<(Movie | Series)[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMultiResult>>(
      `/tv/${tmdbId}/recommendations`,
    );
    return data.results
      .filter((r) => r.poster_path)
      .slice(0, 12)
      .map((r) =>
        tmdbTvToNexora({
          ...r,
          name: r.name ?? r.title ?? "",
          first_air_date: r.first_air_date ?? "",
        } as TmdbTv),
      );
  } catch {
    const media = await fetchMediaEnvelope<any>(`/api/media/series/${tmdbId}`);
    return (media?.recommendations ?? [])
      .slice(0, 12)
      .map(mediaListItemToNexora);
  }
}

// ── Videos / Trailers ─────────────────────────────────────────────────────────

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
}

export async function getMovieVideos(tmdbId: number): Promise<TmdbVideo[]> {
  try {
    const data = await tmdbFetch<{ results: TmdbVideo[] }>(
      `/movie/${tmdbId}/videos`,
    );
    return data.results.filter((v) => v.site === "YouTube");
  } catch {
    return [];
  }
}

export async function getTvVideos(tmdbId: number): Promise<TmdbVideo[]> {
  try {
    const data = await tmdbFetch<{ results: TmdbVideo[] }>(
      `/tv/${tmdbId}/videos`,
    );
    return data.results.filter((v) => v.site === "YouTube");
  } catch {
    return [];
  }
}

// ── Movie franchise collections ───────────────────────────────────────────────

/** Fetch all films in a TMDB franchise collection (e.g. Hunger Games = 131296). */
export async function getMovieCollection(
  collectionId: number,
): Promise<{ name: string; movies: Movie[] } | null> {
  try {
    const data = await tmdbFetch<{
      id: number;
      name: string;
      parts: Array<{
        id: number;
        title: string;
        overview: string;
        poster_path: string | null;
        backdrop_path: string | null;
        release_date: string;
        vote_average: number;
        vote_count?: number;
      }>;
    }>(`/collection/${collectionId}`);
    const movies = (data.parts ?? [])
      .filter((p) => p.poster_path && p.release_date)
      .sort(
        (a, b) =>
          new Date(a.release_date).getTime() -
          new Date(b.release_date).getTime(),
      )
      .map((p) =>
        tmdbMovieToNexora({
          id: p.id,
          title: p.title,
          overview: p.overview,
          poster_path: p.poster_path,
          backdrop_path: p.backdrop_path,
          genre_ids: [],
          vote_average: p.vote_average,
          vote_count: p.vote_count,
          release_date: p.release_date,
        }),
      );
    return { name: data.name, movies };
  } catch {
    return null;
  }
}

/** Fetch multiple TV shows by their TMDB IDs (for franchise / universe rails). */
export async function getTvUniverse(showIds: number[]): Promise<Series[]> {
  const results = await Promise.allSettled(showIds.map((id) => getTvById(id)));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Series> => r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((s) => Boolean(s.poster));
}

// ── Streaming / Watch providers ───────────────────────────────────────────────

export interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority?: number;
}

/**
 * Fetch the list of available streaming providers for a region.
 * Used to display service logos (Netflix, Disney+, Prime, …) on the home screen.
 */
export async function getWatchProviders(
  region = "NL",
): Promise<StreamingProvider[]> {
  try {
    const data = await tmdbFetch<{ results: StreamingProvider[] }>(
      "/watch/providers/movie",
      { watch_region: region },
    );
    return (data.results ?? []).sort(
      (a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99),
    );
  } catch {
    return [];
  }
}

/**
 * Discover movies available on a specific streaming provider in a region.
 * Uses TMDB /discover/movie?with_watch_providers=<id>&watch_region=<region>
 */
export async function getMoviesByProvider(
  providerId: number,
  region = "NL",
): Promise<Movie[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbMovie>>("/discover/movie", {
      with_watch_providers: String(providerId),
      watch_region: region,
      sort_by: "popularity.desc",
    });
    return (data.results ?? [])
      .filter((m) =>
        isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        }),
      )
      .slice(0, 40)
      .map(tmdbMovieToNexora);
  } catch {
    return [];
  }
}

/**
 * Discover TV series available on a specific streaming provider in a region.
 * Uses TMDB /discover/tv?with_watch_providers=<id>&watch_region=<region>
 */
export async function getTvByProvider(
  providerId: number,
  region = "NL",
): Promise<Series[]> {
  try {
    const data = await tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
      with_watch_providers: String(providerId),
      watch_region: region,
      sort_by: "popularity.desc",
    });
    return (data.results ?? [])
      .filter((s) =>
        isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
        }),
      )
      .slice(0, 40)
      .map(tmdbTvToNexora);
  } catch {
    return [];
  }
}

// ── Network / Studio Discovery (AI categorization support) ────────────────────

/**
 * Discover TV series by TMDB network ID across multiple pages.
 * Network IDs: Nickelodeon=13, Disney Channel=54, Cartoon Network=56,
 *              Nick Jr.=6455, Disney Junior=6126, Boomerang=6695
 */
export async function getTvByNetwork(
  networkId: number,
  maxPages = 5,
): Promise<Series[]> {
  if (!networkId) return [];
  try {
    const first = await tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
      with_networks: String(networkId),
      sort_by: "popularity.desc",
      page: "1",
    });
    const totalPages = Math.min(first.total_pages ?? 1, maxPages);
    const extraPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
                with_networks: String(networkId),
                sort_by: "popularity.desc",
                page: String(i + 2),
              }).catch(() => ({ results: [] as TmdbTv[], total_pages: 0 })),
            ),
          )
        : [];
    const all = [first, ...extraPages].flatMap((d) => d.results ?? []);
    const seen = new Set<number>();
    return all
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return isReliableItem({
          title: s.name,
          posterPath: s.poster_path,
          rating: s.vote_average,
          voteCount: s.vote_count,
          year: s.first_air_date,
        });
      })
      .map(tmdbTvToNexora);
  } catch {
    return [];
  }
}

/**
 * Same as getTvByNetwork but with a lower vote-count floor — used for kids
 * networks (Disney Junior, Boomerang) where popular shows have fewer reviews.
 */
export async function getTvByNetworkKids(
  networkId: number,
  maxPages = 5,
): Promise<Series[]> {
  if (!networkId) return [];
  try {
    const first = await tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
      with_networks: String(networkId),
      sort_by: "popularity.desc",
      "vote_count.gte": "10",
      page: "1",
    });
    const totalPages = Math.min(first.total_pages ?? 1, maxPages);
    const extraPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              tmdbFetch<TmdbListResult<TmdbTv>>("/discover/tv", {
                with_networks: String(networkId),
                sort_by: "popularity.desc",
                "vote_count.gte": "10",
                page: String(i + 2),
              }).catch(() => ({ results: [] as TmdbTv[], total_pages: 0 })),
            ),
          )
        : [];
    const all = [first, ...extraPages].flatMap((d) => d.results ?? []);
    const seen = new Set<number>();
    return all
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        // Only require a poster + title; skip vote-count floor for kids content
        return (
          !!s.poster_path &&
          String(s.name ?? "").trim().length >= 2 &&
          Number(s.vote_average ?? 0) > 0
        );
      })
      .map(tmdbTvToNexora);
  } catch {
    return [];
  }
}

/**
 * Discover movies by TMDB production company ID across multiple pages.
 * Company IDs: Walt Disney Pictures=2, Pixar=3, DreamWorks Animation=521,
 *              Illumination=6704, Studio Ghibli=10342
 */
export async function getMoviesByCompany(
  companyIds: number[],
  maxPages = 5,
): Promise<Movie[]> {
  if (!companyIds.length) return [];
  try {
    const first = await tmdbFetch<TmdbListResult<TmdbMovie>>(
      "/discover/movie",
      {
        with_companies: companyIds.join("|"),
        sort_by: "popularity.desc",
        page: "1",
      },
    );
    const totalPages = Math.min(first.total_pages ?? 1, maxPages);
    const extraPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              tmdbFetch<TmdbListResult<TmdbMovie>>("/discover/movie", {
                with_companies: companyIds.join("|"),
                sort_by: "popularity.desc",
                page: String(i + 2),
              }).catch(() => ({ results: [] as TmdbMovie[], total_pages: 0 })),
            ),
          )
        : [];
    const all = [first, ...extraPages].flatMap((d) => d.results ?? []);
    const seen = new Set<number>();
    return all
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        });
      })
      .map(tmdbMovieToNexora);
  } catch {
    return [];
  }
}

/**
 * Discover movies within a year range.
 * Used to show films from 1950 to the present (and upcoming releases).
 */
export async function getMoviesFromYearRange(
  fromYear: number,
  toYear: number,
  maxPages = 4,
): Promise<Movie[]> {
  try {
    const params = {
      sort_by: "popularity.desc",
      "primary_release_date.gte": `${fromYear}-01-01`,
      "primary_release_date.lte": `${toYear}-12-31`,
      page: "1",
    };
    const first = await tmdbFetch<TmdbListResult<TmdbMovie>>(
      "/discover/movie",
      params,
    );
    const totalPages = Math.min(first.total_pages ?? 1, maxPages);
    const extraPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              tmdbFetch<TmdbListResult<TmdbMovie>>("/discover/movie", {
                ...params,
                page: String(i + 2),
              }).catch(() => ({ results: [] as TmdbMovie[], total_pages: 0 })),
            ),
          )
        : [];
    const all = [first, ...extraPages].flatMap((d) => d.results ?? []);
    const seen = new Set<number>();
    return all
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return isReliableItem({
          title: m.title,
          posterPath: m.poster_path,
          rating: m.vote_average,
          voteCount: m.vote_count,
          year: m.release_date,
        });
      })
      .map(tmdbMovieToNexora);
  } catch {
    return [];
  }
}

/**
 * Fetch upcoming movies (release date in the future).
 */
export async function getUpcomingMovies(maxPages = 3): Promise<Movie[]> {
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return getMoviesFromYearRange(
    new Date().getFullYear(),
    new Date().getFullYear() + 2,
    maxPages,
  );
}
