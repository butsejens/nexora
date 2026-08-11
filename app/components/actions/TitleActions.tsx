/**
 * CineLog — title action buttons.
 *
 * Watchlist, favourite, trailer and watch-state controls. Each one keeps its own
 * store subscription so pressing it re-renders the button rather than the page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useKeepAwake } from "expo-keep-awake";

import { useT } from "@/i18n";
import { Button, IconButton } from "@/components/ui/Button";
import { GenrePill } from "@/components/ui/GenrePill";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { apiData } from "@/lib/http";
import { SafeHaptics } from "@/lib/safeHaptics";
import type { LibraryEntryRef, MediaType, WatchState } from "@/lib/cinelog/types";
import { useLibrary } from "@/store/library-store";

export interface WatchlistButtonProps {
  item: LibraryEntryRef;
  variant?: "button" | "icon";
  size?: "sm" | "md" | "lg";
}

export function WatchlistButton({
  item,
  variant = "button",
  size = "md",
}: WatchlistButtonProps) {
  const t = useT();
  const saved = useLibrary((state) => state.isInWatchlist(item.id));
  const toggle = useLibrary((state) => state.toggleWatchlist);

  const onPress = useCallback(() => {
    toggle(item);
    void SafeHaptics.selection();
  }, [item, toggle]);

  const label = t(saved ? "In Watchlist" : "Add to Watchlist");

  if (variant === "icon") {
    return (
      <IconButton
        icon={saved ? "checkmark" : "add"}
        label={
          saved
            ? `Remove ${item.title} from your watchlist`
            : `Save ${item.title} to your watchlist`
        }
        onPress={onPress}
        active={saved}
      />
    );
  }

  return (
    <Button
      label={label}
      icon={saved ? "checkmark" : "add"}
      onPress={onPress}
      variant="secondary"
      size={size}
      accessibilityHint={t(
        saved
          ? "Removes this title from your watchlist"
          : "Saves this title for later",
      )}
    />
  );
}

export interface FavoriteButtonProps {
  item: LibraryEntryRef;
}

export function FavoriteButton({ item }: FavoriteButtonProps) {
  const favorited = useLibrary((state) => state.isFavorite(item.id));
  const toggle = useLibrary((state) => state.toggleFavorite);

  const onPress = useCallback(() => {
    toggle(item);
    void SafeHaptics.impactLight();
  }, [item, toggle]);

  return (
    <IconButton
      icon={favorited ? "heart" : "heart-outline"}
      label={
        favorited
          ? `Remove ${item.title} from your favourites`
          : `Mark ${item.title} as a favourite`
      }
      onPress={onPress}
      active={favorited}
    />
  );
}

export interface TrailerButtonProps {
  onPress: () => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

export function TrailerButton({
  onPress,
  size = "md",
  disabled,
}: TrailerButtonProps) {
  const t = useT();
  return (
    <Button
      label={t("Watch Trailer")}
      icon="play"
      onPress={onPress}
      size={size}
      disabled={disabled}
      accessibilityHint={t("Plays the trailer inside CineLog")}
    />
  );
}

interface StreamProvider {
  id: string;
  label: string;
  movieUrl: (tmdbId: number) => string;
  tvUrl: (tmdbId: number, season: number, episode: number) => string;
}

interface ProviderTemplate {
  id: string;
  label: string;
  movieUrl: string;
  tvUrl: string;
}

function applyTemplate(
  template: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): string {
  return String(template || "")
    .replaceAll("{tmdbId}", String(tmdbId))
    .replaceAll("{id}", String(tmdbId))
    .replaceAll("{s}", String(seasonNumber))
    .replaceAll("{e}", String(episodeNumber));
}

const STREAM_PROVIDERS: StreamProvider[] = [
  { id: "vidlinkpro", label: "Server 1", movieUrl: (id) => `https://vidlink.pro/movie/${id}`, tvUrl: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
  { id: "vidfast", label: "Server 2", movieUrl: (id) => `https://vidfast.pro/movie/${id}`, tvUrl: (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}` },
  { id: "videasy", label: "Server 3", movieUrl: (id) => `https://player.videasy.net/movie/${id}`, tvUrl: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}` },
  { id: "vidsrcnl", label: "Server 4", movieUrl: (id) => `https://player.vidsrc.nl/embed/movie/${id}`, tvUrl: (id, s, e) => `https://player.vidsrc.nl/embed/tv/${id}/${s}/${e}` },
  { id: "warezcdn", label: "Server 5", movieUrl: (id) => `https://warezcdn.com/embed/movie/${id}`, tvUrl: (id, s, e) => `https://warezcdn.com/embed/tv/${id}/${s}/${e}` },
  { id: "flicky", label: "Server 6", movieUrl: (id) => `https://flicky.host/embed/movie/?id=${id}`, tvUrl: (id, s, e) => `https://flicky.host/embed/tv/?id=${id}&s=${s}&e=${e}` },
  { id: "moviesapi", label: "Server 7", movieUrl: (id) => `https://moviesapi.club/movie/${id}`, tvUrl: (id, s, e) => `https://moviesapi.club/tv/${id}-${s}-${e}` },
  { id: "flickystream", label: "Server 8", movieUrl: (id) => `https://flickystream.ru/movie/${id}`, tvUrl: (id, s, e) => `https://flickystream.ru/tv/${id}/${s}/${e}` },
  { id: "autoembed", label: "Server 9", movieUrl: (id) => `https://autoembed.cc/movie/tmdb-${id}`, tvUrl: (id, s, e) => `https://autoembed.cc/tv/tmdb-${id}/${s}/${e}` },
  { id: "embedsu", label: "Server 10", movieUrl: (id) => `https://embed.su/embed/movie/${id}`, tvUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
  { id: "111movies", label: "Server 11", movieUrl: (id) => `https://111movies.net/movie/${id}`, tvUrl: (id, s, e) => `https://111movies.net/tv/${id}/${s}/${e}` },
  { id: "vidsrcstream", label: "Server 12", movieUrl: (id) => `https://vidsrc.stream/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vidsrc.stream/embed/tv/${id}/${s}/${e}` },
  { id: "2embedorg", label: "Server 13", movieUrl: (id) => `https://www.2embed.org/embed/movie?id=${id}`, tvUrl: (id, s, e) => `https://www.2embed.org/embed/tv?id=${id}&s=${s}&e=${e}` },
];

export interface PlayButtonProps {
  tmdbId: number;
  type: MediaType;
  title: string;
  libraryRef?: LibraryEntryRef;
  seasonNumber?: number;
  episodeNumber?: number;
  startAtSeconds?: number;
  size?: "sm" | "md" | "lg";
  autoPlayRequest?: number;
}

export function PlayButton({
  tmdbId,
  type,
  title,
  libraryRef,
  seasonNumber = 1,
  episodeNumber = 1,
  startAtSeconds = 0,
  size = "md",
  autoPlayRequest,
}: PlayButtonProps) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [providerIndex, setProviderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [providerTemplates, setProviderTemplates] = useState<ProviderTemplate[]>([]);
  const lastAutoRequestRef = useRef<number | undefined>(undefined);
  const progressTickRef = useRef(0);
  const saveProgress = useLibrary((state) => state.saveProgress);

  const ref = useMemo<LibraryEntryRef>(
    () =>
      libraryRef ?? {
        id: `${type}:${tmdbId}`,
        tmdbId,
        type,
        title,
        poster: null,
        backdrop: null,
        year: 0,
        rating: 0,
        genres: [],
        genreIds: [],
        releaseDate: null,
      },
    [libraryRef, tmdbId, title, type],
  );

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      try {
        const next = await apiData<ProviderTemplate[]>("/api/streams/providers");
        if (!cancelled && Array.isArray(next) && next.length > 0) {
          setProviderTemplates(next);
        }
      } catch {
        // Keep static fallback providers when backend is unreachable.
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const providers = useMemo(() => {
    if (providerTemplates.length > 0) {
      return providerTemplates.map((provider) => ({
        id: provider.id,
        label: provider.label,
        url:
          type === "movie"
            ? applyTemplate(provider.movieUrl, tmdbId, seasonNumber, episodeNumber)
            : applyTemplate(provider.tvUrl, tmdbId, seasonNumber, episodeNumber),
      }));
    }

    return STREAM_PROVIDERS.map((provider) => ({
      ...provider,
      url:
        type === "movie"
          ? provider.movieUrl(tmdbId)
          : provider.tvUrl(tmdbId, seasonNumber, episodeNumber),
    }));
  }, [episodeNumber, providerTemplates, seasonNumber, tmdbId, type]);

  const showUnavailableDialog = useCallback(() => {
    Alert.alert(
      "Unable to play this title",
      "The video source is currently unavailable. Please try again later.",
      [
        { text: "Back", style: "cancel", onPress: () => setVisible(false) },
        {
          text: "Try Again",
          onPress: () => {
            const first = providers[0];
            if (!first) {
              setVisible(false);
              return;
            }
            setProviderIndex(0);
            setActiveUrl(first.url);
            setIsLoading(true);
            setVisible(true);
          },
        },
      ],
    );
  }, [providers]);

  const openProvider = useCallback(
    (nextIndex: number) => {
      const nextProvider = providers[nextIndex];
      if (!nextProvider) {
        setVisible(false);
        setIsLoading(false);
        showUnavailableDialog();
        return;
      }

      setProviderIndex(nextIndex);
      setActiveUrl(nextProvider.url);
      setIsLoading(true);
      setVisible(true);
    },
    [providers, showUnavailableDialog],
  );

  const handlePress = useCallback(() => {
    void SafeHaptics.selection();
    openProvider(0);
  }, [openProvider]);

  const handleStreamFail = useCallback(() => {
    const nextIndex = providerIndex + 1;
    if (nextIndex < providers.length) {
      openProvider(nextIndex);
      return;
    }

    setVisible(false);
    setIsLoading(false);
    showUnavailableDialog();
  }, [openProvider, providerIndex, providers, showUnavailableDialog]);

  useEffect(() => {
    if (autoPlayRequest == null) return;
    if (lastAutoRequestRef.current === autoPlayRequest) return;
    lastAutoRequestRef.current = autoPlayRequest;
    openProvider(0);
  }, [autoPlayRequest, openProvider]);

  const handlePlaybackSync = useCallback(
    (positionSeconds: number, durationSeconds: number) => {
      if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds)) return;
      if (durationSeconds <= 0) return;

      const now = Date.now();
      if (now - progressTickRef.current < 2000) return;
      progressTickRef.current = now;

      const percent = Math.max(
        0,
        Math.min(100, Math.round((positionSeconds / durationSeconds) * 100)),
      );

      saveProgress(ref, {
        percent,
        positionSeconds,
        durationSeconds,
        seasonNumber: type === "series" ? seasonNumber : undefined,
        episodeNumber: type === "series" ? episodeNumber : undefined,
      });
    },
    [episodeNumber, ref, saveProgress, seasonNumber, type],
  );

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => undefined);
    return () => {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.DEFAULT,
      ).catch(() => undefined);
    };
  }, [visible]);

  return (
    <>
      <Button
        label={t("Play")}
        icon="play"
        onPress={handlePress}
        size={size}
        accessibilityHint={t("Plays the best available stream")}
      />

      <Modal
        visible={visible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <StatusBar hidden />
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingTop: insets.top }]}> 
            <View style={styles.playerFrame}>
              {activeUrl ? (
                <StreamWebView
                  key={activeUrl}
                  url={activeUrl}
                  onFail={handleStreamFail}
                  onLoad={() => setIsLoading(false)}
                  onClose={() => setVisible(false)}
                  isLoading={isLoading}
                  startAtSeconds={startAtSeconds}
                  onPlaybackSync={handlePlaybackSync}
                />
              ) : (
                <ActivityIndicator size="large" color={styles.spinner.color} />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

interface StreamWebViewProps {
  url: string;
  onFail: () => void;
  onLoad: () => void;
  onClose: () => void;
  isLoading: boolean;
  startAtSeconds: number;
  onPlaybackSync: (positionSeconds: number, durationSeconds: number) => void;
}

interface PlayerSubtitleTrack {
  index: number;
  label: string;
  language: string;
  mode: "disabled" | "hidden" | "showing";
}

interface PlayerAudioTrack {
  index: number;
  label: string;
  language: string;
  enabled: boolean;
}

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const safe = Math.floor(totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function StreamWebView({
  url,
  onFail,
  onLoad,
  onClose,
  isLoading,
  startAtSeconds,
  onPlaybackSync,
}: StreamWebViewProps) {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeBoostIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeRafRef = useRef<number | null>(null);
  const pendingVolumeRef = useRef<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);
  const [scrubPreviewSeconds, setScrubPreviewSeconds] = useState<number | null>(null);
  const [showTracksPanel, setShowTracksPanel] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<PlayerSubtitleTrack[]>([]);
  const [audioTracks, setAudioTracks] = useState<PlayerAudioTrack[]>([]);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(-1);
  useKeepAwake();

  const clearHideTimer = useCallback(() => {
    if (!autoHideTimerRef.current) return;
    clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = null;
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearHideTimer();
    autoHideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3200);
  }, [clearHideTimer]);

  const showControls = useCallback((reschedule = true) => {
    setControlsVisible(true);
    if (reschedule) scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    if (!isPlaying || !controlsVisible) {
      clearHideTimer();
      return;
    }
    scheduleHideControls();
    return clearHideTimer;
  }, [clearHideTimer, controlsVisible, isPlaying, scheduleHideControls]);

  useEffect(() => {
    return clearHideTimer;
  }, [clearHideTimer]);

  const sendPlayerCommand = useCallback(
    (
      command:
        | "toggle"
        | "seekBy"
        | "seekTo"
        | "cast"
        | "setVolume"
        | "getTracks"
        | "setSubtitleTrack"
        | "setAudioTrack",
      value = 0,
      shouldRevealControls = true,
    ) => {
      const script = `
        (function () {
          try {
            var getPrimaryVideo = function() {
              try {
                var videos = Array.from(document.querySelectorAll('video'));
                if (!videos.length) return null;
                videos.sort(function(a, b) {
                  var aScore = ((a.videoWidth || 0) * (a.videoHeight || 0)) + ((a.duration || 0) * 10) + (a.paused ? 0 : 100000);
                  var bScore = ((b.videoWidth || 0) * (b.videoHeight || 0)) + ((b.duration || 0) * 10) + (b.paused ? 0 : 100000);
                  return bScore - aScore;
                });
                return videos[0] || null;
              } catch (e) {
                return document.querySelector('video');
              }
            };
            var video = getPrimaryVideo();
            if (!video) return;
            var command = ${JSON.stringify(command)};
            var value = Number(${JSON.stringify(value)}) || 0;
            var collectTracks = function() {
              var subtitles = [];
              var audios = [];
              try {
                var tt = video.textTracks || [];
                for (var i = 0; i < tt.length; i++) {
                  var s = tt[i];
                  subtitles.push({
                    index: i,
                    label: String((s && s.label) || ('Subtitle ' + (i + 1))),
                    language: String((s && s.language) || ''),
                    mode: String((s && s.mode) || 'disabled')
                  });
                }
              } catch (e) {}
              try {
                var at = video.audioTracks || [];
                for (var j = 0; j < at.length; j++) {
                  var a = at[j];
                  audios.push({
                    index: j,
                    label: String((a && a.label) || ('Audio ' + (j + 1))),
                    language: String((a && a.language) || ''),
                    enabled: Boolean(a && a.enabled)
                  });
                }
              } catch (e) {}
              return { subtitles: subtitles, audios: audios };
            };
            if (command === 'toggle') {
              if (video.paused) {
                video.play && video.play().catch(function(){});
              } else {
                video.pause && video.pause();
              }
            }
            if (command === 'seekBy') {
              video.currentTime = Math.max(0, Math.min((video.duration || 0), (video.currentTime || 0) + value));
            }
            if (command === 'seekTo') {
              video.currentTime = Math.max(0, Math.min((video.duration || 0), value));
            }
            if (command === 'cast') {
              try {
                if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
                  video.webkitShowPlaybackTargetPicker();
                  return;
                }
              } catch (e) {}
              try {
                if (video.remote && typeof video.remote.prompt === 'function') {
                  video.remote.prompt();
                  return;
                }
              } catch (e) {}
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CAST_UNSUPPORTED' }));
              }
            }
            if (command === 'setVolume') {
              var safe = Math.max(0, Math.min(1, value));
              video.muted = safe <= 0.001;
              video.volume = safe;
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'VOLUME_SYNC',
                  volume: Number(video.volume || 0),
                  muted: Boolean(video.muted)
                }));
              }
            }
            if (command === 'getTracks' && window.ReactNativeWebView) {
              var tracks = collectTracks();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'TRACKS_SYNC',
                subtitles: tracks.subtitles,
                audios: tracks.audios
              }));
            }
            if (command === 'setSubtitleTrack') {
              try {
                var subtitleIdx = Math.floor(value);
                var textTracks = video.textTracks || [];
                if (!textTracks.length && window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUBTITLES_UNAVAILABLE' }));
                }
                for (var k = 0; k < textTracks.length; k++) {
                  textTracks[k].mode = (k === subtitleIdx && subtitleIdx >= 0) ? 'showing' : 'disabled';
                }
                if (window.ReactNativeWebView) {
                  var tracksAfterSubtitle = collectTracks();
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'TRACKS_SYNC',
                    subtitles: tracksAfterSubtitle.subtitles,
                    audios: tracksAfterSubtitle.audios
                  }));
                }
              } catch (e) {}
            }
            if (command === 'setAudioTrack') {
              try {
                var audioIdx = Math.floor(value);
                var mediaAudioTracks = video.audioTracks || [];
                for (var m = 0; m < mediaAudioTracks.length; m++) {
                  mediaAudioTracks[m].enabled = m === audioIdx;
                }
                if (window.ReactNativeWebView) {
                  var tracksAfterAudio = collectTracks();
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'TRACKS_SYNC',
                    subtitles: tracksAfterAudio.subtitles,
                    audios: tracksAfterAudio.audios
                  }));
                }
              } catch (e) {}
            }
          } catch (e) {}
        })();
        true;
      `;

      webViewRef.current?.injectJavaScript(script);
      if (shouldRevealControls) showControls();
    },
    [showControls],
  );

  const handleTogglePlayback = useCallback(() => {
    sendPlayerCommand("toggle");
  }, [sendPlayerCommand]);

  const handleSeekBy = useCallback(
    (deltaSeconds: number) => {
      sendPlayerCommand("seekBy", deltaSeconds);
    },
    [sendPlayerCommand],
  );

  const handleProgressTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const handleVolumeTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setVolumeTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const handleCastPress = useCallback(() => {
    sendPlayerCommand("cast");
  }, [sendPlayerCommand]);

  const handleProgressPress = useCallback(
    (x: number) => {
      if (durationSeconds <= 0 || progressTrackWidth <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / progressTrackWidth));
      const nextSeconds = ratio * durationSeconds;
      setScrubPreviewSeconds(nextSeconds);
      sendPlayerCommand("seekTo", nextSeconds, false);
    },
    [durationSeconds, progressTrackWidth, sendPlayerCommand],
  );

  const applyVolume = useCallback(
    (nextVolume: number, shouldRevealControls = true) => {
      const safe = Math.max(0, Math.min(1, nextVolume));
      setVolume(safe);
      setIsMuted(safe <= 0.001);
      sendPlayerCommand("setVolume", safe, shouldRevealControls);
    },
    [sendPlayerCommand],
  );

  const scheduleVolumeTo = useCallback(
    (nextVolume: number) => {
      pendingVolumeRef.current = nextVolume;
      if (volumeRafRef.current != null) return;
      volumeRafRef.current = requestAnimationFrame(() => {
        volumeRafRef.current = null;
        const target = pendingVolumeRef.current;
        if (target == null) return;
        applyVolume(target, false);
      });
    },
    [applyVolume],
  );

  const handleVolumePress = useCallback(
    (x: number) => {
      if (volumeTrackWidth <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / volumeTrackWidth));
      setVolume(ratio);
      setIsMuted(ratio <= 0.001);
      scheduleVolumeTo(ratio);
    },
    [scheduleVolumeTo, volumeTrackWidth],
  );

  const handleToggleMute = useCallback(() => {
    if (isMuted || volume <= 0.001) {
      applyVolume(0.85);
      return;
    }
    applyVolume(0);
  }, [applyVolume, isMuted, volume]);

  const handleProgressDrag = useCallback(
    (x: number) => {
      if (durationSeconds <= 0 || progressTrackWidth <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / progressTrackWidth));
      const nextTime = ratio * durationSeconds;
      setScrubPreviewSeconds(nextTime);
    },
    [durationSeconds, progressTrackWidth],
  );

  const requestTrackSync = useCallback(() => {
    sendPlayerCommand("getTracks");
  }, [sendPlayerCommand]);

  const handleSubtitleSelection = useCallback(
    (index: number) => {
      setSelectedSubtitleIndex(index);
      sendPlayerCommand("setSubtitleTrack", index);
    },
    [sendPlayerCommand],
  );

  const handleAudioSelection = useCallback(
    (index: number) => {
      sendPlayerCommand("setAudioTrack", index);
    },
    [sendPlayerCommand],
  );

  const handleWebViewLoad = useCallback(() => {
    onLoad();
    setVolume(1);
    setIsMuted(false);
    applyVolume(1, false);
    if (volumeBoostIntervalRef.current) {
      clearInterval(volumeBoostIntervalRef.current);
    }
    let attempts = 0;
    volumeBoostIntervalRef.current = setInterval(() => {
      attempts += 1;
      applyVolume(1, false);
      if (attempts >= 6 && volumeBoostIntervalRef.current) {
        clearInterval(volumeBoostIntervalRef.current);
        volumeBoostIntervalRef.current = null;
      }
    }, 700);
    setTimeout(requestTrackSync, 900);
  }, [applyVolume, onLoad, requestTrackSync]);

  useEffect(() => {
    return () => {
      if (volumeBoostIntervalRef.current) {
        clearInterval(volumeBoostIntervalRef.current);
        volumeBoostIntervalRef.current = null;
      }
      if (volumeRafRef.current != null) {
        cancelAnimationFrame(volumeRafRef.current);
      }
    };
  }, []);

  const blockedHosts = useMemo(
    () => [
      "doubleclick.net",
      "googlesyndication.com",
      "googleadservices.com",
      "adservice.google.com",
      "popads.net",
      "exoclick",
      "propellerads",
      "trafficstars",
      "juicyads",
      "pushame",
      "clickadu",
      "hilltopads",
      "adsterra",
      "ad-maven",
      "admaven",
      "popcash.net",
      "trafficjunky",
      "pushground",
      "richpush",
      "bidswitch.net",
      "taboola.com",
      "outbrain.com",
      "adnxs.com",
      "adsrvr.org",
      "serving-sys.com",
      "mgid.com",
      "revcontent.com",
      "zedo.com",
      "lqm.io",
      "popunder.net",
      "adf.ly",
      "bc.vc",
      "sh.st",
    ],
    [],
  );

  const injectedJavaScript = useMemo(() => {
    return `
      (function(){
        try {
          var blocked = [
            'doubleclick.net','googlesyndication.com','googleadservices.com','adservice.google.com',
            'popads.net','exoclick','propellerads','trafficstars','juicyads','pushame','clickadu',
            'hilltopads','adsterra','ad-maven','admaven','popcash.net','trafficjunky','pushground',
            'richpush','bidswitch.net','taboola.com','outbrain.com','adnxs.com','adsrvr.org',
            'serving-sys.com','mgid.com','revcontent.com','zedo.com','lqm.io','popunder.net','adf.ly','bc.vc','sh.st'
          ];

          var isBlockedUrl = function(raw) {
            if (!raw) return false;
            var v = String(raw).toLowerCase();
            for (var i = 0; i < blocked.length; i++) {
              if (v.indexOf(blocked[i]) !== -1) return true;
            }
            return false;
          };

          var resumeAt = ${Math.max(0, Math.round(startAtSeconds))};

          const style = document.createElement('style');
          style.innerHTML = [
            '[id*="ad"], [class*="ad"], [id*="ads"], [class*="ads"], [id*="banner"], [class*="banner"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="adservice"], iframe[src*="taboola"], iframe[src*="outbrain"], .adsbygoogle, .google-auto-placed { display: none !important; }',
            'video::-webkit-media-controls, video::-webkit-media-controls-enclosure, video::-webkit-media-controls-panel, video::-webkit-media-controls-play-button, video::-webkit-media-controls-fullscreen-button, video::-webkit-media-controls-overlay-enclosure, video::-webkit-media-controls-start-playback-button { display: none !important; -webkit-appearance: none !important; }',
            'video::-moz-media-controls { display: none !important; }',
            'button[aria-label*="fullscreen" i], button[title*="fullscreen" i], .fullscreen, [class*="fullscreen" i], [id*="fullscreen" i], [class*="pip" i], [id*="pip" i], button[aria-label*="picture in picture" i], [class*="rewind" i], [class*="forward" i] { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }',
            'iframe, video { border: 0 !important; box-shadow: none !important; }'
          ].join(' ');
          document.head.appendChild(style);

          try {
            document.documentElement.style.touchAction = 'none';
            if (document.body) document.body.style.touchAction = 'none';
          } catch (e) {}

          const hideCandidates = (root) => {
            const candidates = Array.from(root.querySelectorAll('*'));
            for (const node of candidates) {
              const idText = String(node.id || '').toLowerCase();
              const classText = String(node.className || '').toLowerCase();
              const attrs = idText + ' ' + classText;
              if (/(^|\W)(ad|ads|sponsor|banner|popunder|popup)(\W|$)/i.test(attrs)) {
                node.style.display = 'none';
              }
            }
          };

          hideCandidates(document);

          const observer = new MutationObserver(() => hideCandidates(document));
          observer.observe(document.documentElement, { childList: true, subtree: true });

          const blockExternalFrames = () => {
            const frames = Array.from(document.querySelectorAll('iframe'));
            frames.forEach((frame) => {
              const src = (frame.getAttribute('src') || '').toLowerCase();
              if (src && isBlockedUrl(src)) {
                frame.remove();
                return;
              }
              if (frame.style) {
                frame.style.pointerEvents = 'none';
                frame.style.zIndex = '1';
              }
            });
          };

          blockExternalFrames();
          setInterval(blockExternalFrames, 1500);

          window.open = function(nextUrl) {
            if (isBlockedUrl(nextUrl)) return null;
            return null;
          };

          try {
            if (window.top && window.self !== window.top) {
              window.top.open = function() { return null; };
            }
          } catch (e) {}

          var forceAudio = function() {
            try {
              var videos = Array.from(document.querySelectorAll('video'));
              videos.sort(function(a, b) {
                var aScore = ((a.videoWidth || 0) * (a.videoHeight || 0)) + ((a.duration || 0) * 10) + (a.paused ? 0 : 100000);
                var bScore = ((b.videoWidth || 0) * (b.videoHeight || 0)) + ((b.duration || 0) * 10) + (b.paused ? 0 : 100000);
                return bScore - aScore;
              });
              var media = videos[0] || document.querySelector('video, audio');
              if (!media) return;
              media.muted = false;
              media.volume = 1;
              if (media.paused) {
                media.play().catch(function(){});
              }
            } catch (e) {}
          };

          var emitProgress = function() {
            try {
              var videos = Array.from(document.querySelectorAll('video'));
              videos.sort(function(a, b) {
                var aScore = ((a.videoWidth || 0) * (a.videoHeight || 0)) + ((a.duration || 0) * 10) + (a.paused ? 0 : 100000);
                var bScore = ((b.videoWidth || 0) * (b.videoHeight || 0)) + ((b.duration || 0) * 10) + (b.paused ? 0 : 100000);
                return bScore - aScore;
              });
              var video = videos[0] || document.querySelector('video');
              if (!video || !window.ReactNativeWebView) return;
              try {
                video.controls = false;
                video.removeAttribute('controls');
              } catch (e) {}
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PLAYBACK_SYNC',
                currentTime: Number(video.currentTime || 0),
                duration: Number(video.duration || 0),
                paused: Boolean(video.paused)
              }));
            } catch (e) {}
          };

          var bindVideoEvents = function() {
            var videos = Array.from(document.querySelectorAll('video'));
            videos.sort(function(a, b) {
              var aScore = ((a.videoWidth || 0) * (a.videoHeight || 0)) + ((a.duration || 0) * 10) + (a.paused ? 0 : 100000);
              var bScore = ((b.videoWidth || 0) * (b.videoHeight || 0)) + ((b.duration || 0) * 10) + (b.paused ? 0 : 100000);
              return bScore - aScore;
            });
            var video = videos[0] || document.querySelector('video');
            if (!video || video.__cinelogBound) return;
            video.__cinelogBound = true;
            try {
              video.playsInline = true;
              video.setAttribute('playsinline', 'true');
              video.setAttribute('webkit-playsinline', 'true');
              video.controls = false;
              video.removeAttribute('controls');
              video.setAttribute('x-webkit-airplay', 'deny');
              video.setAttribute('airplay', 'deny');
              video.setAttribute('controlsList', 'nofullscreen nodownload noplaybackrate');
              video.disablePictureInPicture = true;
              video.setAttribute('disablePictureInPicture', 'true');
              video.style.objectFit = 'contain';
              video.style.background = '#000';
              video.style.pointerEvents = 'none';
              
              if (video.webkitSupportsPresentationMode) {
                try { video.webkitSetPresentationMode('inline'); } catch (e) {}
              }
              
              video.addEventListener('webkitpresentationmodechanged', function(e) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                try {
                  if (video.webkitPresentationMode !== 'inline') {
                    video.webkitSetPresentationMode('inline');
                  }
                } catch (err) {}
              });
              if (typeof video.requestFullscreen === 'function') {
                video.requestFullscreen = function() { return Promise.resolve(); };
              }
              if (typeof video.webkitEnterFullscreen === 'function') {
                video.webkitEnterFullscreen = function() {};
              }
              if (typeof video.webkitRequestFullscreen === 'function') {
                video.webkitRequestFullscreen = function() {};
              }
            } catch (e) {}
            if (resumeAt > 0 && !video.__cinelogResumed) {
              video.__cinelogResumed = true;
              try { video.currentTime = resumeAt; } catch (e) {}
            }
            ['timeupdate', 'loadedmetadata', 'playing', 'pause'].forEach(function(evt){
              video.addEventListener(evt, emitProgress, { passive: true });
            });
            ['webkitbeginfullscreen', 'webkitendfullscreen', 'enterpictureinpicture', 'leavepictureinpicture'].forEach(function(evt){
              video.addEventListener(evt, function(e){
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                try { 
                  if (video.webkitSupportsPresentationMode) {
                    video.webkitSetPresentationMode('inline');
                  }
                } catch (err) {}
                return false;
              }, { capture: true, passive: false });
            });
            emitProgress();
          };

          try {
            if (window.Element && Element.prototype && typeof Element.prototype.requestFullscreen === 'function') {
              Element.prototype.requestFullscreen = function() { return Promise.resolve(); };
            }
            if (window.HTMLVideoElement && HTMLVideoElement.prototype) {
              if (typeof HTMLVideoElement.prototype.webkitEnterFullscreen === 'function') {
                HTMLVideoElement.prototype.webkitEnterFullscreen = function() {};
              }
              if (typeof HTMLVideoElement.prototype.webkitRequestFullscreen === 'function') {
                HTMLVideoElement.prototype.webkitRequestFullscreen = function() {};
              }
            }
          } catch (e) {}

          var blockClickIfNeeded = function(event) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'USER_INTERACTION' }));
            }
            var node = event.target;
            while (node) {
              var href = '';
              try {
                href = String(node.href || node.getAttribute && node.getAttribute('href') || '');
              } catch (e) {}
              if (isBlockedUrl(href)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation && event.stopImmediatePropagation();
                forceAudio();
                return false;
              }
              if (node.target === '_blank') {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation && event.stopImmediatePropagation();
                forceAudio();
                return false;
              }
              node = node.parentElement;
            }
            return true;
          };

          document.addEventListener('click', blockClickIfNeeded, true);
          document.addEventListener('touchstart', blockClickIfNeeded, true);
          document.addEventListener('pointerdown', blockClickIfNeeded, true);
          setInterval(bindVideoEvents, 1200);
          setInterval(emitProgress, 1800);
          setTimeout(forceAudio, 800);
        } catch (error) {}
      })();
    `;
  }, []);

  return (
    <View style={styles.streamContainer}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        allowsFullscreenVideo={false}
        allowsInlineMediaPlayback
        allowsAirPlayForMediaPlayback={false}
        allowsPictureInPictureMediaPlayback={false}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        mixedContentMode="always"
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36"
        injectedJavaScript={injectedJavaScript}
        onLoad={handleWebViewLoad}
        onError={onFail}
        onHttpError={onFail}
        onMessage={(event) => {
          try {
            const raw = JSON.parse(String(event.nativeEvent.data || "")) as unknown;
            if (!raw || typeof raw !== "object") return;
            const payload = raw as {
              type?: unknown;
              currentTime?: unknown;
              duration?: unknown;
              paused?: unknown;
              volume?: unknown;
              muted?: unknown;
              subtitles?: unknown;
              audios?: unknown;
            };
            if (typeof payload.type !== "string") return;

            if (payload.type === "USER_INTERACTION") {
              showControls();
              return;
            }
            if (payload.type === "CAST_UNSUPPORTED") {
              Alert.alert(
                Platform.OS === "android" ? "Cast not available" : "AirPlay not available",
                Platform.OS === "android"
                  ? "This stream provider does not expose Google Cast controls in the embedded player."
                  : "This stream provider does not expose AirPlay controls in the embedded player.",
              );
              return;
            }
            if (payload.type === "PLAYBACK_SYNC") {
              const nextCurrent = Number(payload.currentTime || 0);
              const nextDuration = Number(payload.duration || 0);
              setPositionSeconds(nextCurrent);
              setDurationSeconds(nextDuration);
              setIsPlaying(!Boolean(payload.paused));
              onPlaybackSync(nextCurrent, nextDuration);
              return;
            }
            if (payload.type === "VOLUME_SYNC") {
              const nextVolume = Number(payload.volume);
              if (Number.isFinite(nextVolume)) {
                setVolume(Math.max(0, Math.min(1, nextVolume)));
              }
              setIsMuted(Boolean(payload.muted));
              return;
            }
            if (payload.type === "TRACKS_SYNC") {
              const incomingSubtitles = Array.isArray(payload.subtitles)
                ? (payload.subtitles as PlayerSubtitleTrack[])
                : [];
              const incomingAudios = Array.isArray(payload.audios)
                ? (payload.audios as PlayerAudioTrack[])
                : [];
              setSubtitleTracks(incomingSubtitles);
              setAudioTracks(incomingAudios);
              const activeSubtitle = incomingSubtitles.find((track) => track.mode === "showing");
              setSelectedSubtitleIndex(activeSubtitle ? activeSubtitle.index : -1);
              return;
            }
            if (payload.type === "SUBTITLES_UNAVAILABLE") {
              Alert.alert(
                "No subtitles available",
                "This stream provider does not expose subtitle tracks in embedded playback.",
              );
            }
          } catch {
            // Ignore malformed bridge events from third-party players.
          }
        }}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          const target = String(request.url || "").toLowerCase();
          if (blockedHosts.some((host) => target.includes(host))) return false;
          if (!target.startsWith("http") && !target.startsWith("about:") && !target.startsWith("data:") && !target.startsWith("blob:")) return false;
          if (target.startsWith("intent:") || target.startsWith("market:") || target.startsWith("mailto:") || target.startsWith("tel:")) return false;
          return true;
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}
      />
      <Pressable
        style={styles.controlsTouchLayer}
        onPress={() => {
          if (controlsVisible) {
            setControlsVisible(false);
            clearHideTimer();
            return;
          }
          showControls();
        }}
        accessibilityRole="button"
        accessibilityLabel="Show or hide player controls"
      />
      {controlsVisible ? (
        <View
          pointerEvents="box-none"
          style={[styles.controlsOverlay, { paddingTop: insets.top + SPACING.sm }]}
        >
          <View style={styles.controlsTopBar}>
            <Pressable
              onPress={onClose}
              style={styles.topActionButton}
              accessibilityRole="button"
              accessibilityLabel="Close player"
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
              <Text style={styles.topActionLabel}>Close</Text>
            </Pressable>
            <Pressable
              onPress={handleCastPress}
              style={styles.topActionButton}
              accessibilityRole="button"
              accessibilityLabel={Platform.OS === "android" ? t("Cast to TV") : t("AirPlay to TV")}
            >
              <Ionicons
                name="tv-outline"
                size={18}
                color={colors.textPrimary}
              />
              <Text style={styles.topActionLabel}>{Platform.OS === "android" ? "Cast" : "AirPlay"}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                requestTrackSync();
                setShowTracksPanel((value) => !value);
              }}
              style={styles.topActionButton}
              accessibilityRole="button"
              accessibilityLabel="Subtitles and audio"
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color={colors.textPrimary}
              />
              <Text style={styles.topActionLabel}>CC/Audio</Text>
            </Pressable>
          </View>

          <View style={styles.controlsCenterRow}>
            <Pressable
              onPress={() => handleSeekBy(-10)}
              style={styles.controlButton}
              accessibilityRole="button"
              accessibilityLabel="Rewind 10 seconds"
            >
              <Ionicons name="play-back" size={20} color={colors.textPrimary} />
              <Text style={styles.controlButtonText}>10s</Text>
            </Pressable>
            <Pressable
              onPress={handleTogglePlayback}
              style={[styles.controlButton, styles.controlButtonPrimary]}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={26}
                color={colors.textPrimary}
              />
              <Text style={styles.controlButtonText}>{isPlaying ? "Pause" : "Play"}</Text>
            </Pressable>
            <Pressable
              onPress={() => handleSeekBy(10)}
              style={styles.controlButton}
              accessibilityRole="button"
              accessibilityLabel="Forward 10 seconds"
            >
              <Ionicons name="play-forward" size={20} color={colors.textPrimary} />
              <Text style={styles.controlButtonText}>10s</Text>
            </Pressable>
          </View>

          <View style={styles.controlsBottomBar}>
            <View style={styles.volumeRow}>
              <Pressable
                style={styles.volumeButton}
                onPress={handleToggleMute}
                accessibilityRole="button"
                accessibilityLabel={isMuted || volume <= 0.001 ? "Unmute" : "Mute"}
              >
                <Ionicons
                  name={isMuted || volume <= 0.001 ? "volume-mute" : volume < 0.45 ? "volume-low" : "volume-high"}
                  size={16}
                  color={colors.textPrimary}
                />
              </Pressable>
              <View
                style={styles.volumeTrack}
                onLayout={handleVolumeTrackLayout}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event) => {
                  showControls();
                  handleVolumePress(event.nativeEvent.locationX);
                }}
                onResponderMove={(event) => {
                  handleVolumePress(event.nativeEvent.locationX);
                }}
                onResponderRelease={(event) => {
                  handleVolumePress(event.nativeEvent.locationX);
                }}
                accessibilityRole="adjustable"
                accessibilityLabel="Volume"
              >
                <View
                  style={[
                    styles.volumeFill,
                    { width: `${Math.round(Math.max(0, Math.min(100, volume * 100)))}%` },
                  ]}
                />
              </View>
            </View>
            <View style={styles.controlsBottomMain}>
              <Text style={styles.timeLabel}>{formatSeconds(scrubPreviewSeconds ?? positionSeconds)}</Text>
              <View
                style={styles.progressTrack}
                onLayout={handleProgressTrackLayout}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event) => {
                  showControls();
                  handleProgressDrag(event.nativeEvent.locationX);
                }}
                onResponderMove={(event) => {
                  handleProgressDrag(event.nativeEvent.locationX);
                }}
                onResponderRelease={(event) => {
                  handleProgressPress(event.nativeEvent.locationX);
                  setTimeout(() => setScrubPreviewSeconds(null), 120);
                }}
                accessibilityRole="adjustable"
                accessibilityLabel="Seek"
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        durationSeconds > 0
                          ? `${Math.max(0, Math.min(100, (((scrubPreviewSeconds ?? positionSeconds) / durationSeconds) * 100)))}%`
                          : "0%",
                    },
                  ]}
                />
              </View>
              <Text style={styles.timeLabel}>{formatSeconds(durationSeconds)}</Text>
            </View>
          </View>
          {showTracksPanel ? (
            <View style={styles.tracksPanel}>
              <Text style={styles.tracksTitle}>Subtitles</Text>
              <View style={styles.trackRow}>
                <Pressable
                  style={[
                    styles.trackPill,
                    selectedSubtitleIndex < 0 ? styles.trackPillActive : null,
                  ]}
                  onPress={() => handleSubtitleSelection(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Subtitles off"
                >
                  <Text style={styles.trackPillText}>Off</Text>
                </Pressable>
                {subtitleTracks.map((track) => (
                  <Pressable
                    key={`subtitle-${track.index}`}
                    style={[
                      styles.trackPill,
                      selectedSubtitleIndex === track.index ? styles.trackPillActive : null,
                    ]}
                    onPress={() => handleSubtitleSelection(track.index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Subtitle ${track.label}`}
                  >
                    <Text style={styles.trackPillText} numberOfLines={1}>
                      {track.label || track.language || `Sub ${track.index + 1}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.tracksTitle}>Audio</Text>
              <View style={styles.trackRow}>
                {audioTracks.length === 0 ? (
                  <Text style={styles.trackInfoText}>Provider does not expose audio tracks</Text>
                ) : null}
                {audioTracks.map((track) => (
                  <Pressable
                    key={`audio-${track.index}`}
                    style={[
                      styles.trackPill,
                      track.enabled ? styles.trackPillActive : null,
                    ]}
                    onPress={() => handleAudioSelection(track.index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Audio ${track.label}`}
                  >
                    <Text style={styles.trackPillText} numberOfLines={1}>
                      {track.label || track.language || `Audio ${track.index + 1}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {isLoading ? (
        <View style={[styles.loadingChip, { top: insets.top + SPACING.sm }]}> 
          <ActivityIndicator size="small" color={colors.textPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const WATCH_STATES: { value: WatchState; label: string }[] = [
  { value: "want_to_watch", label: "Want to Watch" },
  { value: "watching", label: "Currently Watching" },
  { value: "watched", label: "Watched" },
];

export interface WatchStateSelectorProps {
  item: LibraryEntryRef;
}

/** Three-way tracking control: Want to Watch / Currently Watching / Watched. */
export function WatchStateSelector({ item }: WatchStateSelectorProps) {
  const styles = useStyles();
  const current = useLibrary((state) => state.getWatchState(item.id));
  const setWatchState = useLibrary((state) => state.setWatchState);

  return (
    <View style={styles.stateRow} accessibilityRole="radiogroup">
      {WATCH_STATES.map((option) => (
        <GenrePill
          key={option.value}
          label={option.label}
          selected={current === option.value}
          onPress={() => {
            setWatchState(item, option.value);
            void SafeHaptics.selection();
          }}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  stateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    backgroundColor: c.background,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#000",
  },
  modalSheet: {
    flex: 1,
    backgroundColor: "#000",
    padding: 0,
    paddingTop: 0,
  },
  playerFrame: {
    flex: 1,
    minHeight: 0,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  streamContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  controlsTouchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  controlsTopBar: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  topActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  topActionLabel: {
    color: c.textPrimary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  controlsCenterRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
  },
  controlButton: {
    minWidth: 82,
    borderRadius: 999,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    gap: 4,
  },
  controlButtonPrimary: {
    minWidth: 96,
    backgroundColor: "rgba(14,16,20,0.92)",
    borderColor: c.accentGlow,
  },
  controlButtonText: {
    color: c.textPrimary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  controlsBottomBar: {
    gap: SPACING.sm,
    backgroundColor: "rgba(8,9,11,0.82)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  volumeButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: "rgba(0,0,0,0.36)",
    alignItems: "center",
    justifyContent: "center",
  },
  volumeTrack: {
    width: 92,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  volumeFill: {
    height: "100%",
    backgroundColor: c.accent,
  },
  controlsBottomMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  tracksPanel: {
    backgroundColor: "rgba(6,7,9,0.9)",
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  tracksTitle: {
    color: c.textPrimary,
    fontFamily: FONTS.semibold,
    fontSize: 12,
  },
  trackRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    alignItems: "center",
  },
  trackPill: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    maxWidth: 160,
  },
  trackPillActive: {
    backgroundColor: c.accentSoft,
    borderColor: c.accentGlow,
  },
  trackPillText: {
    color: c.textPrimary,
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
  trackInfoText: {
    color: c.textMuted,
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: c.accent,
  },
  timeLabel: {
    color: c.textPrimary,
    minWidth: 52,
    textAlign: "center",
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  spinner: {
    color: c.accent,
  },
  loadingChip: {
    position: "absolute",
    right: SPACING.md,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 3,
  },
}));
