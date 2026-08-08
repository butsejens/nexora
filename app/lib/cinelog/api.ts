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
import { genreIdsFromNames, genreNames } from "@/lib/cinelog/genres";
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

  // The media API exposes genre names as `genre` on list items and as `genres`
  // on detail responses, where the numeric IDs are dropped — so names are mapped
  // back to IDs to keep the taste profile working.
  const genreLabels = toNames(raw.genre ?? raw.genres);
  const declaredIds = toGenreIds(raw.genreIds ?? raw.genre_ids ?? raw.genres);
  const genreIds =
    declaredIds.length > 0 ? declaredIds : genreIdsFromNames(genreLabels);

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

// ── Browse collections ───────────────────────────────────────────────────────

/**
 * How each browse filter is expressed against the media API.
 *
 * The API's discover route accepts a page, a sort and an optional release-year
 * window, which covers every filter except trending. It cannot apply a vote
 * floor, so "Top Rated" sorts by vote count — the films and shows with the most
 * votes — and reorders each page by score. That surfaces the recognised classics
 * instead of the obscure single-vote 10/10 entries a raw `vote_average.desc`
 * returns.
 */
interface ListSpec {
  /** Read TMDB's trending feed instead of discover (a single fixed page). */
  trending?: "movie" | "tv";
  sort?: string;
  /** Release-year window, resolved at call time so it follows the calendar. */
  years?: () => { from: number; to: number };
  /** Reorder each page by score, for the vote-count-driven Top Rated filter. */
  resortByRating?: boolean;
  /** Keep unreleased titles that have no score yet (used by Upcoming). */
  allowUnrated?: boolean;
  /** Keep only titles first released within this many months. */
  withinMonths?: number;
  /** Endpoint used when the direct TMDB transport is enabled. */
  direct: { path: string; params?: Record<string, string | number> };
}

const currentYear = () => new Date().getFullYear();

const MOVIE_LISTS: Record<MovieListKey, ListSpec> = {
  popular: {
    sort: "popularity.desc",
    direct: { path: "/movie/popular" },
  },
  trending: {
    trending: "movie",
    direct: { path: "/trending/movie/week" },
  },
  top_rated: {
    sort: "vote_count.desc",
    resortByRating: true,
    direct: { path: "/movie/top_rated" },
  },
  now_playing: {
    sort: "popularity.desc",
    years: () => ({ from: currentYear(), to: currentYear() }),
    direct: { path: "/movie/now_playing" },
  },
  upcoming: {
    sort: "popularity.desc",
    years: () => ({ from: currentYear() + 1, to: currentYear() + 2 }),
    allowUnrated: true,
    direct: { path: "/movie/upcoming" },
  },
};

const SERIES_LISTS: Record<SeriesListKey, ListSpec> = {
  popular: {
    sort: "popularity.desc",
    direct: { path: "/tv/popular" },
  },
  trending: {
    trending: "tv",
    direct: { path: "/trending/tv/week" },
  },
  top_rated: {
    sort: "vote_count.desc",
    resortByRating: true,
    direct: { path: "/tv/top_rated" },
  },
  new_series: {
    // The series discover route takes no date window, so recency is applied to
    // the popularity-ranked pages, where new shows already rank high.
    sort: "popularity.desc",
    withinMonths: 18,
    direct: {
      path: "/discover/tv",
      params: { sort_by: "first_air_date.desc", "vote_count.gte": 20 },
    },
  },
};

/** Filters that keep loading pages; trending is a single fixed page. */
export function canPaginate(spec: ListSpec): boolean {
  return !spec.trending;
}

export const MOVIE_LIST_SPECS = MOVIE_LISTS;
export const SERIES_LIST_SPECS = SERIES_LISTS;

function withinMonths(items: MediaSummary[], months: number): MediaSummary[] {
  const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    if (!item.releaseDate) return false;
    const released = Date.parse(item.releaseDate);
    return Number.isFinite(released) && released >= cutoff && released <= Date.now();
  });
}

function parseItemsPage(
  input: unknown,
  fallbackType: MediaType,
  spec?: ListSpec,
): PagedResult<MediaSummary> {
  const raw = (input ?? {}) as RawRecord;
  let results = presentable(
    parseSummaries(raw.items ?? raw.results, fallbackType),
    !spec?.allowUnrated,
  );
  if (spec?.withinMonths) results = withinMonths(results, spec.withinMonths);
  if (spec?.resortByRating) {
    results = [...results].sort((left, right) => right.rating - left.rating);
  }
  return {
    page: num(raw.page) || 1,
    totalPages: num(raw.totalPages ?? raw.total_pages) || 1,
    totalResults: num(raw.totalResults ?? raw.total_results) || results.length,
    results,
  };
}

async function fetchList(
  kind: "movies" | "series",
  spec: ListSpec,
  page: number,
): Promise<PagedResult<MediaSummary>> {
  const type: MediaType = kind === "movies" ? "movie" : "series";

  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>(spec.direct.path, {
      page,
      ...(spec.direct.params ?? {}),
    });
    return parseItemsPage(data, type, spec);
  }

  if (spec.trending) {
    const data = await apiData<RawRecord>(
      `/api/media/trending${query({ type: spec.trending, window: "week" })}`,
    );
    return parseItemsPage({ ...data, page: 1, total_pages: 1 }, type, spec);
  }

  const years = spec.years?.();
  const data = await apiData<RawRecord>(
    `/api/media/${kind}${query({
      page,
      sort: spec.sort,
      from_year: years?.from,
      to_year: years?.to,
    })}`,
  );
  return parseItemsPage(data, type, spec);
}

export function fetchMovieList(
  list: MovieListKey,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  return fetchList("movies", MOVIE_LISTS[list], page);
}

export function fetchSeriesList(
  list: SeriesListKey,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  return fetchList("series", SERIES_LISTS[list], page);
}

/** Mixed movie + series trending feed, used by the home hero and top rail. */
export async function fetchTrending(): Promise<MediaSummary[]> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<RawRecord>("/trending/all/week");
    return presentable(parseSummaries(data.results));
  }
  const data = await apiData<RawRecord>(
    "/api/media/trending?type=all&window=week",
  );
  return presentable(parseSummaries(data.results));
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
