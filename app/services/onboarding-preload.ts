import type {
  CompetitionPreference,
  SportPreferenceKey,
  TeamPreference,
} from "@/services/onboarding-storage";

export type PreloadPhase = {
  id: string;
  label: string;
  weight: number;
};

export type PreloadStatus = {
  progress: number;
  message: string;
  completed: number;
  total: number;
};

export type PreloadRequest = {
  sportsEnabled: boolean;
  moviesEnabled: boolean;
  sports: SportPreferenceKey[];
  competitions: CompetitionPreference[];
  teams: TeamPreference[];
  onProgress?: (status: PreloadStatus) => void;
};

/**
 * Page-only loading mode:
 * onboarding no longer preloads hidden pages/modules.
 */
export function startOnboardingPreload(request: PreloadRequest): Promise<void> {
  request.onProgress?.({
    progress: 100,
    message: "Page-only mode active",
    completed: 0,
    total: 0,
  });

  if (__DEV__) {
    console.info("[page-only] onboarding preload disabled", {
      sportsEnabled: request.sportsEnabled,
      moviesEnabled: request.moviesEnabled,
      selectedSports: request.sports.length,
      selectedCompetitions: request.competitions.length,
      selectedTeams: request.teams.length,
    });
  }

  return Promise.resolve();
}
