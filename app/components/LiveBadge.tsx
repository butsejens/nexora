import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { COLORS } from "../constants/colors";

interface Props {
  minute?: number;
  small?: boolean;
}

export function LiveBadge({ minute, small }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

   
  // pulse is a stable ref — intentionally omitted from deps
   
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <View style={[styles.badge, small && styles.badgeSmall]}>
      <Animated.View style={[styles.dot, small && styles.dotSmall, { opacity: pulse }]} />
      <Text style={[styles.text, small && styles.textSmall]}>
        LIVE{minute ? ` ${minute}'` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.liveGlow,
    borderWidth: 1,
    borderColor: COLORS.live,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.live,
  },
  dotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.live,
    letterSpacing: 0.5,
  },
  textSmall: {
    fontSize: 9,
  },
});
