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
  normalizeTrailerFromServer,
} from "@/lib/domain/normalizers";
import { dedupeVodItems } from "@/lib/vod-curation";
import {
  enrichVodModuleItem,
  buildCollectionGroups,
  buildStudioGroups,
  pickFeaturedItem,
  type VodModuleItem,
} from "@/lib/vod-module";
import type {
  Movie,
  Series,
  Trailer,
  StreamSource,
} from "@/lib/domain/models";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function safeFetch<T>(route: string, fallback?: T, allowFallback = false): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = new Error(`[nexora:media] HTTP ${res.status} for ${route} ${body}`.trim());
      if (allowFallback) {
        console.warn(String(error.message));
        return fallback as T;
      }
      throw error;
    }
    const data = (await res.json()) as T;
    // Surface server-side config errors (e.g. missing TMDB key) so they are
    // visible in the developer console instead of silently returning empty data.
    if (data && typeof data === "object" && (data as any).error) {
      const error = new Error(`[nexora:media] server error for ${route}: ${(data as any).error}`);
      if (allowFallback) {
        console.warn(String(error.message));
        return fallback as T;
      }
      throw error;
    }
    return data;
  } catch (err: unknown) {
    if (!allowFallback) throw err;
    const msg = err instanceof Error ? err.message : String(err ?? "unknown");
    console.warn(`[nexora:media] fetch failed for ${route}: ${msg}`);
    return fallback as T;
  }
}

