/**
 * Nexora Premium UI Primitives
 *
 * Reusable animated building blocks powered by react-native-reanimated:
 *   - ShimmerSkeleton  — universal animated shimmer placeholder
 *   - PulsingDot       — live indicator with glow pulse
 *   - FadeInView       — wrapper that fades + slides children on mount
 *   - ScaleButton      — press-to-scale touchable (spring physics)
 *   - AnimatedStatBar  — horizontal bar that animates to target width
 *   - SlidingTabBar    — tab strip with animated sliding underline
 *   - CountUpText      — number that animates from 0 to target value
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { COLORS } from "@/constants/colors";

// ─── ShimmerSkeleton ──────────────────────────────────────────────────
// Animated shimmer that sweeps left-to-right. Use as placeholder for
// any loading content — text lines, images, cards, avatars.

type ShimmerSkeletonProps = {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function ShimmerSkeleton({
  width,
  height,
  borderRadius = 8,
  style,
}: ShimmerSkeletonProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.4, 0.8, 0.4]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: COLORS.skeleton,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────
// Pre-built skeleton shapes for common card patterns.

export function SkeletonCardRow({ count = 3 }: { count?: number }) {
  return (
    <View style={sk.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={sk.card}>
          <ShimmerSkeleton width={140} height={80} borderRadius={10} />
          <ShimmerSkeleton
            width={100}
            height={10}
            borderRadius={4}
            style={{ marginTop: 8 }}
          />
          <ShimmerSkeleton
            width={70}
            height={10}
            borderRadius={4}
            style={{ marginTop: 4 }}
          />
        </View>
      ))}
    </View>
  );
}

export function SkeletonHero() {
  return (
    <View style={sk.hero}>
      <ShimmerSkeleton width="100%" height={180} borderRadius={16} />
      <View style={sk.heroMeta}>
        <ShimmerSkeleton width={48} height={48} borderRadius={24} />
        <View style={sk.heroLines}>
          <ShimmerSkeleton width={160} height={14} borderRadius={4} />
          <ShimmerSkeleton width={100} height={10} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonListItem({ lines = 2 }: { lines?: number }) {
  return (
    <View style={sk.listItem}>
      <ShimmerSkeleton width={44} height={44} borderRadius={22} />
      <View style={sk.listLines}>
        <ShimmerSkeleton width={180} height={12} borderRadius={4} />
        {lines >= 2 && (
          <ShimmerSkeleton width={120} height={10} borderRadius={4} />
        )}
        {lines >= 3 && (
          <ShimmerSkeleton width={80} height={10} borderRadius={4} />
        )}
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  card: { gap: 0 },
  hero: { gap: 12 },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  heroLines: { flex: 1, gap: 6 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  listLines: { flex: 1, gap: 6 },
});

// ─── PulsingDot ───────────────────────────────────────────────────────
// Animated live indicator with glowing pulse ring.

type PulsingDotProps = {
  size?: number;
  color?: string;
  glowColor?: string;
};

export function PulsingDot({
  size = 8,
  color = COLORS.live,
  glowColor = COLORS.liveGlow,
}: PulsingDotProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 2.2]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.6, 0]),
  }));

  return (
    <View
      style={{
        width: size * 3,
        height: size * 3,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: glowColor,
          },
          ringStyle,
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// ─── FadeInView ───────────────────────────────────────────────────────
// Wraps children with fade-in + optional slide animation.

type FadeInViewProps = {
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "none";
  distance?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function FadeInView({
  delay = 0,
  duration = 400,
  direction = "up",
  distance = 12,
  style,
  children,
}: FadeInViewProps) {
  const entering =
    direction === "up"
      ? FadeInDown.delay(delay).duration(duration).springify()
      : direction === "down"
        ? FadeInUp.delay(delay).duration(duration).springify()
        : FadeIn.delay(delay).duration(duration);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

// ─── ScaleButton ──────────────────────────────────────────────────────
// TouchableOpacity with spring scale on press — premium micro-interaction.

type ScaleButtonProps = {
  onPress?: () => void;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  children: React.ReactNode;
};

export function ScaleButton({
  onPress,
  scaleTo = 0.96,
  style,
  disabled,
  children,
}: ScaleButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(scaleTo, { damping: 15, stiffness: 200 });
  }, [scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── AnimatedStatBar ──────────────────────────────────────────────────
// Horizontal bar that animates from 0% to target width.

type AnimatedStatBarProps = {
  value: number; // 0..100
  color?: string;
  trackColor?: string;
  height?: number;
  borderRadius?: number;
  delay?: number;
  label?: string;
  showPercent?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedStatBar({
  value,
  color = COLORS.accent,
  trackColor = "rgba(255,255,255,0.06)",
  height = 6,
  borderRadius = 999,
  delay: animDelay = 0,
  label,
  showPercent,
  style,
}: AnimatedStatBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.min(100, Math.max(0, value));
    width.value = withDelay(
      animDelay,
      withTiming(clamped, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, animDelay, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={style}>
      {(label || showPercent) && (
        <View style={bar.labelRow}>
          {label ? <Text style={bar.label}>{label}</Text> : null}
          {showPercent ? (
            <Text style={bar.percent}>{Math.round(value)}%</Text>
          ) : null}
        </View>
      )}
      <View
        style={[
          bar.track,
          { height, borderRadius, backgroundColor: trackColor },
        ]}
      >
        <Animated.View
          style={[
            bar.fill,
            { backgroundColor: color, borderRadius },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  percent: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});

// ─── SlidingTabBar ────────────────────────────────────────────────────
// Tab strip with animated sliding underline indicator.

type Tab = { key: string; label: string; badge?: string };

type SlidingTabBarProps = {
  tabs: Tab[];
  activeKey: string;
  onTabChange: (key: string) => void;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function SlidingTabBar({
  tabs,
  activeKey,
  onTabChange,
  accentColor = COLORS.accent,
  style,
}: SlidingTabBarProps) {
  const [tabWidths, setTabWidths] = useState<
    Record<string, { x: number; w: number }>
  >({});
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(60);

  useEffect(() => {
    const active = tabWidths[activeKey];
    if (active) {
      indicatorX.value = withSpring(active.x, { damping: 18, stiffness: 180 });
      indicatorW.value = withSpring(active.w, { damping: 18, stiffness: 180 });
    }
  }, [activeKey, tabWidths, indicatorX, indicatorW]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  return (
    <View style={[tab.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tab.scroll}
      >
        {tabs.map((t) => {
          const isActive = t.key === activeKey;
          return (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.7}
              onPress={() => onTabChange(t.key)}
              onLayout={(e) => {
                const { x, width: w } = e.nativeEvent.layout;
                setTabWidths((prev) => ({ ...prev, [t.key]: { x, w } }));
              }}
              style={tab.tab}
            >
              <Text style={[tab.text, isActive && tab.textActive]}>
                {t.label}
              </Text>
              {t.badge ? (
                <View style={tab.badge}>
                  <Text style={tab.badgeText}>{t.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <Animated.View
          style={[
            tab.indicator,
            { backgroundColor: accentColor },
            indicatorStyle,
          ]}
        />
      </ScrollView>
    </View>
  );
}

const tab = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  textActive: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
  },
  badge: {
    backgroundColor: `${COLORS.accent}22`,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeText: {
    color: COLORS.accent,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
  },
});

// ─── CountUpText ──────────────────────────────────────────────────────
// Animates a number from 0 to the target value.

type CountUpTextProps = {
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  style?: StyleProp<TextStyle>;
};

export function CountUpText({
  value,
  duration = 800,
  delay: d = 0,
  prefix = "",
  suffix = "",
  decimals = 0,
  style,
}: CountUpTextProps) {
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      d,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, duration, d, progress]);

  // Use a frame callback approach for text updates
  const animStyle = useAnimatedStyle(() => {
    const current = progress.value * value;
    const formatted =
      decimals > 0 ? current.toFixed(decimals) : Math.round(current).toString();
    runOnJS(setDisplay)(`${prefix}${formatted}${suffix}`);
    return {};
  });

  return (
    <>
      <Animated.View style={animStyle} />
      <Text style={style}>{display}</Text>
    </>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────
export { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
