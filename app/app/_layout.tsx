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
import { Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, getApiBaseCandidates, apiRequest } from "@/lib/query-client";
import { startPlayerImageWarmup } from "@/lib/player-image-system";
import { NexoraProvider } from "@/context/NexoraContext";
import { UserStateProvider } from "@/context/UserStateContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NexoraIntro } from "@/components/NexoraIntro";
import { NexoraBootScreen } from "@/components/NexoraBootScreen";
import * as Updates from "expo-updates";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";
import { COLORS } from "@/constants/colors";
import {
  preloadDiskCache,
  cacheSet,
  cacheGet,
  TTL,
} from "@/lib/app-cache";
import { initializeMatchNotifications } from "@/lib/match-notifications";

// ─── Persistent cache keys (must match what screens useQuery with) ────────────
const PREFETCH_ENTRIES = (today: string) => [
  { queryKey: ["movies", "trending"],  cacheKey: "movies:trending",   ttlMs: TTL.TRENDING },
  { queryKey: ["movies", "genres"],    cacheKey: "movies:genres",     ttlMs: TTL.GENRES   },
  { queryKey: ["series", "trending"],  cacheKey: "series:trending",   ttlMs: TTL.TRENDING },
  { queryKey: ["series", "genres"],    cacheKey: "series:genres",     ttlMs: TTL.GENRES   },
  { queryKey: ["sports", "highlights"],cacheKey: "sports:highlights", ttlMs: TTL.HIGHLIGHTS},
  { queryKey: ["sports", "today", today], cacheKey: `sports:today:${today}`, ttlMs: TTL.SPORTS_TODAY },
];

// Seed the QueryClient from disk cache so screens render instantly on cold start.
function seedQueryClientFromCache() {
  const today = new Date().toISOString().slice(0, 10);
  for (const { queryKey, cacheKey } of PREFETCH_ENTRIES(today)) {
    const cached = cacheGet(cacheKey);
    if (cached != null) {
      queryClient.setQueryData(queryKey, cached);
    }
  }
}

// Prefetch key API data, writing results to both QueryClient and disk cache.
function prefetchHomeData() {
  const today = new Date().toISOString().slice(0, 10);
  const date = encodeURIComponent(today);

  const fetchAndCache = async (path: string, ck: string, ttl: number, queryKey: readonly unknown[]) => {
    try {
      const res = await apiRequest("GET", path);
      const data = await res.json();
      cacheSet(ck, data, ttl);
      queryClient.setQueryData(queryKey, data);
      return data;
    } catch {
      return undefined;
    }
  };

  // Phase A (critical): first paint data for sports + home rails.
  void Promise.allSettled([
    fetchAndCache(`/api/sports/live?date=${date}`, "sports:live:" + today, TTL.LIVE, ["sports", "live", today]),
    fetchAndCache(`/api/sports/by-date?date=${date}`, `sports:today:${today}`, TTL.SPORTS_TODAY, ["sports", "today", today]),
    fetchAndCache("/api/sports/highlights", "sports:highlights", TTL.HIGHLIGHTS, ["sports", "highlights"]),
    fetchAndCache("/api/movies/trending", "movies:trending", TTL.TRENDING, ["movies", "trending"]),
    fetchAndCache("/api/series/trending", "series:trending", TTL.TRENDING, ["series", "trending"]),
  ]);

  // Phase B (background): enrich secondary tabs and warm server-side sports caches.
  setTimeout(() => {
    void fetchAndCache(`/api/sports/menu-tools?date=${date}&league=all`, `sports:menu-tools:${today}`, TTL.HIGHLIGHTS, ["sports", "menu-tools", today, "all"]);
    void fetchAndCache("/api/movies/genres-catalog?page=1", "movies:genres", TTL.GENRES, ["movies", "genres"]);
    void fetchAndCache("/api/series/genres-catalog?page=1", "series:genres", TTL.GENRES, ["series", "genres"]);
    void apiRequest("GET", "/api/sports/prefetch-home").catch(() => undefined);
  }, 1200);
}

SplashScreen.preventAutoHideAsync();

// In-memory flags (reset on cold app start)
let hasCompletedBootOnce = false;
let hasShownIntroOnce = false;
let hasCheckedOtaUpdateOnce = false;
let hasCheckedServerUpdateOnce = false;

