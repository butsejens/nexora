import type { FollowedMatch, FollowedTeam } from "@/lib/domain/models";
import type {
  CompetitionPreference,
  NotificationPreferenceState,
  SportPreferenceKey,
  TeamPreference,
} from "@/services/onboarding-storage";

export type PersonalizationSportCategory =
  | "all"
  | "football"
  | "basketball"
  | "mma"
  | "motorsport"
  | "tennis"
  | "baseball"
  | "ice_hockey"
  | "other";

export interface PersonalizationSnapshot {
  sportsEnabled: boolean;
  moviesEnabled: boolean;
  notifications: NotificationPreferenceState;
  preferredSportCategories: PersonalizationSportCategory[];
  preferredSportCategory: PersonalizationSportCategory;
  preferredTeamIds: Set<string>;
  preferredTeamNames: Set<string>;
  preferredCompetitionIds: Set<string>;
  preferredCompetitionNames: Set<string>;
  preferredCompetitionLeagues: Set<string>;
  followedMatchIds: Set<string>;
  hasSportsPersonalization: boolean;
}

type PersonalizationInput = {
  sportsEnabled: boolean;
  moviesEnabled: boolean;
  notifications: NotificationPreferenceState;
  selectedSports: SportPreferenceKey[];
  selectedTeams: TeamPreference[];
  selectedCompetitions: CompetitionPreference[];
  followedTeams: FollowedTeam[];
  followedMatches: FollowedMatch[];
};

const SPORT_CATEGORY_MAP: Record<SportPreferenceKey, PersonalizationSportCategory> = {
  football: "football",
  basketball: "basketball",
  tennis: "tennis",
  mma: "mma",
  motorsport: "motorsport",
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getMatchSportCategory(match: any): PersonalizationSportCategory {
  const sport = normalizeText(match?.sport);
  const league = normalizeText(match?.league);
  const espnLeague = normalizeText(match?.espnLeague);

  if (
    sport === "football" ||
    sport === "soccer" ||
    espnLeague.startsWith("eng ") ||
    espnLeague.startsWith("esp ") ||
    espnLeague.startsWith("ger ") ||
    espnLeague.startsWith("ita ") ||
    espnLeague.startsWith("fra ") ||
    espnLeague.startsWith("bel ") ||
    espnLeague.startsWith("uefa ") ||
    league.includes("league") ||
    league.includes("liga") ||
    league.includes("champions") ||
    league.includes("cup")
  ) {
    return "football";
  }
  if (sport.includes("basketball") || league.includes("nba")) return "basketball";
  if (sport.includes("tennis") || league.includes("atp") || league.includes("wta")) return "tennis";
  if (sport.includes("mma") || sport.includes("ufc") || league.includes("ufc")) return "mma";
  if (
    sport.includes("motorsport") ||
    sport === "f1" ||
    league.includes("formula") ||
    league.includes("nascar") ||
    league.includes("motogp")
  ) {
    return "motorsport";
  }
  if (sport.includes("baseball") || league.includes("mlb")) return "baseball";
  if (sport.includes("hockey") || league.includes("nhl")) return "ice_hockey";
  return "other";
}

export function getPreferredSportCategory(selectedSports: SportPreferenceKey[]): PersonalizationSportCategory {
  const first = selectedSports.map((sport) => SPORT_CATEGORY_MAP[sport]).find(Boolean);
  return first || "all";
}

export function createPersonalizationSnapshot(input: PersonalizationInput): PersonalizationSnapshot {
  const preferredSportCategories = input.selectedSports
    .map((sport) => SPORT_CATEGORY_MAP[sport])
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);

  const preferredTeamIds = new Set<string>();
  const preferredTeamNames = new Set<string>();
  for (const team of input.selectedTeams) {
    preferredTeamIds.add(String(team.id || ""));
    const normalized = normalizeText(team.name);
    if (normalized) preferredTeamNames.add(normalized);
  }
  for (const team of input.followedTeams) {
    preferredTeamIds.add(String(team.teamId || ""));
    const normalized = normalizeText(team.teamName);
    if (normalized) preferredTeamNames.add(normalized);
  }

  const preferredCompetitionIds = new Set<string>();
  const preferredCompetitionNames = new Set<string>();
  const preferredCompetitionLeagues = new Set<string>();
  for (const competition of input.selectedCompetitions) {
    preferredCompetitionIds.add(String(competition.id || ""));
    const normalizedName = normalizeText(competition.name);
    if (normalizedName) preferredCompetitionNames.add(normalizedName);
    const normalizedLeague = normalizeText(competition.espnLeague);
    if (normalizedLeague) preferredCompetitionLeagues.add(normalizedLeague);
  }

  const followedMatchIds = new Set(
    input.followedMatches.map((match) => String(match.matchId || "")).filter(Boolean),
  );

  return {
    sportsEnabled: input.sportsEnabled,
    moviesEnabled: input.moviesEnabled,
    notifications: input.notifications,
    preferredSportCategories,
    preferredSportCategory: preferredSportCategories[0] || "all",
    preferredTeamIds,
    preferredTeamNames,
    preferredCompetitionIds,
    preferredCompetitionNames,
    preferredCompetitionLeagues,
    followedMatchIds,
    hasSportsPersonalization:
      preferredSportCategories.length > 0 ||
      preferredTeamIds.size > 0 ||
      preferredCompetitionIds.size > 0,
  };
}

