import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { Video, ResizeMode } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  buildPlaybackPlan,
  sendHeartbeat,
  startSession,
  stopSession,
  type PlaybackSource,
} from "../lib/playback-engine";
import {
  isBlockedUrl,
  isBlockedPath,
  isAllowedNavigation,
  AD_BLOCK_JS,
} from "../lib/ad-blocker";
import { validateSources } from "../lib/stream-validator";
import { streamLog } from "../lib/stream-logger";
import { runPrePlayAdGuard } from "@/src/features/ads/prePlayAdGuard";
import {
  recoverFromAdFailure,
  recoverNavigation,
  useRenderWatch,
  validateBeforePlay,
  logSelfHealing,
} from "@/core/self-healing";

function supportsNativeVideo(url: string): boolean {
  const value = String(url || "").toLowerCase();
  return (
    value.endsWith(".m3u8") ||
    value.endsWith(".m3u") ||
    value.endsWith(".ts") ||
    value.endsWith(".mp4") ||
    value.includes(".m3u8?") ||
    value.includes(".m3u?") ||
    value.includes(".ts?") ||
    value.includes(".mp4?") ||
    value.includes("/live/") ||
    value.includes("playlist") ||
    value.includes("manifest") ||
    value.includes("stream")
  );
}

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(String(url || ""));
}

