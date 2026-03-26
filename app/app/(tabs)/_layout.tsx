import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { isTV } from "@/lib/platform";
import { useTranslation } from "@/lib/useTranslation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboardingStore } from "@/store/onboarding-store";

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const moviesEnabled = useOnboardingStore((state) => state.moviesEnabled);
  const tabMarginBottom = isIOS ? Math.max(14, insets.bottom - 10) : Math.max(12, insets.bottom || 12);

  // TV: sidebar-style — left rail with labels, no blur, larger hit areas
  if (isTV) {
    return (
      <Tabs
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
        {/* TV: Live TV first, then Movies, Series, Downloads — no Sports */}
        <Tabs.Screen
          name="livetv"
          options={{
            title: t("tabs.livetv"),
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "tv" : "tv-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="movies"
          options={{
            href: moviesEnabled ? undefined : null,
            title: t("tabs.films"),
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "film" : "film-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="series"
          options={{
            href: moviesEnabled ? undefined : null,
            title: t("tabs.series"),
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "layers" : "layers-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="downloads"
          options={{
            title: t("tabs.downloads"),
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name={focused ? "arrow-down-circle" : "arrow-down-circle-outline"}
                size={28}
                color={focused ? COLORS.accent : COLORS.textMuted}
              />
            ),
          }}
        />
        {/* Hide sports + settings + favorites on TV */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="favorites" options={{ href: null }} />
      </Tabs>
    );
  }

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
          marginBottom: tabMarginBottom,
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
      {/* Home Tab - show when sports or movies enabled */}
      <Tabs.Screen
        name="index"
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

      {/* Search Tab */}
      <Tabs.Screen
        name="search"
        options={{
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

      {/* More Tab */}
      <Tabs.Screen
        name="more"
        options={{
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

      {/* Legacy routes - hidden but available for navigation */}
      <Tabs.Screen
        name="livetv"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="series"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          href: null,
        }}
      />
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
