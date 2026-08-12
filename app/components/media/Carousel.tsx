/**
 * CineLog — horizontal rail.
 *
 * Renders a titled, swipeable row of cards. Uses `FlatList` so long rails only
 * mount the posters that are actually on screen.
 */

import React, { useRef } from "react";
import {
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useT } from "@/i18n";
import { SkeletonRail } from "@/components/ui/Skeleton";
import { FONTS, LAYOUT, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
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
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const { gutter, supportsHover, width } = useResponsive();
  const listRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

  // Arrows only make sense once the row is wider than the space it has.
  const contentWidth = items.length * (itemWidth + SPACING.md) - SPACING.md;
  const visibleWidth = Math.min(width, LAYOUT.maxContentWidth) - gutter * 2;
  const showArrows = supportsHover && contentWidth > visibleWidth;

  const scrollBy = (direction: 1 | -1) => {
    const step = (itemWidth + SPACING.md) * 3;
    const next = Math.max(0, offsetRef.current + step * direction);
    listRef.current?.scrollTo({ x: next, animated: true });
  };

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
              accessibilityLabel={t("See all in {{title}}", { title })}
              style={({ hovered }) => [
                styles.seeAll,
                hovered ? styles.seeAllHovered : null,
              ]}
            >
              <Text style={styles.seeAllText}>{t("See all")}</Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.textSecondary}
              />
            </Pressable>
          ) : null}

          {showArrows ? (
            <View style={styles.arrows}>
              <Pressable
                onPress={() => scrollBy(-1)}
                accessibilityRole="button"
                accessibilityLabel={t("Scroll {{title}} left", { title })}
                style={({ hovered }) => [
                  styles.arrow,
                  hovered ? styles.arrowHovered : null,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={colors.textPrimary}
                />
              </Pressable>
              <Pressable
                onPress={() => scrollBy(1)}
                accessibilityRole="button"
                accessibilityLabel={t("Scroll {{title}} right", { title })}
                style={({ hovered }) => [
                  styles.arrow,
                  hovered ? styles.arrowHovered : null,
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textPrimary}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: gutter },
        ]}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={64}
        accessibilityLabel={title}
      >
        {/* Plain map instead of FlatList: rails are bounded in size (one page,
            ~20 items max), and FlatList's view recycling produced stale,
            unclickable gray cells on Android after navigating back to Home. */}
        {items.map((item, index) => (
          <React.Fragment key={keyExtractor(item, index)}>
            {renderItem(item, index)}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
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
    color: c.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: c.textMuted,
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
    backgroundColor: c.glass,
  },
  seeAllText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
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
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  arrowHovered: {
    backgroundColor: c.surfaceHover,
    borderColor: c.borderStrong,
  },
  listContent: {
    gap: SPACING.md,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: c.textMuted,
  },
}));
