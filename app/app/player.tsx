import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";

import {
  buildPlaybackPlan,
  sendHeartbeat,
  startSession,
  stopSession,
  type PlaybackSource,
} from "../lib/playback-engine";

function supportsNativeVideo(url: string): boolean {
  const value = String(url || "").toLowerCase();
  return value.endsWith(".m3u8") || value.endsWith(".mp4") || value.includes(".m3u8?") || value.includes(".mp4?");
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<PlaybackSource[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const videoRef = useRef<Video | null>(null);
  const deviceId = useMemo(() => makeDeviceId(), []);

  const title = String(params.title || params.name || "Now Playing");

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedId) || null,
    [sources, selectedId],
  );

  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoading(true);
      setError(null);

      const plan = await buildPlaybackPlan({
        streamUrl: params.streamUrl,
        trailerKey: params.trailerKey,
        embedUrl: params.embedUrl,
        tmdbId: params.tmdbId,
        type: params.type,
      });

      if (!alive) return;

      const initialSources = [
        ...(plan.primary ? [plan.primary] : []),
        ...plan.fallbacks,
      ].filter((entry) => isHttp(entry.url));

      if (!initialSources.length) {
        setSources([]);
        setSelectedId("");
        setError("Geen afspeelbron beschikbaar voor deze content.");
        setLoading(false);
        return;
      }

      setSources(initialSources);
      setSelectedId(initialSources[0].id);

      await startSession(deviceId, initialSources[0].url);
      if (alive) setLoading(false);
    };

    init();

    return () => {
      alive = false;
      stopSession(deviceId).catch(() => undefined);
    };
  }, [deviceId, params.embedUrl, params.streamUrl, params.tmdbId, params.trailerKey, params.type]);

  useEffect(() => {
    if (!selectedSource) return;

    const interval = setInterval(() => {
      sendHeartbeat(deviceId).catch(() => undefined);
    }, 30000);

    return () => clearInterval(interval);
  }, [deviceId, selectedSource]);

  const showNativeVideo = Boolean(selectedSource && supportsNativeVideo(selectedSource.url));

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.infoText}>Player wordt gestart...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
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
              onError={(event) => {
                const message = String((event as any)?.nativeEvent?.error || "Afspeelfout");
                setError(message);
              }}
            />
          ) : (
            <WebView
              source={{ uri: selectedSource.url }}
              style={styles.player}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={styles.centered}>
                  <ActivityIndicator size="small" color="#22c55e" />
                </View>
              )}
              onError={() => setError("Web player kon niet geladen worden.")}
            />
          )}
        </View>
      )}

      {!loading && sources.length > 1 && (
        <View style={styles.sourceList}>
          {sources.map((source) => {
            const active = source.id === selectedId;
            return (
              <Pressable
                key={source.id}
                style={[styles.sourceButton, active && styles.sourceButtonActive]}
                onPress={() => {
                  setError(null);
                  setSelectedId(source.id);
                }}
              >
                <Text style={[styles.sourceLabel, active && styles.sourceLabelActive]} numberOfLines={1}>
                  {source.label}
                  {source.quality ? ` • ${source.quality}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
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
  player: {
    flex: 1,
    backgroundColor: "#000",
  },
  sourceList: {
    borderTopColor: "#1a2232",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#080f1a",
  },
  sourceButton: {
    borderColor: "#22314a",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#0f1624",
  },
  sourceButtonActive: {
    borderColor: "#22c55e",
    backgroundColor: "#102218",
  },
  sourceLabel: {
    color: "#c3cee2",
    fontSize: 12,
    maxWidth: 220,
  },
  sourceLabelActive: {
    color: "#8df7af",
    fontWeight: "700",
  },
});
