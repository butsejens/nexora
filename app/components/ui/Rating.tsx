/**
 * CineLog — rating display and input.
 *
 * `RatingBadge` shows the TMDB community score; `RatingInput` lets the viewer
 * score a title from 1–10 and shows the average alongside their own rating.
 */

import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useT } from "@/i18n";
import { ARTWORK, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
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
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const formatted = formatRating(value);
  if (!formatted) return null;
  const iconSize = size === "sm" ? 11 : 14;

  return (
    <View
      style={[styles.badge, onArtwork ? styles.badgeOnArtwork : null]}
      accessible
      accessibilityLabel={t("Rated {{rating}} out of 10", {
        rating: formatted,
      })}
    >
      <Ionicons
        name="star"
        size={iconSize}
        color={onArtwork ? ARTWORK.star : colors.star}
      />
      <Text
        style={[
          styles.badgeText,
          size === "md" ? styles.badgeTextMd : null,
          onArtwork ? styles.badgeTextOnArtwork : null,
        ]}
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
  const t = useT();
  const styles = useStyles();
  const average = formatRating(averageRating);

  return (
    <View style={styles.inputBlock}>
      <View style={styles.inputHeader}>
        <Text style={styles.inputTitle}>{t("Your rating")}</Text>
        {value ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={t("Remove your rating")}
          >
            <Text style={styles.clear}>{t("Remove")}</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.scale}
        accessibilityRole="adjustable"
        accessibilityLabel={t("Rate this title from 1 to 10")}
        accessibilityValue={{ min: 1, max: 10, now: value ?? 0 }}
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => {
          const active = value !== null && score <= value;
          return (
            <Pressable
              key={score}
              onPress={() => onChange(score)}
              accessibilityRole="button"
              accessibilityLabel={t("Rate {{score}} out of 10", { score })}
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
          ? t("You rated this {{score}}/10", { score: value })
          : t("Tap a number to rate this title")}
        {average ? ` • ${t("Average {{rating}}", { rating: average })}` : ""}
        {voteCount
          ? ` ${t("from {{count}} ratings", { count: formatCount(voteCount) })}`
          : ""}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  badgeOnArtwork: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: ARTWORK.chip,
  },
  badgeText: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: c.textPrimary,
  },
  badgeTextMd: {
    fontSize: 14,
  },
  badgeTextOnArtwork: {
    color: ARTWORK.textPrimary,
  },
  inputBlock: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  inputHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: c.textPrimary,
  },
  clear: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
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
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
  },
  scoreDotActive: {
    backgroundColor: c.accentSoft,
    borderColor: c.accent,
  },
  scoreDotHovered: {
    borderColor: c.accentBright,
  },
  scoreText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: c.textSecondary,
  },
  scoreTextActive: {
    color: c.textPrimary,
  },
  summary: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: c.textMuted,
  },
}));
