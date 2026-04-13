/**
 * Nexora – Media Domain Service
 *
 * Central access point for all movies/series data.
 *
 * Key rules enforced here:
 *   - TMDB is metadata only; isPlayable/isDownloadable remain false unless
 *     the item is enriched by a stream source.
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
import type { Movie, Series, Trailer, StreamSource } from "@/lib/domain/models";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function safeFetch<T>(
  route: string,
  fallback?: T,
  allowFallback = false,
): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = new Error(
        `[nexora:media] HTTP ${res.status} for ${route} ${body}`.trim(),
      );
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
      const error = new Error(
        `[nexora:media] server error for ${route}: ${(data as any).error}`,
      );
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
export function enforceMetadataOnly<
  T extends { isPlayable: boolean; isDownloadable: boolean },
>(item: T): T {
  return { ...item, isPlayable: false, isDownloadable: false };
}

/**
 * Enrich a normalized title with stream sources.
 */
export function enrichTitleWithStreamSources(
  title: Movie | Series,
  sources: StreamSource[],
): Movie | Series {
  if (sources.length === 0) return title;
  return {
    ...title,
    streamSources: sources,
    isPlayable: true,
    // Downloadable only if the source supports it (HLS/MP4, not embed)
    isDownloadable: sources.some((s) => s.type === "hls" || s.type === "mp4"),
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
  /** Comma-separated TMDB collection IDs (multiple when a franchise spans several TMDB collections) */
  ids?: string;
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
  poster?: string | null;
  backdrop?: string | null;
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
  return Boolean(
    payload && typeof payload === "object" && (payload as any).error,
  );
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
  const payload = await safeFetch<HomepagePayload | null>(
    "/api/homepage",
    null,
    true,
  );
  if (!payload || hasServerError(payload)) return null;
  return payload;
}

function buildItemsFromHomepage(
  payload: HomepagePayload | null | undefined,
): VodModuleItem[] {
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
        title:
          String(entry?.showName || entry?.name || "").trim() || "TV Episode",
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

function mapTrendingRail<T extends Movie | Series>(
  items: any[],
  normalizer: (item: any) => T,
): T[] {
  return (Array.isArray(items) ? items : []).map((item) =>
    enforceMetadataOnly(normalizer(item)),
  );
}

function buildVodItems(
  items: any[],
  type?: "movie" | "series",
): VodModuleItem[] {
  return dedupeModuleItems(
    (Array.isArray(items) ? items : [])
      .map((item) => enrichVodModuleItem(type ? { ...item, type } : item))
      .filter((item) => Boolean(item.title)),
  );
}

export async function getMediaHome(): Promise<MediaHomeRail[]> {
  const raw = await fetchHomepagePayload();
  const rows = normalizeHomepageRows(raw);
  if (!rows.length) return [];
  return rows.map((rail) => ({
    id: String(rail.id ?? rail.label ?? ""),
    label: String(rail.title ?? rail.label ?? ""),
    items: (Array.isArray(rail.items) ? rail.items : []).map((item: any) => {
      const normalized =
        item.type === "series" || item.mediaType === "series"
          ? normalizeSeriesFromTmdb(item)
          : normalizeMovieFromTmdb(item);
      return enforceMetadataOnly(normalized);
    }),
  }));
}

export async function getTrendingMovies(page = 1): Promise<Movie[]> {
  const raw = await safeFetch<any>(
    `/api/movies/trending?page=${page}`,
    {},
    true,
  );
  const homepageRows =
    !hasMediaRows(raw) && page === 1
      ? buildItemsFromHomepage(await fetchHomepagePayload()).filter(
          (item) => item.type === "movie",
        )
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
    page > 1
      ? raw?.popular
      : [
          ...(raw?.trending || []),
          ...(raw?.popular || []),
          ...(raw?.newReleases || []),
          ...(raw?.topRated || []),
        ],
    normalizeMovieFromTmdb,
  );
}

export async function getTrendingSeries(page = 1): Promise<Series[]> {
  const raw = await safeFetch<any>(
    `/api/series/trending?page=${page}`,
    {},
    true,
  );
  const homepageRows =
    !hasMediaRows(raw) && page === 1
      ? buildItemsFromHomepage(await fetchHomepagePayload()).filter(
          (item) => item.type === "series",
        )
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
    page > 1
      ? raw?.popular
      : [
          ...(raw?.trending || []),
          ...(raw?.popular || []),
          ...(raw?.newReleases || []),
          ...(raw?.topRated || []),
        ],
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

export async function getMediaDetail(
  id: number,
  type: "movie" | "series",
): Promise<Movie | Series | null> {
  return type === "movie" ? getMovieFull(id) : getSeriesFull(id);
}

export async function getCast(
  id: number,
  type: "movie" | "series",
): Promise<any[]> {
  try {
    const detail = await (type === "movie"
      ? safeFetch<any>(`/api/movies/${id}/full`)
      : safeFetch<any>(`/api/series/${id}/full`));
    if (Array.isArray(detail?.cast)) return detail.cast;
  } catch {
    // fallback below
  }

  const endpoint = type === "series" ? "tv" : "movie";
  const credits = await safeFetch<any>(
    `/api/tmdb/${endpoint}/${id}/credits`,
    { cast: [] },
    true,
  );
  return Array.isArray(credits?.cast) ? credits.cast : [];
}

export async function getRecommendations(
  id: number,
  type: "movie" | "series",
): Promise<(Movie | Series)[]> {
  return getSimilarTitles(id, type);
}

export const getCollections = getVodCollections;
export const getStudios = getVodStudios;

export async function discoverMoviesByGenre(
  genreId: number,
  page = 1,
): Promise<Movie[]> {
  const raw = await safeFetch<any>(
    `/api/movies/discover-by-genre?genre_id=${genreId}&page=${page}`,
    {},
  );
  return (Array.isArray(raw?.results) ? raw.results : []).map((r: any) =>
    enforceMetadataOnly(normalizeMovieFromTmdb(r)),
  );
}

export async function discoverSeriesByGenre(
  genreId: number,
  page = 1,
): Promise<Series[]> {
  const raw = await safeFetch<any>(
    `/api/series/discover-by-genre?genre_id=${genreId}&page=${page}`,
    {},
  );
  return (Array.isArray(raw?.results) ? raw.results : []).map((r: any) =>
    enforceMetadataOnly(normalizeSeriesFromTmdb(r)),
  );
}

export async function getMovieGenres(): Promise<
  { id: number; name: string }[]
> {
  const raw = await safeFetch<any>("/api/movies/genres-catalog", {});
  return Array.isArray(raw?.genres) ? raw.genres : [];
}

export async function getSeriesGenres(): Promise<
  { id: number; name: string }[]
> {
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
  input: RecommendationInput = {},
): Promise<(Movie | Series)[]> {
  const params = new URLSearchParams();
  if (input.moods?.length) params.set("moods", input.moods.join(","));
  if (input.genres?.length) params.set("genres", input.genres.join(","));
  if (input.language) params.set("language", input.language);

  const raw = await safeFetch<any>(
    `/api/recommendations/for-you?${params.toString()}`,
    {},
  );
  const items: (Movie | Series)[] = [];
  for (const item of [
    ...(Array.isArray(raw?.results) ? raw.results : []),
    ...(Array.isArray(raw?.movies) ? raw.movies : []),
    ...(Array.isArray(raw?.series) ? raw.series : []),
  ]) {
    const normalized =
      item.type === "series" ||
      item.mediaType === "series" ||
      item.media_type === "tv"
        ? normalizeSeriesFromTmdb(item)
        : normalizeMovieFromTmdb(item);
    items.push(enforceMetadataOnly(normalized));
  }
  return items;
}

export async function getSimilarTitles(
  tmdbId: number,
  type: "movie" | "series",
): Promise<(Movie | Series)[]> {
  const raw = await safeFetch<any>(
    `/api/recommendations/similar/${tmdbId}?type=${type}`,
    {},
  );
  const items: (Movie | Series)[] = [];
  for (const item of Array.isArray(raw?.results) ? raw.results : []) {
    const normalized =
      type === "series"
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
  const raw = await safeFetch<any>(
    `/api/search/multi?query=${encodeURIComponent(query)}`,
    {},
  );
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

  const enrichedMoviesFromTrending = buildVodItems(
    [
      ...(movieData?.trending || [])
        .slice(0, 14)
        .map((item: any) => ({ ...item, isTrending: true })),
      ...(movieData?.popular || []).slice(0, 14),
      ...(movieData?.newReleases || [])
        .slice(0, 14)
        .map((item: any) => ({ ...item, isNew: true })),
      ...(movieData?.topRated || []).slice(0, 14),
    ],
    "movie",
  );

  const enrichedSeriesFromTrending = buildVodItems(
    [
      ...(seriesData?.trending || [])
        .slice(0, 14)
        .map((item: any) => ({ ...item, isTrending: true })),
      ...(seriesData?.popular || []).slice(0, 14),
      ...(seriesData?.newReleases || [])
        .slice(0, 14)
        .map((item: any) => ({ ...item, isNew: true })),
      ...(seriesData?.topRated || []).slice(0, 14),
    ],
    "series",
  );

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
        type:
          homepagePayload.hero?.type ||
          homepagePayload.hero?.mediaType ||
          "movie",
      })
    : null;

  return {
    featured: heroCandidate || pickFeaturedItem(allItems),
    trendingMovies: enrichedMovies
      .filter((item) => item.isTrending)
      .slice(0, 16),
    trendingSeries: enrichedSeries
      .filter((item) => item.isTrending)
      .slice(0, 16),
    recentMovies: enrichedMovies.filter((item) => item.isNew).slice(0, 16),
    recentSeries: enrichedSeries.filter((item) => item.isNew).slice(0, 16),
    topRatedMovies: [...enrichedMovies]
      .sort(
        (a, b) =>
          Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0),
      )
      .slice(0, 16),
    topRatedSeries: [...enrichedSeries]
      .sort(
        (a, b) =>
          Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0),
      )
      .slice(0, 16),
    allItems,
  };
}

