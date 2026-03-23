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
import { t } from "@/lib/i18n";


interface Props {
  onFinish: () => void;
}

export function NexoraIntro({ onFinish }: Props) {
  const logoScale        = useRef(new Animated.Value(0.5)).current;
  const logoOpacity      = useRef(new Animated.Value(0)).current;
  const glowOpacity      = useRef(new Animated.Value(0)).current;
  const tagOpacity       = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1 — Logo scales + fades in (0–400ms)
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Phase 2 — Glow + tagline (300ms)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(tagOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 300);

    // Phase 3 — Fade out + finish (1200–1700ms)
    setTimeout(() => {
      Animated.timing(containerOpacity, { toValue: 0, duration: 500, useNativeDriver: true })
        .start(() => onFinish());
    }, 1200);
  }, [logoScale, logoOpacity, glowOpacity, tagOpacity, containerOpacity, onFinish]);

  return (
    <Animated.View style={[styles.root, { opacity: containerOpacity }]} pointerEvents="none">
      {/* Background gradient */}
      <LinearGradient
        colors={["#000000", "#050505", COLORS.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bg}
      />

      {/* Radial glow */}
      {Platform.OS === "web" ? (
        <Animated.View style={[styles.glow, styles.webGlow, { opacity: glowOpacity }]} />
      ) : (
        <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
      )}

      {/* Center content */}
      <View style={styles.contentWrap}>
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: "center" }}>
          <Image source={require("@/assets/images/nexora-intro-logo.png")} style={styles.logoImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={[styles.accentLine, { opacity: logoOpacity }]} />

        <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
          {t("intro.tagline")}
        </Animated.Text>
      </View>
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
  webGlow: {
    // Cast to avoid React Native style typing mismatch for CSS radial gradient on web.
    ...(Platform.OS === "web" ? ({ background: "radial-gradient(circle, rgba(229,9,20,0.24) 0%, rgba(229,9,20,0) 72%)" } as any) : {}),
  },
  contentWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  logoImage: {
    width: 280,
    height: 150,
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
});
