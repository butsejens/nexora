import React, { useEffect } from "react";
import { router } from "expo-router";
import { VodModuleHub } from "@/components/vod/VodModuleHub";
import { useOnboardingStore } from "@/store/onboarding-store";

export default function MoviesScreen() {
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);

  useEffect(() => {
    if (!moviesEnabled) {
      router.replace("/");
    }
  }, [moviesEnabled]);

  if (!moviesEnabled) return null;
  return <VodModuleHub initialPane="home" initialFilter="movie" />;
}