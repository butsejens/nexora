import { queryClient, apiRequestJson } from "@/lib/query-client";
import type { CompetitionPreference, SportPreferenceKey, TeamPreference } from "@/services/onboarding-storage";

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
      request.onProgress?.({
        progress: 100,
        message: "Experience ready",
        completed: 0,
        total: 0,
      });
      return;
    }

    emitProgress(phases, done, request.onProgress, "Starting background setup");

    const today = new Date().toISOString().slice(0, 10);

    if (request.sportsEnabled) {
      await Promise.allSettled([
        safePrefetchQuery(["sports", "today", today], `/api/sports/by-date?date=${today}`),
      ]);
      done.add("sports-day");
      emitProgress(phases, done, request.onProgress);

      await Promise.allSettled([
        safePrefetchQuery(["sports", "live", today], `/api/sports/live?date=${today}`),
      ]);
      done.add("sports-live");
      emitProgress(phases, done, request.onProgress);

      await Promise.allSettled([
        safePrefetchQuery(["sports", "highlights"], `/api/sports/highlights`),
      ]);
      done.add("highlights");
      emitProgress(phases, done, request.onProgress);

      await Promise.allSettled(request.competitions.slice(0, 5).map((competition) => preloadCompetitionBundle(competition)));
      done.add("competitions");
      emitProgress(phases, done, request.onProgress);

      await preloadTeamProfiles(request.teams, request.competitions);
      done.add("teams");
      emitProgress(phases, done, request.onProgress);
    }

    if (request.moviesEnabled) {
      await Promise.allSettled([
        safePrefetchQuery(["movies", "trending"], `/api/movies/trending`),
        safePrefetchQuery(["series", "trending"], `/api/series/trending`),
      ]);
      done.add("movies");
      emitProgress(phases, done, request.onProgress);
    }

    emitProgress(phases, new Set(phases.map((phase) => phase.id)), request.onProgress, "Experience ready");
  })().finally(() => {
    activePreload = null;
  });

  return activePreload;
}