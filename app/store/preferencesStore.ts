import { create } from "zustand";

type PreferencesState = {
  language: "en" | "nl";
  setLanguage: (language: "en" | "nl") => void;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  language: "en",
  setLanguage: (language) => set({ language }),
}));
