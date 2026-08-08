/**
 * CineLog — media data layer.
 *
 * Talks to the CineLog media API, which holds the TMDB key server-side and
 * already caches upstream responses. A single tolerant set of parsers turns
 * those payloads into CineLog types.
 *
 * Setting `EXPO_PUBLIC_TMDB_API_KEY` switches the transport to TMDB directly,
 * which standalone builds shipped without a backend can use. The parsers accept
 * both shapes (camelCase with absolute image URLs, or raw snake_case TMDB), so
 * nothing else in the app changes between the two modes.
 */

import { ENV, hasDirectTmdbKey } from "@/constants/env";
import { apiData, apiJson } from "@/lib/http";
import { genreNames } from "@/lib/cinelog/genres";
import type {
  CastMember,
  CrewMember,
  Episode,
  MediaSummary,
  MediaType,
  Movie,
  MovieListKey,
  PagedResult,
  Person,
  PersonResult,
  SearchResults,
  Season,
  SeasonSummary,
  Series,
  SeriesListKey,
  TitleDetail,
  Trailer,
} from "@/lib/cinelog/types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/** Below this vote count a TMDB score isn't meaningful enough to rank on. */
const MIN_VOTES = 50;

/**
 * People search needs TMDB's `/search/person`, which the media API doesn't
 * expose, so the People tab only appears when the direct transport is enabled.
 */
export const supportsPeopleSearch = hasDirectTmdbKey;

type RawRecord = Record<string, unknown>;

// ── Transport ────────────────────────────────────────────────────────────────

async function tmdbDirect<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", ENV.tmdbApiKey);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ── Value coercion ───────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function image(value: unknown, size: string): string | null {
  const path = str(value);
  if (!path) return null;
  // The media API returns absolute URLs; TMDB returns "/abc.jpg".
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function yearFrom(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    const raw = str(candidate);
    if (!raw) continue;
    const parsed = parseInt(raw.slice(0, 4), 10);
    if (Number.isFinite(parsed) && parsed > 1800) return parsed;
  }
  return 0;
}

function toGenreIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "number") return entry;
      if (entry && typeof entry === "object" && "id" in entry) {
        return num((entry as RawRecord).id);
      }
      return 0;
    })
    .filter((id) => id > 0);
}

function toNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "name" in entry) {
        return str((entry as RawRecord).name);
      }
      return "";
    })
    .filter(Boolean);
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function inferType(raw: RawRecord, fallback?: MediaType): MediaType {
  const declared = str(raw.type || raw.media_type).toLowerCase();
  if (declared === "movie") return "movie";
  if (declared === "series" || declared === "tv") return "series";
  if (fallback) return fallback;
  return raw.title || raw.release_date ? "movie" : "series";
}

export function parseSummary(
  input: unknown,
  fallbackType?: MediaType,
): MediaSummary | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as RawRecord;

  const tmdbId = num(raw.tmdbId ?? raw.id);
  if (!tmdbId) return null;

  const type = inferType(raw, fallbackType);
  const title = str(
    raw.title || raw.name || raw.original_title || raw.original_name,
  );
  if (!title) return null;

  const genreIds = toGenreIds(raw.genreIds ?? raw.genre_ids ?? raw.genres);
  // The media API exposes genre names as `genre`; TMDB detail uses `genres`.
  const genreLabels = toNames(raw.genre ?? raw.genres);

  return {
    id: `${type}:${tmdbId}`,
    tmdbId,
    type,
    title,
    overview: str(raw.overview ?? raw.synopsis),
    poster: image(raw.poster ?? raw.poster_path, "w500"),
    backdrop: image(raw.backdrop ?? raw.backdrop_path, "w1280"),
    year: yearFrom(
      raw.year,
      raw.releaseDate,
      raw.release_date,
      raw.firstAirDate,
      raw.first_air_date,
    ),
    rating: Math.round(num(raw.rating ?? raw.vote_average) * 10) / 10,
    voteCount: num(raw.voteCount ?? raw.vote_count),
    genreIds,
    genres: genreLabels.length > 0 ? genreLabels : genreNames(genreIds),
    popularity: num(raw.popularity),
    releaseDate:
      str(
        raw.releaseDate ??
          raw.release_date ??
          raw.firstAirDate ??
          raw.first_air_date,
      ) || null,
  };
}

