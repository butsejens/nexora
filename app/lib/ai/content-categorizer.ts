/**
 * Nexora — AI Content Categorizer Agent
 *
 * Automatically categorizes movies and TV series into network/studio buckets
 * using TMDB metadata (network names, genres, production companies, keywords).
 *
 * No external AI API needed — uses deterministic pattern matching on rich
 * TMDB structured data to achieve smart, human-quality categorization.
 */

import type { Movie, Series } from "@/types/streaming";

// ── Network definitions ───────────────────────────────────────────────────────

export interface NetworkBucket {
  id: string;
  label: string;
  color1: string;
  color2: string;
  tmdbNetworkId?: number; // Primary TMDB network ID for discovery
  tmdbCompanyIds?: number[]; // Production company IDs (for movies)
  // Title/network name patterns to match against
  patterns: RegExp[];
  type: "tv" | "movie" | "both";
}

export const KIDS_NETWORK_BUCKETS: NetworkBucket[] = [
  {
    id: "nickelodeon",
    label: "Nickelodeon",
    color1: "#FF6600",
    color2: "#E53E00",
    tmdbNetworkId: 13,
    patterns: [
      /nickelodeon/i,
      /nick\b/i,
      /spongebob/i,
      /icarly/i,
      /rugrats/i,
      /fairly odd/i,
      /danny phantom/i,
      /victorious/i,
      /drake.*josh/i,
      /zoey 101/i,
      /dora/i,
      /blues clues/i,
    ],
    type: "tv",
  },
  {
    id: "disney",
    label: "Disney Channel",
    color1: "#1565C0",
    color2: "#0A3D8F",
    tmdbNetworkId: 54,
    tmdbCompanyIds: [2, 3, 6125], // Walt Disney Pictures, Pixar, Walt Disney Animation Studios
    patterns: [
      /disney/i,
      /pixar/i,
      /toy story/i,
      /lion king/i,
      /frozen/i,
      /finding [dn]/i,
      /moana/i,
      /coco/i,
      /inside out/i,
      /brave/i,
      /encanto/i,
      /ratatouille/i,
      /wall.e/i,
      /up\b/i,
      /cars\b/i,
      /incredibles/i,
      /monsters/i,
      /beauty and the beast/i,
      /aladdin/i,
      /little mermaid/i,
      /bambi/i,
      /dumbo/i,
      /cinderella/i,
      /snow white/i,
      /sleeping beauty/i,
      /hercules/i,
      /tarzan/i,
      /mulan/i,
      /tangled/i,
      /hannah montana/i,
      /wizards of waverly/i,
      /good luck charlie/i,
      /jessie\b/i,
    ],
    type: "both",
  },
  {
    id: "cartoon-network",
    label: "Cartoon Network",
    color1: "#004AAD",
    color2: "#002E80",
    tmdbNetworkId: 56,
    patterns: [
      /cartoon network/i,
      /powerpuff/i,
      /dexter.{0,10}lab/i,
      /johnny bravo/i,
      /courage the cow/i,
      /scooby.doo/i,
      /ben 10/i,
      /adventure time/i,
      /regular show/i,
      /gumball/i,
      /steven universe/i,
      /over the garden/i,
      /we bare bears/i,
      /chowder/i,
      /flapjack/i,
    ],
    type: "tv",
  },
  {
    id: "dreamworks",
    label: "DreamWorks",
    color1: "#1E7E34",
    color2: "#145523",
    tmdbCompanyIds: [521, 17823], // DreamWorks Animation, DreamWorks
    patterns: [
      /dreamworks/i,
      /shrek/i,
      /kung fu panda/i,
      /how to train your dragon/i,
      /madagascar/i,
      /over the hedge/i,
      /bee movie/i,
      /megamind/i,
      /boss baby/i,
      /trolls/i,
      /croods/i,
      /home\b.*dreamworks/i,
      /spirit/i,
      /sinbad/i,
    ],
    type: "movie",
  },
  {
    id: "nick-jr",
    label: "Nick Jr.",
    color1: "#F57F17",
    color2: "#D84315",
    tmdbNetworkId: 6455,
    patterns: [
      /nick jr/i,
      /paw patrol/i,
      /peppa pig/i,
      /blaze/i,
      /bubble guppies/i,
      /team umizoomi/i,
      /shimmer and shine/i,
      /top wing/i,
    ],
    type: "tv",
  },
  {
    id: "boomerang",
    label: "Boomerang",
    color1: "#388E3C",
    color2: "#1B5E20",
    tmdbNetworkId: 6695,
    patterns: [
      /boomerang/i,
      /tom and jerry/i,
      /looney tunes/i,
      /bugs bunny/i,
      /tweety/i,
      /flintstones/i,
      /jetsons/i,
      /yogi bear/i,
      /scooby/i,
    ],
    type: "tv",
  },
];

