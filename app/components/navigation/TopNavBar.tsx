/**
 * Nexora Premium Top Navigation Bar
 * One-row sticky navigation with centered items and profile dropdown.
 */
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { useProfileStore } from "@/store/profileStore";
import { ProfileDropdown } from "./ProfileDropdown";

type NavItem = {
  label: string;
  route: string;
  matchKeys: string[];
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", route: "/(tabs)/home", matchKeys: ["home", "index"] },
  { label: "Live", route: "/(tabs)/live-tv", matchKeys: ["live-tv", "live"] },
  { label: "Series", route: "/(tabs)/series", matchKeys: ["series"] },
  { label: "Films", route: "/(tabs)/movies", matchKeys: ["movies", "films"] },
  { label: "Kids", route: "/(tabs)/kids", matchKeys: ["kids"] },
  { label: "Mijn lijst", route: "/(tabs)/my-list", matchKeys: ["my-list"] },
];

export function TopNavBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeProfile = useProfileStore((s) => s.getActiveProfile());

  const isActive = useMemo(
    () => (item: NavItem) =>
      item.matchKeys.some((key) => pathname.includes(key)),
    [pathname],
  );

  return (
    <>
      <View
        style={[
          styles.bar,
          { paddingTop: insets.top + 4, height: TOP_NAV_H + insets.top },
        ]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={[
            "rgba(6,12,24,0.92)",
            "rgba(6,12,24,0.62)",
            "rgba(6,12,24,0)",
          ]}
          locations={[0, 0.58, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.mainRow} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push("/(tabs)/home")}
            style={({ pressed }) => [
              styles.logoBtn,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.logoText}>
              <Text style={styles.logoAccent}>N</Text>EXORA
            </Text>
          </Pressable>

          <View style={styles.navWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.navItems}
            >
              {NAV_ITEMS.map((item) => {
                const active = isActive(item);
                return (
                  <Pressable
                    key={item.label}
                    onPress={() => router.push(item.route as any)}
                    style={[
                      styles.navItemBtn,
                      active && styles.navItemBtnActive,
                      compact && styles.navItemCompact,
                    ]}
                  >
                    <Text
                      style={[styles.navLabel, active && styles.navLabelActive]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push("/search" as any)}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={22}
                color={COLORS.textSecondary}
              />
            </Pressable>

            <Pressable
              onPress={() => setDropdownOpen((o) => !o)}
              style={({ pressed }) => [
                styles.avatarBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor:
                      activeProfile?.avatarColor ?? COLORS.accent,
                  },
                ]}
              >
                <Text style={styles.avatarEmoji}>
                  {(activeProfile?.name?.trim()[0] ?? "?").toUpperCase()}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.border} pointerEvents="none" />
      </View>

      {dropdownOpen && (
        <ProfileDropdown onClose={() => setDropdownOpen(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 120,
    overflow: "hidden",
  },
  border: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 0,
    backgroundColor: "transparent",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: TOP_NAV_H - 8,
  },
  logoBtn: {
    paddingRight: 10,
  },
  logoText: {
    color: COLORS.text,
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 3.2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  logoAccent: {
    color: COLORS.accent,
  },
  navWrap: {
    flex: 1,
    marginLeft: 10,
  },
  navItems: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 14,
  },
  navItemBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  navItemCompact: {
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  navItemBtnActive: {
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  navLabel: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  navLabelActive: {
    color: "#16121F",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {
    marginLeft: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },
  avatarEmoji: {
    fontSize: 15,
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
  },
});