export async function getVodCatalogChunk(
  cursorYear?: number | null,
): Promise<VodCatalogPayload> {
  const params = new URLSearchParams({
    type: "all",
    years: "30",
    chunkYears: "6",
    pagesPerYear: "2",
  });
  if (cursorYear) params.set("cursorYear", String(cursorYear));
  const payload = await safeFetch<any>(
    `/api/vod/catalog?${params.toString()}`,
    {},
  );
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
  // Each entry supports multiple TMDB collection IDs so franchises split across
  // several TMDB collections (like Spider-Man) can be merged into one card.
  // Wrong / outdated IDs are safe — the server returns itemCount=0 and they get filtered out.
  const collectionTargets: { ids: number[]; label: string }[] = [
    // ── Marvel MCU ──
    { ids: [531241, 556, 125574], label: "Spider-Man" }, // MCU + Raimi + Amazing
    { ids: [86311], label: "The Avengers" },
    { ids: [748], label: "X-Men" },
    { ids: [448150], label: "Deadpool" },
    { ids: [131295], label: "Iron Man" },
    { ids: [131296], label: "Thor" },
    { ids: [131292], label: "Captain America" },
    { ids: [284433], label: "Guardians of the Galaxy" },
    { ids: [422834], label: "Ant-Man" },
    { ids: [573436], label: "Venom" },
    { ids: [618529], label: "Doctor Strange" },
    { ids: [623911], label: "Black Panther" },
    { ids: [9744], label: "Fantastic Four" },
    { ids: [612758], label: "Black Widow" },
    { ids: [667354], label: "Shang-Chi" },
    { ids: [736502], label: "Shazam" },
    // ── DC ──
    { ids: [263], label: "The Dark Knight" },
    { ids: [2326], label: "Batman (Klassiek)" },
    { ids: [2241], label: "Superman" },
    { ids: [468552], label: "Wonder Woman" },
    { ids: [731462], label: "Aquaman" },
    // ── Star Wars / Wizarding World ──
    { ids: [10], label: "Star Wars" },
    { ids: [1241], label: "Harry Potter" },
    { ids: [435259], label: "Fantastic Beasts" },
    // ── Lord of the Rings / Tolkien ──
    { ids: [119], label: "The Lord of the Rings" },
    { ids: [121938], label: "The Hobbit" },
    // ── Fantasy / Sci-Fi sagas ──
    { ids: [87096], label: "Avatar" },
    { ids: [420], label: "Chronicles of Narnia" },
    { ids: [726871], label: "Dune" },
    { ids: [295382], label: "Maze Runner" },
    { ids: [283579], label: "Divergent" },
    { ids: [33514], label: "The Hunger Games" },
    // ── Spy / Action ──
    { ids: [645], label: "James Bond" },
    { ids: [87359], label: "Mission: Impossible" },
    { ids: [404609], label: "John Wick" },
    { ids: [9485], label: "Fast & Furious" },
    { ids: [84], label: "Indiana Jones" },
    { ids: [31562], label: "Jason Bourne" },
    { ids: [304], label: "Ocean's" },
    { ids: [126125], label: "The Expendables" },
    { ids: [9734], label: "Top Gun" },
    // ── Sci-Fi classics ──
    { ids: [528], label: "Terminator" },
    { ids: [2344], label: "The Matrix" },
    { ids: [8091], label: "Alien" },
    { ids: [61836], label: "Predator" },
    { ids: [264], label: "Back to the Future" },
    { ids: [8650], label: "Transformers" },
    { ids: [8945], label: "Mad Max" },
    { ids: [173710], label: "Planet of the Apes" },
    { ids: [115575, 151], label: "Star Trek" }, // Kelvin + original films
    { ids: [5547], label: "RoboCop" },
    // ── Classic action / adventure ──
    { ids: [328], label: "Jurassic Park" },
    { ids: [295], label: "Pirates of the Caribbean" },
    { ids: [1570], label: "Die Hard" },
    { ids: [959], label: "Lethal Weapon" },
    { ids: [1575, 741551], label: "Rocky / Creed" },
    { ids: [5039], label: "Rambo" },
    { ids: [2980], label: "Ghostbusters" },
    { ids: [86055], label: "Men in Black" },
    // ── Horror ──
    { ids: [1734], label: "The Mummy" },
    { ids: [179685], label: "Paranormal Activity" },
    { ids: [656], label: "Saw" },
    { ids: [91361], label: "Halloween" },
    { ids: [9743], label: "A Nightmare on Elm Street" },
    { ids: [9735], label: "Friday the 13th" },
    { ids: [4588], label: "Scream" },
    { ids: [313086], label: "The Conjuring" },
    { ids: [518615], label: "Annabelle" },
    { ids: [704172], label: "It" },
    { ids: [238002], label: "Insidious" },
    { ids: [289267], label: "The Purge" },
    { ids: [8864], label: "Final Destination" },
    { ids: [10455], label: "Chucky" },
    { ids: [17255], label: "Resident Evil" },
    { ids: [6928], label: "Evil Dead" },
    { ids: [10228], label: "Cloverfield" },
    // ── Animation ──
    { ids: [10194], label: "Toy Story" },
    { ids: [2150], label: "Shrek" },
    { ids: [8354], label: "Ice Age" },
    { ids: [86066], label: "Despicable Me" },
    { ids: [87118], label: "Cars" },
    { ids: [89137], label: "How to Train Your Dragon" },
    { ids: [77816], label: "Kung Fu Panda" },
    { ids: [14740], label: "Madagascar" },
    { ids: [468222], label: "The Incredibles" },
    { ids: [404825], label: "Wreck-It Ralph" },
    { ids: [185103], label: "Hotel Transylvania" },
    { ids: [386382], label: "Frozen" },
    { ids: [83905], label: "Rio" },
    // ── Comedy ──
    { ids: [1006], label: "Austin Powers" },
    { ids: [86119], label: "The Hangover" },
    { ids: [2806], label: "American Pie" },
    { ids: [4438], label: "Scary Movie" },
  ];

  const results = await Promise.all(
    collectionTargets.map(async (target) => {
      // Fetch all IDs for this target, then merge and deduplicate items
      const payloads = await Promise.all(
        target.ids.map((id) =>
          safeFetch<any>(`/api/vod/collection?id=${id}&depth=3`, null, true),
        ),
      );
      const primaryPayload = payloads[0];
      const allRawItems = payloads.flatMap((p) => p?.items || []);
      const items = dedupeModuleItems(
        allRawItems.map((item: any) => enrichVodModuleItem(item)),
      ).slice(0, 40);
      const firstWithPoster = payloads.find((p) => p?.collection?.poster);
      return {
        id: String(target.ids[0]).toLowerCase(),
        ids: target.ids.length > 1 ? target.ids.join(",") : undefined,
        name: String(
          firstWithPoster?.collection?.name ??
            primaryPayload?.collection?.name ??
            target.label,
        ),
        itemCount: items.length,
        items,
        poster: (firstWithPoster ?? primaryPayload)?.collection?.poster || null,
        backdrop:
          (firstWithPoster ?? primaryPayload)?.collection?.backdrop || null,
      };
    }),
  );

  const homePayload = await getVodHomePayload();
  const grouped = buildCollectionGroups(homePayload.allItems || []);
  const groupedMapped = grouped
    .filter((group) => (group.itemCount || 0) > 0)
    .map((group) => ({
      id: group.key,
      ids: undefined,
      name: group.name,
      itemCount: group.itemCount,
      items: group.items,
      poster: group.posterUri || null,
      backdrop: group.bannerUri || null,
    }));

  // Always return all API results that have at least 1 item, merged with any
  // additional grouped fallback collections to ensure a rich grid.
  // Deduplicate by both ID and normalized name so e.g. "Harry Potter Collection"
  // from TMDB (id: "1241") and the fallback group (id: "harry-potter") don't
  // both appear as separate cards.
  const normalizeCollName = (name: string) =>
    String(name || "")
      .replace(/\s*[-:]?\s*(collection|collectie)\s*$/i, "")
      .trim()
      .toLowerCase();

  const usable = results.filter((item) => item.itemCount > 0);

  const merged = [...usable];
  const seenById = new Set(usable.map((item) => String(item.id).toLowerCase()));
  const seenByName = new Set(
    usable.map((item) => normalizeCollName(item.name)),
  );
  for (const fallback of groupedMapped) {
    const key = String(fallback.id).toLowerCase();
    const nameKey = normalizeCollName(fallback.name);
    if (seenById.has(key) || seenByName.has(nameKey)) continue;
    seenById.add(key);
    seenByName.add(nameKey);
    merged.push(fallback);
  }

  return merged.length > 0 ? merged : groupedMapped;
}

