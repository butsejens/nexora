/**
 * Nexora – Recommendation Service
 *
 * Produces ranked, deduplicated, explainable recommendations.
 *
 * Strategy (in priority order):
 *   1. "Because you watched" — items similar to recently watched
 *   2. Mood-based — genre affinity from watch history
 *   3. Server-side AI/ML recommendations (/api/recommendations/for-you)
 *   4. Trending fallback — if all else produces too few results
 *
 * Rules:
 *   - No item appears more than once across all rails
 *   - Already-watched items (> 90% progress) are excluded
 *   - Metadata-only items keep isPlayable=false (never mislead user)
 *   - Results are ranked by score descending
 */

import { apiRequest } from "@/lib/query-client";
import {
  normalizeMovieFromTmdb,
  normalizeSeriesFromTmdb,
} from "@/lib/domain/normalizers";
import type {
  Movie, Series, RecommendationItem, MoodPreference, WatchHistoryItem,
} from "@/lib/domain/models";
import {
  loadMoodPreferences, loadWatchHistory, getContinueWatching,
} from "./user-state-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationRail = {
  id: string;
  label: string;
  reason: RecommendationItem["reason"];
  items: (Movie | Series)[];
};

export interface RecommendationOutput {
  rails: RecommendationRail[];
  /** All items flattened, deduplicated, ranked */
  flat: RecommendationItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enforceMetadataOnly<T extends { isPlayable: boolean; isDownloadable: boolean }>(item: T): T {
  return { ...item, isPlayable: false, isDownloadable: false };
}

async function safeFetch<T>(route: string, fallback: T): Promise<T> {
  try {
    const res = await apiRequest("GET", route);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function dedupeByTmdbId(items: (Movie | Series)[], seen: Set<string>): (Movie | Series)[] {
  const out: (Movie | Series)[] = [];
  for (const item of items) {
    const key = String(item.id?.tmdbId ?? item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ─── Server-side recommendations ──────────────────────────────────────────────

async function fetchServerRecommendations(
  moods: MoodPreference[],
  recentTmdbIds: number[],
  lang?: string,
): Promise<(Movie | Series)[]> {
  const params = new URLSearchParams();
  if (moods.length) params.set("moods", moods.slice(0, 3).map(m => m.mood).join(","));
  if (lang) params.set("language", lang);

  const raw = await safeFetch<any>(`/api/recommendations/for-you?${params}`, {});
  return (Array.isArray(raw?.results) ? raw.results : []).map((item: any) => {
    const normalized = item.type === "series" || item.media_type === "tv"
      ? normalizeSeriesFromTmdb(item)
      : normalizeMovieFromTmdb(item);
    return enforceMetadataOnly(normalized);
  });
}

async function fetchSimilar(tmdbId: number, type: "movie" | "series"): Promise<(Movie | Series)[]> {
  const raw = await safeFetch<any>(`/api/recommendations/similar/${tmdbId}?type=${type}`, {});
  return (Array.isArray(raw?.results) ? raw.results : []).map((item: any) => {
    const normalized = type === "series"
      ? normalizeSeriesFromTmdb(item)
      : normalizeMovieFromTmdb(item);
    return enforceMetadataOnly(normalized);
  });
}

// ─── Main recommendation builder ──────────────────────────────────────────────

/**
 * Build a full recommendation output for the media home screen.
 * Combines server recommendations, mood-based filtering, and "because you watched".
 *
 * @param lang — UI language (ISO-639-1)
 * @param limit — max items per rail
 */
export async function buildRecommendations(
  lang = "en",
  limit = 12,
): Promise<RecommendationOutput> {
  const [moods, history, continueWatching] = await Promise.all([
    loadMoodPreferences(),
    loadWatchHistory(),
    getContinueWatching(),
  ]);

  // IDs of items user has nearly finished (exclude from recommendations)
  const nearlyFinishedIds = new Set(
    history.filter(h => h.progress > 0.90).map(h => String(h.tmdbId ?? h.contentId)),
  );

  const recentTmdbIds = history
    .slice(0, 10)
    .map(h => h.tmdbId)
    .filter((id): id is number => id != null);

  const seen = new Set<string>(nearlyFinishedIds);

  const rails: RecommendationRail[] = [];

  // ── Rail 1: Continue Watching ─────────────────────────────────────────────
  if (continueWatching.length > 0) {
    // Continue watching items come from history; they are not TMDB items per se.
    // We include them as-is (they have their own rail in the UI context).
    for (const item of continueWatching) {
      if (item.tmdbId) seen.add(String(item.tmdbId));
    }
  }

  // ── Rail 2: Because You Watched ───────────────────────────────────────────
  const becauseItems: (Movie | Series)[] = [];
  if (recentTmdbIds.length > 0) {
    // Take the most recent item and fetch similar
    const seed = history.find(h => h.tmdbId === recentTmdbIds[0]);
    if (seed) {
      const type = seed.mediaType === "series" ? "series" : "movie";
      const similar = await fetchSimilar(recentTmdbIds[0], type);
      becauseItems.push(...dedupeByTmdbId(similar, seen).slice(0, limit));
    }
  }

  if (becauseItems.length >= 3) {
    const seedTitle = history[0]?.title ?? "";
    rails.push({
      id: "because_you_watched",
      label: seedTitle ? `Because you watched ${seedTitle}` : "Because you watched",
      reason: "because_you_watched",
      items: becauseItems,
    });
  }

  // ── Rail 3: Mood-based (from server) ─────────────────────────────────────
  const serverItems = await fetchServerRecommendations(moods, recentTmdbIds, lang);
  const moodItems = dedupeByTmdbId(serverItems, seen).slice(0, limit);

  if (moodItems.length >= 3) {
    const topMood = moods[0]?.mood;
    rails.push({
      id: "mood",
      label: topMood ? `Perfect for your ${topMood} mood` : "Recommended for you",
      reason: "mood",
      items: moodItems,
    });
  }

  // ── Rail 4: Trending fallback (if not enough content yet) ─────────────────
  const totalItems = rails.reduce((sum, r) => sum + r.items.length, 0);
  if (totalItems < 6) {
    const trendRaw = await safeFetch<any>("/api/movies/trending", {});
    const trending = (Array.isArray(trendRaw?.results) ? trendRaw.results : []).map(
      (item: any) => enforceMetadataOnly(normalizeMovieFromTmdb(item)),
    );
    const trendItems = dedupeByTmdbId(trending, seen).slice(0, limit);
    if (trendItems.length > 0) {
      rails.push({
        id: "trending",
        label: "Trending now",
        reason: "trending",
        items: trendItems,
      });
    }
  }

  // ── Build flat ranked list ────────────────────────────────────────────────
  const flat: RecommendationItem[] = [];
  const flatSeen = new Set<string>();

  const reasonWeights: Record<RecommendationItem["reason"], number> = {
    because_you_watched: 1.0,
    mood: 0.85,
    ai: 0.80,
    genre_affinity: 0.75,
    trending: 0.60,
    editorial: 0.55,
    rules: 0.50,
  };

  for (const rail of rails) {
    for (let i = 0; i < rail.items.length; i++) {
      const item = rail.items[i];
      const key = String(item.id?.tmdbId ?? item.title);
      if (flatSeen.has(key)) continue;
      flatSeen.add(key);

      const score = (reasonWeights[rail.reason] ?? 0.5) * (1 - i * 0.05);
      flat.push({
        rank: 0, // filled in below
        title: item,
        reason: rail.reason,
        explanation: rail.label,
        score,
      });
    }
  }

  flat.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  flat.forEach((item, i) => { item.rank = i + 1; });

  return { rails, flat };
}

/**
 * "Perfect for tonight" — pick a single title that best matches
 * the user's current mood and available time (if known).
 */
export async function getPerfectForTonight(
  runtimeHint?: "short" | "medium" | "long",
): Promise<Movie | Series | null> {
  try {
    const moods = await loadMoodPreferences();
    const raw = await safeFetch<any>("/api/recommendations/for-you?limit=20", {});
    const items: (Movie | Series)[] = (Array.isArray(raw?.results) ? raw.results : []).map((item: any) => {
      const normalized = item.type === "series" || item.media_type === "tv"
        ? normalizeSeriesFromTmdb(item)
        : normalizeMovieFromTmdb(item);
      return enforceMetadataOnly(normalized);
    });

    if (items.length === 0) return null;

    // Apply runtime filter if hint given
    const runtimeFilter = {
      short: (r: number | null | undefined) => r != null && r < 90,
      medium: (r: number | null | undefined) => r != null && r >= 90 && r <= 150,
      long: (r: number | null | undefined) => r != null && r > 150,
    }[runtimeHint ?? "medium"] ?? (() => true);

    const topMoodGenres = new Set(
      moods.slice(0, 3).flatMap(m =>
        Object.entries({
          action: 28, comedy: 35, drama: 18, thriller: 53,
          scifi: 878, horror: 27, romance: 10749, animation: 16,
        } as Record<string, number>)
          .filter(([mood]) => mood === m.mood)
          .map(([, id]) => id)
      )
    );

    // Score items
    const scored = items.map(item => {
      let score = 0;
      if (item.rating) score += item.rating * 0.1;
      if (runtimeFilter(item.runtime)) score += 0.5;
      if (topMoodGenres.size && item.genres?.some(g => topMoodGenres.has(g.id))) score += 1;
      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.item ?? null;
  } catch {
    return null;
  }
}
