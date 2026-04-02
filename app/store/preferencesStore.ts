// DEPRECATED: language state lives in NexoraContext.uiLanguage (AsyncStorage-persisted).
// No-op stub for import compatibility — setLanguage calls are ignored here.
import { create } from "zustand";
type PreferencesState = { language: "en" | "nl"; setLanguage: (l: "en" | "nl") => void; };
export const usePreferencesStore = create<PreferencesState>(() => ({ language: "nl", setLanguage: () => {} }));