// Persistent boot flag key — written after first boot so subsequent cold
// starts skip the boot screen entirely.
const BOOT_FLAG_KEY = "nexora_booted_v1";
let otaCheckDone: Promise<boolean> | null = null;
// Signals that the disk cache has been loaded into memory
let diskCacheReady = false;

function compareVersions(a: string, b: string): number {
  const pa = String(a || "")
    .split(".")
    .map((part) => {
      const n = Number.parseInt(String(part).replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
  const pb = String(b || "")
    .split(".")
    .map((part) => {
      const n = Number.parseInt(String(part).replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function resolveInstalledVersion(): string {
  const nativeVersion = String(Application.nativeApplicationVersion || "0.0.0");
  const configVersion = String(Constants.expoConfig?.version || "0.0.0");
  const runtimeVersion = String(Updates.runtimeVersion || "0.0.0");
  return [nativeVersion, configVersion, runtimeVersion].sort(compareVersions).at(-1) || nativeVersion;
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
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // introFinished: skip on subsequent opens (hasShownIntroOnce stays true for app lifetime)
  const [introFinished, setIntroFinished] = useState(hasShownIntroOnce);
  const [bootDone, setBootDone] = useState(hasCompletedBootOnce);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootMessage, setBootMessage] = useState("Resources laden...");
  const [fontFallbackReady, setFontFallbackReady] = useState(false);
  const bootStartedRef = useRef(false);

  // 3s font fallback (reduced from 7s – fonts rarely take this long)
  useEffect(() => {
    const timer = setTimeout(() => setFontFallbackReady(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Hide native splash as soon as fonts (or fallback) are ready
  useEffect(() => {
    if (fontsLoaded || fontFallbackReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontFallbackReady]);

  // Boot sequence — starts immediately when fonts are ready.
  // Strategy:
  //   1. Load disk cache → seed QueryClient (instant, no network)
  //   2. Check AsyncStorage boot flag — if already booted, skip screen entirely
  //   3. Fire prefetch + warmup (non-blocking)
  //   4. Complete boot in ≤ 1.5 s regardless of server response
  useEffect(() => {
    if (hasCompletedBootOnce) {
      setBootDone(true);
      return;
    }

    if (!fontsLoaded && !fontFallbackReady) return;
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    let mounted = true;
    const messages = [
      "Interface voorbereiden...",
      "Content laden...",
      "Bijna klaar...",
    ];
    let messageIndex = 0;

    // Progress bar animates quickly — boot completes in ~1-1.5s
    const progressTimer = setInterval(() => {
      if (!mounted) return;
      setBootProgress((p) => Math.min(92, p + Math.max(4, Math.round((100 - p) * 0.22))));
      messageIndex = Math.min(messages.length - 1, messageIndex + 1);
      setBootMessage(messages[messageIndex]);
    }, 300);

    (async () => {
      try {
        // Step 1: load disk cache and immediately seed QueryClient
        if (!diskCacheReady) {
          await preloadDiskCache();
          seedQueryClientFromCache();
          diskCacheReady = true;
        }

        // Step 2: check persistent boot flag — if already booted once, skip
        const bootFlag = await AsyncStorage.getItem(BOOT_FLAG_KEY).catch(() => null);
        if (bootFlag) {
          hasCompletedBootOnce = true;
          // Still fire background refresh and warmup
          prefetchHomeData();
          startPlayerImageWarmup(queryClient).catch(() => undefined);
          return; // completes in finally
        }

        // Step 3: fire prefetch and warmup — completely non-blocking
        const candidates = getApiBaseCandidates();
        if (candidates.length > 0) {
          // Wake up server in background (fire and forget, no await)
          fetch(`${candidates[0]}/health`).catch(() => null);
          prefetchHomeData();
          startPlayerImageWarmup(queryClient).catch(() => undefined);
          // Initialize notification channels early so they're ready before any screen uses them
          initializeMatchNotifications().catch(() => undefined);
        }

        // Step 4: wait a minimal time so the boot screen briefly shows
        await new Promise((resolve) => setTimeout(resolve, 800));
      } finally {
        if (!mounted) return;
        clearInterval(progressTimer);
        setBootProgress(100);
        setBootMessage("Klaar");
        hasCompletedBootOnce = true;
        // Persist so next cold start skips the boot screen
        AsyncStorage.setItem(BOOT_FLAG_KEY, "1").catch(() => null);
        setBootDone(true);
      }
    })();

    return () => {
      mounted = false;
      clearInterval(progressTimer);
    };
  }, [fontsLoaded, fontFallbackReady]);

  const handleIntroFinish = React.useCallback(() => {
    hasShownIntroOnce = true;
    setIntroFinished(true);
  }, []);

  // Safety: auto-finish intro after 7s (in case animation stalls)
  useEffect(() => {
    if (introFinished) return;
    if (!fontsLoaded && !fontFallbackReady) return;
    const safety = setTimeout(handleIntroFinish, 7000);
    return () => clearTimeout(safety);
  }, [fontsLoaded, fontFallbackReady, introFinished, handleIntroFinish]);

  // OTA check after boot.
  // Always check OTA first; whether a newer APK exists is handled separately.
  useEffect(() => {
    if (!bootDone) return;
    if (hasCheckedOtaUpdateOnce) return;
    hasCheckedOtaUpdateOnce = true;

    const run = async (): Promise<boolean> => {
      try {
        if (__DEV__) return false;
        if (!Updates.isEnabled) return false;
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return false;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        return true; // won't actually reach here due to reload
      } catch {
        return false;
      }
    };

    otaCheckDone = run();
  }, [bootDone]);

  // Server update check — auto-downloads and installs APK when a newer version is available.
  // Waits for OTA check to finish first: if OTA handled it, skip.
  useEffect(() => {
    if (!bootDone) return;
    if (hasCheckedServerUpdateOnce) return;
    hasCheckedServerUpdateOnce = true;

    const run = async () => {
      try {
        if (__DEV__) return;

        // Wait for OTA check — if it downloaded + reloaded, we never reach here.
        if (otaCheckDone) {
          const otaHandled = await otaCheckDone;
          if (otaHandled) return;
        }

        const res = await apiRequest("GET", "/api/app-version");
        const data = await res.json() as { version: string; apkUrl?: string; directApkUrl?: string };
        const effectiveVer = resolveInstalledVersion();
        if (compareVersions(data.version, effectiveVer) <= 0) return;

        // Prefer direct GitHub URL to avoid redirect hops
        const url = data.directApkUrl || data.apkUrl || "";
        if (!url) return;
        const normalized = url.replace(/^http:\/\//i, "https://");

        // Auto-download and install APK on Android
        if (Platform.OS === "android") {
          try {
            const dir = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "updates/";
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
            const filename = `nexora-update-${Date.now()}.apk`;
            const fileUri = dir + filename;

            const dl = FileSystem.createDownloadResumable(
              normalized,
              fileUri,
              { headers: { Accept: "application/vnd.android.package-archive" } },
            );
            const result = await dl.downloadAsync();
            if (!result?.uri) throw new Error("Download mislukt");

            const contentUri = await FileSystem.getContentUriAsync(result.uri);
            await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
              data: contentUri,
              type: "application/vnd.android.package-archive",
              flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            });
          } catch {
            // Fallback: open download URL in browser
            try { await Linking.openURL(normalized); } catch {}
          }
          return;
        }

        // iOS / other: open in browser
        try { await Linking.openURL(normalized); } catch {}
      } catch {}
    };

    run();
  }, [bootDone]);

  // Notification tap handler — navigate to profile (update modal) when user taps the notification
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.type === "app_update") {
        router.push("/profile");
      }
    });
    return () => sub.remove();
  }, []);

  const fontsReady = fontsLoaded || fontFallbackReady;

  // === RENDER PHASES ===

  // Phase 1: Intro (first launch only, once fonts are ready)
  if (!introFinished && fontsReady) {
    return <NexoraIntro onFinish={handleIntroFinish} />;
  }

  // Phase 2: Boot / loading screen
  if (!bootDone) {
    return <NexoraBootScreen progress={bootProgress} message={bootMessage} />;
  }

  // Phase 3: App
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NexoraProvider>
              <UserStateProvider>
                <RootLayoutNav />
              </UserStateProvider>
            </NexoraProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
