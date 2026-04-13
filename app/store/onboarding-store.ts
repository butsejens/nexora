import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  ONBOARDING_STORAGE_KEY,
  type NotificationPreferenceState,
} from "@/services/onboarding-storage";

type PreloadState = {
  status: "idle" | "running" | "done";
  progress: number;
  message: string;
};

type OnboardingStore = {
  hasHydrated: boolean;
  hasCompletedOnboarding: boolean;
  isEditorOpen: boolean;
  moviesEnabled: boolean;
  notifications: NotificationPreferenceState;
  preload: PreloadState;
  setHasHydrated: (value: boolean) => void;
  openEditor: () => void;
  closeEditor: () => void;
  setMoviesEnabled: (value: boolean) => void;
  setNotifications: (
    notifications: Partial<NotificationPreferenceState>,
  ) => void;
  setPreloadState: (partial: Partial<PreloadState>) => void;
  recoverPersistedState: () => Promise<void>;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
};

const defaultPreload: PreloadState = {
  status: "idle",
  progress: 0,
  message: "Waiting to prepare your experience",
};

const defaultState = {
  hasCompletedOnboarding: false,
  isEditorOpen: false,
  moviesEnabled: true,
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  preload: defaultPreload,
};

function normalizePersistedState(raw: unknown) {
  const candidate =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const notificationsCandidate =
    candidate.notifications && typeof candidate.notifications === "object"
      ? (candidate.notifications as Partial<NotificationPreferenceState>)
      : {};

  return {
    hasCompletedOnboarding: Boolean(candidate.hasCompletedOnboarding),
    isEditorOpen: false,
    moviesEnabled:
      typeof candidate.moviesEnabled === "boolean"
        ? candidate.moviesEnabled
        : defaultState.moviesEnabled,
    notifications: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...notificationsCandidate,
    },
  };
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      ...defaultState,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      openEditor: () => set({ isEditorOpen: true }),
      closeEditor: () => set({ isEditorOpen: false }),
      setMoviesEnabled: (value) => set({ moviesEnabled: value }),
      setNotifications: (notifications) =>
        set((state) => ({
          notifications: { ...state.notifications, ...notifications },
        })),
      setPreloadState: (partial) =>
        set((state) => ({
          preload: { ...state.preload, ...partial },
        })),
      recoverPersistedState: async () => {
        try {
          const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
          if (!raw) {
            set({ hasHydrated: true });
            return;
          }
          const parsed = JSON.parse(raw) as { state?: unknown } | unknown;
          const persistedState = normalizePersistedState(
            parsed &&
              typeof parsed === "object" &&
              "state" in (parsed as Record<string, unknown>)
              ? (parsed as { state?: unknown }).state
              : parsed,
          );
          set({ ...persistedState, hasHydrated: true });
        } catch {
          set({ ...defaultState, hasHydrated: true });
        }
      },
      completeOnboarding: () =>
        set({
          hasCompletedOnboarding: true,
          isEditorOpen: false,
          preload: {
            status: "done",
            progress: 100,
            message: "Experience ready",
          },
        }),
      resetOnboarding: () =>
        set({
          ...defaultState,
          isEditorOpen: false,
        }),
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        isEditorOpen: state.isEditorOpen,
        moviesEnabled: state.moviesEnabled,
        notifications: state.notifications,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
