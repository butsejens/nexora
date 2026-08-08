import React, { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { COLORS } from "@/constants/theme";
import { queryClient } from "@/lib/query-client";
import { startAuthSync } from "@/store/auth-store";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already prevented, or unsupported on this platform.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(COLORS.background).catch(() => {
      // Unsupported on web; the CSS background already matches.
    });
  }, []);

  useEffect(() => startAuthSync(), []);

  useEffect(() => {
    // Fonts are the only blocking asset; a missing font must not trap the user
    // behind the splash screen, so hide it on error as well. The tree renders
    // regardless — blocking on fonts would make the static web export emit empty
    // pages, and the splash already covers the swap on native.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider style={styles.root}>
          <GestureHandlerRootView style={styles.root}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.background },
                animation: "fade",
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="movie/[id]" />
              <Stack.Screen name="series/[id]" />
              <Stack.Screen name="person/[id]" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="legal" />
              <Stack.Screen
                name="auth"
                options={{ animation: "slide_from_bottom" }}
              />
            </Stack>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = {
  root: { flex: 1, backgroundColor: COLORS.background },
} as const;
