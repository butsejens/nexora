/** CineLog — routing helpers so title links stay consistent across screens. */

import { router } from "expo-router";

import type { LibraryEntryRef, MediaSummary, MediaType } from "@/lib/cinelog/types";

export function titleHref(type: MediaType, tmdbId: number): string {
  return type === "movie" ? `/movie/${tmdbId}` : `/series/${tmdbId}`;
}

export function openTitle(item: Pick<MediaSummary | LibraryEntryRef, "type" | "tmdbId">) {
  router.push(titleHref(item.type, item.tmdbId) as never);
}

export function openPerson(personId: number) {
  router.push(`/person/${personId}` as never);
}

export function goToTab(route: string) {
  router.navigate(`/(tabs)${route}` as never);
}

/** Parse a `[id]` route param that may arrive as a string or string array. */
export function parseIdParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