function parseSummaries(
  input: unknown,
  fallbackType?: MediaType,
): MediaSummary[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: MediaSummary[] = [];
  for (const entry of input) {
    const parsed = parseSummary(entry, fallbackType);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}

/**
 * Drop entries that would render as a broken card. Vote counts are only
 * enforced when the payload includes them, since the media API's list shape
 * omits them.
 */
function presentable(items: MediaSummary[], requireVotes = true): MediaSummary[] {
  return items.filter(
    (item) =>
      Boolean(item.poster) &&
      item.year > 0 &&
      item.rating > 0 &&
      (!requireVotes || item.voteCount === 0 || item.voteCount >= MIN_VOTES),
  );
}

function mergeUnique(...lists: MediaSummary[][]): MediaSummary[] {
  const seen = new Set<string>();
  const out: MediaSummary[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function parseCast(input: unknown): CastMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const raw = (entry ?? {}) as RawRecord;
      const roles = Array.isArray(raw.roles) ? (raw.roles as RawRecord[]) : [];
      return {
        id: num(raw.id),
        name: str(raw.name),
        character: str(raw.character || roles[0]?.character),
        photo: image(raw.photo ?? raw.profile_path, "w300"),
      };
    })
    .filter((member) => member.id > 0 && Boolean(member.name))
    .slice(0, 24);
}

function parseCrew(input: unknown): CrewMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const raw = (entry ?? {}) as RawRecord;
      return {
        id: num(raw.id),
        name: str(raw.name),
        job: str(raw.job),
        photo: image(raw.photo ?? raw.profile_path, "w300"),
      };
    })
    .filter((member) => member.id > 0 && Boolean(member.name));
}

function parseTrailers(input: unknown): Trailer[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const raw = (entry ?? {}) as RawRecord;
      const site = str(raw.site);
      // The media API only ever returns YouTube trailers, so it omits `site`.
      if (site && site.toLowerCase() !== "youtube") return null;
      const key = str(raw.key);
      if (!key) return null;
      return {
        key,
        name: str(raw.name),
        type: str(raw.type) || "Trailer",
        official: Boolean(raw.official),
      };
    })
    .filter((trailer): trailer is Trailer => trailer !== null)
    .sort((left, right) => {
      const rank = (trailer: Trailer) =>
        (trailer.type === "Trailer" ? 0 : trailer.type === "Teaser" ? 1 : 2) +
        (trailer.official ? 0 : 0.5);
      return rank(left) - rank(right);
    });
}

function parseSeasonSummaries(input: unknown): SeasonSummary[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const raw = (entry ?? {}) as RawRecord;
      const seasonNumber = num(raw.seasonNumber ?? raw.season_number);
      return {
        seasonNumber,
        name: str(raw.name) || `Season ${seasonNumber}`,
        episodeCount: num(raw.episodeCount ?? raw.episode_count),
        airDate: str(raw.airDate ?? raw.air_date) || null,
        poster: image(raw.poster ?? raw.poster_path, "w500"),
        overview: str(raw.overview),
      };
    })
    // Season 0 holds specials; the detail page lists real seasons only.
    .filter((season) => season.seasonNumber > 0)
    .sort((left, right) => left.seasonNumber - right.seasonNumber);
}

function parseEpisodes(input: unknown, seasonNumber: number): Episode[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const raw = (entry ?? {}) as RawRecord;
      const tmdbId = num(raw.id);
      const episodeNumber = num(
        raw.episodeNumber ?? raw.episode_number ?? raw.number,
      );
      return {
        id: String(tmdbId || `${seasonNumber}-${episodeNumber}`),
        tmdbId,
        seasonNumber: num(raw.seasonNumber ?? raw.season_number) || seasonNumber,
        episodeNumber,
        title: str(raw.title || raw.name) || `Episode ${episodeNumber}`,
        overview: str(raw.overview),
        still: image(raw.still ?? raw.still_path ?? raw.image, "w780"),
        runtime: num(raw.runtime ?? raw.durationMinutes),
        airDate: str(raw.airDate ?? raw.air_date) || null,
        rating: Math.round(num(raw.rating ?? raw.vote_average) * 10) / 10,
      };
    })
    .filter((episode) => episode.episodeNumber > 0)
    .sort((left, right) => left.episodeNumber - right.episodeNumber);
}

