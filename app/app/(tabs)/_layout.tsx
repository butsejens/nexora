import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../constants/colors";

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
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === "ios" ? 62 + Math.max(0, insets.bottom - 6) : 62,
          paddingBottom: Platform.OS === "ios" ? Math.max(6, insets.bottom - 4) : 6,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={focused ? "home" : "home-outline"} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={focused ? "search" : "search-outline"} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Menu",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={focused ? "menu" : "menu-outline"} />,
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
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "rgba(229,9,20,0.14)",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    marginTop: 1,
  },
});
