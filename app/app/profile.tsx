import { useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";

export default function ProfileLegacyRedirect() {
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    router.replace("/settings");
  }, [navState?.key]);

  return null;
}
