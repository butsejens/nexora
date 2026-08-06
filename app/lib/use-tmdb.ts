/**
 * Nexora — TMDB React Query hooks
 *
 * Each hook wraps a TMDB API function with TanStack Query caching.
 * Returns { data, isLoading, isError, refetch } — all data is already
 * mapped to Nexora Movie / Series types.
 *
 * Stale times:
 *   - Trending / now-playing / on-air: 5 min  (changes frequently)
 *   - Popular / top-rated: 1 hour             (stable catalog)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTrendingAll,
  getPopularMovies,
  getPopularTv,
  getTopRatedMovies,
  getTopRatedTv,
  getNowPlayingMovies,
  getOnAirTv,
  getMoviesByGenre,
  getMoviesByGenreAll,
  getTvByGenre,
  getTvByGenreAll,
  getMoviesByAnyGenre,
  getTvByAnyGenre,
  searchTmdb,
  getMovieById,
  getTvById,
  getMovieCast,
  getTvCast,
  getTvSeasons,
  getTvSeasonDetail,
  getMovieRecommendations,
  getTvRecommendations,
  getMovieVideos,
  getTvVideos,
  getMovieCollection,
  getTvUniverse,
  getWatchProviders,
  getMoviesByProvider,
  getTvByProvider,
  getMoviesByCountry,
  getTvByCountry,
  getTvByNetwork,
  getTvByNetworkKids,
  getMoviesByCompany,
  getMoviesFromYearRange,
  getUpcomingMovies,
  getPopularMoviesAll,
  getTopRatedMoviesAll,
  getNowPlayingMoviesAll,
  getPopularSeriesAll,
  getTopRatedSeriesAll,
  getOnAirSeriesAll,
  type TmdbCastMember,
  type TmdbEpisode,
  type TmdbSeasonInfo,
  type TmdbVideo,
  type StreamingProvider,
} from "./tmdb";
import type { Movie, Series } from "@/types/streaming";
import { cachePeekStale, cacheSet, CacheTTL } from "@/lib/services/cache-service";
import { logAutonomousEvent } from "@/src/core/autonomous/autonomousLogger";

const STALE_15MIN = 15 * 60 * 1000;
const STALE_3H = 3 * 60 * 60 * 1000;

async function withAutonomousCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = CacheTTL.HOME_RAILS,
): Promise<T> {
  try {
    const value = await fetcher();
    await cacheSet(key, value, ttlMs);
    return value;
  } catch (error) {
    const stale = cachePeekStale<T>(key);
    if (stale != null) {
      logAutonomousEvent("warn", "cache", "using-stale-query-cache", { key });
      return stale;
    }
    throw error;
  }
}

// ── Individual hooks ──────────────────────────────────────────────────────────

/** Weekly trending: mix of movies + series, all with backdrops. Used for Hero + Trending rail. */
export function useTrending() {
  const cacheKey = "autonomous:tmdb:trending";
  return useQuery<(Movie | Series)[]>({
    queryKey: ["tmdb", "trending"],
    queryFn: () => withAutonomousCache(cacheKey, getTrendingAll),
    staleTime: STALE_15MIN,
    placeholderData: () => cachePeekStale<(Movie | Series)[]>(cacheKey) ?? [],
  });
}

/** Popular movies — for "Popular Movies" rail. */
export function usePopularMovies() {
  const cacheKey = "autonomous:tmdb:popular-movies";
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "popular-movies"],
    queryFn: () => withAutonomousCache(cacheKey, getPopularMovies),
    staleTime: STALE_3H,
    placeholderData: () => cachePeekStale<Movie[]>(cacheKey) ?? [],
  });
}

/** Popular TV series — for "Top Series" and general discovery. */
export function usePopularSeries() {
  const cacheKey = "autonomous:tmdb:popular-series";
  return useQuery<Series[]>({
    queryKey: ["tmdb", "popular-tv"],
    queryFn: () => withAutonomousCache(cacheKey, getPopularTv),
    staleTime: STALE_3H,
    placeholderData: () => cachePeekStale<Series[]>(cacheKey) ?? [],
  });
}

/** Top-rated movies — for "Critically Acclaimed" rail. */
export function useTopRatedMovies() {
  const cacheKey = "autonomous:tmdb:top-rated-movies";
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "top-rated-movies"],
    queryFn: () => withAutonomousCache(cacheKey, getTopRatedMovies),
    staleTime: STALE_3H,
    placeholderData: () => cachePeekStale<Movie[]>(cacheKey) ?? [],
  });
}

