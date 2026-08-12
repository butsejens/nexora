/**
 * CineLog — design tokens
 *
 * Single source of truth for colour, spacing, radius, typography and elevation.
 * Components must never invent their own colours or one-off spacing values.
 *
 * Colour is split in two:
 *
 *  - `Palette` (dark / light) covers app chrome and is resolved at runtime from
 *    the viewer's Appearance setting. Read it with `useTheme()`.
 *  - `ARTWORK` covers anything drawn *on top of* a poster or backdrop. Those
 *    surfaces stay dark with light text in both schemes, because photography
 *    doesn't get lighter when the app chrome does. CineLog keeps its hero
 *    cinematic either way.
 */

export interface Palette {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfaceSunken: string;

  accent: string;
  accentBright: string;
  accentDeep: string;
  accentSoft: string;
  accentGlow: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;

  border: string;
  borderStrong: string;
  glass: string;
  glassStrong: string;

  success: string;
  warning: string;
  error: string;
  info: string;

  star: string;

  overlay: string;
  overlayStrong: string;
  scrim: string;

  skeleton: string;
  skeletonHighlight: string;
}

export const DARK_PALETTE: Palette = {
  // Surfaces — charcoal-to-black cinematic stack
  background: "#08090B",
  backgroundAlt: "#0B0D10",
  surface: "#101216",
  surfaceElevated: "#171A20",
  surfaceHover: "#1E222A",
  surfaceSunken: "#050608",

  // Accent — CineLog crimson
  accent: "#E8112D",
  accentBright: "#FF3B5C",
  accentDeep: "#B00C22",
  accentSoft: "rgba(232, 17, 45, 0.14)",
  accentGlow: "rgba(232, 17, 45, 0.32)",

  textPrimary: "#F5F6F8",
  textSecondary: "#9BA1AC",
  textMuted: "#6B7280",
  textFaint: "#3F444D",
  textInverse: "#08090B",

  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  glass: "rgba(255, 255, 255, 0.06)",
  glassStrong: "rgba(255, 255, 255, 0.12)",

  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  star: "#F5C518",

  overlay: "rgba(8, 9, 11, 0.82)",
  overlayStrong: "rgba(8, 9, 11, 0.94)",
  scrim: "rgba(0, 0, 0, 0.45)",

  skeleton: "#15181D",
  skeletonHighlight: "#22262E",
};

/**
 * Light scheme. The accent is darkened so it still clears WCAG AA against white,
 * and text greys are inverted rather than merely lightened.
 */
export const LIGHT_PALETTE: Palette = {
  background: "#FFFFFF",
  backgroundAlt: "#F7F8FA",
  surface: "#F3F5F8",
  surfaceElevated: "#FFFFFF",
  surfaceHover: "#E9EDF2",
  surfaceSunken: "#DFE4EA",

  accent: "#C80C24",
  accentBright: "#E8112D",
  accentDeep: "#96091B",
  accentSoft: "rgba(200, 12, 36, 0.10)",
  accentGlow: "rgba(200, 12, 36, 0.24)",

  textPrimary: "#0B0D10",
  textSecondary: "#4A525D",
  textMuted: "#6B7280",
  textFaint: "#A3AAB4",
  textInverse: "#FFFFFF",

  border: "rgba(11, 13, 16, 0.10)",
  borderStrong: "rgba(11, 13, 16, 0.20)",
  glass: "rgba(11, 13, 16, 0.04)",
  glassStrong: "rgba(11, 13, 16, 0.09)",

  success: "#15803D",
  warning: "#B45309",
  error: "#DC2626",
  info: "#1D4ED8",

  star: "#B58100",

  overlay: "rgba(255, 255, 255, 0.86)",
  overlayStrong: "rgba(255, 255, 255, 0.96)",
  scrim: "rgba(0, 0, 0, 0.35)",

  skeleton: "#E6E9EE",
  skeletonHighlight: "#F2F4F7",
};

