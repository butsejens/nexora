export const COLORS = {
  // Core backgrounds — Nexora premium streaming dark system
  background: "#06050A",
  surface: "#0A0814",
  card: "#0E0C1A",
  cardElevated: "#14112A",
  cardBright: "#1C1938",

  // Accent — Nexora purple-red premium gradient base
  accent: "#C026D3", // vibrant purple-magenta
  accentAlt: "#7C3AED", // deep violet
  accentRed: "#E50914", // Netflix red for backward compat
  accentDim: "#9A1FB3",
  accentGlow: "rgba(192, 38, 211, 0.22)",
  accentGlowStrong: "rgba(192, 38, 211, 0.42)",

  // Hero gradient colours
  heroGradientStart: "rgba(6, 5, 10, 0.0)",
  heroGradientMid: "rgba(6, 5, 10, 0.55)",
  heroGradientEnd: "rgba(6, 5, 10, 1.0)",

  // Live indicator
  live: "#EF4444",
  liveGlow: "rgba(239, 68, 68, 0.30)",

  // Streaming badge colours
  new: "#10B981", // green — "New"
  newGlow: "rgba(16, 185, 129, 0.20)",
  premium: "#F59E0B", // amber — "Premium"
  premiumGlow: "rgba(245, 158, 11, 0.20)",

  // Text hierarchy
  text: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",
  textFaint: "#3F3F46",

  // Borders
  border: "#1F1D30",
  borderLight: "#2E2C45",
  borderGlow: "rgba(192, 38, 211, 0.20)",

  // Status / utility
  gold: "#FFD700",
  green: "#00E676",
  blue: "#3A7EFF",
  cyan: "#2DD4FF",
  yellow: "#FFB300",
  warning: "#F59E0B",
  error: "#F87171",

  // Glass / transparent surfaces
  glass: "rgba(255, 255, 255, 0.04)",
  glassBorder: "rgba(255, 255, 255, 0.09)",

  // Skeleton animation
  skeleton: "#0E0C1A",
  skeletonHighlight: "#1C1830",

  // Overlays
  overlay: "rgba(6, 5, 10, 0.94)",
  overlayLight: "rgba(14, 12, 26, 0.84)",
  overlayCard: "rgba(6, 5, 10, 0.68)",

  // Tab bar
  tabBar: "#06050A",
  tabBarBorder: "#1F1D30",
  tabBarActive: "#C026D3",
  tabBarInactive: "#52506A",
};

export default {
  light: {
    text: COLORS.text,
    background: COLORS.background,
    tint: COLORS.accent,
    tabIconDefault: COLORS.tabBarInactive,
    tabIconSelected: COLORS.accent,
  },
};
