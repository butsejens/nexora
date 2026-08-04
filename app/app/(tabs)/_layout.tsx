import { Tabs, usePathname, useRootNavigationState, router } from "expo-router";
import React, { useEffect } from "react";

import { useNexora } from "@/context/NexoraContext";
import { useProfileStore } from "@/store/profileStore";
import { TopNavBar } from "@/components/navigation/TopNavBar";
import { isSafeRoute, recoverNavigation } from "@/core/self-healing";

export default function TabLayout() {
  const { isAuthenticated, authReady } = useNexora();
  const { hasHydrated, activeProfileId } = useProfileStore();
  const navState = useRootNavigationState();
  const pathname = usePathname();
  const hideTopNav = pathname?.includes("/more") ?? false;

  useEffect(() => {
    if (!pathname) return;
    if (!isSafeRoute(pathname)) {
      recoverNavigation("unsafe-tab-route", { pathname });
    }
  }, [pathname]);

  useEffect(() => {
    if (!__DEV__) return;
    // #region agent log
    fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "165c99",
      },
      body: JSON.stringify({
        sessionId: "165c99",
        runId: "baseline",
        hypothesisId: "H2",
        location: "tabs/_layout:gate-check",
        message: "tabs-gate-evaluated",
        data: {
          navReady: Boolean(navState?.key),
          authReady,
          isAuthenticated,
          hasHydrated,
          activeProfileId: activeProfileId || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!navState?.key) return;
    if (!authReady) return;

    // Temporary bypass: allow tab access without auth.

    // Profile gate — must have selected a profile
    if (!hasHydrated) return;
    if (!activeProfileId) {
      router.replace("/select-profile");
    }
  }, [authReady, isAuthenticated, activeProfileId, hasHydrated, navState?.key]);

  useEffect(() => {
    if (!__DEV__) return;
    // #region agent log
    fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "165c99",
      },
      body: JSON.stringify({
        sessionId: "165c99",
        runId: "baseline-5",
        hypothesisId: "H10",
        location: "tabs/_layout:pathname",
        message: "tab-route-visited",
        data: {
          pathname,
          navReady: Boolean(navState?.key),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [pathname, navState?.key]);

  return (
    <Tabs
      initialRouteName="home"
      tabBar={() => (hideTopNav ? null : <TopNavBar />)}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="live-tv" options={{ href: null }} />
      <Tabs.Screen name="series" options={{ title: "Series" }} />
      <Tabs.Screen name="movies" options={{ title: "Films" }} />
      <Tabs.Screen name="kids" options={{ title: "Kids" }} />
      <Tabs.Screen name="collection" options={{ title: "Collectie" }} />
      <Tabs.Screen name="studios" options={{ title: "Studios" }} />
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
