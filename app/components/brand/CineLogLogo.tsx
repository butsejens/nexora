/**
 * CineLog brand mark — a film frame whose perforations form the opening of a
 * "C". Works as an app icon, a nav logo and a splash mark.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { COLORS, FONTS } from "@/constants/theme";

export interface CineLogMarkProps {
  size?: number;
}

export function CineLogMark({ size = 32 }: CineLogMarkProps) {
  const radius = size * 0.26;
  const perfSize = size * 0.115;
  const perfRadius = perfSize * 0.35;
  // Perforations run down the left edge and along the top and bottom, leaving
  // the right edge open so the frame reads as a "C".
  const perforations = [
    { x: 0.115, y: 0.2 },
    { x: 0.115, y: 0.44 },
    { x: 0.115, y: 0.68 },
    { x: 0.36, y: 0.115 },
    { x: 0.6, y: 0.115 },
    { x: 0.36, y: 0.77 },
    { x: 0.6, y: 0.77 },
  ];

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="cinelogMark" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={COLORS.accentBright} />
          <Stop offset="1" stopColor={COLORS.accentDeep} />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width={size}
        height={size}
        rx={radius}
        fill="url(#cinelogMark)"
      />
      {perforations.map((perf) => (
        <Rect
          key={`${perf.x}-${perf.y}`}
          x={size * perf.x}
          y={size * perf.y}
          width={perfSize}
          height={perfSize}
          rx={perfRadius}
          fill={COLORS.textPrimary}
          opacity={0.95}
        />
      ))}
    </Svg>
  );
}

export interface CineLogLogoProps {
  size?: number;
  /** Show the "Discover. Track. Watch." tagline under the wordmark. */
  showTagline?: boolean;
  /** Hide the wordmark and render the mark on its own. */
  markOnly?: boolean;
}

export function CineLogLogo({
  size = 30,
  showTagline = false,
  markOnly = false,
}: CineLogLogoProps) {
  if (markOnly) return <CineLogMark size={size} />;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="header"
      accessibilityLabel="CineLog"
    >
      <CineLogMark size={size} />
      <View>
        <Text style={[styles.wordmark, { fontSize: size * 0.68 }]}>
          Cine<Text style={styles.wordmarkAccent}>Log</Text>
        </Text>
        {showTagline ? (
          <Text style={styles.tagline}>Discover. Track. Watch.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wordmark: {
    fontFamily: FONTS.extrabold,
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  wordmarkAccent: {
    color: COLORS.accent,
  },
  tagline: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: COLORS.textMuted,
    marginTop: 1,
  },
});
