/**
 * (tabs)/index.tsx
 * Legacy entry — redirects to the Home hub.
 * This tab is hidden (href: null in _layout.tsx) and never shown in the bar.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function IndexTabRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/home");
  }, [router]);
  return null;
}
