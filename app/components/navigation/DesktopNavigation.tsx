/**
 * CineLog — desktop / tablet top navigation.
 *
 * Logo, primary sections, an inline search shortcut and the profile entry point.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { CineLogLogo } from "@/components/brand/CineLogLogo";
import { NAV_ITEMS } from "@/components/navigation/navItems";
import { FONTS, LAYOUT, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { Pressable } from "@/components/ui/Pressable";

export interface DesktopNavigationProps {
  activeRoute: string;
  onNavigate: (route: string) => void;
  onOpenProfile: () => void;
  gutter: number;
  displayName: string;
  avatarUrl: string | null;
}

export function DesktopNavigation({
  activeRoute,
  onNavigate,
  onOpenProfile,
  gutter,
  displayName,
  avatarUrl,
}: DesktopNavigationProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const initial = displayName.trim().charAt(0).toUpperCase() || "C";

  return (
    <View
      style={[styles.bar, { paddingHorizontal: gutter }]}
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
    >
      <Pressable
        onPress={() => onNavigate("/home")}
        accessibilityRole="link"
        accessibilityLabel="CineLog home"
      >
        <CineLogLogo size={26} />
      </Pressable>

      <View style={styles.links}>
        {NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <Pressable
              key={item.route}
              onPress={() => onNavigate(item.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={({ hovered }) => [
                styles.link,
                hovered && !active ? styles.linkHovered : null,
                active ? styles.linkActive : null,
              ]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={15}
                color={active ? colors.textPrimary : colors.textSecondary}
              />
              <Text
                style={[styles.linkText, active ? styles.linkTextActive : null]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={`Open your CineLog profile, ${displayName}`}
        style={({ hovered }) => [
          styles.profile,
          hovered ? styles.profileHovered : null,
        ]}
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
        <Text style={styles.profileName} numberOfLines={1}>
          {displayName}
        </Text>
        <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  bar: {
    height: LAYOUT.topNavHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.xl,
    backgroundColor: c.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flex: 1,
    justifyContent: "center",
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    height: 38,
    borderRadius: RADIUS.pill,
  },
  linkHovered: {
    backgroundColor: c.glass,
  },
  linkActive: {
    backgroundColor: c.surfaceElevated,
  },
  linkText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: c.textSecondary,
  },
  linkTextActive: {
    fontFamily: FONTS.semibold,
    color: c.textPrimary,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingLeft: SPACING.xs,
    paddingRight: SPACING.md,
    height: 40,
    borderRadius: RADIUS.pill,
    maxWidth: 200,
  },
  profileHovered: {
    backgroundColor: c.glass,
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
  profileName: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textPrimary,
    flexShrink: 1,
  },
}));
