import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
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
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    overlayOpacity.value = withTiming(1, { duration: 650 });

    if (autoFinishMs != null && onFinish) {
      const timer = setTimeout(() => onFinish(), autoFinishMs);
      return () => clearTimeout(timer);
    }
  }, [autoFinishMs, onFinish, overlayOpacity]);

  return (
    <View style={styles.container}>
      <Video
        source={require("../assets/videos/intro.mp4")}
        style={StyleSheet.absoluteFill}
        shouldPlay
        isLooping
        isMuted
        resizeMode={ResizeMode.COVER}
      />
      <LinearGradient colors={["rgba(0,0,0,0.30)", "rgba(0,0,0,0.72)"]} style={StyleSheet.absoluteFill} />

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