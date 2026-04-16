import { Tabs, useRootNavigationState , router } from "expo-router";
import React, { useEffect } from "react";

import { useNexora } from "@/context/NexoraContext";
import { useProfileStore } from "@/store/profileStore";
import { TopNavBar } from "@/components/navigation/TopNavBar";

export default function TabLayout() {
  const { isAuthenticated, authReady } = useNexora();
  const { hasHydrated, activeProfileId } = useProfileStore();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    if (!authReady) return;

    // Auth gate — no tab access without a real authenticated session
    if (!isAuthenticated) {
      router.replace("/auth");
      return;
    }

    // Profile gate — must have selected a profile
    if (!hasHydrated) return;
    if (!activeProfileId) {
      router.replace("/select-profile");
    }
  }, [authReady, isAuthenticated, activeProfileId, hasHydrated, navState?.key]);

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
