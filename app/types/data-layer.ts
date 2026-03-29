export type ProviderName =
  | "transfermarkt-direct"
  | "apify-transfermarkt"
  | "espn"
  | "api-sports"
  | "thesportsdb"
  | "ai"
  | "fallback";

export type FormerClubEvent = {
  name: string;
  role?: "from" | "to" | string;
  date?: string | null;
  fee?: string | null;
  note?: string | null;
};

export type PlayerProfileDto = {
  id: string;
  name: string;
  age?: number | null;
  position?: string | null;
  nationality?: string | null;
  currentClub?: string | null;
  currentClubLogo?: string | null;
  photo?: string | null;
  marketValue?: string | null;
  marketValueEur?: number | null;
  isRealValue?: boolean;
  valueMethod?: string | null;
  formerClubs?: FormerClubEvent[];
  injuries?: Array<Record<string, unknown>>;
  transfers?: FormerClubEvent[];
  seasonStats?: Record<string, unknown>;
  analysis?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  source?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type TeamDto = {
  id: string;
  name: string;
  shortName?: string;
  logo?: string | null;
  color?: string | null;
  leagueName?: string | null;
  leagueRank?: number | null;
  leaguePoints?: number | null;
  leaguePlayed?: number | null;
  stadiumCapacity?: number | null;
  venue?: string | null;
  coach?: string | null;
  country?: string | null;
  form?: string | null;
  players?: PlayerProfileDto[];
  recentResults?: Array<Record<string, unknown>>;
  upcomingMatches?: Array<Record<string, unknown>>;
  source?: string;
  [key: string]: unknown;
};

export type MarketValuePoint = {
  timestamp: string;
  valueEur: number;
  label?: string;
  source: ProviderName;
};

export type MarketValueResponse = {
  playerId?: string;
  playerName: string;
  currentValueEur: number | null;
  currentValueLabel: string | null;
  history: MarketValuePoint[];
  providerPriority: ProviderName[];
};

export type PlayerAnalysisDto = {
  playerId?: string;
  playerName: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  tactical?: string | null;
  physical?: string | null;
  mental?: string | null;
  transferPotential?: string | null;
  language: "nl" | "en";
  provider: ProviderName | "cached";
  cached: boolean;
  updatedAt: string;
};
