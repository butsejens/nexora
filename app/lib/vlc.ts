import { Alert, Linking, Platform } from "react-native";

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

export async function openInVlc(streamUrl: string, title = "Nexora stream") {
  const raw = String(streamUrl || "").trim();
  if (!isHttpUrl(raw)) {
    Alert.alert("VLC", "Deze stream-link is ongeldig.");
    return false;
  }

  const encoded = encodeURIComponent(raw);
  const candidates = Platform.select<string[]>({
    ios: [
      `vlc-x-callback://x-callback-url/stream?url=${encoded}`,
      `vlc://${raw}`,
    ],
    android: [
      `intent:${raw}#Intent;package=org.videolan.vlc;scheme=http;end`,
      `vlc://${raw}`,
    ],
    default: [],
  }) || [];

  for (const candidate of candidates) {
    try {
      const can = await Linking.canOpenURL(candidate);
      if (!can) continue;
      await Linking.openURL(candidate);
      return true;
    } catch {
      // try next candidate
    }
  }

  try {
    await Linking.openURL(raw);
    // Stream opened in system default player — no alert needed
  } catch {
    Alert.alert("Kan stream niet openen", "Installeer VLC Media Player om deze IPTV stream te openen.");
  }

  return false;
}
