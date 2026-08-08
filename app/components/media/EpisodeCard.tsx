/**
 * CineLog — episode row.
 *
 * Shows the still, runtime, air date and description, plus a watched toggle so
 * viewers can track exactly where they are in a season.
 */

import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { ARTWORK, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
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
  const { colors } = useTheme();
  const styles = useStyles();
  const stillHeight = Math.round((stillWidth * 9) / 16);
  const meta = metaLine([
    formatRuntime(episode.runtime),
    formatDate(episode.airDate),
  ]);

  return (
    <View style={[styles.row, isUpNext ? styles.rowUpNext : null]}>
      <View
        style={[styles.stillWrap, { width: stillWidth, height: stillHeight }]}
      >
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
            <Ionicons name="image-outline" size={20} color={colors.textFaint} />
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
          color={watched ? colors.textPrimary : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  row: {
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  rowUpNext: {
    borderColor: c.accentGlow,
    backgroundColor: c.surfaceElevated,
  },
  stillWrap: {
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    backgroundColor: c.surfaceElevated,
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
    backgroundColor: ARTWORK.chip,
    alignItems: "center",
  },
  numberText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: ARTWORK.textPrimary,
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
    color: c.textPrimary,
    flexShrink: 1,
  },
  upNext: {
    fontFamily: FONTS.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: c.accent,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: c.textMuted,
  },
  overview: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
    color: c.textSecondary,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    alignSelf: "center",
  },
  checkOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  checkHovered: {
    borderColor: c.borderStrong,
  },
}));
