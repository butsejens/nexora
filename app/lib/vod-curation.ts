export type VodMood = "fun" | "thriller" | "emotional" | "smart" | "cozy" | "binge";

type MaybeNumber = number | string | null | undefined;

type VodHistoryItem = {
  id: string;
  type: "movie" | "series" | "channel" | "sport";
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  progress?: number;
  currentTime?: number;
  duration?: number;
  lastWatched?: string;
  tmdbId?: number;
  genre_ids?: number[];
  year?: number | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
};

type VodItem = {
  id?: string;
  tmdbId?: number | string;
  title?: string;
  name?: string;
  poster?: string | null;
  backdrop?: string | null;
  synopsis?: string;
  overview?: string;
  genre_ids?: number[];
  imdb?: MaybeNumber;
  rating?: MaybeNumber;
  runtimeMinutes?: number | null;
  duration?: number | string | null;
  year?: number | string | null;
};

type Candidate = {
  item: VodItem;
  source: string;
};

const SOURCE_WEIGHT: Record<string, number> = {
  recommended: 1.35,
  because: 1.3,
  topRated: 1.25,
  trending: 1.15,
  popular: 1.1,
  newReleases: 1.05,
  upcoming: 1.0,
  hiddenGems: 1.1,
  acclaimed: 1.25,
  airingToday: 1.0,
};

const MOOD_CONFIG: Record<VodMood, { genres: number[]; words: string[]; runtime: [number, number] }> = {
  fun: {
    genres: [35, 10751, 16, 12],
    words: ["fun", "comedy", "adventure", "family", "light", "feel-good"],
    runtime: [80, 130],
  },
  thriller: {
    genres: [53, 80, 9648, 27, 10765],
    words: ["thriller", "crime", "mystery", "dark", "suspense", "horror"],
    runtime: [95, 140],
  },
  emotional: {
    genres: [18, 10749, 10766],
    words: ["drama", "heart", "love", "life", "family", "moving"],
    runtime: [95, 150],
  },
  smart: {
    genres: [99, 36, 878, 10768],
    words: ["history", "science", "politics", "documentary", "biography", "war"],
    runtime: [90, 150],
  },
  cozy: {
    genres: [35, 10749, 10751, 16],
    words: ["cozy", "warm", "heart", "gentle", "comfort", "romance"],
    runtime: [75, 120],
  },
  binge: {
    genres: [80, 18, 9648, 10759, 10765],
    words: ["season", "twist", "cliffhanger", "investigation", "saga", "epic"],
    runtime: [35, 70],
  },
};

function toNumber(value: MaybeNumber): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function durationToMinutes(duration?: number | string | null): number {
  if (!duration) return 0;
  if (typeof duration === "number" && Number.isFinite(duration)) return duration;
  const text = String(duration);
  const hMatch = text.match(/(\d+)\s*[hu]/i);
  const mMatch = text.match(/(\d+)\s*m/i);
  const h = hMatch ? Number(hMatch[1]) : 0;
  const m = mMatch ? Number(mMatch[1]) : 0;
  return h * 60 + m;
}

