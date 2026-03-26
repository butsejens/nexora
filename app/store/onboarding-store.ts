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
  setSelectedSports: (sports: SportPreferenceKey[]) => void;
  toggleSport: (sport: SportPreferenceKey) => void;
  toggleTeam: (team: TeamPreference) => void;
  toggleCompetition: (competition: CompetitionPreference) => void;
  setNotifications: (notifications: Partial<NotificationPreferenceState>) => void;
  setPreloadState: (partial: Partial<PreloadState>) => void;
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
  selectedSports: ["football"] as SportPreferenceKey[],
  selectedTeams: [] as TeamPreference[],
  selectedCompetitions: [] as CompetitionPreference[],
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  preload: defaultPreload,
};

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
      })),
      setMoviesEnabled: (value) => set({ moviesEnabled: value }),
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