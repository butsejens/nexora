export const COLORS = {
  // Core backgrounds — cinematic pure black
  background:   "#000000",
  surface:      "#0A0A0A",
  card:         "#111111",
  cardElevated: "#1A1A1A",
  cardBright:   "#222222",

  // Accent — Netflix-inspired red
  accent:          "#E50914",
  accentDim:       "#B20710",
  accentGlow:      "rgba(229, 9, 20, 0.22)",
  accentGlowStrong:"rgba(229, 9, 20, 0.40)",

  // Live indicator
  live:     "#E50914",
  liveGlow: "rgba(229, 9, 20, 0.28)",

  // Text hierarchy
  text:          "#FFFFFF",
  textSecondary: "#A0A0A0",
  textMuted:     "#555555",
  textFaint:     "#333333",

  // Borders
  border:      "#1A1A1A",
  borderLight: "#2A2A2A",
  borderGlow:  "rgba(229, 9, 20, 0.20)",

  // Status
  gold:  "#FFD700",
  green: "#00E676",
  blue:  "#3A7EFF",
  yellow:"#FFB300",

  // Overlays
  overlay:      "rgba(0, 0, 0, 0.90)",
  overlayLight: "rgba(17, 17, 17, 0.80)",
  overlayCard:  "rgba(0, 0, 0, 0.60)",

  // Tab bar
  tabBar:       "#000000",
  tabBarBorder: "#1A1A1A",
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