export async function getVodCollectionById(id: string) {
  if (!id) return null;
  return await safeFetch<any>(
    `/api/vod/collection?id=${encodeURIComponent(id)}`,
    null,
    true,
  );
}

export async function getVodStudios(): Promise<VodStudioPayload[]> {
  const studioTargets = [
    { id: "420", name: "Marvel Studios" },
    { id: "2", name: "Walt Disney Pictures" },
    { id: "174", name: "Warner Bros. Pictures" },
    { id: "33", name: "Universal Pictures" },
    { id: "4", name: "Paramount Pictures" },
    { id: "25", name: "20th Century Studios" },
    { id: "3", name: "Pixar" },
    { id: "521", name: "DreamWorks Animation" },
    { id: "1", name: "Lucasfilm" },
    { id: "5", name: "Columbia Pictures" },
    { id: "34", name: "Sony Pictures" },
    { id: "41077", name: "A24" },
    { id: "1632", name: "Lionsgate" },
    { id: "127928", name: "Netflix" },
    { id: "3268", name: "HBO" },
    { id: "14", name: "Miramax" },
  ];

  const results = await Promise.all(
    studioTargets.map(async (target) => {
      const payload = await safeFetch<any>(
        `/api/vod/studio?id=${encodeURIComponent(target.id)}&name=${encodeURIComponent(target.name)}&depth=7`,
        null,
        true,
      );
      const items = dedupeModuleItems(
        (payload?.items || []).map((item: any) => enrichVodModuleItem(item)),
      ).slice(0, 60);
      // Pick a recent item with a backdrop for the studio card (items are sorted oldest-first)
      const recentWithBackdrop =
        [...items].reverse().find((i: any) => i.backdrop) ||
        [...items].reverse().find((i: any) => i.poster) ||
        items[0];
      const logo = payload?.studio?.logo || null;
      const poster =
        recentWithBackdrop?.poster || recentWithBackdrop?.backdrop || null;
      const backdrop =
        recentWithBackdrop?.backdrop || recentWithBackdrop?.poster || null;
      return {
        id: String(payload?.studio?.id || target.id),
        name: String(payload?.studio?.name || target.name),
        logo,
        poster,
        backdrop,
        itemCount: Number(payload?.stats?.total || items.length || 0),
        items,
      };
    }),
  );

  // Return all studios that have items, plus any fallback studios from home data.
  const usable = results.filter((item) => item.itemCount > 0);

  const homePayload = await getVodHomePayload();
  const fallbackStudios = buildStudioGroups(homePayload.allItems || [])
    .filter((group) => (group.itemCount || 0) > 0)
    .map((group) => {
      const recentFb =
        [...group.items].reverse().find((i: any) => i.backdrop) ||
        [...group.items].reverse().find((i: any) => i.poster) ||
        group.items[0];
      return {
        id: String(group.id || group.name),
        name: group.name,
        logo: group.logoUri || null,
        poster: recentFb?.poster || recentFb?.backdrop || null,
        backdrop: recentFb?.backdrop || recentFb?.poster || null,
        itemCount: group.itemCount,
        items: group.items,
      };
    });

  if (usable.length === 0) return fallbackStudios;

  const merged = [...usable];
  const seen = new Set(usable.map((s) => String(s.id).toLowerCase()));
  for (const fb of fallbackStudios) {
    if (seen.has(String(fb.id).toLowerCase())) continue;
    seen.add(String(fb.id).toLowerCase());
    merged.push(fb);
  }
  return merged;
}

