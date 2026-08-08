import { Redirect } from "expo-router";

/**
 * CineLog opens straight onto content — no dashboard, no setup wizard. Browsing
 * works without an account; signing in is only needed to sync a library.
 */
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}

