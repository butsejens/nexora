/**
 * CineLog — episode row.
 *
 * Shows the still, runtime, air date and description, plus a watched toggle so
 * viewers can track exactly where they are in a season.
 */

import React from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { formatDate, formatRuntime, metaLine } from "@/lib/format";
import type { Episode } from "@/lib/cinelog/types";
import { Pressable } from "@/components/ui/Pressable";

export interface EpisodeCardProps {
  episode: Episode;
  watched: boolean;
  onToggleWatched: () => void;
  /** True for the next unwatched episode, which gets the "up next" accent. */
  isUpNext?: boolean;
  stillWidth: number;
}

export function EpisodeCard({
  episode,
  watched,
  onToggleWatched,
  isUpNext = false,
  stillWidth,
}: EpisodeCardProps) {
  const stillHeight = Math.round((stillWidth * 9) / 16);
  const meta = metaLine([
    formatRuntime(episode.runtime),
    formatDate(episode.airDate),
  ]);

  return (
    <View style={[styles.row, isUpNext ? styles.rowUpNext : null]}>
      <View style={[styles.stillWrap, { width: stillWidth, height: stillHeight }]}>
        {episode.still ? (
          <Image
            source={{ uri: episode.still }}
            style={styles.still}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            accessibilityLabel={`Still from ${episode.title}`}
          />
        ) : (
          <View style={[styles.still, styles.stillFallback]}>
            <Ionicons name="image-outline" size={20} color={COLORS.textFaint} />
          </View>
        )}
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{episode.episodeNumber}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {episode.title}
          </Text>
          {isUpNext ? <Text style={styles.upNext}>Up next</Text> : null}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {episode.overview ? (
          <Text style={styles.overview} numberOfLines={3}>
            {episode.overview}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onToggleWatched}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: watched }}
        accessibilityLabel={
          watched
            ? `Mark episode ${episode.episodeNumber}, ${episode.title}, as unwatched`
            : `Mark episode ${episode.episodeNumber}, ${episode.title}, as watched`
        }
        hitSlop={8}
        style={({ hovered }) => [
          styles.check,
          watched ? styles.checkOn : null,
          hovered ? styles.checkHovered : null,
        ]}
      >
        <Ionicons
          name={watched ? "checkmark" : "ellipse-outline"}
          size={16}
          color={watched ? COLORS.textPrimary : COLORS.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowUpNext: {
    borderColor: COLORS.accentGlow,
    backgroundColor: COLORS.surfaceElevated,
  },
  stillWrap: {
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceElevated,
  },
  still: {
    width: "100%",
    height: "100%",
  },
  stillFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  numberBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
  },
  numberText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  upNext: {
    fontFamily: FONTS.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.accent,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  overview: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "center",
  },
  checkOn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkHovered: {
    borderColor: COLORS.borderStrong,
  },
});
