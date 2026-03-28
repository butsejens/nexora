export const COLORS = {
  // Core backgrounds — Nexora premium dark system
  background:   "#050505",
  surface:      "#080B12",
  card:         "#0B0F1A",
  cardElevated: "#12192A",
  cardBright:   "#1A2338",

  // Accent — Netflix-inspired red
  accent:          "#E50914",
  accentDim:       "#B20710",
  accentGlow:      "rgba(229, 9, 20, 0.22)",
  accentGlowStrong:"rgba(229, 9, 20, 0.40)",

  // Live indicator (subtle green)
  live:     "#22C55E",
  liveGlow: "rgba(34, 197, 94, 0.22)",

  // Text hierarchy
  text:          "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted:     "#71717A",
  textFaint:     "#3F3F46",

  // Borders
  border:      "#1F2937",
  borderLight: "#374151",
  borderGlow:  "rgba(229, 9, 20, 0.20)",

  // Status
  gold:  "#FFD700",
  green: "#00E676",
  blue:  "#3A7EFF",
  cyan:  "#2DD4FF",
  yellow:"#FFB300",

  // Overlays
  overlay:      "rgba(5, 5, 5, 0.92)",
  overlayLight: "rgba(11, 15, 26, 0.84)",
  overlayCard:  "rgba(5, 5, 5, 0.64)",

  // Tab bar
  tabBar:       "#050505",
  tabBarBorder: "#1F2937",
};

export default {
  light: {
    text:           COLORS.text,
    background:     COLORS.background,
    tint:           COLORS.accent,
    tabIconDefault: COLORS.textMuted,
    tabIconSelected:COLORS.accent,
  },
};
