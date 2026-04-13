import {
  COMPETITION_DIRECTORY,
  TEAM_DIRECTORY,
  getCompetitionSeedsForSports,
  getTeamSeedsForSports,
  regionWeight,
  type CompetitionSeed,
  type TeamSeed,
} from "@/services/onboarding-data";
import type { CompetitionPreference, SportPreferenceKey, TeamPreference } from "@/services/onboarding-storage";

export type LocaleSignals = {
  locale: string;
  language: string;
  region: string;
};

export function detectLocaleSignals(): LocaleSignals {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en-BE";
  const [language = "en", region = "BE"] = locale.replace("_", "-").split("-");
  return {
    locale,
    language: language.toLowerCase(),
    region: region.toUpperCase(),
  };
}

function tokenize(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function searchScore(label: string, query: string): number {
  if (!query) return 0;
  const normalizedLabel = String(label || "").toLowerCase();
  const normalizedQuery = String(query || "").toLowerCase().trim();
  if (!normalizedQuery) return 0;
  if (normalizedLabel.startsWith(normalizedQuery)) return 1;
  if (normalizedLabel.includes(normalizedQuery)) return 0.72;
  const queryTokens = tokenize(normalizedQuery);
  const labelTokens = new Set(tokenize(normalizedLabel));
  if (!queryTokens.length) return 0;
  const hits = queryTokens.filter((token) => labelTokens.has(token)).length;
  return hits / queryTokens.length * 0.55;
}

function sortBySuggestionScore<T extends TeamSeed | CompetitionSeed>(
  items: T[],
  sports: SportPreferenceKey[],
  localeSignals: LocaleSignals,
  query = "",
): T[] {
  const sportSet = new Set(sports);
  return [...items]
    .map((item) => {
      const search = searchScore(item.name, query);
      const preferredSport = sportSet.size === 0 || sportSet.has(item.sport) ? 0.35 : -1;
      const regional = regionWeight(item.region, localeSignals.region);
      const languageBoost = localeSignals.language === "nl" && ["BE", "NL"].includes(localeSignals.region) ? 0.08 : 0;
      const trendingBoost = item.trending ? 0.22 : 0;
      return {
        item,
        score: preferredSport + regional + languageBoost + trendingBoost + search,
      };
    })
    .filter((entry) => entry.score > -0.25)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
}

export function getSmartTeamSuggestions(
  sports: SportPreferenceKey[],
  localeSignals = detectLocaleSignals(),
  limit = 8,
): TeamPreference[] {
  return sortBySuggestionScore(getTeamSeedsForSports(sports), sports, localeSignals)
    .slice(0, limit)
    .map(({ id, name, sport, region, competition }) => ({ id, name, sport, region, competition }));
}

export function getSmartCompetitionSuggestions(
  sports: SportPreferenceKey[],
  localeSignals = detectLocaleSignals(),
  limit = 8,
): CompetitionPreference[] {
  return sortBySuggestionScore(getCompetitionSeedsForSports(sports), sports, localeSignals)
    .slice(0, limit)
    .map(({ id, name, sport, region, espnLeague }) => ({ id, name, sport, region, espnLeague }));
}

export function searchTeams(
  query: string,
  sports: SportPreferenceKey[],
  localeSignals = detectLocaleSignals(),
  limit = 20,
): TeamPreference[] {
  return sortBySuggestionScore(TEAM_DIRECTORY, sports, localeSignals, query)
    .slice(0, limit)
    .map(({ id, name, sport, region, competition }) => ({ id, name, sport, region, competition }));
}

export function searchCompetitions(
  query: string,
  sports: SportPreferenceKey[],
  localeSignals = detectLocaleSignals(),
  limit = 16,
): CompetitionPreference[] {
  return sortBySuggestionScore(COMPETITION_DIRECTORY, sports, localeSignals, query)
    .slice(0, limit)
    .map(({ id, name, sport, region, espnLeague }) => ({ id, name, sport, region, espnLeague }));
}