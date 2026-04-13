import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

export type UpdateStateType = "checking" | "available" | "downloading" | "ready" | "error" | "no-update";

interface UpdateStateCardProps {
  state: UpdateStateType;
  headline?: string;
  detail?: string;
  progress?: number; // 0-1, for downloading state
}

const stateConfig = {
  checking: {
    icon: "magnify",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.12)",
  },
  available: {
    icon: "arrow-down-circle-outline",
    color: COLORS.accent,
    bg: "rgba(229,9,20,0.12)",
  },
  downloading: {
    icon: "download",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
  },
  ready: {
    icon: "check-circle",
    color: "#10B981",
    bg: "rgba(16,185,129,0.12)",
  },
  error: {
    icon: "alert-circle-outline",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.12)",
  },
  "no-update": {
    icon: "check-circle-outline",
    color: "#6B7280",
    bg: "rgba(107,114,128,0.12)",
  },
};

export function UpdateStateCard({
  state,
  headline,
  detail,
  progress,
}: UpdateStateCardProps) {
  const config = stateConfig[state];

  const defaultHeadlines = {
    checking: "Controleren op updates...",
    available: "Update beschikbaar",
    downloading: "Update aan het downloaden...",
    ready: "Klaar voor installatie",
    error: "Fout bij controleren",
    "no-update": "Je app is up-to-date",
  };

  const displayHeadline = headline || defaultHeadlines[state];

  const defaultDetails = {
    checking: "Even geduld, we controleren op nieuwe versies...",
    available: "Er is een nieuwe versie beschikbaar.",
    downloading: "De update wordt gedownload. Dit kan even duren.",
    ready: "De update is klaar. Klik op instaleren.",
    error: "Kon niet controleren op updates. Probeer het later opnieuw.",
    "no-update": "Je hebt al de nieuwste versie.",
  };

  const displayDetail = detail || defaultDetails[state];

  return (
    <View style={[styles.card, { backgroundColor: config.bg, borderColor: config.color }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={config.icon as any} size={24} color={config.color} />
        <Text style={[styles.headline, { color: config.color }]}>{displayHeadline}</Text>
      </View>

      <Text style={styles.detail}>{displayDetail}</Text>

      {progress !== undefined && progress > 0 && progress < 1 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headline: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    flex: 1,
  },
  detail: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 19,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: 999,
  },
});
