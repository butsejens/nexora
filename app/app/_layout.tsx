import { QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { Stack, router, usePathname, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Constants from "expo-constants";

import { PersonalizationBridge } from "@/components/PersonalizationBridge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NexoraMenuOverlay } from "@/components/navigation/NexoraMenuOverlay";
import { queryClient } from "@/lib/query-client";
import { NexoraProvider } from "@/context/NexoraContext";
import { UserStateProvider } from "@/context/UserStateContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { logStartupEvent } from "@/services/startup-orchestrator";
import { recordLaunchSnapshot } from "@/services/update-diagnostics";
import { refreshStreamProviders } from "@/lib/playback-engine";
import {
  hydrateSelfHealingLogs,
  installGlobalErrorHandler,
  logSelfHealing,
} from "@/core/self-healing";
import { runHealthCheck } from "@/src/core/autonomous/healthMonitor";
import { refreshMaintenanceSnapshot } from "@/src/core/autonomous/maintenanceMode";
import { AUTONOMOUS_CONFIG } from "@/src/core/autonomous/autonomousConfig";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore unsupported or duplicate prevent call.
});

function logUpdateDiagnostics() {
  try {
    const info: Record<string, unknown> = {
      appVersion: Constants.expoConfig?.version || "unknown",
      runtimeVersion: String(Updates.runtimeVersion || "unknown"),
      updateId: Updates.updateId || "embedded",
      channel: Updates.channel || "unknown",
      isEmbedded: Updates.isEmbeddedLaunch,
      createdAt: Updates.createdAt?.toISOString() || "unknown",
      isEnabled: Updates.isEnabled,
    };
    if (__DEV__) console.info("[nexora:start] update diagnostics", info);
    logStartupEvent("boot", "info", "update-diagnostics", info);
    void recordLaunchSnapshot();
  } catch (error) {
    if (__DEV__)
      console.warn("[nexora:start] failed to read update diagnostics", error);
  }
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: "fade",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="onboarding/quick-start"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="player"
        options={{
          headerShown: false,
          animation: "slide_from_bottom",
          gestureEnabled: true,
          gestureDirection: "vertical",
        }}
      />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="select-profile" options={{ headerShown: false }} />
      <Stack.Screen name="manage-profiles" options={{ headerShown: false }} />
      <Stack.Screen name="detail" options={{ headerShown: false }} />
      <Stack.Screen name="media/movies" options={{ headerShown: false }} />
      <Stack.Screen name="media/series" options={{ headerShown: false }} />
      <Stack.Screen name="media/detail" options={{ headerShown: false }} />
      <Stack.Screen name="media/studio" options={{ headerShown: false }} />
      <Stack.Screen name="favorites" options={{ headerShown: false }} />
      <Stack.Screen name="premium" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="legal" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const navState = useRootNavigationState();
  const pathname = usePathname();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const startupLoggedRef = useRef(false);

  useEffect(() => {
    installGlobalErrorHandler();
    void hydrateSelfHealingLogs();
    void logSelfHealing("info", "UI", "self-healing-initialized");
  }, []);

  useEffect(() => {
    const bootstrapDelay = setTimeout(() => {
      refreshStreamProviders();
    }, 1500);
    return () => clearTimeout(bootstrapDelay);
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await Promise.allSettled([runHealthCheck(), refreshMaintenanceSnapshot()]);
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, AUTONOMOUS_CONFIG.health.monitorIntervalMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (startupLoggedRef.current) return;
    startupLoggedRef.current = true;
    logStartupEvent("boot", "info", "app-launch", { startedAt: Date.now() });
    logUpdateDiagnostics();
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      return;
    }
    SplashScreen.hideAsync().catch(() => undefined);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, 600);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let sub: { remove: () => void } | null = null;

    const setupNotificationListener = async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (!isMounted) return;
        sub = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            if (!navState?.key) return;
            if (
              response.notification.request.content.data?.type === "app_update"
            ) {
              router.push("/profile");
            }
          },
        );
      } catch (error) {
        if (__DEV__)
          console.warn(
            "[nexora:start] notifications listener unavailable",
            error,
          );
      }
    };

    void setupNotificationListener();

    return () => {
      isMounted = false;
      sub?.remove();
    };
  }, [navState?.key]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshStreamProviders();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

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
        runId: "baseline-6",
        hypothesisId: "H11",
        location: "app/_layout:pathname",
        message: "root-route-visited",
        data: {
          pathname,
          navReady: Boolean(navState?.key),
          origin:
            typeof window !== "undefined" ? window.location.origin : "native",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [pathname, navState?.key]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NexoraProvider>
              <UserStateProvider>
                <PersonalizationBridge />
                <RootLayoutNav />
                <NexoraMenuOverlay />
              </UserStateProvider>
            </NexoraProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