/** Fixed tokens for surfaces drawn over artwork, identical in both schemes. */
export const ARTWORK = {
  textPrimary: "#F5F6F8",
  textSecondary: "#C6CBD3",
  textMuted: "#9BA1AC",
  /** Translucent chip behind a rating badge or a floating control. */
  chip: "rgba(8, 9, 11, 0.72)",
  chipHover: "rgba(8, 9, 11, 0.88)",
  border: "rgba(255, 255, 255, 0.18)",
  /** Track behind a progress bar sitting on a poster. */
  progressTrack: "rgba(255, 255, 255, 0.24)",
  placeholder: "#15181D",
  star: "#F5C518",
  /** Full-bleed dark scrim behind a video modal. */
  scrimStrong: "rgba(8, 9, 11, 0.94)",
} as const;

/** Vertical gradient stops that keep hero text readable over artwork. */
export const HERO_SCRIM = [
  "rgba(8, 9, 11, 0)",
  "rgba(8, 9, 11, 0.35)",
  "rgba(8, 9, 11, 0.82)",
  "rgba(8, 9, 11, 1)",
] as const;

/**
 * Detail-page backdrop scrim. Unlike the hero, the title sits just below the
 * artwork rather than on it, so this fades into the page background and the
 * copy keeps using the palette's text colours.
 */
export const BACKDROP_SCRIM = {
  dark: [
    "rgba(8, 9, 11, 0)",
    "rgba(8, 9, 11, 0.45)",
    "rgba(8, 9, 11, 0.9)",
    "rgba(8, 9, 11, 1)",
  ],
  light: [
    "rgba(255, 255, 255, 0)",
    "rgba(255, 255, 255, 0.35)",
    "rgba(255, 255, 255, 0.88)",
    "rgba(255, 255, 255, 1)",
  ],
} as const;

/** Left-to-right scrim for wide (desktop) hero layouts. */
export const HERO_SCRIM_SIDE = [
  "rgba(8, 9, 11, 0.96)",
  "rgba(8, 9, 11, 0.72)",
  "rgba(8, 9, 11, 0.1)",
] as const;

/** Bottom gradient applied to poster cards so the title stays legible. */
export const CARD_SCRIM = [
  "rgba(8, 9, 11, 0)",
  "rgba(8, 9, 11, 0.7)",
  "rgba(8, 9, 11, 0.95)",
] as const;

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const FONTS = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
} as const;

export interface BoxShadow {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  color: string;
}

export interface ShadowSet {
  card: { boxShadow: BoxShadow[] };
  raised: { boxShadow: BoxShadow[] };
}

/**
 * `boxShadow` replaces the per-platform `shadow*` props, which react-native-web
 * deprecated and which never rendered consistently on Android. Light mode needs
 * a softer shadow — the dark values read as smudges on white.
 */
export const SHADOWS: Record<"dark" | "light", ShadowSet> = {
  dark: {
    card: {
      boxShadow: [
        { offsetX: 0, offsetY: 6, blurRadius: 12, color: "rgba(0, 0, 0, 0.4)" },
      ],
    },
    raised: {
      boxShadow: [
        {
          offsetX: 0,
          offsetY: 12,
          blurRadius: 24,
          color: "rgba(0, 0, 0, 0.5)",
        },
      ],
    },
  },
  light: {
    card: {
      boxShadow: [
        {
          offsetX: 0,
          offsetY: 4,
          blurRadius: 10,
          color: "rgba(11, 13, 16, 0.12)",
        },
      ],
    },
    raised: {
      boxShadow: [
        {
          offsetX: 0,
          offsetY: 10,
          blurRadius: 24,
          color: "rgba(11, 13, 16, 0.18)",
        },
      ],
    },
  },
};

/** Breakpoints (dp) used for the responsive grid and navigation switch. */
export const BREAKPOINTS = {
  /** Below this width we use the mobile layout with bottom navigation. */
  mobile: 768,
  tablet: 1024,
  desktop: 1440,
} as const;

export const LAYOUT = {
  bottomNavHeight: 62,
  topNavHeight: 68,
  maxContentWidth: 1600,
  railGap: SPACING.md,
} as const;

export const ANIM = {
  fast: 140,
  base: 220,
  slow: 360,
  hoverScale: 1.03,
  pressScale: 0.97,
} as const;