function makeDeviceId(): string {
  return `nexora-${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const forceServerLabel = String(params.forceServerLabel || "").trim();
  useRenderWatch("player-screen", 50);
  const autoFullscreen =
    String(params.autoFullscreen || "").trim() === "1" ||
    String(params.autoFullscreen || "")
      .trim()
      .toLowerCase() === "true";

  const goBackSafe = () => {
    try {
      if (
        typeof (router as any).canGoBack === "function" &&
        (router as any).canGoBack()
      ) {
        router.back();
        return;
      }
    } catch {
      // Fallback below.
    }
    recoverNavigation("player-go-back-fallback", { from: "/player" });
  };

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(
    "Player wordt gestart...",
  );
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<PlaybackSource[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [nativeFullscreenDone, setNativeFullscreenDone] = useState(false);

  const videoRef = useRef<Video | null>(null);
  const nativeHealthyRef = useRef(false);
  const nativeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adGuardSourceIdRef = useRef<string>("");
  const failedIdsRef = useRef<Set<string>>(new Set());
  const deviceId = useMemo(() => makeDeviceId(), []);

  // Lock landscape orientation on native when player opens; restore on leave
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => undefined);
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    };
  }, []);

  // Swipe right from TOP-RIGHT corner only → go back
  // Checks gs.x0 and gs.y0 to restrict to top-right of screen.
  const swipeBack = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        const { width } = Dimensions.get("window");
        // Only activate when touch started in top-right corner (right 40%, top 140px)
        return (
          gs.x0 > width * 0.6 &&
          gs.y0 < 140 &&
          gs.dx > 15 &&
          Math.abs(gs.dy) < 60
        );
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 60 && Math.abs(gs.dy) < 80) goBackSafe();
      },
    }),
  ).current;

  const title = String(params.title || params.name || "Now Playing");

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedId) || null,
    [sources, selectedId],
  );

  /** Auto-fallback: advance to the next non-failed source */
  const advanceToNextSource = useCallback(
    (reason: string) => {
      setSources((prev) => {
        const currentIdx = prev.findIndex((s) => s.id === selectedId);
        streamLog("warn", "player", `Source failed: ${reason}`, {
          sourceId: selectedId,
          currentIdx,
        });

        const next = new Set(failedIdsRef.current);
        next.add(selectedId);
        failedIdsRef.current = next;
        // Find next unfailed source
        for (let i = currentIdx + 1; i < prev.length; i++) {
          if (!next.has(prev[i].id)) {
            streamLog("info", "player", `Auto-fallback to source ${i}`, {
              sourceId: prev[i].id,
              label: prev[i].label,
            });
            setSelectedId(prev[i].id);
            setError(null);
            return prev;
          }
        }
        setError(
          "Alle servers zijn geprobeerd. Geen werkende bron gevonden.",
        );
        return prev;
      });
    },
    [selectedId],
  );

  useEffect(() => {
    let alive = true;

    const init = async () => {
      const guard = validateBeforePlay({
        id: String(params.tmdbId || params.id || params.contentId || ""),
        type: String(params.type || ""),
        sourceUrl: String(params.streamUrl || params.url || ""),
      });
      if (!guard.ok) {
        setError(guard.message);
        setLoading(false);
        void logSelfHealing("warn", "PLAYER", "player-guard-blocked-play", {
          message: guard.message,
          suggestion: guard.suggestion,
        });
        return;
      }
      setLoading(true);
      setLoadingMessage("Bronnen ophalen...");
      setError(null);
      failedIdsRef.current = new Set();
      streamLog("info", "player", "Building playback plan", {
        params: { tmdbId: params.tmdbId, type: params.type },
      });

      const plan = await buildPlaybackPlan({
        // Backward-compatible: some older routes still pass `url`.
        streamUrl: params.streamUrl || params.url,
        trailerKey: params.trailerKey,
        embedUrl: params.embedUrl,
        tmdbId: params.tmdbId,
        type: params.type,
        season: params.season,
        episode: params.episode,
      });

      if (!alive) return;

      const initialSources = [
        ...(plan.primary ? [plan.primary] : []),
        ...plan.fallbacks,
      ].filter((entry) => isHttp(entry.url));

      streamLog("info", "player", `Got ${initialSources.length} sources`, {
        labels: initialSources.map((s) => s.label),
      });

      if (!initialSources.length) {
        setSources([]);
        setSelectedId("");
        setError("Geen afspeelbron beschikbaar voor deze content.");
        setLoading(false);
        return;
      }

      const directSources = initialSources.filter((s) =>
        supportsNativeVideo(s.url),
      );
      const providerSources = initialSources.filter(
        (s) => !supportsNativeVideo(s.url),
      );

      let validatedSources = initialSources;
      if (Platform.OS !== "web") {
        setLoadingMessage("Servers testen...");
        streamLog(
          "info",
          "player",
          `Validating ${initialSources.length} playback sources`,
        );
        const probeResults = await validateSources(
          initialSources.map((source) => ({
            url: source.url,
            type: supportsNativeVideo(source.url)
              ? ("direct" as const)
              : ("embed" as const),
          })),
        );
        const validUrls = new Set(
          probeResults.filter((r) => r.probe.ok).map((r) => r.url),
        );
        const invalidUrls = probeResults.filter((r) => !r.probe.ok);
        invalidUrls.forEach((r) => {
          streamLog("warn", "player", `Server rejected: ${r.probe.reason}`, {
            url: r.url,
            status: r.probe.statusCode,
          });
        });

        const validDirect = directSources.filter((s) => validUrls.has(s.url));
        const validProviders = providerSources.filter((s) => validUrls.has(s.url));
        validatedSources = [...validDirect, ...validProviders];
      }

      if (!alive) return;

      if (!validatedSources.length) {
        setSources([]);
        setSelectedId("");
        setError("Geen afspeelbron gevonden. Probeer later opnieuw.");
        setLoading(false);
        return;
      }

      setSources(validatedSources);
      const forcedSource = forceServerLabel
        ? validatedSources.find((source) => source.label === forceServerLabel)
        : null;
      const startSource = forcedSource || validatedSources[0];
      setSelectedId(startSource.id);
      streamLog("info", "player", `Playing: ${startSource.label}`, {
        url: startSource.url,
        forced: forceServerLabel,
      });

      if (alive) {
        setLoadingMessage("Player wordt gestart...");
        setLoading(false);
      }
    };

    init();

    return () => {
      alive = false;
      stopSession(deviceId).catch(() => undefined);
    };
  }, [
    deviceId,
    params.embedUrl,
    params.streamUrl,
    params.url,
    params.tmdbId,
    params.id,
    params.contentId,
    params.trailerKey,
    params.type,
    params.season,
    params.episode,
    forceServerLabel,
  ]);

  useEffect(() => {
    if (!selectedSource?.url || loading) return;
    if (adGuardSourceIdRef.current !== selectedSource.id) {
      adGuardSourceIdRef.current = selectedSource.id;
      void runPrePlayAdGuard();
    }
    streamLog("info", "player", "Player init with source", {
      sourceId: selectedSource.id,
      label: selectedSource.label,
      type: selectedSource.type,
      url: selectedSource.url,
      platform: Platform.OS,
    });
    startSession(deviceId, selectedSource.url).catch(() => undefined);
  }, [deviceId, loading, selectedSource]);

  useEffect(() => {
    if (!selectedSource) return;

    const interval = setInterval(() => {
      sendHeartbeat(deviceId).catch(() => undefined);
    }, 30000);

    return () => clearInterval(interval);
  }, [deviceId, selectedSource]);

  const showNativeVideo = Boolean(
    selectedSource && supportsNativeVideo(selectedSource.url),
  );

  useEffect(() => {
    if (nativeWatchdogRef.current) {
      clearTimeout(nativeWatchdogRef.current);
      nativeWatchdogRef.current = null;
    }

    nativeHealthyRef.current = false;

    if (loading || !showNativeVideo || !selectedSource) return;

    // Some dead HLS/MP4 URLs never trigger onError and stay black forever.
    // If playback hasn't become healthy quickly, auto-fallback to next server.
    nativeWatchdogRef.current = setTimeout(() => {
      if (!nativeHealthyRef.current) {
        advanceToNextSource("Native stream timeout");
      }
    }, 9000);

    return () => {
      if (nativeWatchdogRef.current) {
        clearTimeout(nativeWatchdogRef.current);
        nativeWatchdogRef.current = null;
      }
    };
  }, [advanceToNextSource, loading, selectedSource, showNativeVideo]);

  useEffect(() => {
    if (!autoFullscreen) return;
    if (Platform.OS === "web") return;
    if (!showNativeVideo || !selectedSource || loading || nativeFullscreenDone)
      return;

    const open = async () => {
      try {
        await videoRef.current?.presentFullscreenPlayer();
        setNativeFullscreenDone(true);
      } catch {
        // Ignore if platform/player doesn't allow programmatic fullscreen.
      }
    };

    open();
  }, [
    autoFullscreen,
    loading,
    nativeFullscreenDone,
    selectedSource,
    showNativeVideo,
  ]);

  return (
    <View
      style={styles.container}
      {...(Platform.OS !== "web" ? swipeBack.panHandlers : {})}
    >
      {/* Hide status bar on native for true fullscreen */}
      {Platform.OS !== "web" && <StatusBar hidden />}

      {/* Web only: top bar with back button + title */}
      {Platform.OS === "web" && (
        <View style={styles.topBar}>
          <Pressable onPress={goBackSafe} style={styles.backButton}>
            <Text style={styles.backText}>← Terug</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.infoText}>{loadingMessage}</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={goBackSafe} style={styles.backButton}>
            <Text style={styles.backText}>← Terug</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && selectedSource && (
        <View style={styles.playerArea}>
          {showNativeVideo ? (
            <Video
              ref={videoRef}
              style={styles.player}
              source={{ uri: selectedSource.url }}
              useNativeControls
              shouldPlay
              resizeMode={ResizeMode.CONTAIN}
              onLoadStart={() => {
                nativeHealthyRef.current = false;
              }}
              onReadyForDisplay={() => {
                streamLog("info", "player", "Native player ready", {
                  url: selectedSource.url,
                });
                nativeHealthyRef.current = true;
                if (nativeWatchdogRef.current) {
                  clearTimeout(nativeWatchdogRef.current);
                  nativeWatchdogRef.current = null;
                }
              }}
              onPlaybackStatusUpdate={(status) => {
                if (!status || !("isLoaded" in status) || !status.isLoaded)
                  return;
                const healthy =
                  Boolean((status as any).isPlaying) ||
                  Number((status as any).positionMillis || 0) > 0 ||
                  Number((status as any).durationMillis || 0) > 1000;
                if (healthy) {
                  streamLog("info", "player", "Native playback started", {
                    url: selectedSource.url,
                    positionMillis: Number((status as any).positionMillis || 0),
                  });
                  nativeHealthyRef.current = true;
                  if (nativeWatchdogRef.current) {
                    clearTimeout(nativeWatchdogRef.current);
                    nativeWatchdogRef.current = null;
                  }
                }
              }}
              onError={(event) => {
                const message = String(
                  (event as any)?.nativeEvent?.error || "Afspeelfout",
                );
                streamLog("error", "player", `Native video error: ${message}`, {
                  url: selectedSource.url,
                });
                advanceToNextSource(message);
              }}
            />
          ) : (
            <EmbedWebView
              uri={selectedSource.url}
              onError={() => {
                streamLog("error", "player", "WebView load error", {
                  url: selectedSource.url,
                });
                advanceToNextSource("Web player error");
              }}
              onAdDetected={() => {
                streamLog(
                  "warn",
                  "player",
                  "Ad/content-not-found detected in WebView",
                  { url: selectedSource.url },
                );
                recoverFromAdFailure("player-embed", "ad-detected");
                advanceToNextSource("Ad detected");
              }}
            />
          )}
        </View>
      )}

    </View>
  );
}

/* ── Lazy-loaded WebView with full ad-blocking for embed providers ── */
function EmbedWebView({
  uri,
  onError,
  onAdDetected,
}: {
  uri: string;
  onError: () => void;
  onAdDetected?: () => void;
}) {
  const [WebView, setWebView] = useState<any>(null);
  const webRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [webLoading, setWebLoading] = useState(Platform.OS === "web");
  const webTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWebLoading(true);
    if (webTimeoutRef.current) {
      clearTimeout(webTimeoutRef.current);
      webTimeoutRef.current = null;
    }
    if (Platform.OS !== "web") return;

    webTimeoutRef.current = setTimeout(() => {
      streamLog("error", "player", "Web iframe load timeout", { uri });
      onError();
    }, 10000);

    return () => {
      if (webTimeoutRef.current) {
        clearTimeout(webTimeoutRef.current);
        webTimeoutRef.current = null;
      }
    };
  }, [onError, uri]);

  // Native WebView had no equivalent of the web/video watchdogs above, so a
  // server that never finishes loading the embed page just spun forever.
  // Fall back to the next server if load-end never fires within a fair window.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (nativeLoadTimeoutRef.current) {
      clearTimeout(nativeLoadTimeoutRef.current);
      nativeLoadTimeoutRef.current = null;
    }

    nativeLoadTimeoutRef.current = setTimeout(() => {
      streamLog("error", "player", "Native WebView load timeout", { uri });
      onError();
    }, 15000);

    return () => {
      if (nativeLoadTimeoutRef.current) {
        clearTimeout(nativeLoadTimeoutRef.current);
        nativeLoadTimeoutRef.current = null;
      }
    };
  }, [onError, uri]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    import("react-native-webview")
      .then((mod) => {
        setWebView(() => mod.WebView ?? mod.default);
      })
      .catch(() => {
        onError();
      });
  }, [onError]);

  const handleShouldStartLoad = useCallback(
    (event: any) => {
      const navUrl = event.url || "";
      if (navUrl === uri) return true;
      if (
        /casino|gambling|betting|slot|poker|roulette|jackpot|1xbet|bet365|betano|melbet|mostbet|22bet|spin.*wheel|bonus.*game/i.test(
          navUrl,
        )
      ) {
        return false;
      }
      return isAllowedNavigation(navUrl);
    },
    [uri],
  );

  const handleNavigationStateChange = useCallback((navState: any) => {
    const navUrl = (navState.url || "").toLowerCase();
    if (isBlockedUrl(navUrl) || isBlockedPath(navUrl)) {
      webRef.current?.goBack();
    }
  }, []);

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (
          (data.type === "ad-detected" || data.type === "content-not-found") &&
          onAdDetected
        ) {
          onAdDetected();
        }
      } catch {
        // Not JSON — ignore
      }
    },
    [onAdDetected],
  );

  const handleOpenWindow = useCallback((event: any) => {
    const targetUrl = String(event?.nativeEvent?.targetUrl || "").trim();
    if (!targetUrl) return;

    if (isAllowedNavigation(targetUrl)) {
      streamLog("warn", "player", "Blocking popup window and keeping playback in-frame", {
        targetUrl,
      });
      try {
        webRef.current?.injectJavaScript?.(
          `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
        );
      } catch (error) {
        streamLog("error", "player", "Failed to redirect popup in-frame", {
          targetUrl,
          error: String(error),
        });
        // If the WebView cannot be redirected, keep the popup blocked.
      }
    } else {
      streamLog("warn", "player", "Blocked popup window", {
        targetUrl,
      });
    }
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={styles.webFrameWrap}>
        {/* @ts-ignore — web-only iframe element */}
        <iframe
          ref={iframeRef}
          src={uri}
          onLoad={() => {
            if (webTimeoutRef.current) {
              clearTimeout(webTimeoutRef.current);
              webTimeoutRef.current = null;
            }
            setWebLoading(false);
            streamLog("info", "player", "Web iframe ready", { uri });
          }}
          onError={() => {
            if (webTimeoutRef.current) {
              clearTimeout(webTimeoutRef.current);
              webTimeoutRef.current = null;
            }
            setWebLoading(false);
            streamLog("error", "player", "Web iframe error", { uri });
            onError();
          }}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          // @ts-ignore sandbox is a valid web iframe attribute
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            backgroundColor: "#000",
          }}
        />

        {webLoading ? (
          <View style={styles.embedLoadingOverlay}>
            <ActivityIndicator size="small" color="#22c55e" />
            <Text style={styles.infoText}>Player laden...</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.infoText}>Player laden...</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      source={{ uri }}
      style={styles.player}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled
      startInLoadingState
      setSupportMultipleWindows={false}
      onOpenWindow={handleOpenWindow}
      allowsBackForwardNavigationGestures={false}
      androidLayerType="hardware"
      injectedJavaScript={AD_BLOCK_JS}
      injectedJavaScriptBeforeContentLoaded={AD_BLOCK_JS}
      userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      onNavigationStateChange={handleNavigationStateChange}
      onMessage={handleMessage}
      onLoadEnd={() => {
        streamLog("info", "player", "WebView load end", { uri });
        if (nativeLoadTimeoutRef.current) {
          clearTimeout(nativeLoadTimeoutRef.current);
          nativeLoadTimeoutRef.current = null;
        }
      }}
      renderLoading={() => (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#22c55e" />
        </View>
      )}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#04070c",
  },
  topBar: {
    height: 64,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#1a2232",
    gap: 10,
  },
  backButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderColor: "#2f3d56",
    borderRadius: 8,
  },
  backText: {
    color: "#d8e1f2",
    fontSize: 13,
    fontWeight: "600",
  },
  title: {
    color: "#f6f8fb",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  infoText: {
    color: "#9aa7bf",
    fontSize: 13,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    paddingHorizontal: 20,
    textAlign: "center",
  },
  playerArea: {
    flex: 1,
  },
  webFrameWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  embedLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  player: {
    flex: 1,
    backgroundColor: "#000",
  },
});
