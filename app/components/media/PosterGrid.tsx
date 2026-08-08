/**
 * CineLog — responsive poster grid.
 *
 * Column count comes from `useResponsive` (2 on phones, 4 on tablets, 6–8 on
 * desktop) and the poster width is derived so the row always fills the gutter.
 */

import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { PosterCard } from "@/components/media/PosterCard";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import type { MediaSummary } from "@/lib/cinelog/types";

export interface PosterGridProps {
  items: MediaSummary[];
  onSelect: (item: MediaSummary) => void;
  /** Show a trailing row of skeletons while the next page loads. */
  isLoadingMore?: boolean;
  isLoading?: boolean;
}

/** Derive the poster width so `columns` cards plus gaps fill the content width. */
export function usePosterMetrics() {
  const { width, gridColumns, gutter } = useResponsive();
  const available =
    Math.min(width, 1600) - gutter * 2 - SPACING.md * (gridColumns - 1);
  return {
    columns: gridColumns,
    gutter,
    posterWidth: Math.floor(available / gridColumns),
  };
}

export function PosterGrid({
  items,
  onSelect,
  isLoadingMore = false,
  isLoading = false,
}: PosterGridProps) {
  const { columns, gutter, posterWidth } = usePosterMetrics();

  const renderSkeletons = useCallback(
    (count: number) =>
      Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={`skeleton-${index}`} width={posterWidth} />
      )),
    [posterWidth],
  );

  return (
    <View style={[styles.grid, { paddingHorizontal: gutter }]}>
      {isLoading && items.length === 0
        ? renderSkeletons(columns * 3)
        : items.map((item) => (
            <PosterCard
              key={item.id}
              item={item}
              width={posterWidth}
              onPress={() => onSelect(item)}
            />
          ))}
      {isLoadingMore ? renderSkeletons(columns) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
});
