import React, { useEffect, useRef } from "react";
import {
  View,
  Animated,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";


interface Props {
  onFinish: () => void;
}

export function NexoraIntro({ onFinish }: Props) {
  const logoScale        = useRef(new Animated.Value(0.3)).current;
  const logoOpacity      = useRef(new Animated.Value(0)).current;
  const glowOpacity      = useRef(new Animated.Value(0)).current;
  const tagOpacity       = useRef(new Animated.Value(0)).current;
  const subtitleOpacity  = useRef(new Animated.Value(0)).current;
  const curtainLeft      = useRef(new Animated.Value(0)).current;
  const curtainRight     = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1 — Logo scales + fades in (0–900ms)
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity,  { toValue: 1, duration: 900, useNativeDriver: true }),
    ]).start();

    // Phase 2 — Glow appears (800ms)
    setTimeout(() => {
      Animated.timing(glowOpacity, { toValue: 1, duration: 900, useNativeDriver: true }).start();
    }, 800);

    // Phase 3 — Tagline + subtitle fade in (1600ms)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(tagOpacity,      { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start();
    }, 1600);

    // Phase 4 — Curtains slide open (2700–3700ms)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(curtainLeft,  { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(curtainRight, { toValue: 1, duration: 1000, useNativeDriver: false }),
      ]).start();
    }, 2700);

    // Phase 5 — Fade out + finish (4200–4700ms)
    setTimeout(() => {
      Animated.timing(containerOpacity, { toValue: 0, duration: 500, useNativeDriver: true })
        .start(() => onFinish());
    }, 4200);
  }, [logoScale, logoOpacity, glowOpacity, tagOpacity, subtitleOpacity, curtainLeft, curtainRight, containerOpacity, onFinish]);

  const curtainLeftWidth  = curtainLeft.interpolate({ inputRange: [0, 1], outputRange: ["50%", "0%"] });
  const curtainRightWidth = curtainRight.interpolate({ inputRange: [0, 1], outputRange: ["50%", "0%"] });

  return (
    <Animated.View style={[styles.root, { opacity: containerOpacity }]} pointerEvents="none">
      {/* Background gradient */}
      <LinearGradient
        colors={["#0a0509", "#0f111a", COLORS.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bg}
      />

      {/* Radial glow */}
      <Animated.View
        style={[styles.glow, { opacity: glowOpacity }]}
        {...(Platform.OS === "web"
          ? { style: [styles.glow, { opacity: glowOpacity, background: "radial-gradient(circle, rgba(229,9,20,0.24) 0%, rgba(229,9,20,0) 72%)" }] }
          : {})}
      />

      {/* Center content — single column, no absolute positioning */}
      <View style={styles.contentWrap}>
        {/* Logo */}
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: "center" }}>
          <Image source={require("@/assets/images/icon.png")} style={styles.logoImage} resizeMode="contain" />
        </Animated.View>

        {/* Red accent line */}
        <Animated.View style={[styles.accentLine, { opacity: logoOpacity }]} />

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
          Premium Sports • Live TV • Entertainment
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          STREAMING REIMAGINED
        </Animated.Text>
      </View>

      {/* Curtains slide out left + right */}
      <Animated.View style={[styles.curtainLeft,  { width: curtainLeftWidth }]} />
      <Animated.View style={[styles.curtainRight, { width: curtainRightWidth }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    overflow: "hidden",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  glow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "transparent",
    alignSelf: "center",
    top: "30%",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 80,
  },
  contentWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  logoImage: {
    width: 168,
    height: 168,
  },
  accentLine: {
    width: 60,
    height: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
    marginTop: 14,
    marginBottom: 18,
  },
  tagline: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.6,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  subtitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 3,
    color: COLORS.textMuted,
    marginTop: 10,
    textAlign: "center",
  },
  curtainLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  curtainRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
});
