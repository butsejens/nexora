import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, getApiBaseCandidates } from "@/lib/query-client";
import { NexoraProvider } from "@/context/NexoraContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NexoraIntro } from "@/components/NexoraIntro";
import { NexoraBootScreen } from "@/components/NexoraBootScreen";
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
  const [bootDone, setBootDone] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootMessage, setBootMessage] = useState("Resources laden...");
  const [fontFallbackReady, setFontFallbackReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontFallbackReady(true), 7000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontFallbackReady) {
      setBootMessage("Fonts laden...");
      setBootProgress((p) => (p < 20 ? 20 : p));
      return;
    }

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
            await Promise.race([
              fetch(`${candidates[0]}/health`).catch(() => null),
              new Promise((resolve) => setTimeout(resolve, 1800)),
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
        setBootDone(true);
        setShowIntro(true);
      }
    })();

    return () => {
      mounted = false;
      clearInterval(progressTimer);
    };
  }, [fontsLoaded, fontFallbackReady]);

  useEffect(() => {
    if (!showIntro) return;
    const safety = setTimeout(() => {
      setShowIntro(false);
    }, 7000);
    return () => clearTimeout(safety);
  }, [showIntro]);

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
                <NexoraIntro onFinish={() => setShowIntro(false)} />
              )}
            </NexoraProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
