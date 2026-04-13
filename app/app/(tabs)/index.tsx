/**
 * (tabs)/index.tsx
 * Legacy entry — redirects to the Home hub.
 * This tab is hidden (href: null in _layout.tsx) and never shown in the bar.
 */
import { useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";

export default function IndexTabRedirect() {
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    router.replace("/(tabs)/home");
  }, [navState?.key]);

  return null;
}
