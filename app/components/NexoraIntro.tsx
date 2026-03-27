import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeInDown,
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
  useEffect(() => {
    if (autoFinishMs != null && onFinish) {
      const timer = setTimeout(() => onFinish(), autoFinishMs);
      return () => clearTimeout(timer);
    }
  }, [autoFinishMs, onFinish]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#050505", "#0B0F17"]} style={StyleSheet.absoluteFill} />

      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(420)} style={styles.logoWrap}>
          <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(120).duration(360)} style={styles.sub}>
          {subtitle}
        </Animated.Text>
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
  center: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
    width: "100%",
  },
  logoWrap: {
    width: 182,
    height: 182,
    borderRadius: 46,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  logo: { width: "100%", height: "100%" },
  sub: {
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});