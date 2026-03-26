import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";
import { COLORS } from "@/constants/colors";

type PulseLaunchScreenProps = {
  title: string;
  subtitle: string;
  progress?: number;
  badge?: string;
};

export function PulseLaunchScreen({ title, subtitle, progress = 0, badge }: PulseLaunchScreenProps) {
  const reveal = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(1)).current;
  const widthValue = useMemo(() => `${Math.max(6, Math.min(100, progress))}%`, [progress]);

  useEffect(() => {
    // Step 1: smooth reveal — scale + fade in
    Animated.timing(reveal, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // Step 2: after reveal, subtle breathe loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.82, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start();
    });
    return () => {
      reveal.stopAnimation();
      glow.stopAnimation();
    };
  }, [glow, reveal]);

  const opacity = reveal;
  const scale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] });

  return (
    <View style={styles.screen}>
      {/* Background glow accents */}
      <View style={styles.auroraTop} />
      <View style={styles.auroraBottom} />

      {/* Logo reveal */}
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <Animated.View style={{ opacity: glow }}>
          <PulseBrandMark size={88} subtitle={null} />
        </Animated.View>
      </Animated.View>

      {/* Info */}
      <Animated.View style={[styles.content, { opacity }]}>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: widthValue as `${number}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{Math.round(progress)}%</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  auroraTop: {
    position: "absolute",
    top: -120,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: COLORS.accentGlow,
  },
  auroraBottom: {
    position: "absolute",
    bottom: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(229,9,20,0.16)",
  },
  center: {
    marginBottom: 36,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 14,
  },
  badge: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    color: "#F7F7FB",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(247,247,251,0.76)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 340,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  progressLabel: {
    color: "rgba(247,247,251,0.6)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
});