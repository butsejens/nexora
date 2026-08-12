/**
 * CineLog — trailer player.
 *
 * Plays the YouTube trailer inside CineLog instead of bouncing the viewer out to
 * the YouTube app. On web we embed an iframe; on native we use a WebView with a
 * minimal HTML shell, which sets a proper referrer and avoids YouTube's
 * "video unavailable" embed error.
 */

import React from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useT } from "@/i18n";
import { ErrorState } from "@/components/ui/States";
import { ARTWORK, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import type { Trailer } from "@/lib/cinelog/types";
import { Pressable } from "@/components/ui/Pressable";
import YoutubePlayer from "react-native-youtube-iframe";
import { WebView } from "react-native-webview";

function embedUrl(videoKey: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    fs: "1",
  });
  return `https://www.youtube.com/embed/${videoKey}?${params}`;
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
  const t = useT();
  const { colors } = useTheme();
  const styles = useStyles();
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
          accessibilityLabel={t("Close trailer")}
        />
        <View style={[styles.sheet, { width: playerWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t("Trailer")}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("Close trailer")}
              hitSlop={8}
              style={({ hovered }) => [
                styles.close,
                hovered ? styles.closeHovered : null,
              ]}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={[styles.player, { height: playerHeight }]}>
            {isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : trailer ? (
              <TrailerPlayer
                videoKey={trailer.key}
                title={title}
                onExternalOpen={onClose}
                playerHeight={playerHeight}
              />
            ) : (
              <ErrorState
                compact
                title={t("No trailer yet")}
                message={t(
                  "This title doesn't have a trailer published on CineLog's source.",
                )}
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
  onExternalOpen: () => void;
  playerHeight: number;
}

function TrailerPlayer({
  videoKey,
  title,
  onExternalOpen,
  playerHeight,
}: TrailerPlayerProps) {
  const styles = useStyles();
  const t = useT();
  const [mode, setMode] = React.useState<"youtube" | "webview" | "failed">("youtube");
  const [nativeReady, setNativeReady] = React.useState(false);
  const [webviewLoaded, setWebviewLoaded] = React.useState(false);

  React.useEffect(() => {
    setMode("youtube");
    setNativeReady(false);
    setWebviewLoaded(false);
  }, [videoKey]);

  React.useEffect(() => {
    if (mode !== "youtube" || nativeReady) return;
    const timer = setTimeout(() => {
      setMode("webview");
    }, 4500);
    return () => clearTimeout(timer);
  }, [mode, nativeReady]);

  // Some networks block YouTube silently (no error/timeout event from the
  // WebView itself), so the loading spinner would otherwise spin forever.
  React.useEffect(() => {
    if (mode !== "webview" || webviewLoaded) return;
    const timer = setTimeout(() => {
      setMode("failed");
    }, 12000);
    return () => clearTimeout(timer);
  }, [mode, webviewLoaded]);

  const openExternal = React.useCallback(() => {
    void Linking.openURL(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoKey)}`,
    )
      .then(onExternalOpen)
      .catch(() => undefined);
  }, [onExternalOpen, videoKey]);

  if (Platform.OS === "web") {
    return React.createElement("iframe", {
      src: embedUrl(videoKey),
      title: `${title} trailer`,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
      allowFullScreen: true,
      style: { border: 0, width: "100%", height: "100%" },
    });
  }

  if (mode === "youtube") {
    return (
      <View style={styles.youtubeWrap}>
        <YoutubePlayer
          height={playerHeight}
          width="100%"
          play
          videoId={videoKey}
          forceAndroidAutoplay
          onReady={() => setNativeReady(true)}
          onError={() => setMode("webview")}
          initialPlayerParams={{
            controls: true,
            modestbranding: true,
            rel: false,
            iv_load_policy: 3,
            cc_load_policy: 0,
          }}
        />
      </View>
    );
  }

  if (mode === "webview") {
    return (
      <WebView
        source={{ uri: embedUrl(videoKey) }}
        style={styles.webview}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        originWhitelist={["*"]}
        injectedJavaScript={`(function(){
          try {
            var unmute = function(){
              var media = document.querySelector('video');
              if (!media) return;
              media.muted = false;
              media.volume = 1;
              media.play && media.play().catch(function(){});
            };
            document.addEventListener('click', unmute, true);
            document.addEventListener('touchstart', unmute, true);
            setTimeout(unmute, 800);
          } catch (e) {}
        })(); true;`}
        onError={() => setMode("failed")}
        onHttpError={() => setMode("failed")}
        onLoadEnd={() => setWebviewLoaded(true)}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          const target = String(request.url || "").toLowerCase();
          if (target.startsWith("about:") || target.startsWith("data:") || target.startsWith("blob:")) return true;
          if (!target.startsWith("http")) return false;
          try {
            const host = new URL(target).hostname.toLowerCase();
            return (
              host === "youtube.com" ||
              host.endsWith(".youtube.com") ||
              host === "youtube-nocookie.com" ||
              host.endsWith(".youtube-nocookie.com") ||
              host === "youtu.be" ||
              host.endsWith(".googlevideo.com") ||
              host.endsWith(".ytimg.com")
            );
          } catch {
            return false;
          }
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={styles.loadingSpinner.color} />
          </View>
        )}
      />
    );
  }

  if (mode === "failed") {
    return (
      <View style={styles.fallbackWrap}>
        <Text style={styles.fallbackTitle}>{t("Trailer unavailable in app")}</Text>
        <Text style={styles.fallbackBody}>
          {t("Open the trailer externally if the embedded player is blocked.")}
        </Text>
        <Pressable style={styles.fallbackButton} onPress={openExternal}>
          <Ionicons name="open-outline" size={16} color={styles.fallbackButtonText.color} />
          <Text style={styles.fallbackButtonText}>{t("Open on YouTube")}</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const useStyles = makeStyles((c, t) => ({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ARTWORK.scrimStrong,
    padding: SPACING.lg,
  },
  sheet: {
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
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
    color: c.accent,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: c.textPrimary,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.glass,
  },
  closeHovered: {
    backgroundColor: c.glassStrong,
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
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  loadingSpinner: {
    color: c.accent,
  },
  youtubeWrap: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000",
  },
  fallbackWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  fallbackTitle: {
    color: c.textPrimary,
    fontFamily: FONTS.semibold,
    fontSize: 16,
    textAlign: "center",
  },
  fallbackBody: {
    color: c.textSecondary,
    textAlign: "center",
  },
  fallbackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: c.accent,
  },
  fallbackButtonText: {
    color: c.textInverse,
    fontFamily: FONTS.semibold,
  },
}));
