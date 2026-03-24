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
// All IDs verified against ESPN API (site.api.espn.com)
const ESPN_TEAM_LOGO_IDS: Record<string, number> = {
  // Belgium - Pro League (IDs verified via ESPN teams API)
  "club brugge": 570, "krc genk": 938, "racing genk": 938, "royal antwerp": 17544, "antwerp": 17544, "anderlecht": 441,
  "gent": 3611, "kaa gent": 3611, "standard liege": 559, "union saint gilloise": 5807, "union st gilloise": 5807,
  "cercle brugge": 3610, "oh leuven": 5579, "oud heverlee leuven": 5579,
  "sint truiden": 936, "sint truidense": 936, "stvv": 936, "mechelen": 7879, "kv mechelen": 7879,
  "westerlo": 606, "kvc westerlo": 606, "kortrijk": 9919, "kv kortrijk": 9919, "charleroi": 3616, "royal charleroi": 3616,
  "dender": 7878, "fcv dender": 7878, "zulte waregem": 4691,
  "as eupen": 15329, "eupen": 15329, "rwdm": 15330, "beerschot": 15328,
  // Belgium - Challenger Pro League
  "lommel": 15334, "lommel sk": 15334, "lierse kempenzonen": 15335, "lierse": 15335,
  "sk beveren": 15336, "beveren": 15336, "club nxt": 15337, "patro eisden": 15338,
  "francs borains": 15339, "sk deinze": 15340, "deinze": 15340, "virton": 15341,
  // England - Premier League
  "arsenal": 359, "aston villa": 362, "bournemouth": 349, "brentford": 337,
  "brighton": 331, "chelsea": 363, "crystal palace": 384, "everton": 368,
  "fulham": 370, "ipswich town": 373, "leicester city": 375, "liverpool": 364,
  "manchester city": 382, "manchester united": 360, "newcastle united": 361,
  "nottingham forest": 393, "southampton": 376, "tottenham hotspur": 367,
  "west ham united": 371, "wolverhampton wanderers": 380,
  // Spain - La Liga
  "real madrid": 86, "barcelona": 83, "atletico madrid": 1068, "real sociedad": 89,
  "athletic bilbao": 93, "villarreal": 102, "real betis": 244, "sevilla": 243,
  "girona": 9812, "valencia": 94, "celta vigo": 85, "getafe": 2922,
  "mallorca": 84, "osasuna": 97, "rayo vallecano": 101, "espanyol": 88,
  "valladolid": 95, "alaves": 96, "real oviedo": 92, "levante": 1538, "elche": 3751,
  // Germany - Bundesliga
  "bayern munich": 132, "borussia dortmund": 124, "dortmund": 124, "bayer leverkusen": 131,
  "rb leipzig": 11420, "eintracht frankfurt": 125, "freiburg": 126,
  "stuttgart": 134, "wolfsburg": 138, "hoffenheim": 7911, "mainz": 2950,
  "gladbach": 268, "monchengladbach": 268, "werder bremen": 137, "augsburg": 3841,
  "union berlin": 598, "heidenheim": 6418, "st pauli": 270, "holstein kiel": 7884,
  "bochum": 121, "cologne": 122, "hamburg": 127, "schalke": 133, "hertha berlin": 129,
  "nurnberg": 269, "dusseldorf": 9707, "hannover": 2428, "kaiserslautern": 130, "paderborn": 3307,
  // Italy - Serie A
  "inter milan": 110, "internazionale": 110, "ac milan": 103, "juventus": 111, "napoli": 114,
  "atalanta": 105, "roma": 104, "lazio": 112, "fiorentina": 109,
  "torino": 239, "bologna": 107, "udinese": 118, "empoli": 2574,
  "cagliari": 2925, "lecce": 113, "genoa": 3263, "monza": 4007,
  "como": 2572, "parma": 115, "verona": 119, "hellas verona": 119, "venezia": 17530,
  "cremonese": 4050, "sassuolo": 3997, "pisa": 3956,
  // Italy - Serie B
  "bari": 106, "carrarese": 3988, "catanzaro": 3257, "cesena": 3337,
  "frosinone": 4057, "juve stabia": 3975, "mantova": 3991, "modena": 2573,
  "padova": 3952, "palermo": 2923, "pescara": 3290, "reggiana": 3942,
  "sampdoria": 2734, "spezia": 4056, "sudtirol": 11139, "avellino": 4055,
  "virtus entella": 11137,
  // France - Ligue 1
  "paris saint germain": 160, "psg": 160, "marseille": 176, "lyon": 167,
  "monaco": 174, "lille": 166, "rennes": 169, "nice": 2502, "lens": 175,
  "strasbourg": 180, "nantes": 165, "toulouse": 179, "brest": 6997,
  "reims": 3243, "montpellier": 274, "le havre": 3236, "angers": 7868,
  "auxerre": 172, "saint etienne": 178, "paris fc": 6851, "lorient": 273, "metz": 177,
  // Netherlands - Eredivisie
  "ajax": 139, "psv": 148, "feyenoord": 142, "az alkmaar": 140,
  "twente": 152, "utrecht": 153, "groningen": 145, "fortuna sittard": 143,
  "heerenveen": 146, "nec": 147, "nec nijmegen": 147, "sparta rotterdam": 151,
  "go ahead eagles": 3706, "heracles": 3708, "nac breda": 141,
  "pec zwolle": 2565, "excelsior": 2566, "volendam": 2727,
  // Netherlands - Eerste Divisie
  "ado den haag": 2726, "almere city": 5291, "de graafschap": 144, "den bosch": 271,
  "dordrecht": 4426, "fc eindhoven": 3732, "emmen": 3707, "helmond sport": 3775,
  "jong az": 18748, "jong ajax": 10597, "jong utrecht": 18278, "jong psv": 9983,
  "mvv maastricht": 3730, "rkc waalwijk": 155, "roda jc": 149, "cambuur": 3736,
  "top oss": 3728, "vvv venlo": 3731, "vitesse": 154, "willem ii": 156, "telstar": 3735,
  // Portugal - Liga Portugal
  "benfica": 1929, "porto": 437, "fc porto": 437, "sporting cp": 2250, "braga": 2994,
  "arouca": 15784, "casa pia": 21581, "estoril": 12216, "famalicao": 12698,
  "gil vicente": 3699, "moreirense": 3696, "rio ave": 3822, "santa clara": 12215,
  "vitoria guimaraes": 5309, "nacional": 3472, "tondela": 12706,
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
  // Server-provided logo URL takes priority (verified via HEAD requests on server)
  const safeLogo = sanitizeRemoteLogoUri(logoUri);
  if (safeLogo) return safeLogo;

  // ESPN curated ID as fallback
  const espnId = ESPN_TEAM_LOGO_IDS[normalized];
  if (espnId) return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;

  // Try partial match: find ESPN entry where key matches as a whole word in normalized or vice versa
  if (normalized.length >= 4) {
    for (const [key, id] of Object.entries(ESPN_TEAM_LOGO_IDS)) {
      // Use word-boundary matching to prevent "lille" matching "lilliestrom"
      const keyRegex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      const normRegex = new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (keyRegex.test(normalized) || normRegex.test(key)) {
        return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
      }
    }
  }

  // National team fallback: try ESPN country logos
  const countryCode = NATIONAL_TEAM_CODES[normalized];
  if (countryCode) return `https://a.espncdn.com/i/teamlogos/countries/500/${countryCode}.png`;
  // Partial match for national teams (word-boundary)
  if (normalized.length >= 4) {
    for (const [key, code] of Object.entries(NATIONAL_TEAM_CODES)) {
      const keyRegex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      const normRegex = new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (keyRegex.test(normalized) || normRegex.test(key)) {
        return `https://a.espncdn.com/i/teamlogos/countries/500/${code}.png`;
      }
    }
  }

  return null;
}

