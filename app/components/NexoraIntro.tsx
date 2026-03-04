import React, { useEffect, useRef } from "react";
import {
  Text,
  Animated,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { COLORS } from "@/constants/colors";


interface Props {
  onFinish: () => void;
}

export function NexoraIntro({ onFinish }: Props) {
  // Animations
  const logoScale     = useRef(new Animated.Value(0.3)).current;
  const logoOpacity   = useRef(new Animated.Value(0)).current;
  const glowOpacity   = useRef(new Animated.Value(0)).current;
  const tagOpacity    = useRef(new Animated.Value(0)).current;
  const cardOpacity   = useRef(new Animated.Value(0)).current;
  const curtainLeft   = useRef(new Animated.Value(0)).current;  // 0=closed, 1=open
  const curtainRight  = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

   
   
  // Animations use ref values which are stable; suppress exhaustive-deps warnings
   
  useEffect(() => {
    // Phase 1: Logo fade + scale in (0–1000ms)
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start();

    // Phase 2: Glow pulse (900ms)
    setTimeout(() => {
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }).start();
    }, 800);

    // Phase 3: Tagline + center plate
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1800);

    // Phase 4: Curtain open left/right (2700ms–3700ms)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(curtainLeft, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(curtainRight, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
      ]).start();
    }, 2700);

    // Phase 5: Fade whole intro out (4200ms–4700ms)
    setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 4200);
  }, [logoScale, logoOpacity, glowOpacity, tagOpacity, cardOpacity, curtainLeft, curtainRight, containerOpacity, onFinish]);

  const curtainLeftWidth = curtainLeft.interpolate({
    inputRange: [0, 1],
    outputRange: ["50%", "0%"],
  });
  const curtainRightWidth = curtainRight.interpolate({
    inputRange: [0, 1],
    outputRange: ["50%", "0%"],
  });

  return (
    <Animated.View
      style={[styles.root, { opacity: containerOpacity }]}
      pointerEvents="none"
    >
      {/* Background */}
      <LinearGradient
        colors={["#0a0509", "#0f111a", COLORS.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bg}
      />

      {/* Radial glow behind logo */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: logoScale }],
            opacity: logoOpacity,
          },
        ]}
      >
        <Text style={styles.logo}>
          <Text style={styles.logoN}>N</Text>
          <Text style={styles.logoRest}>EXORA</Text>
        </Text>
      </Animated.View>

      {/* Accent line underneath logo */}
      <Animated.View style={[styles.accentLine, { opacity: logoOpacity }]} />

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
        Premium Sports • Live TV • Entertainment
      </Animated.Text>

      <Animated.View style={[styles.logoPlateFrame, { opacity: cardOpacity }]}> 
        <BlurView intensity={85} tint="dark" style={styles.logoPlateBlur}>
          <LinearGradient
            colors={["rgba(229,9,20,0.25)", "rgba(38,20,45,0.15)", "rgba(10,10,16,0.45)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoPlate}
          >
            <Text style={styles.logoPlateNexora}>NEXORA</Text>
            <Text style={styles.logoPlateSub}>STREAMING REIMAGINED</Text>
          </LinearGradient>
        </BlurView>
      </Animated.View>

      {/* Curtains (left + right slide out) */}
      <Animated.View
        style={[styles.curtainLeft, { width: curtainLeftWidth }]}
      />
      <Animated.View
        style={[styles.curtainRight, { width: curtainRightWidth }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
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
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 80,
    // Web fallback
    ...(Platform.OS === "web"
      ? {
          background:
            "radial-gradient(circle, rgba(229,9,20,0.24) 0%, rgba(229,9,20,0) 72%)",
        }
      : {}),
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 56,
    letterSpacing: 8,
    fontFamily: "Inter_800ExtraBold",
  },
  accentLine: {
    width: 60,
    height: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
    marginTop: 12,
  },
  logoN: {
    color: COLORS.accent,
  },
  logoRest: {
    color: COLORS.text,
  },
  tagline: {
    position: "absolute",
    top: "66%",
    width: "78%",
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.6,
    fontFamily: "Inter_600SemiBold",
  },
  logoPlateFrame: {
    width: "80%",
    maxWidth: 360,
    borderRadius: 28,
    overflow: "hidden",
    marginTop: 42,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  logoPlateBlur: {
    width: "100%",
  },
  logoPlate: {
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoPlateNexora: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 38,
    letterSpacing: 6,
    color: COLORS.text,
  },
  logoPlateSub: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 2.5,
    color: COLORS.textSecondary,
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
