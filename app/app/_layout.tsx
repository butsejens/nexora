import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
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
import { useNotificationSync } from "@/hooks/useNotificationSync";
import { queryClient } from "@/lib/query-client";
import { startAuthSync } from "@/store/auth-store";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already prevented, or unsupported on this platform.
});

/**
 * Everything that depends on the resolved palette lives here, one level below
 * the provider that resolves it.
 */
function ThemedShell() {
  const { colors, isDark } = useTheme();

  useNotificationSync();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // Unsupported on web; the CSS background already matches.
    });
  }, [colors.background]);

  return (
    <SafeAreaProvider
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <GestureHandlerRootView
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
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
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

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
    <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemedShell />
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
