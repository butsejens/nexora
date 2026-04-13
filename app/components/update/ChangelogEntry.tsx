import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

export interface ChangelogEntryData {
  version: string;
  date: string;
  changes: string[];
  isCurrent?: boolean;
}

interface ChangelogEntryProps {
  entry: ChangelogEntryData;
}

export function ChangelogEntry({ entry }: ChangelogEntryProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.versionInfo}>
          <Text style={styles.version}>v{entry.version}</Text>
          <Text style={styles.date}>{entry.date}</Text>
        </View>
        {entry.isCurrent ? (
          <View style={styles.badge}>
            <MaterialCommunityIcons name="check" size={12} color="#10B981" />
            <Text style={styles.badgeText}>Huiding</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.changesList}>
        {entry.changes.map((change, idx) => (
          <View key={`${entry.version}-${idx}`} style={styles.changeRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.changeText}>{change}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  versionInfo: {
    gap: 4,
  },
  version: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
  },
  date: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: "#10B981",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  changesList: {
    gap: 6,
  },
  changeRow: {
    flexDirection: "row",
    gap: 8,
  },
  bullet: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    marginTop: -2,
  },
  changeText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 19,
  },
});
