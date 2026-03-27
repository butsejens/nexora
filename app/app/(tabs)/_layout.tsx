import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          display: "none",
        },
      }}
    >
      <Tabs.Screen name="home" options={{ href: undefined }} />
      <Tabs.Screen name="search" options={{ href: undefined }} />
      <Tabs.Screen name="more" options={{ href: undefined }} />

      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="livetv" options={{ href: null }} />
      <Tabs.Screen name="movies" options={{ href: null }} />
      <Tabs.Screen name="series" options={{ href: null }} />
      <Tabs.Screen name="downloads" options={{ href: null }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}
