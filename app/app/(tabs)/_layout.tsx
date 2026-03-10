import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

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
    <View style={tabIconStyles.wrap}>
      {focused && (
        <View style={[tabIconStyles.activeDot, { backgroundColor: accentColor }]} />
      )}
      <View
        style={[
          tabIconStyles.iconBg,
          focused && { backgroundColor: accentColor + "28" },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 4,
  },
  activeDot: {
    position: "absolute",
    top: 0,
    width: 22,
    height: 3,
    borderRadius: 1.5,
  },
  iconBg: {
    width: 46,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
          backgroundColor: isIOS ? "transparent" : "rgba(10,10,18,0.82)",
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.06)",
          borderRadius: isIOS ? 28 : 24,
          marginHorizontal: isIOS ? 14 : 12,
          marginBottom: isIOS ? 14 : 12,
          height: isIOS ? 62 : 58,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: "hidden",
          elevation: 0,
          // @ts-ignore
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
          ...(isWeb ? { height: 62, paddingBottom: 0 } : {}),
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarBackground: () =>
          isIOS ? (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.glassOverlay} />
            </View>
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,18,0.82)" }]}
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
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 28,
    backgroundColor: "rgba(10,10,18,0.55)",
  },
});
