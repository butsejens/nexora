/** CineLog — shared navigation definitions for the mobile and desktop shells. */

import type { Ionicons } from "@expo/vector-icons";

export interface NavItem {
  /** Route inside the tab group. */
  route: "/home" | "/movies" | "/series" | "/search" | "/watchlist";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

/** Bottom navigation on mobile; the first five items of the desktop nav. */
export const NAV_ITEMS: NavItem[] = [
  { route: "/home", label: "Home", icon: "home-outline", activeIcon: "home" },
  { route: "/movies", label: "Movies", icon: "film-outline", activeIcon: "film" },
  { route: "/series", label: "Series", icon: "tv-outline", activeIcon: "tv" },
  { route: "/search", label: "Search", icon: "search-outline", activeIcon: "search" },
  {
    route: "/watchlist",
    label: "Watchlist",
    icon: "heart-outline",
    activeIcon: "heart",
  },
];
