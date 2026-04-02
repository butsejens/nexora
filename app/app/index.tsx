import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { useNexora } from "@/context/NexoraContext";
import { COLORS } from "@/constants/colors";

export default function StartupEntryScreen() {
  const router = useRouter();
  const { authReady, isAuthenticated } = useNexora();

  useFocusEffect(
    React.useCallback(() => {
      if (!authReady) return;
      router.replace(isAuthenticated ? "/(tabs)/home" : "/auth");
    }, [authReady, isAuthenticated, router]),
  );

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={COLORS.accent} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#040404",
    alignItems: "center",
    justifyContent: "center",
  },
});