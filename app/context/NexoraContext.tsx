import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { parseM3UContentAsync } from "@/lib/parseM3U";
import { fetchM3UText } from "@/lib/fetchM3U";
import { trackWatchProgress } from "@/lib/services/user-state-service";

import { setLanguage as setI18nLanguage, type Language } from "@/lib/i18n";

export type PremiumCategory = "sport" | "movies" | "series" | "livetv";

export interface DownloadedItem {
  id: string;
  contentId: string;
  title: string;
  type: "movie" | "series" | "channel";
  poster?: string | null;
  filePath: string;
  fileSize?: number;
  downloadedAt: string;
  year?: number | null;
  quality?: string;
}

export interface WatchedItem {
  id: string;
  contentId?: string;
  type: "movie" | "series" | "channel" | "sport";
  title: string;
  progress?: number;
  lastWatched: string;
  poster?: string | null;
  backdrop?: string | null;
  genre_ids?: number[];
  tmdbId?: number;
  year?: number | null;
  duration?: number;
  currentTime?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

export interface IPTVPlaylist {
  id: string;
  name: string;
  url: string;
  type: "m3u" | "xtream";
  addedAt: string;
  channelCount?: number;
  liveCount?: number;
  movieCount?: number;
  seriesCount?: number;
  status?: "loading" | "ready" | "error";
  error?: string;
}

export interface IPTVChannel {
  id: string;
  name: string;
  title?: string;
  logo?: string;
  poster?: string;
  backdrop?: string;
  group: string;
  url: string;
  category: "live" | "movie" | "series";
  playlistId: string;
  tmdbId?: number;
  synopsis?: string;
  year?: number | null;
  rating?: number;
  seasons?: number;
  epgId?: string;
}

interface NexoraContextValue {
  resetAll: () => Promise<void>;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  watchHistory: WatchedItem[];
  addToHistory: (item: WatchedItem) => void;
  updateProgress: (id: string, currentTime: number, duration: number) => void;
  clearHistory: () => Promise<void>;
  playlists: IPTVPlaylist[];
  addPlaylist: (playlist: Omit<IPTVPlaylist, "id" | "addedAt">) => Promise<IPTVPlaylist>;
  removePlaylist: (id: string) => void;
  updatePlaylist: (id: string, updates: Partial<IPTVPlaylist>) => void;
  iptvChannels: IPTVChannel[];
  isLoadingPlaylist: boolean;
  setIptvChannelsForPlaylist: (playlistId: string, channels: IPTVChannel[]) => void;
  hiddenChannels: string[];
  toggleHideChannel: (id: string) => void;
  hiddenGroups: string[];
  toggleHideGroup: (group: string) => void;
  isChannelVisible: (id: string, group: string) => boolean;
  selectedQuality: "4K" | "FHD" | "HD" | "Auto";
  setSelectedQuality: (q: "4K" | "FHD" | "HD" | "Auto") => void;
  subtitlesEnabled: boolean;
  setSubtitlesEnabled: (v: boolean) => void;
  audioLanguage: string;
  setAudioLanguage: (lang: string) => void;
  uiLanguage: Language;
  setUiLanguage: (lang: Language) => void;
  autoplayEnabled: boolean;
  setAutoplayEnabled: (v: boolean) => void;
  downloadOverWifi: boolean;
  setDownloadOverWifi: (v: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  parentalPin: string | null;
  setParentalPin: (pin: string | null) => void;
  activeProfile: string;
  setActiveProfile: (name: string) => void;
  profiles: string[];
  avatarUri: string | null;
  setAvatarUri: (uri: string | null) => Promise<void>;
  isPremium: boolean;
  premiumCategories: PremiumCategory[];
  hasPremium: (cat: PremiumCategory) => boolean;
  activatePremium: () => Promise<void>;
  deactivatePremium: () => Promise<void>;
  activatePremiumCategories: (cats: PremiumCategory[]) => Promise<void>;
  downloads: DownloadedItem[];
  addDownload: (item: DownloadedItem) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  isDownloaded: (contentId: string) => boolean;
  getDownload: (contentId: string) => DownloadedItem | undefined;
}

const NexoraContext = createContext<NexoraContextValue | null>(null);

// Constant outside component — never recreated
const ALL_CATS: PremiumCategory[] = ["sport", "movies", "series", "livetv"];
const profiles = ["Main"];

export function NexoraProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchedItem[]>([]);
  const [playlists, setPlaylists] = useState<IPTVPlaylist[]>([]);
  const [iptvChannels, setIptvChannelsState] = useState<IPTVChannel[]>([]);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [hiddenChannels, setHiddenChannels] = useState<string[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]);
  const [selectedQuality, setSelectedQualityState] = useState<"4K" | "FHD" | "HD" | "Auto">("Auto");
  const [subtitlesEnabled, setSubtitlesEnabledState] = useState(false);
  const [audioLanguage, setAudioLanguageState] = useState("auto");
  const [uiLanguage, setUiLanguageState] = useState<Language>("en");
  const [autoplayEnabled, setAutoplayEnabledState] = useState(true);
  const [downloadOverWifi, setDownloadOverWifiState] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [parentalPin, setParentalPinState] = useState<string | null>(null);
  const [activeProfile, setActiveProfileState] = useState("Main");
  const [premiumCategories, setPremiumCategoriesState] = useState<PremiumCategory[]>([]);
  const [downloads, setDownloads] = useState<DownloadedItem[]>([]);
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);

  const isPremium = ALL_CATS.every(c => premiumCategories.includes(c));
  const hasPremium = (cat: PremiumCategory) => premiumCategories.includes(cat);

  useEffect(() => {
    // Uses parseM3UContentAsync — single source of truth, no duplicate inline logic
    const fetchNativePlaylist = async (): Promise<IPTVChannel[]> => {
      const m3uUrl = process.env.EXPO_PUBLIC_M3U_PLAYLIST_URL;
      if (!m3uUrl || Platform.OS === "web") return [];
      try {
        const text = await fetchM3UText(m3uUrl, 90000);
        if (!text || text.trim().length < 10) return [];
        const PLAYLIST_ID = "default";
        const result = await parseM3UContentAsync(text);
        return [
          ...result.live.slice(0, 2000).map(c => ({ ...c, playlistId: PLAYLIST_ID }) as IPTVChannel),
          ...result.movies.slice(0, 3000).map(c => ({ ...c, playlistId: PLAYLIST_ID }) as IPTVChannel),
          ...result.series.slice(0, 3000).map(c => ({ ...c, playlistId: PLAYLIST_ID }) as IPTVChannel),
        ];
      } catch {
        return [];
      }
    };

    const load = async () => {
      try {
        // v3: bumped to force re-categorisation with improved classify() logic
        const schemaKey = "nexora_schema_v3";
        const schema = await AsyncStorage.getItem(schemaKey);
        if (!schema) {
          await AsyncStorage.multiRemove([
            "nexora_playlists", "nexora_iptv_channels",
            "nexora_hidden_channels", "nexora_hidden_groups",
            "nexora_schema_v2",
          ]);
          setPlaylists([]);
          setIptvChannelsState([]);
          setHiddenChannels([]);
          setHiddenGroups([]);
          await AsyncStorage.setItem(schemaKey, "1");
        }

        const keys = [
          "nexora_favorites", "nexora_history", "nexora_playlists",
          "nexora_quality", "nexora_subtitles", "nexora_pin", "nexora_profile",
          "nexora_iptv_channels", "nexora_hidden_channels", "nexora_hidden_groups",
          "nexora_premium", "nexora_premium_cats",
          "nexora_audio_lang", "nexora_autoplay", "nexora_dl_wifi", "nexora_notif",
          "nexora_downloads", "nexora_ui_lang",
        ];
        const [favs, hist, pls, qual, subs, pin, prof, iptv, hidCh, hidGr, prem, cats,
               audioLang, autoplay, dlWifi, notif, dlItems, uiLang] =
          await AsyncStorage.multiGet(keys).then(r => r.map(([, v]) => v));

        if (favs) setFavorites(JSON.parse(favs));
        if (hist) {
          const parsed = JSON.parse(hist);
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .filter((entry) => entry && typeof entry === "object")
              .map((entry) => ({
                ...entry,
                id: String(entry.id || "").trim(),
                title: String(entry.title || "").trim(),
                type: entry.type || "movie",
              }))
              .filter((entry) => entry.id && entry.title);
            setWatchHistory(normalized);
          }
        }
        if (pls) setPlaylists(JSON.parse(pls));
        if (qual) setSelectedQualityState(qual as any);
        if (subs) setSubtitlesEnabledState(subs === "true");
        if (pin) setParentalPinState(pin);
        if (prof) setActiveProfileState(prof);
        if (hidCh) setHiddenChannels(JSON.parse(hidCh));
        if (hidGr) setHiddenGroups(JSON.parse(hidGr));
        if (audioLang) setAudioLanguageState(audioLang);
        if (uiLang && (uiLang === "en" || uiLang === "nl")) {
          setUiLanguageState(uiLang as Language);
          setI18nLanguage(uiLang as Language);
        }
        if (autoplay != null) setAutoplayEnabledState(autoplay === "true");
        if (dlWifi != null) setDownloadOverWifiState(dlWifi === "true");
        if (notif != null) setNotificationsEnabledState(notif === "true");
        if (cats) {
          setPremiumCategoriesState(JSON.parse(cats));
        } else if (prem === "true") {
          setPremiumCategoriesState(ALL_CATS);
        }
        if (dlItems) setDownloads(JSON.parse(dlItems));

        const savedAvatar = await AsyncStorage.getItem("nexora_avatar");
        if (savedAvatar) setAvatarUriState(savedAvatar);

        if (iptv) {
          const stored = JSON.parse(iptv) as IPTVChannel[];
          setIptvChannelsState(stored);
          if (stored.length === 0) {
            setIsLoadingPlaylist(true);
            const native = await fetchNativePlaylist();
            if (native.length > 0) {
              setIptvChannelsState(native);
              await AsyncStorage.setItem("nexora_iptv_channels", JSON.stringify(native));
            }
            setIsLoadingPlaylist(false);
          }
        } else {
          setIsLoadingPlaylist(true);
          const native = await fetchNativePlaylist();
          if (native.length > 0) {
            setIptvChannelsState(native);
            await AsyncStorage.setItem("nexora_iptv_channels", JSON.stringify(native));
          }
          setIsLoadingPlaylist(false);
        }
      } catch {
        setIsLoadingPlaylist(false);
      }
    };

    load();
  }, []);

  const toggleFavorite = async (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      AsyncStorage.setItem("nexora_favorites", JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };

  const isFavorite = (id: string) => favorites.includes(id);

  const addToHistory = async (item: WatchedItem) => {
    const next = [item, ...watchHistory.filter(h => h.id !== item.id)].slice(0, 50);
    setWatchHistory(next);
    await AsyncStorage.setItem("nexora_history", JSON.stringify(next));
    // Bridge to user-state-service so mood derivation and continueWatching work
    if (item.duration && item.duration > 0) {
      trackWatchProgress({
        contentId: item.contentId ?? item.id,
        mediaType: item.type as "movie" | "series" | "channel" | "sport",
        title: item.title,
        posterUri: item.poster ?? null,
        progress: item.progress ?? 0,
        currentTime: item.currentTime ?? 0,
        duration: item.duration,
        season: item.season ?? null,
        episode: item.episode ?? null,
        episodeTitle: item.episodeTitle ?? null,
        lastWatchedAt: item.lastWatched,
        tmdbId: item.tmdbId ?? null,
        year: item.year ?? null,
        // Extra fields preserved by user-state-service spread
        ...(item.backdrop ? { backdropUri: item.backdrop } : {}),
        ...(item.genre_ids?.length ? { genreIds: item.genre_ids } : {}),
      } as Parameters<typeof trackWatchProgress>[0]).catch(() => {/* non-fatal */});
    }
  };

  const updateProgress = async (id: string, currentTime: number, duration: number) => {
    if (!id || !duration || duration <= 0) return;
    const progress = Math.min(1, Math.max(0, currentTime / duration));
    const idx = watchHistory.findIndex(h => h.id === id || h.contentId === id);
    if (idx < 0) return;
    const updated = { ...watchHistory[idx], progress, currentTime, duration, lastWatched: new Date().toISOString() };
    const next = [updated, ...watchHistory.filter(h => h.id !== id)].slice(0, 50);
    setWatchHistory(next);
    await AsyncStorage.setItem("nexora_history", JSON.stringify(next));
    // Bridge to user-state-service
    trackWatchProgress({
      contentId: updated.contentId ?? updated.id,
      mediaType: updated.type as "movie" | "series" | "channel" | "sport",
      title: updated.title,
      posterUri: updated.poster ?? null,
      progress,
      currentTime,
      duration,
      season: updated.season ?? null,
      episode: updated.episode ?? null,
      episodeTitle: updated.episodeTitle ?? null,
      lastWatchedAt: updated.lastWatched,
      tmdbId: updated.tmdbId ?? null,
      year: updated.year ?? null,
      ...(updated.backdrop ? { backdropUri: updated.backdrop } : {}),
      ...(updated.genre_ids?.length ? { genreIds: updated.genre_ids } : {}),
    } as Parameters<typeof trackWatchProgress>[0]).catch(() => {/* non-fatal */});
  };

  const clearHistory = async () => {
    setWatchHistory([]);
    await AsyncStorage.removeItem("nexora_history");
  };

  const normalizeUrl = (url: string): string => {
    if (!url) return url;
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.includes(".") || trimmed.includes(":")) return `http://${trimmed}`;
    return trimmed;
  };

  const addPlaylist = async (playlist: Omit<IPTVPlaylist, "id" | "addedAt">): Promise<IPTVPlaylist> => {
    const newPl: IPTVPlaylist = { ...playlist, url: normalizeUrl((playlist as any).url || ""), id: `pl_${Date.now()}`, addedAt: new Date().toISOString() };
    const next = [...playlists, newPl];
    setPlaylists(next);
    await AsyncStorage.setItem("nexora_playlists", JSON.stringify(next));
    return newPl;
  };

  const updatePlaylist = async (id: string, updates: Partial<IPTVPlaylist>) => {
    const next = playlists.map(p => p.id === id ? { ...p, ...updates } : p);
    setPlaylists(next);
    await AsyncStorage.setItem("nexora_playlists", JSON.stringify(next));
  };

  const removePlaylist = async (id: string) => {
    const next = playlists.filter(p => p.id !== id);
    setPlaylists(next);
    await AsyncStorage.setItem("nexora_playlists", JSON.stringify(next));
    const nextCh = iptvChannels.filter(c => c.playlistId !== id);
    setIptvChannelsState(nextCh);
    await AsyncStorage.setItem("nexora_iptv_channels", JSON.stringify(nextCh));
  };

  const setIptvChannelsForPlaylist = async (playlistId: string, channels: IPTVChannel[]) => {
    const withId = channels.map(c => ({ ...c, playlistId }));
    const next = [...iptvChannels.filter(c => c.playlistId !== playlistId), ...withId];
    setIptvChannelsState(next);
    // Strip heavy fields to stay under AsyncStorage 5MB limit
    const slim = next.map(({ synopsis: _s, backdrop: _b, ...rest }) => rest);
    try {
      await AsyncStorage.setItem("nexora_iptv_channels", JSON.stringify(slim));
    } catch {
      // Fallback: persist a smaller subset when storage quota is exceeded.
      // Keep the full in-memory state so playback still works in current session.
      const MAX_PERSISTED = 3500;
      const compact = slim.slice(0, MAX_PERSISTED);
      try {
        await AsyncStorage.setItem("nexora_iptv_channels", JSON.stringify(compact));
      } catch {
        // Last resort: keep runtime state only.
      }
    }
  };

  const toggleHideChannel = async (id: string) => {
    const next = hiddenChannels.includes(id) ? hiddenChannels.filter(h => h !== id) : [...hiddenChannels, id];
    setHiddenChannels(next);
    await AsyncStorage.setItem("nexora_hidden_channels", JSON.stringify(next));
  };

  const toggleHideGroup = async (group: string) => {
    const next = hiddenGroups.includes(group) ? hiddenGroups.filter(g => g !== group) : [...hiddenGroups, group];
    setHiddenGroups(next);
    await AsyncStorage.setItem("nexora_hidden_groups", JSON.stringify(next));
  };

  const isChannelVisible = (id: string, group: string) =>
    !hiddenChannels.includes(id) && !hiddenGroups.includes(group);

  const setSelectedQuality = async (q: "4K" | "FHD" | "HD" | "Auto") => {
    setSelectedQualityState(q);
    await AsyncStorage.setItem("nexora_quality", q);
  };

  const setSubtitlesEnabled = async (v: boolean) => {
    setSubtitlesEnabledState(v);
    await AsyncStorage.setItem("nexora_subtitles", String(v));
  };

  const setAudioLanguage = async (lang: string) => {
    setAudioLanguageState(lang);
    await AsyncStorage.setItem("nexora_audio_lang", lang);
  };

  const setUiLanguage = async (lang: Language) => {
    setUiLanguageState(lang);
    setI18nLanguage(lang);
    await AsyncStorage.setItem("nexora_ui_lang", lang);
  };

  const setAutoplayEnabled = async (v: boolean) => {
    setAutoplayEnabledState(v);
    await AsyncStorage.setItem("nexora_autoplay", String(v));
  };

  const setDownloadOverWifi = async (v: boolean) => {
    setDownloadOverWifiState(v);
    await AsyncStorage.setItem("nexora_dl_wifi", String(v));
  };

  const setNotificationsEnabled = async (v: boolean) => {
    setNotificationsEnabledState(v);
    await AsyncStorage.setItem("nexora_notif", String(v));
  };

  const setParentalPin = async (pin: string | null) => {
    setParentalPinState(pin);
    if (pin) await AsyncStorage.setItem("nexora_pin", pin);
    else await AsyncStorage.removeItem("nexora_pin");
  };

  const setActiveProfile = async (name: string) => {
    setActiveProfileState(name);
    await AsyncStorage.setItem("nexora_profile", name);
  };

  const setAvatarUri = async (uri: string | null) => {
    setAvatarUriState(uri);
    if (uri) await AsyncStorage.setItem("nexora_avatar", uri);
    else await AsyncStorage.removeItem("nexora_avatar");
  };

  const saveCats = async (cats: PremiumCategory[]) => {
    setPremiumCategoriesState(cats);
    await AsyncStorage.setItem("nexora_premium_cats", JSON.stringify(cats));
    if (ALL_CATS.every(c => cats.includes(c))) {
      await AsyncStorage.setItem("nexora_premium", "true");
    } else {
      await AsyncStorage.removeItem("nexora_premium");
    }
  };

  const activatePremiumCategories = async (cats: PremiumCategory[]) => {
    const merged = Array.from(new Set([...premiumCategories, ...cats])) as PremiumCategory[];
    await saveCats(merged);
  };

  const activatePremium = async () => { await saveCats(ALL_CATS); };

  const deactivatePremium = async () => {
    setPremiumCategoriesState([]);
    await AsyncStorage.removeItem("nexora_premium_cats");
    await AsyncStorage.removeItem("nexora_premium");
  };

  const addDownload = async (item: DownloadedItem) => {
    const next = [item, ...downloads.filter(d => d.contentId !== item.contentId)];
    setDownloads(next);
    await AsyncStorage.setItem("nexora_downloads", JSON.stringify(next));
  };

  const removeDownload = async (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (item?.filePath) {
      try { await FileSystem.deleteAsync(item.filePath, { idempotent: true }); } catch {}
    }
    const next = downloads.filter(d => d.id !== id);
    setDownloads(next);
    await AsyncStorage.setItem("nexora_downloads", JSON.stringify(next));
  };

  const isDownloaded = (contentId: string) => downloads.some(d => d.contentId === contentId);
  const getDownload = (contentId: string) => downloads.find(d => d.contentId === contentId);

  const resetAll = async () => {
    const keys = [
      "nexora_favorites", "nexora_hidden_channels", "nexora_hidden_groups",
      "nexora_history", "nexora_watch_history", "nexora_iptv_channels",
      "nexora_playlists", "nexora_pin", "nexora_profile", "nexora_quality",
      "nexora_subtitles", "nexora_premium", "nexora_premium_cats",
      "nexora_audio_lang", "nexora_autoplay", "nexora_dl_wifi", "nexora_notif",
      "nexora_schema_v2", "nexora_schema_v3", "nexora_downloads", "nexora_ui_lang",
    ];
    try {
      await AsyncStorage.multiRemove(keys);
    } catch {
      try { await AsyncStorage.clear(); } catch {}
    }
    setFavorites([]);
    setWatchHistory([]);
    setPlaylists([]);
    setIptvChannelsState([]);
    setHiddenChannels([]);
    setHiddenGroups([]);
    setSelectedQualityState("Auto");
    setSubtitlesEnabledState(false);
    setAudioLanguageState("auto");
    setUiLanguageState("en");
    setI18nLanguage("en");
    setAutoplayEnabledState(true);
    setDownloadOverWifiState(true);
    setNotificationsEnabledState(true);
    setParentalPinState(null);
    setActiveProfileState("Main");
    setPremiumCategoriesState([]);
    setDownloads([]);
    setAvatarUriState(null);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      setTimeout(() => window.location.reload(), 300);
    }
  };

  const value = useMemo(() => ({
    favorites, toggleFavorite, isFavorite,
    watchHistory, addToHistory, updateProgress, clearHistory,
    playlists, addPlaylist, removePlaylist, updatePlaylist,
    iptvChannels, isLoadingPlaylist, setIptvChannelsForPlaylist,
    hiddenChannels, toggleHideChannel,
    hiddenGroups, toggleHideGroup, isChannelVisible,
    selectedQuality, setSelectedQuality,
    subtitlesEnabled, setSubtitlesEnabled,
    audioLanguage, setAudioLanguage,
    uiLanguage, setUiLanguage,
    autoplayEnabled, setAutoplayEnabled,
    downloadOverWifi, setDownloadOverWifi,
    notificationsEnabled, setNotificationsEnabled,
    parentalPin, setParentalPin,
    activeProfile, setActiveProfile, profiles, avatarUri, setAvatarUri,
    isPremium, premiumCategories, hasPremium,
    activatePremium, deactivatePremium, activatePremiumCategories,
    downloads, addDownload, removeDownload, isDownloaded, getDownload,
    resetAll,
  }), [favorites, watchHistory, playlists, iptvChannels, isLoadingPlaylist, hiddenChannels, hiddenGroups,
       selectedQuality, subtitlesEnabled, audioLanguage, uiLanguage, autoplayEnabled, downloadOverWifi,
       notificationsEnabled, parentalPin, activeProfile, premiumCategories, downloads, avatarUri]);

  return <NexoraContext.Provider value={value}>{children}</NexoraContext.Provider>;
}

export function useNexora() {
  const ctx = useContext(NexoraContext);
  if (!ctx) throw new Error("useNexora must be used within NexoraProvider");
  return ctx;
}
