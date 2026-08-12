/**
 * CineLog — detail page header.
 *
 * Large backdrop with the poster alongside the title metadata. On phones the
 * poster and copy stack; from tablet width they sit side by side.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { GenrePill } from "@/components/ui/GenrePill";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { formatRating, metaLine } from "@/lib/format";

export interface TitleHeroProps {
  title: string;
  tagline?: string | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  /** Pre-composed metadata fragments, e.g. `["2026", "2h 14m", "PG-13"]`. */
  metaParts: (string | number | null | undefined)[];
  genres: string[];
  /** Action buttons rendered under the synopsis. */
  actions: React.ReactNode;
}

export function TitleHero({
  title,
  tagline,
  overview,
  poster,
  backdrop,
  rating,
  metaParts,
  genres,
  actions,
}: TitleHeroProps) {
  const { colors, backdropScrim } = useTheme();
  const styles = useStyles();
  const { isMobile, gutter, width } = useResponsive();
  const posterWidth = isMobile ? 130 : 240;
  const backdropHeight = isMobile ? 260 : Math.min(width * 0.42, 560);
  const score = formatRating(rating);

  return (
    <View>
      <View style={[styles.backdropWrap, { height: backdropHeight }]}>
        {backdrop || poster ? (
          <Image
            source={{ uri: backdrop ?? poster ?? "" }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={320}
            cachePolicy="memory-disk"
            accessibilityLabel={`${title} artwork`}
          />
        ) : null}
        <LinearGradient
          colors={[...backdropScrim] as [string, string, ...string[]]}
          locations={[0, 0.4, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View
        style={[
          styles.body,
          { paddingHorizontal: gutter },
          isMobile ? styles.bodyMobile : styles.bodyWide,
        ]}
      >
        <View
          style={[
            styles.posterWrap,
            { width: posterWidth, height: Math.round(posterWidth * 1.5) },
          ]}
        >
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={styles.poster}
              contentFit="cover"
              transition={220}
              cachePolicy="memory-disk"
              accessibilityLabel={`${title} poster`}
            />
          ) : (
            <View style={[styles.poster, styles.posterFallback]}>
              <Ionicons
                name="film-outline"
                size={30}
                color={colors.textFaint}
              />
            </View>
          )}
        </View>

        <View style={styles.copy}>
          <Text
            style={[styles.title, isMobile ? styles.titleMobile : null]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}

          <View style={styles.metaRow}>
            {score ? (
              <View style={styles.scoreChip}>
                <Ionicons name="star" size={14} color={colors.star} />
                <Text style={styles.scoreText}>{score}</Text>
              </View>
            ) : null}
            <Text style={styles.meta}>{metaLine(metaParts)}</Text>
          </View>

          {genres.length > 0 ? (
            <View style={styles.genreRow}>
              {genres.slice(0, 5).map((genre) => (
                <GenrePill key={genre} label={genre} />
              ))}
            </View>
          ) : null}

          {overview ? <Text style={styles.overview}>{overview}</Text> : null}

          <View style={styles.actions}>{actions}</View>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  backdropWrap: {
    width: "100%",
    backgroundColor: c.surfaceSunken,
  },
  body: {
    gap: SPACING.xl,
    // Pull the poster up so it overlaps the backdrop, as on a cinema one-sheet.
    marginTop: -70,
  },
  bodyMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  bodyWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  posterWrap: {
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    ...t.shadows.raised,
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceElevated,
  },
  copy: {
    flex: 1,
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    maxWidth: 760,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    color: c.textPrimary,
  },
  titleMobile: {
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.6,
  },
  tagline: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    fontStyle: "italic",
    color: c.textMuted,
    marginTop: -SPACING.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flexWrap: "wrap",
  },
  scoreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  scoreText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: c.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
    flexShrink: 1,
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  overview: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 23,
    color: c.textSecondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flexWrap: "wrap",
    paddingTop: SPACING.sm,
  },
}));
