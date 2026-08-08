/**
 * CineLog — personal library.
 *
 * Owns everything the viewer builds up: watchlist, favourites, ratings, watch
 * history, per-episode progress and recent searches. Persisted to device
 * storage so it survives restarts and works offline.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  EpisodeWatchMap,
  FavoriteItem,
  LibraryEntryRef,
  MediaId,
  MediaSummary,
  MediaType,
  Movie,
  Series,
  UserRating,
  WatchHistoryItem,
  WatchProgress,
  WatchState,
  WatchlistItem,
} from "@/lib/cinelog/types";

const STORAGE_KEY = "cinelog.library.v1";

/** Fallback runtime (minutes) used for hours-watched when TMDB has none. */
const ASSUMED_MOVIE_RUNTIME = 110;
const ASSUMED_EPISODE_RUNTIME = 45;

export type WatchlistSort =
  | "recently_added"
  | "rating"
  | "release_date"
  | "alphabetical";

export interface LibraryState {
  watchlist: WatchlistItem[];
  favorites: FavoriteItem[];
  ratings: Record<MediaId, UserRating>;
  history: WatchHistoryItem[];
  progress: Record<MediaId, WatchProgress>;
  /** Watched episodes per series id, keyed `s{season}e{episode}`. */
  episodes: Record<MediaId, EpisodeWatchMap>;
  recentSearches: string[];

  toggleWatchlist: (item: LibraryEntryRef) => boolean;
  removeFromWatchlist: (id: MediaId) => void;
  isInWatchlist: (id: MediaId) => boolean;

  toggleFavorite: (item: LibraryEntryRef) => boolean;
  isFavorite: (id: MediaId) => boolean;

  rate: (item: LibraryEntryRef, score: number) => void;
  clearRating: (id: MediaId) => void;
  getRating: (id: MediaId) => number | null;

  setWatchState: (item: LibraryEntryRef, state: WatchState) => void;
  getWatchState: (id: MediaId) => WatchState | null;

  saveProgress: (
    item: LibraryEntryRef,
    input: {
      percent: number;
      positionSeconds?: number;
      durationSeconds?: number;
      seasonNumber?: number;
      episodeNumber?: number;
      episodeTitle?: string;
    },
  ) => void;
  clearProgress: (id: MediaId) => void;

  toggleEpisodeWatched: (
    series: LibraryEntryRef,
    seasonNumber: number,
    episodeNumber: number,
    episodeTitle?: string,
  ) => boolean;
  isEpisodeWatched: (
    id: MediaId,
    seasonNumber: number,
    episodeNumber: number,
  ) => boolean;
  watchedEpisodeCount: (id: MediaId) => number;

  addRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;

  clearHistory: () => void;
  resetLibrary: () => void;
}

function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `s${seasonNumber}e${episodeNumber}`;
}

/** Strip a full media object down to the snapshot we persist. */
export function toLibraryRef(
  item: MediaSummary | Movie | Series | LibraryEntryRef,
): LibraryEntryRef {
  const ref: LibraryEntryRef = {
    id: item.id,
    tmdbId: item.tmdbId,
    type: item.type,
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
    year: item.year,
    rating: item.rating,
    genres: "genres" in item ? (item.genres ?? []) : [],
    genreIds: "genreIds" in item ? (item.genreIds ?? []) : [],
  };
  if ("seasonCount" in item && typeof item.seasonCount === "number") {
    ref.seasonCount = item.seasonCount;
  }
  if ("runtime" in item && typeof item.runtime === "number") {
    ref.runtime = item.runtime;
  }
  return ref;
}

function creditedMinutes(ref: LibraryEntryRef, isEpisode: boolean): number {
  if (isEpisode) return ASSUMED_EPISODE_RUNTIME;
  if (ref.type === "movie") return ref.runtime || ASSUMED_MOVIE_RUNTIME;
  return ASSUMED_EPISODE_RUNTIME;
}

