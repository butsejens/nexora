/**
 * Nexora — Live TV (tijdelijk niet beschikbaar)
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";

export default function LiveTvScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: TOP_NAV_H + insets.top }]}>
      <LinearGradient
        colors={["rgba(220,38,38,0.12)", "transparent"]}
        style={StyleSheet.absoluteFillObject}
        locations={[0, 0.45]}
      />

      {/* Pulse icon */}
      <View style={styles.iconWrap}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>📡</Text>
        </View>
      </View>

      <Text style={styles.badge}>LIVE</Text>
      <Text style={styles.title}>Tijdelijk niet beschikbaar</Text>
      <Text style={styles.subtitle}>
        Live TV is momenteel in opbouw.{"\n"}We verwachten dit binnenkort te
        lanceren.
      </Text>

      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.pillText}>Binnenkort verwacht</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(220,38,38,0.12)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 38,
  },
  badge: {
    color: "#ef4444",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
    marginBottom: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(220,38,38,0.08)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.22)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: "#ef4444",
  },
  pillText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
