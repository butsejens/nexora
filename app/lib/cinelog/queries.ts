/**
 * CineLog — React Query hooks over the media data layer.
 *
 * Curated collections come from two bundled requests per media type, so the home
 * screen and the browse filters share one cache entry instead of firing a
 * request per rail. Only the filters the API can paginate use infinite queries.
 */

import { useMemo } from "react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";

import { STALE } from "@/lib/query-client";
import {
  PAGINATED_MOVIE_LISTS,
  PAGINATED_SERIES_LISTS,
  fetchMovieCollections,
  fetchMovieDetail,
  fetchMoviePage,
  fetchMoviesByGenre,
  fetchPerson,
  fetchPrimaryTrailer,
  fetchSeason,
  fetchSeriesByGenre,
  fetchSeriesCollections,
  fetchSeriesDetail,
  fetchSeriesPage,
  searchMedia,
  type MovieCollections,
  type SeriesCollections,
} from "@/lib/cinelog/api";
import type {
  MediaSummary,
  MediaType,
  MovieListKey,
  PagedResult,
  SeriesListKey,
} from "@/lib/cinelog/types";

export const mediaKeys = {
  movieCollections: () => ["media", "movies", "collections"] as const,
  seriesCollections: () => ["media", "series", "collections"] as const,
  moviePages: (sortBy: string) => ["media", "movies", "pages", sortBy] as const,
  seriesPages: (sortBy: string) => ["media", "series", "pages", sortBy] as const,
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

// ── Curated collections ──────────────────────────────────────────────────────

export function useMovieCollections() {
  return useQuery({
    queryKey: mediaKeys.movieCollections(),
    queryFn: fetchMovieCollections,
    staleTime: STALE.short,
  });
}

export function useSeriesCollections() {
  return useQuery({
    queryKey: mediaKeys.seriesCollections(),
    queryFn: fetchSeriesCollections,
    staleTime: STALE.short,
  });
}

export interface Rail {
  items: MediaSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** One rail out of the bundled movie collections. */
export function useMovieRail(list: MovieListKey): Rail {
  const query = useMovieCollections();
  return {
    items: query.data?.[list] ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** One rail out of the bundled series collections. */
export function useSeriesRail(list: SeriesListKey): Rail {
  const query = useSeriesCollections();
  return {
    items: query.data?.[list] ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** Mixed movie + series feed used by the home hero and the Trending rail. */
export function useTrending(): Rail {
  const movies = useMovieCollections();
  const series = useSeriesCollections();

  const items = useMemo(() => {
    const movieList = movies.data?.trending ?? [];
    const seriesList = series.data?.trending ?? [];
    // Interleave so neither media type dominates the front of the rail.
    const mixed: MediaSummary[] = [];
    for (let index = 0; index < Math.max(movieList.length, seriesList.length); index += 1) {
      if (movieList[index]) mixed.push(movieList[index]);
      if (seriesList[index]) mixed.push(seriesList[index]);
    }
    return mixed;
  }, [movies.data?.trending, series.data?.trending]);

  return {
    items,
    isLoading: movies.isLoading || series.isLoading,
    isError: movies.isError && series.isError,
    refetch: () => {
      void movies.refetch();
      void series.refetch();
    },
  };
}

// ── Browse ───────────────────────────────────────────────────────────────────

export interface Browse {
  items: MediaSummary[];
  isLoading: boolean;
  isError: boolean;
  isLoadingMore: boolean;
  /** True when there is another page to load. */
  canLoadMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

function dedupe(pages: PagedResult<MediaSummary>[] | undefined): MediaSummary[] {
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

function getNextPageParam(last: PagedResult<MediaSummary>) {
  // TMDB caps discover at 500 pages; 100 is far past what anyone scrolls.
  return last.page < Math.min(last.totalPages, 100) ? last.page + 1 : undefined;
}

export function useMovieBrowse(list: MovieListKey, genreId: number | null): Browse {
  const sortBy = genreId === null ? PAGINATED_MOVIE_LISTS[list] : undefined;
  const usePages = genreId !== null || Boolean(sortBy);

  const paged = useInfiniteQuery({
    queryKey:
      genreId !== null
        ? mediaKeys.moviesByGenre(genreId)
        : mediaKeys.moviePages(sortBy ?? "none"),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      genreId !== null
        ? fetchMoviesByGenre(genreId, pageParam)
        : fetchMoviePage(sortBy as string, pageParam),
    getNextPageParam,
    enabled: usePages,
    staleTime: STALE.medium,
  });

  const collection = useMovieCollections();

  if (usePages) {
    return {
      items: dedupe(paged.data?.pages),
      isLoading: paged.isLoading,
      isError: paged.isError,
      isLoadingMore: paged.isFetchingNextPage,
      canLoadMore: Boolean(paged.hasNextPage),
      loadMore: () => {
        if (paged.hasNextPage && !paged.isFetchingNextPage) {
          void paged.fetchNextPage();
        }
      },
      refetch: () => void paged.refetch(),
    };
  }

  return {
    items: collection.data?.[list] ?? [],
    isLoading: collection.isLoading,
    isError: collection.isError,
    isLoadingMore: false,
    canLoadMore: false,
    loadMore: () => undefined,
    refetch: () => void collection.refetch(),
  };
}

export function useSeriesBrowse(list: SeriesListKey, genreId: number | null): Browse {
  const sortBy = genreId === null ? PAGINATED_SERIES_LISTS[list] : undefined;
  const usePages = genreId !== null || Boolean(sortBy);

  const paged = useInfiniteQuery({
    queryKey:
      genreId !== null
        ? mediaKeys.seriesByGenre(genreId)
        : mediaKeys.seriesPages(sortBy ?? "none"),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      genreId !== null
        ? fetchSeriesByGenre(genreId, pageParam)
        : fetchSeriesPage(sortBy as string, pageParam),
    getNextPageParam,
    enabled: usePages,
    staleTime: STALE.medium,
  });

  const collection = useSeriesCollections();

  if (usePages) {
    return {
      items: dedupe(paged.data?.pages),
      isLoading: paged.isLoading,
      isError: paged.isError,
      isLoadingMore: paged.isFetchingNextPage,
      canLoadMore: Boolean(paged.hasNextPage),
      loadMore: () => {
        if (paged.hasNextPage && !paged.isFetchingNextPage) {
          void paged.fetchNextPage();
        }
      },
      refetch: () => void paged.refetch(),
    };
  }

  return {
    items: collection.data?.[list] ?? [],
    isLoading: collection.isLoading,
    isError: collection.isError,
    isLoadingMore: false,
    canLoadMore: false,
    loadMore: () => undefined,
    refetch: () => void collection.refetch(),
  };
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
      staleTime: STALE.medium,
    })),
    combine: (results) =>
      genres.map((genre, index) => ({
        genre,
        items: results[index]?.data?.results ?? [],
        isLoading: results[index]?.isLoading ?? false,
      })),
  });
}

// ── Detail ───────────────────────────────────────────────────────────────────

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

// ── Search ───────────────────────────────────────────────────────────────────

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

export type { MovieCollections, SeriesCollections };
