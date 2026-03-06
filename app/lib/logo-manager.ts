// Local logo assets
const LOCAL_LOGOS = {
  clubBrugge: require("../assets/logos/club-brugge.png"),
  jupilerProLeague: require("../assets/logos/jupiler-pro-league.png"),
  raalLaLouviere: require("../assets/logos/raal-la-louviere.png"),
};

const LEAGUE_LOGO_MAP: Record<string, string | number> = {
  "Premier League": "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  "UEFA Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/1.png",
  "Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/1.png",
  "UEFA Europa League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "Europa League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "UEFA Conference League": "https://a.espncdn.com/i/leaguelogos/soccer/500/3.png",
  "Conference League": "https://a.espncdn.com/i/leaguelogos/soccer/500/3.png",
  "La Liga": "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  Bundesliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  "Jupiler Pro League": LOCAL_LOGOS.jupilerProLeague,
  "Ligue 1": "https://a.espncdn.com/i/leaguelogos/soccer/500/9.png",
  "Serie A": "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png",
  NBA: "https://a.espncdn.com/i/leaguelogos/basketball/500/nba.png",
};

function normalizeName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getLeagueLogo(leagueName?: string): string | number | null {
  const key = String(leagueName || "").trim();
  return LEAGUE_LOGO_MAP[key] ?? null;
}

export function resolveTeamLogoUri(teamName?: string, logoUri?: string | null): string | number | null {
  const normalized = normalizeName(String(teamName || ""));
  if (normalized.includes("club brugge") || normalized.includes("clubbrugge")) {
    return LOCAL_LOGOS.clubBrugge;
  }
  if (
    normalized.includes("raal") ||
    normalized.includes("raal la louviere") ||
    normalized.includes("la louviere")
  ) {
    return LOCAL_LOGOS.raalLaLouviere;
  }
  const safeLogo = String(logoUri || "").trim();
  return safeLogo || null;
}

export function getInitials(value?: string, max = 2): string {
  const initials = String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "?";
}
