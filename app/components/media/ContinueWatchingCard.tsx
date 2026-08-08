/**
 * CineLog — Continue Watching card.
 *
 * A landscape card showing where the viewer left off, including the episode code
 * for series and a progress bar with a Continue action.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { IconButton } from "@/components/ui/Button";
import { TouchableScale } from "@/components/ui/Pressable";
import {
  CARD_SCRIM,
  COLORS,
  FONTS,
  RADIUS,
  SHADOWS,
  SPACING,
} from "@/constants/theme";
import { formatEpisodeCode } from "@/lib/format";
import type { WatchProgress } from "@/lib/cinelog/types";

export interface ContinueWatchingCardProps {
  progress: WatchProgress;
  width: number;
  onPress: () => void;
  onRemove: () => void;
}

export function ContinueWatchingCard({
  progress,
  width,
  onPress,
  onRemove,
}: ContinueWatchingCardProps) {
  const height = Math.round((width * 9) / 16);
  const episodeCode = formatEpisodeCode(
    progress.seasonNumber,
    progress.episodeNumber,
  );
  const artwork = progress.backdrop ?? progress.poster;

  return (
    // Remove sits outside the pressable card so the two buttons aren't nested.
    <View style={{ width }}>
      <TouchableScale
        onPress={onPress}
        style={{ width }}
        accessibilityRole="button"
        accessibilityLabel={`Continue watching ${progress.title}${
          episodeCode ? `, ${episodeCode}` : ""
        }${progress.percent > 0 ? `, ${progress.percent} percent complete` : ""}`}
      >
        <View style={[styles.card, { width, height }]}>
          {artwork ? (
            <Image
              source={{ uri: artwork }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : null}
          <LinearGradient colors={CARD_SCRIM} style={styles.overlay}>
            <View style={styles.bottom}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color={COLORS.textPrimary} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>
                  {progress.title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {episodeCode
                    ? `${episodeCode}${progress.episodeTitle ? ` · ${progress.episodeTitle}` : ""}`
                    : "Continue"}
                </Text>
              </View>
              {progress.percent > 0 ? (
                <Text style={styles.percent}>{progress.percent}%</Text>
              ) : null}
            </View>
          </LinearGradient>
          {progress.percent > 0 ? (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, progress.percent)}%` },
                ]}
              />
            </View>
          ) : null}
        </View>
      </TouchableScale>

      <View style={styles.removeSlot}>
        <IconButton
          icon="close"
          label={`Remove ${progress.title} from Continue Watching`}
          onPress={onRemove}
          size={28}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: SPACING.sm,
  },
  removeSlot: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  playCircle: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  percent: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.accent,
  },
});
