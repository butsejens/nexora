/**
 * Module Preferences & Toggles
 * Control which features are enabled/disabled
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ModulePreferences {
  sportsEnabled: boolean;
  moviesEnabled: boolean;
  tvShowsEnabled: boolean;
  animeEnabled: boolean;
  mangaEnabled: boolean;
  musicEnabled: boolean;
  notificationsEnabled: boolean;

  // Personalization
  favoriteTeams: string[]; // Team IDs
  favoriteCompetitions: string[]; // Competition IDs
  favoriteGenres: string[]; // Genre IDs
  userCountry?: string;
  userLanguage?: string;

  // Onboarding
  onboardingCompleted: boolean;
  onboardingVersion: number;

  // Visibility filters
  hiddenSports?: string[];
}

const DEFAULT_PREFERENCES: ModulePreferences = {
  sportsEnabled: true,
  moviesEnabled: true,
  tvShowsEnabled: true,
  animeEnabled: false,
  mangaEnabled: false,
  musicEnabled: false,
  notificationsEnabled: true,
  favoriteTeams: [],
  favoriteCompetitions: [],
  favoriteGenres: [],
  onboardingCompleted: false,
  onboardingVersion: 1,
};

interface ModuleStore {
  preferences: ModulePreferences;
  isLoading: boolean;
  initializePreferences: () => Promise<void>;
  setPreferences: (prefs: Partial<ModulePreferences>) => Promise<void>;
  toggleModule: (module: keyof ModulePreferences) => Promise<void>;
  addFavoriteTeam: (teamId: string) => Promise<void>;
  removeFavoriteTeam: (teamId: string) => Promise<void>;
  addFavoriteCompetition: (competitionId: string) => Promise<void>;
  removeFavoriteCompetition: (competitionId: string) => Promise<void>;
  addFavoriteGenre: (genreId: string) => Promise<void>;
  removeFavoriteGenre: (genreId: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useModulePreferences = create<ModuleStore>()(
  persist(
    (set, get) => ({
      preferences: DEFAULT_PREFERENCES,
      isLoading: true,

      initializePreferences: async () => {
        try {
          const stored = await AsyncStorage.getItem('nexora_module_prefs');
          if (stored) {
            const parsed = JSON.parse(stored);
            set({ preferences: { ...DEFAULT_PREFERENCES, ...parsed }, isLoading: false });
          } else {
            set({ preferences: DEFAULT_PREFERENCES, isLoading: false });
          }
        } catch (error) {
          console.error('Failed to load module preferences:', error);
          set({ preferences: DEFAULT_PREFERENCES, isLoading: false });
        }
      },

      setPreferences: async (newPrefs) => {
        const current = get().preferences;
        const updated = { ...current, ...newPrefs };
        set({ preferences: updated });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to save module preferences:', error);
        }
      },

      toggleModule: async (module) => {
        const current = get().preferences;
        const updated = {
          ...current,
          [module]: !current[module as keyof ModulePreferences],
        };
        set({ preferences: updated });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to toggle module:', error);
        }
      },

      addFavoriteTeam: async (teamId) => {
        const current = get().preferences;
        if (!current.favoriteTeams.includes(teamId)) {
          const updated = {
            ...current,
            favoriteTeams: [...current.favoriteTeams, teamId],
          };
          set({ preferences: updated });
          try {
            await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
          } catch (error) {
            console.error('Failed to add favorite team:', error);
          }
        }
      },

      removeFavoriteTeam: async (teamId) => {
        const current = get().preferences;
        const updated = {
          ...current,
          favoriteTeams: current.favoriteTeams.filter((id) => id !== teamId),
        };
        set({ preferences: updated });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to remove favorite team:', error);
        }
      },

      addFavoriteCompetition: async (competitionId) => {
        const current = get().preferences;
        if (!current.favoriteCompetitions.includes(competitionId)) {
          const updated = {
            ...current,
            favoriteCompetitions: [...current.favoriteCompetitions, competitionId],
          };
          set({ preferences: updated });
          try {
            await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
          } catch (error) {
            console.error('Failed to add favorite competition:', error);
          }
        }
      },

      removeFavoriteCompetition: async (competitionId) => {
        const current = get().preferences;
        const updated = {
          ...current,
          favoriteCompetitions: current.favoriteCompetitions.filter(
            (id) => id !== competitionId
          ),
        };
        set({ preferences: updated });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to remove favorite competition:', error);
        }
      },

      addFavoriteGenre: async (genreId) => {
        const current = get().preferences;
        if (!current.favoriteGenres.includes(genreId)) {
          const updated = {
            ...current,
            favoriteGenres: [...current.favoriteGenres, genreId],
          };
          set({ preferences: updated });
          try {
            await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
          } catch (error) {
            console.error('Failed to add favorite genre:', error);
          }
        }
      },

      removeFavoriteGenre: async (genreId) => {
        const current = get().preferences;
        const updated = {
          ...current,
          favoriteGenres: current.favoriteGenres.filter((id) => id !== genreId),
        };
        set({ preferences: updated });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to remove favorite genre:', error);
        }
      },

      completeOnboarding: async () => {
        const current = get().preferences;
        const updated = {
          ...current,
          onboardingCompleted: true,
        };
        set({ preferences: updated });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to mark onboarding complete:', error);
        }
      },

      resetToDefaults: async () => {
        set({ preferences: DEFAULT_PREFERENCES });
        try {
          await AsyncStorage.setItem('nexora_module_prefs', JSON.stringify(DEFAULT_PREFERENCES));
        } catch (error) {
          console.error('Failed to reset preferences:', error);
        }
      },
    }),
    {
      name: 'nexora-module-prefs',
      storage: {
        getItem: async (key) => {
          const value = await AsyncStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (key, value) => {
          await AsyncStorage.setItem(key, JSON.stringify(value));
        },
        removeItem: async (key) => {
          await AsyncStorage.removeItem(key);
        },
      },
    }
  )
);