/** Top-rated TV series — for "Critically Acclaimed" rail. */
export function useTopRatedSeries() {
  const cacheKey = "autonomous:tmdb:top-rated-series";
  return useQuery<Series[]>({
    queryKey: ["tmdb", "top-rated-tv"],
    queryFn: () => withAutonomousCache(cacheKey, getTopRatedTv),
    staleTime: STALE_3H,
    placeholderData: () => cachePeekStale<Series[]>(cacheKey) ?? [],
  });
}

/** Movies currently in theatres — for "Recently Added" rail. */
export function useNowPlayingMovies() {
  const cacheKey = "autonomous:tmdb:now-playing";
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "now-playing"],
    queryFn: () => withAutonomousCache(cacheKey, getNowPlayingMovies),
    staleTime: STALE_15MIN,
    placeholderData: () => cachePeekStale<Movie[]>(cacheKey) ?? [],
  });
}

/** TV shows currently airing — for "On Air" rail. */
export function useOnAirSeries() {
  const cacheKey = "autonomous:tmdb:on-air";
  return useQuery<Series[]>({
    queryKey: ["tmdb", "on-air"],
    queryFn: () => withAutonomousCache(cacheKey, getOnAirTv),
    staleTime: STALE_15MIN,
    placeholderData: () => cachePeekStale<Series[]>(cacheKey) ?? [],
  });
}

/**
 * Multi-page "list" hooks — used by the generic /media/list browse page so
 * "Alle" (see-all) buttons on non-genre rails (Populair, Trending, Nu op tv,
 * Hoogst gewaardeerd, ...) have somewhere real to navigate to.
 */
export function usePopularMoviesAll(enabled = true) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "popular-movies-all"],
    queryFn: () => getPopularMoviesAll(5),
    staleTime: STALE_3H,
    enabled,
    placeholderData: [],
  });
}

export function useTopRatedMoviesAll(enabled = true) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "top-rated-movies-all"],
    queryFn: () => getTopRatedMoviesAll(5),
    staleTime: STALE_3H,
    enabled,
    placeholderData: [],
  });
}

export function useNowPlayingMoviesAll(enabled = true) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "now-playing-movies-all"],
    queryFn: () => getNowPlayingMoviesAll(5),
    staleTime: STALE_15MIN,
    enabled,
    placeholderData: [],
  });
}

export function usePopularSeriesAll(enabled = true) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "popular-series-all"],
    queryFn: () => getPopularSeriesAll(5),
    staleTime: STALE_3H,
    enabled,
    placeholderData: [],
  });
}

export function useTopRatedSeriesAll(enabled = true) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "top-rated-series-all"],
    queryFn: () => getTopRatedSeriesAll(5),
    staleTime: STALE_3H,
    enabled,
    placeholderData: [],
  });
}

export function useOnAirSeriesAll(enabled = true) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "on-air-series-all"],
    queryFn: () => getOnAirSeriesAll(5),
    staleTime: STALE_15MIN,
    enabled,
    placeholderData: [],
  });
}

/**
 * Movies discovered by TMDB genre ID(s) — e.g. Action=28, Animation=16.
 * Used for genre filter tabs so the pool is always genre-specific.
 */
export function useMoviesByGenre(genreIds: number[], enabled = true) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "movies-by-genre", genreIds.join(",")],
    queryFn: () => getMoviesByGenre(genreIds),
    staleTime: STALE_3H,
    enabled: enabled && genreIds.length > 0,
    placeholderData: [],
  });
}

/**
 * TV series discovered by TMDB genre ID(s) — e.g. Animation=16, Kids=10762.
 * Used for genre filter tabs and the Kids tab.
 */
export function useTvByGenre(genreIds: number[], enabled = true) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "tv-by-genre", genreIds.join(",")],
    queryFn: () => getTvByGenre(genreIds),
    staleTime: STALE_3H,
    enabled: enabled && genreIds.length > 0,
    placeholderData: [],
  });
}

/**
 * All movies for a genre across multiple pages — used on the genre browse page.
 */
export function useMoviesByGenreAll(genreIds: number[], enabled = true, maxPages = 8) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "movies-by-genre-all", genreIds.join(","), maxPages],
    queryFn: () => getMoviesByGenreAll(genreIds, maxPages),
    staleTime: STALE_3H,
    enabled: enabled && genreIds.length > 0,
    placeholderData: [],
  });
}

/**
 * All TV series for a genre across multiple pages — used on the genre browse page.
 */
