export const COLORS = {
  background: "#09090D",
  surface: "#14141B",
  card: "#1A1A23",
  cardElevated: "#242432",
  accent: "#E50914",
  accentDim: "#B20710",
  accentGlow: "rgba(229, 9, 20, 0.22)",
  accentGlowStrong: "rgba(229, 9, 20, 0.36)",
  live: "#FF3040",
  liveGlow: "rgba(255, 48, 64, 0.24)",
  text: "#FFFFFF",
  textSecondary: "#D8D8E2",
  textMuted: "#9D9DAA",
  border: "#30303C",
  borderLight: "#49495A",
  gold: "#FFD700",
  green: "#00E676",
  overlay: "rgba(4, 4, 10, 0.84)",
  overlayLight: "rgba(20, 20, 30, 0.72)",
  tabBar: "#111119",
  tabBarBorder: "#323242",
};

export default {
  light: {
    text: COLORS.text,
    background: COLORS.background,
    tint: COLORS.accent,
    tabIconDefault: COLORS.textMuted,
    tabIconSelected: COLORS.accent,
  },
};
