/**
 * CineLog — home hero.
 *
 * One featured title over its own backdrop. A vertical scrim (plus a horizontal
 * one on wide screens) keeps the copy readable regardless of the artwork.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  COLORS,
  FONTS,
  HERO_SCRIM,
  HERO_SCRIM_SIDE,
  RADIUS,
  SPACING,
} from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { formatRating, formatRuntime, formatSeasons, metaLine } from "@/lib/format";
import type { MediaSummary, Movie, Series } from "@/lib/cinelog/types";

export interface HeroBannerProps {
  item: MediaSummary | Movie | Series | null;
  isLoading?: boolean;
  onOpen: () => void;
  onWatchTrailer: () => void;
  onToggleWatchlist: () => void;
  inWatchlist: boolean;
  /** Certification such as "PG-13"; omitted when TMDB has none. */
  certification?: string | null;
}

export function HeroBanner({
  item,
  isLoading = false,
  onOpen,
  onWatchTrailer,
  onToggleWatchlist,
  inWatchlist,
  certification,
}: HeroBannerProps) {
  const { isMobile, gutter, height: viewportHeight } = useResponsive();
  const heroHeight = isMobile
    ? Math.max(440, Math.min(viewportHeight * 0.72, 620))
    : Math.max(480, Math.min(viewportHeight * 0.82, 760));

  if (isLoading || !item) {
    return (
      <View style={[styles.hero, { height: heroHeight }]}>
        <Skeleton width="100%" height={heroHeight} radius={0} />
        <View style={[styles.content, { paddingHorizontal: gutter }]}>
          <Skeleton width="55%" height={34} />
          <Skeleton width="35%" height={14} />
          <Skeleton width="80%" height={14} />
        </View>
      </View>
    );
  }

  const runtime =
    item.type === "movie" && "runtime" in item
      ? formatRuntime(item.runtime)
      : "seasonCount" in item
        ? formatSeasons(item.seasonCount)
        : "";

  const meta = metaLine([
    item.year || null,
    certification,
    runtime,
    item.genres.slice(0, 3).join(" • "),
  ]);

  return (
    <View style={[styles.hero, { height: heroHeight }]}>
      {item.backdrop || item.poster ? (
        <Image
          source={{ uri: item.backdrop ?? item.poster ?? "" }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={320}
          cachePolicy="memory-disk"
          accessibilityLabel={`${item.title} artwork`}
        />
      ) : null}

      {!isMobile ? (
        <LinearGradient
          colors={[...HERO_SCRIM_SIDE]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LinearGradient
        colors={[...HERO_SCRIM]}
        locations={[0, 0.45, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          { paddingHorizontal: gutter, maxWidth: isMobile ? undefined : 640 },
        ]}
      >
        <View style={styles.featuredTag}>
          <Ionicons name="sparkles" size={12} color={COLORS.accent} />
          <Text style={styles.featuredTagText}>Featured today</Text>
        </View>

        <Text
          style={[styles.title, isMobile ? styles.titleMobile : null]}
          numberOfLines={3}
          accessibilityRole="header"
        >
          {item.title}
        </Text>

        <View style={styles.metaRow}>
          {formatRating(item.rating) ? (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={13} color={COLORS.star} />
              <Text style={styles.ratingText}>{formatRating(item.rating)}</Text>
            </View>
          ) : null}
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        </View>

        <Text style={styles.overview} numberOfLines={isMobile ? 3 : 4}>
          {item.overview}
        </Text>

        <View style={styles.actions}>
          <Button
            label="Watch Trailer"
            icon="play"
            onPress={onWatchTrailer}
            size="lg"
          />
          <Button
            label={inWatchlist ? "In Watchlist" : "Add to Watchlist"}
            icon={inWatchlist ? "checkmark" : "add"}
            onPress={onToggleWatchlist}
            variant="secondary"
            size="lg"
          />
          <Button
            label="More info"
            icon="information-circle-outline"
            onPress={onOpen}
            variant="ghost"
            size="lg"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: COLORS.surfaceSunken,
    overflow: "hidden",
  },
  content: {
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  featuredTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  featuredTagText: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: COLORS.textPrimary,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.2,
    color: COLORS.textPrimary,
  },
  titleMobile: {
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flexWrap: "wrap",
  },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  ratingText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  overview: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flexWrap: "wrap",
    paddingTop: SPACING.xs,
  },
});
