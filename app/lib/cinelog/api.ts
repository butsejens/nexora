/**
 * CineLog — media data layer.
 *
 * Two transports, one set of normalizers:
 *
 *  1. CineLog API (default) — `/api/media/*`, which keeps `TMDB_API_KEY` on the
 *     server, adds shared caching and never exposes a key to the client.
 *  2. Direct TMDB — used only when `EXPO_PUBLIC_TMDB_API_KEY` is set, which
 *     removes a network hop for standalone builds shipped without a backend.
 *
 * The parsers below accept both the CineLog envelope shape (camelCase, absolute
 * image URLs) and raw TMDB shapes (snake_case, bare image paths), so switching
 * transport needs no changes anywhere else in the app.
 */

import { ENV, hasDirectTmdbKey } from "@/constants/env";
import { apiData } from "@/lib/http";
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

/** Minimum TMDB votes required before a title is considered list-worthy. */
const MIN_VOTES = 50;

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
  // CineLog API returns absolute URLs; TMDB returns "/abc.jpg".
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

function toGenreLabels(value: unknown, ids: number[]): string[] {
  if (Array.isArray(value)) {
    const names = value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "name" in entry) {
          return str((entry as RawRecord).name);
        }
        return "";
      })
      .filter(Boolean);
    if (names.length > 0) return names;
  }
  return genreNames(ids);
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
  const title = str(raw.title || raw.name || raw.original_title || raw.original_name);
  if (!title) return null;

  const genreIds = toGenreIds(raw.genreIds ?? raw.genre_ids ?? raw.genres);

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
    genres: toGenreLabels(raw.genres, genreIds),
    popularity: num(raw.popularity),
    releaseDate:
      str(raw.releaseDate ?? raw.release_date ?? raw.firstAirDate ?? raw.first_air_date) ||
      null,
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