export function useTvByGenreAll(genreIds: number[], enabled = true, maxPages = 8) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "tv-by-genre-all", genreIds.join(","), maxPages],
    queryFn: () => getTvByGenreAll(genreIds, maxPages),
    staleTime: STALE_3H,
    enabled: enabled && genreIds.length > 0,
    placeholderData: [],
  });
}

/**
 * Movies matching ANY of the user's onboarding genre picks (OR semantics).
 * Used to personalize home-screen rails based on the choice made during onboarding.
 */
export function usePersonalizedMovies(genreIds: number[], enabled = true) {
  const sortedKey = genreIds.slice().sort((a, b) => a - b).join(",");
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "personalized-movies", sortedKey],
    queryFn: () => getMoviesByAnyGenre(genreIds),
    staleTime: STALE_3H,
    enabled: enabled && genreIds.length > 0,
    placeholderData: [],
  });
}

/** TV equivalent of {@link usePersonalizedMovies}. */
export function usePersonalizedSeries(genreIds: number[], enabled = true) {
  const sortedKey = genreIds.slice().sort((a, b) => a - b).join(",");
  return useQuery<Series[]>({
    queryKey: ["tmdb", "personalized-series", sortedKey],
    queryFn: () => getTvByAnyGenre(genreIds),
    staleTime: STALE_3H,
    enabled: enabled && genreIds.length > 0,
    placeholderData: [],
  });
}

/**
 * Full-text search across movies + series.
 * Only fires when query is >= 2 characters.
 */
export function useTmdbSearch(query: string) {
  return useQuery<(Movie | Series)[]>({
    queryKey: ["tmdb", "search", query],
    queryFn: () => searchTmdb(query),
    staleTime: STALE_3H,
    enabled: query.trim().length >= 2,
    placeholderData: [],
  });
}

/**
 * Prefetch all home-screen rails in one call.
 * Call this early (e.g. on app start) to warm the cache.
 */
/** Fetch a single movie by TMDB numeric id (e.g. 550). Pass null to skip. */
export function useMovieDetail(tmdbId: number | null) {
  return useQuery<Movie>({
    queryKey: ["tmdb", "movie-detail", tmdbId],
    queryFn: () => getMovieById(tmdbId!),
    enabled: tmdbId !== null,
    staleTime: STALE_3H,
  });
}

/** Fetch a single TV show by TMDB numeric id. Pass null to skip. */
export function useTvDetail(tmdbId: number | null) {
  return useQuery<Series>({
    queryKey: ["tmdb", "tv-detail", tmdbId],
    queryFn: () => getTvById(tmdbId!),
    enabled: tmdbId !== null,
    staleTime: STALE_3H,
  });
}

export function usePrefetchHomeRails() {
  const qc = useQueryClient();
  return () => {
    void qc.prefetchQuery({
      queryKey: ["tmdb", "trending"],
      queryFn: getTrendingAll,
      staleTime: STALE_15MIN,
    });
    void qc.prefetchQuery({
      queryKey: ["tmdb", "popular-movies"],
      queryFn: getPopularMovies,
      staleTime: STALE_3H,
    });
    void qc.prefetchQuery({
      queryKey: ["tmdb", "popular-tv"],
      queryFn: getPopularTv,
      staleTime: STALE_3H,
    });
    void qc.prefetchQuery({
      queryKey: ["tmdb", "top-rated-movies"],
      queryFn: getTopRatedMovies,
      staleTime: STALE_3H,
    });
    void qc.prefetchQuery({
      queryKey: ["tmdb", "top-rated-tv"],
      queryFn: getTopRatedTv,
      staleTime: STALE_3H,
    });
    void qc.prefetchQuery({
      queryKey: ["tmdb", "now-playing"],
      queryFn: getNowPlayingMovies,
      staleTime: STALE_15MIN,
    });
    void qc.prefetchQuery({
      queryKey: ["tmdb", "on-air"],
      queryFn: getOnAirTv,
      staleTime: STALE_15MIN,
    });
  };
}

/** Parse a Nexora-TMDB id string; returns numeric id + kind or null. */
export function parseTmdbContentId(
  id: string,
): { kind: "movie" | "tv"; numericId: number } | null {
  if (id?.startsWith("tmdb_m_"))
    return { kind: "movie", numericId: parseInt(id.slice(7), 10) };
  if (id?.startsWith("tmdb_s_"))
    return { kind: "tv", numericId: parseInt(id.slice(7), 10) };
  return null;
}

