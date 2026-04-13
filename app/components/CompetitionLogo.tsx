import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";

import { COLORS } from "@/constants/colors";

type CompetitionLogoProps = {
  uri?: string | null;
  competitionName?: string;
  league?: string | null;
  espnLeague?: string | null;
  size?: number;
};

function shortName(name?: string): string {
  const raw = String(name || "").trim();
  if (!raw) return "L";
  return raw.slice(0, 2).toUpperCase();
}

export function CompetitionLogo({
  uri,
  competitionName,
  league,
  espnLeague,
  size = 18,
}: CompetitionLogoProps) {
  const showImage = typeof uri === "string" && uri.trim().length > 0;
  const label = competitionName || league || espnLeague || "League";
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
        <Text style={styles.fallback}>{shortName(label)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  fallback: {
    color: COLORS.textSecondary,
    fontSize: 8,
    fontFamily: "Inter_700Bold",
  },
});
