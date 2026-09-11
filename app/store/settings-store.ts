/**
 * CineLog — app preferences.
 *
 * Appearance, language, notification opt-ins and privacy toggles. CineLog is
 * dark-mode first; "light" and "system" are supported for accessibility.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: LanguageCode) => void;
  setNotification: (key: keyof NotificationPrefs, value: boolean) => void;
  setPrivacy: (key: keyof PrivacyPrefs, value: boolean) => void;
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
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setNotification: (key, value) =>
        set((state) => ({
          notifications: { ...state.notifications, [key]: value },
        })),
      setPrivacy: (key, value) =>
        set((state) => ({ privacy: { ...state.privacy, [key]: value } })),
    }),
    {
      name: "cinelog.settings.v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
