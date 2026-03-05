// Club Brugge ESPN CDN logo (Jupiler Pro League team ID: 6718)
const CLUB_BRUGGE_LOGO = "https://a.espncdn.com/i/teamlogos/soccer/500/6718.png";

const LEAGUE_LOGO_MAP: Record<string, string> = {
  "Premier League": "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  "UEFA Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/1.png",
  "Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/1.png",
  "UEFA Europa League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "Europa League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "UEFA Conference League": "https://a.espncdn.com/i/leaguelogos/soccer/500/3.png",
  "Conference League": "https://a.espncdn.com/i/leaguelogos/soccer/500/3.png",
  "La Liga": "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  Bundesliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  "Jupiler Pro League": "https://a.espncdn.com/i/leaguelogos/soccer/500/5.png",
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

export function getLeagueLogo(leagueName?: string): string | null {
  const key = String(leagueName || "").trim();
  return LEAGUE_LOGO_MAP[key] || null;
}

export function resolveTeamLogoUri(teamName?: string, logoUri?: string | null): string | null {
  const normalized = normalizeName(String(teamName || ""));
  if (normalized.includes("club brugge") || normalized.includes("clubbrugge")) {
    return CLUB_BRUGGE_LOGO;
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