export function scoreMatchForPersonalization(match: any, personalization: PersonalizationSnapshot): number {
  let score = 0;
  const matchId = String(match?.id || "");
  const homeTeamId = String(match?.homeTeamId || "");
  const awayTeamId = String(match?.awayTeamId || "");
  const homeTeam = normalizeText(match?.homeTeam);
  const awayTeam = normalizeText(match?.awayTeam);
  const league = normalizeText(match?.league);
  const espnLeague = normalizeText(match?.espnLeague);
  const sportCategory = getMatchSportCategory(match);

  if (matchId && personalization.followedMatchIds.has(matchId)) score += 20;
  if (homeTeamId && personalization.preferredTeamIds.has(homeTeamId)) score += 16;
  if (awayTeamId && personalization.preferredTeamIds.has(awayTeamId)) score += 16;
  if (homeTeam && personalization.preferredTeamNames.has(homeTeam)) score += 12;
  if (awayTeam && personalization.preferredTeamNames.has(awayTeam)) score += 12;
  if (league && personalization.preferredCompetitionNames.has(league)) score += 10;
  if (espnLeague && personalization.preferredCompetitionLeagues.has(espnLeague)) score += 10;
  if (personalization.preferredSportCategories.includes(sportCategory)) score += 6;
  if (String(match?.status || "").toLowerCase() === "live") score += 4;

  return score;
}

export function prioritizeMatchesForPersonalization<T>(
  matches: T[],
  personalization: PersonalizationSnapshot,
): T[] {
  if (!personalization.hasSportsPersonalization) return matches;
  return [...matches].sort((left: any, right: any) => {
    const scoreDelta =
      scoreMatchForPersonalization(right, personalization) -
      scoreMatchForPersonalization(left, personalization);
    if (scoreDelta !== 0) return scoreDelta;
    return 0;
  });
}

export function matchBelongsToPreferredCompetition(match: any, personalization: PersonalizationSnapshot): boolean {
  const league = normalizeText(match?.league);
  const espnLeague = normalizeText(match?.espnLeague);
  return (
    (league && personalization.preferredCompetitionNames.has(league)) ||
    (espnLeague && personalization.preferredCompetitionLeagues.has(espnLeague))
  );
}

export function matchInvolvesPreferredTeam(match: any, personalization: PersonalizationSnapshot): boolean {
  const homeTeamId = String(match?.homeTeamId || "");
  const awayTeamId = String(match?.awayTeamId || "");
  const homeTeam = normalizeText(match?.homeTeam);
  const awayTeam = normalizeText(match?.awayTeam);

  return (
    (homeTeamId && personalization.preferredTeamIds.has(homeTeamId)) ||
    (awayTeamId && personalization.preferredTeamIds.has(awayTeamId)) ||
    (homeTeam && personalization.preferredTeamNames.has(homeTeam)) ||
    (awayTeam && personalization.preferredTeamNames.has(awayTeam))
  );
}