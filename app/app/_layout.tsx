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
import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

import { MatchAlertsBridge } from "@/components/MatchAlertsBridge";
import { PersonalizationBridge } from "@/components/PersonalizationBridge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NexoraMenuOverlay } from "@/components/navigation/NexoraMenuOverlay";
import {
  queryClient,
  getApiBaseCandidates,
  apiRequestJson,
  DEFAULT_RENDER_API_BASE,
} from "@/lib/query-client";
import { startPlayerImageWarmup } from "@/lib/player-image-system";
import { NexoraProvider } from "@/context/NexoraContext";
import { UserStateProvider } from "@/context/UserStateContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { cacheSet, cachePeekStale, CacheTTL, cacheWarmup } from "@/lib/services/cache-service";
import { initializeMatchNotifications } from "@/lib/match-notifications";
import { logStartupEvent, runStartupTask } from "@/services/startup-orchestrator";
import { recordLaunchSnapshot } from "@/services/update-diagnostics";

const PREFETCH_ENTRIES = (today: string) => [
  { queryKey: ["movies", "trending"], cacheKey: "movies:trending", ttlMs: CacheTTL.HOME_RAILS },
  { queryKey: ["series", "trending"], cacheKey: "series:trending", ttlMs: CacheTTL.HOME_RAILS },
  { queryKey: ["sports", "today", today], cacheKey: `sports:today:${today}`, ttlMs: CacheTTL.TODAY_SPORTS },
  { queryKey: ["sports", "live", today], cacheKey: `sports:live:${today}`, ttlMs: CacheTTL.LIVE_MATCH },
];

function normalizeSportsPayload(json: any) {
  const hasMatchBuckets =
    Array.isArray(json?.live) ||
    Array.isArray(json?.upcoming) ||
    Array.isArray(json?.finished);
  if (!hasMatchBuckets) return json;
  return {
    ...json,
    live: Array.isArray(json?.live) ? json.live : [],
    upcoming: Array.isArray(json?.upcoming) ? json.upcoming : [],
    finished: Array.isArray(json?.finished) ? json.finished : [],
  };
}

function seedQueryClientFromCache() {
  const today = new Date().toISOString().slice(0, 10);
  for (const { queryKey, cacheKey } of PREFETCH_ENTRIES(today)) {
    const cached = cachePeekStale(cacheKey);
    if (cached != null) {
      queryClient.setQueryData(queryKey, cached);
    }
  }
}

let prefetchHomeDataInFlight: Promise<void> | null = null;

function prefetchHomeData(): Promise<void> {
  if (prefetchHomeDataInFlight) return prefetchHomeDataInFlight;

  const run = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const date = encodeURIComponent(today);

    const fetchAndCache = async (path: string, cacheKey: string, ttlMs: number, queryKey: readonly unknown[]) => {
      try {
        const data = await apiRequestJson<any>(path);
        const normalized = path.startsWith("/api/sports/") ? normalizeSportsPayload(data) : data;
        cacheSet(cacheKey, normalized, ttlMs);
        queryClient.setQueryData(queryKey, normalized);
      } catch {
        // Startup prefetch is best-effort and must never block render.
      }
    };

    await Promise.allSettled([
      fetchAndCache(`/api/sports/live?date=${date}`, `sports:live:${today}`, CacheTTL.LIVE_MATCH, ["sports", "live", today]),
      fetchAndCache(`/api/sports/by-date?date=${date}`, `sports:today:${today}`, CacheTTL.TODAY_SPORTS, ["sports", "today", today]),
      fetchAndCache("/api/movies/trending", "movies:trending", CacheTTL.HOME_RAILS, ["movies", "trending"]),
      fetchAndCache("/api/series/trending", "series:trending", CacheTTL.HOME_RAILS, ["series", "trending"]),
    ]);
  };

  prefetchHomeDataInFlight = run().finally(() => {
    prefetchHomeDataInFlight = null;
  });

  return prefetchHomeDataInFlight;
}

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
  useFonts({
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

    void runStartupTask({
      scope: "boot",
      name: "seed-cache-from-disk",
      timeoutMs: 2500,
      run: async () => {
        const today = new Date().toISOString().slice(0, 10);
        await cacheWarmup(PREFETCH_ENTRIES(today).map((entry) => entry.cacheKey));
        seedQueryClientFromCache();
      },
    });

    void runStartupTask({
      scope: "background",
      name: "prefetch-home",
      timeoutMs: 10000,
      run: async () => {
        await prefetchHomeData();
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
          name: "resume-refresh",
          timeoutMs: 15000,
          run: async () => {
            await prefetchHomeData();
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
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
