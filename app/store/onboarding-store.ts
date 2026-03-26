import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  ONBOARDING_STORAGE_KEY,
  type CompetitionPreference,
  type NotificationPreferenceState,
  type SportPreferenceKey,
  type TeamPreference,
} from "@/services/onboarding-storage";
import { getProductMode, type ProductMode } from "@/lib/module-config";

type PreloadState = {
  status: "idle" | "running" | "done";
  progress: number;
  message: string;
};

type OnboardingStore = {
  hasHydrated: boolean;
  hasCompletedOnboarding: boolean;
  isEditorOpen: boolean;
  sportsEnabled: boolean;
  moviesEnabled: boolean;
  iptvEnabled: boolean;
  productMode: ProductMode;
  selectedSports: SportPreferenceKey[];
  selectedTeams: TeamPreference[];
  selectedCompetitions: CompetitionPreference[];
  notifications: NotificationPreferenceState;
  preload: PreloadState;
  setHasHydrated: (value: boolean) => void;
  openEditor: () => void;
  closeEditor: () => void;
  setSportsEnabled: (value: boolean) => void;
  setMoviesEnabled: (value: boolean) => void;
  setIptvEnabled: (value: boolean) => void;
  setSelectedSports: (sports: SportPreferenceKey[]) => void;
  toggleSport: (sport: SportPreferenceKey) => void;
  toggleTeam: (team: TeamPreference) => void;
  toggleCompetition: (competition: CompetitionPreference) => void;
  setNotifications: (notifications: Partial<NotificationPreferenceState>) => void;
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
  sportsEnabled: true,
  moviesEnabled: true,
  iptvEnabled: true,
  productMode: "all" as ProductMode,
  selectedSports: ["football"] as SportPreferenceKey[],
  selectedTeams: [] as TeamPreference[],
  selectedCompetitions: [] as CompetitionPreference[],
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  preload: defaultPreload,
};

function normalizePersistedState(raw: unknown) {
  const candidate = raw && typeof raw === "object"
    ? (raw as Record<string, unknown>)
    : {};

  const notificationsCandidate = candidate.notifications && typeof candidate.notifications === "object"
    ? (candidate.notifications as Partial<NotificationPreferenceState>)
    : {};

  return {
    hasCompletedOnboarding: Boolean(candidate.hasCompletedOnboarding),
    isEditorOpen: false,
    sportsEnabled: typeof candidate.sportsEnabled === "boolean" ? candidate.sportsEnabled : defaultState.sportsEnabled,
    moviesEnabled: typeof candidate.moviesEnabled === "boolean" ? candidate.moviesEnabled : defaultState.moviesEnabled,
    iptvEnabled: typeof candidate.iptvEnabled === "boolean" ? candidate.iptvEnabled : defaultState.iptvEnabled,
    selectedSports: Array.isArray(candidate.selectedSports)
      ? candidate.selectedSports.filter((item): item is SportPreferenceKey => typeof item === "string")
      : defaultState.selectedSports,
    selectedTeams: Array.isArray(candidate.selectedTeams)
      ? candidate.selectedTeams.filter((item): item is TeamPreference => Boolean(item && typeof item === "object"))
      : defaultState.selectedTeams,
    selectedCompetitions: Array.isArray(candidate.selectedCompetitions)
      ? candidate.selectedCompetitions.filter((item): item is CompetitionPreference => Boolean(item && typeof item === "object"))
      : defaultState.selectedCompetitions,
    notifications: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...notificationsCandidate,
    },
    productMode: getProductMode({
      sportsEnabled: typeof candidate.sportsEnabled === "boolean" ? candidate.sportsEnabled : defaultState.sportsEnabled,
      moviesEnabled: typeof candidate.moviesEnabled === "boolean" ? candidate.moviesEnabled : defaultState.moviesEnabled,
      iptvEnabled: typeof candidate.iptvEnabled === "boolean" ? candidate.iptvEnabled : defaultState.iptvEnabled,
    }),
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
      setSportsEnabled: (value) => set((state) => ({
        sportsEnabled: value,
        selectedSports: value ? state.selectedSports : [],
        selectedTeams: value ? state.selectedTeams : [],
        selectedCompetitions: value ? state.selectedCompetitions : [],
        productMode: getProductMode({
          sportsEnabled: value,
          moviesEnabled: state.moviesEnabled,
          iptvEnabled: state.iptvEnabled,
        }),
      })),
      setMoviesEnabled: (value) => set((state) => ({
        moviesEnabled: value,
        productMode: getProductMode({
          sportsEnabled: state.sportsEnabled,
          moviesEnabled: value,
          iptvEnabled: state.iptvEnabled,
        }),
      })),
      setIptvEnabled: (value) => set((state) => ({
        iptvEnabled: value,
        productMode: getProductMode({
          sportsEnabled: state.sportsEnabled,
          moviesEnabled: state.moviesEnabled,
          iptvEnabled: value,
        }),
      })),
      setSelectedSports: (sports) => set({ selectedSports: sports }),
      toggleSport: (sport) => set((state) => ({
        selectedSports: state.selectedSports.includes(sport)
          ? state.selectedSports.filter((item) => item !== sport)
          : [...state.selectedSports, sport],
      })),
      toggleTeam: (team) => set((state) => {
        const exists = state.selectedTeams.some((item) => item.id === team.id);
        return {
          selectedTeams: exists
            ? state.selectedTeams.filter((item) => item.id !== team.id)
            : [...state.selectedTeams, team],
        };
      }),
      toggleCompetition: (competition) => set((state) => {
        const exists = state.selectedCompetitions.some((item) => item.id === competition.id);
        return {
          selectedCompetitions: exists
            ? state.selectedCompetitions.filter((item) => item.id !== competition.id)
            : [...state.selectedCompetitions, competition],
        };
      }),
      setNotifications: (notifications) => set((state) => ({
        notifications: { ...state.notifications, ...notifications },
      })),
      setPreloadState: (partial) => set((state) => ({
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
            parsed && typeof parsed === "object" && "state" in (parsed as Record<string, unknown>)
              ? (parsed as { state?: unknown }).state
              : parsed,
          );

          set({
            ...persistedState,
            productMode: getProductMode({
              sportsEnabled: persistedState.sportsEnabled,
              moviesEnabled: persistedState.moviesEnabled,
              iptvEnabled: persistedState.iptvEnabled,
            }),
            hasHydrated: true,
          });
        } catch {
          set({
            ...defaultState,
            hasHydrated: true,
          });
        }
      },
      completeOnboarding: () => set({
        hasCompletedOnboarding: true,
        isEditorOpen: false,
        preload: { status: "done", progress: 100, message: "Experience ready" },
      }),
      resetOnboarding: () => set({
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
        sportsEnabled: state.sportsEnabled,
        moviesEnabled: state.moviesEnabled,
        iptvEnabled: state.iptvEnabled,
        productMode: state.productMode,
        selectedSports: state.selectedSports,
        selectedTeams: state.selectedTeams,
        selectedCompetitions: state.selectedCompetitions,
        notifications: state.notifications,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);