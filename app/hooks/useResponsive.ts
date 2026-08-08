/**
 * CineLog — responsive layout helpers.
 *
 * CineLog is designed mobile-first: below `BREAKPOINTS.mobile` we show bottom
 * navigation and a two-column grid, and wider viewports progressively add
 * columns plus desktop-only affordances such as hover previews.
 */

import { useWindowDimensions, Platform } from "react-native";

import { BREAKPOINTS } from "@/constants/theme";

export interface Responsive {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Hover states only make sense with a pointer. */
  supportsHover: boolean;
  /** Poster columns for the browse grid. */
  gridColumns: number;
  /** Horizontal page padding. */
  gutter: number;
  /** Poster width used by the horizontal rails. */
  railPosterWidth: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isMobile = width < BREAKPOINTS.mobile;
  const isTablet = width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.tablet;

  const gridColumns = width >= 1800
    ? 8
    : width >= 1440
      ? 7
      : width >= BREAKPOINTS.tablet
        ? 6
        : width >= BREAKPOINTS.mobile
          ? 4
          : 2;

  const gutter = isMobile ? 16 : isTablet ? 24 : 32;

  const railPosterWidth = isMobile ? 124 : isTablet ? 150 : 168;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    supportsHover: Platform.OS === "web" && !isMobile,
    gridColumns,
    gutter,
    railPosterWidth,
  };
}