/** US age certification from a TMDB release-dates / content-ratings block. */
function parseCertification(raw: RawRecord): string | null {
  const direct = str(raw.certification);
  if (direct) return direct;

  const releaseDates = (raw.release_dates as RawRecord | undefined)?.results;
  if (Array.isArray(releaseDates)) {
    for (const entry of releaseDates as RawRecord[]) {
      if (str(entry.iso_3166_1) !== "US") continue;
      const dates = Array.isArray(entry.release_dates)
        ? (entry.release_dates as RawRecord[])
        : [];
      const found = dates.map((date) => str(date.certification)).find(Boolean);
      if (found) return found;
    }
  }

  const contentRatings = (raw.content_ratings as RawRecord | undefined)?.results;
  if (Array.isArray(contentRatings)) {
    for (const entry of contentRatings as RawRecord[]) {
      if (str(entry.iso_3166_1) !== "US") continue;
      const found = str(entry.rating);
      if (found) return found;
    }
  }

  return null;
}

function jobNames(crew: CrewMember[], ...jobs: string[]): string[] {
  return Array.from(
    new Set(
      crew.filter((member) => jobs.includes(member.job)).map((member) => member.name),
    ),
  );
}

function nested(raw: RawRecord, key: string): unknown {
  const value = raw[key];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return (value as RawRecord).results;
  return undefined;
}

function parseMovieDetail(input: unknown): TitleDetail<Movie> {
  const raw = (input ?? {}) as RawRecord;
  const summary = parseSummary(raw, "movie");
  if (!summary) throw new Error("Movie detail response was not usable.");

  const credits = (raw.credits as RawRecord | undefined) ?? {};
  const cast = parseCast(raw.cast ?? credits.cast);
  const crew = parseCrew(raw.crew ?? credits.crew);

  const movie: Movie = {
    ...summary,
    type: "movie",
    runtime: num(raw.runtime),
    tagline: str(raw.tagline) || null,
    status: str(raw.status) || null,
    certification: parseCertification(raw),
    imdbId: str(raw.imdbId ?? raw.imdb_id) || null,
    directors: jobNames(crew, "Director"),
    writers: jobNames(crew, "Writer", "Screenplay"),
  };

  return {
    title: movie,
    cast,
    crew,
    trailers: parseTrailers(raw.trailers ?? nested(raw, "videos")),
    similar: presentable(parseSummaries(nested(raw, "similar"), "movie"), false),
    recommendations: presentable(
      parseSummaries(nested(raw, "recommendations"), "movie"),
      false,
    ),
  };
}

function parseSeriesDetail(input: unknown): TitleDetail<Series> {
  const raw = (input ?? {}) as RawRecord;
  const summary = parseSummary(raw, "series");
  if (!summary) throw new Error("Series detail response was not usable.");

  const aggregate = (raw.aggregate_credits as RawRecord | undefined) ?? {};
  const credits = (raw.credits as RawRecord | undefined) ?? {};
  const cast = parseCast(raw.cast ?? aggregate.cast ?? credits.cast);
  const crew = parseCrew(raw.crew ?? credits.crew);
  const runtimes = Array.isArray(raw.episode_run_time)
    ? (raw.episode_run_time as unknown[])
    : [];

  const series: Series = {
    ...summary,
    type: "series",
    seasonCount: num(raw.seasonCount ?? raw.number_of_seasons),
    episodeCount: num(raw.episodeCount ?? raw.number_of_episodes),
    status: str(raw.status) || null,
    certification: parseCertification(raw),
    networks: toNames(raw.networks),
    creators: toNames(raw.created_by),
    episodeRuntime: num(raw.episodeRuntime) || num(runtimes[0]),
    lastAirDate: str(raw.lastAirDate ?? raw.last_air_date) || null,
    seasons: parseSeasonSummaries(raw.seasons),
  };

  return {
    title: series,
    cast,
    crew,
    trailers: parseTrailers(raw.trailers ?? nested(raw, "videos")),
    similar: presentable(parseSummaries(nested(raw, "similar"), "series"), false),
    recommendations: presentable(
      parseSummaries(nested(raw, "recommendations"), "series"),
      false,
    ),
  };
}

