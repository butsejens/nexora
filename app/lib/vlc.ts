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
    Alert.alert("VLC niet gevonden", `${title} is geopend met de standaard videospeler. Installeer VLC voor betere IPTV afspeelstabiliteit.`);
  } catch {
    Alert.alert("VLC niet gevonden", "Installeer VLC Media Player om deze stream direct te openen.");
  }

  return false;
}
