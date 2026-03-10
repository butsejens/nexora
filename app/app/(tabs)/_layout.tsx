import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { DESIGN_COLORS, SIZES, LAYOUT, SHADOWS } from "@/constants/design-system";

const SP_ACCENT = COLORS.accent;

function TabIcon({
  focused,
  accentColor,
  children,
}: {
  focused: boolean;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        tabIconStyles.wrap,
        focused && {
          backgroundColor: accentColor + "28",
          borderRadius: 14,
        },
      ]}
    >
      {children}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : DESIGN_COLORS.glass,
          borderTopWidth: 1,
          borderTopColor: DESIGN_COLORS.border.light,
          borderRadius: isIOS ? 36 : 28,
          marginHorizontal: isIOS ? 16 : 14,
          marginBottom: isIOS ? 16 : 14,
          height: isIOS ? 72 : 68,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: "hidden",
          elevation: 0,
          // @ts-ignore
          shadowColor: COLORS.accent,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 24,
          ...(isWeb ? { height: 72, paddingBottom: 0 } : {}),
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarBackground: () =>
          isIOS ? (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.glassOverlay} />
            </View>
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: DESIGN_COLORS.glass }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sports",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={SP_ACCENT}>
              <MaterialCommunityIcons
                name="soccer"
                size={26}
                color={focused ? SP_ACCENT : COLORS.textMuted}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="livetv"
        options={{
          title: "Live TV",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "tv" : "tv-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "film" : "film-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="series"
        options={{
          title: "Series",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "layers" : "layers-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "arrow-down-circle" : "arrow-down-circle-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
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
    borderColor: DESIGN_COLORS.border.light,
    borderRadius: 36,
    backgroundColor: DESIGN_COLORS.glass,
  },
});
