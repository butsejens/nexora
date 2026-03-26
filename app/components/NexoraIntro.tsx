import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

type NexoraIntroProps = {
  onFinish?: () => void;
  subtitle?: string;
  autoFinishMs?: number | null;
};

export function NexoraIntro({
  onFinish,
  subtitle = "ALL YOUR CONTENT. ONE PLACE.",
  autoFinishMs = null,
}: NexoraIntroProps) {
  const nOpacity = useSharedValue(0);
  const nScale = useSharedValue(0.8);
  const textOpacity = useSharedValue(0);
  const textX = useSharedValue(30);
  const subOpacity = useSharedValue(0);

  useEffect(() => {
    nOpacity.value = withTiming(1, { duration: 500 });
    nScale.value = withTiming(1, { duration: 600 });

    textOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
    textX.value = withDelay(400, withTiming(0, { duration: 500 }));

    subOpacity.value = withDelay(900, withTiming(1, { duration: 400 }));

    if (autoFinishMs != null && onFinish) {
      const timer = setTimeout(() => onFinish(), autoFinishMs);
      return () => clearTimeout(timer);
    }
  }, [autoFinishMs, nOpacity, nScale, onFinish, subOpacity, textOpacity, textX]);

  const nStyle = useAnimatedStyle(() => ({
    opacity: nOpacity.value,
    transform: [{ scale: nScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateX: textX.value }],
  }));

  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#050505", "#0B0B12"]} style={StyleSheet.absoluteFill} />

      <View style={styles.center}>
        <View style={styles.row}>
          <Animated.Text style={[styles.n, nStyle]}>N</Animated.Text>
          <Animated.Text style={[styles.text, textStyle]}>EXORA</Animated.Text>
        </View>

        <Animated.Text style={[styles.sub, subStyle]}>{subtitle}</Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
    justifyContent: "center",
    alignItems: "center",
  },
  center: { alignItems: "center", paddingHorizontal: 24, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  n: {
    fontSize: 110,
    fontWeight: "900",
    color: "#E50914",
    textShadowColor: "rgba(229,9,20,0.4)",
    textShadowRadius: 25,
  },
  text: {
    fontSize: 90,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 8,
  },
  sub: {
    color: "#AAA",
    letterSpacing: 3,
    textAlign: "center",
  },
});