export function normalizeVodIdentity(item: VodItem): string {
  const tmdb = String(item.tmdbId || "").trim();
  if (tmdb) return `tmdb:${tmdb}`;
  const id = String(item.id || "").trim();
  if (id) return `id:${id}`;
  const title = String(item.title || item.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const year = String(item.year || "").slice(0, 4);
  return year ? `title:${title}:${year}` : `title:${title}`;
}

export function dedupeVodItems(items: VodItem[], seen?: Set<string>): VodItem[] {
  const localSeen = seen || new Set<string>();
  const output: VodItem[] = [];
  for (const item of items) {
    const key = normalizeVodIdentity(item);
    if (!key || localSeen.has(key)) continue;
    localSeen.add(key);
    output.push(item);
  }
  return output;
}

export function applyGlobalUniqueness(rows: { key: string; items: VodItem[] }[]): Record<string, VodItem[]> {
  const seen = new Set<string>();
  const out: Record<string, VodItem[]> = {};
  for (const row of rows) {
    out[row.key] = dedupeVodItems(row.items, seen);
  }
  return out;
}

export function createContinueWatching(history: VodHistoryItem[], targetType: "movie" | "series", limit = 20): VodItem[] {
  const sorted = [...history]
    .filter((h) => h.type === targetType)
    .filter((h) => (h.progress || 0) > 0.03 && (h.progress || 0) < 0.97)
    .sort((a, b) => Date.parse(b.lastWatched || "") - Date.parse(a.lastWatched || ""));

  const perTitle = new Set<string>();
  const out: VodItem[] = [];

  for (const item of sorted) {
    const showKey = targetType === "series"
      ? `series:${item.tmdbId || ""}:${String(item.title || "").toLowerCase()}`
      : normalizeVodIdentity(item);
    if (perTitle.has(showKey)) continue;
    perTitle.add(showKey);

    out.push({
      id: item.id,
      tmdbId: item.tmdbId,
      title: item.title,
      poster: item.poster || null,
      backdrop: item.backdrop || null,
      synopsis: "",
      quality: "HD",
      progress: item.progress,
      season: item.season,
      episode: item.episode,
      currentTime: item.currentTime,
      duration: item.duration,
    } as VodItem);

    if (out.length >= limit) break;
  }

  return out;
}

function historyGenreAffinity(history: VodHistoryItem[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const h of history) {
    for (const gid of h.genre_ids || []) {
      map.set(gid, (map.get(gid) || 0) + 1);
    }
  }
  return map;
}

function medianDuration(history: VodHistoryItem[]): number {
  const values = history
    .map((h) => Number(h.duration || 0))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export function buildMoodRecommendations(
  mood: VodMood,
  candidates: Candidate[],
  history: VodHistoryItem[],
  targetType: "movie" | "series",
  limit = 20,
): VodItem[] {
  const config = MOOD_CONFIG[mood];
  const affinity = historyGenreAffinity(history.filter((h) => h.type === targetType));
  const preferredDuration = medianDuration(history.filter((h) => h.type === targetType));
  const scored: { item: VodItem; score: number }[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const item = candidate.item;
    const key = normalizeVodIdentity(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const title = String(item.title || item.name || "").trim();
    if (!title) continue;

    const genres = (item.genre_ids || []).map((g) => Number(g)).filter((g) => Number.isFinite(g));
    const text = `${String(item.title || item.name || "")} ${String(item.synopsis || "")} ${String(item.overview || "")}`.toLowerCase();
    const rating = Math.max(toNumber(item.rating), toNumber(item.imdb));
    const runtime = Number(item.runtimeMinutes || 0) || durationToMinutes(item.duration);

    let score = 0;

    const genreHits = genres.filter((g) => config.genres.includes(g)).length;
    score += Math.min(genreHits, 3) * 3;

    const wordHits = config.words.filter((word) => text.includes(word)).length;
    score += Math.min(wordHits, 3) * 1.8;

    if (rating > 0) score += Math.max(0, rating - 5) * 0.6;

    if (runtime > 0) {
      const [minRuntime, maxRuntime] = config.runtime;
      if (runtime >= minRuntime && runtime <= maxRuntime) {
        score += 2.2;
      } else {
        const distance = Math.min(Math.abs(runtime - minRuntime), Math.abs(runtime - maxRuntime));
        score += Math.max(0, 1.4 - distance / 60);
      }
    }

    if (preferredDuration > 0 && runtime > 0) {
      const distance = Math.abs(runtime - preferredDuration);
      score += Math.max(0, 1.5 - distance / 75);
    }

    if (genres.length > 0 && affinity.size > 0) {
      let affinityScore = 0;
      for (const gid of genres) affinityScore += affinity.get(gid) || 0;
      score += Math.min(affinityScore / 2.5, 4);
    }

    score *= SOURCE_WEIGHT[candidate.source] || 1;
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}

/**
 * Bridge: Derive VOD mood from sports history and personalization
 * 
 * Maps sports activity patterns to narrative mood preferences:
 * - Intense competitive sports (football derbies, MMA) → thriller genre
 * - Rapid-fire replays, highlights → fun, fast-paced moods
 * - Team follows, regular viewing → consistent emotional investment (emotional, binge)
 * 
 * Used to seed VOD recommendations when user has sports history but limited media history.
 */
export function deriveMoodFromSportsHistory(
  sportsHistory: VodHistoryItem[],
  followedTeamCount = 0,
): VodMood {
  if (!sportsHistory || sportsHistory.length === 0) return "fun";

  const sports = sportsHistory.filter((h) => h.type === "sport");
  if (sports.length === 0) return "fun";

  const sportTitles = new Set(sports.map((s) => (s.title || "").toLowerCase()));
  const titleText = Array.from(sportTitles).join(" ");

  // Count activity patterns
  const isHighIntensity =
    titleText.includes("derby") ||
    titleText.includes("rival") ||
    titleText.includes("champions") ||
    titleText.includes("final") ||
    titleText.includes("mma") ||
    titleText.includes("boxing");

  const isTeamFollower = followedTeamCount >= 2;
  const hasRegularViewing = sports.length >= 5;
  const recentActivity = sports.some(
    (s) => {
      const lastWatched = s.lastWatched ? new Date(s.lastWatched) : null;
      const daysDiff = lastWatched ? (Date.now() - lastWatched.getTime()) / (1000 * 60 * 60 * 24) : Infinity;
      return daysDiff < 3;
    }
  );

  // Map patterns → mood
  if (isHighIntensity) return "thriller";
  if (isTeamFollower && hasRegularViewing) return "binge";
  if (recentActivity) return "emotional";
  if (hasRegularViewing) return "smart";
  return "fun";
}

