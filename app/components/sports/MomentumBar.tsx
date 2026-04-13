import React from "react";
import { View, StyleSheet } from "react-native";

import { COLORS } from "@/constants/colors";

type MomentumBarProps = {
  model?: any;
  value?: number;
  compact?: boolean;
  homeLabel?: string;
  awayLabel?: string;
  height?: number;
};

export function MomentumBar({ model, value = 50, height = 6 }: MomentumBarProps) {
  const modelValue =
    Number(model?.homeMomentum ?? model?.home ?? (100 - Number(model?.awayMomentum ?? model?.away ?? 0))) ||
    value;
  const safe = Math.max(0, Math.min(100, modelValue));
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${safe}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
});
