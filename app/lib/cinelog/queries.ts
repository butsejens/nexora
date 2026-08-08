/**
 * CineLog — React Query hooks over the media data layer.
 *
 * Every screen reads data through these hooks so caching, stale windows and
 * pagination behave consistently across the app.
 */

import {
  useInfiniteQuery,
  useQueries,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { STALE } from "@/lib/query-client";
import {
  fetchMovieDetail,
  fetchMovieList,
  fetchMoviesByGenre,
  fetchPerson,
  fetchPrimaryTrailer,
  fetchSeason,
  fetchSeriesDetail,
  fetchSeriesList,
  fetchSeriesByGenre,
  fetchTrending,
  searchMedia,
} from "@/lib/cinelog/api";
import type {
  MediaSummary,
  MediaType,
  MovieListKey,
  PagedResult,
  SeriesListKey,
} from "@/lib/cinelog/types";

export const mediaKeys = {
  trending: () => ["media", "trending"] as const,
  movieList: (list: MovieListKey) => ["media", "movies", "list", list] as const,
  seriesList: (list: SeriesListKey) =>
    ["media", "series", "list", list] as const,
  moviesByGenre: (genreId: number) =>
    ["media", "movies", "genre", genreId] as const,
  seriesByGenre: (genreId: number) =>
    ["media", "series", "genre", genreId] as const,
  movieDetail: (id: number) => ["media", "movie", id] as const,
  seriesDetail: (id: number) => ["media", "series", id] as const,
  season: (seriesId: number, seasonNumber: number) =>
    ["media", "series", seriesId, "season", seasonNumber] as const,
  search: (query: string) => ["media", "search", query] as const,
  person: (id: number) => ["media", "person", id] as const,
  trailer: (type: MediaType, id: number) =>
    ["media", "trailer", type, id] as const,
};

/** Curated lists refresh a few times a day; genre browses change less often. */
const LIST_STALE: Record<string, number> = {
  trending: STALE.short,
  now_playing: STALE.short,
  airing_now: STALE.short,
  upcoming: STALE.short,
  new_series: STALE.short,
};

function staleForList(list: string): number {
  return LIST_STALE[list] ?? STALE.medium;
}

// ── Rails (first page only) ──────────────────────────────────────────────────

export function useTrending() {
  return useQuery({
    queryKey: mediaKeys.trending(),
    queryFn: fetchTrending,
    staleTime: STALE.short,
  });
}

export function useMovieRail(list: MovieListKey) {
  return useQuery({
    queryKey: mediaKeys.movieList(list),
    queryFn: () => fetchMovieList(list, 1),
    select: (page: PagedResult<MediaSummary>) => page.results,
    staleTime: staleForList(list),
  });
}

export function useSeriesRail(list: SeriesListKey) {
  return useQuery({
    queryKey: mediaKeys.seriesList(list),
    queryFn: () => fetchSeriesList(list, 1),
    select: (page: PagedResult<MediaSummary>) => page.results,
    staleTime: staleForList(list),
  });
}

/** Genre rails for the home screen, fetched in parallel. */
export function useGenreRails(
  genres: { id: number; label: string }[],
  type: MediaType,
) {
  return useQueries({
    queries: genres.map((genre) => ({
      queryKey:
        type === "movie"
          ? mediaKeys.moviesByGenre(genre.id)
          : mediaKeys.seriesByGenre(genre.id),
      queryFn: () =>
        type === "movie"
          ? fetchMoviesByGenre(genre.id, 1)
          : fetchSeriesByGenre(genre.id, 1),
      select: (page: PagedResult<MediaSummary>) => page.results,
      staleTime: STALE.medium,
    })),
    combine: (results) =>
      genres.map((genre, index) => ({
        genre,
        items: (results[index]?.data as MediaSummary[] | undefined) ?? [],
        isLoading: results[index]?.isLoading ?? false,
      })),
  });
}

// ── Paginated browse ────────────────────────────────────────────────────────

type PageParam = number;

function infiniteOptions<T>(fetchPage: (page: PageParam) => Promise<PagedResult<T>>) {
  return {
    initialPageParam: 1 as PageParam,
    queryFn: ({ pageParam }: { pageParam: PageParam }) => fetchPage(pageParam),
    getNextPageParam: (last: PagedResult<T>) =>
      last.page < Math.min(last.totalPages, 100) ? last.page + 1 : undefined,
  };
}

export function useMovieBrowse(list: MovieListKey, genreId: number | null) {
  const isGenre = genreId !== null;
  return useInfiniteQuery({
    queryKey: isGenre
      ? mediaKeys.moviesByGenre(genreId)
      : mediaKeys.movieList(list),
    ...infiniteOptions((page) =>
      isGenre ? fetchMoviesByGenre(genreId, page) : fetchMovieList(list, page),
    ),
    staleTime: isGenre ? STALE.medium : staleForList(list),
  });
}

export function useSeriesBrowse(list: SeriesListKey, genreId: number | null) {
  const isGenre = genreId !== null;
  return useInfiniteQuery({
    queryKey: isGenre
      ? mediaKeys.seriesByGenre(genreId)
      : mediaKeys.seriesList(list),
    ...infiniteOptions((page) =>
      isGenre ? fetchSeriesByGenre(genreId, page) : fetchSeriesList(list, page),
    ),
    staleTime: isGenre ? STALE.medium : staleForList(list),
  });
}

/** Flatten infinite-query pages into a de-duplicated list. */
export function flattenPages(
  pages: PagedResult<MediaSummary>[] | undefined,
): MediaSummary[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: MediaSummary[] = [];
  for (const page of pages) {
    for (const item of page.results) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// ── Detail ──────────────────────────────────────────────────────────────────

export function useMovieDetail(tmdbId: number | null) {
  return useQuery({
    queryKey: mediaKeys.movieDetail(tmdbId ?? 0),
    queryFn: () => fetchMovieDetail(tmdbId as number),
    enabled: typeof tmdbId === "number" && tmdbId > 0,
    staleTime: STALE.long,
  });
}

export function useSeriesDetail(tmdbId: number | null) {
  return useQuery({
    queryKey: mediaKeys.seriesDetail(tmdbId ?? 0),
    queryFn: () => fetchSeriesDetail(tmdbId as number),
    enabled: typeof tmdbId === "number" && tmdbId > 0,
    staleTime: STALE.long,
  });
}

export function useSeason(seriesId: number | null, seasonNumber: number | null) {
  return useQuery({
    queryKey: mediaKeys.season(seriesId ?? 0, seasonNumber ?? 0),
    queryFn: () => fetchSeason(seriesId as number, seasonNumber as number),
    enabled:
      typeof seriesId === "number" &&
      seriesId > 0 &&
      typeof seasonNumber === "number" &&
      seasonNumber > 0,
    staleTime: STALE.long,
  });
}

export function usePerson(personId: number | null) {
  return useQuery({
    queryKey: mediaKeys.person(personId ?? 0),
    queryFn: () => fetchPerson(personId as number),
    enabled: typeof personId === "number" && personId > 0,
    staleTime: STALE.long,
  });
}

export function useTrailer(type: MediaType, tmdbId: number | null, enabled = true) {
  return useQuery({
    queryKey: mediaKeys.trailer(type, tmdbId ?? 0),
    queryFn: () => fetchPrimaryTrailer(type, tmdbId as number),
    enabled: enabled && typeof tmdbId === "number" && tmdbId > 0,
    staleTime: STALE.long,
  });
}

// ── Search ──────────────────────────────────────────────────────────────────

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: mediaKeys.search(trimmed.toLowerCase()),
    queryFn: () => searchMedia(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: STALE.medium,
    placeholderData: (previous) => previous,
  });
}

export type MediaQueryOptions<T> = Omit<
  UseQueryOptions<T>,
  "queryKey" | "queryFn"
>;
