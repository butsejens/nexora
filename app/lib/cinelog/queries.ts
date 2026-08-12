/**
 * CineLog — React Query hooks over the media data layer.
 *
 * Rails read the first page of a browse filter, so a rail on the home screen and
 * the same filter on the Movies page share one cache entry. Every filter except
 * trending paginates, which drives the infinite scroll on the browse pages.
 */

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { STALE } from "@/lib/query-client";
import {
  MOVIE_LIST_SPECS,
  SERIES_LIST_SPECS,
  canPaginate,
  fetchMovieDetail,
  fetchMovieList,
  fetchMoviesByGenre,
  fetchPerson,
  fetchPrimaryTrailer,
  fetchSeason,
  fetchSeriesByGenre,
  fetchSeriesDetail,
  fetchSeriesList,
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

function nextPageParam(last: PagedResult<MediaSummary>) {
  // TMDB caps discover at 500 pages; 100 is far past what anyone scrolls.
  return last.page < Math.min(last.totalPages, 100) ? last.page + 1 : undefined;
}

/** Fast-moving lists refresh sooner than the evergreen ones. */
const SHORT_LIVED = new Set(["trending", "now_playing", "new_series"]);

function staleForList(list: string): number {
  return SHORT_LIVED.has(list) ? STALE.short : STALE.medium;
}

/**
 * Rails and browse pages read the same cache entry for a given filter, so both
 * go through one infinite query. A rail shows the first page; a browse page
 * flattens every loaded page. (Mixing `useQuery` and `useInfiniteQuery` on one
 * key would store two incompatible shapes and crash whichever ran second.)
 */
function useMediaList(
  queryKey: readonly unknown[],
  fetchPage: (page: number) => Promise<PagedResult<MediaSummary>>,
  options: { paginates: boolean; staleTime: number; enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: options.paginates ? nextPageParam : () => undefined,
    staleTime: options.staleTime,
    enabled: options.enabled ?? true,
  });
}

export interface Rail {
  items: MediaSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// ── Rails ────────────────────────────────────────────────────────────────────

export function useMovieRail(
  list: MovieListKey,
  options: { enabled?: boolean } = {},
): Rail {
  const query = useMediaList(
    mediaKeys.movieList(list),
    (page) => fetchMovieList(list, page),
    {
      paginates: canPaginate(MOVIE_LIST_SPECS[list]),
      staleTime: staleForList(list),
      enabled: options.enabled,
    },
  );
  const items = useMemo(() => query.data?.pages[0]?.results ?? [], [query.data]);
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

export function useSeriesRail(
  list: SeriesListKey,
  options: { enabled?: boolean } = {},
): Rail {
  const query = useMediaList(
    mediaKeys.seriesList(list),
    (page) => fetchSeriesList(list, page),
    {
      paginates: canPaginate(SERIES_LIST_SPECS[list]),
      staleTime: staleForList(list),
      enabled: options.enabled,
    },
  );
  const items = useMemo(() => query.data?.pages[0]?.results ?? [], [query.data]);
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** Mixed movie + series feed used by the home hero and the Trending rail. */
export function useTrending(): Rail {
  const query = useQuery({
    queryKey: mediaKeys.trending(),
    queryFn: fetchTrending,
    staleTime: STALE.short,
  });
  const items = useMemo(() => query.data ?? [], [query.data]);
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

// ── Browse ───────────────────────────────────────────────────────────────────

export interface Browse {
  items: MediaSummary[];
  isLoading: boolean;
  isError: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

function dedupe(
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

function toBrowse(query: ReturnType<typeof useMediaList>): Browse {
  return {
    items: dedupe(query.data?.pages),
    isLoading: query.isLoading,
    isError: query.isError,
    isLoadingMore: query.isFetchingNextPage,
    canLoadMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    refetch: () => void query.refetch(),
  };
}

export function useMovieBrowse(
  list: MovieListKey,
  genreId: number | null,
): Browse {
  return toBrowse(
    useMediaList(
      genreId !== null
        ? mediaKeys.moviesByGenre(genreId)
        : mediaKeys.movieList(list),
      (page) =>
        genreId !== null
          ? fetchMoviesByGenre(genreId, page)
          : fetchMovieList(list, page),
      {
        paginates: genreId !== null || canPaginate(MOVIE_LIST_SPECS[list]),
        staleTime: genreId !== null ? STALE.medium : staleForList(list),
      },
    ),
  );
}

export function useSeriesBrowse(
  list: SeriesListKey,
  genreId: number | null,
): Browse {
  return toBrowse(
    useMediaList(
      genreId !== null
        ? mediaKeys.seriesByGenre(genreId)
        : mediaKeys.seriesList(list),
      (page) =>
        genreId !== null
          ? fetchSeriesByGenre(genreId, page)
          : fetchSeriesList(list, page),
      {
        paginates: genreId !== null || canPaginate(SERIES_LIST_SPECS[list]),
        staleTime: genreId !== null ? STALE.medium : staleForList(list),
      },
    ),
  );
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

export function useSeason(
  seriesId: number | null,
  seasonNumber: number | null,
) {
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

export function useTrailer(
  type: MediaType,
  tmdbId: number | null,
  enabled = true,
) {
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

/** Interleave two feeds so neither media type dominates a mixed rail. */
export function useInterleaved(left: MediaSummary[], right: MediaSummary[]) {
  return useMemo(() => {
    const mixed: MediaSummary[] = [];
    for (
      let index = 0;
      index < Math.max(left.length, right.length);
      index += 1
    ) {
      if (left[index]) mixed.push(left[index]);
      if (right[index]) mixed.push(right[index]);
    }
    return mixed;
  }, [left, right]);
}