/** Keep the newest entry per title so history rows never duplicate. */
function upsertHistory(
  history: WatchHistoryItem[],
  entry: WatchHistoryItem,
): WatchHistoryItem[] {
  const rest = history.filter((item) => item.id !== entry.id);
  return [entry, ...rest].slice(0, 300);
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      favorites: [],
      ratings: {},
      history: [],
      progress: {},
      episodes: {},
      recentSearches: [],

      toggleWatchlist: (item) => {
        const ref = toLibraryRef(item);
        const exists = get().watchlist.some((entry) => entry.id === ref.id);
        if (exists) {
          set((state) => ({
            watchlist: state.watchlist.filter((entry) => entry.id !== ref.id),
          }));
          return false;
        }
        set((state) => ({
          watchlist: [
            { ...ref, addedAt: new Date().toISOString() },
            ...state.watchlist,
          ],
        }));
        return true;
      },

      removeFromWatchlist: (id) =>
        set((state) => ({
          watchlist: state.watchlist.filter((entry) => entry.id !== id),
        })),

      isInWatchlist: (id) => get().watchlist.some((entry) => entry.id === id),

      toggleFavorite: (item) => {
        const ref = toLibraryRef(item);
        const exists = get().favorites.some((entry) => entry.id === ref.id);
        if (exists) {
          set((state) => ({
            favorites: state.favorites.filter((entry) => entry.id !== ref.id),
          }));
          return false;
        }
        set((state) => ({
          favorites: [
            { ...ref, addedAt: new Date().toISOString() },
            ...state.favorites,
          ],
        }));
        return true;
      },

      isFavorite: (id) => get().favorites.some((entry) => entry.id === id),

      rate: (item, score) => {
        const ref = toLibraryRef(item);
        const clamped = Math.min(10, Math.max(1, Math.round(score)));
        set((state) => ({
          ratings: {
            ...state.ratings,
            [ref.id]: {
              ...ref,
              score: clamped,
              ratedAt: new Date().toISOString(),
            },
          },
        }));
      },

      clearRating: (id) =>
        set((state) => {
          const next = { ...state.ratings };
          delete next[id];
          return { ratings: next };
        }),

      getRating: (id) => get().ratings[id]?.score ?? null,

      setWatchState: (item, watchState) => {
        const ref = toLibraryRef(item);
        set((state) => {
          const entry: WatchHistoryItem = {
            ...ref,
            state: watchState,
            watchedAt: new Date().toISOString(),
            minutes:
              watchState === "watched" ? creditedMinutes(ref, false) : 0,
          };
          const patch: Partial<LibraryState> = {
            history: upsertHistory(state.history, entry),
          };

          if (watchState === "watched") {
            // A finished title should no longer sit in Continue Watching or the
            // "want to watch" list.
            const progress = { ...state.progress };
            delete progress[ref.id];
            patch.progress = progress;
            patch.watchlist = state.watchlist.filter((w) => w.id !== ref.id);
          }
          if (watchState === "want_to_watch") {
            const alreadySaved = state.watchlist.some((w) => w.id === ref.id);
            if (!alreadySaved) {
              patch.watchlist = [
                { ...ref, addedAt: new Date().toISOString() },
                ...state.watchlist,
              ];
            }
          }
          if (watchState === "watching" && !state.progress[ref.id]) {
            // Surface the title in Continue Watching straight away; episode ticks
            // (or a later percentage) refine it from here.
            patch.progress = {
              ...state.progress,
              [ref.id]: {
                ...ref,
                percent: 0,
                positionSeconds: 0,
                durationSeconds: 0,
                updatedAt: new Date().toISOString(),
              },
            };
          }
          return patch as LibraryState;
        });
      },

      getWatchState: (id) =>
        get().history.find((entry) => entry.id === id)?.state ?? null,

      saveProgress: (item, input) => {
        const ref = toLibraryRef(item);
        const percent = Math.min(100, Math.max(0, Math.round(input.percent)));
        set((state) => {
          const progress = { ...state.progress };
          if (percent >= 95) {
            // Treat near-complete playback as finished.
            delete progress[ref.id];
            const entry: WatchHistoryItem = {
              ...ref,
              state: "watched",
              watchedAt: new Date().toISOString(),
              minutes: creditedMinutes(ref, Boolean(input.episodeNumber)),
              seasonNumber: input.seasonNumber,
              episodeNumber: input.episodeNumber,
              episodeTitle: input.episodeTitle,
            };
            return {
              progress,
              history: upsertHistory(state.history, entry),
            };
          }

          progress[ref.id] = {
            ...ref,
            percent,
            positionSeconds: Math.max(0, Math.round(input.positionSeconds ?? 0)),
            durationSeconds: Math.max(
              0,
              Math.round(input.durationSeconds ?? 0),
            ),
            seasonNumber: input.seasonNumber,
            episodeNumber: input.episodeNumber,
            episodeTitle: input.episodeTitle,
            updatedAt: new Date().toISOString(),
          };

          const entry: WatchHistoryItem = {
            ...ref,
            state: "watching",
            watchedAt: new Date().toISOString(),
            minutes: 0,
            seasonNumber: input.seasonNumber,
            episodeNumber: input.episodeNumber,
            episodeTitle: input.episodeTitle,
          };
          return { progress, history: upsertHistory(state.history, entry) };
        });
      },

      clearProgress: (id) =>
        set((state) => {
          const progress = { ...state.progress };
          delete progress[id];
          return { progress };
        }),

      toggleEpisodeWatched: (series, seasonNumber, episodeNumber, episodeTitle) => {
        const ref = toLibraryRef(series);
        const key = episodeKey(seasonNumber, episodeNumber);
        const current = get().episodes[ref.id] ?? {};
        const wasWatched = Boolean(current[key]);

        set((state) => {
          const seriesMap = { ...(state.episodes[ref.id] ?? {}) };
          if (wasWatched) delete seriesMap[key];
          else seriesMap[key] = new Date().toISOString();

          const patch: Partial<LibraryState> = {
            episodes: { ...state.episodes, [ref.id]: seriesMap },
          };

          if (!wasWatched) {
            const entry: WatchHistoryItem = {
              ...ref,
              state: "watching",
              watchedAt: new Date().toISOString(),
              minutes: ASSUMED_EPISODE_RUNTIME,
              seasonNumber,
              episodeNumber,
              episodeTitle,
            };
            patch.history = upsertHistory(state.history, entry);
          }
          return patch as LibraryState;
        });

        return !wasWatched;
      },

      isEpisodeWatched: (id, seasonNumber, episodeNumber) =>
        Boolean(get().episodes[id]?.[episodeKey(seasonNumber, episodeNumber)]),

      watchedEpisodeCount: (id) =>
        Object.keys(get().episodes[id] ?? {}).length,

      addRecentSearch: (term) => {
        const trimmed = term.trim();
        if (trimmed.length < 2) return;
        set((state) => ({
          recentSearches: [
            trimmed,
            ...state.recentSearches.filter(
              (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
            ),
          ].slice(0, 8),
        }));
      },

      clearRecentSearches: () => set({ recentSearches: [] }),

      clearHistory: () => set({ history: [], progress: {}, episodes: {} }),

      resetLibrary: () =>
        set({
          watchlist: [],
          favorites: [],
          ratings: {},
          history: [],
          progress: {},
          episodes: {},
          recentSearches: [],
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        watchlist: state.watchlist,
        favorites: state.favorites,
        ratings: state.ratings,
        history: state.history,
        progress: state.progress,
        episodes: state.episodes,
        recentSearches: state.recentSearches,
      }),
    },
  ),
);

