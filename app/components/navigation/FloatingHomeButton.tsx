import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { useUiStore } from "@/store/uiStore";

const HIDDEN_PATH_PREFIXES = ["/auth", "/onboarding", "/player", "/(tabs)"];

/**
 * Global floating Dynamic-Island-style Home pill.
 * Rendered at root layout level so it appears on Stack screens
 * that don't have the (tabs) bar (sport, films-series, settings, etc.).
 *
 * Hidden during startup (before nav is ready), on the player screen,
 * and inside (tabs) which has its own home pill.
 */
export function FloatingHomeButton() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 12);
  const { isAuthenticated } = useNexora();
  const introPlaying = useUiStore((s) => s.introPlaying);
  const pathname = usePathname();
  const isHiddenPath =
    !pathname ||
    pathname === "/" ||
    HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isHiddenPath || !isAuthenticated || introPlaying) {
    return null;
  }

  const onPress = () => {
    router.navigate("/(tabs)/home");
  };

  return (
    <View
      style={[styles.islandContainer, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Home"
        onPress={onPress}
        style={({ pressed }) => [
          styles.island,
          pressed && styles.islandPressed,
        ]}
      >
        <Ionicons name="home" size={18} color={COLORS.accent} />
        <Text style={styles.islandLabel}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  islandContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  island: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(18, 18, 22, 0.92)",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 24,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        } as any)
      : {}),
  },
  islandPressed: {
    transform: [{ scale: 0.93 }],
    opacity: 0.85,
  },
  islandLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
});
