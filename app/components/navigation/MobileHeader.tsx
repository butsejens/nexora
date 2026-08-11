/**
 * CineLog — mobile top bar.
 *
 * Compact logo plus profile entry point. Kept lightweight so the hero artwork
 * stays the first thing viewers see.
 */

import React from "react";
import { Platform, StatusBar, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/i18n";
import { CineLogLogo } from "@/components/brand/CineLogLogo";
import { ARTWORK, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { Pressable } from "@/components/ui/Pressable";

export interface MobileHeaderProps {
  onOpenProfile: () => void;
  gutter: number;
  displayName: string;
  avatarUrl: string | null;
  /** Page title shown instead of the logo on secondary tabs. */
  title?: string;
  /** Render over artwork without a background fill. */
  transparent?: boolean;
}

export function MobileHeader({
  onOpenProfile,
  gutter,
  displayName,
  avatarUrl,
  title,
  transparent = false,
}: MobileHeaderProps) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // On Android, insets.top can be 0 when the system reports edge-to-edge but
  // SafeAreaProvider hasn't resolved yet — fall back to StatusBar.currentHeight.
  const statusBarHeight = insets.top > 0 ? insets.top : (Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0);
  const initial = displayName.trim().charAt(0).toUpperCase() || "C";

  return (
    <View
      style={[
        styles.bar,
        transparent ? styles.transparent : null,
        { paddingTop: statusBarHeight + SPACING.sm, paddingHorizontal: gutter },
      ]}
    >
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={styles.logoWrap}>
          <CineLogLogo size={24} />
        </View>
      )}

      <Pressable
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={t("Open your CineLog profile, {{name}}", {
          name: displayName,
        })}
        hitSlop={8}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Floating back button used on detail pages that render under the status bar. */
export function FloatingBackButton({
  onPress,
  gutter,
}: {
  onPress: () => void;
  gutter: number;
}) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top > 0 ? insets.top : (Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("Go back")}
      hitSlop={8}
      style={({ hovered }) => [
        styles.back,
        { top: statusBarHeight + SPACING.sm, left: gutter },
        hovered ? styles.backHovered : null,
      ]}
    >
      <Ionicons name="chevron-back" size={20} color={ARTWORK.textPrimary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c, t) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACING.sm,
    backgroundColor: c.background,
  },
  transparent: {
    backgroundColor: "transparent",
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: c.textPrimary,
  },
  logoWrap: {
    flex: 1,
    minWidth: 120,
    maxWidth: 200,
    paddingRight: SPACING.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accent,
  },
  avatarText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: c.textPrimary,
  },
  back: {
    position: "absolute",
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ARTWORK.chip,
    borderWidth: 1,
    borderColor: c.border,
  },
  backHovered: {
    backgroundColor: c.surfaceHover,
  },
}));
