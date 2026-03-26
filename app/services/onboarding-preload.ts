import { queryClient, apiRequestJson } from "@/lib/query-client";
import type { CompetitionPreference, SportPreferenceKey, TeamPreference } from "@/services/onboarding-storage";
import { logStartupEvent, runStartupTask } from "@/services/startup-orchestrator";

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

const BASE_PHASES: PreloadPhase[] = [
  { id: "sports-day", label: "Loading matchday intelligence", weight: 20 },
  { id: "sports-live", label: "Priming live scores", weight: 16 },
  { id: "highlights", label: "Caching highlights", weight: 12 },
  { id: "competitions", label: "Preparing standings and league context", weight: 24 },
  { id: "teams", label: "Warming favorite team context", weight: 14 },
  { id: "movies", label: "Preparing movie and series rails", weight: 14 },
];

const PHASE_TIMEOUT_MS: Record<PreloadPhase["id"], number> = {
  "sports-day": 4000,
  "sports-live": 4000,
  highlights: 4000,
  competitions: 6500,
  teams: 5000,
  movies: 4000,
};

let activePreload: Promise<void> | null = null;

function emitProgress(
  phases: PreloadPhase[],
  completedIds: Set<string>,
  onProgress?: (status: PreloadStatus) => void,
  overrideMessage?: string,
) {
  const totalWeight = phases.reduce((sum, phase) => sum + phase.weight, 0);
  const completedWeight = phases.reduce((sum, phase) => sum + (completedIds.has(phase.id) ? phase.weight : 0), 0);
  const rawProgress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  const progress = overrideMessage === "Starting background setup"
    ? Math.max(8, rawProgress)
    : rawProgress;
  const nextPhase = phases.find((phase) => !completedIds.has(phase.id));
  onProgress?.({
    progress,
    message: overrideMessage || nextPhase?.label || "Experience ready",
    completed: completedIds.size,
    total: phases.length,
  });
}

async function safePrefetchQuery(key: readonly unknown[], path: string): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: key,
    staleTime: 30_000,
    queryFn: async () => apiRequestJson(path),
  });
}

async function preloadCompetitionBundle(competition: CompetitionPreference): Promise<void> {
  const league = encodeURIComponent(competition.name);
  const espn = competition.espnLeague ? `&league=${encodeURIComponent(competition.espnLeague)}` : "";
  await Promise.allSettled([
    safePrefetchQuery(["standings", competition.name, competition.espnLeague || ""], `/api/sports/standings/${league}?sport=soccer${espn}`),
    safePrefetchQuery(["competition-matches", competition.name], `/api/sports/competition-matches/${league}`),
    safePrefetchQuery(["competition-teams", competition.name], `/api/sports/competition-teams/${league}`),
  ]);
}

async function preloadTeamProfiles(teams: TeamPreference[], competitions: CompetitionPreference[]): Promise<void> {
  const leagueFallback = competitions[0]?.espnLeague || "eng.1";
  await Promise.allSettled(
    teams.slice(0, 6).map((team) => {
      const league = encodeURIComponent(team.competition || leagueFallback || "eng.1");
      const nameToken = encodeURIComponent(`name:${team.name}`);
      return safePrefetchQuery(["team-detail", team.id], `/api/sports/team/${nameToken}?league=${league}`);
    }),
  );
}

async function runPreloadPhase(
  phase: PreloadPhase,
  task: () => Promise<void>,
  onProgress?: (status: PreloadStatus) => void,
  phases?: PreloadPhase[],
  completedIds?: Set<string>,
): Promise<void> {
  const result = await runStartupTask({
    scope: "onboarding-preload",
    name: phase.id,
    timeoutMs: PHASE_TIMEOUT_MS[phase.id],
    run: task,
  });

  if (result.status !== "success") {
    logStartupEvent("onboarding-preload", "warn", `Skipping blocked preload phase: ${phase.id}`, {
      status: result.status,
      error: result.error,
      durationMs: result.durationMs,
    });
  }

  if (phases && completedIds) {
    completedIds.add(phase.id);
    emitProgress(phases, completedIds, onProgress);
  }
}

