import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, getApiBaseCandidates } from "@/lib/query-client";
import { NexoraProvider } from "@/context/NexoraContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NexoraIntro } from "@/components/NexoraIntro";
import { NexoraBootScreen } from "@/components/NexoraBootScreen";
import * as Updates from "expo-updates";
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

  const [showIntro, setShowIntro] = useState(false);
  const [bootDone, setBootDone] = useState(hasCompletedBootOnce);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootMessage, setBootMessage] = useState("Resources laden...");
  const [fontFallbackReady, setFontFallbackReady] = useState(false);
  const bootStartedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontFallbackReady(true), 7000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hasCompletedBootOnce) {
      setBootDone(true);
      SplashScreen.hideAsync().catch(() => {});
      return;
    }

    if (!fontsLoaded && !fontFallbackReady) {
      SplashScreen.hideAsync().catch(() => {});
      setBootMessage("Fonts laden...");
      setBootProgress((p) => (p < 20 ? 20 : p));
      return;
    }

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
      setBootProgress((p) => {
        const next = Math.min(92, p + Math.max(2, Math.round((100 - p) * 0.12)));
        return next;
      });
      messageIndex = Math.min(messages.length - 1, messageIndex + 1);
      setBootMessage(messages[messageIndex]);
    }, 450);

    (async () => {
      try {
        SplashScreen.hideAsync().catch(() => {});

        if (fontsLoaded || fontFallbackReady) {
          setBootMessage("Server status controleren...");
          const candidates = getApiBaseCandidates();
          if (candidates.length > 0) {
            const isCloud = candidates[0].startsWith("https://");
            if (isCloud) setBootMessage("Server aan het opstarten...");
            await Promise.race([
              fetch(`${candidates[0]}/health`).catch(() => null),
              new Promise((resolve) => setTimeout(resolve, isCloud ? 40000 : 2500)),
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
        if (!hasShownIntroOnce) {
          setShowIntro(true);
        }
      }
    })();

    return () => {
      mounted = false;
      clearInterval(progressTimer);
    };
  }, [fontsLoaded, fontFallbackReady]);

  const handleIntroFinish = React.useCallback(() => {
    hasShownIntroOnce = true;
    setShowIntro(false);
  }, []);

  useEffect(() => {
    if (!showIntro) return;
    const safety = setTimeout(() => {
      handleIntroFinish();
    }, 7000);
    return () => clearTimeout(safety);
  }, [showIntro, handleIntroFinish]);

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

  if (!bootDone) {
    return <NexoraBootScreen progress={bootProgress} message={bootMessage} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NexoraProvider>
              <RootLayoutNav />
              {showIntro && (
                <NexoraIntro onFinish={handleIntroFinish} />
              )}
            </NexoraProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
