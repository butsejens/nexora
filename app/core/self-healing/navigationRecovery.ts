import { router } from "expo-router";

import { logSelfHealing } from "./logger";

export const SAFE_HOME_ROUTE = "/(tabs)/home";

/** Tab screen names — expo-router pathname omits the /(tabs) group on web. */
const TAB_ROUTES = new Set([
  "home",
  "live-tv",
  "series",
  "movies",
  "kids",
  "collection",
  "studios",
  "my-list",
  "search",
  "more",
  "smart-feed",
  "downloads",
  "favorites",
  "index",
]);

export function isSafeRoute(path: string | null | undefined): boolean {
  const value = String(path || "").trim();
  if (!value) return false;
  if (value.startsWith("/(tabs)")) return true;
  if (value.startsWith("/media/")) return true;

  // Pathname without group prefix, e.g. "/movies" or "/home"
  const segment = value.replace(/^\//, "").split("/")[0] || "";
  if (TAB_ROUTES.has(segment)) return true;

  if (
    value === "/profile" ||
    value === "/settings" ||
    value === "/premium" ||
    value === "/player" ||
    value === "/auth" ||
    value === "/select-profile" ||
    value === "/manage-profiles" ||
    value === "/legal" ||
    value === "/detail" ||
    value.startsWith("/detail")
  ) {
    return true;
  }
  return false;
}

export function recoverNavigation(reason: string, context?: Record<string, unknown>) {
  void logSelfHealing("warn", "NAV", "recover-navigation-home", {
    reason,
    ...context,
  });
  try {
    router.replace(SAFE_HOME_ROUTE as any);
  } catch {
    // ignore
  }
}
