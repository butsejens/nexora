import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { isTV } from "@/lib/platform";
import { useTranslation } from "@/lib/useTranslation";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
      {focused && <View style={[tabIconStyles.activeDot, { backgroundColor: accentColor }]} />}
      <View style={[tabIconStyles.iconBg, focused && { backgroundColor: accentColor + "28" }]}>
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabMarginBottom = isIOS ? Math.max(14, insets.bottom - 10) : Math.max(12, insets.bottom || 12);

  if (isTV) {
    return (
      <Tabs
        initialRouteName="home"
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarPosition: "left",
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarLabelStyle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
          tabBarStyle: {
            backgroundColor: "rgba(10,10,18,0.95)",
            borderRightWidth: 1,
            borderRightColor: "rgba(255,255,255,0.06)",
            width: 200,
            paddingTop: 40,
          },
          tabBarItemStyle: {
            paddingVertical: 16,
            paddingHorizontal: 20,
            borderRadius: 12,
            marginVertical: 2,
            marginHorizontal: 8,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: t("tabs.home") || "Home",
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: t("tabs.search") || "Search",
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "search" : "search-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t("tabs.more") || "More",
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "ellipsis-horizontal" : "ellipsis-horizontal-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
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

  return (
    <Tabs
      initialRouteName="home"
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
          marginBottom: tabMarginBottom,
          height: isIOS ? 62 : 58,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: "hidden",
          elevation: 0,
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,18,0.82)" }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          href: undefined,
          title: t("tabs.home") || "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          href: undefined,
          title: t("tabs.search") || "Search",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "search" : "search-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
          ),
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          href: undefined,
          title: t("tabs.more") || "More",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} accentColor={COLORS.accent}>
              <Ionicons
                name={focused ? "ellipsis-horizontal" : "ellipsis-horizontal-outline"}
                size={24}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            </TabIcon>
          ),
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
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 28,
    backgroundColor: "rgba(10,10,18,0.55)",
  },
});
