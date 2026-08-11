/**
 * CineLog — mobile bottom navigation.
 *
 * Large touch targets, an accent indicator on the active tab, and safe-area
 * aware padding so it sits correctly above the home indicator.
 */

import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
  const { width } = useWindowDimensions();
  const compact = width < 380;

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
      {/* Glass effect blur on all platforms */}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.row,
          compact ? styles.rowCompact : null,
        ]}
      >
        {NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <Pressable
              key={item.route}
              onPress={() => onNavigate(item.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(item.label)}
              style={[styles.tab, compact ? styles.tabCompact : null]}
              hitSlop={4}
            >
              <View
                style={[
                  styles.iconWrap,
                  compact ? styles.iconWrapCompact : null,
                  active ? styles.iconWrapActive : null,
                ]}
              >
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={compact ? 19 : 21}
                  color={active ? "#FFFFFF" : colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  compact ? styles.labelCompact : null,
                  active ? styles.labelActive : null,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: LAYOUT.bottomNavHeight,
    paddingTop: 3,
    paddingBottom: 6,
    gap: 0,
  },
  rowCompact: {
    minHeight: LAYOUT.bottomNavHeight - 2,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 1,
  },
  tabCompact: {
    gap: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  iconWrapActive: {
    backgroundColor: c.accent,
    borderWidth: 0,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    lineHeight: 12,
    paddingHorizontal: 1,
    textAlign: "center",
    color: c.textMuted,
    width: "100%",
    includeFontPadding: false,
  },
  labelCompact: {
    fontSize: 9,
    lineHeight: 11,
  },
  labelActive: {
    fontFamily: FONTS.semibold,
    color: "#FFFFFF",
  },
}));