function parsePersonResult(input: unknown): PersonResult | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as RawRecord;
  const id = num(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    photo: image(raw.photo ?? raw.profile_path, "w300"),
    knownForDepartment:
      str(raw.knownForDepartment ?? raw.known_for_department) || null,
    knownForTitles: (Array.isArray(raw.known_for)
      ? (raw.known_for as RawRecord[]).map((entry) =>
          str(entry.title || entry.name),
        )
      : []
    )
      .filter(Boolean)
      .slice(0, 3),
  };
}

// ── Curated collections ──────────────────────────────────────────────────────

/**
 * Both the media API and TMDB expose curated collections as fixed first pages.
 * The API bundles all of a media type's collections into one cached response, so
 * the whole home screen costs two requests.
 */
export interface MovieCollections {
  trending: MediaSummary[];
  popular: MediaSummary[];
  now_playing: MediaSummary[];
  top_rated: MediaSummary[];
  upcoming: MediaSummary[];
}

export interface SeriesCollections {
  trending: MediaSummary[];
  popular: MediaSummary[];
  airing_now: MediaSummary[];
  top_rated: MediaSummary[];
  new_series: MediaSummary[];
}

function assertNonEmpty<T extends Record<string, MediaSummary[]>>(bundle: T): T {
  const total = Object.values(bundle).reduce((sum, list) => sum + list.length, 0);
  if (total === 0) {
    throw new Error("The media API returned no titles.");
  }
  return bundle;
}

export async function fetchMovieCollections(): Promise<MovieCollections> {
  if (hasDirectTmdbKey) {
    const [trending, popular, nowPlaying, topRated, upcoming] = await Promise.all([
      tmdbDirect<RawRecord>("/trending/movie/week"),
      tmdbDirect<RawRecord>("/movie/popular"),
      tmdbDirect<RawRecord>("/movie/now_playing"),
      tmdbDirect<RawRecord>("/movie/top_rated"),
      tmdbDirect<RawRecord>("/movie/upcoming"),
    ]);
    return assertNonEmpty({
      trending: presentable(parseSummaries(trending.results, "movie")),
      popular: presentable(parseSummaries(popular.results, "movie")),
      now_playing: presentable(parseSummaries(nowPlaying.results, "movie")),
      top_rated: presentable(parseSummaries(topRated.results, "movie")),
      upcoming: presentable(parseSummaries(upcoming.results, "movie"), false),
    });
  }

  const data = await apiJson<RawRecord>("/api/movies/trending");
  return assertNonEmpty({
    trending: presentable(parseSummaries(data.trending, "movie")),
    popular: presentable(parseSummaries(data.popular, "movie")),
    now_playing: presentable(parseSummaries(data.newReleases, "movie")),
    // `acclaimed` is TMDB discover filtered to 8+ ratings with 1000+ votes,
    // which extends the curated top-rated page without diluting it.
    top_rated: mergeUnique(
      presentable(parseSummaries(data.topRated, "movie")),
      presentable(parseSummaries(data.acclaimed, "movie")),
    ),
    upcoming: presentable(parseSummaries(data.upcoming, "movie"), false),
  });
}

export async function fetchSeriesCollections(): Promise<SeriesCollections> {
  if (hasDirectTmdbKey) {
    const [trending, popular, onAir, topRated, newSeries] = await Promise.all([
      tmdbDirect<RawRecord>("/trending/tv/week"),
      tmdbDirect<RawRecord>("/tv/popular"),
      tmdbDirect<RawRecord>("/tv/on_the_air"),
      tmdbDirect<RawRecord>("/tv/top_rated"),
      tmdbDirect<RawRecord>("/discover/tv", {
        sort_by: "first_air_date.desc",
        "vote_count.gte": 10,
      }),
    ]);
    return assertNonEmpty({
      trending: presentable(parseSummaries(trending.results, "series")),
      popular: presentable(parseSummaries(popular.results, "series")),
      airing_now: presentable(parseSummaries(onAir.results, "series")),
      top_rated: presentable(parseSummaries(topRated.results, "series")),
      new_series: presentable(parseSummaries(newSeries.results, "series")),
    });
  }

  const data = await apiJson<RawRecord>("/api/series/trending");
  return assertNonEmpty({
    trending: presentable(parseSummaries(data.trending, "series")),
    popular: presentable(parseSummaries(data.popular, "series")),
    airing_now: presentable(parseSummaries(data.newReleases, "series")),
    top_rated: mergeUnique(
      presentable(parseSummaries(data.topRated, "series")),
      presentable(parseSummaries(data.hiddenGems, "series")),
    ),
    new_series: presentable(parseSummaries(data.airingToday, "series")),
  });
}

