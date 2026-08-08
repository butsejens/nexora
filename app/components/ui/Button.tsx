/**
 * CineLog — button primitives.
 *
 * Three intents cover the whole app: `primary` for the main action on a screen,
 * `secondary` for glass buttons over artwork, and `ghost` for tertiary actions.
 */

import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { Pressable } from "@/components/ui/Pressable";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

const SIZES: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; fontSize: number; icon: number }
> = {
  sm: { height: 36, paddingHorizontal: SPACING.md, fontSize: 13, icon: 15 },
  md: { height: 44, paddingHorizontal: SPACING.lg, fontSize: 14, icon: 17 },
  lg: { height: 52, paddingHorizontal: SPACING.xl, fontSize: 15, icon: 19 },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const metrics = SIZES[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed, hovered }) => [
        styles.base,
        {
          height: metrics.height,
          paddingHorizontal: metrics.paddingHorizontal,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        variantStyles[variant],
        hovered && !isDisabled ? hoverStyles[variant] : null,
        pressed ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === "primary" ? COLORS.textPrimary : COLORS.textSecondary
          }
        />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Ionicons
              name={icon}
              size={metrics.icon}
              color={labelColors[variant]}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              { fontSize: metrics.fontSize, color: labelColors[variant] },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Square icon-only button. Always requires an accessible label. */
export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  variant?: ButtonVariant;
  size?: number;
  active?: boolean;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  label,
  variant = "secondary",
  size = 40,
  active = false,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed, hovered }) => [
        styles.base,
        { width: size, height: size, borderRadius: RADIUS.pill },
        variantStyles[variant],
        active ? styles.iconActive : null,
        hovered ? hoverStyles[variant] : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={size * 0.46}
        color={active ? COLORS.accent : labelColors[variant]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  label: {
    fontFamily: FONTS.semibold,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.45,
  },
  iconActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: COLORS.accent },
  secondary: {
    backgroundColor: COLORS.glass,
    borderColor: COLORS.borderStrong,
  },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent", borderColor: COLORS.error },
};

const hoverStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: COLORS.accentBright },
  secondary: { backgroundColor: COLORS.glassStrong },
  ghost: { backgroundColor: COLORS.glass },
  danger: { backgroundColor: "rgba(239, 68, 68, 0.12)" },
};

const labelColors: Record<ButtonVariant, string> = {
  primary: COLORS.textPrimary,
  secondary: COLORS.textPrimary,
  ghost: COLORS.textSecondary,
  danger: COLORS.error,
};
