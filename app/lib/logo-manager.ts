// Local logo assets
const LOCAL_LOGOS = {
  clubBrugge: require("../assets/logos/club-brugge.png"),
  jupilerProLeague: require("../assets/logos/jupiler-pro-league.png"),
  raalLaLouviere: require("../assets/logos/raal-la-louviere.png"),
};

// ESPN CDN league logo IDs (soccer/500/*.png)
// Source: a.espncdn.com/i/leaguelogos/soccer/500/{id}.png
const ESPN = (id: number) => `https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png`;

const LEAGUE_LOGO_MAP: Record<string, string | number> = {
  // ── Top European leagues ──────────────────────────────────────────────────
  "Premier League":          ESPN(23),
  "Championship":            ESPN(24),
  "EFL Championship":        ESPN(24),
  "League One":              ESPN(25),
  "FA Cup":                  ESPN(30),
  "EFL Cup":                 ESPN(31),

  "La Liga":                 ESPN(15),
  "La Liga 2":               ESPN(17),
  "Segunda División":        ESPN(17),
  "Copa del Rey":            ESPN(16),

  "Bundesliga":              ESPN(10),
  "2. Bundesliga":           ESPN(19),
  "DFB-Pokal":               ESPN(20),

  "Serie A":                 ESPN(12),
  "Serie B":                 ESPN(13),
  "Coppa Italia":            ESPN(14),

  "Ligue 1":                 ESPN(9),
  "Ligue 2":                 ESPN(55),

  "Eredivisie":              ESPN(11),
  "Eerste Divisie":          ESPN(31),

  "Jupiler Pro League":      LOCAL_LOGOS.jupilerProLeague,
  "Belgian Pro League":      LOCAL_LOGOS.jupilerProLeague,

  "Primeira Liga":           ESPN(24),
  "Liga Portugal":           ESPN(24),

  "Super League":            ESPN(53),
  "Scottish Premiership":    ESPN(54),
  "Premiership":             ESPN(54),

  // ── UEFA Competitions ─────────────────────────────────────────────────────
  "UEFA Champions League":   "https://img.uefa.com/imgml/uefacom/ucl/social/og-default.png",
  "Champions League":        "https://img.uefa.com/imgml/uefacom/ucl/social/og-default.png",
  "UCL":                     "https://img.uefa.com/imgml/uefacom/ucl/social/og-default.png",
  "UEFA Europa League":      "https://img.uefa.com/imgml/uefacom/uel/social/og-default.png",
  "Europa League":           "https://img.uefa.com/imgml/uefacom/uel/social/og-default.png",
  "UEL":                     "https://img.uefa.com/imgml/uefacom/uel/social/og-default.png",
  "UEFA Conference League":  "https://img.uefa.com/imgml/uefacom/uecl/social/og-default.png",
  "Conference League":       "https://img.uefa.com/imgml/uefacom/uecl/social/og-default.png",
  "UECL":                    "https://img.uefa.com/imgml/uefacom/uecl/social/og-default.png",
  "UEFA Nations League":     ESPN(72),
  "Nations League":          ESPN(72),

  // ── Basketball ────────────────────────────────────────────────────────────
  "NBA":             "https://a.espncdn.com/i/leaguelogos/basketball/500/nba.png",
  "EuroLeague":      "https://a.espncdn.com/i/leaguelogos/basketball/500/euroleague.png",
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
  // Exact match first
  if (LEAGUE_LOGO_MAP[key] != null) return LEAGUE_LOGO_MAP[key];
  // Case-insensitive fallback
  const normalized = key.toLowerCase();
  const found = Object.entries(LEAGUE_LOGO_MAP).find(
    ([k]) => k.toLowerCase() === normalized
  );
  return found?.[1] ?? null;
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