// ── Selectors ────────────────────────────────────────────────────────────────

/** Continue Watching rail, newest activity first. */
export function selectContinueWatching(state: LibraryState): WatchProgress[] {
  return Object.values(state.progress).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function selectWatchedTitles(
  state: LibraryState,
  type?: MediaType,
): WatchHistoryItem[] {
  return state.history.filter(
    (entry) => entry.state === "watched" && (!type || entry.type === type),
  );
}

export function selectRecentlyWatched(state: LibraryState): WatchHistoryItem[] {
  return [...state.history].sort(
    (a, b) => Date.parse(b.watchedAt) - Date.parse(a.watchedAt),
  );
}

export interface LibraryStats {
  moviesWatched: number;
  seriesWatched: number;
  watchlistCount: number;
  hoursWatched: number;
  ratingsCount: number;
  favoritesCount: number;
}

export function selectStats(state: LibraryState): LibraryStats {
  const totalMinutes =
    state.history.reduce((sum, entry) => sum + (entry.minutes || 0), 0) +
    Object.values(state.episodes).reduce(
      (sum, map) => sum + Object.keys(map).length * ASSUMED_EPISODE_RUNTIME,
      0,
    );

  return {
    moviesWatched: selectWatchedTitles(state, "movie").length,
    seriesWatched: new Set(
      state.history
        .filter((entry) => entry.type === "series")
        .map((entry) => entry.id),
    ).size,
    watchlistCount: state.watchlist.length,
    hoursWatched: Math.round(totalMinutes / 60),
    ratingsCount: Object.keys(state.ratings).length,
    favoritesCount: state.favorites.length,
  };
}

export function sortWatchlist(
  items: WatchlistItem[],
  sort: WatchlistSort,
): WatchlistItem[] {
  const copy = [...items];
  switch (sort) {
    case "rating":
      return copy.sort((a, b) => b.rating - a.rating);
    case "release_date":
      return copy.sort((a, b) => b.year - a.year);
    case "alphabetical":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "recently_added":
    default:
      return copy.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
  }
}
