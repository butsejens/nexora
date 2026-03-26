import type {
  CompetitionPreference,
  SportPreferenceKey,
  TeamPreference,
} from "@/services/onboarding-storage";

type SeedRegion = "BE" | "NL" | "UK" | "EU" | "US" | "GLOBAL";

export type TeamSeed = TeamPreference & {
  aliases?: string[];
  trending?: boolean;
};

export type CompetitionSeed = CompetitionPreference & {
  aliases?: string[];
  trending?: boolean;
};

export const SPORT_OPTIONS: Array<{ key: SportPreferenceKey; label: string; icon: string; accent: string }> = [
  { key: "football", label: "Football", icon: "football-outline", accent: "#FF5A5F" },
  { key: "basketball", label: "Basketball", icon: "basketball-outline", accent: "#FF9F43" },
  { key: "tennis", label: "Tennis", icon: "tennisball-outline", accent: "#C4FF4D" },
  { key: "mma", label: "MMA", icon: "flash-outline", accent: "#B26CFF" },
  { key: "motorsport", label: "Motorsport", icon: "speedometer-outline", accent: "#4DE2FF" },
];

export const TRENDING_TEAMS: TeamSeed[] = [
  { id: "club-brugge", name: "Club Brugge", sport: "football", region: "BE", competition: "Jupiler Pro League", trending: true },
  { id: "anderlecht", name: "Anderlecht", sport: "football", region: "BE", competition: "Jupiler Pro League", trending: true },
  { id: "genk", name: "Genk", sport: "football", region: "BE", competition: "Jupiler Pro League", trending: true },
  { id: "liverpool", name: "Liverpool", sport: "football", region: "UK", competition: "Premier League", trending: true },
  { id: "arsenal", name: "Arsenal", sport: "football", region: "UK", competition: "Premier League", trending: true },
  { id: "real-madrid", name: "Real Madrid", sport: "football", region: "EU", competition: "La Liga", trending: true },
  { id: "barcelona", name: "Barcelona", sport: "football", region: "EU", competition: "La Liga", trending: true },
  { id: "psg", name: "Paris Saint-Germain", sport: "football", region: "EU", competition: "Ligue 1", trending: true },
  { id: "inter", name: "Inter", sport: "football", region: "EU", competition: "Serie A", trending: true },
  { id: "bayern", name: "Bayern Munich", sport: "football", region: "EU", competition: "Bundesliga", trending: true },
  { id: "lakers", name: "Los Angeles Lakers", sport: "basketball", region: "US", competition: "NBA", trending: true },
  { id: "celtics", name: "Boston Celtics", sport: "basketball", region: "US", competition: "NBA", trending: true },
  { id: "warriors", name: "Golden State Warriors", sport: "basketball", region: "US", competition: "NBA", trending: true },
  { id: "real-madrid-basket", name: "Real Madrid Baloncesto", sport: "basketball", region: "EU", competition: "EuroLeague", trending: true },
  { id: "djokovic", name: "Novak Djokovic", sport: "tennis", region: "GLOBAL", competition: "ATP Tour", trending: true },
  { id: "sinner", name: "Jannik Sinner", sport: "tennis", region: "EU", competition: "ATP Tour", trending: true },
  { id: "sabalenka", name: "Aryna Sabalenka", sport: "tennis", region: "GLOBAL", competition: "WTA Tour", trending: true },
  { id: "verstappen", name: "Max Verstappen", sport: "motorsport", region: "EU", competition: "Formula 1", trending: true },
  { id: "mclaren", name: "McLaren", sport: "motorsport", region: "EU", competition: "Formula 1", trending: true },
  { id: "ufc-makhachev", name: "Islam Makhachev", sport: "mma", region: "GLOBAL", competition: "UFC", trending: true },
  { id: "ufc-topuria", name: "Ilia Topuria", sport: "mma", region: "EU", competition: "UFC", trending: true },
];

