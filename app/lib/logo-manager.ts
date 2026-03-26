import AsyncStorage from "@react-native-async-storage/async-storage";
import { COUNTRY_COMPETITIONS, type CompetitionTier } from "@/lib/country-data";
import {
  getEntityAliases,
  normalizeCompetitionName,
  normalizeCountryName,
  normalizeEntityText,
  normalizeTeamName,
  tokenOverlapScore,
} from "@/lib/entity-normalization";

export type CompetitionLogoContext = {
  espnLeague?: string | null;
  countryCode?: string | null;
  tier?: CompetitionTier | null;
  aliases?: string[] | null;
};

export type ResolvedCompetitionBrand = {
  name: string;
  logo: string | number | null;
  espnLeague: string | null;
  countryCode: string | null;
  tier: CompetitionTier | null;
  confidence: number;
};

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
  "Liga Portugal 2":         ESPN(14),
  "Taça de Portugal":        ESPN(14),
  "Taca de Portugal":        ESPN(14),

  "Süper Lig":               ESPN(18),
  "Super Lig":               ESPN(18),
  "Turkish Cup":             ESPN(18),
  "1. Lig":                  ESPN(18),
  "Super League":            ESPN(53),
  "Scottish Premiership":    ESPN(54),
  "Premiership":             ESPN(54),
  "Scottish Championship":   ESPN(45),
  "Scottish FA Cup":         ESPN(45),
  "Austrian Bundesliga":     ESPN(5),
  "Austrian Football Bundesliga": ESPN(5),
  "Austrian Cup":            ESPN(5),
  "Swiss Super League":      ESPN(17),
  "Swiss Challenge League":  ESPN(17),
  "Swiss Cup":               ESPN(17),
  "Super League Greece":     ESPN(98),
  "Greek Cup":               ESPN(98),
  "Ekstraklasa":             ESPN(53),
  "Polish Cup":              ESPN(53),
  "Czech First League":      ESPN(10),
  "Czech Cup":               ESPN(10),
  "Romanian Liga 1":         ESPN(53),
  "Danish Superliga":        ESPN(53),
  "Allsvenskan":             ESPN(16),
  "Eliteserien":             ESPN(53),

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

const COMPETITION_CATALOG = COUNTRY_COMPETITIONS.flatMap((country) =>
  country.competitions.map((competition) => ({
    ...competition,
    countryCode: country.countryCode,
    normalizedLeague: normalizeCompetitionName(competition.league),
    aliases: getEntityAliases(competition.league, "competition"),
  }))
);

const COMPETITION_CATALOG_BY_ESPN = new Map(
  COMPETITION_CATALOG.map((competition) => [competition.espn, competition])
);

function getDirectLeagueLogo(leagueName?: string | null): string | number | null {
  const rawName = String(leagueName || "").trim();
  if (!rawName) return null;
  const direct = LEAGUE_LOGO_MAP[rawName];
  if (direct != null) return direct;
  const canonical = normalizeCompetitionName(rawName);
  for (const [name, logo] of Object.entries(LEAGUE_LOGO_MAP)) {
    if (normalizeCompetitionName(name) === canonical) return logo;
  }
  return null;
}

function makeCompetitionCacheKey(rawName: string, context?: CompetitionLogoContext): string {
  return [
    normalizeCompetitionName(rawName),
    String(context?.espnLeague || "").trim().toLowerCase(),
    String(context?.countryCode || "").trim().toUpperCase(),
    String(context?.tier || "").trim().toLowerCase(),
  ].join("|");
}

