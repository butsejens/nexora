/**
 * CineLog — selectable pill used for genres, browse filters and result tabs.
 */

import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";

export interface GenrePillProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Optional trailing count, e.g. result totals on the search tabs. */
  count?: number;
}

export function GenrePill({ label, selected = false, onPress, count }: GenrePillProps) {
  const text = typeof count === "number" ? `${label} ${count}` : label;

  if (!onPress) {
    return (
      <Text style={[styles.pill, styles.static]} numberOfLines={1}>
        {text}
      </Text>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed, hovered }) => [
        styles.pillWrap,
        selected ? styles.selected : null,
        hovered && !selected ? styles.hovered : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.pillText, selected ? styles.selectedText : null]}
      >
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    height: 34,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  selected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  selectedText: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semibold,
  },
  hovered: {
    backgroundColor: COLORS.surfaceHover,
    borderColor: COLORS.borderStrong,
  },
  pressed: {
    opacity: 0.85,
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.pill,
  },
  static: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.glass,
    overflow: "hidden",
  },
});
