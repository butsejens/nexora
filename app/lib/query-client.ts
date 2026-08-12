/**
 * CineLog — React Query client.
 *
 * Movie metadata changes slowly, so cached data stays fresh for a long time and
 * inactive queries are kept in memory long enough to make back-navigation feel
 * instant without refetching.
 */

import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";

// Keep React Query's "focused" state accurate on native so per-query
// refetchOnWindowFocus overrides behave the same as on web.
focusManager.setEventListener((onFocus) => {
  const subscription = AppState.addEventListener("change", (state) => {
    onFocus(state === "active");
  });
  return () => subscription.remove();
});

export const STALE = {
  /** Trending and "now playing" style lists. */
  short: 10 * 60 * 1000,
  /** Catalogue pages and genre browses. */
  medium: 60 * 60 * 1000,
  /** Detail pages, cast, seasons — effectively immutable. */
  long: 12 * 60 * 60 * 1000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.medium,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 0,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: false },
  },
});
