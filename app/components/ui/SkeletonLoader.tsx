/**
 * Nexora — Skeleton Loader
 * Lightweight shimmer placeholders for loading states.
 * Uses Reanimated withRepeat for pulse animation.
 */
import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";

// ---------------------------------------------------------------------------
// Pulse shimmer base
// ---------------------------------------------------------------------------
function SkeletonBase({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.base, style as ViewStyle, animStyle]} />;
}

// ---------------------------------------------------------------------------
// Poster card skeleton (portrait)
// ---------------------------------------------------------------------------
export function SkeletonPosterCard({
  width = 148,
  height = 220,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <View style={{ width, gap: 6 }}>
      <SkeletonBase style={{ width, height, borderRadius: 14 }} />
      <SkeletonBase
        style={{ width: width * 0.8, height: 12, borderRadius: 6 }}
      />
      <SkeletonBase
        style={{ width: width * 0.5, height: 10, borderRadius: 5 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Wide card skeleton (landscape)
// ---------------------------------------------------------------------------
export function SkeletonWideCard({
  width = 220,
  height = 124,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <View style={{ width, gap: 6 }}>
      <SkeletonBase style={{ width, height, borderRadius: 14 }} />
      <SkeletonBase
        style={{ width: width * 0.7, height: 12, borderRadius: 6 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rail skeleton — horizontal row of poster cards
// ---------------------------------------------------------------------------
export function SkeletonRail({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.rail}>
      {/* Section title skeleton */}
      <View style={styles.railHeaderPlaceholder}>
        <SkeletonBase style={{ width: 160, height: 17, borderRadius: 8 }} />
      </View>
      <View style={styles.railRow}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonPosterCard key={i} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hero skeleton
// ---------------------------------------------------------------------------
export function SkeletonHero({ height = 420 }: { height?: number }) {
  return (
    <View style={{ width: "100%", height, position: "relative" }}>
      <SkeletonBase style={{ width: "100%", height }} />
      <LinearGradient
        colors={["transparent", COLORS.background]}
        locations={[0.6, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Channel card skeleton (for Live TV list)
// ---------------------------------------------------------------------------
export function SkeletonChannelCard() {
  return (
    <View style={styles.channelCard}>
      <SkeletonBase style={{ width: 130, height: 78 }} />
      <View style={styles.channelInfo}>
        <SkeletonBase style={{ width: 120, height: 14, borderRadius: 7 }} />
        <SkeletonBase
          style={{ width: 90, height: 11, borderRadius: 5, marginTop: 6 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.skeleton,
  },
  rail: {
    marginTop: 26,
  },
  railHeaderPlaceholder: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  railRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
  },
  channelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  channelInfo: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
});