/** Cast with actual TMDB profile photos. */
export function useTmdbCast(contentId: string | undefined | null) {
  const parsed = contentId ? parseTmdbContentId(contentId) : null;
  const movieCast = useQuery<TmdbCastMember[]>({
    queryKey: ["tmdb", "cast-movie", parsed?.numericId],
    queryFn: () => getMovieCast(parsed!.numericId),
    enabled: parsed?.kind === "movie",
    staleTime: STALE_3H,
  });
  const tvCast = useQuery<TmdbCastMember[]>({
    queryKey: ["tmdb", "cast-tv", parsed?.numericId],
    queryFn: () => getTvCast(parsed!.numericId),
    enabled: parsed?.kind === "tv",
    staleTime: STALE_3H,
  });
  if (parsed?.kind === "movie") return movieCast;
  if (parsed?.kind === "tv") return tvCast;
  return { data: [] as TmdbCastMember[], isLoading: false };
}

/** Seasons + first season episodes for a TV show. */
export function useTmdbSeasons(contentId: string | undefined | null) {
  const parsed = contentId ? parseTmdbContentId(contentId) : null;
  return useQuery<{
    seasons: TmdbSeasonInfo[];
    firstSeasonEpisodes: TmdbEpisode[];
  }>({
    queryKey: ["tmdb", "seasons", parsed?.numericId],
    queryFn: () => getTvSeasons(parsed!.numericId),
    enabled: parsed?.kind === "tv",
    staleTime: STALE_3H,
  });
}

/** Episodes for a single season — fetched on-demand when the user taps a season tab. */
export function useTmdbSeasonEpisodes(
  tvId: number | null,
  seasonNumber: number | null,
) {
  return useQuery<TmdbEpisode[]>({
    queryKey: ["tmdb", "season-episodes", tvId, seasonNumber],
    queryFn: () => getTvSeasonDetail(tvId!, seasonNumber!),
    enabled: tvId !== null && seasonNumber !== null,
    staleTime: STALE_3H,
  });
}

/** Similar / recommended content. */
export function useTmdbRecommendations(
  contentId: string | undefined | null,
  type: string,
) {
  const parsed = contentId ? parseTmdbContentId(contentId) : null;
  const movieRecs = useQuery<(Movie | Series)[]>({
    queryKey: ["tmdb", "recs-movie", parsed?.numericId],
    queryFn: () => getMovieRecommendations(parsed!.numericId),
    enabled: parsed?.kind === "movie" || (type === "movie" && parsed !== null),
    staleTime: STALE_3H,
  });
  const tvRecs = useQuery<(Movie | Series)[]>({
    queryKey: ["tmdb", "recs-tv", parsed?.numericId],
    queryFn: () => getTvRecommendations(parsed!.numericId),
    enabled: parsed?.kind === "tv" || (type === "series" && parsed !== null),
    staleTime: STALE_3H,
  });
  if (type === "movie" || parsed?.kind === "movie") return movieRecs;
  if (type === "series" || parsed?.kind === "tv") return tvRecs;
  return { data: [] as (Movie | Series)[], isLoading: false };
}

/** Trailers and clips from YouTube for a movie or TV show. */
export function useTmdbVideos(contentId: string | undefined | null) {
  const parsed = contentId ? parseTmdbContentId(contentId) : null;
  const movieVideos = useQuery<TmdbVideo[]>({
    queryKey: ["tmdb", "videos-movie", parsed?.numericId],
    queryFn: () => getMovieVideos(parsed!.numericId),
    enabled: parsed?.kind === "movie",
    staleTime: STALE_3H,
  });
  const tvVideos = useQuery<TmdbVideo[]>({
    queryKey: ["tmdb", "videos-tv", parsed?.numericId],
    queryFn: () => getTvVideos(parsed!.numericId),
    enabled: parsed?.kind === "tv",
    staleTime: STALE_3H,
  });
  if (parsed?.kind === "movie") return movieVideos;
  if (parsed?.kind === "tv") return tvVideos;
  return { data: [] as TmdbVideo[], isLoading: false };
}

/** Fetch all films in a TMDB franchise collection by collection ID. */
export function useMovieCollection(collectionId: number | null) {
  return useQuery<{ name: string; movies: Movie[] } | null>({
    queryKey: ["tmdb", "collection", collectionId],
    queryFn: () => getMovieCollection(collectionId!),
    enabled: collectionId !== null,
    staleTime: STALE_3H,
  });
}

/** Fetch multiple TV shows by their TMDB IDs (universe / franchise grouping). */
export function useTvUniverse(showIds: readonly number[], enabled = true) {
  const key = showIds.join(",");
  return useQuery<Series[]>({
    queryKey: ["tmdb", "tv-universe", key],
    queryFn: () => getTvUniverse([...showIds]),
    enabled: enabled && showIds.length > 0,
    staleTime: STALE_3H,
  });
}