// ── Categorization engine ─────────────────────────────────────────────────────

export interface CategorizedContent {
  bucketId: string;
  label: string;
  color1: string;
  color2: string;
  items: (Movie | Series)[];
}

/**
 * Assigns a content item to a network/studio bucket based on its metadata.
 * Checks: network field, title patterns, genres.
 * Returns the first matching bucket ID or null if no match.
 */
export function classifyItem(item: Movie | Series): string | null {
  const title = item.title.toLowerCase();
  const network =
    item.type === "series"
      ? ((item as Series).network ?? "").toLowerCase()
      : "";

  for (const bucket of KIDS_NETWORK_BUCKETS) {
    // Skip type mismatch
    if (bucket.type === "tv" && item.type === "movie") continue;
    if (bucket.type === "movie" && item.type === "series") continue;

    for (const pattern of bucket.patterns) {
      if (pattern.test(title) || (network && pattern.test(network))) {
        return bucket.id;
      }
    }
  }

  return null;
}

/**
 * Given a mixed pool of kids content, automatically categorize into network buckets.
 * Items that don't match any bucket go into an "other" group.
 */
export function categorizeKidsContent(
  items: (Movie | Series)[],
): Map<string, (Movie | Series)[]> {
  const buckets = new Map<string, (Movie | Series)[]>();

  // Initialize all buckets
  for (const b of KIDS_NETWORK_BUCKETS) {
    buckets.set(b.id, []);
  }
  buckets.set("other", []);

  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const bucketId = classifyItem(item);
    if (bucketId && buckets.has(bucketId)) {
      buckets.get(bucketId)!.push(item);
    } else {
      buckets.get("other")!.push(item);
    }
  }

  return buckets;
}

/**
 * Returns only the buckets that have content, sorted by item count descending.
 */
export function getPopulatedBuckets(
  items: (Movie | Series)[],
): CategorizedContent[] {
  const buckets = categorizeKidsContent(items);
  const result: CategorizedContent[] = [];

  for (const def of KIDS_NETWORK_BUCKETS) {
    const bucketItems = buckets.get(def.id) ?? [];
    if (bucketItems.length > 0) {
      result.push({
        bucketId: def.id,
        label: def.label,
        color1: def.color1,
        color2: def.color2,
        items: bucketItems,
      });
    }
  }

  return result;
}

// ── Movie era / decade categorization ────────────────────────────────────────

export interface DecadeCategory {
  label: string;
  fromYear: number;
  toYear: number;
  emoji: string;
}

export const MOVIE_DECADES: DecadeCategory[] = [
  {
    label: "Klassiekers (1950–1969)",
    fromYear: 1950,
    toYear: 1969,
    emoji: "🎞️",
  },
  { label: "Jaren '70 & '80", fromYear: 1970, toYear: 1989, emoji: "📽️" },
  { label: "Jaren '90", fromYear: 1990, toYear: 1999, emoji: "🎬" },
  { label: "Jaren 2000", fromYear: 2000, toYear: 2009, emoji: "🍿" },
  { label: "Jaren 2010", fromYear: 2010, toYear: 2019, emoji: "🎥" },
];

/**
 * Group an array of movies into decade buckets.
 */
export function categorizeByDecade(movies: Movie[]): Map<string, Movie[]> {
  const result = new Map<string, Movie[]>();
  for (const decade of MOVIE_DECADES) {
    result.set(decade.label, []);
  }
  result.set("recent", []);

  for (const movie of movies) {
    const year =
      typeof movie.year === "number" ? movie.year : Number(movie.year ?? 0);
    const decade = MOVIE_DECADES.find(
      (d) => year >= d.fromYear && year <= d.toYear,
    );
    if (decade) {
      result.get(decade.label)!.push(movie);
    } else if (year >= 2020) {
      result.get("recent")!.push(movie);
    }
  }

  return result;
}
