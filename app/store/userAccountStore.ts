/**
 * Nexora — User Account Store
 * Collects basic account info (name, age, email, language, accent color)
 * during first launch / after an app reset. Separate from the multi-profile
 * ("who's watching") system in profileStore.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { COLORS } from "@/constants/colors";
import type { Language } from "@/lib/i18n";

export interface UserAccountInfo {
  name: string;
  age: string;
  email: string;
  accentColor: string;
  language: Language;
  /** Onboarding genre picks (e.g. "action", "drama") — used to personalize home rails. */
  genres: string[];
}

interface UserAccountState {
  hasHydrated: boolean;
  hasCompletedAccountSetup: boolean;
  info: UserAccountInfo;
  setHasHydrated: (value: boolean) => void;
  updateAccountInfo: (partial: Partial<UserAccountInfo>) => void;
  completeAccountSetup: () => void;
  resetAccountSetup: () => void;
}

export const DEFAULT_ACCOUNT_INFO: UserAccountInfo = {
  name: "",
  age: "",
  email: "",
  accentColor: COLORS.accent,
  language: "nl",
  genres: [],
};

export const useUserAccountStore = create<UserAccountState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      hasCompletedAccountSetup: false,
      info: DEFAULT_ACCOUNT_INFO,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      updateAccountInfo: (partial) =>
        set((state) => ({ info: { ...state.info, ...partial } })),
      completeAccountSetup: () => set({ hasCompletedAccountSetup: true }),
      resetAccountSetup: () =>
        set({ hasCompletedAccountSetup: false, info: DEFAULT_ACCOUNT_INFO }),
    }),
    {
      name: "nexora-user-account",
      storage: createJSONStorage(() => AsyncStorage),
      // Deep-merge `info` so fields added after a user's first install
      // (e.g. `genres`) don't come back as `undefined` from old persisted state.
      merge: (persisted, current) => {
        const persistedState = (persisted as Partial<UserAccountState>) ?? {};
        return {
          ...current,
          ...persistedState,
          info: { ...current.info, ...persistedState.info },
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
