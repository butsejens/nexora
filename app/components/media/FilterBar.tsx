/**
 * CineLog — horizontal filter bar used on the Movies, Series and Search pages.
 */

import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { GenrePill } from "@/components/ui/GenrePill";
import { COLORS, FONTS, SPACING } from "@/constants/theme";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface FilterBarProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Small label rendered above the row, e.g. "Genres". */
  heading?: string;
  gutter: number;
  accessibilityLabel: string;
}

export function FilterBar<T extends string>({
  options,
  value,
  onChange,
  heading,
  gutter,
  accessibilityLabel,
}: FilterBarProps<T>) {
  return (
    <View style={styles.block}>
      {heading ? (
        <Text style={[styles.heading, { paddingHorizontal: gutter }]}>
          {heading}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingHorizontal: gutter }]}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
      >
        {options.map((option) => (
          <GenrePill
            key={option.value}
            label={option.label}
            count={option.count}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.sm,
  },
  heading: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: COLORS.textMuted,
  },
  row: {
    gap: SPACING.sm,
    alignItems: "center",
  },
});
