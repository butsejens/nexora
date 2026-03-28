/**
 * NexoraSimpleHeader
 *
 * Lightweight back-navigation header for pushed/detail screens that don't need
 * the full collapsing/hero treatment.
 *
 * Layout: [back button] [title flex=1] [rightActions]
 *
 * Safe area is handled internally — callers don't need to add paddingTop.
 */

import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { ScalePress } from "@/components/ui/ScalePress";

interface Props {
  title?: string;
  onBack?: () => void;
  rightActions?: React.ReactNode;
}

export function NexoraSimpleHeader({ title, onBack, rightActions }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const handleBack = onBack ?? (() => router.back());

  return (
    <View style={[styles.container, { paddingTop: topPad + 8 }]}>
      <ScalePress style={styles.iconWrap} onPress={handleBack}>
        <View style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </View>
      </ScalePress>

      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      <View style={styles.rightSlot}>
        {rightActions ?? <View style={styles.iconButtonPlaceholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconWrap: {
    borderRadius: 999,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlayCard,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPlaceholder: {
    width: 36,
    height: 36,
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  rightSlot: {
    minWidth: 36,
    alignItems: "flex-end",
  },
});
