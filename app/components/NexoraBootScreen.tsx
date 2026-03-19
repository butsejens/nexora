import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Animated, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { COLORS } from "@/constants/colors";
import { t } from "@/lib/i18n";

interface Props {
  progress: number;
  message: string;
}

export function NexoraBootScreen({ progress, message }: Props) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#000000", "#050505", COLORS.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bg}
      />

      {/* Subtle animated glow */}
      <Animated.View
        style={[
          styles.glow,
          { transform: [{ scale: pulseAnim }] },
        ]}
      />

      <View style={styles.centerWrap}>
        {/* Larger Logo */}
        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Image source={require("@/assets/images/icon.png")} style={styles.logoImage} resizeMode="contain" />
        </Animated.View>

        {/* Progress Card */}
        <BlurView intensity={75} tint="dark" style={styles.card}>
          <LinearGradient
            colors={["rgba(229,9,20,0.08)", "rgba(38,20,45,0.08)"]}
            style={styles.cardGradient}
          >
            <Text style={styles.title}>{t("boot.preparing")}</Text>
            <Text style={styles.subtitle}>{message}</Text>

            {/* Enhanced Progress Bar */}
            <View style={styles.barOuter}>
              <View style={styles.barTrack}>
                <LinearGradient
                  colors={[COLORS.accent, "#ff4050"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.barFill, { width: `${safeProgress}%` }]}
                />
              </View>
            </View>

            <Text style={styles.percent}>{safeProgress}%</Text>
          </LinearGradient>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  bg: { ...StyleSheet.absoluteFillObject },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "transparent",
    top: "35%",
    alignSelf: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 100,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 32,
  },
  logoWrap: {
    alignItems: "center",
  },
  logoImage: {
    width: 176,
    height: 176,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  cardGradient: {
    padding: 24,
    gap: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  barOuter: {
    marginTop: 8,
  },
  barTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  percent: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
});
