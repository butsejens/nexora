import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "@/constants/colors";

type VideoIntroProps = {
  onFinish: () => void;
};

export function VideoIntro({ onFinish }: VideoIntroProps) {
  const doneRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const [showSkip, setShowSkip] = useState(false);
  const opacity = useSharedValue(1);
  const markScale = useSharedValue(0.72);
  const markOpacity = useSharedValue(0);
  const wordOpacity = useSharedValue(0);
  const tagOpacity = useSharedValue(0);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    opacity.value = withTiming(0, { duration: 320 });
    setTimeout(() => onFinishRef.current(), 340);
  }, [opacity]);

  useEffect(() => {
    markOpacity.value = withTiming(1, { duration: 520 });
    markScale.value = withSequence(
      withTiming(1.06, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
      }),
      withTiming(1, { duration: 280, easing: Easing.inOut(Easing.quad) }),
    );
    wordOpacity.value = withDelay(280, withTiming(1, { duration: 480 }));
    tagOpacity.value = withDelay(560, withTiming(1, { duration: 420 }));

    const skipTimer = setTimeout(
      () => setShowSkip(true),
      isWeb ? 300 : 900,
    );
    const finishTimer = setTimeout(
      () => finish(),
      isWeb ? 900 : 2800,
    );

    return () => {
      clearTimeout(skipTimer);
      clearTimeout(finishTimer);
    };
  }, [finish, isWeb, markOpacity, markScale, tagOpacity, wordOpacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: wordOpacity.value }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOpacity.value }));

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <View style={styles.glow} />
      <Animated.View style={[styles.markWrap, markStyle]}>
        <View style={styles.mark}>
          <View style={styles.markC} />
        </View>
      </Animated.View>
      <Animated.Text style={[styles.wordmark, wordStyle]}>
        <Text style={styles.wordmarkC}>C</Text>INELOG
      </Animated.Text>
      <Animated.Text style={[styles.tagline, tagStyle]}>
        ALL YOUR CONTENT. ONE PLACE.
      </Animated.Text>
      {showSkip ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.skipWrap}>
          <Pressable onPress={finish} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#06050A",
    zIndex: 13000,
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(192,38,211,0.16)",
  },
  markWrap: {
    marginBottom: 28,
  },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: "#0A0A12",
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.35)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  markC: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 10,
    borderColor: COLORS.accent,
    borderRightColor: "transparent",
    transform: [{ rotate: "-35deg" }],
  },
  wordmark: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 4,
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
  },
  wordmarkC: {
    color: COLORS.accent,
  },
  tagline: {
    marginTop: 14,
    fontSize: 12,
    letterSpacing: 2.4,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textMuted,
  },
  skipWrap: {
    position: "absolute",
    bottom: 48,
    right: 24,
  },
  skipButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "rgba(192,38,211,0.18)",
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.35)",
  },
  skipText: {
    color: "#F8FAFC",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