export async function getVodStudioById(id: string) {
  if (!id) return null;
  return await safeFetch<any>(
    `/api/vod/studio?id=${encodeURIComponent(id)}`,
    null,
    true,
  );
}

// ─── React Query key factories ────────────────────────────────────────────────

export const mediaKeys = {
  home: () => ["media", "home"] as const,
  trendingMovies: (page: number) =>
    ["media", "movies", "trending", page] as const,
  trendingSeries: (page: number) =>
    ["media", "series", "trending", page] as const,
  movieFull: (tmdbId: number) => ["media", "movie", tmdbId] as const,
  seriesFull: (tmdbId: number) => ["media", "series", tmdbId] as const,
  moviesByGenre: (genreId: number, page: number) =>
    ["media", "movies", "genre", genreId, page] as const,
  seriesByGenre: (genreId: number, page: number) =>
    ["media", "series", "genre", genreId, page] as const,
  movieGenres: () => ["media", "movies", "genres"] as const,
  seriesGenres: () => ["media", "series", "genres"] as const,
  trailer: (tmdbId: number) => ["media", "trailer", tmdbId] as const,
  recommendations: (input: RecommendationInput) =>
    ["media", "recommendations", input] as const,
  similar: (tmdbId: number, type: string) =>
    ["media", "similar", tmdbId, type] as const,
  search: (query: string) => ["media", "search", query] as const,
  vodHome: () => ["media", "vod", "home"] as const,
  vodCatalog: (cursorYear: number | null) =>
    ["media", "vod", "catalog", cursorYear ?? "root"] as const,
  vodCollections: () => ["media", "vod", "collections"] as const,
  vodStudios: () => ["media", "vod", "studios"] as const,
  vodCollectionDetail: (id: string) =>
    ["media", "vod", "collection", id] as const,
  vodStudioDetail: (id: string) => ["media", "vod", "studio", id] as const,
} as const;
