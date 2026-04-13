/**
 * Nexora — Profile Store
 * Manages multi-profile support (Netflix / VTM GO style).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface NexoraProfile {
  id: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  isKids: boolean;
  birthdate?: string; // dd/mm/yyyy
  gender?: "man" | "vrouw" | "x" | null;
}

const DEFAULT_PROFILES: NexoraProfile[] = [
  {
    id: "main",
    name: "Mijn profiel",
    avatarEmoji: "🎬",
    avatarColor: "#7C3AED",
    isKids: false,
  },
  {
    id: "kids",
    name: "Kids",
    avatarEmoji: "🦄",
    avatarColor: "#10B981",
    isKids: true,
  },
];

export const AVATAR_COLORS = [
  "#3B9EDB", // blue
  "#22A861", // green
  "#3B5EDB", // cobalt
  "#7C3AED", // purple
  "#D4922A", // gold
  "#C026D3", // magenta
  "#E07020", // orange
  "#C9234A", // crimson
];

export const AVATAR_EMOJIS = [
  "🎬",
  "🦁",
  "🐯",
  "🦊",
  "🐼",
  "🐸",
  "🦄",
  "🐉",
  "🎮",
  "🚀",
  "🌟",
  "🎵",
  "🔥",
  "⚡",
  "🌈",
  "🎭",
];

interface ProfileState {
  profiles: NexoraProfile[];
  activeProfileId: string | null;
  hasHydrated: boolean;
  /** Set to true once user has picked a profile in this session */
  hasPickedProfile: boolean;

  getActiveProfile: () => NexoraProfile | undefined;
  setActiveProfile: (id: string) => void;
  addProfile: (profile: Omit<NexoraProfile, "id">) => NexoraProfile;
  updateProfile: (
    id: string,
    updates: Partial<Omit<NexoraProfile, "id">>,
  ) => void;
  deleteProfile: (id: string) => void;
  setHasPickedProfile: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: DEFAULT_PROFILES,
      activeProfileId: null,
      hasHydrated: false,
      hasPickedProfile: false,

      getActiveProfile() {
        const { profiles, activeProfileId } = get();
        return profiles.find((p) => p.id === activeProfileId);
      },

      setActiveProfile(id) {
        set({ activeProfileId: id, hasPickedProfile: true });
      },

      addProfile(profileData) {
        const newProfile: NexoraProfile = {
          ...profileData,
          id: `profile_${Date.now()}`,
        };
        set((s) => ({ profiles: [...s.profiles, newProfile] }));
        return newProfile;
      },

      updateProfile(id, updates) {
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        }));
      },

      deleteProfile(id) {
        set((s) => {
          const remaining = s.profiles.filter((p) => p.id !== id);
          const newActive =
            s.activeProfileId === id
              ? (remaining[0]?.id ?? null)
              : s.activeProfileId;
          return { profiles: remaining, activeProfileId: newActive };
        });
      },

      setHasPickedProfile(value) {
        set({ hasPickedProfile: value });
      },

      setHasHydrated(value) {
        set({ hasHydrated: value });
      },
    }),
    {
      name: "nexora-profiles",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (s) => ({
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
      }),
    },
  ),
);
