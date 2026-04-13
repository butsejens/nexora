/**
 * Nexora – Media Hooks
 *
 * Semantic React Query hooks for all movie/series data.
 * All hooks delegate to media-service, which normalizes TMDB domain models.
 *
 * Cast note: normalizeMovieFromTmdb/normalizeSeriesFromTmdb omit cast by design.
 * Use useCast() to get the cast array directly from the full-detail endpoint.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import type { Movie, Series } from "@/lib/domain/models";
import {
  getTrendingMovies,
  getTrendingSeries,
  getMovieFull,
  getSeriesFull,
  getTrailer,
  searchMedia,
  getSimilarTitles,
  getVodHomePayload,
  getVodCatalogChunk,
  getVodCollections,
  getVodStudios,
  getRecommendationsForYou,
  mediaKeys,
  type RecommendationInput,
} from "@/lib/services/media-service";

// ─── Movies & Series ──────────────────────────────────────────────────────────

/** Trending + popular movies. page=1 returns a merged list; page>1 returns popular only. */
export function useMovies(page = 1, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.trendingMovies(page),
    queryFn: () => getTrendingMovies(page),
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** Trending + popular series. page=1 returns a merged list; page>1 returns popular only. */
export function useSeries(page = 1, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.trendingSeries(page),
    queryFn: () => getTrendingSeries(page),
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

/**
 * Full normalized movie or series detail.
 * Note: cast is NOT included here (the normalizer omits it).
 * Use useCast() if you need the cast array.
 */
export function useMediaDetails(
  tmdbId: number | null,
  type: "movie" | "series",
  enabled = true,
) {
  return useQuery<Movie | Series | null>({
    queryKey: type === "movie" ? mediaKeys.movieFull(tmdbId!) : mediaKeys.seriesFull(tmdbId!),
    queryFn: (): Promise<Movie | Series | null> =>
      type === "movie" ? getMovieFull(tmdbId!) : getSeriesFull(tmdbId!),
    enabled: enabled && Boolean(tmdbId),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

// ─── Cast ─────────────────────────────────────────────────────────────────────

export interface CastMember {
  id: number;
  name: string;
  character: string;
  photo: string | null;
}

/**
 * Cast for a movie or series.
 *
 * Fetches the full-detail endpoint directly and extracts the cast array
 * returned by the server's mapFullDetail(). Requires TMDB_API_KEY on the server.
 *
 * The query key intentionally differs from useMediaDetails so each can be
 * cached independently (detail fetches often happen without needing full cast).
 */
export function useCast(
  tmdbId: number | null,
  type: "movie" | "series",
  enabled = true,
) {
  const route = type === "movie"
    ? `/api/movies/${tmdbId}/full`
    : `/api/series/${tmdbId}/full`;

  return useQuery({
    // Append "cast" to the full-detail key to namespace this separately.
    queryKey: [
      ...(type === "movie" ? mediaKeys.movieFull(tmdbId!) : mediaKeys.seriesFull(tmdbId!)),
      "cast",
    ],
    queryFn: async (): Promise<CastMember[]> => {
      const res = await apiRequest("GET", route);
      if (!res.ok) return [];
      const json = await res.json();
      return (json?.cast ?? []) as CastMember[];
    },
    enabled: enabled && Boolean(tmdbId),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

// ─── Trailers ─────────────────────────────────────────────────────────────────

/** Trailer (YouTube / provider source) for a TMDB title. */
export function useTrailer(tmdbId: number | null, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.trailer(tmdbId!),
    queryFn: () => getTrailer(tmdbId!),
    enabled: enabled && Boolean(tmdbId),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
}

// ─── VOD Home & Catalog ───────────────────────────────────────────────────────

/** Full VOD home payload: featured, trending rails, recent, top-rated. */
export function useVodHome(enabled = true) {
  return useQuery({
    queryKey: mediaKeys.vodHome(),
    queryFn: getVodHomePayload,
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** Paginated VOD catalog chunk (6-year windows). Pass cursorYear for next page. */
export function useVodCatalog(cursorYear: number | null = null, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.vodCatalog(cursorYear),
    queryFn: () => getVodCatalogChunk(cursorYear),
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** All VOD collections (Star Wars, Marvel, etc.). */
export function useVodCollections(enabled = true) {
  return useQuery({
    queryKey: mediaKeys.vodCollections(),
    queryFn: getVodCollections,
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

/** All VOD studios. */
export function useVodStudios(enabled = true) {
  return useQuery({
    queryKey: mediaKeys.vodStudios(),
    queryFn: getVodStudios,
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

// ─── Search & Discovery ───────────────────────────────────────────────────────

/** Full-text search across movies and series. Only fires when query is non-empty. */
export function useSearchMedia(query: string, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.search(query),
    queryFn: () => searchMedia(query),
    enabled: enabled && query.trim().length > 0,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}

/** Similar titles for a given TMDB item. */
export function useSimilarTitles(
  tmdbId: number | null,
  type: "movie" | "series",
  enabled = true,
) {
  return useQuery({
    queryKey: mediaKeys.similar(tmdbId!, type),
    queryFn: () => getSimilarTitles(tmdbId!, type),
    enabled: enabled && Boolean(tmdbId),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

/** Personalized recommendations based on moods, genres, and recent watches. */
export function useRecommendations(input: RecommendationInput = {}, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.recommendations(input),
    queryFn: () => getRecommendationsForYou(input),
    enabled,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
