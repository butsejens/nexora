import { QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Image, View, StyleSheet, Animated } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

import { MatchAlertsBridge } from "@/components/MatchAlertsBridge";
import { PersonalizationBridge } from "@/components/PersonalizationBridge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NexoraMenuOverlay } from "@/components/navigation/NexoraMenuOverlay";
import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import {
  queryClient,
  getApiBaseCandidates,
  DEFAULT_RENDER_API_BASE,
} from "@/lib/query-client";
import { startPlayerImageWarmup } from "@/lib/player-image-system";
import { NexoraProvider } from "@/context/NexoraContext";
import { UserStateProvider } from "@/context/UserStateContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { cacheWarmup } from "@/lib/services/cache-service";
import { initializeMatchNotifications } from "@/lib/match-notifications";
import { primeBootstrapRealtimeData, realtimeCacheKeys } from "@/services/realtime-engine";
import { logStartupEvent, runStartupTask } from "@/services/startup-orchestrator";
import { recordLaunchSnapshot } from "@/services/update-diagnostics";

// Prevent the splash screen from auto-hiding.
// We call SplashScreen.hideAsync() manually once fonts have loaded.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore — may have already been called or platform doesn't support it.
});

const BOOTSTRAP_CACHE_KEYS = (today: string) => [
  `sports:live:${today}`,
  `sports:today:${today}`,
  realtimeCacheKeys.vodHome(),
  realtimeCacheKeys.vodCollections(),
];

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
    console.info("[nexora:start] update diagnostics", info);
    logStartupEvent("boot", "info", "update-diagnostics", info);
    void recordLaunchSnapshot();
  } catch (error) {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="player" options={{ headerShown: false, animation: "slide_from_bottom", gestureEnabled: true, gestureDirection: "vertical" }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="competition" options={{ headerShown: false }} />
      <Stack.Screen name="match-detail" options={{ headerShown: false }} />
      <Stack.Screen name="team-detail" options={{ headerShown: false }} />
      <Stack.Screen name="player-profile" options={{ headerShown: false }} />
      <Stack.Screen name="detail" options={{ headerShown: false }} />
      <Stack.Screen name="favorites" options={{ headerShown: false }} />
      <Stack.Screen name="premium" options={{ headerShown: false }} />
      <Stack.Screen name="playlist-manage" options={{ headerShown: false }} />
      <Stack.Screen name="playlist-edit" options={{ headerShown: false }} />
      <Stack.Screen name="follow-center" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="legal" options={{ headerShown: false }} />
      <Stack.Screen name="media-category" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useRenderTelemetry("RootLayout");

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const startupRanRef = useRef(false);

  useEffect(() => {
    if (startupRanRef.current) return;
    startupRanRef.current = true;

    const startedAt = Date.now();
    logStartupEvent("boot", "info", "app-launch", { startedAt });
    logUpdateDiagnostics();

    // Fire-and-forget Render warmup: starts the Render cold-boot process immediately
    // so the server is ready by the time the main data fetches begin (~2-5s later).
    fetch(`${DEFAULT_RENDER_API_BASE}/api/ping`, { method: "GET" }).catch(() => {});

    void runStartupTask({
      scope: "boot",
      name: "seed-cache-from-disk",
      timeoutMs: 2500,
      run: async () => {
        const today = new Date().toISOString().slice(0, 10);
        await cacheWarmup(BOOTSTRAP_CACHE_KEYS(today));
      },
    });

    void runStartupTask({
      scope: "background",
      name: "prime-realtime-bootstrap",
      timeoutMs: 70000,
      run: async () => {
        const today = new Date().toISOString().slice(0, 10);
        await primeBootstrapRealtimeData(queryClient, today);
      },
    });

    void runStartupTask({
      scope: "background",
      name: "warm-player-images",
      timeoutMs: 10000,
      run: async () => {
        await startPlayerImageWarmup(queryClient);
      },
    });

    void runStartupTask({
      scope: "background",
      name: "init-notifications",
      timeoutMs: 3000,
      run: async () => {
        await initializeMatchNotifications();
      },
    });

    const doneAt = Date.now();
    logStartupEvent("boot", "info", "ui-mounted", { durationMs: doneAt - startedAt });
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.type === "app_update") {
        router.push("/profile");
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let keepAliveId: ReturnType<typeof setInterval> | null = null;
    let lastRefreshAt = Date.now();
    const RESUME_STALE_MS = 90000;
    const KEEP_ALIVE_MS = 4 * 60 * 1000;

    const pingRender = () => {
      const baseList = getApiBaseCandidates();
      const renderBase = baseList.find((b) => /onrender\.com/i.test(b)) || DEFAULT_RENDER_API_BASE;
      fetch(`${renderBase}/api/sports/health`, { method: "GET" }).catch(() => {});
    };

    const onForeground = () => {
      const now = Date.now();
      if (now - lastRefreshAt >= RESUME_STALE_MS) {
        lastRefreshAt = now;
        void runStartupTask({
          scope: "background",
          name: "resume-realtime-refresh",
          timeoutMs: 70000,
          run: async () => {
            const today = new Date().toISOString().slice(0, 10);
            await primeBootstrapRealtimeData(queryClient, today);
          },
        });
      }

      if (!keepAliveId) {
        keepAliveId = setInterval(pingRender, KEEP_ALIVE_MS);
      }
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        onForeground();
        return;
      }

      if (keepAliveId) {
        clearInterval(keepAliveId);
        keepAliveId = null;
      }
    });

    onForeground();

    return () => {
      sub.remove();
      if (keepAliveId) {
        clearInterval(keepAliveId);
      }
    };
  }, []);

  // In-app branded splash overlay: fades out after fonts + brief Nexora logo moment.
  const [inAppSplashDone, setInAppSplashDone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  // Wait for fonts before rendering to avoid invisible text flash.
  // fontError is fine — system fonts will be used as fallback.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      // Fade out in-app Nexora splash after 1.4s (long enough to see it)
      const timer = setTimeout(() => {
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }).start(() => setInAppSplashDone(true));
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded, fontError, splashOpacity]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NexoraProvider>
              <UserStateProvider>
                <PersonalizationBridge />
                <MatchAlertsBridge />
                <RootLayoutNav />
                <NexoraMenuOverlay />
              </UserStateProvider>
            </NexoraProvider>
            {!inAppSplashDone && (
              <Animated.View
                style={[splashStyles.overlay, { opacity: splashOpacity }]}
                pointerEvents="none"
              >
                <Image
                  source={require("../assets/images/logo.png")}
                  style={splashStyles.logo}
                  resizeMode="contain"
                />
              </Animated.View>
            )}
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const splashStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logo: {
    width: 180,
    height: 180,
  },
});