export function startOnboardingPreload(request: PreloadRequest): Promise<void> {
  if (activePreload) return activePreload;

  activePreload = (async () => {
    const phases = BASE_PHASES.filter((phase) => {
      if (phase.id === "movies") return request.moviesEnabled;
      if (["sports-day", "sports-live", "highlights", "competitions", "teams"].includes(phase.id)) return request.sportsEnabled;
      return true;
    });
    const done = new Set<string>();

    if (phases.length === 0) {
      logStartupEvent("onboarding-preload", "info", "No preload phases required for current module selection");
      request.onProgress?.({
        progress: 100,
        message: "Experience ready",
        completed: 0,
        total: 0,
      });
      return;
    }

    emitProgress(phases, done, request.onProgress, "Starting background setup");
    logStartupEvent("onboarding-preload", "info", "Starting onboarding preload", {
      phaseCount: phases.length,
      sportsEnabled: request.sportsEnabled,
      moviesEnabled: request.moviesEnabled,
    });

    const today = new Date().toISOString().slice(0, 10);

    if (request.sportsEnabled) {
      const sportsDayPhase = phases.find((phase) => phase.id === "sports-day");
      if (sportsDayPhase) {
        await runPreloadPhase(
          sportsDayPhase,
          async () => {
            await Promise.allSettled([
              safePrefetchQuery(["sports", "today", today], `/api/sports/by-date?date=${today}`),
            ]);
          },
          request.onProgress,
          phases,
          done,
        );
      }

      const sportsLivePhase = phases.find((phase) => phase.id === "sports-live");
      if (sportsLivePhase) {
        await runPreloadPhase(
          sportsLivePhase,
          async () => {
            await Promise.allSettled([
              safePrefetchQuery(["sports", "live", today], `/api/sports/live?date=${today}`),
            ]);
          },
          request.onProgress,
          phases,
          done,
        );
      }

      const highlightsPhase = phases.find((phase) => phase.id === "highlights");
      if (highlightsPhase) {
        await runPreloadPhase(
          highlightsPhase,
          async () => {
            await Promise.allSettled([
              safePrefetchQuery(["sports", "highlights"], `/api/sports/highlights`),
            ]);
          },
          request.onProgress,
          phases,
          done,
        );
      }

      const competitionsPhase = phases.find((phase) => phase.id === "competitions");
      if (competitionsPhase) {
        await runPreloadPhase(
          competitionsPhase,
          async () => {
            await Promise.allSettled(request.competitions.slice(0, 5).map((competition) => preloadCompetitionBundle(competition)));
          },
          request.onProgress,
          phases,
          done,
        );
      }

      const teamsPhase = phases.find((phase) => phase.id === "teams");
      if (teamsPhase) {
        await runPreloadPhase(
          teamsPhase,
          async () => {
            await preloadTeamProfiles(request.teams, request.competitions);
          },
          request.onProgress,
          phases,
          done,
        );
      }
    }

    if (request.moviesEnabled) {
      const moviesPhase = phases.find((phase) => phase.id === "movies");
      if (moviesPhase) {
        await runPreloadPhase(
          moviesPhase,
          async () => {
            await Promise.allSettled([
              safePrefetchQuery(["movies", "trending"], `/api/movies/trending`),
              safePrefetchQuery(["series", "trending"], `/api/series/trending`),
            ]);
          },
          request.onProgress,
          phases,
          done,
        );
      }
    }

    logStartupEvent("onboarding-preload", "info", "Onboarding preload finished", {
      completed: done.size,
      total: phases.length,
    });
    emitProgress(phases, new Set(phases.map((phase) => phase.id)), request.onProgress, "Experience ready");
  })().finally(() => {
    activePreload = null;
  });

  return activePreload;
}