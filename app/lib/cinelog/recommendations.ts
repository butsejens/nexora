/**
 * CineLog — recommendation engine.
 *
 * Builds a taste profile from what the viewer actually does (watch history,
 * ratings, watchlist, favourites) and scores candidate titles against it. Genre
 * affinity carries most of the weight, widened by adjacent genres so a viewer
 * who only watches Sci-Fi still gets Action, Adventure and Thriller suggestions.
 */

import { ADJACENT_GENRE_IDS, genreName } from "@/lib/cinelog/genres";
import type {
  LibraryEntryRef,
  MediaSummary,
  Recommendation,
} from "@/lib/cinelog/types";
import type { LibrarySignals } from "@/store/library-store";

/** How much each signal contributes to a genre's affinity score. */
const SIGNAL_WEIGHT = {
  watched: 3,
  watching: 2.5,
  favorite: 2.5,
  watchlist: 1.5,
  /** Multiplied by (score - 5), so a 9/10 adds 4x this and a 3/10 subtracts. */
  ratingPerPoint: 0.6,
} as const;

/** Adjacent genres inherit this share of the parent genre's affinity. */
const ADJACENCY_FACTOR = 0.35;

export interface TasteProfile {
  /** TMDB genre id → affinity score. Higher means stronger preference. */
  genreAffinity: Record<number, number>;
  /** Titles the viewer already engaged with; excluded from recommendations. */
  seenIds: Set<string>;
  /** Most recently engaged titles, newest first — drives "Because you watched". */
  seeds: LibraryEntryRef[];
  topGenreIds: number[];
  hasSignal: boolean;
}

function addAffinity(
  target: Record<number, number>,
  genreIds: number[] | undefined,
  weight: number,
): void {
  for (const id of genreIds ?? []) {
    if (!id) continue;
    target[id] = (target[id] ?? 0) + weight;
  }
}

export function buildTasteProfile(signals: LibrarySignals): TasteProfile {
  const genreAffinity: Record<number, number> = {};
  const seenIds = new Set<string>();

  for (const entry of signals.history) {
    seenIds.add(entry.id);
    addAffinity(
      genreAffinity,
      entry.genreIds,
      entry.state === "watched"
        ? SIGNAL_WEIGHT.watched
        : SIGNAL_WEIGHT.watching,
    );
  }
  for (const entry of signals.favorites) {
    seenIds.add(entry.id);
    addAffinity(genreAffinity, entry.genreIds, SIGNAL_WEIGHT.favorite);
  }
  for (const entry of signals.watchlist) {
    seenIds.add(entry.id);
    addAffinity(genreAffinity, entry.genreIds, SIGNAL_WEIGHT.watchlist);
  }
  for (const rating of Object.values(signals.ratings)) {
    seenIds.add(rating.id);
    addAffinity(
      genreAffinity,
      rating.genreIds,
      (rating.score - 5) * SIGNAL_WEIGHT.ratingPerPoint,
    );
  }

  // Widen the profile so strong tastes pull in neighbouring genres.
  const widened: Record<number, number> = { ...genreAffinity };
  for (const [rawId, score] of Object.entries(genreAffinity)) {
    if (score <= 0) continue;
    for (const adjacent of ADJACENT_GENRE_IDS[Number(rawId)] ?? []) {
      widened[adjacent] = (widened[adjacent] ?? 0) + score * ADJACENCY_FACTOR;
    }
  }

  const topGenreIds = Object.entries(widened)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => Number(id));

  const seeds = [
    ...[...signals.history]
      .sort((a, b) => Date.parse(b.watchedAt) - Date.parse(a.watchedAt))
      .map((entry) => entry as LibraryEntryRef),
    ...signals.favorites,
  ].filter(
    (entry, index, all) =>
      all.findIndex((other) => other.id === entry.id) === index,
  );

  return {
    genreAffinity: widened,
    seenIds,
    seeds,
    topGenreIds,
    hasSignal: topGenreIds.length > 0,
  };
}

/** Named genres the viewer leans towards, for UI copy. */
export function topGenreLabels(profile: TasteProfile, limit = 3): string[] {
  return profile.topGenreIds.slice(0, limit).map(genreName).filter(Boolean);
}

function scoreCandidate(
  candidate: MediaSummary,
  profile: TasteProfile,
): { score: number; matchedGenreId: number | null } {
  let genreScore = 0;
  let matchedGenreId: number | null = null;
  let best = 0;

  for (const id of candidate.genreIds) {
    const affinity = profile.genreAffinity[id] ?? 0;
    genreScore += affinity;
    if (affinity > best) {
      best = affinity;
      matchedGenreId = id;
    }
  }

  // Quality acts as a tie-breaker so we never recommend a poorly rated title
  // purely because its genre matches.
  const qualityScore = candidate.rating * 0.4;
  const popularityScore = Math.log10(Math.max(candidate.popularity, 1)) * 0.3;

  return { score: genreScore + qualityScore + popularityScore, matchedGenreId };
}

export interface RecommendationInput {
  /** Pool of titles to rank — typically the rails already loaded on screen. */
  candidates: MediaSummary[];
  profile: TasteProfile;
  limit?: number;
}

/** "Recommended For You" — personalised when there is signal, quality-first otherwise. */
export function recommendForYou({
  candidates,
  profile,
  limit = 20,
}: RecommendationInput): Recommendation[] {
  const pool = candidates.filter(
    (candidate) => !profile.seenIds.has(candidate.id) && candidate.poster,
  );

  if (!profile.hasSignal) {
    return pool
      .filter((candidate) => candidate.rating >= 7)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((item) => ({
        item,
        reason: "Highly rated right now",
        score: item.rating,
      }));
  }

  const seen = new Set<string>();
  return pool
    .map((candidate) => {
      const { score, matchedGenreId } = scoreCandidate(candidate, profile);
      const genreLabel = matchedGenreId ? genreName(matchedGenreId) : "";
      return {
        item: candidate,
        score,
        reason: genreLabel
          ? `Because you watch ${genreLabel}`
          : "Picked for you",
      };
    })
    .filter((entry) => {
      if (entry.score <= 0 || seen.has(entry.item.id)) return false;
      seen.add(entry.item.id);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * "Because You Watched …" — the most recent title with enough signal to explain
 * a rail, plus the titles that best match it.
 */
export function becauseYouWatched(
  candidates: MediaSummary[],
  profile: TasteProfile,
  limit = 20,
): { seed: LibraryEntryRef; items: MediaSummary[] } | null {
  const seed = profile.seeds.find((entry) => (entry.genreIds ?? []).length > 0);
  if (!seed) return null;

  const seedGenres = new Set(seed.genreIds ?? []);
  const items = candidates
    .filter(
      (candidate) =>
        candidate.id !== seed.id &&
        !profile.seenIds.has(candidate.id) &&
        candidate.poster &&
        candidate.genreIds.some((id) => seedGenres.has(id)),
    )
    .sort((a, b) => {
      const overlap = (item: MediaSummary) =>
        item.genreIds.filter((id) => seedGenres.has(id)).length;
      const diff = overlap(b) - overlap(a);
      return diff !== 0 ? diff : b.rating - a.rating;
    })
    .slice(0, limit);

  return items.length >= 4 ? { seed, items } : null;
}
