import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../constants/colors";

const TAB_BAR_MIN_HEIGHT = 64;

function TabIcon({ focused, icon }: { focused: boolean; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={[styles.iconWrap, focused ? styles.iconWrapActive : null]}>
      <Ionicons name={icon} size={20} color={focused ? COLORS.accent : COLORS.textSecondary} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          minHeight: TAB_BAR_MIN_HEIGHT + Math.max(insets.bottom, Platform.OS === "ios" ? 2 : 0),
          height: TAB_BAR_MIN_HEIGHT + Math.max(insets.bottom, Platform.OS === "ios" ? 2 : 0),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          paddingHorizontal: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} icon={focused ? "home" : "home-outline"} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} icon={focused ? "search" : "search-outline"} />,
        }}
      />

      <Tabs.Screen name="sports-home" options={{ href: null }} />
      <Tabs.Screen name="teams" options={{ href: null }} />
      <Tabs.Screen name="standings" options={{ href: null }} />
      <Tabs.Screen name="game-detail" options={{ href: null }} />
      <Tabs.Screen name="sports-demo" options={{ href: null }} />

      <Tabs.Screen
        name="more"
        options={{
          href: "/(tabs)/more",
          title: "Menu",
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} icon={focused ? "menu" : "menu-outline"} />,
        }}
      />

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
  iconWrap: {
    width: 34,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "rgba(229,9,20,0.14)",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  tabItem: {
    minWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 2,
    flex: 1,
  },
});
