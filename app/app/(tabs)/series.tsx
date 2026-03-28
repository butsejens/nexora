import React from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { VodModuleHub } from "@/components/vod/VodModuleHub";
import { useOnboardingStore } from "@/store/onboarding-store";

export default function SeriesScreen() {
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      if (!moviesEnabled) {
        router.replace("/");
      }
    }, [moviesEnabled, router])
  );

  if (!moviesEnabled) return null;
  return <VodModuleHub initialPane="search" initialFilter="series" />;
}