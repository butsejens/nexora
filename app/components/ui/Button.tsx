/**
 * CineLog — button primitives.
 *
 * Three intents cover the whole app: `primary` for the main action on a screen,
 * `secondary` for glass buttons over artwork, and `ghost` for tertiary actions.
 */

import React from "react";
import { ActivityIndicator, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  ARTWORK,
  FONTS,
  RADIUS,
  SPACING,
  type Palette,
} from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
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
  /** Set when the button sits on a poster or backdrop rather than page chrome. */
  onArtwork?: boolean;
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
  onArtwork = false,
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
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
        variantStyle(colors, variant, onArtwork),
        hovered && !isDisabled ? hoverStyle(colors, variant, onArtwork) : null,
        pressed ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === "primary"
              ? colors.textPrimary
              : labelColor(colors, variant, onArtwork)
          }
        />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Ionicons
              name={icon}
              size={metrics.icon}
              color={labelColor(colors, variant, onArtwork)}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              {
                fontSize: metrics.fontSize,
                color: labelColor(colors, variant, onArtwork),
              },
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
  /** Set when the button sits on a poster or backdrop rather than page chrome. */
  onArtwork?: boolean;
}

export function IconButton({
  icon,
  onPress,
  label,
  variant = "secondary",
  size = 40,
  active = false,
  style,
  onArtwork = false,
}: IconButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed, hovered }) => [
        styles.base,
        { width: size, height: size, borderRadius: RADIUS.pill },
        variantStyle(colors, variant, onArtwork),
        active ? styles.iconActive : null,
        hovered ? hoverStyle(colors, variant, onArtwork) : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={size * 0.46}
        color={active ? colors.accent : labelColor(colors, variant, onArtwork)}
      />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
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
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
}));

function variantStyle(
  colors: Palette,
  variant: ButtonVariant,
  onArtwork: boolean,
): ViewStyle {
  switch (variant) {
    case "primary":
      return { backgroundColor: colors.accent };
    case "secondary":
      return onArtwork
        ? { backgroundColor: ARTWORK.chip, borderColor: ARTWORK.border }
        : { backgroundColor: colors.glass, borderColor: colors.borderStrong };
    case "danger":
      return { backgroundColor: "transparent", borderColor: colors.error };
    case "ghost":
    default:
      return { backgroundColor: "transparent" };
  }
}

function hoverStyle(
  colors: Palette,
  variant: ButtonVariant,
  onArtwork: boolean,
): ViewStyle {
  switch (variant) {
    case "primary":
      return { backgroundColor: colors.accentBright };
    case "secondary":
      return {
        backgroundColor: onArtwork ? ARTWORK.chipHover : colors.glassStrong,
      };
    case "danger":
      return { backgroundColor: colors.accentSoft };
    case "ghost":
    default:
      return { backgroundColor: onArtwork ? ARTWORK.chip : colors.glass };
  }
}

function labelColor(
  colors: Palette,
  variant: ButtonVariant,
  onArtwork: boolean,
): string {
  if (variant === "danger") return colors.error;
  if (onArtwork) {
    return variant === "ghost" ? ARTWORK.textSecondary : ARTWORK.textPrimary;
  }
  return variant === "ghost" ? colors.textSecondary : colors.textPrimary;
}
