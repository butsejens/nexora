/**
 * CineLog — skeleton loaders.
 *
 * Every screen shows layout-accurate skeletons while data loads so content
 * arrives without the page jumping.
 */

import React, { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { COLORS, RADIUS, SPACING } from "@/constants/theme";

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius = RADIUS.xs,
  style,
}: SkeletonProps) {
  const progress = useSharedValue(0.4);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: COLORS.skeleton },
        animatedStyle,
        style,
      ]}
    />
  );
}

export interface SkeletonCardProps {
  width: number;
  /** Poster aspect ratio; 2:3 for posters, 16:9 for episode stills. */
  aspectRatio?: number;
  showMeta?: boolean;
}

export function SkeletonCard({
  width,
  aspectRatio = 2 / 3,
  showMeta = true,
}: SkeletonCardProps) {
  return (
    <View style={{ width }}>
      <Skeleton width={width} height={width / aspectRatio} radius={RADIUS.md} />
      {showMeta ? (
        <View style={styles.meta}>
          <Skeleton width="85%" height={11} />
          <Skeleton width="45%" height={9} />
        </View>
      ) : null}
    </View>
  );
}

export interface SkeletonRailProps {
  posterWidth: number;
  count?: number;
  gutter: number;
}

export function SkeletonRail({ posterWidth, count = 6, gutter }: SkeletonRailProps) {
  return (
    <View style={[styles.rail, { paddingHorizontal: gutter }]}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} width={posterWidth} />
      ))}
    </View>
  );
}

export interface SkeletonGridProps {
  columns: number;
  posterWidth: number;
  count?: number;
}

export function SkeletonGrid({ columns, posterWidth, count }: SkeletonGridProps) {
  const total = count ?? columns * 3;
  return (
    <View style={styles.grid}>
      {Array.from({ length: total }).map((_, index) => (
        <SkeletonCard key={index} width={posterWidth} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: {
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  rail: {
    flexDirection: "row",
    gap: SPACING.md,
    overflow: "hidden",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
});