// ── Paginated browse ─────────────────────────────────────────────────────────

/**
 * Browse filters that can keep loading pages. The remaining filters are curated
 * fixed-size collections, which the hooks serve from the bundles above.
 */
export const PAGINATED_MOVIE_LISTS: Partial<Record<MovieListKey, string>> = {
  popular: "popularity.desc",
};

export const PAGINATED_SERIES_LISTS: Partial<Record<SeriesListKey, string>> = {
  popular: "popularity.desc",
  new_series: "first_air_date.desc",
};

function parseItemsPage(
  input: unknown,
  fallbackType: MediaType,
  requireVotes = true,
): PagedResult<MediaSummary> {
  const raw = (input ?? {}) as RawRecord;
  const results = presentable(
    parseSummaries(raw.items ?? raw.results, fallbackType),
    requireVotes,
  );
  return {
    page: num(raw.page) || 1,
    totalPages: num(raw.totalPages ?? raw.total_pages) || 1,
    totalResults: num(raw.totalResults ?? raw.total_results) || results.length,
    results,
  };
}

export async function fetchMoviePage(
  sortBy: string,
  page: number,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>("/discover/movie", {
      sort_by: sortBy,
      "vote_count.gte": MIN_VOTES,
      page,
    });
    return parseItemsPage(data, "movie");
  }
  const data = await apiJson<RawRecord>(
    `/api/movies/all${query({ sort_by: sortBy, page })}`,
  );
  return parseItemsPage(data, "movie");
}

export async function fetchSeriesPage(
  sortBy: string,
  page: number,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>("/discover/tv", {
      sort_by: sortBy,
      "vote_count.gte": MIN_VOTES,
      page,
    });
    return parseItemsPage(data, "series");
  }
  const data = await apiJson<RawRecord>(
    `/api/series/all${query({ sort_by: sortBy, page })}`,
  );
  return parseItemsPage(data, "series");
}

export async function fetchMoviesByGenre(
  genreId: number,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>("/discover/movie", {
      with_genres: genreId,
      sort_by: "popularity.desc",
      "vote_count.gte": MIN_VOTES,
      page,
    });
    return parseItemsPage(data, "movie");
  }
  const data = await apiData<RawRecord>(
    `/api/media/movies${query({ genre: genreId, page, sort: "popularity.desc" })}`,
  );
  return parseItemsPage(data, "movie");
}

export async function fetchSeriesByGenre(
  genreId: number,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>("/discover/tv", {
      with_genres: genreId,
      sort_by: "popularity.desc",
      "vote_count.gte": MIN_VOTES,
      page,
    });
    return parseItemsPage(data, "series");
  }
  const data = await apiData<RawRecord>(
    `/api/media/series${query({ genre: genreId, page, sort: "popularity.desc" })}`,
  );
  return parseItemsPage(data, "series");
}

// ── Detail ───────────────────────────────────────────────────────────────────

export async function fetchMovieDetail(
  tmdbId: number,
): Promise<TitleDetail<Movie>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>(`/movie/${tmdbId}`, {
      append_to_response: "credits,videos,recommendations,similar,release_dates",
    });
    return parseMovieDetail(data);
  }
  const data = await apiData<RawRecord>(`/api/media/movie/${tmdbId}`);
  return parseMovieDetail(data);
}

export async function fetchSeriesDetail(
  tmdbId: number,
): Promise<TitleDetail<Series>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>(`/tv/${tmdbId}`, {
      append_to_response:
        "aggregate_credits,videos,recommendations,similar,content_ratings",
    });
    return parseSeriesDetail(data);
  }
  const data = await apiData<RawRecord>(`/api/media/series/${tmdbId}`);
  return parseSeriesDetail(data);
}

