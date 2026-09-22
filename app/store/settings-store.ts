/**
 * CineLog — app preferences.
 *
 * Appearance, language, notification opt-ins and privacy toggles. CineLog is
 * dark-mode first; "light" and "system" are supported for accessibility.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_STREAM_PREFERENCES,
  defaultProviderConfig,
} from "@/lib/streaming/config";
import type {
  ProviderRuntimeConfig,
  ResolutionTier,
  StreamProviderId,
  UserStreamPreferences,
} from "@/lib/streaming/types";

export type ThemeMode = "dark" | "light" | "system";
export type LanguageCode = "en" | "nl" | "fr";

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands" },
  { code: "fr", label: "Français" },
];

export interface NotificationPrefs {
  newReleases: boolean;
  recommendations: boolean;
  watchlistReminders: boolean;
}

export interface PrivacyPrefs {
  /** When off, watch history stops being recorded for recommendations. */
  saveWatchHistory: boolean;
  /** Whether the profile is discoverable by other viewers. */
  publicProfile: boolean;
}

export interface SettingsState {
  theme: ThemeMode;
  language: LanguageCode;
  notifications: NotificationPrefs;
  privacy: PrivacyPrefs;
  streamPrefs: UserStreamPreferences;
  streamProviders: Record<StreamProviderId, ProviderRuntimeConfig>;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: LanguageCode) => void;
  setNotification: (key: keyof NotificationPrefs, value: boolean) => void;
  setPrivacy: (key: keyof PrivacyPrefs, value: boolean) => void;
  setStreamPref: <K extends keyof UserStreamPreferences>(
    key: K,
    value: UserStreamPreferences[K],
  ) => void;
  setStreamProviderEndpoint: (id: StreamProviderId, endpoint: string) => void;
  setStreamProviderEnabled: (id: StreamProviderId, enabled: boolean) => void;
  setStreamProviderTimeout: (id: StreamProviderId, timeoutMs: number) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      language: "en",
      notifications: {
        newReleases: true,
        recommendations: true,
        watchlistReminders: false,
      },
      privacy: {
        saveWatchHistory: true,
        publicProfile: false,
      },
      streamPrefs: { ...DEFAULT_STREAM_PREFERENCES },
      streamProviders: {
        torrentio: defaultProviderConfig("torrentio"),
        comet: defaultProviderConfig("comet"),
        meteor: defaultProviderConfig("meteor"),
      },
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setNotification: (key, value) =>
        set((state) => ({
          notifications: { ...state.notifications, [key]: value },
        })),
      setPrivacy: (key, value) =>
        set((state) => ({ privacy: { ...state.privacy, [key]: value } })),
      setStreamPref: (key, value) =>
        set((state) => ({ streamPrefs: { ...state.streamPrefs, [key]: value } })),
      setStreamProviderEndpoint: (id, endpoint) =>
        set((state) => ({
          streamProviders: {
            ...state.streamProviders,
            [id]: { ...state.streamProviders[id], endpoint: endpoint.trim() },
          },
        })),
      setStreamProviderEnabled: (id, enabled) =>
        set((state) => ({
          streamProviders: {
            ...state.streamProviders,
            [id]: { ...state.streamProviders[id], enabled },
          },
        })),
      setStreamProviderTimeout: (id, timeoutMs) =>
        set((state) => ({
          streamProviders: {
            ...state.streamProviders,
            [id]: { ...state.streamProviders[id], timeoutMs },
          },
        })),
    }),
    {
      name: "cinelog.settings.v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...state,
          streamPrefs: state.streamPrefs ?? { ...DEFAULT_STREAM_PREFERENCES },
          streamProviders:
            state.streamProviders ?? {
              torrentio: defaultProviderConfig("torrentio"),
              comet: defaultProviderConfig("comet"),
              meteor: defaultProviderConfig("meteor"),
            },
        } as SettingsState;
      },
    },
  ),
);

export type { ResolutionTier };

