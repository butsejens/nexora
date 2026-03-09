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
          borderTopWidth: 0,
          borderRadius: isIOS ? 36 : 28,
          marginHorizontal: isIOS ? 16 : 14,
          marginBottom: isIOS ? 16 : 14,
          height: isIOS ? 76 : 70,
          paddingTop: isIOS ? 8 : 6,
          paddingBottom: isIOS ? 10 : 8,
          overflow: "hidden",
          elevation: 0,
          ...(isWeb ? { height: 78, paddingBottom: 10 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 10,
          marginTop: 1,
          letterSpacing: 0.2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.glassOverlay} />
            </View>
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.tabBar }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sports",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <MaterialCommunityIcons name="soccer" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="livetv"
        options={{
          title: "Live TV",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="tv-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="film-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="series"
        options={{
          title: "Series",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="layers-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Ionicons name="arrow-down-circle-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      {/* Hidden routes – no tab icon */}
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 36,
    backgroundColor: "rgba(9,9,13,0.88)",
  },
});
