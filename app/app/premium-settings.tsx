import { useEffect } from "react";
import { router } from "expo-router";

/** Redirects legacy /premium-settings route to /premium */
export default function PremiumSettingsRedirect() {
  useEffect(() => {
    router.replace("/premium");
  }, []);
  return null;
}
