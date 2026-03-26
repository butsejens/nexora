import { dedupeVodItems } from "@/lib/vod-curation";

export type VodModuleMediaType = "movie" | "series";
export type VodModulePane = "home" | "search" | "more";
export type VodSearchFilter = "all" | "movie" | "series" | "anime";

export type VodCompany = {
  id: number;
  name: string;
  logo?: string | null;
};

export type VodCollectionMeta = {
  id?: number | null;
  name: string;
  poster?: string | null;
  backdrop?: string | null;
};

export type VodModuleItem = {
  id: string;
  tmdbId?: number | null;
  type: VodModuleMediaType;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  synopsis?: string;
  overview?: string;
  year?: string | number | null;
  releaseDate?: string | null;
  imdb?: string | number | null;
  rating?: string | number | null;
  quality?: string;
  genre?: string[];
  genreIds?: number[];
  keywords?: string[];
  originalLanguage?: string | null;
  collection?: VodCollectionMeta | null;
  productionCompanies?: VodCompany[];
  studios?: string[];
  duration?: string | null;
  runtimeMinutes?: number | null;
  isIptv?: boolean;
  streamUrl?: string | null;
  progress?: number;
  seasons?: number;
  isTrending?: boolean;
  isNew?: boolean;
};

export type VodCollectionGroup = {
  key: string;
  name: string;
  source: "tmdb" | "fallback";
  collectionId?: number;
  items: VodModuleItem[];
  itemCount: number;
  bannerUri?: string | null;
  posterUri?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
};

export type VodStudioGroup = {
  id?: number;
  name: string;
  logoUri?: string | null;
  items: VodModuleItem[];
  itemCount: number;
};

export type VodCategoryRail = {
  key: string;
  label: string;
  items: VodModuleItem[];
};

const MOVIE_GENRE_LABELS: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const SERIES_GENRE_LABELS: Record<number, string> = {
  10759: "Action",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Animation",
  9648: "Mystery",
  10765: "Sci-Fi",
  53: "Thriller",
};

const CATEGORY_PRIORITY = [
  "Trending",
  "Popular",
  "New Releases",
  "Top Rated",
  "Action",
  "Comedy",
  "Horror",
  "Sci-Fi",
  "Animation",
  "Anime",
  "Drama",
  "Thriller",
  "Crime",
  "Family",
  "Documentary",
  "Adventure",
];

const PRIORITY_STUDIOS = [
  "Marvel Studios",
  "Pixar Animation Studios",
  "Walt Disney Pictures",
  "Warner Bros. Pictures",
  "Universal Pictures",
  "DreamWorks Animation",
  "Paramount Pictures",
  "Lucasfilm Ltd.",
  "20th Century Studios",
  "Netflix",
  "HBO",
  "Apple TV+",
];

const FRANCHISE_FALLBACKS = [
  { key: "star-wars", label: "Star Wars Collection", terms: ["star wars", "mandalorian", "book of boba fett", "ahsoka", "andor"] },
  { key: "harry-potter", label: "Harry Potter Collection", terms: ["harry potter", "fantastic beasts", "hogwarts"] },
  { key: "fast-furious", label: "Fast & Furious Collection", terms: ["fast & furious", "fast and furious"] },
  { key: "lord-rings", label: "Middle-earth Collection", terms: ["lord of the rings", "the hobbit"] },
  { key: "mission-impossible", label: "Mission: Impossible Collection", terms: ["mission: impossible", "mission impossible"] },
  { key: "john-wick", label: "John Wick Collection", terms: ["john wick"] },
  {
    key: "marvel",
    label: "Marvel Collection",
    terms: [
      "marvel",
      "mcu",
      "avengers",
      "captain america",
      "iron man",
      "thor",
      "guardians of the galaxy",
      "black panther",
      "doctor strange",
      "wanda",
      "loki",
      "daredevil",
    ],
  },
  { key: "dc", label: "DC Collection", terms: ["dc", "batman", "superman", "justice league", "wonder woman", "suicide squad", "joker"] },
  { key: "jurassic", label: "Jurassic Collection", terms: ["jurassic park", "jurassic world"] },
  { key: "transformers", label: "Transformers Collection", terms: ["transformers", "bumblebee"] },
  { key: "pirates", label: "Pirates Of The Caribbean Collection", terms: ["pirates of the caribbean", "jack sparrow"] },
  { key: "james-bond", label: "James Bond Collection", terms: ["james bond", "007"] },
];

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toYear(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value || "").slice(0, 4));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReleaseDate(item: VodModuleItem): number {
  return Date.parse(String(item.releaseDate || item.year || "")) || 0;
}

function uniqueItems(items: VodModuleItem[]): VodModuleItem[] {
  return dedupeVodItems(items as any) as VodModuleItem[];
}

function resolveGenreLabels(item: VodModuleItem): string[] {
  if (Array.isArray(item.genre) && item.genre.length) return item.genre.filter(Boolean);
  const map = item.type === "movie" ? MOVIE_GENRE_LABELS : SERIES_GENRE_LABELS;
  return (item.genreIds || []).map((id) => map[id]).filter(Boolean);
}

