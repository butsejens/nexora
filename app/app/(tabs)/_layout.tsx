import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../constants/colors";

// Minimum content height of the tab bar (above safe-area bottom inset)
const TAB_CONTENT_HEIGHT = 56;

function TabIcon({
  focused,
  icon,
}: {
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons
        name={icon}
        size={22}
        color={focused ? COLORS.accent : COLORS.textSecondary}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Always give at least 16px bottom padding so items don't sit on the edge
  const bottomPad = Math.max(insets.bottom, 16);
  const barHeight = TAB_CONTENT_HEIGHT + bottomPad;

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelPosition: "below-icon",
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.iconStyle,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: COLORS.tabBarBorder,
          height: barHeight,
          paddingTop: 8,
          paddingBottom: bottomPad,
          paddingHorizontal: 8,
          // Elevation/shadow for Android depth
          elevation: 16,
          // iOS shadow
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
      }}
    >
      {/* ── Visible tabs ── */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon focused={focused} icon={focused ? "home" : "home-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Zoek",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon focused={focused} icon={focused ? "search" : "search-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          href: "/(tabs)/more",
          title: "Menu",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon focused={focused} icon={focused ? "menu" : "menu-outline"} />
          ),
        }}
      />

      {/* ── Hidden routes (still need to be declared) ── */}
      <Tabs.Screen name="sports-home" options={{ href: null }} />
      <Tabs.Screen name="teams" options={{ href: null }} />
      <Tabs.Screen name="standings" options={{ href: null }} />
      <Tabs.Screen name="game-detail" options={{ href: null }} />
      <Tabs.Screen name="sports-demo" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="livetv" options={{ href: null }} />
      <Tabs.Screen name="movies" options={{ href: null }} />
      <Tabs.Screen name="series" options={{ href: null }} />
      <Tabs.Screen name="downloads" options={{ href: null }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Icon container — shows a red pill when active
  iconWrap: {
    width: 44,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "rgba(229,9,20,0.16)",
  },
  // Tab label
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    lineHeight: 12,
    marginBottom: 1,
  },
  iconStyle: {
    marginTop: 2,
  },
  // Each tab item — flex:1 ensures equal width across all 3 tabs
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
});
