/**
 * Nexora – Media Domain Service
 *
 * Central access point for all movies/series data.
 *
 * Key rules enforced here:
 *   - TMDB is metadata only; isPlayable/isDownloadable remain false unless
 *     the item is enriched by an IPTV source.
 *   - Trailer sources are kept separate from stream/playback sources.
 *   - Media identity (TMDB ID) is always the canonical key for deduplication.
 */

import { apiRequest } from "@/lib/query-client";
import {
  normalizeMovieFromTmdb,
  normalizeSeriesFromTmdb,
  normalizeEpisodeFromTmdb,
  normalizeTrailerFromServer,
  normalizeWatchHistoryItem,
  normalizeWatchProgress,
} from "@/lib/domain/normalizers";
import type {
  Movie,
  Series,
  Season,
  Episode,
  Trailer,
  RecommendationItem,
  WatchProgress,
  WatchHistoryItem,
  MediaId,
  StreamSource,
  Title,
} from "@/lib/domain/models";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch<T>(route: string, fallback: T): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// TMDB is metadata only — this is the single place we enforce that contract.
function enforceMetadataOnly<T extends { isPlayable: boolean; isDownloadable: boolean }>(item: T): T {
  return { ...item, isPlayable: false, isDownloadable: false };
}

/**
 * Enrich a normalized title with IPTV stream sources.
 * Only call when the item is known to have a real IPTV backing source.
 */
export function enrichTitleWithIptvSource(
  title: Movie | Series,
  sources: StreamSource[],
): Movie | Series {
  if (sources.length === 0) return title;
  return {
    ...title,
    streamSources: sources,
    isPlayable: true,
    // Downloadable only if the source supports it (HLS/MP4, not embed)
    isDownloadable: sources.some(s => s.type === "hls" || s.type === "mp4"),
  };
}

// ─── Movies ───────────────────────────────────────────────────────────────────

export interface MediaHomeRail {
  id: string;
  label: string;
  items: (Movie | Series)[];
}

export async function getMediaHome(): Promise<MediaHomeRail[]> {
  const raw = await safeFetch<any>("/api/homepage", {});
  if (!raw?.rails) return [];
  return (raw.rails as any[]).map(rail => ({
    id: String(rail.id ?? rail.label ?? ""),
    label: String(rail.label ?? ""),
    items: (Array.isArray(rail.items) ? rail.items : []).map((item: any) => {
      const normalized = item.type === "series" || item.mediaType === "series"
        ? normalizeSeriesFromTmdb(item)
        : normalizeMovieFromTmdb(item);
      return enforceMetadataOnly(normalized);
    }),
  }));
}

export async function getTrendingMovies(page = 1): Promise<Movie[]> {
  const raw = await safeFetch<any>(`/api/movies/trending?page=${page}`, {});
  return (Array.isArray(raw?.results) ? raw.results : []).map(
    (r: any) => enforceMetadataOnly(normalizeMovieFromTmdb(r)),
  );
}

export async function getTrendingSeries(page = 1): Promise<Series[]> {
  const raw = await safeFetch<any>(`/api/series/trending?page=${page}`, {});
  return (Array.isArray(raw?.results) ? raw.results : []).map(
    (r: any) => enforceMetadataOnly(normalizeSeriesFromTmdb(r)),
  );
}

export async function getMovieFull(tmdbId: number): Promise<Movie | null> {
  const raw = await safeFetch<any>(`/api/movies/${tmdbId}/full`, null);
  if (!raw) return null;
  return enforceMetadataOnly(normalizeMovieFromTmdb(raw));
}

export async function getSeriesFull(tmdbId: number): Promise<Series | null> {
  const raw = await safeFetch<any>(`/api/series/${tmdbId}/full`, null);
  if (!raw) return null;
  return enforceMetadataOnly(normalizeSeriesFromTmdb(raw));
}

export async function discoverMoviesByGenre(genreId: number, page = 1): Promise<Movie[]> {
  const raw = await safeFetch<any>(`/api/movies/discover-by-genre?genre_id=${genreId}&page=${page}`, {});
  return (Array.isArray(raw?.results) ? raw.results : []).map(
    (r: any) => enforceMetadataOnly(normalizeMovieFromTmdb(r)),
  );
}

export async function discoverSeriesByGenre(genreId: number, page = 1): Promise<Series[]> {
  const raw = await safeFetch<any>(`/api/series/discover-by-genre?genre_id=${genreId}&page=${page}`, {});
  return (Array.isArray(raw?.results) ? raw.results : []).map(
    (r: any) => enforceMetadataOnly(normalizeSeriesFromTmdb(r)),
  );
}

