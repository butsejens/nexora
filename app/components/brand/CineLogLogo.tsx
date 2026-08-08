/**
 * CineLog brand mark — a film frame whose perforations form the opening of a
 * "C". Works as an app icon, a nav logo and a splash mark.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { COLORS, FONTS } from "@/constants/theme";

export interface CineLogMarkProps {
  size?: number;
}

/**
 * Film-strip perforations beside an open reel that reads as the "C" of CineLog.
 * Geometry mirrors `assets/images/logo.svg` so the in-app mark and the app icon
 * stay identical; both are authored on a 512-unit grid.
 */
export function CineLogMark({ size = 32 }: CineLogMarkProps) {
  const perforations = [92, 178, 264, 350];

  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="cinelogMark" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={COLORS.accentBright} />
          <Stop offset="1" stopColor={COLORS.accentDeep} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={512} height={512} rx={133} fill="url(#cinelogMark)" />
      {perforations.map((y) => (
        <Rect
          key={y}
          x={58}
          y={y}
          width={52}
          height={52}
          rx={18}
          fill={COLORS.textPrimary}
          opacity={0.95}
        />
      ))}
      <Path
        d="M 397.7 176.9 A 118 118 0 1 0 397.7 335.1"
        fill="none"
        stroke={COLORS.textPrimary}
        strokeWidth={54}
        strokeLinecap="round"
      />
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
