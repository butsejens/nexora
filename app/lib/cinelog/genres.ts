/**
 * CineLog — genre catalogue.
 *
 * TMDB uses different genre IDs for movies and series (e.g. Sci-Fi is 878 for
 * films but 10765 for shows), so each CineLog genre carries both mappings.
 */

export interface GenreDefinition {
  /** Stable slug used in URLs. */
  slug: string;
  label: string;
  movieId?: number;
  seriesId?: number;
}

export const GENRES: GenreDefinition[] = [
  { slug: "action", label: "Action", movieId: 28, seriesId: 10759 },
  { slug: "adventure", label: "Adventure", movieId: 12, seriesId: 10759 },
  { slug: "animation", label: "Animation", movieId: 16, seriesId: 16 },
  { slug: "comedy", label: "Comedy", movieId: 35, seriesId: 35 },
  { slug: "crime", label: "Crime", movieId: 80, seriesId: 80 },
  { slug: "documentary", label: "Documentary", movieId: 99, seriesId: 99 },
  { slug: "drama", label: "Drama", movieId: 18, seriesId: 18 },
  { slug: "fantasy", label: "Fantasy", movieId: 14, seriesId: 10765 },
  { slug: "horror", label: "Horror", movieId: 27 },
  { slug: "mystery", label: "Mystery", movieId: 9648, seriesId: 9648 },
  { slug: "romance", label: "Romance", movieId: 10749 },
  { slug: "sci-fi", label: "Sci-Fi", movieId: 878, seriesId: 10765 },
  { slug: "thriller", label: "Thriller", movieId: 53 },
];

/** TMDB genre ID → display name, covering both movie and series catalogues. */
export const GENRE_NAMES: Record<number, string> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  37: "Western",
  53: "Thriller",
  80: "Crime",
  99: "Documentary",
  878: "Sci-Fi",
  9648: "Mystery",
  10402: "Music",
  10749: "Romance",
  10751: "Family",
  10752: "War",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  10770: "TV Movie",
};

export function genreName(id: number): string {
  return GENRE_NAMES[id] ?? "";
}

export function genreNames(ids: number[] | undefined): string[] {
  return (ids ?? []).map(genreName).filter(Boolean);
}

export function findGenre(slug: string): GenreDefinition | undefined {
  return GENRES.find((genre) => genre.slug === slug);
}

/** Resolve the TMDB genre ID to use for a given media type. */
export function genreIdFor(
  genre: GenreDefinition,
  type: "movie" | "series",
): number | undefined {
  return type === "movie" ? genre.movieId : genre.seriesId;
}

/**
 * Genres that pair well with a given genre, used to widen recommendations when
 * a viewer's history is dominated by one taste cluster.
 */
export const ADJACENT_GENRE_IDS: Record<number, number[]> = {
  28: [12, 53, 878], // Action → Adventure, Thriller, Sci-Fi
  12: [28, 14, 878],
  878: [28, 12, 53],
  53: [80, 9648, 28],
  80: [53, 9648, 18],
  18: [80, 10749, 36],
  27: [53, 9648],
  35: [10749, 18],
  16: [10751, 12],
  99: [36],
  14: [12, 878],
  9648: [53, 80],
  10749: [18, 35],
};
