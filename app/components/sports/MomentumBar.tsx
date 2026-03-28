import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import type { MomentumModel } from "@/lib/ai/momentum-calculator";

type Props = {
  model: MomentumModel;
  compact?: boolean;
  homeLabel?: string;
  awayLabel?: string;
};

export function MomentumBar({ model, compact = false, homeLabel = "HOME", awayLabel = "AWAY" }: Props) {
  if (!model?.hasData) return null;

  return (
    <View style={[styles.wrap, compact ? styles.wrapCompact : null]}>
      <View style={styles.labelsRow}>
        <Text style={styles.label}>{homeLabel}</Text>
        <Text style={styles.centerLabel}>Momentum</Text>
        <Text style={styles.label}>{awayLabel}</Text>
      </View>
      <View style={[styles.track, compact ? styles.trackCompact : null]}>
        <LinearGradient
          colors={["#1FDB8E", "#0FAE6C"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.segment, { width: `${model.homePct}%` }]}
        />
        <LinearGradient
          colors={["#3E78FF", "#2C5ED9"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.segment, { width: `${model.awayPct}%` }]}
        />
      </View>
      <View style={styles.valuesRow}>
        <Text style={styles.value}>{model.homePct}%</Text>
        <Text style={styles.intensity}>Intensity {model.intensity}</Text>
        <Text style={styles.value}>{model.awayPct}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    marginTop: 10,
  },
  wrapCompact: {
    marginTop: 8,
    gap: 4,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
  },
  centerLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
  },
  trackCompact: {
    height: 7,
  },
  segment: {
    height: "100%",
  },
  valuesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  value: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  intensity: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});

export default MomentumBar;