export const TEAM_DIRECTORY: TeamSeed[] = [
  ...TRENDING_TEAMS,
  { id: "psv", name: "PSV", sport: "football", region: "NL", competition: "Eredivisie" },
  { id: "ajax", name: "Ajax", sport: "football", region: "NL", competition: "Eredivisie" },
  { id: "feyenoord", name: "Feyenoord", sport: "football", region: "NL", competition: "Eredivisie" },
  { id: "chelsea", name: "Chelsea", sport: "football", region: "UK", competition: "Premier League" },
  { id: "manchester-city", name: "Manchester City", sport: "football", region: "UK", competition: "Premier League" },
  { id: "tottenham", name: "Tottenham Hotspur", sport: "football", region: "UK", competition: "Premier League" },
  { id: "ac-milan", name: "AC Milan", sport: "football", region: "EU", competition: "Serie A" },
  { id: "juventus", name: "Juventus", sport: "football", region: "EU", competition: "Serie A" },
  { id: "atletico", name: "Atletico Madrid", sport: "football", region: "EU", competition: "La Liga" },
  { id: "dortmund", name: "Borussia Dortmund", sport: "football", region: "EU", competition: "Bundesliga" },
  { id: "bucks", name: "Milwaukee Bucks", sport: "basketball", region: "US", competition: "NBA" },
  { id: "nuggets", name: "Denver Nuggets", sport: "basketball", region: "US", competition: "NBA" },
  { id: "fenerbahce-basket", name: "Fenerbahce Beko", sport: "basketball", region: "EU", competition: "EuroLeague" },
  { id: "alcaraz", name: "Carlos Alcaraz", sport: "tennis", region: "EU", competition: "ATP Tour" },
  { id: "swiatek", name: "Iga Swiatek", sport: "tennis", region: "EU", competition: "WTA Tour" },
  { id: "leclerc", name: "Charles Leclerc", sport: "motorsport", region: "EU", competition: "Formula 1" },
  { id: "ferrari", name: "Ferrari", sport: "motorsport", region: "EU", competition: "Formula 1" },
  { id: "ufc-jones", name: "Jon Jones", sport: "mma", region: "GLOBAL", competition: "UFC" },
  { id: "ufc-omalley", name: "Sean O'Malley", sport: "mma", region: "US", competition: "UFC" },
];

export const COMPETITION_DIRECTORY: CompetitionSeed[] = [
  { id: "ucl", name: "UEFA Champions League", sport: "football", region: "EU", espnLeague: "uefa.champions", trending: true },
  { id: "prem", name: "Premier League", sport: "football", region: "UK", espnLeague: "eng.1", trending: true },
  { id: "laliga", name: "La Liga", sport: "football", region: "EU", espnLeague: "esp.1", trending: true },
  { id: "seriea", name: "Serie A", sport: "football", region: "EU", espnLeague: "ita.1", trending: true },
  { id: "bundesliga", name: "Bundesliga", sport: "football", region: "EU", espnLeague: "ger.1", trending: true },
  { id: "ligue1", name: "Ligue 1", sport: "football", region: "EU", espnLeague: "fra.1", trending: true },
  { id: "jpl", name: "Jupiler Pro League", sport: "football", region: "BE", espnLeague: "bel.1", trending: true },
  { id: "challenger", name: "Challenger Pro League", sport: "football", region: "BE", espnLeague: "bel.2" },
  { id: "eredivisie", name: "Eredivisie", sport: "football", region: "NL", espnLeague: "ned.1" },
  { id: "uel", name: "UEFA Europa League", sport: "football", region: "EU", espnLeague: "uefa.europa" },
  { id: "uecl", name: "UEFA Conference League", sport: "football", region: "EU", espnLeague: "uefa.europa.conf" },
  { id: "nba", name: "NBA", sport: "basketball", region: "US", espnLeague: null, trending: true },
  { id: "euroleague", name: "EuroLeague", sport: "basketball", region: "EU", espnLeague: null, trending: true },
  { id: "atp", name: "ATP Tour", sport: "tennis", region: "GLOBAL", espnLeague: null, trending: true },
  { id: "wta", name: "WTA Tour", sport: "tennis", region: "GLOBAL", espnLeague: null, trending: true },
  { id: "ufc", name: "UFC", sport: "mma", region: "GLOBAL", espnLeague: null, trending: true },
  { id: "formula1", name: "Formula 1", sport: "motorsport", region: "GLOBAL", espnLeague: null, trending: true },
  { id: "motogp", name: "MotoGP", sport: "motorsport", region: "GLOBAL", espnLeague: null },
];

export function getCompetitionSeedsForSports(sports: SportPreferenceKey[]): CompetitionSeed[] {
  const filter = new Set(sports);
  if (filter.size === 0) return COMPETITION_DIRECTORY.filter((item) => item.trending);
  return COMPETITION_DIRECTORY.filter((item) => filter.has(item.sport));
}

export function getTeamSeedsForSports(sports: SportPreferenceKey[]): TeamSeed[] {
  const filter = new Set(sports);
  if (filter.size === 0) return TEAM_DIRECTORY.filter((item) => item.trending);
  return TEAM_DIRECTORY.filter((item) => filter.has(item.sport));
}

export function getSportLabel(key: SportPreferenceKey): string {
  return SPORT_OPTIONS.find((item) => item.key === key)?.label || key;
}

export function regionWeight(region: string | undefined, localeRegion: string): number {
  if (!region) return 0;
  if (region === localeRegion) return 1;
  if (region === "EU" && ["BE", "NL", "UK", "FR", "DE", "ES", "IT", "PT"].includes(localeRegion)) return 0.72;
  if (region === "GLOBAL") return 0.4;
  return 0;
}