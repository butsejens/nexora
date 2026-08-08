/**
 * CineLog — horizontal rail.
 *
 * Renders a titled, swipeable row of cards. Uses `FlatList` so long rails only
 * mount the posters that are actually on screen.
 */

import React, { useCallback, useRef } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SkeletonRail } from "@/components/ui/Skeleton";
import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { Pressable } from "@/components/ui/Pressable";

export interface CarouselProps<T> {
  title: string;
  /** Optional line under the title, e.g. "Because you watched Dune". */
  subtitle?: string;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  isLoading?: boolean;
  onSeeAll?: () => void;
  /** Width of one card, used for skeletons and scroll snapping. */
  itemWidth: number;
  emptyMessage?: string;
}

export function Carousel<T>({
  title,
  subtitle,
  items,
  renderItem,
  keyExtractor,
  isLoading = false,
  onSeeAll,
  itemWidth,
  emptyMessage,
}: CarouselProps<T>) {
  const { gutter, supportsHover } = useResponsive();
  const listRef = useRef<FlatList<T>>(null);
  const offsetRef = useRef(0);

  const scrollBy = useCallback(
    (direction: 1 | -1) => {
      const step = (itemWidth + SPACING.md) * 3;
      const next = Math.max(0, offsetRef.current + step * direction);
      listRef.current?.scrollToOffset({ offset: next, animated: true });
    },
    [itemWidth],
  );

  const listRenderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<T>) => renderItem(item, index),
    [renderItem],
  );

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.section}>
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <SkeletonRail posterWidth={itemWidth} gutter={gutter} />
      </View>
    );
  }

  if (items.length === 0) {
    if (!emptyMessage) return null;
    return (
      <View style={styles.section}>
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={[styles.empty, { paddingHorizontal: gutter }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <View style={styles.headingBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.headerActions}>
          {onSeeAll ? (
            <Pressable
              onPress={onSeeAll}
              accessibilityRole="button"
              accessibilityLabel={`See all in ${title}`}
              style={({ hovered }) => [styles.seeAll, hovered ? styles.seeAllHovered : null]}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textSecondary} />
            </Pressable>
          ) : null}

          {supportsHover ? (
            <View style={styles.arrows}>
              <Pressable
                onPress={() => scrollBy(-1)}
                accessibilityRole="button"
                accessibilityLabel={`Scroll ${title} left`}
                style={({ hovered }) => [styles.arrow, hovered ? styles.arrowHovered : null]}
              >
                <Ionicons name="chevron-back" size={16} color={COLORS.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => scrollBy(1)}
                accessibilityRole="button"
                accessibilityLabel={`Scroll ${title} right`}
                style={({ hovered }) => [styles.arrow, hovered ? styles.arrowHovered : null]}
              >
                <Ionicons name="chevron-forward" size={16} color={COLORS.textPrimary} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={items}
        renderItem={listRenderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: gutter }]}
        onScroll={(event) => {
          offsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={64}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  headingBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  seeAllHovered: {
    backgroundColor: COLORS.glass,
  },
  seeAllText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  arrows: {
    flexDirection: "row",
    gap: SPACING.xs,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  arrowHovered: {
    backgroundColor: COLORS.surfaceHover,
    borderColor: COLORS.borderStrong,
  },
  listContent: {
    gap: SPACING.md,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