const clubHistoryLogoCache = new Map<string, string | number | null>();

function normalizeClubAlias(value: string): string {
  return normalizeName(value)
    .replace(/\b(fc|cf|afc|sc|ac|kv|krc|rc|sv|vv|as)\b/g, " ")
    .replace(/\b(u\s?17|u\s?18|u\s?19|u\s?20|u\s?21|u\s?23|b team|b-team|reserve(s)?|ii|jong)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clubAliasCandidates(teamName: string): string[] {
  const base = normalizeName(teamName);
  const alias = normalizeClubAlias(teamName);
  const out = new Set<string>();
  if (base) out.add(base);
  if (alias) out.add(alias);

  // Handle common short-name families.
  if (alias === "man city") out.add("manchester city");
  if (alias === "man utd") out.add("manchester united");
  if (alias === "arsenal") out.add("arsenal fc");
  if (alias === "psg") out.add("paris saint germain");

  return [...out].filter(Boolean);
}

export function resolveClubHistoryLogoUri(teamName?: string, logoUri?: string | null): string | number | null {
  const rawName = String(teamName || "").trim();
  if (!rawName && !logoUri) return null;

  const cacheKey = `${normalizeName(rawName)}|${String(logoUri || "").trim()}`;
  if (clubHistoryLogoCache.has(cacheKey)) return clubHistoryLogoCache.get(cacheKey) || null;

  const direct = resolveTeamLogoUri(rawName, logoUri);
  if (direct) {
    clubHistoryLogoCache.set(cacheKey, direct);
    return direct;
  }

  for (const candidate of clubAliasCandidates(rawName)) {
    const resolved = resolveTeamLogoUri(candidate, null);
    if (resolved) {
      clubHistoryLogoCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  clubHistoryLogoCache.set(cacheKey, null);
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
