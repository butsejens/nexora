export const COLORS = {
  // Core backgrounds — deep navy sports broadcast palette
  background:   "#070B1A",
  surface:      "#0D1221",
  card:         "#11162A",
  cardElevated: "#182035",
  cardBright:   "#1E2740",

  // Accent — SofaScore-inspired coral red
  accent:          "#FF2D55",
  accentDim:       "#CC2444",
  accentGlow:      "rgba(255, 45, 85, 0.22)",
  accentGlowStrong:"rgba(255, 45, 85, 0.40)",

  // Live indicator
  live:     "#FF3B5C",
  liveGlow: "rgba(255, 59, 92, 0.28)",

  // Text hierarchy
  text:          "#FFFFFF",
  textSecondary: "#A8B0D3",
  textMuted:     "#5A6180",
  textFaint:     "#383E5C",

  // Borders
  border:      "#1E2740",
  borderLight: "#2A3350",
  borderGlow:  "rgba(255, 45, 85, 0.20)",

  // Status
  gold:  "#FFD700",
  green: "#00E676",
  blue:  "#3A7EFF",
  yellow:"#FFB300",

  // Overlays
  overlay:      "rgba(7, 11, 26, 0.90)",
  overlayLight: "rgba(17, 22, 42, 0.80)",
  overlayCard:  "rgba(7, 11, 26, 0.60)",

  // Tab bar
  tabBar:       "#0A0F1E",
  tabBarBorder: "#1E2740",
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
