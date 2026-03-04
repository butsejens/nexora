export const COLORS = {
  background: "#0B0B0F",
  surface: "#15151A",
  card: "#1B1B21",
  cardElevated: "#26262E",
  accent: "#E50914",
  accentDim: "#B20710",
  accentGlow: "rgba(229, 9, 20, 0.22)",
  accentGlowStrong: "rgba(229, 9, 20, 0.36)",
  live: "#FF3040",
  liveGlow: "rgba(255, 48, 64, 0.24)",
  text: "#FFFFFF",
  textSecondary: "#D3D3DB",
  textMuted: "#9B9BA6",
  border: "#2F2F37",
  borderLight: "#44444F",
  gold: "#FFD700",
  green: "#00E676",
  overlay: "rgba(0, 0, 0, 0.84)",
  overlayLight: "rgba(18, 18, 24, 0.74)",
  tabBar: "#101015",
  tabBarBorder: "#2C2C34",
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
