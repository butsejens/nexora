import React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import { ScalePress } from "@/components/ui/ScalePress";

type Props = {
  scrollY: Animated.Value;
  title: string;
  subtitle?: string;
  topInset?: number;
  onBack?: () => void;
  rightActions?: React.ReactNode;
  heroContent?: React.ReactNode;
  backgroundColor?: string;
};

const FULL_HEIGHT = 280;
const HALF_HEIGHT = 140;
const COMPACT_HEIGHT = 70;

export function NexoraCollapsingHeader({
  scrollY,
  title,
  subtitle,
  topInset = 0,
  onBack,
  rightActions,
  heroContent,
  backgroundColor = COLORS.card,
}: Props) {
  const animatedHeight = scrollY.interpolate({
    inputRange: [0, 110, 240],
    outputRange: [FULL_HEIGHT, HALF_HEIGHT, COMPACT_HEIGHT],
    extrapolate: "clamp",
  });

  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 90, 180],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp",
  });

  const subtitleOpacity = scrollY.interpolate({
    inputRange: [0, 60, 130],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });

  const titleSize = scrollY.interpolate({
    inputRange: [0, 110, 240],
    outputRange: [28, 21, 16],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.wrap, { height: animatedHeight, backgroundColor, paddingTop: topInset + 8 }]}> 
      <View style={styles.topRow}>
        <ScalePress style={styles.iconWrap} onPress={onBack}>
          <View style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </View>
        </ScalePress>

        <Animated.Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1}>
          {title}
        </Animated.Text>

        <View style={styles.rightActions}>{rightActions}</View>
      </View>

      <Animated.View style={[styles.subtitleWrap, { opacity: subtitleOpacity }]}> 
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </Animated.View>

      <Animated.View style={[styles.heroWrap, { opacity: heroOpacity }]}> 
        {heroContent}
      </Animated.View>
    </Animated.View>
  );
}

export const NEXORA_COLLAPSING_HEADER_HEIGHT = {
  FULL: FULL_HEIGHT,
  HALF: HALF_HEIGHT,
  COMPACT: COMPACT_HEIGHT,
};

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    overflow: "hidden",
    paddingHorizontal: 14,
  },
  topRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  iconWrap: {
    borderRadius: 999,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlayCard,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  rightActions: {
    minWidth: 36,
    alignItems: "flex-end",
  },
  subtitleWrap: {
    marginTop: 6,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  heroWrap: {
    marginTop: 12,
    flex: 1,
    justifyContent: "center",
  },
});
