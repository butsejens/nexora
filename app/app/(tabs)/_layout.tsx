import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : COLORS.tabBar,
          borderTopWidth: 1,
          borderTopColor: isIOS ? "transparent" : COLORS.tabBarBorder,
          borderRadius: isIOS ? 32 : 24,
          marginHorizontal: isIOS ? 18 : 16,
          marginBottom: isIOS ? 12 : 12,
          height: isIOS ? 74 : 68,
          paddingTop: isIOS ? 6 : 6,
          paddingBottom: isIOS ? 8 : 8,
          overflow: "hidden",
          elevation: 0,
          ...(isWeb ? { height: 78, paddingBottom: 10 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          marginBottom: 2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.glassOverlay} />
            </View>
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.tabBar }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sports",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
              <MaterialCommunityIcons name="soccer" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="livetv"
        options={{
          title: "Live TV",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="tv" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="film" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="series"
        options={{
          title: "Series",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="layers" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="arrow-down-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      {/* Verborgen routes – geen tab icon */}
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(161, 194, 242, 0.45)",
    borderRadius: 32,
    backgroundColor: "rgba(8, 31, 82, 0.74)",
  },
});
