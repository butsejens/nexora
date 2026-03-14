import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, getApiBaseCandidates, apiRequest } from "@/lib/query-client";
import { NexoraProvider } from "@/context/NexoraContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NexoraIntro } from "@/components/NexoraIntro";
import { NexoraBootScreen } from "@/components/NexoraBootScreen";
import * as Updates from "expo-updates";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import Constants from "expo-constants";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { COLORS } from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

let hasCompletedBootOnce = false;
let hasShownIntroOnce = false;
let hasCheckedOtaUpdateOnce = false;
let hasCheckedServerUpdateOnce = false;

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

  // 7s font fallback
  useEffect(() => {
    const timer = setTimeout(() => setFontFallbackReady(true), 7000);
    return () => clearTimeout(timer);
  }, []);

  // Hide native splash as soon as fonts (or fallback) are ready
  useEffect(() => {
    if (fontsLoaded || fontFallbackReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontFallbackReady]);

  // Boot sequence — start immediately when fonts are ready (parallel with intro)
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
      "Fonts en resources laden...",
      "Cloud API verbinding controleren...",
      "Kanaallijsten synchroniseren...",
      "Interface voorbereiden...",
    ];
    let messageIndex = 0;

    const progressTimer = setInterval(() => {
      if (!mounted) return;
      setBootProgress((p) => Math.min(92, p + Math.max(2, Math.round((100 - p) * 0.12))));
      messageIndex = Math.min(messages.length - 1, messageIndex + 1);
      setBootMessage(messages[messageIndex]);
    }, 450);

    (async () => {
      try {
        if (fontsLoaded || fontFallbackReady) {
          setBootMessage("Server status controleren...");
          const candidates = getApiBaseCandidates();
          if (candidates.length > 0) {
            const isCloud = candidates[0].startsWith("https://");
            if (isCloud) setBootMessage("Server aan het opstarten...");
            await Promise.race([
              fetch(`${candidates[0]}/health`).catch(() => null),
              new Promise((resolve) => setTimeout(resolve, isCloud ? 5000 : 2500)),
            ]);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        if (!mounted) return;
        clearInterval(progressTimer);
        setBootProgress(100);
        setBootMessage("Klaar");
        hasCompletedBootOnce = true;
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

  // OTA check after boot (EAS Update path)
  useEffect(() => {
    if (!bootDone) return;
    if (hasCheckedOtaUpdateOnce) return;
    hasCheckedOtaUpdateOnce = true;

    const run = async () => {
      try {
        if (__DEV__) return;
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // Keep app usable even when OTA checks fail.
      }
    };

    run();
  }, [bootDone]);

  // Server update check — shows an in-app popup when a newer APK is available
  useEffect(() => {
    if (!bootDone) return;
    if (hasCheckedServerUpdateOnce) return;
    hasCheckedServerUpdateOnce = true;

    const run = async () => {
      try {
        if (__DEV__) return;
        const res = await apiRequest("GET", "/api/app-version");
        const data = await res.json() as { version: string; apkUrl?: string; directApkUrl?: string };
        const appVer = resolveInstalledVersion();
        if (compareVersions(data.version, appVer) <= 0) return;

        // Small delay so the main UI is fully rendered before alert appears
        await new Promise(r => setTimeout(r, 1200));

        const doInstall = async () => {
          const url = data.directApkUrl || data.apkUrl;
          if (!url) { router.push("/profile"); return; }
          const normalizedUrl = String(url).replace(/^http:\/\//i, "https://");

          // Android: download APK to cache and trigger package installer
          if (Platform.OS === "android") {
            try {
              const dir = (FileSystem.cacheDirectory || "") + "updates/";
              await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
              const fileUri = dir + `nexora-${data.version}.apk`;
              const dl = FileSystem.createDownloadResumable(
                normalizedUrl, fileUri,
                { headers: { Accept: "application/vnd.android.package-archive" } }
              );
              const result = await dl.downloadAsync();
              if (!result?.uri) throw new Error("dl-failed");
              const contentUri = await FileSystem.getContentUriAsync(result.uri);
              await Linking.openURL(contentUri);
              return;
            } catch {
              // Fallback: open in browser
            }
          }

          try {
            await Linking.openURL(normalizedUrl);
          } catch {
            router.push("/profile");
          }
        };

        Alert.alert(
          "Update beschikbaar",
          `Nexora ${data.version} is klaar.\nUpdate nu voor de nieuwste functies en bugfixes.`,
          [
            { text: "Straks", style: "cancel" },
            { text: "Update nu", onPress: doInstall },
          ],
          { cancelable: true }
        );
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
              <RootLayoutNav />
            </NexoraProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
