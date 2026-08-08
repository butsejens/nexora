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

import { NAV_ITEMS } from "@/components/navigation/navItems";
import { COLORS, FONTS, LAYOUT, RADIUS, SPACING } from "@/constants/theme";

export interface BottomNavigationProps {
  /** Current tab route, e.g. "/home". */
  activeRoute: string;
  onNavigate: (route: string) => void;
}

export function BottomNavigation({
  activeRoute,
  onNavigate,
}: BottomNavigationProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, SPACING.sm) },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
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
              accessibilityLabel={item.label}
              style={styles.tab}
              hitSlop={4}
            >
              <View
                style={[styles.iconWrap, active ? styles.iconWrapActive : null]}
              >
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={21}
                  color={active ? COLORS.accent : COLORS.textMuted}
                />
              </View>
              <Text style={[styles.label, active ? styles.labelActive : null]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor:
      Platform.OS === "android" ? COLORS.background : COLORS.overlay,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: LAYOUT.bottomNavHeight,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconWrap: {
    width: 40,
    height: 26,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: COLORS.accentSoft,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: COLORS.textMuted,
  },
  labelActive: {
    fontFamily: FONTS.semibold,
    color: COLORS.textPrimary,
  },
});
