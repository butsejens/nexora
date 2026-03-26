import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";

type PulseLaunchScreenProps = {
  title: string;
  subtitle: string;
  progress?: number;
  badge?: string;
};

export function PulseLaunchScreen({ title, subtitle, progress = 0, badge }: PulseLaunchScreenProps) {
  const glow = useRef(new Animated.Value(0.55)).current;
  const widthValue = useMemo(() => `${Math.max(6, Math.min(100, progress))}%`, [progress]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.5, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <View style={styles.screen}>
      <View style={styles.auroraTop} />
      <View style={styles.auroraBottom} />
      <Animated.View style={[styles.center, { opacity: glow }]}>
        <PulseBrandMark wordmarkText="NEXORA" subtitle="Curated premium access" />
      </Animated.View>
      <View style={styles.content}>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: widthValue as `${number}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{Math.round(progress)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#090B10",
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
    backgroundColor: "rgba(255,90,95,0.2)",
  },
  auroraBottom: {
    position: "absolute",
    bottom: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(77,226,255,0.16)",
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
    color: "#F6B36C",
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
    backgroundColor: "#FF5A5F",
  },
  progressLabel: {
    color: "rgba(247,247,251,0.6)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
});