import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

export type UpdateType = "ota" | "apk" | "none";

interface UpdateTypeBadgeProps {
  type: UpdateType;
  size?: "small" | "medium" | "large";
}

export function UpdateTypeBadge({ type, size = "medium" }: UpdateTypeBadgeProps) {
  const config = {
    ota: {
      icon: "cloud-download-outline",
      label: "Snelle update",
      color: "#10B981",
      bg: "rgba(16,185,129,0.12)",
    },
    apk: {
      icon: "package-down",
      label: "Volledige update",
      color: COLORS.accent,
      bg: "rgba(229,9,20,0.12)",
    },
    none: {
      icon: "check-circle-outline",
      label: "Up-to-date",
      color: "#6B7280",
      bg: "rgba(107,114,128,0.12)",
    },
  }[type];

  const sizeConfig = {
    small: { fontSize: 11, padding: 6, iconSize: 12 },
    medium: { fontSize: 12, padding: 8, iconSize: 14 },
    large: { fontSize: 13, padding: 10, iconSize: 16 },
  }[size];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, paddingVertical: sizeConfig.padding, paddingHorizontal: sizeConfig.padding + 2 },
      ]}
    >
      <MaterialCommunityIcons name={config.icon as any} size={sizeConfig.iconSize} color={config.color} />
      <Text style={[styles.label, { fontSize: sizeConfig.fontSize, color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
  },
});
