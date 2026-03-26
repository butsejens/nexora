export const ONBOARDING_STORAGE_KEY = "nexora.onboarding.v2";

export type OnboardingModuleKey = "sports" | "movies";

export type SportPreferenceKey = "football" | "basketball" | "tennis" | "mma" | "motorsport";

export type TeamPreference = {
  id: string;
  name: string;
  sport: SportPreferenceKey;
  region?: string;
  competition?: string;
};

export type CompetitionPreference = {
  id: string;
  name: string;
  sport: SportPreferenceKey;
  region?: string;
  espnLeague?: string | null;
};

export type NotificationPreferenceState = {
  goals: boolean;
  matches: boolean;
  lineups: boolean;
  news: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceState = {
  goals: true,
  matches: true,
  lineups: true,
  news: false,
};