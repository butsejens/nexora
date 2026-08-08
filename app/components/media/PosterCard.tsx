/**
 * CineLog — poster card.
 *
 * The single card used by every rail and grid. On pointer devices, hovering
 * reveals quick actions (trailer, watchlist) and a short info overlay; on touch
 * devices the card stays clean and tapping opens the detail page.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { IconButton } from "@/components/ui/Button";
import { TouchableScale } from "@/components/ui/Pressable";
import { RatingBadge } from "@/components/ui/Rating";
import { CARD_SCRIM, COLORS, FONTS, RADIUS, SHADOWS, SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { metaLine } from "@/lib/format";
import type { LibraryEntryRef, MediaSummary } from "@/lib/cinelog/types";
import { useLibrary } from "@/store/library-store";

export interface PosterCardProps {
  item: MediaSummary | LibraryEntryRef;
  width: number;
  onPress: () => void;
  /** Called when the hover quick-action for the trailer is used. */
  onPlayTrailer?: () => void;
  /** Progress bar (0–100) shown under the poster for Continue Watching. */
  progressPercent?: number;
  /** Extra line under the title, e.g. "S03 E06". */
  subtitle?: string;
  /** Hide the title/meta block for tight layouts. */
  hideMeta?: boolean;
}

function PosterCardComponent({
  item,
  width,
  onPress,
  onPlayTrailer,
  progressPercent,
  subtitle,
  hideMeta = false,
}: PosterCardProps) {
  const { supportsHover } = useResponsive();
  const [hovered, setHovered] = useState(false);
  const toggleWatchlist = useLibrary((state) => state.toggleWatchlist);
  const inWatchlist = useLibrary((state) => state.isInWatchlist(item.id));

  const height = Math.round(width * 1.5);
  const typeLabel = item.type === "movie" ? "Movie" : "Series";
  const seasons =
    "seasonCount" in item && item.seasonCount
      ? `${item.seasonCount} ${item.seasonCount === 1 ? "Season" : "Seasons"}`
      : "";

  const handleWatchlist = useCallback(() => {
    toggleWatchlist(item);
  }, [item, toggleWatchlist]);

  return (
    // The quick actions sit as a sibling of the pressable card, not inside it:
    // nesting one button-role element in another produces invalid DOM on web.
    <View
      style={{ width }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <TouchableScale
        onPress={onPress}
        style={{ width }}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${typeLabel}${item.year ? `, ${item.year}` : ""}`}
      >
        <View style={[styles.posterWrap, { width, height }]}>
          {item.poster ? (
            <Image
              source={{ uri: item.poster }}
              style={styles.poster}
              contentFit="cover"
              transition={220}
              cachePolicy="memory-disk"
              accessibilityLabel={`${item.title} poster`}
            />
          ) : (
            <View style={[styles.poster, styles.posterFallback]}>
              <Ionicons
                name={item.type === "movie" ? "film-outline" : "tv-outline"}
                size={28}
                color={COLORS.textFaint}
              />
            </View>
          )}

          <View style={styles.ratingSlot}>
            <RatingBadge value={item.rating} onArtwork />
          </View>

          {typeof progressPercent === "number" ? (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.max(2, progressPercent))}%` },
                ]}
              />
            </View>
          ) : null}
        </View>

        {hideMeta ? null : (
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle || metaLine([item.year || null, seasons || typeLabel])}
            </Text>
          </View>
        )}
      </TouchableScale>

      {supportsHover && hovered ? (
        <View style={[styles.hoverLayer, { height }]} pointerEvents="box-none">
          <LinearGradient colors={CARD_SCRIM} style={styles.hoverOverlay}>
            <View style={styles.hoverActions}>
              {onPlayTrailer ? (
                <IconButton
                  icon="play"
                  label={`Watch the ${item.title} trailer`}
                  onPress={onPlayTrailer}
                  variant="primary"
                  size={34}
                />
              ) : null}
              <IconButton
                icon={inWatchlist ? "checkmark" : "add"}
                label={
                  inWatchlist
                    ? `Remove ${item.title} from your watchlist`
                    : `Save ${item.title} to your watchlist`
                }
                onPress={handleWatchlist}
                active={inWatchlist}
                size={34}
              />
            </View>
            <Text style={styles.hoverMeta} numberOfLines={2}>
              {metaLine([typeLabel, item.year || null, seasons])}
            </Text>
          </LinearGradient>
        </View>
      ) : null}
    </View>
  );
}

export const PosterCard = React.memo(PosterCardComponent);

/** Named wrappers so screens read as movie/series specific. */
export const MovieCard = PosterCard;
export const SeriesCard = PosterCard;

const styles = StyleSheet.create({
  posterWrap: {
    borderRadius: RADIUS.md,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceElevated,
  },
  ratingSlot: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
  },
  hoverLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  hoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  hoverActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  hoverMeta: {
    fontFamily: FONTS.medium,
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
  meta: {
    paddingTop: SPACING.sm,
    gap: 2,
  },
  title: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
