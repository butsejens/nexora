/**
 * In-app YouTube trailer player.
 * Fixes Error 153 via HTML + trusted Referer origin, and blocks browsing
 * away from the single trailer embed.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { WebView } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigation,
} from "react-native-webview/lib/WebViewTypes";

import { COLORS } from "@/constants/colors";
import {
  TRAILER_EMBED_ORIGIN,
  buildYoutubeEmbedUrl,
  buildYoutubeTrailerHtml,
  isAllowedTrailerNavigation,
  isValidYoutubeKey,
} from "@/features/media/services/trailerService";

type Props = {
  videoKeys: string[];
  style?: StyleProp<ViewStyle>;
  onFailedAll?: () => void;
};

export function YouTubeTrailerPlayer({
  videoKeys,
  style,
  onFailedAll,
}: Props) {
  const keys = useMemo(
    () =>
      Array.from(
        new Set(
          videoKeys
            .map((key) => String(key || "").trim())
            .filter((key) => isValidYoutubeKey(key)),
        ),
      ),
    [videoKeys],
  );
  const keysFingerprint = keys.join("|");

  const [index, setIndex] = useState(0);
  const [failedAll, setFailedAll] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setIndex(0);
    setFailedAll(false);
    setReloadToken((value) => value + 1);
  }, [keysFingerprint]);

  const activeKey = keys[index] || "";

  const advanceOrFail = useCallback(() => {
    setIndex((current) => {
      if (current < keys.length - 1) return current + 1;
      setFailedAll(true);
      onFailedAll?.();
      return current;
    });
  }, [keys.length, onFailedAll]);

  const retry = useCallback(() => {
    setFailedAll(false);
    setIndex(0);
    setReloadToken((value) => value + 1);
  }, []);

  const html = useMemo(
    () => (activeKey ? buildYoutubeTrailerHtml(activeKey) : ""),
    [activeKey],
  );

  const embedUrl = useMemo(
    () => (activeKey ? buildYoutubeEmbedUrl(activeKey) : ""),
    [activeKey],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const url = String(request?.url || "");
      if (!url || url === "about:blank" || url.startsWith("data:")) return true;
      return isAllowedTrailerNavigation(url);
    },
    [],
  );

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    const url = String(nav?.url || "");
    if (url && !isAllowedTrailerNavigation(url) && !url.startsWith("data:")) {
      setReloadToken((value) => value + 1);
    }
  }, []);

  const onError = useCallback(
    (_event?: WebViewErrorEvent | WebViewHttpErrorEvent) => {
      advanceOrFail();
    },
    [advanceOrFail],
  );

  if (!keys.length) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>Geen trailer beschikbaar.</Text>
      </View>
    );
  }

  if (failedAll) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          Trailer kon niet in de app worden geladen.
        </Text>
        <Pressable style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryText}>Opnieuw proberen</Text>
        </Pressable>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.player, style]}>
        <iframe
          key={`${activeKey}-${reloadToken}`}
          title="Trailer"
          src={embedUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: "100%", height: "100%", border: 0, background: "#000" }}
          onError={() => advanceOrFail()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.player, style]}>
      <WebView
        key={`${activeKey}-${reloadToken}`}
        source={{ html, baseUrl: TRAILER_EMBED_ORIGIN }}
        style={styles.webview}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsBackForwardNavigationGestures={false}
        androidLayerType="hardware"
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        onError={onError}
        onHttpError={onError}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: "#000",
  },
  fallbackText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  retryText: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
