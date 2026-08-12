/**
 * CineLog — selectable pill used for genres, browse filters and result tabs.
 */

import React from "react";
import { Text } from "react-native";

import { useT } from "@/i18n";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { Pressable } from "@/components/ui/Pressable";

export interface GenrePillProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Optional trailing count, e.g. result totals on the search tabs. */
  count?: number;
}

export function GenrePill({
  label,
  selected = false,
  onPress,
  count,
}: GenrePillProps) {
  const t = useT();
  const styles = useStyles();
  const translated = t(label);
  const text =
    typeof count === "number" ? `${translated} ${count}` : translated;

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

const useStyles = makeStyles((c, t) => ({
  pillWrap: {
    height: 34,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
  },
  selected: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  selectedText: {
    color: c.textPrimary,
    fontFamily: FONTS.semibold,
  },
  hovered: {
    backgroundColor: c.surfaceHover,
    borderColor: c.borderStrong,
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
    color: c.textSecondary,
    backgroundColor: c.glass,
    overflow: "hidden",
  },
}));
