/**
 * CineLog — trailer player.
 *
 * Plays the YouTube trailer inside CineLog instead of bouncing the viewer out to
 * the YouTube app. On web we embed an iframe; on native we use a WebView with a
 * minimal HTML shell, which sets a proper referrer and avoids YouTube's
 * "video unavailable" embed error.
 */

import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ErrorState } from "@/components/ui/States";
import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import type { Trailer } from "@/lib/cinelog/types";
import { Pressable } from "@/components/ui/Pressable";

const YOUTUBE_ORIGIN = "https://www.youtube.com";

function embedUrl(videoKey: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    fs: "1",
  });
  return `${YOUTUBE_ORIGIN}/embed/${videoKey}?${params}`;
}

/** Minimal page so the embed loads with a youtube.com referrer on native. */
function embedHtml(videoKey: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
      iframe { border: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <iframe
      src="${embedUrl(videoKey)}"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
    ></iframe>
  </body>
</html>`;
}

export interface TrailerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  trailer: Trailer | null;
  isLoading?: boolean;
}

export function TrailerModal({
  visible,
  onClose,
  title,
  trailer,
  isLoading = false,
}: TrailerModalProps) {
  const { width, isMobile } = useResponsive();
  const playerWidth = isMobile
    ? width - SPACING.lg * 2
    : Math.min(width * 0.8, 1080);
  const playerHeight = Math.round((playerWidth * 9) / 16);

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close trailer"
        />
        <View style={[styles.sheet, { width: playerWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Trailer</Text>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close trailer"
              hitSlop={8}
              style={({ hovered }) => [
                styles.close,
                hovered ? styles.closeHovered : null,
              ]}
            >
              <Ionicons name="close" size={18} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <View style={[styles.player, { height: playerHeight }]}>
            {isLoading ? (
              <ActivityIndicator color={COLORS.accent} />
            ) : trailer ? (
              <TrailerPlayer videoKey={trailer.key} title={title} />
            ) : (
              <ErrorState
                compact
                title="No trailer yet"
                message="This title doesn't have a trailer published on CineLog's source."
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface TrailerPlayerProps {
  videoKey: string;
  title: string;
}

function TrailerPlayer({ videoKey, title }: TrailerPlayerProps) {
  const html = useMemo(() => embedHtml(videoKey), [videoKey]);

  if (Platform.OS === "web") {
    return React.createElement("iframe", {
      src: embedUrl(videoKey),
      title: `${title} trailer`,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
      allowFullScreen: true,
      style: { border: 0, width: "100%", height: "100%" },
    });
  }

  // Loaded lazily so the WebView bundle never reaches the web build, where the
  // iframe path above is used instead.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebView } = require("react-native-webview");
  return (
    <WebView
      source={{ html, baseUrl: YOUTUBE_ORIGIN }}
      style={styles.webview}
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      // Only the embed itself may load; anything else stays out of the player.
      onShouldStartLoadWithRequest={(request: { url: string }) =>
        request.url.startsWith(YOUTUBE_ORIGIN) ||
        request.url.startsWith("about:") ||
        request.url.startsWith("data:")
      }
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.overlayStrong,
    padding: SPACING.lg,
  },
  sheet: {
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: COLORS.accent,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.glass,
  },
  closeHovered: {
    backgroundColor: COLORS.glassStrong,
  },
  player: {
    width: "100%",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
});
