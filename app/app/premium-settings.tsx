import { useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";

/** Redirects legacy /premium-settings route to /premium */
export default function PremiumSettingsRedirect() {
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    router.replace("/premium");
  }, [navState?.key]);

  return null;
}
