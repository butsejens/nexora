import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";

import { COLORS } from "@/constants/colors";

type TeamLogoProps = {
  uri?: string | null;
  teamName?: string;
  size?: number;
};

function initials(name?: string): string {
  const raw = String(name || "").trim();
  if (!raw) return "?";
  const parts = raw.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("");
}

export function TeamLogo({ uri, teamName, size = 40 }: TeamLogoProps) {
  const showImage = typeof uri === "string" && uri.trim().length > 0;
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {showImage ? (
        <ExpoImage source={uri} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <Text style={styles.fallback}>{initials(teamName)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  fallback: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});
