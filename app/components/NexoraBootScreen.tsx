import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { COLORS } from "@/constants/colors";

interface Props {
  progress: number;
  message: string;
}

export function NexoraBootScreen({ progress, message }: Props) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#160b12", "#0e0f17", COLORS.background]}
        style={styles.bg}
      />

      <View style={styles.centerWrap}>
        <Text style={styles.logoText}>
          <Text style={styles.logoN}>N</Text>
          <Text style={styles.logoRest}>EXORA</Text>
        </Text>

        <BlurView intensity={60} tint="dark" style={styles.card}>
          <Text style={styles.title}>App wordt voorbereid</Text>
          <Text style={styles.subtitle}>{message}</Text>

          <View style={styles.barTrack}>
            <LinearGradient
              colors={[COLORS.accent, "#ff4050"]}
              style={[styles.barFill, { width: `${safeProgress}%` }]}
            />
          </View>

          <Text style={styles.percent}>{safeProgress}%</Text>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  bg: { ...StyleSheet.absoluteFillObject },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 18,
  },
  logoText: {
    fontSize: 38,
    letterSpacing: 5,
    fontWeight: "800",
  },
  logoN: { color: COLORS.accent },
  logoRest: { color: COLORS.text },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.overlayLight,
    padding: 16,
    gap: 10,
    overflow: "hidden",
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  barTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: COLORS.cardElevated,
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  percent: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
});
