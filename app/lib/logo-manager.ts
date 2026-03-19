// Local logo assets
const LOCAL_LOGOS = {
  clubBrugge: require("../assets/logos/club-brugge.png"),
  jupilerProLeague: require("../assets/logos/jupiler-pro-league.png"),
  challengerProLeague: require("../assets/logos/challenger-pro-league.png"),
  championsLeague: require("../assets/logos/champions-league.png"),
  europaLeague: require("../assets/logos/europa-league.png"),
  conferenceLeague: require("../assets/logos/conference-league.png"),
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
  "Challenger Pro League":   LOCAL_LOGOS.challengerProLeague,
  "Belgian First Division B": LOCAL_LOGOS.challengerProLeague,
  "Beker van België":        LOCAL_LOGOS.jupilerProLeague,
  "Belgian Cup":             LOCAL_LOGOS.jupilerProLeague,

  "Primeira Liga":           ESPN(24),
  "Liga Portugal":           ESPN(24),

  "Super League":            ESPN(53),
  "Scottish Premiership":    ESPN(54),
  "Premiership":             ESPN(54),

  // ── UEFA Competitions ─────────────────────────────────────────────────────
  "UEFA Champions League":   LOCAL_LOGOS.championsLeague,
  "Champions League":        LOCAL_LOGOS.championsLeague,
  "UCL":                     LOCAL_LOGOS.championsLeague,
  "UEFA Europa League":      LOCAL_LOGOS.europaLeague,
  "Europa League":           LOCAL_LOGOS.europaLeague,
  "UEL":                     LOCAL_LOGOS.europaLeague,
  "UEFA Conference League":  LOCAL_LOGOS.conferenceLeague,
  "Conference League":       LOCAL_LOGOS.conferenceLeague,
  "UECL":                    LOCAL_LOGOS.conferenceLeague,
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

export function sanitizeRemoteLogoUri(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  if (/^(data|javascript|file):/i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (String(parsed.pathname || "").toLowerCase().endsWith(".svg")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
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

// ESPN CDN team logo fallback: normalized name → ESPN team ID
// Used when server provides no logo URL (e.g. network failure, missing alias)
const ESPN_TEAM_LOGO_IDS: Record<string, number> = {
  // Belgium - Pro League
  "club brugge": 8782, "krc genk": 740, "racing genk": 740, "royal antwerp": 9498, "anderlecht": 9499,
  "gent": 9497, "kaa gent": 9497, "standard liege": 8784, "union saint gilloise": 15327,
  "cercle brugge": 8783, "oh leuven": 9916, "oud heverlee leuven": 9916,
  "sint truiden": 8785, "stvv": 8785, "mechelen": 9917, "kv mechelen": 9917,
  "westerlo": 9918, "kortrijk": 9919, "kv kortrijk": 9919, "charleroi": 9500,
  "as eupen": 15329, "eupen": 15329, "rwdm": 15330, "beerschot": 15328,
  // Belgium - Challenger Pro League (2nd division)
  "lommel": 15334, "lommel sk": 15334, "lierse kempenzonen": 15335, "lierse": 15335,
  "sk beveren": 15336, "beveren": 15336, "club nxt": 15337, "patro eisden": 15338,
  "francs borains": 15339, "sk deinze": 15340, "deinze": 15340, "virton": 15341,
  // England
  "arsenal": 359, "aston villa": 362, "bournemouth": 349, "brentford": 337,
  "brighton": 331, "chelsea": 363, "crystal palace": 384, "everton": 368,
  "fulham": 370, "ipswich town": 373, "leicester city": 375, "liverpool": 364,
  "manchester city": 382, "manchester united": 360, "newcastle united": 361,
  "nottingham forest": 393, "southampton": 376, "tottenham hotspur": 367,
  "west ham united": 371, "wolverhampton wanderers": 380,
  // Spain
  "real madrid": 86, "barcelona": 83, "atletico madrid": 1068, "real sociedad": 89,
  "athletic bilbao": 93, "villarreal": 102, "real betis": 244, "sevilla": 243,
  "girona": 9812, "valencia": 94, "celta vigo": 2922, "getafe": 2919,
  "mallorca": 3842, "osasuna": 99, "rayo vallecano": 2924, "espanyol": 88,
  "las palmas": 3843, "leganes": 3844, "valladolid": 95, "alaves": 96,
  // Germany
  "bayern munich": 132, "borussia dortmund": 124, "bayer leverkusen": 131,
  "rb leipzig": 11420, "eintracht frankfurt": 125, "freiburg": 10936,
  "stuttgart": 133, "wolfsburg": 134, "hoffenheim": 10937, "mainz": 10938,
  "gladbach": 127, "werder bremen": 129, "augsburg": 10935, "union berlin": 8606,
  "dortmund": 124, "heidenheim": 15331, "st pauli": 128, "holstein kiel": 15332,
  "bochum": 135,
  // Italy
  "inter milan": 110, "ac milan": 103, "juventus": 111, "napoli": 114,
  "atalanta": 102, "roma": 104, "lazio": 105, "fiorentina": 109,
  "torino": 113, "bologna": 107, "udinese": 115, "empoli": 8599,
  "cagliari": 108, "lecce": 9869, "genoa": 106, "monza": 9870,
  "como": 15333, "parma": 112, "verona": 116, "venezia": 3046,
  // France
  "paris saint germain": 160, "psg": 160, "marseille": 166, "lyon": 167,
  "monaco": 174, "lille": 172, "rennes": 177, "nice": 173, "lens": 176,
  "strasbourg": 179, "nantes": 175, "toulouse": 178, "brest": 9813,
  "reims": 180, "montpellier": 171, "le havre": 9814, "angers": 169,
  "auxerre": 170, "saint etienne": 163,
  // Netherlands
  "ajax": 139, "psv": 148, "feyenoord": 143, "az alkmaar": 140,
  "twente": 155, "utrecht": 156,
  // Portugal
  "benfica": 218, "porto": 224, "sporting cp": 228, "braga": 244,
};

// National team logos via ESPN country codes
const NATIONAL_TEAM_CODES: Record<string, string> = {
  "belgium": "bel", "belgie": "bel", "rode duivels": "bel",
  "netherlands": "ned", "nederland": "ned", "holland": "ned", "oranje": "ned",
  "france": "fra", "frankrijk": "fra",
  "germany": "ger", "duitsland": "ger", "deutschland": "ger",
  "england": "eng", "engeland": "eng",
  "spain": "esp", "spanje": "esp", "espana": "esp",
  "italy": "ita", "italie": "ita", "italia": "ita",
  "portugal": "por",
  "brazil": "bra", "brazilie": "bra", "brasil": "bra",
  "argentina": "arg", "argentinie": "arg",
  "croatia": "cro", "kroatie": "cro",
  "morocco": "mar", "marokko": "mar",
  "senegal": "sen",
  "japan": "jpn",
  "south korea": "kor", "korea republic": "kor",
  "united states": "usa", "usa": "usa",
  "mexico": "mex",
  "colombia": "col",
  "uruguay": "uru",
  "denmark": "den", "denemarken": "den",
  "switzerland": "sui", "zwitserland": "sui",
  "poland": "pol", "polen": "pol",
  "austria": "aut", "oostenrijk": "aut",
  "wales": "wal",
  "scotland": "sco", "schotland": "sco",
  "ireland": "irl", "ierland": "irl",
  "turkey": "tur", "turkije": "tur",
  "czech republic": "cze", "czechia": "cze", "tsjechie": "cze",
  "greece": "gre", "griekenland": "gre",
  "sweden": "swe", "zweden": "swe",
  "norway": "nor", "noorwegen": "nor",
  "serbia": "srb", "servie": "srb",
  "ukraine": "ukr", "oekraine": "ukr",
  "romania": "rou", "roemenie": "rou",
  "hungary": "hun", "hongarije": "hun",
  "nigeria": "nga",
  "cameroon": "cmr", "kameroen": "cmr",
  "ghana": "gha",
  "egypt": "egy", "egypte": "egy",
  "tunisia": "tun", "tunesie": "tun",
  "algeria": "alg", "algerije": "alg",
  "ivory coast": "civ", "cote d ivoire": "civ", "ivoorkust": "civ",
  "australia": "aus", "australie": "aus",
  "canada": "can",
  "chile": "chi",
  "peru": "per",
  "ecuador": "ecu",
  "paraguay": "par",
  "venezuela": "ven",
  "costa rica": "crc",
  "panama": "pan",
  "jamaica": "jam",
  "iceland": "isl", "ijsland": "isl",
  "finland": "fin",
  "slovakia": "svk", "slowakije": "svk",
  "slovenia": "svn", "slovenie": "svn",
  "albania": "alb", "albanie": "alb",
  "north macedonia": "mkd", "noord macedonie": "mkd",
  "montenegro": "mne",
  "bosnia": "bih", "bosnia herzegovina": "bih",
  "georgia": "geo", "georgie": "geo",
  "israel": "isr",
  "saudi arabia": "ksa", "saoedi arabie": "ksa",
  "qatar": "qat",
  "iran": "irn",
  "china": "chn",
  "india": "ind",
};

export function resolveTeamLogoUri(teamName?: string, logoUri?: string | null): string | number | null {
  const normalized = normalizeName(String(teamName || ""));
  if (normalized === "club brugge" || normalized === "club brugge kv" || normalized.startsWith("club brugge ")) {
    return LOCAL_LOGOS.clubBrugge;
  }
  if (
    normalized === "raal la louviere" ||
    normalized === "raal" ||
    normalized.startsWith("raal la louviere")
  ) {
    return LOCAL_LOGOS.raalLaLouviere;
  }
  const safeLogo = sanitizeRemoteLogoUri(logoUri);
  if (safeLogo) return safeLogo;

  // ESPN CDN fallback when server provides no logo
  const espnId = ESPN_TEAM_LOGO_IDS[normalized];
  if (espnId) return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;

  // Try partial match: find ESPN entry where key is contained in normalized or vice versa
  if (normalized.length >= 4) {
    for (const [key, id] of Object.entries(ESPN_TEAM_LOGO_IDS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
      }
    }
  }

  // National team fallback: try ESPN country logos
  const countryCode = NATIONAL_TEAM_CODES[normalized];
  if (countryCode) return `https://a.espncdn.com/i/teamlogos/countries/500/${countryCode}.png`;
  // Partial match for national teams
  if (normalized.length >= 4) {
    for (const [key, code] of Object.entries(NATIONAL_TEAM_CODES)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return `https://a.espncdn.com/i/teamlogos/countries/500/${code}.png`;
      }
    }
  }

  return null;
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