/** Drop entries without artwork or with too few votes to be meaningful. */
function presentable(items: MediaSummary[], requireVotes = true): MediaSummary[] {
  return items.filter(
    (item) =>
      Boolean(item.poster) &&
      item.year > 0 &&
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
      // CineLog API only ever returns YouTube trailers, so a missing site is fine.
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
    .sort((a, b) => {
      const rank = (t: Trailer) =>
        (t.type === "Trailer" ? 0 : t.type === "Teaser" ? 1 : 2) +
        (t.official ? 0 : 0.5);
      return rank(a) - rank(b);
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
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

function parseEpisodes(input: unknown, seasonNumber: number): Episode[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const raw = (entry ?? {}) as RawRecord;
      const tmdbId = num(raw.id);
      const episodeNumber = num(raw.episodeNumber ?? raw.episode_number);
      return {
        id: `${tmdbId || `${seasonNumber}-${episodeNumber}`}`,
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
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

/** Pick the US age certification from a TMDB release-dates/content-ratings block. */
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
      const found = dates.map((d) => str(d.certification)).find(Boolean);
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

function jobNames(crew: CrewMember[], job: string): string[] {
  return Array.from(
    new Set(crew.filter((member) => member.job === job).map((m) => m.name)),
  );
}

function parseMovieDetail(input: unknown): TitleDetail<Movie> {
  const raw = (input ?? {}) as RawRecord;
  const summary = parseSummary(raw, "movie");
  if (!summary) throw new Error("Movie detail response was not usable.");

  const credits = (raw.credits as RawRecord | undefined) ?? {};
  const cast = parseCast(raw.cast ?? credits.cast);
  const crew = parseCrew(raw.crew ?? credits.crew);
  const videos = (raw.videos as RawRecord | undefined)?.results;

  const movie: Movie = {
    ...summary,
    type: "movie",
    runtime: num(raw.runtime),
    tagline: str(raw.tagline) || null,
    status: str(raw.status) || null,
    certification: parseCertification(raw),
    imdbId: str(raw.imdbId ?? raw.imdb_id) || null,
    directors: jobNames(crew, "Director"),
    writers: [...jobNames(crew, "Writer"), ...jobNames(crew, "Screenplay")],
  };

  return {
    title: movie,
    cast,
    crew,
    trailers: parseTrailers(raw.trailers ?? videos),
    similar: presentable(
      parseSummaries(
        raw.similar ?? (raw.similar as RawRecord | undefined)?.results,
        "movie",
      ),
      false,
    ),
    recommendations: presentable(
      parseSummaries(
        raw.recommendations ??
          (raw.recommendations as RawRecord | undefined)?.results,
        "movie",
      ),
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
  const videos = (raw.videos as RawRecord | undefined)?.results;
  const runtimes = Array.isArray(raw.episode_run_time)
    ? (raw.episode_run_time as number[])
    : [];

  const series: Series = {
    ...summary,
    type: "series",
    seasonCount: num(raw.seasonCount ?? raw.number_of_seasons),
    episodeCount: num(raw.episodeCount ?? raw.number_of_episodes),
    status: str(raw.status) || null,
    certification: parseCertification(raw),
    networks: toGenreLabels(raw.networks, []),
    creators: Array.isArray(raw.created_by)
      ? (raw.created_by as RawRecord[]).map((c) => str(c.name)).filter(Boolean)
      : jobNames(crew, "Creator"),
    episodeRuntime: num(raw.episodeRuntime) || num(runtimes[0]),
    lastAirDate: str(raw.lastAirDate ?? raw.last_air_date) || null,
    seasons: parseSeasonSummaries(raw.seasons),
  };

  return {
    title: series,
    cast,
    crew,
    trailers: parseTrailers(raw.trailers ?? videos),
    similar: presentable(
      parseSummaries(
        raw.similar ?? (raw.similar as RawRecord | undefined)?.results,
        "series",
      ),
      false,
    ),
    recommendations: presentable(
      parseSummaries(
        raw.recommendations ??
          (raw.recommendations as RawRecord | undefined)?.results,
        "series",
      ),
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
  const knownFor = Array.isArray(raw.knownForTitles)
    ? (raw.knownForTitles as unknown[]).map(str).filter(Boolean)
    : Array.isArray(raw.known_for)
      ? (raw.known_for as RawRecord[])
          .map((entry) => str(entry.title || entry.name))
          .filter(Boolean)
      : [];
  return {
    id,
    name,
    photo: image(raw.photo ?? raw.profile_path, "w300"),
    knownForDepartment:
      str(raw.knownForDepartment ?? raw.known_for_department) || null,
    knownForTitles: knownFor.slice(0, 3),
  };
}

function parsePaged(
  input: unknown,
  fallbackType?: MediaType,
): PagedResult<MediaSummary> {
  const raw = (input ?? {}) as RawRecord;
  return {
    page: num(raw.page) || 1,
    totalPages: num(raw.totalPages ?? raw.total_pages) || 1,
    totalResults: num(raw.totalResults ?? raw.total_results),
    results: presentable(parseSummaries(raw.results, fallbackType)),
  };
}

// ── Curated list definitions for the direct-TMDB transport ───────────────────

const DIRECT_MOVIE_LISTS: Record<MovieListKey, string> = {
  popular: "/movie/popular",
  trending: "/trending/movie/week",
  top_rated: "/movie/top_rated",
  now_playing: "/movie/now_playing",
  upcoming: "/movie/upcoming",
};

const DIRECT_SERIES_LISTS: Record<SeriesListKey, string> = {
  popular: "/tv/popular",
  trending: "/trending/tv/week",
  top_rated: "/tv/top_rated",
  airing_now: "/tv/on_the_air",
  new_series: "/discover/tv",
};

function directNewSeriesParams(page: number) {
  const from = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return {
    page,
    sort_by: "popularity.desc",
    "first_air_date.gte": from,
    "vote_count.gte": 10,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchMovieList(
  list: MovieListKey,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect(DIRECT_MOVIE_LISTS[list], { page });
    return parsePaged(data, "movie");
  }
  const data = await apiData(`/api/media/movies${query({ list, page })}`);
  return parsePaged(data, "movie");
}

export async function fetchSeriesList(
  list: SeriesListKey,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const params =
      list === "new_series" ? directNewSeriesParams(page) : { page };
    const data = await tmdbDirect(DIRECT_SERIES_LISTS[list], params);
    return parsePaged(data, "series");
  }
  const data = await apiData(`/api/media/series${query({ list, page })}`);
  return parsePaged(data, "series");
}

export async function fetchMoviesByGenre(
  genreId: number,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect("/discover/movie", {
      with_genres: genreId,
      sort_by: "popularity.desc",
      "vote_count.gte": MIN_VOTES,
      page,
    });
    return parsePaged(data, "movie");
  }
  const data = await apiData(
    `/api/media/movies${query({ genre: genreId, page, min_votes: MIN_VOTES })}`,
  );
  return parsePaged(data, "movie");
}

export async function fetchSeriesByGenre(
  genreId: number,
  page = 1,
): Promise<PagedResult<MediaSummary>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect("/discover/tv", {
      with_genres: genreId,
      sort_by: "popularity.desc",
      "vote_count.gte": MIN_VOTES,
      page,
    });
    return parsePaged(data, "series");
  }
  const data = await apiData(
    `/api/media/series${query({ genre: genreId, page, min_votes: MIN_VOTES })}`,
  );
  return parsePaged(data, "series");
}

/** Mixed movie + series trending feed used for the home hero and top rail. */
export async function fetchTrending(): Promise<MediaSummary[]> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<{ results: unknown[] }>("/trending/all/week");
    return presentable(parseSummaries(data.results));
  }
  const data = await apiData<{ results: unknown[] }>(
    "/api/media/trending?type=all&window=week",
  );
  return presentable(parseSummaries(data.results));
}

export async function fetchMovieDetail(
  tmdbId: number,
): Promise<TitleDetail<Movie>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect(`/movie/${tmdbId}`, {
      append_to_response:
        "credits,videos,recommendations,similar,release_dates",
    });
    return parseMovieDetail(data);
  }
  const data = await apiData(`/api/media/movie/${tmdbId}`);
  return parseMovieDetail(data);
}

export async function fetchSeriesDetail(
  tmdbId: number,
): Promise<TitleDetail<Series>> {
  if (hasDirectTmdbKey) {
    const data = await tmdbDirect(`/tv/${tmdbId}`, {
      append_to_response:
        "aggregate_credits,videos,recommendations,similar,content_ratings",
    });
    return parseSeriesDetail(data);
  }
  const data = await apiData(`/api/media/series/${tmdbId}`);
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
    const data = await tmdbDirect<RawRecord>(
      `/tv/${seriesId}/season/${seasonNumber}`,
    );
    return build(data);
  }
  const data = await apiData<RawRecord>(
    `/api/media/series/${seriesId}/season/${seasonNumber}`,
  );
  return build(data);
}

export async function searchMedia(
  queryText: string,
  page = 1,
): Promise<SearchResults> {
  const trimmed = queryText.trim();
  if (trimmed.length < 2) return { movies: [], series: [], people: [] };

  const collect = (results: unknown[]): SearchResults => {
    const movies: MediaSummary[] = [];
    const series: MediaSummary[] = [];
    const people: PersonResult[] = [];
    for (const entry of results) {
      const raw = (entry ?? {}) as RawRecord;
      const kind = str(raw.type || raw.media_type).toLowerCase();
      if (kind === "person") {
        const person = parsePersonResult(raw);
        if (person) people.push(person);
        continue;
      }
      const summary = parseSummary(raw);
      if (!summary || !summary.poster) continue;
      if (summary.type === "movie") movies.push(summary);
      else series.push(summary);
    }
    const byPopularity = (a: MediaSummary, b: MediaSummary) =>
      b.popularity - a.popularity;
    return {
      movies: movies.sort(byPopularity),
      series: series.sort(byPopularity),
      people,
    };
  };

  if (hasDirectTmdbKey) {
    const data = await tmdbDirect<{ results: unknown[] }>("/search/multi", {
      query: trimmed,
      page,
    });
    return collect(data.results ?? []);
  }
  const data = await apiData<{ results: unknown[] }>(
    `/api/media/search${query({ q: trimmed, type: "all", page })}`,
  );
  return collect(data.results ?? []);
}

export async function fetchPerson(personId: number): Promise<Person> {
  const build = (raw: RawRecord): Person => ({
    id: num(raw.id),
    name: str(raw.name),
    biography: str(raw.biography),
    birthday: str(raw.birthday) || null,
    deathday: str(raw.deathday) || null,
    placeOfBirth: str(raw.placeOfBirth ?? raw.place_of_birth) || null,
    knownForDepartment:
      str(raw.knownForDepartment ?? raw.known_for_department) || null,
    photo: image(raw.photo ?? raw.profile ?? raw.profile_path, "w500"),
    knownFor: presentable(parseSummaries(raw.knownFor), false),
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
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 18);
    return { ...build(data), knownFor };
  }
  const data = await apiData<RawRecord>(`/api/media/person/${personId}`);
  return build(data);
}

/** Preferred trailer for a title, or `null` when none is published. */
export async function fetchPrimaryTrailer(
  type: MediaType,
  tmdbId: number,
): Promise<Trailer | null> {
  if (hasDirectTmdbKey) {
    const path = type === "movie" ? `/movie/${tmdbId}/videos` : `/tv/${tmdbId}/videos`;
    const data = await tmdbDirect<{ results: unknown[] }>(path);
    return parseTrailers(data.results)[0] ?? null;
  }
  const apiType = type === "movie" ? "movie" : "tv";
  const data = await apiData<RawRecord | null>(
    `/api/media/trailer/${apiType}/${tmdbId}`,
  );
  if (!data) return null;
  return parseTrailers([data])[0] ?? null;
}

export { MIN_VOTES };