export async function fetchSeason(
  seriesId: number,
  seasonNumber: number,
): Promise<Season> {
  const build = (raw: RawRecord): Season => ({
    seasonNumber,
    name: str(raw.name) || `Season ${seasonNumber}`,
    overview: str(raw.overview),
    airDate: str(raw.airDate ?? raw.air_date) || null,
    poster: image(raw.poster ?? raw.poster_path, "w500"),
    episodeCount: num(raw.episodeCount ?? raw.episode_count),
    episodes: parseEpisodes(raw.episodes, seasonNumber),
  });

  if (hasDirectTmdbKey) {
    return build(
      await tmdbDirect<RawRecord>(`/tv/${seriesId}/season/${seasonNumber}`),
    );
  }
  return build(
    await apiJson<RawRecord>(`/api/series/${seriesId}/season/${seasonNumber}`),
  );
}

// ── Search ───────────────────────────────────────────────────────────────────

export async function searchMedia(
  queryText: string,
  page = 1,
): Promise<SearchResults> {
  const trimmed = queryText.trim();
  if (trimmed.length < 2) return { movies: [], series: [], people: [] };

  const byPopularity = (left: MediaSummary, right: MediaSummary) =>
    right.popularity - left.popularity;

  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<{ results?: unknown[] }>("/search/multi", {
      query: trimmed,
      page,
    });
    const movies: MediaSummary[] = [];
    const series: MediaSummary[] = [];
    const people: PersonResult[] = [];
    for (const entry of data.results ?? []) {
      const raw = (entry ?? {}) as RawRecord;
      if (str(raw.media_type) === "person") {
        const person = parsePersonResult(raw);
        if (person) people.push(person);
        continue;
      }
      const summary = parseSummary(raw);
      if (!summary?.poster) continue;
      if (summary.type === "movie") movies.push(summary);
      else series.push(summary);
    }
    return {
      movies: movies.sort(byPopularity),
      series: series.sort(byPopularity),
      people,
    };
  }

  const data = await apiData<RawRecord>(
    `/api/media/search${query({ q: trimmed, type: "all", page })}`,
  );
  const all = parseSummaries(data.results);
  return {
    movies: all.filter((item) => item.type === "movie" && item.poster).sort(byPopularity),
    series: all.filter((item) => item.type === "series" && item.poster).sort(byPopularity),
    people: [],
  };
}

export async function fetchPerson(personId: number): Promise<Person> {
  const build = (raw: RawRecord, knownFor: MediaSummary[]): Person => ({
    id: num(raw.id),
    name: str(raw.name),
    biography: str(raw.biography),
    birthday: str(raw.birthday) || null,
    deathday: str(raw.deathday) || null,
    placeOfBirth: str(raw.placeOfBirth ?? raw.place_of_birth) || null,
    knownForDepartment:
      str(raw.knownForDepartment ?? raw.known_for_department) || null,
    photo: image(raw.photo ?? raw.profile ?? raw.profile_path, "w500"),
    knownFor,
  });

  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>(`/person/${personId}`, {
      append_to_response: "combined_credits",
    });
    const credits = (data.combined_credits as RawRecord | undefined)?.cast;
    const knownFor = presentable(
      parseSummaries(Array.isArray(credits) ? credits : []),
      false,
    )
      .sort((left, right) => right.popularity - left.popularity)
      .slice(0, 18);
    return build(data, knownFor);
  }

  const data = await apiData<RawRecord>(`/api/media/person/${personId}`);
  return build(data, presentable(parseSummaries(data.knownFor), false));
}

/** Preferred trailer for a title, or `null` when none is published. */
export async function fetchPrimaryTrailer(
  type: MediaType,
  tmdbId: number,
): Promise<Trailer | null> {
  if (hasDirectTmdbKey) {
    const path =
      type === "movie" ? `/movie/${tmdbId}/videos` : `/tv/${tmdbId}/videos`;
    const data = await tmdbDirect<{ results?: unknown[] }>(path);
    return parseTrailers(data.results ?? [])[0] ?? null;
  }
  const apiType = type === "movie" ? "movie" : "tv";
  const data = await apiData<RawRecord | null>(
    `/api/media/trailer/${apiType}/${tmdbId}`,
  );
  return data ? (parseTrailers([data])[0] ?? null) : null;
}

export { MIN_VOTES };