// ── Streaming / Watch providers ────────────────────────────────────────────────

export type { StreamingProvider };

/**
 * Watch providers available in a region — used to show service logos on home screen.
 * Cached for 24 h since the provider list rarely changes.
 */
export function useWatchProviders(region = "NL") {
  return useQuery<StreamingProvider[]>({
    queryKey: ["tmdb", "watch-providers", region],
    queryFn: () => getWatchProviders(region),
    staleTime: STALE_3H * 24,
    placeholderData: [],
  });
}

/** Movies available on a specific streaming provider. */
export function useProviderMovies(providerId: number | null, region = "NL") {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "provider-movies", providerId, region],
    queryFn: () => getMoviesByProvider(providerId!, region),
    enabled: providerId !== null,
    staleTime: STALE_3H,
    placeholderData: [],
  });
}

/** TV series available on a specific streaming provider. */
export function useProviderSeries(providerId: number | null, region = "NL") {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "provider-series", providerId, region],
    queryFn: () => getTvByProvider(providerId!, region),
    enabled: providerId !== null,
    staleTime: STALE_3H,
    placeholderData: [],
  });
}

/** Movies from a country of origin (ISO code), e.g. BE/NL/FR. */
export function useCountryMovies(countryCode: string | null) {
  const country = String(countryCode || "").trim().toUpperCase();
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "country-movies", country],
    queryFn: () => getMoviesByCountry(country, 12),
    enabled: country.length >= 2,
    staleTime: STALE_3H,
    placeholderData: [],
  });
}

/** TV series from a country of origin (ISO code), e.g. BE/NL/FR. */
export function useCountrySeries(countryCode: string | null) {
  const country = String(countryCode || "").trim().toUpperCase();
  return useQuery<Series[]>({
    queryKey: ["tmdb", "country-series", country],
    queryFn: () => getTvByCountry(country, 12),
    enabled: country.length >= 2,
    staleTime: STALE_3H,
    placeholderData: [],
  });
}

// ── Network / Studio hooks (AI categorization) ────────────────────────────────

/**
 * TV series from a specific broadcast network (e.g. Nickelodeon=13, Disney Channel=54).
 * Sorted by popularity so the best-known shows appear first.
 */
export function useTvByNetwork(networkId: number, enabled = true) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "tv-by-network", networkId],
    queryFn: () => getTvByNetwork(networkId, 5),
    staleTime: STALE_3H,
    enabled: enabled && networkId > 0,
    placeholderData: [],
  });
}

/**
 * Like useTvByNetwork but with a lower vote-count floor for kids networks
 * where shows naturally have fewer ratings (Disney Junior, Boomerang).
 */
export function useTvByNetworkKids(networkId: number, enabled = true) {
  return useQuery<Series[]>({
    queryKey: ["tmdb", "tv-by-network-kids", networkId],
    queryFn: () => getTvByNetworkKids(networkId, 5),
    staleTime: STALE_3H,
    enabled: enabled && networkId > 0,
    placeholderData: [],
  });
}

/**
 * Movies from one or more production companies.
 * Company IDs: Walt Disney Pictures=2, Pixar=3, DreamWorks Animation=521,
 *              Illumination=6704, Studio Ghibli=10342
 */
export function useMoviesByCompany(companyIds: number[], enabled = true) {
  const key = companyIds.join(",");
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "movies-by-company", key],
    queryFn: () => getMoviesByCompany(companyIds, 5),
    staleTime: STALE_3H,
    enabled: enabled && companyIds.length > 0,
    placeholderData: [],
  });
}

/**
 * Movies released within a specific year range.
 * Used for "Klassiekers" (1950-1989) and "Binnenkort" (future) rails.
 */
export function useMoviesFromYearRange(
  fromYear: number,
  toYear: number,
  enabled = true,
) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "movies-year-range", fromYear, toYear],
    queryFn: () => getMoviesFromYearRange(fromYear, toYear, 4),
    staleTime: STALE_3H,
    enabled,
    placeholderData: [],
  });
}

/** Upcoming movies (future release dates). */
export function useUpcomingMovies(enabled = true) {
  return useQuery<Movie[]>({
    queryKey: ["tmdb", "upcoming-movies"],
    queryFn: () => getUpcomingMovies(3),
    staleTime: STALE_15MIN,
    enabled,
    placeholderData: [],
  });
}
