/**
 * CineLog — mobile bottom navigation.
 *
 * Large touch targets, an accent indicator on the active tab, and safe-area
 * aware padding so it sits correctly above the home indicator.
 */

import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/i18n";
import { NAV_ITEMS } from "@/components/navigation/navItems";
import { FONTS, LAYOUT, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";

export interface BottomNavigationProps {
  /** Current tab route, e.g. "/home". */
  activeRoute: string;
  onNavigate: (route: string) => void;
}

export function BottomNavigation({
  activeRoute,
  onNavigate,
}: BottomNavigationProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, SPACING.sm),
          paddingHorizontal: SPACING.xs,
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel={t("Main navigation")}
    >
      {/* Blur keeps content visible behind the bar on iOS and web. */}
      {Platform.OS === "android" ? null : (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.row}>
        {NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <Pressable
              key={item.route}
              onPress={() => onNavigate(item.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(item.label)}
              style={styles.tab}
              hitSlop={4}
            >
              <View
                style={[styles.iconWrap, active ? styles.iconWrapActive : null]}
              >
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={21}
                  color={active ? colors.accent : colors.textMuted}
                />
              </View>
              <Text style={[styles.label, active ? styles.labelActive : null]}>
                {t(item.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Platform.OS === "android" ? c.background : c.overlay,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: LAYOUT.bottomNavHeight,
    gap: 2,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
  },
  iconWrap: {
    width: 44,
    height: 30,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: c.accentSoft,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    textAlign: "center",
    color: c.textMuted,
  },
  labelActive: {
    fontFamily: FONTS.semibold,
    color: c.textPrimary,
  },
}));
