import { Tabs, useRootNavigationState , router } from "expo-router";
import React, { useEffect } from "react";

import { useProfileStore } from "@/store/profileStore";
import { TopNavBar } from "@/components/navigation/TopNavBar";

export default function TabLayout() {
  const { hasHydrated, activeProfileId } = useProfileStore();
  const navState = useRootNavigationState();

  // Gate: redirect to profile picker if no profile selected yet
  useEffect(() => {
    if (!navState?.key) return;
    if (!hasHydrated) return;
    if (!activeProfileId) {
      router.replace("/select-profile");
    }
  }, [activeProfileId, hasHydrated, navState?.key]);

  return (
    <Tabs
      initialRouteName="home"
      tabBar={() => <TopNavBar />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="live-tv" options={{ title: "Live TV" }} />
      <Tabs.Screen name="series" options={{ title: "Series" }} />
      <Tabs.Screen name="movies" options={{ title: "Films" }} />
      <Tabs.Screen name="kids" options={{ title: "Kids" }} />
      <Tabs.Screen name="my-list" options={{ title: "Mijn lijst" }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="smart-feed" options={{ href: null }} />
      <Tabs.Screen name="downloads" options={{ href: null }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
