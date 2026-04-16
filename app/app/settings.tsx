// All settings UI lives in app/(tabs)/more.tsx — this file keeps the /settings
// route alive so old deep-links and navigation calls still resolve.
import { Redirect } from "expo-router";

export default function SettingsRedirect() {
  return <Redirect href="/(tabs)/more" />;
}