function buildAnimeFlag(item: VodModuleItem): boolean {
  const normalizedKeywords = (item.keywords || []).map(normalizeText);
  return Boolean(
    (item.genreIds || []).includes(16) && (
      String(item.originalLanguage || "").toLowerCase() === "ja" ||
      normalizedKeywords.some((keyword) => keyword.includes("anime") || keyword.includes("manga"))
    )
  );
}

export function enrichVodModuleItem(baseItem: any, detail?: any): VodModuleItem {
  const mergedGenre = detail?.genre && Array.isArray(detail.genre) && detail.genre.length
    ? detail.genre
    : Array.isArray(baseItem.genre) ? baseItem.genre : [];

  return {
    id: String(baseItem.id || detail?.id || ""),
    tmdbId: Number(baseItem.tmdbId || detail?.tmdbId || detail?.id || 0) || null,
    type: (baseItem.type || detail?.type || "movie") as VodModuleMediaType,
    title: String(baseItem.title || detail?.title || "").trim(),
    poster: detail?.poster ?? baseItem.poster ?? null,
    backdrop: detail?.backdrop ?? baseItem.backdrop ?? null,
    synopsis: detail?.synopsis ?? baseItem.synopsis ?? baseItem.overview ?? "",
    overview: detail?.synopsis ?? baseItem.overview ?? "",
    year: detail?.year ?? baseItem.year ?? null,
    releaseDate: detail?.releaseDate ?? baseItem.releaseDate ?? null,
    imdb: detail?.imdb ?? baseItem.imdb ?? null,
    rating: detail?.rating ?? baseItem.rating ?? null,
    quality: baseItem.quality || "HD",
    genre: mergedGenre,
    genreIds: Array.isArray(detail?.genreIds) && detail.genreIds.length ? detail.genreIds : baseItem.genreIds || [],
    keywords: Array.isArray(detail?.keywords) ? detail.keywords : [],
    originalLanguage: detail?.originalLanguage ?? baseItem.originalLanguage ?? null,
    collection: detail?.collection ?? baseItem.collection ?? null,
    productionCompanies: Array.isArray(detail?.productionCompanies) ? detail.productionCompanies : baseItem.productionCompanies || [],
    studios: Array.isArray(detail?.studios) ? detail.studios : baseItem.studios || [],
    duration: detail?.duration ?? baseItem.duration ?? null,
    runtimeMinutes: detail?.runtimeMinutes ?? baseItem.runtimeMinutes ?? null,
    isIptv: Boolean(baseItem.isIptv),
    streamUrl: baseItem.streamUrl ?? null,
    progress: baseItem.progress,
    seasons: detail?.totalSeasons ?? baseItem.seasons ?? null,
    isTrending: Boolean(baseItem.isTrending),
    isNew: Boolean(baseItem.isNew),
  };
}

export function categorizeVodItem(item: VodModuleItem): string[] {
  const categories = new Set<string>();
  const labels = resolveGenreLabels(item);
  labels.forEach((label) => categories.add(label));

  const normalizedText = normalizeText([
    item.title,
    item.synopsis,
    ...(item.keywords || []),
    ...(item.studios || []),
  ].join(" "));

  if (item.isTrending) categories.add("Trending");
  if (item.isNew) categories.add("New Releases");
  if (Number(item.rating || item.imdb || 0) >= 7.8) categories.add("Top Rated");
  if ((item.genreIds || []).length || labels.length) categories.add("Popular");
  if (buildAnimeFlag(item)) categories.add("Anime");
  if (normalizedText.includes("science fiction")) categories.add("Sci-Fi");
  if (normalizedText.includes("animation")) categories.add("Animation");
  if (normalizedText.includes("horror")) categories.add("Horror");
  if (normalizedText.includes("comedy")) categories.add("Comedy");
  if (normalizedText.includes("action")) categories.add("Action");

  if (!categories.size) categories.add(item.type === "series" ? "Series" : "Movies");
  return Array.from(categories);
}

export function buildCategoryRails(items: VodModuleItem[], limitPerRail = 18): VodCategoryRail[] {
  const bucketMap = new Map<string, VodModuleItem[]>();
  uniqueItems(items).forEach((item) => {
    categorizeVodItem(item).forEach((label) => {
      const existing = bucketMap.get(label) || [];
      existing.push(item);
      bucketMap.set(label, existing);
    });
  });

  const keys = Array.from(bucketMap.keys()).sort((left, right) => {
    const leftPriority = CATEGORY_PRIORITY.indexOf(left);
    const rightPriority = CATEGORY_PRIORITY.indexOf(right);
    if (leftPriority !== -1 || rightPriority !== -1) {
      return (leftPriority === -1 ? 999 : leftPriority) - (rightPriority === -1 ? 999 : rightPriority);
    }
    return left.localeCompare(right);
  });

  return keys
    .map((key) => ({
      key: normalizeText(key).replace(/\s+/g, "-"),
      label: key,
      items: uniqueItems(bucketMap.get(key) || []).slice(0, limitPerRail),
    }))
    .filter((rail) => rail.items.length > 0);
}

