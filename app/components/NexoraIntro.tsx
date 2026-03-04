import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
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

    // Phase 3: Tagline + preview card
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
        colors={["#2A0B12", "#14070B", COLORS.background]}
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

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
        NEXORA
      </Animated.Text>

      <Animated.View style={[styles.previewFrame, { opacity: cardOpacity }]}>
        <View style={styles.previewCard}>
          <Image
            source={{ uri: "https://image.tmdb.org/t/p/w780/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg" }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(2,12,35,0.85)", "rgba(2,10,30,0.98)"]}
            style={styles.previewOverlay}
          >
            <Text style={styles.previewTitle}>The Mandalorian</Text>
            <Text style={styles.previewMeta}>2019 • Sci-Fi • Action-Adventure</Text>
            <View style={styles.previewAction}>
              <Text style={styles.previewActionText}>▶ Watch Now</Text>
            </View>
          </LinearGradient>
        </View>
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
    fontSize: 44,
    letterSpacing: 6,
    fontFamily: "Inter_800ExtraBold",
  },
  logoN: {
    color: COLORS.accent,
  },
  logoRest: {
    color: COLORS.text,
  },
  tagline: {
    position: "absolute",
    top: "18%",
    width: "78%",
    textAlign: "center",
    color: COLORS.text,
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: 0.4,
    fontFamily: "Inter_700Bold",
  },
  previewFrame: {
    width: "86%",
    maxWidth: 360,
    borderWidth: 2,
    borderColor: "rgba(189,217,255,0.68)",
    borderRadius: 32,
    padding: 14,
    marginTop: 80,
    backgroundColor: "rgba(9,35,89,0.22)",
  },
  previewCard: {
    borderRadius: 20,
    overflow: "hidden",
    height: 370,
    borderWidth: 1,
    borderColor: "rgba(180,210,255,0.4)",
    backgroundColor: "#0A1F4E",
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 16,
    gap: 8,
  },
  previewTitle: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
    fontSize: 24,
  },
  previewMeta: {
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  previewAction: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "rgba(22,33,58,0.9)",
    borderWidth: 1,
    borderColor: "rgba(184,215,255,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  previewActionText: {
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    fontSize: 13,
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
