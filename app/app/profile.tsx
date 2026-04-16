import { useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";

export default function ProfileLegacyRedirect() {
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    router.replace("/(tabs)/more");
  }, [navState?.key]);

  return null;
}