function resolveFallbackCollection(item: VodModuleItem): { key: string; name: string } | null {
  const haystack = normalizeText([item.title, ...(item.keywords || [])].join(" "));
  for (const franchise of FRANCHISE_FALLBACKS) {
    if (franchise.terms.some((term) => haystack.includes(normalizeText(term)))) {
      return { key: franchise.key, name: franchise.label };
    }
  }
  return null;
}

export function buildCollectionGroups(items: VodModuleItem[]): VodCollectionGroup[] {
  const groups = new Map<string, VodCollectionGroup>();

  uniqueItems(items).forEach((item) => {
    const fallback = resolveFallbackCollection(item);
    const collection = item.collection?.name
      ? {
          key: `tmdb:${item.collection.id || normalizeText(item.collection.name)}`,
          name: item.collection.name,
          source: "tmdb" as const,
          collectionId: item.collection.id || undefined,
          posterUri: item.collection.poster || item.poster,
          bannerUri: item.collection.backdrop || item.backdrop,
        }
      : fallback
        ? {
            key: `fallback:${fallback.key}`,
            name: fallback.name,
            source: "fallback" as const,
            posterUri: item.poster,
            bannerUri: item.backdrop,
          }
        : null;

    if (!collection) return;
    const existing = groups.get(collection.key);
    if (!existing) {
      groups.set(collection.key, {
        key: collection.key,
        name: collection.name,
        source: collection.source,
        collectionId: collection.collectionId,
        items: [item],
        itemCount: 1,
        bannerUri: collection.bannerUri || item.backdrop || item.poster,
        posterUri: collection.posterUri || item.poster,
        fromYear: toYear(item.year),
        toYear: toYear(item.year),
      });
      return;
    }

    existing.items.push(item);
    existing.itemCount = existing.items.length;
    existing.bannerUri = existing.bannerUri || item.backdrop || item.poster;
    existing.posterUri = existing.posterUri || item.poster;
    const year = toYear(item.year);
    existing.fromYear = existing.fromYear == null ? year : Math.min(existing.fromYear, year || existing.fromYear);
    existing.toYear = existing.toYear == null ? year : Math.max(existing.toYear, year || existing.toYear);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => parseReleaseDate(left) - parseReleaseDate(right)),
      itemCount: group.items.length,
    }))
    .filter((group) => group.items.length > 2)
    .sort((left, right) => {
      if (right.items.length !== left.items.length) return right.items.length - left.items.length;
      return (parseReleaseDate(left.items[0]) || 0) - (parseReleaseDate(right.items[0]) || 0);
    });
}

function studioPriority(name: string): number {
  const directIndex = PRIORITY_STUDIOS.findIndex((value) => normalizeText(value) === normalizeText(name));
  return directIndex === -1 ? 999 : directIndex;
}

export function buildStudioGroups(items: VodModuleItem[]): VodStudioGroup[] {
  const groups = new Map<string, VodStudioGroup>();

  uniqueItems(items).forEach((item) => {
    const companies = Array.isArray(item.productionCompanies) && item.productionCompanies.length
      ? item.productionCompanies
      : (item.studios || []).map((name) => ({ id: 0, name, logo: null }));

    companies.slice(0, 6).forEach((company) => {
      if (!company?.name) return;
      const key = normalizeText(company.name);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          id: company.id || undefined,
          name: company.name,
          logoUri: company.logo || null,
          items: [item],
          itemCount: 1,
        });
        return;
      }
      existing.items.push(item);
      existing.itemCount = existing.items.length;
      existing.logoUri = existing.logoUri || company.logo || null;
      existing.id = existing.id || company.id || undefined;
    });
  });

  return Array.from(groups.values())
    .map((group) => {
      const unique = uniqueItems(group.items);
      return { ...group, items: unique.slice(0, 36), itemCount: unique.length };
    })
    .filter((group) => group.itemCount >= 3)
    .sort((left, right) => {
      const priorityDelta = studioPriority(left.name) - studioPriority(right.name);
      if (priorityDelta !== 0) return priorityDelta;
      return right.itemCount - left.itemCount;
    });
}

export function filterBySearchFilter(items: VodModuleItem[], filter: VodSearchFilter): VodModuleItem[] {
  switch (filter) {
    case "movie":
      return items.filter((item) => item.type === "movie");
    case "series":
      return items.filter((item) => item.type === "series");
    case "anime":
      return items.filter((item) => buildAnimeFlag(item));
    default:
      return items;
  }
}

export function pickFeaturedItem(items: VodModuleItem[]): VodModuleItem | null {
  if (!items.length) return null;
  return [...items].sort((left, right) => {
    const leftScore = Number(left.rating || left.imdb || 0) + (left.isTrending ? 2 : 0);
    const rightScore = Number(right.rating || right.imdb || 0) + (right.isTrending ? 2 : 0);
    return rightScore - leftScore;
  })[0] || null;
}