export async function getMovieGenres(): Promise<{ id: number; name: string }[]> {
  const raw = await safeFetch<any>("/api/movies/genres-catalog", {});
  return Array.isArray(raw?.genres) ? raw.genres : [];
}

export async function getSeriesGenres(): Promise<{ id: number; name: string }[]> {
  const raw = await safeFetch<any>("/api/series/genres-catalog", {});
  return Array.isArray(raw?.genres) ? raw.genres : [];
}

// ─── Trailers ─────────────────────────────────────────────────────────────────

/**
 * Fetch trailer for a TMDB title.
 * Keeps trailer source (YouTube/provider) clearly separated from stream source.
 */
export async function getTrailer(tmdbId: number): Promise<Trailer | null> {
  const raw = await safeFetch<any>(`/api/trailer/${tmdbId}`, null);
  if (!raw?.key && !raw?.embedUrl && !raw?.youtubeKey) return null;
  return normalizeTrailerFromServer(raw, { tmdbId });
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface RecommendationInput {
  moods?: string[];
  genres?: number[];
  recentTmdbIds?: number[];
  language?: string;
}

export async function getRecommendationsForYou(
  input: RecommendationInput = {}
): Promise<(Movie | Series)[]> {
  const params = new URLSearchParams();
  if (input.moods?.length) params.set("moods", input.moods.join(","));
  if (input.genres?.length) params.set("genres", input.genres.join(","));
  if (input.language) params.set("language", input.language);

  const raw = await safeFetch<any>(`/api/recommendations/for-you?${params}`, {});
  const items: (Movie | Series)[] = [];
  for (const item of Array.isArray(raw?.results) ? raw.results : []) {
    const normalized = item.type === "series" || item.mediaType === "series"
      ? normalizeSeriesFromTmdb(item)
      : normalizeMovieFromTmdb(item);
    items.push(enforceMetadataOnly(normalized));
  }
  return items;
}

export async function getSimilarTitles(tmdbId: number, type: "movie" | "series"): Promise<(Movie | Series)[]> {
  const raw = await safeFetch<any>(`/api/recommendations/similar/${tmdbId}?type=${type}`, {});
  const items: (Movie | Series)[] = [];
  for (const item of Array.isArray(raw?.results) ? raw.results : []) {
    const normalized = type === "series"
      ? normalizeSeriesFromTmdb(item)
      : normalizeMovieFromTmdb(item);
    items.push(enforceMetadataOnly(normalized));
  }
  return items;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  movies: Movie[];
  series: Series[];
}

export async function searchMedia(query: string): Promise<SearchResult> {
  if (!query.trim()) return { movies: [], series: [] };
  const raw = await safeFetch<any>(`/api/tmdb/search?query=${encodeURIComponent(query)}`, {});
  const movies: Movie[] = [];
  const series: Series[] = [];
  for (const item of Array.isArray(raw?.results) ? raw.results : []) {
    if (item.media_type === "movie" || item.type === "movie") {
      movies.push(enforceMetadataOnly(normalizeMovieFromTmdb(item)));
    } else if (item.media_type === "tv" || item.type === "series") {
      series.push(enforceMetadataOnly(normalizeSeriesFromTmdb(item)));
    }
  }
  return { movies, series };
}

// ─── React Query key factories ────────────────────────────────────────────────

export const mediaKeys = {
  home: () => ["media", "home"] as const,
  trendingMovies: (page: number) => ["media", "movies", "trending", page] as const,
  trendingSeries: (page: number) => ["media", "series", "trending", page] as const,
  movieFull: (tmdbId: number) => ["media", "movie", tmdbId] as const,
  seriesFull: (tmdbId: number) => ["media", "series", tmdbId] as const,
  moviesByGenre: (genreId: number, page: number) => ["media", "movies", "genre", genreId, page] as const,
  seriesByGenre: (genreId: number, page: number) => ["media", "series", "genre", genreId, page] as const,
  movieGenres: () => ["media", "movies", "genres"] as const,
  seriesGenres: () => ["media", "series", "genres"] as const,
  trailer: (tmdbId: number) => ["media", "trailer", tmdbId] as const,
  recommendations: (input: RecommendationInput) => ["media", "recommendations", input] as const,
  similar: (tmdbId: number, type: string) => ["media", "similar", tmdbId, type] as const,
  search: (query: string) => ["media", "search", query] as const,
} as const;
