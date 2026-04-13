import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

interface VersionInfoBlockProps {
  currentVersion: string;
  newVersion?: string;
  fileSize?: string;
  releaseDate?: string;
  showBadge?: boolean;
}

export function VersionInfoBlock({
  currentVersion,
  newVersion,
  fileSize,
  releaseDate,
  showBadge = true,
}: VersionInfoBlockProps) {
  return (
    <View style={styles.container}>
      <View style={styles.versionCard}>
        <View style={styles.versionMain}>
          <Text style={styles.label}>Huidige versie</Text>
          <Text style={styles.version}>{currentVersion}</Text>
        </View>
        {showBadge ? (
          <MaterialCommunityIcons name="check-circle" size={24} color="#10B981" />
        ) : null}
      </View>

      {newVersion ? (
        <>
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
          </View>

          <View style={styles.versionCard}>
            <View style={styles.versionMain}>
              <Text style={styles.label}>Beschikbare versie</Text>
              <Text style={styles.version}>{newVersion}</Text>
            </View>
            <MaterialCommunityIcons name="arrow-down-circle" size={24} color={COLORS.accent} />
          </View>

          {fileSize || releaseDate ? (
            <View style={styles.metaRow}>
              {fileSize ? (
                <View style={styles.metaChip}>
                  <MaterialCommunityIcons name="package" size={14} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{fileSize}</Text>
                </View>
              ) : null}
              {releaseDate ? (
                <View style={styles.metaChip}>
                  <MaterialCommunityIcons name="calendar-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{releaseDate}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  versionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  versionMain: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  version: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 16,
  },
  dividerContainer: {
    alignItems: "center",
    paddingVertical: 4,
  },
  divider: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
  },
  metaChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  metaText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