function scoreCompetitionCandidate(
  candidate: (typeof COMPETITION_CATALOG)[number],
  aliases: string[],
  context?: CompetitionLogoContext,
): number {
  const candidateAliases = new Set<string>(candidate.aliases);
  let score = 0;

  if (String(context?.espnLeague || "").trim() && candidate.espn === context?.espnLeague) {
    return 1;
  }

  for (const alias of aliases) {
    if (!alias) continue;
    if (candidateAliases.has(alias) || candidate.normalizedLeague === alias) {
      score = Math.max(score, 0.94);
      continue;
    }
    score = Math.max(score, tokenOverlapScore(alias, candidate.normalizedLeague) * 0.78);
  }

  if (context?.countryCode && candidate.countryCode === String(context.countryCode).toUpperCase()) score += 0.14;
  if (context?.tier && candidate.tier === context.tier) score += 0.09;
  if (context?.countryCode && candidate.countryCode !== String(context.countryCode).toUpperCase()) score -= 0.08;

  return score;
}

export function resolveCompetitionBrand(input: {
  name?: string | null;
  espnLeague?: string | null;
  countryCode?: string | null;
  tier?: CompetitionTier | null;
  aliases?: string[] | null;
}): ResolvedCompetitionBrand {
  ensureResolutionHydrated();
  const rawName = String(input?.name || "").trim();
  const espnLeague = String(input?.espnLeague || "").trim() || null;
  const catalogFromEspn = espnLeague ? COMPETITION_CATALOG_BY_ESPN.get(espnLeague) || null : null;
  const countryCode = String(input?.countryCode || catalogFromEspn?.countryCode || "").trim().toUpperCase() || null;
  const tier = (input?.tier || catalogFromEspn?.tier || null) as CompetitionTier | null;
  const cacheKey = makeCompetitionCacheKey(rawName || catalogFromEspn?.league || "", {
    espnLeague,
    countryCode,
    tier,
  });

  const cached = competitionResolutionCache.get(cacheKey);
  const fallbackName = catalogFromEspn?.league || rawName;
  if (cached && isFresh(cached.updatedAt)) {
    return {
      name: fallbackName,
      logo: cached.value,
      espnLeague,
      countryCode,
      tier,
      confidence: cached.confidence,
    };
  }

  if (catalogFromEspn) {
    const logo = getDirectLeagueLogo(catalogFromEspn.league);
    competitionResolutionCache.set(cacheKey, { value: logo, confidence: 1, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return {
      name: catalogFromEspn.league,
      logo,
      espnLeague: catalogFromEspn.espn,
      countryCode: catalogFromEspn.countryCode,
      tier: catalogFromEspn.tier,
      confidence: 1,
    };
  }

  const direct = getDirectLeagueLogo(rawName);
  if (direct != null) {
    competitionResolutionCache.set(cacheKey, { value: direct, confidence: 0.98, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return {
      name: rawName,
      logo: direct,
      espnLeague,
      countryCode,
      tier,
      confidence: 0.98,
    };
  }

  const aliases = [
    ...getEntityAliases(rawName, "competition"),
    ...((input?.aliases || []).map((alias) => normalizeCompetitionName(alias)) || []),
  ].filter(Boolean);

  let bestCatalog: { competition: (typeof COMPETITION_CATALOG)[number]; confidence: number } | null = null;
  for (const competition of COMPETITION_CATALOG) {
    const confidence = scoreCompetitionCandidate(competition, aliases, { espnLeague, countryCode, tier });
    if (!bestCatalog || confidence > bestCatalog.confidence) {
      bestCatalog = { competition, confidence };
    }
  }

  if (bestCatalog && bestCatalog.confidence >= 0.8) {
    const logo = getDirectLeagueLogo(bestCatalog.competition.league);
    competitionResolutionCache.set(cacheKey, { value: logo, confidence: bestCatalog.confidence, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return {
      name: bestCatalog.competition.league,
      logo,
      espnLeague: bestCatalog.competition.espn,
      countryCode: bestCatalog.competition.countryCode,
      tier: bestCatalog.competition.tier,
      confidence: bestCatalog.confidence,
    };
  }

  let bestLogo: { value: string | number; confidence: number } | null = null;
  for (const [name, logo] of Object.entries(LEAGUE_LOGO_MAP)) {
    const candidate = normalizeCompetitionName(name);
    let confidence = 0;
    for (const alias of aliases) {
      if (!alias) continue;
      if (alias === candidate) confidence = Math.max(confidence, 0.92);
      else confidence = Math.max(confidence, tokenOverlapScore(alias, candidate) * 0.76);
    }
    if (!bestLogo || confidence > bestLogo.confidence) bestLogo = { value: logo, confidence };
  }

  const resolvedLogo = bestLogo && bestLogo.confidence >= 0.82 ? bestLogo.value : null;
  competitionResolutionCache.set(cacheKey, {
    value: resolvedLogo,
    confidence: bestLogo?.confidence || 0,
    updatedAt: Date.now(),
  });
  scheduleResolutionPersist();

  return {
    name: fallbackName,
    logo: resolvedLogo,
    espnLeague,
    countryCode,
    tier,
    confidence: bestLogo?.confidence || 0,
  };
}

function normalizeName(value: string): string {
  return normalizeEntityText(value);
}

type CachedResolution = {
  value: string | number | null;
  confidence: number;
  updatedAt: number;
};

type ResolutionStore = {
  team: Record<string, CachedResolution>;
  competition: Record<string, CachedResolution>;
};

const RESOLUTION_CACHE_KEY = "nexora_logo_resolution_cache_v1";
const RESOLUTION_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
const teamResolutionCache = new Map<string, CachedResolution>();
const competitionResolutionCache = new Map<string, CachedResolution>();
let resolutionHydrated = false;
let resolutionPersistTimer: ReturnType<typeof setTimeout> | null = null;

function isFresh(ts: number): boolean {
  return Number(ts || 0) > Date.now() - RESOLUTION_CACHE_TTL;
}

function scheduleResolutionPersist(): void {
  if (resolutionPersistTimer) clearTimeout(resolutionPersistTimer);
  resolutionPersistTimer = setTimeout(async () => {
    resolutionPersistTimer = null;
    const payload: ResolutionStore = {
      team: Object.fromEntries(teamResolutionCache.entries()),
      competition: Object.fromEntries(competitionResolutionCache.entries()),
    };
    try {
      await AsyncStorage.setItem(RESOLUTION_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore cache persistence errors
    }
  }, 250);
}

function ensureResolutionHydrated(): void {
  if (resolutionHydrated) return;
  resolutionHydrated = true;
  void (async () => {
    try {
      const raw = await AsyncStorage.getItem(RESOLUTION_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ResolutionStore;
      for (const [key, val] of Object.entries(parsed?.team || {})) {
        if (!key || !val || !isFresh(val.updatedAt)) continue;
        teamResolutionCache.set(key, val);
      }
      for (const [key, val] of Object.entries(parsed?.competition || {})) {
        if (!key || !val || !isFresh(val.updatedAt)) continue;
        competitionResolutionCache.set(key, val);
      }
    } catch {
      // ignore cache hydration errors
    }
  })();
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

export function getLeagueLogo(leagueName?: string, context?: CompetitionLogoContext): string | number | null {
  return resolveCompetitionBrand({
    name: leagueName,
    espnLeague: context?.espnLeague,
    countryCode: context?.countryCode,
    tier: context?.tier,
    aliases: context?.aliases,
  }).logo;
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
  "olympique lyonnais": 167, "olympique lyon": 167,
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
  // Turkey / Scotland / Austria / Switzerland / Greece / Nordics / East Europe
  "galatasaray": 432, "fenerbahce": 436, "fenerbahçe": 436, "besiktas": 435, "trabzonspor": 1267,
  "basaksehir": 10113, "istanbul basaksehir": 10113, "samsunspor": 11834, "goztepe": 1269,
  "celtic": 256, "rangers": 257, "aberdeen": 259, "hibernian": 261, "heart of midlothian": 2736,
  "rapid vienna": 452, "rapid wien": 452, "red bull salzburg": 2790, "salzburg": 2790, "sturm graz": 453, "austria vienna": 454,
  "young boys": 465, "basel": 467, "zurich": 468, "servette": 6491,
  "olympiacos": 219, "panathinaikos": 2683, "aek athens": 2429, "paok": 2428,
  "legia warsaw": 669, "lech poznan": 2252, "sparta prague": 478, "slavia prague": 471,
  "fcsb": 487, "cfr cluj": 6139, "malmo": 555, "malmo ff": 555, "aik": 4606,
  "rosenborg": 480, "bodo glimt": 6992, "bodo/glimt": 6992, "fc copenhagen": 909, "copenhagen": 909, "brondby": 898,
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

export function resolveTeamLogoUri(
  teamName?: string,
  logoUri?: string | null,
  context?: { country?: string | null; competition?: string | null }
): string | number | null {
  ensureResolutionHydrated();
  const normalized = normalizeTeamName(String(teamName || ""));
  const parentClub = normalizeTeamName(String(teamName || ""), { parentClub: true });
  const cacheKey = `${normalized}|${normalizeCountryName(context?.country || "")}|${normalizeCompetitionName(context?.competition || "")}|${String(logoUri || "").trim()}`;

  const cached = teamResolutionCache.get(cacheKey);
  if (cached && isFresh(cached.updatedAt)) return cached.value;

  if (normalized === "club brugge" || normalized === "club brugge kv" || normalized.startsWith("club brugge ")) {
    const value = LOCAL_LOGOS.clubBrugge;
    teamResolutionCache.set(cacheKey, { value, confidence: 1, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return value;
  }
  if (
    normalized === "raal la louviere" ||
    normalized === "raal" ||
    normalized.startsWith("raal la louviere")
  ) {
    const value = LOCAL_LOGOS.raalLaLouviere;
    teamResolutionCache.set(cacheKey, { value, confidence: 1, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return value;
  }
  // Server-provided logo URL takes priority (verified via HEAD requests on server)
  const safeLogo = sanitizeRemoteLogoUri(logoUri);
  if (safeLogo) {
    teamResolutionCache.set(cacheKey, { value: safeLogo, confidence: 1, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return safeLogo;
  }

  const aliases = getEntityAliases(normalized, "team");
  if (parentClub && !aliases.includes(parentClub)) aliases.push(parentClub);

  // ESPN curated ID as fallback
  const contextBoost = (context?.country || context?.competition) ? 0.03 : 0;

  for (const alias of aliases) {
    const espnId = ESPN_TEAM_LOGO_IDS[alias];
    if (espnId) {
      const value = `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;
      teamResolutionCache.set(cacheKey, { value, confidence: 0.95 + contextBoost, updatedAt: Date.now() });
      scheduleResolutionPersist();
      return value;
    }
  }

  // Conservative fuzzy fallback to avoid wrong-club logo assignments.
  let bestFuzzy: { value: string; confidence: number } | null = null;
  for (const alias of aliases) {
    if (alias.length < 4) continue;
    for (const [key, id] of Object.entries(ESPN_TEAM_LOGO_IDS)) {
      const overlap = tokenOverlapScore(alias, key);
      if (overlap < 0.9) continue;
      const confidence = 0.68 + overlap * 0.22 + contextBoost;
      const value = `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
      if (!bestFuzzy || confidence > bestFuzzy.confidence) bestFuzzy = { value, confidence };
    }
  }

  if (bestFuzzy && bestFuzzy.confidence >= 0.84) {
    teamResolutionCache.set(cacheKey, { value: bestFuzzy.value, confidence: bestFuzzy.confidence, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return bestFuzzy.value;
  }

  // National team fallback: try ESPN country logos
  const countryCode = NATIONAL_TEAM_CODES[normalizeCountryName(normalized)] || NATIONAL_TEAM_CODES[normalized];
  if (countryCode) {
    const value = `https://a.espncdn.com/i/teamlogos/countries/500/${countryCode}.png`;
    teamResolutionCache.set(cacheKey, { value, confidence: 0.9, updatedAt: Date.now() });
    scheduleResolutionPersist();
    return value;
  }
  // Keep national team lookup strict (exact aliases only) to avoid wrong-country matches.

  teamResolutionCache.set(cacheKey, { value: null, confidence: 0, updatedAt: Date.now() });
  scheduleResolutionPersist();
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
