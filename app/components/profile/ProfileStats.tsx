/** CineLog — viewing statistics grid shown on the profile page. */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import type { LibraryStats } from "@/store/library-store";

export interface ProfileStatsProps {
  stats: LibraryStats;
}

export function ProfileStats({ stats }: ProfileStatsProps) {
  const tiles = [
    { label: "Movies Watched", value: stats.moviesWatched },
    { label: "Series Watched", value: stats.seriesWatched },
    { label: "Watchlist", value: stats.watchlistCount },
    { label: "Hours Watched", value: stats.hoursWatched },
  ];

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <View
          key={tile.label}
          style={styles.tile}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}`}
        >
          <Text style={styles.value}>{tile.value}</Text>
          <Text style={styles.label}>{tile.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  value: {
    fontFamily: FONTS.extrabold,
    fontSize: 26,
    color: COLORS.textPrimary,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.textMuted,
  },
});
