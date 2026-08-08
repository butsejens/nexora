/**
 * CineLog — design tokens
 *
 * Single source of truth for colour, spacing, radius, typography and elevation.
 * Components must never invent their own colours or one-off spacing values.
 */

export const COLORS = {
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

  // Text hierarchy
  textPrimary: "#F5F6F8",
  textSecondary: "#9BA1AC",
  textMuted: "#6B7280",
  textFaint: "#3F444D",
  textInverse: "#08090B",

  // Lines & glass
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  glass: "rgba(255, 255, 255, 0.06)",
  glassStrong: "rgba(255, 255, 255, 0.12)",

  // Status
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  // Rating star
  star: "#F5C518",

  // Overlays / scrims
  overlay: "rgba(8, 9, 11, 0.82)",
  overlayStrong: "rgba(8, 9, 11, 0.94)",
  scrim: "rgba(0, 0, 0, 0.45)",

  // Skeleton shimmer
  skeleton: "#15181D",
  skeletonHighlight: "#22262E",
} as const;

/** Vertical gradient stops used to keep hero text readable over artwork. */
export const HERO_SCRIM = [
  "rgba(8, 9, 11, 0)",
  "rgba(8, 9, 11, 0.35)",
  "rgba(8, 9, 11, 0.82)",
  "rgba(8, 9, 11, 1)",
] as const;

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

export const TYPE = {
  display: { fontFamily: FONTS.extrabold, fontSize: 34, lineHeight: 40 },
  h1: { fontFamily: FONTS.bold, fontSize: 26, lineHeight: 32 },
  h2: { fontFamily: FONTS.bold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: FONTS.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FONTS.medium, fontSize: 11, lineHeight: 15 },
  label: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16 },
} as const;

/**
 * `boxShadow` replaces the per-platform `shadow*` props, which react-native-web
 * deprecated and which never rendered consistently on Android.
 */
export const SHADOWS = {
  card: {
    boxShadow: [
      { offsetX: 0, offsetY: 6, blurRadius: 12, color: "rgba(0, 0, 0, 0.4)" },
    ],
  },
  raised: {
    boxShadow: [
      { offsetX: 0, offsetY: 12, blurRadius: 24, color: "rgba(0, 0, 0, 0.5)" },
    ],
  },
  accent: {
    boxShadow: [
      { offsetX: 0, offsetY: 6, blurRadius: 16, color: COLORS.accentGlow },
    ],
  },
} as const;

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
