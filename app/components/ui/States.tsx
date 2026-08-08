/**
 * CineLog — empty and error states.
 *
 * Viewers never see a blank page or a stack trace: every failure surfaces as
 * readable copy with a way forward.
 */

import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({
  icon = "film-outline",
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.container, compact ? styles.compact : null]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={26} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  onRetry?: () => void;
  /** Overrides the default "Something went wrong" heading. */
  title?: string;
  message?: string;
  compact?: boolean;
}

export function ErrorState({
  onRetry,
  title = "Something went wrong",
  message = "We couldn't load this content right now. Please try again.",
  compact = false,
}: ErrorStateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.container, compact ? styles.compact : null]}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button
          label="Try again"
          icon="refresh"
          onPress={onRetry}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  compact: {
    paddingVertical: SPACING.xl,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCircle: {
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: c.textPrimary,
    textAlign: "center",
  },
  message: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    color: c.textSecondary,
    textAlign: "center",
    maxWidth: 340,
  },
}));
