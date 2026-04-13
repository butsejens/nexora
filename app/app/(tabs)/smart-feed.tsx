// Smart Feed screen removed — sport content has been replaced with streaming.
// This stub prevents the hidden tab route from causing a compile error.
import { useEffect } from "react";
import { router } from "expo-router";

export default function SmartFeedScreen() {
  useEffect(() => {
    router.replace("/(tabs)/home");
  }, []);
  return null;
}
