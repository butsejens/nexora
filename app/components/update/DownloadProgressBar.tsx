import React, { useEffect } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { COLORS } from "@/constants/colors";

interface DownloadProgressBarProps {
  progress: number; // 0-1
  speed?: number; // MB/s or null for indeterminate
  timeRemaining?: number; // seconds or null
  status?: "downloading" | "preparing" | "installing";
}

export function DownloadProgressBar({
  progress,
  speed,
  timeRemaining,
  status = "downloading",
}: DownloadProgressBarProps) {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, animatedValue]);

  const widthInterpolation = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const statusLabel = {
    downloading: "Downloaden...",
    preparing: "Voorbereiding...",
    installing: "Installatie...",
  }[status];

  const progressPercent = Math.round(progress * 100);

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{statusLabel}</Text>
        <Text style={styles.percent}>{progressPercent}%</Text>
      </View>

      <View style={styles.trackContainer}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthInterpolation,
            },
          ]}
        />
      </View>

      <View style={styles.footer}>
        {speed !== null && speed !== undefined ? (
          <Text style={styles.meta}>{speed.toFixed(1)} MB/s</Text>
        ) : null}
        {timeRemaining !== null && timeRemaining !== undefined ? (
          <Text style={styles.meta}>{formatTimeRemaining(timeRemaining)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  percent: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  trackContainer: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: 999,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  meta: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
