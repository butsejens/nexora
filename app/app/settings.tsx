// All settings UI lives in app/(tabs)/more.tsx — this file keeps the /settings
// route alive so old deep-links and navigation calls still resolve.
import { useEffect } from "react";
import { router } from "expo-router";

export default function SettingsRedirect() {
  useEffect(() => {
    router.replace("/(tabs)/more" as any);
  }, []);
  return null;
}