// TMDB is metadata only — this is the single place we enforce that contract.
export function enforceMetadataOnly<T extends { isPlayable: boolean; isDownloadable: boolean }>(item: T): T {
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

export interface VodHomePayload {
  featured: VodModuleItem | null;
  trendingMovies: VodModuleItem[];
  trendingSeries: VodModuleItem[];
  recentMovies: VodModuleItem[];
  recentSeries: VodModuleItem[];
  topRatedMovies: VodModuleItem[];
  topRatedSeries: VodModuleItem[];
  allItems: VodModuleItem[];
}

export interface VodCatalogPayload {
  items: VodModuleItem[];
  meta?: {
    nextCursorYear?: number | null;
    hasMore?: boolean;
  };
}

export interface VodCollectionPayload {
  id: string;
  name: string;
  itemCount: number;
  items: VodModuleItem[];
  poster?: string | null;
  backdrop?: string | null;
}

export interface VodStudioPayload {
  id: string;
  name: string;
  logo?: string | null;
  itemCount: number;
  items: VodModuleItem[];
}

type HomepagePayload = {
  rows?: Array<{
    id?: string;
    title?: string;
    label?: string;
    type?: "movie" | "series" | string;
    items?: any[];
  }>;
  rails?: Array<{
    id?: string;
    title?: string;
    label?: string;
    type?: "movie" | "series" | string;
    items?: any[];
  }>;
  hero?: any;
};

function hasServerError(payload: unknown): payload is { error: string } {
  return Boolean(payload && typeof payload === "object" && (payload as any).error);
}

function normalizeHomepageRows(payload: HomepagePayload | null | undefined) {
  const rows = Array.isArray(payload?.rows)
    ? payload?.rows
    : Array.isArray(payload?.rails)
      ? payload?.rails
      : [];
  return rows.filter(Boolean);
}

async function fetchHomepagePayload(): Promise<HomepagePayload | null> {
  const payload = await safeFetch<HomepagePayload | null>("/api/homepage", null, true);
  if (!payload || hasServerError(payload)) return null;
  return payload;
}

function buildItemsFromHomepage(payload: HomepagePayload | null | undefined): VodModuleItem[] {
  const rows = normalizeHomepageRows(payload);
  return dedupeModuleItems(
    rows.flatMap((row) =>
      buildVodItems(
        row.items || [],
        row.type === "movie" || row.type === "series" ? row.type : undefined,
      ),
    ),
  );
}

function nonEmptyArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function hasMediaRows(value: any): boolean {
  return (
    nonEmptyArray(value?.trending).length > 0 ||
    nonEmptyArray(value?.popular).length > 0 ||
    nonEmptyArray(value?.newReleases).length > 0 ||
    nonEmptyArray(value?.topRated).length > 0
  );
}

function buildTvMazeFallbackItems(schedule: any[]): VodModuleItem[] {
  if (!Array.isArray(schedule) || schedule.length === 0) return [];
  return dedupeModuleItems(
    schedule.slice(0, 60).map((entry) =>
      enrichVodModuleItem({
        id: `tvmaze-${String(entry?.showId || entry?.id || "")}`,
        type: "series",
        title: String(entry?.showName || entry?.name || "").trim() || "TV Episode",
        poster: entry?.image || null,
        backdrop: entry?.image || null,
        synopsis: [entry?.network, entry?.airtime].filter(Boolean).join(" • "),
        genre: [],
        isNew: true,
      }),
    ),
  );
}

function dedupeModuleItems(items: VodModuleItem[]): VodModuleItem[] {
  return dedupeVodItems(items as any) as VodModuleItem[];
}

function mapTrendingRail<T extends Movie | Series>(items: any[], normalizer: (item: any) => T): T[] {
  return (Array.isArray(items) ? items : []).map((item) => enforceMetadataOnly(normalizer(item)));
}

function buildVodItems(items: any[], type?: "movie" | "series"): VodModuleItem[] {
  return dedupeModuleItems(
    (Array.isArray(items) ? items : [])
      .map((item) => enrichVodModuleItem(type ? { ...item, type } : item))
      .filter((item) => Boolean(item.title))
  );
}

export async function getMediaHome(): Promise<MediaHomeRail[]> {
  const raw = await fetchHomepagePayload();
  const rows = normalizeHomepageRows(raw);
  if (!rows.length) return [];
  return rows.map(rail => ({
    id: String(rail.id ?? rail.label ?? ""),
    label: String(rail.title ?? rail.label ?? ""),
    items: (Array.isArray(rail.items) ? rail.items : []).map((item: any) => {
      const normalized = item.type === "series" || item.mediaType === "series"
        ? normalizeSeriesFromTmdb(item)
        : normalizeMovieFromTmdb(item);
      return enforceMetadataOnly(normalized);
    }),
  }));
}

export async function getTrendingMovies(page = 1): Promise<Movie[]> {
  const raw = await safeFetch<any>(`/api/movies/trending?page=${page}`, {}, true);
  const homepageRows = !hasMediaRows(raw) && page === 1
    ? buildItemsFromHomepage(await fetchHomepagePayload()).filter((item) => item.type === "movie")
    : [];
  if (!hasMediaRows(raw) && homepageRows.length) {
    return homepageRows.map((item) =>
      enforceMetadataOnly(
        normalizeMovieFromTmdb({
          id: item.tmdbId || Number(item.id) || undefined,
          title: item.title,
          poster: item.poster,
          backdrop: item.backdrop,
          rating: item.rating,
          release_date: item.releaseDate,
          genre_ids: item.genreIds,
        }),
      ),
    );
  }
  return mapTrendingRail(
    page > 1 ? raw?.popular : [...(raw?.trending || []), ...(raw?.popular || []), ...(raw?.newReleases || []), ...(raw?.topRated || [])],
    normalizeMovieFromTmdb,
  );
}

export async function getTrendingSeries(page = 1): Promise<Series[]> {
  const raw = await safeFetch<any>(`/api/series/trending?page=${page}`, {}, true);
  const homepageRows = !hasMediaRows(raw) && page === 1
    ? buildItemsFromHomepage(await fetchHomepagePayload()).filter((item) => item.type === "series")
    : [];
  if (!hasMediaRows(raw) && homepageRows.length) {
    return homepageRows.map((item) =>
      enforceMetadataOnly(
        normalizeSeriesFromTmdb({
          id: item.tmdbId || Number(item.id) || undefined,
          name: item.title,
          poster: item.poster,
          backdrop: item.backdrop,
          rating: item.rating,
          first_air_date: item.releaseDate,
          genre_ids: item.genreIds,
        }),
      ),
    );
  }
  return mapTrendingRail(
    page > 1 ? raw?.popular : [...(raw?.trending || []), ...(raw?.popular || []), ...(raw?.newReleases || []), ...(raw?.topRated || [])],
    normalizeSeriesFromTmdb,
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

export async function getCatalog(): Promise<VodCatalogPayload> {
  return getVodCatalogChunk(null);
}

export async function getMediaDetail(id: number, type: "movie" | "series"): Promise<Movie | Series | null> {
  return type === "movie" ? getMovieFull(id) : getSeriesFull(id);
}

export async function getCast(id: number, type: "movie" | "series"): Promise<any[]> {
  try {
    const detail = await (type === "movie"
      ? safeFetch<any>(`/api/movies/${id}/full`)
      : safeFetch<any>(`/api/series/${id}/full`));
    if (Array.isArray(detail?.cast)) return detail.cast;
  } catch {
    // fallback below
  }

  const endpoint = type === "series" ? "tv" : "movie";
  const credits = await safeFetch<any>(`/api/tmdb/${endpoint}/${id}/credits`, { cast: [] }, true);
  return Array.isArray(credits?.cast) ? credits.cast : [];
}

export async function getRecommendations(id: number, type: "movie" | "series"): Promise<(Movie | Series)[]> {
  return getSimilarTitles(id, type);
}

export const getCollections = getVodCollections;
export const getStudios = getVodStudios;

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

  const raw = await safeFetch<any>(`/api/recommendations/for-you?${params.toString()}`, {});
  const items: (Movie | Series)[] = [];
  for (const item of [
    ...(Array.isArray(raw?.results) ? raw.results : []),
    ...(Array.isArray(raw?.movies) ? raw.movies : []),
    ...(Array.isArray(raw?.series) ? raw.series : []),
  ]) {
    const normalized = item.type === "series" || item.mediaType === "series" || item.media_type === "tv"
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
  const raw = await safeFetch<any>(`/api/search/multi?query=${encodeURIComponent(query)}`, {});
  return {
    movies: mapTrendingRail(raw?.movies, normalizeMovieFromTmdb),
    series: mapTrendingRail(raw?.series, normalizeSeriesFromTmdb),
  };
}

export async function getVodHomePayload(): Promise<VodHomePayload> {
  const [movieData, seriesData, homepagePayload] = await Promise.all([
    safeFetch<any>("/api/movies/trending", {}, true),
    safeFetch<any>("/api/series/trending", {}, true),
    fetchHomepagePayload(),
  ]);

  const enrichedMoviesFromTrending = buildVodItems([
    ...(movieData?.trending || []).slice(0, 14).map((item: any) => ({ ...item, isTrending: true })),
    ...(movieData?.popular || []).slice(0, 14),
    ...(movieData?.newReleases || []).slice(0, 14).map((item: any) => ({ ...item, isNew: true })),
    ...(movieData?.topRated || []).slice(0, 14),
  ], "movie");

  const enrichedSeriesFromTrending = buildVodItems([
    ...(seriesData?.trending || []).slice(0, 14).map((item: any) => ({ ...item, isTrending: true })),
    ...(seriesData?.popular || []).slice(0, 14),
    ...(seriesData?.newReleases || []).slice(0, 14).map((item: any) => ({ ...item, isNew: true })),
    ...(seriesData?.topRated || []).slice(0, 14),
  ], "series");

  const homepageItems = buildItemsFromHomepage(homepagePayload);
  const homepageMovies = homepageItems.filter((item) => item.type === "movie");
  const homepageSeries = homepageItems.filter((item) => item.type === "series");

  const enrichedMovies = dedupeModuleItems([
    ...enrichedMoviesFromTrending,
    ...homepageMovies,
  ]);

  const enrichedSeries = dedupeModuleItems([
    ...enrichedSeriesFromTrending,
    ...homepageSeries,
  ]);

  let allItems = dedupeModuleItems([...enrichedMovies, ...enrichedSeries]);

  // Hard fallback when trending rails are temporarily empty: use catalog chunk
  // so Home never renders a fully-empty VOD state.
  if (allItems.length === 0) {
    const fallbackCatalog = await getVodCatalogChunk(null);
    allItems = dedupeModuleItems(fallbackCatalog.items || []);
  }

  // Final real-data fallback (no fake placeholders): TVMaze schedule items.
  if (allItems.length === 0) {
    const schedule = await safeFetch<any[]>("/api/tvmaze/schedule", [], true);
    allItems = buildTvMazeFallbackItems(schedule);
  }

  const heroCandidate = homepagePayload?.hero
    ? enrichVodModuleItem({
        ...homepagePayload.hero,
        type: homepagePayload.hero?.type || homepagePayload.hero?.mediaType || "movie",
      })
    : null;

  return {
    featured: heroCandidate || pickFeaturedItem(allItems),
    trendingMovies: enrichedMovies.filter((item) => item.isTrending).slice(0, 16),
    trendingSeries: enrichedSeries.filter((item) => item.isTrending).slice(0, 16),
    recentMovies: enrichedMovies.filter((item) => item.isNew).slice(0, 16),
    recentSeries: enrichedSeries.filter((item) => item.isNew).slice(0, 16),
    topRatedMovies: [...enrichedMovies].sort((a, b) => Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0)).slice(0, 16),
    topRatedSeries: [...enrichedSeries].sort((a, b) => Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0)).slice(0, 16),
    allItems,
  };
}

export async function getVodCatalogChunk(cursorYear?: number | null): Promise<VodCatalogPayload> {
  const params = new URLSearchParams({
    type: "all",
    years: "30",
    chunkYears: "6",
    pagesPerYear: "2",
  });
  if (cursorYear) params.set("cursorYear", String(cursorYear));
  const payload = await safeFetch<any>(`/api/vod/catalog?${params.toString()}`, {});
  const catalogItems = buildVodItems(payload?.items || []);
  if (catalogItems.length > 0) {
    return {
      items: catalogItems,
      meta: payload?.meta,
    };
  }

  const homepageItems = buildItemsFromHomepage(await fetchHomepagePayload());
  return {
    items: homepageItems,
    meta: payload?.meta,
  };
}

export async function getVodCollections(): Promise<VodCollectionPayload[]> {
  const collectionTargets = [
    "Star Wars",
    "Harry Potter",
    "Marvel",
    "The Lord of the Rings",
    "Mission Impossible",
    "John Wick",
    "Fast and Furious",
    "Jurassic Park",
    "DC",
    "James Bond",
  ];

  const results = await Promise.all(
    collectionTargets.map(async (target) => {
      const payload = await safeFetch<any>(`/api/vod/collection?title=${encodeURIComponent(target)}&depth=5`, null, true);
      const items = dedupeModuleItems((payload?.items || []).map((item: any) => enrichVodModuleItem(item))).slice(0, 40);
      return {
        id: String(payload?.collection?.id || target).toLowerCase(),
        name: String(payload?.collection?.name || `${target} Collection`),
        itemCount: Number(payload?.stats?.total || items.length || 0),
        items,
        poster: payload?.collection?.poster || null,
        backdrop: payload?.collection?.backdrop || null,
      };
    })
  );

  const usable = results.filter((item) => item.itemCount > 2);
  if (usable.length > 0) return usable;

  const homePayload = await getVodHomePayload();
  const grouped = buildCollectionGroups(homePayload.allItems || []).slice(0, 20);
  return grouped
    .filter((group) => (group.itemCount || 0) > 2)
    .map((group) => ({
      id: group.key,
      name: group.name,
      itemCount: group.itemCount,
      items: group.items,
      poster: group.posterUri || null,
      backdrop: group.bannerUri || null,
    }));
}

export async function getVodCollectionById(id: string) {
  if (!id) return null;
  return await safeFetch<any>(`/api/vod/collection?id=${encodeURIComponent(id)}`, null, true);
}

export async function getVodStudios(): Promise<VodStudioPayload[]> {
  const studioTargets = [
    { id: "420", name: "Marvel Studios" },
    { id: "2", name: "Walt Disney Pictures" },
    { id: "174", name: "Warner Bros. Pictures" },
    { id: "33", name: "Universal Pictures" },
    { id: "4", name: "Paramount Pictures" },
    { id: "25", name: "20th Century Studios" },
  ];

  const results = await Promise.all(
    studioTargets.map(async (target) => {
      const payload = await safeFetch<any>(`/api/vod/studio?id=${encodeURIComponent(target.id)}&name=${encodeURIComponent(target.name)}&depth=7`, null, true);
      const items = dedupeModuleItems((payload?.items || []).map((item: any) => enrichVodModuleItem(item))).slice(0, 60);
      return {
        id: String(payload?.studio?.id || target.id),
        name: String(payload?.studio?.name || target.name),
        logo: payload?.studio?.logo || null,
        itemCount: Number(payload?.stats?.total || items.length || 0),
        items,
      };
    })
  );

  const usable = results.filter((item) => item.itemCount > 3);
  if (usable.length > 0) return usable;

  const homePayload = await getVodHomePayload();
  return buildStudioGroups(homePayload.allItems || [])
    .slice(0, 24)
    .filter((group) => (group.itemCount || 0) > 2)
    .map((group) => ({
      id: String(group.id || group.name),
      name: group.name,
      logo: group.logoUri || null,
      itemCount: group.itemCount,
      items: group.items,
    }));
}

export async function getVodStudioById(id: string) {
  if (!id) return null;
  return await safeFetch<any>(`/api/vod/studio?id=${encodeURIComponent(id)}`, null, true);
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
  vodHome: () => ["media", "vod", "home"] as const,
  vodCatalog: (cursorYear: number | null) => ["media", "vod", "catalog", cursorYear ?? "root"] as const,
  vodCollections: () => ["media", "vod", "collections"] as const,
  vodStudios: () => ["media", "vod", "studios"] as const,
  vodCollectionDetail: (id: string) => ["media", "vod", "collection", id] as const,
  vodStudioDetail: (id: string) => ["media", "vod", "studio", id] as const,
} as const;
