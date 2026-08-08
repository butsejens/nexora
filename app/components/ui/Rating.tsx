/**
 * CineLog — rating display and input.
 *
 * `RatingBadge` shows the TMDB community score; `RatingInput` lets the viewer
 * score a title from 1–10 and shows the average alongside their own rating.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { formatCount, formatRating } from "@/lib/format";
import { Pressable } from "@/components/ui/Pressable";

export interface RatingBadgeProps {
  value: number;
  size?: "sm" | "md";
  /** Render on a translucent chip, for use over artwork. */
  onArtwork?: boolean;
}

export function RatingBadge({
  value,
  size = "sm",
  onArtwork = false,
}: RatingBadgeProps) {
  const formatted = formatRating(value);
  if (!formatted) return null;
  const iconSize = size === "sm" ? 11 : 14;

  return (
    <View
      style={[styles.badge, onArtwork ? styles.badgeOnArtwork : null]}
      accessible
      accessibilityLabel={`Rated ${formatted} out of 10`}
    >
      <Ionicons name="star" size={iconSize} color={COLORS.star} />
      <Text
        style={[styles.badgeText, size === "md" ? styles.badgeTextMd : null]}
      >
        {formatted}
      </Text>
    </View>
  );
}

export interface RatingInputProps {
  /** The viewer's score, 1–10, or `null` when they haven't rated it. */
  value: number | null;
  onChange: (score: number) => void;
  onClear: () => void;
  averageRating: number;
  voteCount: number;
}

export function RatingInput({
  value,
  onChange,
  onClear,
  averageRating,
  voteCount,
}: RatingInputProps) {
  const average = formatRating(averageRating);

  return (
    <View style={styles.inputBlock}>
      <View style={styles.inputHeader}>
        <Text style={styles.inputTitle}>Your rating</Text>
        {value ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Remove your rating"
          >
            <Text style={styles.clear}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.scale}
        accessibilityRole="adjustable"
        accessibilityLabel="Rate this title from 1 to 10"
        accessibilityValue={{ min: 1, max: 10, now: value ?? 0 }}
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => {
          const active = value !== null && score <= value;
          return (
            <Pressable
              key={score}
              onPress={() => onChange(score)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${score} out of 10`}
              accessibilityState={{ selected: value === score }}
              style={({ hovered, pressed }) => [
                styles.scoreDot,
                active ? styles.scoreDotActive : null,
                hovered || pressed ? styles.scoreDotHovered : null,
              ]}
            >
              <Text
                style={[
                  styles.scoreText,
                  active ? styles.scoreTextActive : null,
                ]}
              >
                {score}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.summary}>
        {value
          ? `You rated this ${value}/10`
          : "Tap a number to rate this title"}
        {average ? ` • Average ${average}` : ""}
        {voteCount ? ` from ${formatCount(voteCount)} ratings` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  badgeOnArtwork: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.overlay,
  },
  badgeText: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: COLORS.textPrimary,
  },
  badgeTextMd: {
    fontSize: 14,
  },
  inputBlock: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  clear: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  scale: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  scoreDot: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scoreDotActive: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accent,
  },
  scoreDotHovered: {
    borderColor: COLORS.accentBright,
  },
  scoreText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  scoreTextActive: {
    color: COLORS.textPrimary,
  },
  summary: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
