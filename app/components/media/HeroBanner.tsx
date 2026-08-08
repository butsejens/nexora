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

import { useT } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ARTWORK,
  FONTS,
  HERO_SCRIM,
  HERO_SCRIM_SIDE,
  RADIUS,
  SPACING,
} from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { formatRating, formatRuntime, metaLine } from "@/lib/format";
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
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
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
        ? t(item.seasonCount === 1 ? "{{count}} Season" : "{{count}} Seasons", {
            count: item.seasonCount,
          })
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
          <Ionicons name="sparkles" size={12} color={colors.accent} />
          <Text style={styles.featuredTagText}>{t("Featured today")}</Text>
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
              <Ionicons name="star" size={13} color={colors.star} />
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
            label={t("Watch Trailer")}
            icon="play"
            onPress={onWatchTrailer}
            size="lg"
          />
          <Button
            label={t(inWatchlist ? "In Watchlist" : "Add to Watchlist")}
            icon={inWatchlist ? "checkmark" : "add"}
            onPress={onToggleWatchlist}
            variant="secondary"
            size="lg"
            onArtwork
          />
          <Button
            label={t("More info")}
            icon="information-circle-outline"
            onPress={onOpen}
            variant="ghost"
            size="lg"
            onArtwork
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  hero: {
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: c.surfaceSunken,
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
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accentGlow,
  },
  featuredTagText: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: ARTWORK.textPrimary,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.2,
    color: ARTWORK.textPrimary,
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
    color: ARTWORK.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: ARTWORK.textSecondary,
    flexShrink: 1,
  },
  overview: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 21,
    color: ARTWORK.textSecondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flexWrap: "wrap",
    paddingTop: SPACING.xs,
  },
}));
