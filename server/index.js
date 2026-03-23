import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

// ESPN endpoints are used keyless as primary source.

const app = express();
// CORS: allow all in development, restrict to configured domain in production
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? {
  origin: (origin, cb) => {
    if (!origin || origin === allowedOrigin) cb(null, true);
    else cb(new Error("CORS not allowed"), false);
  },
  credentials: true,
} : undefined));
app.use(express.json({ limit: "10mb" }));
// Serve APK downloads (used for in-app update distribution)
app.use("/downloads", express.static(join(__dirname, "public", "downloads")));

// ── Simple in-memory rate limiter ────────────────────────────────────────────
// Prevents abuse of heavy endpoints (playlist parsing, TMDB calls)
function makeRateLimiter(maxPerWindow, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown");
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxPerWindow) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    next();
  };
}

const playlistLimiter = makeRateLimiter(10, 15 * 60 * 1000); // 10 per 15min
const tmdbLimiter = makeRateLimiter(60, 60 * 1000);          // 60 per minute


const PORT = process.env.PORT || 8080;
// Public URL used to generate absolute proxy links (set by Render automatically)
const PUBLIC_URL = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

// Rewrite image URLs that require Referer headers through our own proxy
function proxyPhotoUrl(url) {
  if (!url || !url.startsWith("http")) return url || null;
  if (/transfermarkt\.technology|img\.a\.transfermarkt|img\.[a-z]\.transfermarkt/i.test(url)) {
    return `${PUBLIC_URL}/api/img?url=${encodeURIComponent(url)}`;
  }
  return url;
}
const TZ = process.env.APP_TZ || "Europe/Brussels";

// -----------------------------
// Cache (in-memory)
// -----------------------------
const __cache = new Map(); // key -> { value, expiresAt, staleValue, staleAt }
const __inflight = new Map();

function cacheGet(key) {
  const item = __cache.get(key);
  if (!item) return null;
  if (Date.now() <= item.expiresAt) return item.value;
  return null;
}

function cacheGetStale(key) {
  const item = __cache.get(key);
  return item?.staleValue ?? null;
}

function cacheSet(key, value, ttlMs) {
  const now = Date.now();
  __cache.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleValue: value,
    staleAt: now,
  });
}

async function getOrFetch(key, ttlMs, fetcher) {
  const cached = cacheGet(key);
  if (cached) return cached;
  const existing = __inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const value = await fetcher();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      __inflight.delete(key);
    }
  })();
  __inflight.set(key, p);
  return p;
}

// -----------------------------
// Football fallback data source selection
// Primary is ESPN (keyless). APISPORTS/RapidAPI/SportSRC are optional fallbacks.
// -----------------------------

const APIFY_BASE = "https://api.apify.com/v2";
const SOFASCORE_API_BASE = "https://www.sofascore.com/api/v1";
const APIFY_TRANSFERMARKT_ACTOR = process.env.APIFY_TRANSFERMARKT_ACTOR || "data_xplorer/transfermarkt-api-scraper";
const APIFY_SOFASCORE_ACTOR = process.env.APIFY_SOFASCORE_ACTOR || "azzouzana/sofascore-scraper-pro";


const ESPN_SCOREBOARD_BASE = "https://site.web.api.espn.com/apis/v2/sports/soccer/scoreboard";
const ESPN_REQUEST_TIMEOUT_MS = Number(process.env.ESPN_TIMEOUT_MS || 4500);
const ESPN_LOOKAHEAD_DAYS = Number(process.env.ESPN_LOOKAHEAD_DAYS || 3);

// Per-league ESPN scoreboard URLs (more reliable than generic)
const ESPN_LEAGUE_SCOREBOARDS = {
  "Premier League": "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard",
  Championship: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard",
  "FA Cup": "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.fa/scoreboard",
  "UEFA Champions League": "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard",
  "UEFA Europa League": "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard",
  "UEFA Conference League": "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard",
  "La Liga": "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard",
  "La Liga 2": "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard",
  "Copa del Rey": "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.copa_del_rey/scoreboard",
  "Bundesliga": "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard",
  "2. Bundesliga": "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.2/scoreboard",
  "DFB Pokal": "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/scoreboard",
  "Jupiler Pro League": "https://site.api.espn.com/apis/site/v2/sports/soccer/bel.1/scoreboard",
  "Challenger Pro League": "https://site.api.espn.com/apis/site/v2/sports/soccer/bel.2/scoreboard",
  "Belgian Cup": "https://site.api.espn.com/apis/site/v2/sports/soccer/bel.cup/scoreboard",
  "Ligue 1": "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard",
  "Ligue 2": "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.2/scoreboard",
  "Coupe de France": "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.coupe_de_france/scoreboard",
  "Serie A": "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard",
  "Serie B": "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.2/scoreboard",
  "Coppa Italia": "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.coppa_italia/scoreboard",
  Eredivisie: "https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/scoreboard",
  "Eerste Divisie": "https://site.api.espn.com/apis/site/v2/sports/soccer/ned.2/scoreboard",
  "KNVB Beker": "https://site.api.espn.com/apis/site/v2/sports/soccer/ned.knvb_beker/scoreboard",
};

function ymdToEspnDate(ymd) {
  // ymd: YYYY-MM-DD
  return String(ymd || "").replaceAll("-", "");
}

async function espnScoreboard(dateYmd) {
  const dates = ymdToEspnDate(dateYmd);
  // Try per-league endpoints in parallel for better coverage
  const leagueUrls = Object.entries(ESPN_LEAGUE_SCOREBOARDS);
  const results = await Promise.allSettled(
    leagueUrls.map(async ([leagueName, baseUrl]) => {
      const url = `${baseUrl}?dates=${encodeURIComponent(dates)}&limit=20`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ESPN_REQUEST_TIMEOUT_MS);
      try {
        const resp = await fetch(url, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", "accept": "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return { events: [] };
        const data = await resp.json();
        // Add league name to events if missing
        const leagueSlug = String(baseUrl.match(/\/soccer\/([^/]+)\/scoreboard/)?.[1] || "");
        const events = (data?.events || []).map(ev => ({
          ...ev,
          _leagueHint: leagueName,
          _espnLeagueHint: leagueSlug,
        }));
        return { events };
      } catch {
        clearTimeout(timer);
        return { events: [] };
      }
    })
  );

  // Merge all events
  const allEvents = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      allEvents.push(...(r.value?.events || []));
    }
  }
  console.log(`[espn] scoreboard ${dates}: ${allEvents.length} events from ${leagueUrls.length} leagues`);

  // If per-league failed or returned nothing, try generic endpoint
  if (allEvents.length === 0) {
    const url = `${ESPN_SCOREBOARD_BASE}?dates=${encodeURIComponent(dates)}`;
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", "accept": "application/json" },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err = new Error(`ESPN error (${resp.status})`);
      err.statusCode = resp.status;
      err.details = text?.slice?.(0, 500);
      throw err;
    }
    return resp.json();
  }

  return { events: allEvents };
}

function normalizeStatusFromEspn(comp) {
  const state = comp?.status?.type?.state; // pre | in | post
  const clock = comp?.status?.displayClock;
  let minute = undefined;
  if (typeof clock === "string") {
    const mm = parseInt(clock.replace("'", "").trim(), 10);
    if (!Number.isNaN(mm)) minute = mm;
  }
  if (state === "in") return { status: "live", minute };
  if (state === "post") return { status: "finished", minute };
  return { status: "upcoming", minute };
}

// =============================================================
// FOOTBALL-LOGOS INTEGRATION (github.com/luukhopman/football-logos)
// High-quality 139×181 PNG club crests for 25 European leagues
// =============================================================
const FOOTBALL_LOGOS_BASE = "https://raw.githubusercontent.com/luukhopman/football-logos/master/logos";

// ESPN/Nexora league name → football-logos folder name
const LEAGUE_TO_LOGO_FOLDER = {
  "Premier League":           "England - Premier League",
  "Championship":             "England - Premier League",
  "EFL Championship":         "England - Premier League",
  "FA Cup":                   "England - Premier League",
  "EFL Cup":                  "England - Premier League",
  "League Cup":               "England - Premier League",
  "La Liga":                  "Spain - LaLiga",
  "LaLiga":                   "Spain - LaLiga",
  "Copa del Rey":             "Spain - LaLiga",
  "Bundesliga":               "Germany - Bundesliga",
  "DFB-Pokal":                "Germany - Bundesliga",
  "Serie A":                  "Italy - Serie A",
  "Coppa Italia":             "Italy - Serie A",
  "Ligue 1":                  "France - Ligue 1",
  "Coupe de France":          "France - Ligue 1",
  "Jupiler Pro League":       "Belgium - Jupiler Pro League",
  "Belgian Pro League":       "Belgium - Jupiler Pro League",
  "Belgian First Division A": "Belgium - Jupiler Pro League",
  "Challenger Pro League":    "Belgium - Challenger Pro League",
  "Belgian Second Division":  "Belgium - Challenger Pro League",
  "Eredivisie":               "Netherlands - Eredivisie",
  "KNVB Beker":               "Netherlands - Eredivisie",
  "Primeira Liga":            "Portugal - Liga Portugal",
  "Liga Portugal":            "Portugal - Liga Portugal",
  "Taça de Portugal":         "Portugal - Liga Portugal",
  "Scottish Premiership":     "Scotland - Scottish Premiership",
  "Premiership":              "Scotland - Scottish Premiership",
  "Super League":             "Switzerland - Super League",
  "Superliga":                "Denmark - Superliga",
  "Danish Superliga":         "Denmark - Superliga",
  "Eliteserien":              "Norway - Eliteserien",
  "Allsvenskan":              "Sweden - Allsvenskan",
  "Süper Lig":                "Türkiye - Süper Lig",
  "Super Lig":                "Türkiye - Süper Lig",
  "Turkish Super Lig":        "Türkiye - Süper Lig",
  "Ekstraklasa":              "Poland - PKO BP Ekstraklasa",
  "PKO BP Ekstraklasa":       "Poland - PKO BP Ekstraklasa",
  "efbet Liga":               "Bulgaria - efbet Liga",
  "SuperSport HNL":           "Croatia - SuperSport HNL",
  "HNL":                      "Croatia - SuperSport HNL",
  "Chance Liga":              "Czech Republic - Chance Liga",
  "Czech First League":       "Czech Republic - Chance Liga",
  "Super League 1":           "Greece - Super League 1",
  "Greek Super League":       "Greece - Super League 1",
  "Ligat ha'Al":              "Israel - Ligat ha'Al",
  "Israeli Premier League":   "Israel - Ligat ha'Al",
  "Premier Liga":             "Ukraine - Premier Liga",
  "Ukrainian Premier League": "Ukraine - Premier Liga",
  "SuperLiga":                "Romania - SuperLiga",
  "Romanian Liga 1":          "Romania - SuperLiga",
  "Super liga Srbije":        "Serbia - Super liga Srbije",
  "Serbian SuperLiga":        "Serbia - Super liga Srbije",
  "Austrian Bundesliga":      "Austria - Bundesliga",
  "Bundesliga (Austria)":     "Austria - Bundesliga",
  // UEFA competitions map to the relevant national folders (teams appear in their domestic league folder)
  "UEFA Champions League":    null,
  "Champions League":         null,
  "UEFA Europa League":       null,
  "Europa League":            null,
  "UEFA Conference League":   null,
  "Conference League":        null,
};

// Team name aliases: ESPN display name → football-logos filename (without .png)
const TEAM_LOGO_ALIASES = {
  // Belgium
  "club brugge kv": "Club Brugge KV", "club brugge": "Club Brugge KV",
  "krc genk": "KRC Genk", "genk": "KRC Genk",
  "royal antwerp": "Royal Antwerp FC", "antwerp": "Royal Antwerp FC",
  "kaa gent": "KAA Gent", "gent": "KAA Gent",
  "rsc anderlecht": "RSC Anderlecht", "anderlecht": "RSC Anderlecht",
  "standard liege": "Standard Liège", "standard de liege": "Standard Liège",
  "union saint-gilloise": "Union Saint-Gilloise", "union sg": "Union Saint-Gilloise", "union st. gilloise": "Union Saint-Gilloise",
  "cercle brugge": "Cercle Brugge", "oh leuven": "Oud-Heverlee Leuven", "oud-heverlee leuven": "Oud-Heverlee Leuven",
  "kv mechelen": "KV Mechelen", "mechelen": "KV Mechelen",
  "sint-truidense vv": "Sint-Truidense VV", "sint-truiden": "Sint-Truidense VV", "stvv": "Sint-Truidense VV",
  "kvc westerlo": "KVC Westerlo", "westerlo": "KVC Westerlo",
  "fcv dender eh": "FCV Dender EH", "dender": "FCV Dender EH",
  "zulte waregem": "Zulte Waregem",
  "raal la louviere": "RAAL La Louvière", "raal": "RAAL La Louvière",
  "royal charleroi sc": "Royal Charleroi SC", "charleroi": "Royal Charleroi SC",
  // England
  "arsenal": "Arsenal FC", "arsenal fc": "Arsenal FC",
  "aston villa": "Aston Villa",
  "bournemouth": "AFC Bournemouth", "afc bournemouth": "AFC Bournemouth",
  "brentford": "Brentford FC", "brentford fc": "Brentford FC",
  "brighton & hove albion": "Brighton & Hove Albion", "brighton": "Brighton & Hove Albion",
  "burnley": "Burnley FC", "burnley fc": "Burnley FC",
  "chelsea": "Chelsea FC", "chelsea fc": "Chelsea FC",
  "crystal palace": "Crystal Palace",
  "everton": "Everton FC", "everton fc": "Everton FC",
  "fulham": "Fulham FC", "fulham fc": "Fulham FC",
  "leeds united": "Leeds United",
  "liverpool": "Liverpool FC", "liverpool fc": "Liverpool FC",
  "manchester city": "Manchester City", "man city": "Manchester City",
  "manchester united": "Manchester United", "man united": "Manchester United", "man utd": "Manchester United",
  "newcastle united": "Newcastle United", "newcastle": "Newcastle United",
  "nottingham forest": "Nottingham Forest", "nott'm forest": "Nottingham Forest",
  "sunderland": "Sunderland AFC", "sunderland afc": "Sunderland AFC",
  "tottenham hotspur": "Tottenham Hotspur", "tottenham": "Tottenham Hotspur", "spurs": "Tottenham Hotspur",
  "west ham united": "West Ham United", "west ham": "West Ham United",
  "wolverhampton wanderers": "Wolverhampton Wanderers", "wolves": "Wolverhampton Wanderers",
  // Spain
  "real madrid": "Real Madrid", "real madrid cf": "Real Madrid",
  "barcelona": "FC Barcelona", "fc barcelona": "FC Barcelona",
  "atletico madrid": "Atlético de Madrid", "atletico de madrid": "Atlético de Madrid", "atl. madrid": "Atlético de Madrid",
  "real sociedad": "Real Sociedad",
  "real betis": "Real Betis Balompié", "real betis balompie": "Real Betis Balompié",
  "villarreal": "Villarreal CF", "villarreal cf": "Villarreal CF",
  "athletic bilbao": "Athletic Bilbao", "athletic club": "Athletic Bilbao",
  "sevilla": "Sevilla FC", "sevilla fc": "Sevilla FC",
  "valencia": "Valencia CF", "valencia cf": "Valencia CF",
  "girona": "Girona FC", "girona fc": "Girona FC",
  "celta vigo": "Celta de Vigo", "celta de vigo": "Celta de Vigo",
  "getafe": "Getafe CF", "getafe cf": "Getafe CF",
  "rayo vallecano": "Rayo Vallecano",
  "osasuna": "CA Osasuna", "ca osasuna": "CA Osasuna",
  "mallorca": "RCD Mallorca", "rcd mallorca": "RCD Mallorca",
  "alaves": "Deportivo Alavés", "deportivo alaves": "Deportivo Alavés",
  "espanyol": "RCD Espanyol Barcelona", "rcd espanyol": "RCD Espanyol Barcelona",
  "elche": "Elche CF", "elche cf": "Elche CF",
  "real oviedo": "Real Oviedo",
  "levante": "Levante UD", "levante ud": "Levante UD",
  // Germany
  "bayern munich": "Bayern Munich", "fc bayern munich": "Bayern Munich", "bayern munchen": "Bayern Munich", "bayern": "Bayern Munich",
  "borussia dortmund": "Borussia Dortmund", "dortmund": "Borussia Dortmund", "bvb": "Borussia Dortmund",
  "rb leipzig": "RB Leipzig", "rasenballsport leipzig": "RB Leipzig",
  "bayer leverkusen": "Bayer 04 Leverkusen", "bayer 04 leverkusen": "Bayer 04 Leverkusen", "leverkusen": "Bayer 04 Leverkusen",
  "sc freiburg": "SC Freiburg", "freiburg": "SC Freiburg",
  "eintracht frankfurt": "Eintracht Frankfurt", "frankfurt": "Eintracht Frankfurt",
  "vfl wolfsburg": "VfL Wolfsburg", "wolfsburg": "VfL Wolfsburg",
  "tsg hoffenheim": "TSG 1899 Hoffenheim", "hoffenheim": "TSG 1899 Hoffenheim",
  "borussia monchengladbach": "Borussia Mönchengladbach", "gladbach": "Borussia Mönchengladbach", "monchengladbach": "Borussia Mönchengladbach",
  "vfb stuttgart": "VfB Stuttgart", "stuttgart": "VfB Stuttgart",
  "fc augsburg": "FC Augsburg", "augsburg": "FC Augsburg",
  "1. fc union berlin": "1.FC Union Berlin", "union berlin": "1.FC Union Berlin",
  "werder bremen": "SV Werder Bremen", "werder": "SV Werder Bremen",
  "1. fc heidenheim": "1.FC Heidenheim 1846", "heidenheim": "1.FC Heidenheim 1846",
  "1. fc koln": "1.FC Köln", "koln": "1.FC Köln", "cologne": "1.FC Köln", "fc cologne": "1.FC Köln", "1. fc cologne": "1.FC Köln",
  "fc st. pauli": "FC St. Pauli", "st. pauli": "FC St. Pauli",
  // Italy
  "inter milan": "Inter Milan", "inter": "Inter Milan", "internazionale": "Inter Milan",
  "ac milan": "AC Milan", "milan": "AC Milan",
  "juventus": "Juventus FC", "juventus fc": "Juventus FC",
  "napoli": "SSC Napoli", "ssc napoli": "SSC Napoli",
  "atalanta": "Atalanta BC", "atalanta bc": "Atalanta BC",
  "roma": "AS Roma", "as roma": "AS Roma",
  "lazio": "SS Lazio", "ss lazio": "SS Lazio",
  "fiorentina": "ACF Fiorentina", "acf fiorentina": "ACF Fiorentina",
  "torino": "Torino FC", "torino fc": "Torino FC",
  "bologna": "Bologna FC 1909", "bologna fc": "Bologna FC 1909",
  "udinese": "Udinese Calcio", "udinese calcio": "Udinese Calcio",
  "sassuolo": "US Sassuolo", "us sassuolo": "US Sassuolo",
  "lecce": "US Lecce", "us lecce": "US Lecce",
  "cagliari": "Cagliari Calcio", "cagliari calcio": "Cagliari Calcio",
  "hellas verona": "Hellas Verona", "verona": "Hellas Verona",
  "genoa": "Genoa CFC", "genoa cfc": "Genoa CFC",
  "como": "Como 1907", "como 1907": "Como 1907",
  "parma": "Parma Calcio 1913", "parma calcio": "Parma Calcio 1913",
  // France
  "paris saint-germain": "Paris Saint-Germain", "psg": "Paris Saint-Germain",
  "olympique marseille": "Olympique Marseille", "marseille": "Olympique Marseille", "om": "Olympique Marseille",
  "olympique lyonnais": "Olympique Lyon", "lyon": "Olympique Lyon", "ol": "Olympique Lyon", "olympique lyon": "Olympique Lyon",
  "monaco": "AS Monaco", "as monaco": "AS Monaco",
  "lille": "LOSC Lille", "losc lille": "LOSC Lille", "losc": "LOSC Lille",
  "rennes": "Stade Rennais FC", "stade rennais": "Stade Rennais FC",
  "nice": "OGC Nice", "ogc nice": "OGC Nice",
  "lens": "RC Lens", "rc lens": "RC Lens",
  "strasbourg": "RC Strasbourg Alsace", "rc strasbourg": "RC Strasbourg Alsace",
  "nantes": "FC Nantes", "fc nantes": "FC Nantes",
  "toulouse": "FC Toulouse", "toulouse fc": "FC Toulouse",
  "stade brestois": "Stade Brestois 29", "brest": "Stade Brestois 29",
  "le havre": "Le Havre AC", "le havre ac": "Le Havre AC",
  "lorient": "FC Lorient", "fc lorient": "FC Lorient",
  "metz": "FC Metz", "fc metz": "FC Metz",
  // Netherlands
  "ajax": "Ajax Amsterdam", "afc ajax": "Ajax Amsterdam",
  "psv eindhoven": "PSV Eindhoven", "psv": "PSV Eindhoven",
  "feyenoord": "Feyenoord Rotterdam", "feyenoord rotterdam": "Feyenoord Rotterdam",
  "az alkmaar": "AZ Alkmaar", "az": "AZ Alkmaar",
  "fc twente": "Twente Enschede FC", "twente": "Twente Enschede FC",
  "fc utrecht": "FC Utrecht", "utrecht": "FC Utrecht",
  // Portugal
  "benfica": "SL Benfica", "sl benfica": "SL Benfica",
  "porto": "FC Porto", "fc porto": "FC Porto",
  "sporting cp": "Sporting CP", "sporting lisbon": "Sporting CP", "sporting": "Sporting CP",
  "sporting braga": "SC Braga", "sc braga": "SC Braga", "braga": "SC Braga",
  "vitoria guimaraes": "Vitória SC", "vitoria sc": "Vitória SC",
  "boavista": "Boavista FC", "boavista fc": "Boavista FC",
  "gil vicente": "Gil Vicente FC", "gil vicente fc": "Gil Vicente FC",
  "casa pia": "Casa Pia AC", "casa pia ac": "Casa Pia AC",
  "famalicao": "FC Famalicão", "fc famalicao": "FC Famalicão",
  "rio ave": "Rio Ave FC", "rio ave fc": "Rio Ave FC",
  "estrela amadora": "CF Estrela da Amadora", "cf estrela da amadora": "CF Estrela da Amadora",
  "arouca": "FC Arouca", "fc arouca": "FC Arouca",
  "moreirense": "Moreirense FC", "moreirense fc": "Moreirense FC",
  // Scotland
  "celtic": "Celtic FC", "celtic fc": "Celtic FC",
  "rangers": "Rangers FC", "rangers fc": "Rangers FC",
  "hearts": "Heart of Midlothian", "heart of midlothian": "Heart of Midlothian",
  "aberdeen": "Aberdeen FC", "aberdeen fc": "Aberdeen FC",
  "hibernian": "Hibernian FC", "hibernian fc": "Hibernian FC",
  "dundee united": "Dundee United",
  "st mirren": "St Mirren",
  "kilmarnock": "Kilmarnock FC", "kilmarnock fc": "Kilmarnock FC",
  "motherwell": "Motherwell FC", "motherwell fc": "Motherwell FC",
  "ross county": "Ross County FC",
  "livingston": "Livingston FC",
  "st johnstone": "St Johnstone",
  // Netherlands (expanded)
  "sc heerenveen": "SC Heerenveen", "heerenveen": "SC Heerenveen",
  "nec nijmegen": "NEC Nijmegen", "nec": "NEC Nijmegen",
  "fortuna sittard": "Fortuna Sittard",
  "go ahead eagles": "Go Ahead Eagles",
  "sparta rotterdam": "Sparta Rotterdam", "sparta": "Sparta Rotterdam",
  "heracles almelo": "Heracles Almelo", "heracles": "Heracles Almelo",
  "pec zwolle": "PEC Zwolle",
  "willem ii": "Willem II",
  "excelsior": "Excelsior Rotterdam", "excelsior rotterdam": "Excelsior Rotterdam",
  "fc volendam": "FC Volendam", "volendam": "FC Volendam",
  // England (expanded)
  // Turkey
  "galatasaray": "Galatasaray", "galatasaray sk": "Galatasaray",
  "fenerbahce": "Fenerbahce", "fenerbahce sk": "Fenerbahce",
  "besiktas": "Besiktas JK", "besiktas jk": "Besiktas JK",
  "trabzonspor": "Trabzonspor",
  "istanbul basaksehir": "Basaksehir FK", "basaksehir": "Basaksehir FK",
  // Denmark
  "fc copenhagen": "FC København", "fc kobenhavn": "FC København", "copenhagen": "FC København",
  "fc midtjylland": "FC Midtjylland", "midtjylland": "FC Midtjylland",
  "brondby": "Brøndby IF", "brondby if": "Brøndby IF",
  "fc nordsjaelland": "FC Nordsjælland", "nordsjaelland": "FC Nordsjælland",
  "aarhus gf": "Aarhus GF", "agf": "Aarhus GF",
  // Switzerland
  "bsc young boys": "BSC Young Boys", "young boys": "BSC Young Boys",
  "fc basel": "FC Basel 1893", "basel": "FC Basel 1893",
  "fc zurich": "FC Zürich", "zurich": "FC Zürich",
  "servette": "Servette FC", "servette fc": "Servette FC",
  "fc lugano": "FC Lugano", "lugano": "FC Lugano",
  // Belgium (expanded)
  "kv kortrijk": "KV Kortrijk", "kortrijk": "KV Kortrijk",
  "rwdm": "RWDM", "rwd molenbeek": "RWDM",
  "beerschot va": "Beerschot VA", "beerschot": "Beerschot VA",
  // Belgian second division (Challenger Pro League) — additional teams (2025-26 season)
  "lommel sk": "Lommel SK", "lommel": "Lommel SK",
  "lierse kempenzonen": "Lierse Kempenzonen", "lierse": "Lierse Kempenzonen",
  "sk beveren": "SK Beveren", "beveren": "SK Beveren",
  "club nl": "Club NXT", "club nxt": "Club NXT", "club brugge nxt": "Club NXT",
  "patro eisden maasmechelen": "Patro Eisden Maasmechelen", "patro eisden": "Patro Eisden Maasmechelen", "patro": "Patro Eisden Maasmechelen",
  "francs borains": "Francs Borains", "rfc francs borains": "Francs Borains",
  "virton": "Royal Excelsior Virton", "excelsior virton": "Royal Excelsior Virton", "re virton": "Royal Excelsior Virton",
  "rfc liege": "RFC Liège", "rfc liège": "RFC Liège", "fc liege": "RFC Liège", "liege": "RFC Liège", "liège": "RFC Liège",
  "lokeren-temse": "Lokeren-Temse", "sporting lokeren-temse": "Lokeren-Temse", "lokeren": "Lokeren-Temse",
  "fcv dender": "FCV Dender EH", "dender": "FCV Dender EH", "dender eh": "FCV Dender EH",
  "rsca futures": "RSC Anderlecht Futures", "anderlecht futures": "RSC Anderlecht Futures",
  "rsc anderlecht futures": "RSC Anderlecht Futures",
  "zulte waregem": "Zulte Waregem", "sv zulte waregem": "Zulte Waregem",
  "kv oostende": "KV Oostende", "oostende": "KV Oostende", "kvo": "KV Oostende",
  // France (expanded)
  "rc strasbourg alsace": "RC Strasbourg Alsace",
  "angers": "Angers SCO", "angers sco": "Angers SCO",
  "auxerre": "AJ Auxerre", "aj auxerre": "AJ Auxerre",
  // Spain (expanded)
  // Germany (expanded)
  "mainz 05": "1.FSV Mainz 05", "mainz": "1.FSV Mainz 05", "1. fsv mainz 05": "1.FSV Mainz 05", "1.fsv mainz 05": "1.FSV Mainz 05", "fsv mainz": "1.FSV Mainz 05",
  "hamburger sv": "Hamburger SV", "hamburg": "Hamburger SV", "hsv": "Hamburger SV",
  // Italy (expanded)
  "ac milan": "AC Milan",
  "cremonese": "US Cremonese",
  // Norway
  "bodo glimt": "FK Bodø/Glimt", "bodo/glimt": "FK Bodø/Glimt", "fk bodo glimt": "FK Bodø/Glimt",
  "rosenborg": "Rosenborg BK", "rosenborg bk": "Rosenborg BK",
  "molde": "Molde FK", "molde fk": "Molde FK",
  "viking": "Viking FK", "viking fk": "Viking FK",
  "brann": "SK Brann", "sk brann": "SK Brann",
  // Sweden
  "malmo ff": "Malmö FF", "malmo": "Malmö FF",
  "djurgarden": "Djurgårdens IF", "djurgardens if": "Djurgårdens IF",
  "hammarby": "Hammarby IF", "hammarby if": "Hammarby IF",
  "aik": "AIK",
  // Poland
  "legia warsaw": "Legia Warszawa", "legia warszawa": "Legia Warszawa",
  "lech poznan": "Lech Poznan", "lech": "Lech Poznan",
  "rakow czestochowa": "Raków Częstochowa", "rakow": "Raków Częstochowa",
  // Croatia
  "dinamo zagreb": "GNK Dinamo Zagreb", "gnk dinamo zagreb": "GNK Dinamo Zagreb",
  "hajduk split": "HNK Hajduk Split", "hnk hajduk split": "HNK Hajduk Split",
  // Greece
  "olympiacos": "Olympiacos FC", "olympiacos fc": "Olympiacos FC", "olympiakos": "Olympiacos FC",
  "panathinaikos": "Panathinaikos FC", "panathinaikos fc": "Panathinaikos FC",
  "aek athens": "AEK Athens", "aek athens fc": "AEK Athens", "aek athene": "AEK Athens",
  // Cyprus
  "aek larnaca": "AEK Larnaca", "aek larnaca fc": "AEK Larnaca", "aek larnaka": "AEK Larnaca",
  "paok": "PAOK FC", "paok fc": "PAOK FC",
  // Czech Republic
  "sparta prague": "AC Sparta Prague", "ac sparta praha": "AC Sparta Prague", "sparta praha": "AC Sparta Prague", "ac sparta prague": "AC Sparta Prague", "sparta praag": "AC Sparta Prague",
  "slavia prague": "SK Slavia Prague",
  "sigma olomouc": "SK Sigma Olomouc", "sk sigma olomouc": "SK Sigma Olomouc", "sk slavia praha": "SK Slavia Prague", "slavia praha": "SK Slavia Prague", "sk slavia prague": "SK Slavia Prague",
  // Serbia
  "red star belgrade": "FK Crvena zvezda", "crvena zvezda": "FK Crvena zvezda", "fk crvena zvezda": "FK Crvena zvezda",
  "partizan belgrade": "FK Partizan", "fk partizan": "FK Partizan", "partizan": "FK Partizan",
  // Romania
  "fcsb": "FCSB", "steaua bucharest": "FCSB",
  "cfr cluj": "CFR Cluj",
  // Ukraine
  "shakhtar donetsk": "Shakhtar Donetsk", "shakhtar": "Shakhtar Donetsk", "fc shakhtar donetsk": "Shakhtar Donetsk", "shaktar donetsk": "Shakhtar Donetsk",
  "dynamo kyiv": "FC Dynamo Kyiv", "dynamo kiev": "FC Dynamo Kyiv",
  // Israel
  "maccabi tel aviv": "Maccabi Tel Aviv FC", "maccabi tel-aviv": "Maccabi Tel Aviv FC",
  "maccabi haifa": "Maccabi Haifa FC",
  "hapoel beer sheva": "Hapoel Beer Sheva FC",
  // Bulgaria
  "ludogorets": "PFC Ludogorets Razgrad", "ludogorets razgrad": "PFC Ludogorets Razgrad",
  "cska sofia": "PFC CSKA Sofia",
  "levski sofia": "PFC Levski Sofia",
  // ── UEL / UECL regulars (expanded) ──────────────────────────────
  // Austria
  "rapid wien": "SK Rapid Wien", "sk rapid wien": "SK Rapid Wien", "rapid vienna": "SK Rapid Wien",
  "austria wien": "FK Austria Wien", "fk austria wien": "FK Austria Wien", "austria vienna": "FK Austria Wien",
  "lask": "LASK", "lask linz": "LASK",
  "wolfsberger ac": "Wolfsberger AC", "wolfsberger": "Wolfsberger AC", "wac": "Wolfsberger AC",
  "red bull salzburg": "FC Red Bull Salzburg", "rb salzburg": "FC Red Bull Salzburg", "salzburg": "FC Red Bull Salzburg",
  "sturm graz": "SK Sturm Graz", "sk sturm graz": "SK Sturm Graz",
  // Cyprus
  "apoel nicosia": "APOEL FC", "apoel": "APOEL FC", "apoel fc": "APOEL FC",
  "omonia nicosia": "AC Omonia", "ac omonia": "AC Omonia", "omonia": "AC Omonia",
  "aris limassol": "Aris Limassol FC", "aris limassol fc": "Aris Limassol FC",
  "anorthosis famagusta": "Anorthosis Famagusta",
  "pafos fc": "Pafos FC", "pafos": "Pafos FC",
  // Scotland (UEL/UECL)
  "st johnstone fc": "St Johnstone",
  // Turkey (expanded)
  "sivasspor": "Sivasspor",
  "konyaspor": "Konyaspor",
  "kasimpasa": "Kasimpasa", "kasimpasa sk": "Kasimpasa",
  "antalyaspor": "Antalyaspor",
  // Hungary
  "ferencvaros": "Ferencvárosi TC", "ferencvarosi tc": "Ferencvárosi TC", "ferencvaros tc": "Ferencvárosi TC",
  "puskas akademia": "Puskás Akadémia FC", "puskas akademia fc": "Puskás Akadémia FC",
  "mol fehervar": "MOL Fehérvár FC", "mol fehervar fc": "MOL Fehérvár FC", "videoton": "MOL Fehérvár FC",
  // Slovakia
  "slovan bratislava": "ŠK Slovan Bratislava", "sk slovan bratislava": "ŠK Slovan Bratislava",
  // Kazakhstan
  "astana": "FK Astana", "fk astana": "FK Astana",
  // Armenia
  "pyunik yerevan": "FC Pyunik", "pyunik": "FC Pyunik",
  // Azerbaijan
  "qarabag": "Qarabağ FK", "qarabag fk": "Qarabağ FK",
  "neftchi baku": "Neftçi PFK", "neftci baku": "Neftçi PFK",
  // Georgia
  "dinamo tbilisi": "FC Dinamo Tbilisi", "fc dinamo tbilisi": "FC Dinamo Tbilisi",
  // Finland
  "hjk helsinki": "HJK Helsinki", "hjk": "HJK Helsinki",
  // Iceland
  "vikingur reykjavik": "Víkingur Reykjavík",
  // Albania
  "partizani tirana": "FK Partizani", "fk partizani": "FK Partizani",
  // Slovakia (expanded)
  "spartak trnava": "Spartak Trnava",
  // Republic of Ireland
  "shamrock rovers": "Shamrock Rovers FC", "shamrock rovers fc": "Shamrock Rovers FC",
  // Luxembourg
  "f91 dudelange": "F91 Dudelange", "dudelange": "F91 Dudelange",
  // North Macedonia
  "shkendija": "KF Shkëndija", "shkendija tetovo": "KF Shkëndija",
  // Moldova
  "sheriff tiraspol": "FC Sheriff Tiraspol", "sheriff": "FC Sheriff Tiraspol",
  // Belarus
  "bate borisov": "FC BATE Borisov", "bate": "FC BATE Borisov",
  // Lithuania
  "zalgiris vilnius": "FK Žalgiris", "zalgiris": "FK Žalgiris",
  // Latvia
  "riga fc": "Riga FC", "riga": "Riga FC",
  // Estonia
  "flora tallinn": "FC Flora", "fc flora": "FC Flora",
  // Bosnia
  "zrinjski mostar": "HŠK Zrinjski", "zrinjski": "HŠK Zrinjski",
  // Montenegro
  "buducnost podgorica": "FK Budućnost Podgorica", "buducnost": "FK Budućnost Podgorica",
  // Slovenia
  "olimpija ljubljana": "NK Olimpija Ljubljana", "nk olimpija": "NK Olimpija Ljubljana",
  "maribor": "NK Maribor", "nk maribor": "NK Maribor",
  // Italy (UEL/UECL extras)
  "us cremonese": "US Cremonese",
};

// Reverse lookup: team filename → domestic league folder
// Built once at startup from TEAM_LOGO_ALIASES + LEAGUE_TO_LOGO_FOLDER
const TEAM_FILENAME_TO_FOLDER = (() => {
  const map = {};
  // Group aliases by the comment-section they belong to (Belgium, England, etc.)
  // We build it by mapping each alias fileName to ALL league folders that could contain it.
  // Strategy: team aliases are grouped by country in comments. We map fileName → country folder.
  const fileNameToCountry = {};
  // Build from the alias table: each alias entry has a filename value.
  // The comment structure shows which country group each team belongs to.
  // We can infer via the known folder list.
  const folderByCountryKeyword = {};
  for (const [, folder] of Object.entries(LEAGUE_TO_LOGO_FOLDER)) {
    if (!folder) continue;
    // Extract country part: "England - Premier League" → "england"
    const country = folder.split(" - ")[0].toLowerCase().trim();
    if (!folderByCountryKeyword[country]) folderByCountryKeyword[country] = folder;
  }
  // Hard-map known teams to their domestic folder by filename patterns
  const teamCountryMap = {
    // Belgium
    "Club Brugge KV": "Belgium - Jupiler Pro League", "KRC Genk": "Belgium - Jupiler Pro League",
    "Royal Antwerp FC": "Belgium - Jupiler Pro League", "KAA Gent": "Belgium - Jupiler Pro League",
    "RSC Anderlecht": "Belgium - Jupiler Pro League", "Standard Liège": "Belgium - Jupiler Pro League",
    "Union Saint-Gilloise": "Belgium - Jupiler Pro League", "Cercle Brugge": "Belgium - Jupiler Pro League",
    "Oud-Heverlee Leuven": "Belgium - Jupiler Pro League", "KV Mechelen": "Belgium - Jupiler Pro League",
    "Sint-Truidense VV": "Belgium - Jupiler Pro League", "KVC Westerlo": "Belgium - Jupiler Pro League",
    "FCV Dender EH": "Belgium - Jupiler Pro League", "Zulte Waregem": "Belgium - Jupiler Pro League",
    "RAAL La Louvière": "Belgium - Jupiler Pro League", "Royal Charleroi SC": "Belgium - Jupiler Pro League",
    "KV Kortrijk": "Belgium - Jupiler Pro League", "RWDM": "Belgium - Jupiler Pro League",
    "Beerschot VA": "Belgium - Jupiler Pro League",
    // England
    "Arsenal FC": "England - Premier League", "Aston Villa": "England - Premier League",
    "AFC Bournemouth": "England - Premier League", "Brentford FC": "England - Premier League",
    "Brighton & Hove Albion": "England - Premier League", "Burnley FC": "England - Premier League",
    "Chelsea FC": "England - Premier League", "Crystal Palace": "England - Premier League",
    "Everton FC": "England - Premier League", "Fulham FC": "England - Premier League",
    "Leeds United": "England - Premier League", "Liverpool FC": "England - Premier League",
    "Manchester City": "England - Premier League", "Manchester United": "England - Premier League",
    "Newcastle United": "England - Premier League", "Nottingham Forest": "England - Premier League",
    "Sunderland AFC": "England - Premier League", "Tottenham Hotspur": "England - Premier League",
    "West Ham United": "England - Premier League", "Wolverhampton Wanderers": "England - Premier League",       
    // Spain
    "Real Madrid": "Spain - LaLiga", "FC Barcelona": "Spain - LaLiga",
    "Atlético de Madrid": "Spain - LaLiga", "Real Sociedad": "Spain - LaLiga",
    "Real Betis Balompié": "Spain - LaLiga", "Villarreal CF": "Spain - LaLiga",
    "Athletic Bilbao": "Spain - LaLiga", "Sevilla FC": "Spain - LaLiga",
    "Valencia CF": "Spain - LaLiga", "Girona FC": "Spain - LaLiga",
    "Celta de Vigo": "Spain - LaLiga", "Getafe CF": "Spain - LaLiga",
    "Rayo Vallecano": "Spain - LaLiga", "CA Osasuna": "Spain - LaLiga",
    "RCD Mallorca": "Spain - LaLiga", "Deportivo Alavés": "Spain - LaLiga",
    "RCD Espanyol Barcelona": "Spain - LaLiga", "Elche CF": "Spain - LaLiga",
    "Real Oviedo": "Spain - LaLiga", "Levante UD": "Spain - LaLiga",   
    // Germany
    "Bayern Munich": "Germany - Bundesliga", "Borussia Dortmund": "Germany - Bundesliga",
    "RB Leipzig": "Germany - Bundesliga", "Bayer 04 Leverkusen": "Germany - Bundesliga",
    "SC Freiburg": "Germany - Bundesliga", "Eintracht Frankfurt": "Germany - Bundesliga",
    "VfL Wolfsburg": "Germany - Bundesliga", "TSG 1899 Hoffenheim": "Germany - Bundesliga",
    "Borussia Mönchengladbach": "Germany - Bundesliga", "VfB Stuttgart": "Germany - Bundesliga",
    "FC Augsburg": "Germany - Bundesliga", "1.FC Union Berlin": "Germany - Bundesliga",
    "SV Werder Bremen": "Germany - Bundesliga", "1.FC Heidenheim 1846": "Germany - Bundesliga",
    "1.FC Köln": "Germany - Bundesliga", 
    "FC St. Pauli": "Germany - Bundesliga", 
    "1.FSV Mainz 05": "Germany - Bundesliga",   "Hamburger SV": "Germany - Bundesliga", 
    // Italy
    "Inter Milan": "Italy - Serie A", "AC Milan": "Italy - Serie A",
    "Juventus FC": "Italy - Serie A", "SSC Napoli": "Italy - Serie A",
    "Atalanta BC": "Italy - Serie A", "AS Roma": "Italy - Serie A",
    "SS Lazio": "Italy - Serie A", "ACF Fiorentina": "Italy - Serie A",
    "Torino FC": "Italy - Serie A", "Bologna FC 1909": "Italy - Serie A",
    "Udinese Calcio": "Italy - Serie A", 
    "US Sassuolo": "Italy - Serie A", 
    "US Lecce": "Italy - Serie A", "Cagliari Calcio": "Italy - Serie A",
    "Hellas Verona": "Italy - Serie A", "Genoa CFC": "Italy - Serie A", 
    "Como 1907": "Italy - Serie A", 
    "Parma Calcio 1913": "Italy - Serie A",  "US Cremonese": "Italy - Serie A",
    // France
    "Paris Saint-Germain": "France - Ligue 1", "Olympique Marseille": "France - Ligue 1",
    "Olympique Lyon": "France - Ligue 1", "AS Monaco": "France - Ligue 1",
    "LOSC Lille": "France - Ligue 1", "Stade Rennais FC": "France - Ligue 1",
    "OGC Nice": "France - Ligue 1", "RC Lens": "France - Ligue 1",
    "RC Strasbourg Alsace": "France - Ligue 1", "FC Nantes": "France - Ligue 1",
    "FC Toulouse": "France - Ligue 1", 
    "Stade Brestois 29": "France - Ligue 1", 
    "Le Havre AC": "France - Ligue 1", 
    "FC Lorient": "France - Ligue 1", "FC Metz": "France - Ligue 1",
    "Angers SCO": "France - Ligue 1", "AJ Auxerre": "France - Ligue 1",
    // Netherlands
    "Ajax Amsterdam": "Netherlands - Eredivisie", "PSV Eindhoven": "Netherlands - Eredivisie",
    "Feyenoord Rotterdam": "Netherlands - Eredivisie", "AZ Alkmaar": "Netherlands - Eredivisie",
    "Twente Enschede FC": "Netherlands - Eredivisie", "FC Utrecht": "Netherlands - Eredivisie",
    "SC Heerenveen": "Netherlands - Eredivisie", 
    "NEC Nijmegen": "Netherlands - Eredivisie", "Fortuna Sittard": "Netherlands - Eredivisie",
    "Go Ahead Eagles": "Netherlands - Eredivisie", 
    "Sparta Rotterdam": "Netherlands - Eredivisie", "Heracles Almelo": "Netherlands - Eredivisie",
    "PEC Zwolle": "Netherlands - Eredivisie", "Willem II": "Netherlands - Eredivisie",
    "Excelsior Rotterdam": "Netherlands - Eredivisie", "FC Volendam": "Netherlands - Eredivisie",
    // Portugal
    "SL Benfica": "Portugal - Liga Portugal", "FC Porto": "Portugal - Liga Portugal",
    "Sporting CP": "Portugal - Liga Portugal", "SC Braga": "Portugal - Liga Portugal",
    "Vitória SC": "Portugal - Liga Portugal", "Boavista FC": "Portugal - Liga Portugal",
    "Gil Vicente FC": "Portugal - Liga Portugal", "Casa Pia AC": "Portugal - Liga Portugal",
    "FC Famalicão": "Portugal - Liga Portugal", "Rio Ave FC": "Portugal - Liga Portugal",
    "CF Estrela da Amadora": "Portugal - Liga Portugal", "FC Arouca": "Portugal - Liga Portugal",
    "Moreirense FC": "Portugal - Liga Portugal",
    // Scotland
    "Celtic FC": "Scotland - Scottish Premiership", "Rangers FC": "Scotland - Scottish Premiership",
    "Heart of Midlothian": "Scotland - Scottish Premiership", "Aberdeen FC": "Scotland - Scottish Premiership",
    "Hibernian FC": "Scotland - Scottish Premiership", "Dundee United": "Scotland - Scottish Premiership",
    "St Mirren": "Scotland - Scottish Premiership", "Kilmarnock FC": "Scotland - Scottish Premiership",
    "Motherwell FC": "Scotland - Scottish Premiership", "Ross County FC": "Scotland - Scottish Premiership",
    "Livingston FC": "Scotland - Scottish Premiership", "St Johnstone": "Scotland - Scottish Premiership",
    // Turkey
    "Galatasaray": "Türkiye - Süper Lig", "Fenerbahce": "Türkiye - Süper Lig",
    "Besiktas JK": "Türkiye - Süper Lig", "Trabzonspor": "Türkiye - Süper Lig",
    "Kasimpasa": "Türkiye - Süper Lig",
    "Basaksehir FK": "Türkiye - Süper Lig",
    // Denmark
    "FC København": "Denmark - Superliga", "FC Midtjylland": "Denmark - Superliga",
    "Brøndby IF": "Denmark - Superliga", "FC Nordsjælland": "Denmark - Superliga",
    "Aarhus GF": "Denmark - Superliga",
    // Switzerland
    "BSC Young Boys": "Switzerland - Super League", "FC Basel 1893": "Switzerland - Super League",
    "FC Zürich": "Switzerland - Super League", "Servette FC": "Switzerland - Super League",
    "FC Lugano": "Switzerland - Super League",
    // Norway
    "FK Bodø/Glimt": "Norway - Eliteserien", "Rosenborg BK": "Norway - Eliteserien",
    "Molde FK": "Norway - Eliteserien", "Viking FK": "Norway - Eliteserien",
    "SK Brann": "Norway - Eliteserien",
    // Sweden
    "Malmö FF": "Sweden - Allsvenskan", "Djurgårdens IF": "Sweden - Allsvenskan",
    "Hammarby IF": "Sweden - Allsvenskan", "AIK": "Sweden - Allsvenskan",
    // Poland
    "Legia Warszawa": "Poland - PKO BP Ekstraklasa", "Lech Poznan": "Poland - PKO BP Ekstraklasa",
    "Raków Częstochowa": "Poland - PKO BP Ekstraklasa",
    // Croatia
    "GNK Dinamo Zagreb": "Croatia - SuperSport HNL", "HNK Hajduk Split": "Croatia - SuperSport HNL",
    // Greece
    "Olympiacos FC": "Greece - Super League 1", "Panathinaikos FC": "Greece - Super League 1",
    "AEK Athens": "Greece - Super League 1", "PAOK FC": "Greece - Super League 1",
    // Czech Republic
    "AC Sparta Prague": "Czech Republic - Chance Liga", "SK Slavia Prague": "Czech Republic - Chance Liga",
    "SK Sigma Olomouc": "Czech Republic - Chance Liga",
    // Serbia
    "FK Crvena zvezda": "Serbia - Super liga Srbije", "FK Partizan": "Serbia - Super liga Srbije",
    // Romania
    "FCSB": "Romania - SuperLiga", "CFR Cluj": "Romania - SuperLiga",
    // Ukraine
    "Shakhtar Donetsk": "Ukraine - Premier Liga", "FC Dynamo Kyiv": "Ukraine - Premier Liga",
    // Israel
    "Maccabi Tel Aviv FC": "Israel - Ligat ha'Al", "Maccabi Haifa FC": "Israel - Ligat ha'Al",
    "Hapoel Beer Sheva FC": "Israel - Ligat ha'Al",
    // Bulgaria
    "PFC Ludogorets Razgrad": "Bulgaria - efbet Liga", "PFC CSKA Sofia": "Bulgaria - efbet Liga",
    "PFC Levski Sofia": "Bulgaria - efbet Liga",
    // Austria
    "SK Rapid Wien": "Austria - Bundesliga", "FK Austria Wien": "Austria - Bundesliga",
    "LASK": "Austria - Bundesliga", "Wolfsberger AC": "Austria - Bundesliga",
    "FC Red Bull Salzburg": "Austria - Bundesliga", "SK Sturm Graz": "Austria - Bundesliga",
    // Cyprus – no football-logos folder; TheSportsDB/Wikipedia will be used
    // Hungary – no football-logos folder
    // Slovakia – no football-logos folder
  };
  return teamCountryMap;
})();

// In-memory cache of verified GitHub logo URLs (24h)
const _footballLogosCache = new Map();
const FOOTBALL_LOGOS_CACHE_TTL = 24 * 60 * 60 * 1000;

// Levenshtein distance for fuzzy string matching with confidence scoring
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Convert Levenshtein distance to a 0-1 confidence score
function fuzzyConfidence(a, b) {
  if (!a || !b) return 0;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Minimum confidence threshold for logo matching
const LOGO_CONFIDENCE_THRESHOLD = 0.65;

function normalizeForLogoMatch(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveFootballLogosUrl(teamName, leagueName) {
  const normalized = normalizeForLogoMatch(teamName);
  if (!normalized) return null;

  // Check cache first
  const cKey = `${normalized}__${normalizeForLogoMatch(leagueName)}`;
  const cached = _footballLogosCache.get(cKey);
  if (cached && Date.now() - cached.ts < FOOTBALL_LOGOS_CACHE_TTL) return cached.url;

  // Find the team file name from alias (exact match first)
  let fileName = TEAM_LOGO_ALIASES[normalized] || null;

  // Fuzzy alias matching: strip common prefixes/suffixes and retry
  if (!fileName) {
    const stripped = normalized
      .replace(/\b(fc|afc|sc|ac|cf|fk|sv|vfl|vfb|tsg|bsc|rsc|krc|kvc|kaa|kv|us|ss|acf|ssc|rc|ogc|losc|1\s*fc|bv)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped && stripped !== normalized) {
      fileName = TEAM_LOGO_ALIASES[stripped] || null;
    }
  }

  // Try partial key match: find alias keys that contain the normalized name or vice versa
  if (!fileName && normalized.length >= 4) {
    const aliasKeys = Object.keys(TEAM_LOGO_ALIASES);
    // Exact substring match — only if unambiguous
    const candidates = aliasKeys.filter((k) => k === normalized || k.includes(normalized) || normalized.includes(k));
    if (candidates.length === 1) {
      fileName = TEAM_LOGO_ALIASES[candidates[0]];
    } else if (candidates.length > 1) {
      // Pick the closest length match
      candidates.sort((a, b) => Math.abs(a.length - normalized.length) - Math.abs(b.length - normalized.length));
      fileName = TEAM_LOGO_ALIASES[candidates[0]];
    }
  }

  // Token-overlap matching with confidence scoring as last resort
  if (!fileName && normalized.length >= 5) {
    const inputTokens = new Set(normalized.split(" ").filter((t) => t.length >= 3));
    if (inputTokens.size >= 1) {
      const aliasKeys = Object.keys(TEAM_LOGO_ALIASES);
      let bestKey = null;
      let bestScore = 0;

      for (const k of aliasKeys) {
        // Token overlap score
        const kTokens = new Set(k.split(" ").filter((t) => t.length >= 3));
        if (kTokens.size === 0) continue;
        let overlap = 0;
        for (const t of inputTokens) {
          if (kTokens.has(t)) overlap++;
        }
        const tokenScore = overlap / Math.max(inputTokens.size, kTokens.size, 1);

        // Levenshtein confidence score
        const levScore = fuzzyConfidence(normalized, k);

        // Combined score: weighted average (token overlap is more reliable)
        const combined = tokenScore * 0.6 + levScore * 0.4;

        if (combined > bestScore && combined >= LOGO_CONFIDENCE_THRESHOLD) {
          bestScore = combined;
          bestKey = k;
        }
      }
      if (bestKey) fileName = TEAM_LOGO_ALIASES[bestKey];
    }
  }

  if (!fileName) return null;

  // Find the league folder  
  const rawFolder = LEAGUE_TO_LOGO_FOLDER[leagueName] ?? LEAGUE_TO_LOGO_FOLDER[normalizeLeagueName(leagueName)] ?? undefined;
  const folder = rawFolder === null ? undefined : rawFolder; // null = UEFA comp, skip direct folder match

  if (folder) {
    const url = `${FOOTBALL_LOGOS_BASE}/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}.png`;
    _footballLogosCache.set(cKey, { url, ts: Date.now() });
    return url;
  }

  // UEFA competition or unknown league — look up the team's domestic league folder
  const domesticFolder = TEAM_FILENAME_TO_FOLDER[fileName];
  if (domesticFolder) {
    const url = `${FOOTBALL_LOGOS_BASE}/${encodeURIComponent(domesticFolder)}/${encodeURIComponent(fileName)}.png`;
    _footballLogosCache.set(cKey, { url, ts: Date.now() });
    return url;
  }

  return null;
}

function normalizeRemoteMediaUrl(candidate, { allowSvg = false } = {}) {
  const value = String(candidate || "").trim();
  if (!/^https?:\/\//i.test(value)) return null;
  if (/^(data|javascript|file):/i.test(value)) return null;
  try {
    const parsed = new URL(value);
    const path = String(parsed.pathname || "").toLowerCase();
    if (!allowSvg && path.endsWith(".svg")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeTeamLogo(teamName, logoUrl, ...fallbackCandidates) {
  const candidates = [logoUrl, ...fallbackCandidates];
  for (const candidate of candidates) {
    const value = normalizeRemoteMediaUrl(candidate);
    if (value) return value;
  }
  return null;
}

function normalizePlayerPhoto(_playerId, ...candidates) {
  for (const c of candidates) {
    const v = normalizeRemoteMediaUrl(c);
    if (!v) continue;
    // Skip ESPN-specific placeholder images (nophoto.png, default.png, silhouette)
    if (/\/nophoto[\._]/i.test(v)) continue;
    if (/\/default[\._]/i.test(v)) continue;
    if (/silhouette/i.test(v)) continue;
    if (/\/placeholder[\._]/i.test(v)) continue;
    return v;
  }
  return null;
}

function isEspnHeadshotUrl(url) {
  return /a\.espncdn\.com\/i\/headshots\/soccer\/players\/full\//i.test(String(url || ""));
}

function isGeneratedAvatarUrl(url) {
  return /ui-avatars\.com\/api\//i.test(String(url || ""));
}

function keepIncomingPlayerPhoto(url) {
  const normalized = normalizeRemoteMediaUrl(url);
  if (!normalized) return null;
  // ESPN URLs are provisional until validated later in the pipeline.
  if (isEspnHeadshotUrl(normalized)) return null;
  if (isGeneratedAvatarUrl(normalized)) return null;
  return normalized;
}

// Validate ESPN CDN headshot — returns URL if real photo (>10KB), null if black placeholder
async function validateEspnHeadshot(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const len = parseInt(resp.headers.get("content-length") || "0", 10);
    // Real ESPN headshots are 8KB-200KB+; black placeholders are ~1-3KB
    if (len > 0 && len < 4500) return null;
    return url;
  } catch {
    return null;
  }
}

// =============================================================
// ZILLIZ VECTOR DATABASE – persistente semantische AI-cache
// ZILLIZ_URI  = cluster Public Endpoint (van cloud.zilliz.com)
// ZILLIZ_API_KEY = API token (van cloud.zilliz.com → API Keys)
// =============================================================
const ZILLIZ_URI = String(process.env.ZILLIZ_URI || "").replace(/\/$/, "");
const ZILLIZ_API_KEY = String(process.env.ZILLIZ_API_KEY || "");
const ZILLIZ_COLLECTION = "nexora_ai_cache";
const EMBEDDING_DIM = 128;

let _zillizReady = false;

// Deterministische pseudo-embedding: tekst → 128-dim genormaliseerde vector
function textToVector(text) {
  const s = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const vec = new Array(EMBEDDING_DIM).fill(0);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    vec[i % EMBEDDING_DIM] += c;
    vec[(i * 31 + 7) % EMBEDDING_DIM] += c * 0.5;
    vec[(i * 17 + 3) % EMBEDDING_DIM] += c * 0.25;
  }
  const mag = Math.sqrt(vec.reduce((a, v) => a + v * v, 0));
  return mag > 0 ? vec.map(v => v / mag) : vec;
}

async function zillizRequest(method, path, body) {
  if (!ZILLIZ_URI || !ZILLIZ_API_KEY) return null;
  try {
    const resp = await fetch(`${ZILLIZ_URI}/v2/vectordb${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${ZILLIZ_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function zillizInit() {
  if (!ZILLIZ_URI || !ZILLIZ_API_KEY) return false;
  try {
    const list = await zillizRequest("POST", "/collections/list", {});
    const exists = Array.isArray(list?.data) && list.data.includes(ZILLIZ_COLLECTION);
    if (!exists) {
      const res = await zillizRequest("POST", "/collections/create", {
        collectionName: ZILLIZ_COLLECTION,
        schema: {
          fields: [
            { fieldName: "id", dataType: "Int64", isPrimary: true, autoId: false },
            { fieldName: "cache_key", dataType: "VarChar", elementTypeParams: { max_length: "512" } },
            { fieldName: "type", dataType: "VarChar", elementTypeParams: { max_length: "64" } },
            { fieldName: "result_json", dataType: "VarChar", elementTypeParams: { max_length: "65535" } },
            { fieldName: "embedding", dataType: "FloatVector", elementTypeParams: { dim: String(EMBEDDING_DIM) } },
            { fieldName: "created_at", dataType: "Int64" },
          ],
        },
        indexParams: [{
          fieldName: "embedding",
          indexName: "emb_idx",
          metricType: "COSINE",
          params: { index_type: "AUTOINDEX" },
        }],
      });
      if (res?.code !== 0) { console.warn("Zilliz collection create fout:", res?.message); return false; }
    }
    _zillizReady = true;
    console.log("Zilliz cache: verbonden ✓");
    return true;
  } catch (e) {
    console.warn("Zilliz init fout:", String(e?.message || e));
    return false;
  }
}

// Exacte cache lookup op type + key
async function zillizGet(type, cacheKey) {
  if (!_zillizReady) return null;
  try {
    const safeKey = String(cacheKey).slice(0, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const res = await zillizRequest("POST", "/entities/query", {
      collectionName: ZILLIZ_COLLECTION,
      filter: `type == "${type}" && cache_key == "${safeKey}"`,
      outputFields: ["result_json", "created_at"],
      limit: 1,
    });
    const row = res?.data?.[0];
    if (!row?.result_json) return null;
    if (Date.now() - Number(row.created_at || 0) > 86_400_000 * 7) return null; // 7 dagen TTL
    return tryParseJSON(row.result_json);
  } catch {
    return null;
  }
}

// Cache opslaan
async function zillizPut(type, cacheKey, result) {
  if (!_zillizReady) return;
  try {
    const resultJson = JSON.stringify(result);
    if (resultJson.length > 64000) return;
    // Genereer uniek Int64-compatibel id (autoId staat uit op serverless clusters)
    const uid = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    await zillizRequest("POST", "/entities/insert", {
      collectionName: ZILLIZ_COLLECTION,
      data: [{
        id: uid,
        cache_key: String(cacheKey).slice(0, 500),
        type,
        result_json: resultJson,
        embedding: textToVector(`${type} ${cacheKey}`),
        created_at: Date.now(),
      }],
    });
  } catch { /* best-effort */ }
}

function normalizePersonName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  // Standard token overlap
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }

  // Initial matching: "k" matches "kevin", "j" matches "jude" etc.
  // Only count if the initial is a single character (from "K." → normalized to "k")
  let initialMatches = 0;
  for (const tokenA of tokensA) {
    if (tokenA.length === 1 && !setB.has(tokenA)) {
      for (const tokenB of tokensB) {
        if (tokenB.length > 1 && tokenB.startsWith(tokenA)) {
          initialMatches += 1;
          break;
        }
      }
    }
  }
  for (const tokenB of tokensB) {
    if (tokenB.length === 1 && !setA.has(tokenB)) {
      for (const tokenA of tokensA) {
        if (tokenA.length > 1 && tokenA.startsWith(tokenB)) {
          initialMatches += 1;
          break;
        }
      }
    }
  }

  // Partial token matching: "de bruyne" /startsWith "debruyne" → boost
  let partialMatches = 0;
  for (const tokenA of tokensA) {
    if (tokenA.length >= 3 && !setB.has(tokenA)) {
      for (const tokenB of tokensB) {
        if (tokenB.length >= 3 && !setA.has(tokenB)) {
          if (tokenA.startsWith(tokenB) || tokenB.startsWith(tokenA)) {
            partialMatches += 0.5;
            break;
          }
        }
      }
    }
  }

  // Last-name emphasis: if both share the same last token (surname), boost score
  const lastA = tokensA[tokensA.length - 1];
  const lastB = tokensB[tokensB.length - 1];
  const surnameMatch = lastA && lastB && lastA.length >= 3 && lastA === lastB;

  // Also check if last names are very close (1 char difference) for typo tolerance
  let surnameClose = false;
  if (!surnameMatch && lastA && lastB && lastA.length >= 4 && lastB.length >= 4) {
    const lenDiff = Math.abs(lastA.length - lastB.length);
    if (lenDiff <= 1) {
      let diffs = 0;
      const maxLen = Math.max(lastA.length, lastB.length);
      for (let i = 0; i < maxLen; i++) {
        if ((lastA[i] || "") !== (lastB[i] || "")) diffs++;
      }
      if (diffs <= 1) surnameClose = true;
    }
  }

  const totalMatched = overlap + initialMatches * 0.7 + partialMatches;
  const denom = Math.max(setA.size, setB.size, 1);
  let score = totalMatched / denom;

  if (surnameMatch && score < 0.85) score = Math.max(score, 0.75);
  if (surnameClose && score < 0.7) score = Math.max(score, 0.65);

  return score;
}

function pickBestProfileMatch(profiles, player, teamName) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;

  const targetName = normalizePersonName(player?.name);
  const targetTeam = normalizePersonName(teamName);

  let best = null;
  let bestScore = 0;

  for (const row of profiles) {
    const prof = row?.player || row || {};
    const profName = normalizePersonName(prof?.name || prof?.firstname || prof?.lastname || "");
    const profTeam = normalizePersonName(row?.statistics?.[0]?.team?.name || "");

    let score = similarityScore(targetName, profName);
    if (targetTeam && profTeam) {
      if (profTeam === targetTeam) score += 0.35;
      else if (profTeam.includes(targetTeam) || targetTeam.includes(profTeam)) score += 0.2;
    }

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  return bestScore >= 0.62 ? best : null;
}

function parseNumberish(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

// Parse market value strings like "€6.00m", "€400k", "€232.30m", "€1.2B" into EUR number
function parseMarketValueEUR(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (value && typeof value === "object" && value.value != null) return parseMarketValueEUR(value.value);
  const text = String(value ?? "").trim();
  if (!text || text === "-") return null;
  const match = text.match(/([\d.,]+)\s*(B|bn|M|m|K|k)?/i);
  if (!match) return null;
  const num = parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return null;
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "B") return Math.round(num * 1_000_000_000);
  if (suffix === "M") return Math.round(num * 1_000_000);
  if (suffix === "K") return Math.round(num * 1_000);
  return num > 1000 ? Math.round(num) : null;
}

function normalizeMarketValueInput(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return formatEURShort(value);
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^€/.test(raw)) return raw;
  const num = parseNumberish(raw);
  if (num && /k|m|b|bn|mln|million|billion|eur|euro/i.test(raw)) {
    if (/b|bn|billion/i.test(raw)) return formatEURShort(Math.round(num * 1_000_000_000));
    if (/m|mln|million/i.test(raw)) return formatEURShort(Math.round(num * 1_000_000));
    if (/k/i.test(raw)) return formatEURShort(Math.round(num * 1_000));
    return formatEURShort(Math.round(num));
  }
  return raw;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function pickString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function isLikelyFemale(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return false;
  return /female|woman|women|feminine|ladies|vrouw|dames|feminino|femminile|weibl/i.test(text);
}

function isSoccerContext(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return true;
  return /soccer|football|voetbal|futbol|calcio|bundesliga|liga|premier|uefa|cup|serie a/i.test(text);
}

async function apifyRunActor(actorId, input = {}) {
  const token = String(process.env.APIFY_TOKEN || "").trim();
  const actor = String(actorId || "").trim();
  if (!token || !actor) return [];

  try {
    // run-sync-get-dataset-items: starts actor, waits for completion, returns items directly
    const url = `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true&limit=10`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input || {}),
      signal: AbortSignal.timeout(120_000), // 2 min max (Apify actors can take 30-90s)
    });
    if (!resp.ok) return [];
    const items = await resp.json().catch(() => []);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function mapFormerClubsFromApify(raw) {
  const rows = asArray(raw);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const from = pickString(row?.from, row?.fromClub, row?.outClub, row?.oldClub, row?.clubFrom);
    const to = pickString(row?.to, row?.toClub, row?.inClub, row?.newClub, row?.clubTo);
    const date = pickString(row?.date, row?.season, row?.year, row?.when);
    if (from) {
      const key = `${from}_${date}_from`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ name: from, role: "from", date });
      }
    }
    if (to) {
      const key = `${to}_${date}_to`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ name: to, role: "to", date });
      }
    }
  }
  return out.slice(0, 12);
}

function normalizeApifyPlayerItem(raw, requestedName, requestedTeam) {
  const scopes = [raw, raw?.player, raw?.athlete, raw?.data, raw?.profile].filter(Boolean);
  const read = (...keys) => {
    for (const scope of scopes) {
      for (const key of keys) {
        if (scope?.[key] != null && String(scope[key]).trim() !== "") return scope[key];
      }
    }
    return undefined;
  };

  const name = pickString(read("name", "playerName", "fullName", "displayName"), requestedName);
  const team = pickString(read("team", "club", "currentClub", "clubName", "teamName"), requestedTeam);
  const marketValue = normalizeMarketValueInput(read("marketValue", "market_value", "value", "estimatedValue", "valueEur"));
  const teamLogo = read("teamLogo", "clubLogo", "logo", "team_logo", "club_logo");
  const photo = read("photo", "image", "avatar", "headshot", "playerImage", "profileImage");
  const age = parseNumberish(read("age", "playerAge"));
  const position = pickString(read("position", "positionName", "role", "mainPosition"));
  const nationality = pickString(read("nationality", "country", "nation"));
  const gender = pickString(read("gender", "sex", "category", "teamGender", "playerGender"));
  const sportContext = pickString(
    read("sport", "sportName", "discipline", "competition", "tournament", "league", "leagueName"),
    position,
    team,
  );
  const height = toMetersStringFromAny(read("height", "heightCm", "height_cm", "height_m"));
  const weight = toKgStringFromAny(read("weight", "weightKg", "weight_kg"));
  const formerClubs = mapFormerClubsFromApify(read("formerClubs", "transfers", "transferHistory", "history"));

  return {
    name,
    team,
    teamLogo: normalizeTeamLogo(team, teamLogo || null),
    photo: normalizePlayerPhoto(read("id", "playerId", "athleteId"), photo),
    age: Number.isFinite(age) && age > 0 ? age : undefined,
    position,
    nationality,
    gender,
    sportContext,
    height,
    weight,
    marketValue,
    formerClubs,
  };
}

function pickBestApifyCandidate(items, requestedName, requestedTeam) {
  const targetName = normalizePersonName(requestedName);
  const targetTeam = normalizePersonName(requestedTeam);
  let best = null;
  let bestScore = 0;

  for (const item of items || []) {
    const candidate = normalizeApifyPlayerItem(item, requestedName, requestedTeam);
    const candName = normalizePersonName(candidate?.name);
    const candTeam = normalizePersonName(candidate?.team);

    if (isLikelyFemale(candidate?.gender)) continue;
    if (!isSoccerContext(candidate?.sportContext)) continue;

    let score = similarityScore(targetName, candName);

    if (targetName && candName) {
      const nameTokens = targetName.split(" ").filter(Boolean);
      const candTokens = new Set(candName.split(" ").filter(Boolean));
      const tokenOverlap = nameTokens.filter((token) => candTokens.has(token)).length;
      if (nameTokens.length >= 2 && tokenOverlap === 0) score -= 0.6;
      else if (nameTokens.length >= 2 && tokenOverlap === 1) score -= 0.2;
    }

    if (targetTeam && candTeam) {
      if (candTeam === targetTeam) score += 0.35;
      else if (candTeam.includes(targetTeam) || targetTeam.includes(candTeam)) score += 0.2;
      else score -= 0.4;
    }

    if (!candName && !candidate?.marketValue) score -= 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (best && bestScore >= (targetTeam ? 0.68 : 0.74)) return best;
  return null;
}

async function fetchApifyPlayerFallback(playerId, playerName, teamName) {
  const token = String(process.env.APIFY_TOKEN || "").trim();
  if (!token) return null;

  const baseInput = {
    playerId: String(playerId || "").trim() || undefined,
    playerName: String(playerName || "").trim() || undefined,
    teamName: String(teamName || "").trim() || undefined,
    query: String(playerName || "").trim() || undefined,
    limit: 5,
  };

  try {
    if (APIFY_SOFASCORE_ACTOR) {
      const sofaItems = await apifyRunActor(APIFY_SOFASCORE_ACTOR, baseInput);
      const sofaBest = pickBestApifyCandidate(sofaItems, playerName, teamName);
      if (sofaBest) return { ...sofaBest, source: "apify-sofascore" };
    }

    const tmItems = await apifyRunActor(APIFY_TRANSFERMARKT_ACTOR, baseInput);
    const tmBest = pickBestApifyCandidate(tmItems, playerName, teamName);
    if (tmBest) return { ...tmBest, source: "apify-transfermarkt" };

    return null;
  } catch {
    return null;
  }
}

// TheSportsDB free API – get all players (with photos) for a team (no API key required)
async function fetchTheSportsDBTeamPlayers(teamName) {
  if (!teamName) return [];
  const normTeam = normalizePersonName(teamName);
  const cacheKey = `thesportsdb_players_${normTeam}`;
  const cacheItem = __cache.get(cacheKey);
  if (cacheItem && Date.now() <= cacheItem.expiresAt) return cacheItem.value;

  try {
    // Step 1: find team ID
    const q = encodeURIComponent(String(teamName).trim());
    const teamResp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${q}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!teamResp.ok) { cacheSet(cacheKey, [], 300_000); return []; }
    const teamData = await teamResp.json();
    const teamId = teamData?.teams?.[0]?.idTeam;
    if (!teamId) { cacheSet(cacheKey, [], 300_000); return []; }

    // Step 2: get all players for that team
    const playersResp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookup_all_players.php?id=${teamId}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!playersResp.ok) { cacheSet(cacheKey, [], 300_000); return []; }
    const playersData = await playersResp.json();
    const list = (playersData?.player || []).map((p) => ({
      name: normalizePersonName(p?.strPlayer || ""),
      photo: p?.strCutout || p?.strThumb || p?.strRender || null,
    })).filter((p) => p.name && p.photo);

    cacheSet(cacheKey, list, 86_400_000); // cache 24h
    return list;
  } catch {
    cacheSet(cacheKey, [], 300_000);
    return [];
  }
}

// Wikipedia page image – standalone helper (reusable for AI-resolved titles)
async function fetchWikipediaPageImage(title) {
  if (!title) return null;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&format=json&origin=*`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "NexoraApp/1.0 (sports app)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) return null;
    return page?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

// AI-assisted player photo resolution via Gemini – asks LLM for correct Wikipedia titles
async function resolvePlayerPhotosViaAI(players, teamName) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !Array.isArray(players) || players.length === 0) return new Map();

  const photoMap = new Map();
  const BATCH = 15;

  for (let i = 0; i < players.length; i += BATCH) {
    const batch = players.slice(i, i + BATCH);
    const playerList = batch.map((p) => {
      const parts = [p.name];
      if (p.nationality) parts.push(p.nationality);
      if (p.position) parts.push(p.position);
      return `- ${parts.join(", ")}`;
    }).join("\n");

    try {
      const prompt = `You must identify each football/soccer player below. They ALL play for team: "${teamName || "unknown"}".
IMPORTANT: Only return a Wikipedia title if you are CERTAIN the player currently plays (or recently played) for ${teamName || "this team"}. If a common name could refer to multiple players, pick the one who plays for ${teamName || "this team"}. Use null if unsure.

Players:
${playerList}

Return a JSON object mapping each player name to their EXACT English Wikipedia article title. Use null if unknown or uncertain.
Return ONLY valid JSON. No markdown, no explanation.`;

      const response = await geminiChat(
        [
          { role: "system", content: `You are a football/soccer expert who identifies players accurately. You know current squad rosters. When a player name is ambiguous, always pick the player who plays for the specified team. Never guess — use null when unsure.` },
          { role: "user", content: prompt },
        ],
        { temperature: 0 }
      );

      // Parse JSON – handle possible markdown fences
      const cleaned = String(response || "").replace(/```json\s*|```\s*/g, "").trim();
      const titleMap = JSON.parse(cleaned);

      // Fetch Wikipedia photos in parallel for all resolved titles
      const entries = Object.entries(titleMap).filter(([, v]) => v);
      const results = await Promise.all(
        entries.map(async ([name, title]) => {
          const photo = await fetchWikipediaPageImage(title);
          return [name, photo];
        })
      );

      for (const [name, photo] of results) {
        if (name && photo) photoMap.set(name, photo);
      }
    } catch (err) {
      console.warn(`[photos][ai] Gemini batch failed:`, err.message);
    }
  }

  if (photoMap.size > 0) {
    console.log(`[photos][ai] Gemini resolved ${photoMap.size} Wikipedia photos for ${teamName}`);
  }
  return photoMap;
}

// Wikipedia/Wikimedia API – free player photo lookup by name (no API key, CC licensed)
async function fetchWikipediaPlayerPhoto(playerName, hintContext = "") {
  if (!playerName) return null;
  const normName = normalizePersonName(playerName);
  const cacheKey = `wikipedia_photo_${normName}`;
  const cacheItem = __cache.get(cacheKey);
  if (cacheItem && Date.now() <= cacheItem.expiresAt) return cacheItem.value;

  const fetchPageImage = async (title) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&format=json&origin=*`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "NexoraApp/1.0 (sports app)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) return null;
    return page?.thumbnail?.source || null;
  };

  try {
    const wikiTitle = String(playerName).trim().replace(/ /g, "_");
    // Try direct name first
    const direct = await fetchPageImage(wikiTitle);
    if (direct) { cacheSet(cacheKey, direct, 86_400_000); return direct; }

    // Try with footballer disambiguation
    const footballerVariants = [
      `${playerName.trim()} (footballer)`,
      `${playerName.trim()} (soccer)`,
      `${playerName.trim()} (Belgian footballer)`,
      `${playerName.trim()} (Dutch footballer)`,
      `${playerName.trim()} (French footballer)`,
      `${playerName.trim()} (Spanish footballer)`,
      `${playerName.trim()} (German footballer)`,
      `${playerName.trim()} (Brazilian footballer)`,
      `${playerName.trim()} (Portuguese footballer)`,
      `${playerName.trim()} (English footballer)`,
      `${playerName.trim()} (Italian footballer)`,
      `${playerName.trim()} (Argentine footballer)`,
    ];
    for (const variant of footballerVariants) {
      const photo = await fetchPageImage(variant);
      if (photo) { cacheSet(cacheKey, photo, 86_400_000); return photo; }
    }

    // Final: Wikipedia opensearch
    const searchResp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(playerName)}&limit=7&format=json&origin=*`,
      { headers: { "User-Agent": "NexoraApp/1.0 (sports app)" }, signal: AbortSignal.timeout(4000) }
    );
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const results = searchData?.[1] || [];
      for (const title of results.slice(0, 7)) {
        const photo = await fetchPageImage(title);
        if (photo) { cacheSet(cacheKey, photo, 86_400_000); return photo; }
      }
    }

    cacheSet(cacheKey, null, 60_000);
    return null;
  } catch {
    cacheSet(cacheKey, null, 60_000);
    return null;
  }
}

// TheSportsDB free API – team badge lookup by team name (no API key required)
async function fetchTheSportsDBTeamLogo(teamName) {
  if (!teamName) return null;
  const cacheKey = `thesportsdb_logo_${normalizePersonName(teamName)}`;
  const cacheItem = __cache.get(cacheKey);
  if (cacheItem && Date.now() <= cacheItem.expiresAt) return cacheItem.value;

  try {
    const q = encodeURIComponent(String(teamName).trim());
    const resp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${q}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const data = await resp.json();
    const logo = data?.teams?.[0]?.strTeamBadge || data?.teams?.[0]?.strTeamBadgeDark || null;
    cacheSet(cacheKey, logo, 86_400_000); // cache 24h
    return logo;
  } catch {
    cacheSet(cacheKey, null, 300_000);
    return null;
  }
}

// Wikipedia/Wikimedia API – free team logo/crest lookup by club name (CC licensed)
async function fetchWikipediaTeamLogo(teamName) {
  if (!teamName) return null;
  const normKey = normalizePersonName(teamName);
  const cacheKey = `wikipedia_team_logo_${normKey}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    // Try direct page title first, then search
    const variants = [
      teamName.trim(),
      `${teamName.trim()} F.C.`,
      `${teamName.trim()} FC`,
    ];
    for (const variant of variants) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(variant)}&prop=pageimages&pithumbsize=400&format=json&origin=*`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "NexoraApp/1.0 (sports app)" },
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const pages = data?.query?.pages || {};
      const page = Object.values(pages)[0];
      if (page && page.missing === undefined && page?.thumbnail?.source) {
        const logo = page.thumbnail.source;
        cacheSet(cacheKey, logo, 86_400_000); // 24h
        return logo;
      }
    }
    // Fallback: Wikipedia opensearch → use first result's page images
    const searchResp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(teamName)}&limit=1&format=json&origin=*`,
      { headers: { "User-Agent": "NexoraApp/1.0 (sports app)" }, signal: AbortSignal.timeout(4000) }
    );
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const found = searchData?.[1]?.[0];
      if (found) {
        const imgResp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(found)}&prop=pageimages&pithumbsize=400&format=json&origin=*`,
          { headers: { "User-Agent": "NexoraApp/1.0 (sports app)" }, signal: AbortSignal.timeout(4000) }
        );
        if (imgResp.ok) {
          const imgData = await imgResp.json();
          const pages2 = imgData?.query?.pages || {};
          const page2 = Object.values(pages2)[0];
          if (page2?.thumbnail?.source) {
            const logo = page2.thumbnail.source;
            cacheSet(cacheKey, logo, 86_400_000);
            return logo;
          }
        }
      }
    }
    cacheSet(cacheKey, null, 300_000); // 5min negative cache
    return null;
  } catch {
    cacheSet(cacheKey, null, 300_000);
    return null;
  }
}

// Enrich team logos using TheSportsDB + ESPN CDN + Wikipedia (priority order, cached 24h)
// Priority: TheSportsDB badge > existing ESPN CDN URL > Wikipedia (last resort)
// Uses batched requests (5 at a time) to avoid rate-limiting the free TheSportsDB API.
async function enrichMatchLogos(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;

  const teamNames = [...new Set(
    matches.flatMap((m) => [m.homeTeam, m.awayTeam].filter(Boolean))
  )];
  if (teamNames.length === 0) return matches;

  // 1. Football-logos (highest quality, GitHub-hosted PNGs)
  const flMap = {};
  const leagueHintByTeam = {};
  for (const m of matches) {
    if (m.homeTeam) leagueHintByTeam[m.homeTeam] = m.league;
    if (m.awayTeam) leagueHintByTeam[m.awayTeam] = m.league;
  }
  for (const name of teamNames) {
    flMap[name] = resolveFootballLogosUrl(name, leagueHintByTeam[name] || "");
  }

  // 2. Batched TheSportsDB lookups (max 5 parallel)
  const needsTsdb = teamNames.filter((name) => !flMap[name]);
  const tsdbMap = {};
  for (let i = 0; i < needsTsdb.length; i += 5) {
    const batch = needsTsdb.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (name) => [name, await fetchTheSportsDBTeamLogo(name)]));
    for (const [name, logo] of results) tsdbMap[name] = logo;
  }

  // 3. Wikipedia only for teams that still have no logo
  const needsWiki = teamNames.filter((name) => {
    const hasExistingLogo = matches.some((m) => (m.homeTeam === name && m.homeTeamLogo) || (m.awayTeam === name && m.awayTeamLogo));
    return !flMap[name] && !tsdbMap[name] && !hasExistingLogo;
  });
  const wikiMap = {};
  if (needsWiki.length > 0) {
    const results = await Promise.all(needsWiki.map(async (name) => [name, await fetchWikipediaTeamLogo(name)]));
    for (const [name, logo] of results) wikiMap[name] = logo;
  }

  return matches.map((m) => ({
    ...m,
    // Priority: Football-logos > TSDB > ESPN CDN > Wikipedia
    homeTeamLogo: flMap[m.homeTeam] || tsdbMap[m.homeTeam] || m.homeTeamLogo || wikiMap[m.homeTeam] || null,
    awayTeamLogo: flMap[m.awayTeam] || tsdbMap[m.awayTeam] || m.awayTeamLogo || wikiMap[m.awayTeam] || null,
  }));
}

// Enrich standings team logos using the same priority chain as match logos
async function enrichStandingsLogos(standings, leagueName) {
  if (!Array.isArray(standings) || standings.length === 0) return standings;

  const teamNames = [...new Set(standings.map((t) => t.team).filter(Boolean))];
  if (teamNames.length === 0) return standings;

  // 1. Football-logos (highest quality)
  const flMap = {};
  for (const name of teamNames) {
    flMap[name] = resolveFootballLogosUrl(name, leagueName || "");
  }

  // 2. Batched TheSportsDB lookups (max 5 parallel)
  const needsTsdb = teamNames.filter((name) => !flMap[name]);
  const tsdbMap = {};
  for (let i = 0; i < needsTsdb.length; i += 5) {
    const batch = needsTsdb.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (name) => [name, await fetchTheSportsDBTeamLogo(name)]));
    for (const [name, logo] of results) tsdbMap[name] = logo;
  }

  return standings.map((t) => ({
    ...t,
    logo: flMap[t.team] || tsdbMap[t.team] || t.logo || null,
  }));
}

// Enrich topscorer teamLogo fields using Football-logos + TheSportsDB + Wikipedia
// Enrich scorer photos — parallel search for scorers missing photos
async function enrichScorersPhotos(scorers, leagueName) {
  if (!Array.isArray(scorers) || scorers.length === 0) return scorers;
  const preparedScorers = scorers.map((scorer) => {
    if (!scorer) return scorer;
    return {
      ...scorer,
      photo: keepIncomingPlayerPhoto(scorer.photo),
    };
  });
  const needPhoto = preparedScorers.filter((s) => s && !s.photo && s.name);
  if (needPhoto.length === 0) return scorers;

  console.log(`[topscorers][photos] ${leagueName}: ${needPhoto.length}/${preparedScorers.length} scorers need photo enrichment`);
  const photoMap = new Map();

  // --- STEP 0: Bulk preprocessing (Transfermarkt + TheSportsDB lookup tables) ---
  const teamNames = [...new Set(needPhoto.map((s) => s.team).filter(Boolean))];
  const tmPhotoMap = new Map();
  const dbPhotoMap = new Map();

  for (const teamName of teamNames) {
    try {
      const tmPlayers = await fetchTransfermarktClubPlayers(teamName);
      if (Array.isArray(tmPlayers)) {
        for (const p of tmPlayers) {
          if (p.name && p.photo && /^https?:\/\//i.test(p.photo)) {
            const normed = normalizePersonName(p.name);
            if (!tmPhotoMap.has(normed)) tmPhotoMap.set(normed, p.photo);
          }
        }
      }
    } catch (err) {
      console.warn(`[topscorers][photos] TM preprocessing failed for ${teamName}:`, err.message);
    }
  }

  for (const teamName of teamNames) {
    try {
      const dbPlayers = await fetchTheSportsDBTeamPlayers(teamName);
      if (Array.isArray(dbPlayers)) {
        for (const p of dbPlayers) {
          if (p.name && p.photo) {
            if (!dbPhotoMap.has(p.name)) dbPhotoMap.set(p.name, p.photo);
          }
        }
      }
    } catch (err) {
      console.warn(`[topscorers][photos] TheSportsDB preprocessing failed for ${teamName}:`, err.message);
    }
  }

  console.log(`[topscorers][photos] ${leagueName}: Preprocessing found ${tmPhotoMap.size} TM + ${dbPhotoMap.size} TheSportsDB photos`);

  // Batch processing with preprocessing + fallback chain
  const BATCH = 10;
  for (let i = 0; i < needPhoto.length; i += BATCH) {
    const batch = needPhoto.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (scorer) => {
        const name = String(scorer.name || "").trim();
        const team = String(scorer.team || "").trim();
        const normName = normalizePersonName(name);

        // -- STEP 1: Check preprocessing tables (fastest) --
        if (normName) {
          const tmPhoto = tmPhotoMap.get(normName);
          if (tmPhoto) return [name, proxyPhotoUrl(tmPhoto)];
        }
        const dbPhoto = dbPhotoMap.get(name);
        if (dbPhoto) return [name, dbPhoto];

        // -- STEP 2: Transfermarkt direct search --
        try {
          const tm = await fetchTransfermarktPlayerDirect(name, team);
          if (tm?.photo) return [name, proxyPhotoUrl(tm.photo)];
        } catch (err) {
          console.debug(`[topscorers][photos] TM direct failed for ${name}:`, err.message);
        }

        // -- STEP 3: TheSportsDB player search --
        try {
          const q = encodeURIComponent(name);
          const resp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${q}`, {
            headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)" },
            signal: AbortSignal.timeout(5000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const normTeam = normalizePersonName(team);
            for (const r of (data?.player || [])) {
              const rName = normalizePersonName(r?.strPlayer || "");
              const rTeam = normalizePersonName(r?.strTeam || "");
              const photo = r?.strCutout || r?.strThumb || r?.strRender || null;
              if (!photo || !/^https?:\/\//i.test(photo)) continue;
              const nameScore = similarityScore(normName, rName);
              const teamMatch = normTeam && similarityScore(normTeam, rTeam) >= 0.50;
              if (nameScore >= 0.42 || (nameScore >= 0.35 && teamMatch)) {
                return [name, photo];
              }
            }
          }
        } catch (err) {
          console.debug(`[topscorers][photos] TheSportsDB search failed for ${name}:`, err.message);
        }

        // -- STEP 4: Wikipedia photo --
        try {
          const wiki = await fetchWikipediaPlayerPhoto(name);
          if (wiki) return [name, wiki];
        } catch (err) {
          console.debug(`[topscorers][photos] Wikipedia failed for ${name}:`, err.message);
        }

        // -- STEP 5: Gemini AI (BEFORE ESPN validation) --
        try {
          const aiMap = await resolvePlayerPhotosViaAI([{ name, team }], leagueName);
          const aiPhoto = aiMap.get(name);
          if (aiPhoto) return [name, aiPhoto];
        } catch (err) {
          console.debug(`[topscorers][photos] Gemini AI failed for ${name}:`, err.message);
        }

        // -- STEP 6: ESPN CDN (after AI try) --
        const espnId = String(scorer.id || "").trim();
        if (espnId && /^\d+$/.test(espnId)) {
          try {
            const espnUrl = `https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png`;
            const validated = await validateEspnHeadshot(espnUrl);
            if (validated) return [name, validated];
          } catch (err) {
            console.debug(`[topscorers][photos] ESPN validation failed for ${name}:`, err.message);
          }
        }

        // -- STEP 7: UI Avatars fallback --
        return [name, `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=1a1a2e&color=e0e0e0&bold=true&format=png`];
      })
    );
    for (const [name, photo] of results) {
      if (name && photo) photoMap.set(name, photo);
    }
  }

  const filledCount = photoMap.size;
  const preFilledCount = preparedScorers.filter((s) => s?.photo).length;
  console.log(`[topscorers][photos] ${leagueName}: Resolved ${filledCount} + ${preFilledCount} prefilled = ${filledCount + preFilledCount}/${preparedScorers.length} scorer photos (${Math.round(100 * (filledCount + preFilledCount) / (preparedScorers.length || 1))}%)`);
  return preparedScorers.map((s) => {
    if (!s || s.photo) return s;
    const found = photoMap.get(s.name);
    return found ? { ...s, photo: found } : s;
  });
}

async function enrichScorersLogos(scorers, leagueName) {
  if (!Array.isArray(scorers) || scorers.length === 0) return scorers;

  const teamNames = [...new Set(scorers.map((s) => s.team).filter(Boolean))];
  if (teamNames.length === 0) return scorers;

  const flMap = {};
  for (const name of teamNames) {
    flMap[name] = resolveFootballLogosUrl(name, leagueName || "");
  }

  const needsTsdb = teamNames.filter((name) => !flMap[name]);
  const tsdbMap = {};
  for (let i = 0; i < needsTsdb.length; i += 5) {
    const batch = needsTsdb.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (name) => [name, await fetchTheSportsDBTeamLogo(name)]));
    for (const [name, logo] of results) tsdbMap[name] = logo;
  }

  return scorers.map((s) => ({
    ...s,
    teamLogo: flMap[s.team] || tsdbMap[s.team] || s.teamLogo || null,
  }));
}

function inferFormationFromPlayers(players) {
  const starters = (players || []).filter((p) => p?.starter !== false).slice(0, 11);
  if (starters.length < 10) return "";
  const outfield = starters.filter((p) => !/gk|goalkeeper/i.test(String(p?.position || "") + " " + String(p?.positionName || "")));
  let def = 0;
  let mid = 0;
  let fwd = 0;
  for (const p of outfield) {
    const pos = String(p?.position || "").toUpperCase();
    const posName = String(p?.positionName || "").toLowerCase();
    if (/GK|DEF|CB|LB|RB|SWB|LWB|RWB|BACK/.test(pos) || /defend|back/.test(posName)) {
      def += 1;
      continue;
    }
    if (/MID|DM|CM|AM|LM|RM/.test(pos) || /mid/.test(posName)) {
      mid += 1;
      continue;
    }
    if (/FW|ST|CF|LW|RW|ATT/.test(pos) || /forward|striker|wing|attack/.test(posName)) {
      fwd += 1;
      continue;
    }
    mid += 1;
  }
  const total = def + mid + fwd;
  if (total !== 10) {
    const rest = Math.max(0, 10 - def - mid);
    fwd = rest;
  }
  if (def <= 0 || mid <= 0 || fwd <= 0) return "4-3-3";
  return `${def}-${mid}-${fwd}`;
}

function mapEspnEventToMatch(ev) {
  const comp = (ev?.competitions || [])[0];
  const { status, minute } = normalizeStatusFromEspn(comp);
  const id = String(ev?.id || comp?.id || "");
  const leagueNameRaw =
    ev?.league?.name ||
    ev?.league?.shortName ||
    ev?.leagues?.[0]?.name ||
    comp?.league?.name ||
    ev?._leagueHint ||  // from per-league fetch hint
    "";
  const leagueName = normalizeLeagueName(leagueNameRaw) || ev?._leagueHint || "";

  const competitors = comp?.competitors || [];
  const home = competitors.find((c) => c?.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((c) => c?.homeAway === "away") || competitors[1] || {};

  const homeScore = Number(home?.score ?? 0);
  const awayScore = Number(away?.score ?? 0);
  const watchOptions = extractWatchOptionsFromEspnBroadcasts(comp?.broadcasts || ev?.broadcasts || []);

  return {
    id,
    espnLeague: String(ev?._espnLeagueHint || ""),
    league: leagueName,
    homeTeamId: String(home?.team?.id || ""),
    awayTeamId: String(away?.team?.id || ""),
    homeTeam: home?.team?.displayName || home?.team?.name || "",
    awayTeam: away?.team?.displayName || away?.team?.name || "",
    homeTeamLogo: normalizeTeamLogo(
      home?.team?.displayName || home?.team?.name,
      home?.team?.logo || null,
      home?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(home.team.id))}.png` : null,
    ),
    awayTeamLogo: normalizeTeamLogo(
      away?.team?.displayName || away?.team?.name,
      away?.team?.logo || null,
      away?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(away.team.id))}.png` : null,
    ),
    homeScore,
    awayScore,
    status,
    minute,
    startDate: comp?.date || null,
    startTime: formatTime(comp?.date),
    watchOptions,
    servers: STREAM_SERVERS.map((s) => ({
      id: s.id,
      name: s.name,
      quality: s.quality,
      url: buildStreamUrl(id, s.id),
    })),
    sport: "football",
    sofaData: null,
    heroGradient: HERO_GRADIENTS[leagueName] || ["#101828", "#0b1220"],
  };
}

function normalizeTeamKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSofaDataFromEvent(rawEvent) {
  const event = rawEvent?.event || rawEvent;
  if (!event || !event.homeTeam || !event.awayTeam) return null;
  const meta = rawEvent?.eventMeta || event?.eventMeta || {};
  return {
    id: String(event?.id || ""),
    slug: String(event?.slug || event?.customId || ""),
    tournament: String(event?.tournament?.name || event?.tournament?.uniqueTournament?.name || ""),
    tournamentSlug: String(event?.tournament?.slug || event?.tournament?.uniqueTournament?.slug || ""),
    country: String(event?.tournament?.category?.country?.name || event?.tournament?.category?.name || ""),
    round: Number(event?.roundInfo?.round || 0) || null,
    venue: {
      name: String(event?.venue?.name || event?.venue?.stadium?.name || ""),
      city: String(event?.venue?.city?.name || ""),
      capacity: Number(event?.venue?.capacity || event?.venue?.stadium?.capacity || 0) || null,
      latitude: Number(event?.venue?.venueCoordinates?.latitude || 0) || null,
      longitude: Number(event?.venue?.venueCoordinates?.longitude || 0) || null,
    },
    startTimestamp: Number(event?.startTimestamp || 0) || null,
    status: {
      code: Number(event?.status?.code || 0),
      type: String(event?.status?.type || ""),
      description: String(event?.status?.description || ""),
    },
    standings: {
      homePosition: Number(meta?.homeTeamStandingsPosition || 0) || null,
      awayPosition: Number(meta?.awayTeamStandingsPosition || 0) || null,
    },
    homeTeam: {
      id: String(event?.homeTeam?.id || ""),
      name: String(event?.homeTeam?.name || ""),
      shortName: String(event?.homeTeam?.shortName || ""),
      slug: String(event?.homeTeam?.slug || ""),
      manager: String(event?.homeTeam?.manager?.name || ""),
    },
    awayTeam: {
      id: String(event?.awayTeam?.id || ""),
      name: String(event?.awayTeam?.name || ""),
      shortName: String(event?.awayTeam?.shortName || ""),
      slug: String(event?.awayTeam?.slug || ""),
      manager: String(event?.awayTeam?.manager?.name || ""),
    },
  };
}

async function fetchSofaIncidents(sofaEventId) {
  if (!sofaEventId) return [];
  const cacheKey = `sofascore_incidents_${sofaEventId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return Array.isArray(cached) ? cached : [];

  try {
    const url = `${SOFASCORE_API_BASE}/event/${encodeURIComponent(sofaEventId)}/incidents`;
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) { cacheSet(cacheKey, [], 120_000); return []; }
    const data = await resp.json().catch(() => ({}));
    const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
    const mapped = incidents
      .map((inc) => {
        const type = String(inc?.incidentType || "").toLowerCase();
        const detail = String(inc?.incidentClass || inc?.reason || "").toLowerCase();
        let eventType = type;

        // Period events → halftime/fulltime markers
        if (type === "period") {
          if (inc?.text === "HT" || detail.includes("half")) eventType = "Half Time";
          else if (inc?.text === "FT" || detail.includes("full")) eventType = "Full Time";
          else return null; // skip other period markers
        }
        else if (type === "card" && (detail.includes("secondyellow") || detail.includes("second yellow"))) eventType = "Second Yellow";
        else if (type === "card" && detail.includes("yellow")) eventType = "Yellow Card";
        else if (type === "card" && detail.includes("red")) eventType = "Red Card";
        else if (type === "goal" && detail.includes("own")) eventType = "Own Goal";
        else if (type === "goal" && (detail.includes("penal") || detail.includes("penalty"))) eventType = "Penalty Goal";
        else if (type === "goal") eventType = "Goal";
        else if (type === "substitution") eventType = "Substitution";
        else if (type === "vardecision" || type === "var") eventType = "VAR";
        else if (type === "injurytime") eventType = "Injury Time";
        else if (type === "inGamepenalty") {
          if (detail.includes("miss") || detail.includes("saved")) eventType = "Missed Penalty";
          else eventType = "Penalty";
        }
        else if (!type || type === "unknown") return null;

        return {
          time: inc?.time || null,
          extra: inc?.addedTime || null,
          team: String(inc?.isHome === true ? "__HOME__" : inc?.isHome === false ? "__AWAY__" : ""),
          type: eventType,
          detail: eventType,
          text: eventType,
          player: String(inc?.player?.name || inc?.player?.shortName || ""),
          assist: String(inc?.assist1?.name || inc?.assist1?.shortName || ""),
          name: String(inc?.player?.name || ""),
        };
      })
      .filter(Boolean);
    cacheSet(cacheKey, mapped, 5 * 60_000);
    return mapped;
  } catch {
    cacheSet(cacheKey, [], 120_000);
    return [];
  }
}

async function fetchSofaStatistics(sofaEventId) {
  if (!sofaEventId) return null;
  const cacheKey = `sofascore_stats_${sofaEventId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;
  try {
    const url = `${SOFASCORE_API_BASE}/event/${encodeURIComponent(sofaEventId)}/statistics`;
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) { cacheSet(cacheKey, null, 120_000); return null; }
    const data = await resp.json().catch(() => ({}));
    const periods = Array.isArray(data?.statistics) ? data.statistics : [];
    const all = periods.find((p) => p?.period === "ALL") || periods[0] || {};
    const groups = Array.isArray(all?.groups) ? all.groups : [];
    const homeStats = {};
    const awayStats = {};
    for (const group of groups) {
      for (const item of (group?.statisticsItems || [])) {
        const key = String(item?.key || item?.name || "").toLowerCase().replace(/\s+/g, "_");
        if (!key) continue;
        homeStats[key] = item?.homeValue ?? item?.home ?? 0;
        awayStats[key] = item?.awayValue ?? item?.away ?? 0;
      }
    }
    const result = { homeStats, awayStats };
    cacheSet(cacheKey, result, 5 * 60_000);
    return result;
  } catch {
    cacheSet(cacheKey, null, 120_000);
    return null;
  }
}

async function fetchSofaLineups(sofaEventId) {
  if (!sofaEventId) return null;
  const cacheKey = `sofascore_lineups_${sofaEventId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;
  try {
    const url = `${SOFASCORE_API_BASE}/event/${encodeURIComponent(sofaEventId)}/lineups`;
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) { cacheSet(cacheKey, null, 120_000); return null; }
    const data = await resp.json().catch(() => ({}));
    const result = [];
    for (const side of ["home", "away"]) {
      const lineup = data?.[side];
      if (!lineup) continue;
      const teamName = lineup?.team?.name || lineup?.team?.shortName || "";
      const formation = lineup?.formation || "";
      const players = (lineup?.players || []).map((row) => {
        const p = row?.player || row || {};
        return {
          id: String(p?.id || ""),
          name: p?.name || p?.shortName || "",
          jersey: String(row?.shirtNumber || p?.shirtNumber || "") || undefined,
          position: row?.position || "",
          positionName: row?.positionName || "",
          starter: !(row?.substitute),
          photo: p?.id ? `https://api.sofascore.app/api/v1/player/${encodeURIComponent(p.id)}/image` : null,
        };
      });
      result.push({
        team: teamName,
        teamLogo: lineup?.team?.id ? `https://api.sofascore.app/api/v1/team/${encodeURIComponent(lineup.team.id)}/image` : null,
        formation,
        lineupType: "official",
        players: players.filter((p) => p.starter),
      });
    }
    cacheSet(cacheKey, result.length > 0 ? result : null, 5 * 60_000);
    return result.length > 0 ? result : null;
  } catch {
    cacheSet(cacheKey, null, 120_000);
    return null;
  }
}

async function fetchSofaEventsByDate(date) {
  const d = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];
  const cacheKey = `sofascore_events_${d}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return Array.isArray(cached) ? cached : [];

  try {
    const url = `${SOFASCORE_API_BASE}/sport/football/scheduled-events/${encodeURIComponent(d)}`;
    const resp = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) {
      cacheSet(cacheKey, [], 60_000);
      return [];
    }

    const data = await resp.json().catch(() => ({}));
    const events = Array.isArray(data?.events) ? data.events : [];
    cacheSet(cacheKey, events, 5 * 60_000);
    return events;
  } catch {
    cacheSet(cacheKey, [], 60_000);
    return [];
  }
}

async function enrichMatchesWithSofaData(matches, dateHint = "") {
  const list = Array.isArray(matches) ? matches : [];
  if (!list.length) return list;

  const candidateDates = [];
  for (const m of list) {
    const d = String(m?.startDate || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !candidateDates.includes(d)) {
      candidateDates.push(d);
    }
  }
  const hint = String(dateHint || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hint) && !candidateDates.includes(hint)) {
    candidateDates.push(hint);
  }

  const dates = candidateDates.slice(0, 3);
  if (!dates.length) return list;

  const byKey = new Map();
  const byId = new Map();
  const allSofaEvents = [];

  const batches = await Promise.allSettled(dates.map((d) => fetchSofaEventsByDate(d)));
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const raw of batch.value || []) {
      const sofa = buildSofaDataFromEvent(raw);
      if (!sofa) continue;
      if (sofa.id) byId.set(sofa.id, sofa);
      allSofaEvents.push(sofa);

      const hk = normalizeTeamKey(sofa.homeTeam?.name);
      const ak = normalizeTeamKey(sofa.awayTeam?.name);
      if (!hk || !ak) continue;
      byKey.set(`${hk}__${ak}`, sofa);
      byKey.set(`${ak}__${hk}`, sofa);
    }
  }

  return list.map((match) => {
    const id = String(match?.id || "");
    const hk = normalizeTeamKey(match?.homeTeam);
    const ak = normalizeTeamKey(match?.awayTeam);

    // 1) Exact match by id or key
    let sofa = byId.get(id) || byKey.get(`${hk}__${ak}`) || null;

    // 2) Fuzzy match: one normalized name includes or is included in the other
    if (!sofa && hk && ak) {
      for (const candidate of allSofaEvents) {
        const sh = normalizeTeamKey(candidate.homeTeam?.name);
        const sa = normalizeTeamKey(candidate.awayTeam?.name);
        if (!sh || !sa) continue;
        const homeMatch = sh === hk || hk.includes(sh) || sh.includes(hk);
        const awayMatch = sa === ak || ak.includes(sa) || sa.includes(ak);
        const homeMatchReversed = sh === ak || ak.includes(sh) || sh.includes(ak);
        const awayMatchReversed = sa === hk || hk.includes(sa) || sa.includes(hk);
        if ((homeMatch && awayMatch) || (homeMatchReversed && awayMatchReversed)) {
          sofa = candidate;
          break;
        }
      }
    }

    return { ...match, sofaData: sofa };
  });
}

function leagueValueMultiplier(leagueName) {
  const n = String(leagueName || "").toLowerCase();
  if (n.includes("challenger") || n.includes("bel.2")) return 0.25;
  if (n.includes("jupiler") || n.includes("bel.1") || n.includes("pro league")) return 0.45;
  if (n.includes("bundesliga") || n.includes("la liga") || n.includes("ligue 1") || n.includes("serie a")) return 0.85;
  if (n.includes("premier") || n.includes("champions")) return 1.0;
  if (n.includes("eredivisie") || n.includes("scottish") || n.includes("liga nos") || n.includes("primeira")) return 0.45;
  return 0.55; // generic mid-tier fallback
}

function estimateMarketValueEUR(player, leagueName) {
  const age = Number(player?.age || 0);
  const pos = String(player?.position?.abbreviation || player?.position || "").toUpperCase();
  const baseByPos = pos.includes("GK") ? 5_000_000 : pos.includes("CB") || pos.includes("LB") || pos.includes("RB") ? 8_000_000 : pos.includes("CM") || pos.includes("DM") || pos.includes("AM") ? 12_000_000 : 10_000_000;
  let ageFactor = 1;
  if (age > 0 && age < 21) ageFactor = 1.25;
  else if (age <= 24) ageFactor = 1.15;
  else if (age <= 28) ageFactor = 1.0;
  else if (age <= 31) ageFactor = 0.82;
  else if (age > 31) ageFactor = 0.65;
  const multiplier = leagueValueMultiplier(leagueName);
  return Math.max(100_000, Math.round(baseByPos * ageFactor * multiplier));
}

function formatEURShort(value) {
  if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `€${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `€${Math.round(value / 100) / 10}K`;
  return `€${value}`;
}

function toMetersStringFromAny(heightRaw) {
  if (heightRaw == null) return undefined;

  if (typeof heightRaw === "number" && Number.isFinite(heightRaw)) {
    if (heightRaw > 100) return `${(heightRaw / 100).toFixed(2)} m`;
    return `${heightRaw.toFixed(2)} m`;
  }

  const s = String(heightRaw).trim();
  if (!s) return undefined;

  const ftIn = s.match(/(\d+)\s*['′]\s*(\d+)?/);
  if (ftIn) {
    const ft = Number(ftIn[1] || 0);
    const inch = Number(ftIn[2] || 0);
    const totalIn = ft * 12 + inch;
    if (totalIn > 0) return `${(totalIn * 2.54 / 100).toFixed(2)} m`;
  }

  const cmMatch = s.toLowerCase().match(/(\d+(?:[\.,]\d+)?)\s*cm/);
  if (cmMatch) {
    const cm = Number(cmMatch[1].replace(",", "."));
    if (Number.isFinite(cm) && cm > 0) return `${(cm / 100).toFixed(2)} m`;
  }

  const mMatch = s.toLowerCase().match(/(\d+(?:[\.,]\d+)?)\s*m/);
  if (mMatch) {
    const m = Number(mMatch[1].replace(",", "."));
    if (Number.isFinite(m) && m > 0) return `${m.toFixed(2)} m`;
  }

  const num = Number(s.replace(",", "."));
  if (Number.isFinite(num)) {
    if (num > 120) return `${(num / 100).toFixed(2)} m`;
    if (num >= 48 && num <= 90) return `${(num * 2.54 / 100).toFixed(2)} m`;
    if (num > 0 && num < 3) return `${num.toFixed(2)} m`;
  }

  return undefined;
}

function toKgStringFromAny(weightRaw) {
  if (weightRaw == null) return undefined;

  if (typeof weightRaw === "number" && Number.isFinite(weightRaw)) {
    if (weightRaw > 130) return `${Math.round(weightRaw * 0.453592)} kg`;
    return `${Math.round(weightRaw)} kg`;
  }

  const s = String(weightRaw).trim();
  if (!s) return undefined;

  const kgMatch = s.toLowerCase().match(/(\d+(?:[\.,]\d+)?)\s*kg/);
  if (kgMatch) {
    const kg = Number(kgMatch[1].replace(",", "."));
    if (Number.isFinite(kg) && kg > 0) return `${Math.round(kg)} kg`;
  }

  const lbMatch = s.toLowerCase().match(/(\d+(?:[\.,]\d+)?)\s*(lb|lbs|pound)/);
  if (lbMatch) {
    const lbs = Number(lbMatch[1].replace(",", "."));
    if (Number.isFinite(lbs) && lbs > 0) return `${Math.round(lbs * 0.453592)} kg`;
  }

  const num = Number(s.replace(",", "."));
  if (Number.isFinite(num)) {
    if (num > 130) return `${Math.round(num * 0.453592)} kg`;
    if (num > 0) return `${Math.round(num)} kg`;
  }

  return undefined;
}

function tryParseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fenced = String(text || "").match(/```json\s*([\s\S]*?)```/i) || String(text || "").match(/```([\s\S]*?)```/);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  return null;
}

async function aiEstimateRosterValues(players, teamName, leagueName) {
  if (!Array.isArray(players) || players.length === 0) return null;
  const hasProvider = Boolean(
    process.env.OLLAMA_MODEL ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY
  );
  if (!hasProvider) return null;

  const compact = players.slice(0, 30).map((p) => ({
    id: p.id,
    name: p.name,
    age: p.age,
    position: p.position,
    nationality: p.nationality,
  }));

  const isBelgian = /jupiler|bel\.1|pro.?league|eerste.*klasse/i.test(leagueName || "");
  const leagueContext = isBelgian
    ? [
        "JUPILER PRO LEAGUE context (seizoen 2024/25):",
        "- Gemiddelde speler: €200K–€1.5M",
        "- Goede stamspeler (24-28 jaar): €500K–€3M",
        "- Topspeler Club Brugge/Anderlecht/Gent: €3M–€15M",
        "- Jonge beloften (<22j): €300K–€5M",
        "- Oudere spelers (>32j): €100K–€500K",
        "Geef REALISTISCHE Jupiler Pro League waarden, NIET Premier League waarden!",
      ].join("\n")
    : "";

  const prompt = [
    `Geef de meest nauwkeurige Transfermarkt.com marktwaarden (EUR) voor spelers van ${teamName || "Unknown"}${leagueName ? ` (${leagueName})` : ""} seizoen 2024/25.`,
    leagueContext,
    "Voor BEKENDE spelers (internationals, topcompetitie): gebruik je trainingskennis van echte Transfermarkt waarden.",
    "Voor MINDER BEKENDE spelers: schat conservatief op basis van leeftijd, positie en competitieniveau.",
    "Output STRIKT JSON: {\"players\":[{\"id\":\"...\",\"value_eur\":12345678}]}",
    "Geen tekst buiten JSON.",
    JSON.stringify(compact),
  ].filter(Boolean).join("\n");

  try {
    const sys = { role: "system", content: "Je bent een expert voetbaltransfer analist met diepgaande kennis van Transfermarkt.com waarden. Je geeft altijd realistische waarden gebaseerd op je trainingsdata. Output uitsluitend geldige JSON." };
    const user = { role: "user", content: prompt };
    const providers = [];
    if (process.env.OLLAMA_MODEL) providers.push(() => ollamaChat([sys, user], { temperature: 0.2 }));
    if (process.env.DEEPSEEK_API_KEY) providers.push(() => deepseekChat([sys, user], { temperature: 0.2 }));
    if (process.env.OPENROUTER_API_KEY) providers.push(() => openrouterChat([sys, user], { temperature: 0.2 }));
    if (process.env.GROQ_API_KEY) providers.push(() => groqChat([sys, user], { temperature: 0.2 }));
    if (process.env.OPENAI_API_KEY) providers.push(() => openaiChat([sys, user], { temperature: 0.2, model: "gpt-4o-mini" }));
    if (process.env.GEMINI_API_KEY) providers.push(() => geminiChat([sys, user], { temperature: 0.2 }));

    for (const run of providers) {
      try {
        const raw = await run();
        const parsed = tryParseJSON(raw);
        const rows = Array.isArray(parsed?.players) ? parsed.players : [];
        const map = new Map();
        for (const row of rows) {
          const id = String(row?.id || "");
          const eur = Number(row?.value_eur || 0);
          if (!id || !Number.isFinite(eur) || eur <= 0) continue;
          map.set(id, eur);
        }
        if (map.size > 0) return map;
      } catch {
        // try next provider
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Transfermarkt community API – direct player search (market value + transfers + photo)
async function fetchTransfermarktPlayerDirect(playerName, teamName) {
  if (!playerName) return null;
  const normKey = `${normalizePersonName(playerName)}_${normalizePersonName(teamName || "")}`;
  const cacheKey = `transfermarkt_player_direct_${normKey}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    const q = encodeURIComponent(String(playerName).trim());
    const searchResp = await fetch(`https://transfermarkt-api-sigma.vercel.app/players/search/${q}`, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchResp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const searchData = await searchResp.json();
    const results = Array.isArray(searchData?.results) ? searchData.results : [];
    if (results.length === 0) { cacheSet(cacheKey, null, 300_000); return null; }

    // Pick best match: prefer exact team match, then name similarity
    const normTeam = normalizePersonName(teamName || "");
    const normPlayer = normalizePersonName(playerName);
    let best = null;
    let bestScore = 0;
    for (const r of results.slice(0, 10)) {
      const rName = normalizePersonName(r?.name || r?.playerName || "");
      const rClub = normalizePersonName(r?.club?.name || r?.team || "");
      let score = similarityScore(normPlayer, rName);
      if (normTeam && rClub && similarityScore(normTeam, rClub) >= 0.5) score += 0.3;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (!best || bestScore < 0.45) { cacheSet(cacheKey, null, 300_000); return null; }

    const playerId = best.id;
    const marketValueEur = parseMarketValueEUR(best?.marketValue?.value ?? best?.marketValue);
    const photo = proxyPhotoUrl(String(best?.image || best?.photo || "").trim() || null);

    // Fetch transfers for club history
    let transfers = [];
    try {
      const trResp = await fetch(`https://transfermarkt-api-sigma.vercel.app/players/${encodeURIComponent(playerId)}/transfers`, {
        headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (trResp.ok) {
        const trData = await trResp.json();
        const trList = Array.isArray(trData?.transfers) ? trData.transfers : [];
        for (const t of trList.slice(0, 20)) {
          const from = String(t?.from?.clubName || t?.from?.name || t?.oldClub?.name || t?.from?.club?.name || "").trim();
          const to = String(t?.to?.clubName || t?.to?.name || t?.newClub?.name || t?.to?.club?.name || "").trim();
          const date = String(t?.date || t?.season || "").trim();
          const fee = String(t?.fee || t?.transferFee || "").trim();
          if (from) transfers.push({ name: from, role: "from", date, fee });
          if (to) transfers.push({ name: to, role: "to", date, fee });
        }
      }
    } catch { /* ignore */ }

    // Deduplicate transfers
    const seen = new Set();
    transfers = transfers.filter(t => {
      const key = `${t.name}_${t.date}_${t.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(t.name);
    }).slice(0, 12);

    const result = {
      marketValueEur: Number.isFinite(marketValueEur) && marketValueEur > 0 ? marketValueEur : null,
      photo: photo || null,
      transfers,
      source: "transfermarkt-direct",
    };
    cacheSet(cacheKey, result, 86_400_000); // cache 24h
    return result;
  } catch {
    cacheSet(cacheKey, null, 300_000);
    return null;
  }
}

// Transfermarkt community API – free, no key required
// https://transfermarkt-api-sigma.vercel.app (open-source wrapper)
// ESPN display names → Transfermarkt search names (for names that don't yield TM results)
const TM_CLUB_NAME_MAP = {
  "Wolverhampton Wanderers": "Wolverhampton",
  "Nottingham Forest": "Nottm Forest",
  "Brighton and Hove Albion": "Brighton",
  "West Ham United": "West Ham",
  "Sheffield United": "Sheffield Utd",
  "Leicester City": "Leicester",
  "Leeds United": "Leeds",
  "Norwich City": "Norwich",
  "Ipswich Town": "Ipswich",
  "FC Internazionale Milano": "Inter Milan",
  "Inter Milan": "Inter Milan",
  "SSC Napoli": "Napoli",
  "ACF Fiorentina": "Fiorentina",
  "Bologna FC 1909": "Bologna",
  "Torino FC": "Torino",
  "Hellas Verona FC": "Verona",
  "Hellas Verona": "Verona",
  "Atlético de Madrid": "Atletico Madrid",
  "Real Sociedad de Fútbol": "Real Sociedad",
  "Athletic Club": "Athletic Bilbao",
  "Villarreal CF": "Villarreal",
  "1. FC Heidenheim 1846": "Heidenheim",
  "1.FC Heidenheim 1846": "Heidenheim",
  "1. FC Union Berlin": "Union Berlin",
  "1.FC Union Berlin": "Union Berlin",
  "TSG 1899 Hoffenheim": "Hoffenheim",
  "VfL Wolfsburg": "Wolfsburg",
  "VfB Stuttgart": "Stuttgart",
  "SV Werder Bremen": "Werder Bremen",
  "Borussia Mönchengladbach": "Gladbach",
  "Paris Saint-Germain": "PSG",
  "Stade Rennais FC": "Rennes",
  "RC Strasbourg Alsace": "Strasbourg",
  "Stade Brestois 29": "Brest",
  "FC Toulouse": "Toulouse",
  "Montpellier HSC": "Montpellier",
  "Stade de Reims": "Reims",
  "RC Lens": "Lens",
  "Le Havre AC": "Le Havre",
  "Club Brugge KV": "Club Brugge",
  "KRC Genk": "Genk",
  "RSC Anderlecht": "Anderlecht",
  "KAA Gent": "Gent",
  "Feyenoord Rotterdam": "Feyenoord",
  "Ajax Amsterdam": "Ajax",
  "GNK Dinamo Zagreb": "Dinamo Zagreb",
  "HNK Hajduk Split": "Hajduk Split",
  "FK Crvena zvezda": "Red Star Belgrade",
  "AC Sparta Prague": "Sparta Prague",
  "SK Slavia Prague": "Slavia Prague",
  "Legia Warszawa": "Legia Warsaw",
  "Lech Poznan": "Lech Poznan",
  "Malmö FF": "Malmö",
  "Djurgårdens IF": "Djurgarden",
};

async function fetchTransfermarktClubPlayers(teamName) {
  if (!teamName) return null;
  const normKey = normalizePersonName(teamName);
  const cacheKey = `transfermarkt_club_${normKey}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    // Use mapped name if available for more accurate Transfermarkt search
    const searchName = TM_CLUB_NAME_MAP[teamName] || String(teamName).trim();
    const q = encodeURIComponent(searchName);
    const searchResp = await fetch(`https://transfermarkt-api-sigma.vercel.app/clubs/search/${q}`, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchResp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const searchData = await searchResp.json();
    let clubs = Array.isArray(searchData?.results) ? searchData.results : [];

    // If mapped name found no results, retry with original ESPN name
    if (clubs.length === 0 && TM_CLUB_NAME_MAP[teamName]) {
      const q2 = encodeURIComponent(String(teamName).trim());
      const resp2 = await fetch(`https://transfermarkt-api-sigma.vercel.app/clubs/search/${q2}`, {
        headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (resp2.ok) {
        const data2 = await resp2.json();
        clubs = Array.isArray(data2?.results) ? data2.results : [];
      }
    }
    if (clubs.length === 0) { cacheSet(cacheKey, null, 300_000); return null; }

    // Pick best matching club by name similarity instead of always first result
    const normInput = normalizePersonName(teamName);
    let club = clubs[0];
    let bestScore = 0;
    for (const c of clubs) {
      const cName = normalizePersonName(c?.name || c?.club || "");
      const score = similarityScore(normInput, cName);
      if (score > bestScore) { bestScore = score; club = c; }
    }
    if (!club?.id) { cacheSet(cacheKey, null, 300_000); return null; }

    const playersResp = await fetch(`https://transfermarkt-api-sigma.vercel.app/clubs/${encodeURIComponent(club.id)}/players`, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!playersResp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const playersData = await playersResp.json();
    const players = Array.isArray(playersData?.players) ? playersData.players : [];

    const result = players.map((p) => ({
      name: normalizePersonName(p?.name || ""),
      marketValueEur: parseMarketValueEUR(p?.marketValue?.value ?? p?.marketValue),
      photo: proxyPhotoUrl(String(p?.image || p?.photo || p?.picture || "").trim() || null),
    })).filter((p) => p.name);

    // Also store the club squad market value for team endpoint
    result._clubMarketValue = parseMarketValueEUR(club?.marketValue);
    result._clubSquadSize = parseInt(club?.squad, 10) || players.length;

    cacheSet(cacheKey, result, 86_400_000); // cache 24h
    return result;
  } catch {
    cacheSet(cacheKey, null, 300_000);
    return null;
  }
}

async function enrichRosterMarketValues(players, teamName, _leagueName) {
  if (!Array.isArray(players) || players.length === 0) return players || [];

  // Step 1: Transfermarkt community API – real values, no key required (cached 24h)
  const tmPlayers = teamName ? await fetchTransfermarktClubPlayers(teamName) : null;
  const tmValueMap = new Map();
  const tmEntries = [];
  if (Array.isArray(tmPlayers)) {
    for (const p of tmPlayers) {
      const normed = normalizePersonName(p.name);
      const eur = parseMarketValueEUR(p.marketValueEur);
      if (Number.isFinite(eur) && eur > 0) {
        tmValueMap.set(normed, eur);
        tmEntries.push({ normed, eur });
      }
    }
  }
  console.log(`[market] ${teamName}: Transfermarkt found ${tmValueMap.size}/${players.length} values`);

  return players.map((p) => {
    const next = { ...p };
    const normedName = normalizePersonName(next.name || "");

    // Transfermarkt exact match first (real value)
    const tmValue = tmValueMap.get(normedName);
    if (Number.isFinite(tmValue) && tmValue > 0) {
      next.marketValue = formatEURShort(tmValue);
      next.isRealValue = true;
      next.valueMethod = "transfermarkt";
      return next;
    }

    // Transfermarkt fuzzy match – last-name + similarity score
    let bestTmVal = null;
    let bestTmScore = 0;
    for (const entry of tmEntries) {
      const score = similarityScore(normedName, entry.normed);
      if (score > bestTmScore) { bestTmScore = score; bestTmVal = entry.eur; }
    }
    if (bestTmScore >= 0.45 && Number.isFinite(bestTmVal) && bestTmVal > 0) {
      next.marketValue = formatEURShort(bestTmVal);
      next.isRealValue = true;
      next.valueMethod = "transfermarkt-fuzzy";
      return next;
    }

    // Estimated fallback – position + age + league tier
    const estimated = estimateMarketValueEUR(next, _leagueName);
    if (Number.isFinite(estimated) && estimated > 0) {
      next.marketValue = formatEURShort(estimated);
      next.isRealValue = false;
      next.valueMethod = "estimated";
      return next;
    }

    next.isRealValue = false;
    next.valueMethod = "unverified";
    return next;
  });
}

async function enrichRosterPhotos(players, teamName) {
  if (!Array.isArray(players) || players.length === 0) return players || [];

  // Build Transfermarkt photo map (Step 0) and TheSportsDB photo map (Steps 1-2) in parallel
  const [tmPlayers, dbPlayers] = await Promise.all([
    teamName ? fetchTransfermarktClubPlayers(teamName) : Promise.resolve(null),
    fetchTheSportsDBTeamPlayers(teamName),
  ]);

  // ------ Transfermarkt photo lookup tables ------
  const tmPhotoMap = new Map();
  const tmPhotoEntries = [];
  if (Array.isArray(tmPlayers)) {
    for (const p of tmPlayers) {
      if (p.name && p.photo && /^https?:\/\//i.test(p.photo)) {
        const normed = normalizePersonName(p.name);
        tmPhotoMap.set(normed, p.photo);
        tmPhotoEntries.push({ normed, photo: p.photo });
      }
    }
  }

  // ------ TheSportsDB photo lookup tables ------
  const dbPhotoMap = new Map();
  const dbPhotoEntries = [];
  for (const dbp of dbPlayers) {
    if (dbp.name && dbp.photo) {
      dbPhotoMap.set(dbp.name, dbp.photo);
      dbPhotoEntries.push({ name: dbp.name, photo: dbp.photo });
    }
  }

  // ------ Step 0-2: Match each player against TM + TheSportsDB data ------
  let enriched = players.map((player) => {
    if (!player) return player;
    const normName = normalizePersonName(player.name || "");
    if (!normName) return player;

    let bestPhoto = keepIncomingPlayerPhoto(player.photo); // keep only non-provisional incoming photos
    let sportsDbPhoto = null;

    // --- Transfermarkt: exact then fuzzy ---
    if (!bestPhoto) {
      const tmExact = tmPhotoMap.get(normName);
      if (tmExact) {
        bestPhoto = tmExact;
      } else {
        let bestTmScore = 0;
        let bestTmPhoto = null;
        for (const entry of tmPhotoEntries) {
          const score = similarityScore(normName, entry.normed);
          if (score > bestTmScore) { bestTmScore = score; bestTmPhoto = entry.photo; }
        }
        if (bestTmScore >= 0.38 && bestTmPhoto) bestPhoto = bestTmPhoto;
      }
    }

    // --- TheSportsDB: exact, fuzzy, last-name ---
    const dbExact = dbPhotoMap.get(normName);
    if (dbExact) {
      sportsDbPhoto = dbExact;
      if (!bestPhoto) bestPhoto = dbExact;
    } else {
      let bestDbScore = 0;
      let bestDbPhoto = null;
      for (const entry of dbPhotoEntries) {
        const score = similarityScore(normName, entry.name);
        if (score > bestDbScore) { bestDbScore = score; bestDbPhoto = entry.photo; }
      }
      if (bestDbScore >= 0.38 && bestDbPhoto) {
        sportsDbPhoto = bestDbPhoto;
        if (!bestPhoto) bestPhoto = bestDbPhoto;
      } else {
        // Last-name unique match
        const lastNameParts = normName.split(" ");
        const lastName = lastNameParts[lastNameParts.length - 1];
        if (lastName && lastName.length >= 3) {
          const candidates = dbPhotoEntries.filter((e) => {
            const parts = (e.name || "").split(" ");
            return parts[parts.length - 1] === lastName;
          });
          if (candidates.length === 1 && candidates[0].photo) {
            sportsDbPhoto = candidates[0].photo;
            if (!bestPhoto) bestPhoto = candidates[0].photo;
          }
        }
      }
    }

    return {
      ...player,
      photo: bestPhoto,
      theSportsDbPhoto: sportsDbPhoto,
    };
  });

  // ------ Steps 3+4: TheSportsDB search + TM direct + Wikipedia (parallel, batched) ------
  const stillNeed = enriched.filter((p) => p && !p.photo && p.name && p.name !== "Onbekend");
  if (stillNeed.length > 0 && stillNeed.length <= 200) {
    const BATCH = 10;
    const combinedMap = new Map();
    for (let i = 0; i < stillNeed.length; i += BATCH) {
      const batch = stillNeed.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (player) => {
          const normName = normalizePersonName(player.name || "");
          const normTeam = normalizePersonName(teamName || "");
          // Try TheSportsDB search first (full name, last name, first name)
          // Uses team-aware matching: prefer players from same team, require higher similarity
          try {
            const queries = [String(player.name || "").trim()];
            const parts = String(player.name || "").trim().split(/\s+/);
            if (parts.length >= 2) {
              queries.push(parts[parts.length - 1]);
              queries.push(parts[0]);
            }
            let bestResult = null;
            let bestScore = 0;
            for (const rawQ of queries) {
              const q = encodeURIComponent(rawQ);
              if (!q) continue;
              const resp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${q}`, {
                headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)" },
                signal: AbortSignal.timeout(5000),
              });
              if (!resp.ok) continue;
              const data = await resp.json();
              for (const r of (data?.player || [])) {
                const rName = normalizePersonName(r?.strPlayer || "");
                const photo = r?.strCutout || r?.strThumb || r?.strRender || null;
                if (!photo || !/^https?:\/\//i.test(photo)) continue;
                const nameScore = similarityScore(normName, rName);
                if (nameScore < 0.42) continue;
                // Boost score if team matches (strTeam or strTeam2)
                const rTeam = normalizePersonName(r?.strTeam || "");
                const rTeam2 = normalizePersonName(r?.strTeam2 || "");
                const teamMatch = normTeam && (similarityScore(normTeam, rTeam) >= 0.50 || similarityScore(normTeam, rTeam2) >= 0.50);
                const finalScore = teamMatch ? nameScore + 0.3 : nameScore;
                if (finalScore > bestScore) { bestScore = finalScore; bestResult = photo; }
              }
            }
            if (bestResult) return [player.name, bestResult];
          } catch { /* ignore */ }
          // Try Transfermarkt direct player search
          try {
            const tmResult = await fetchTransfermarktPlayerDirect(player.name, teamName);
            if (tmResult?.photo) return [player.name, tmResult.photo];
          } catch { /* ignore */ }
          // Fall back to Wikipedia
          try {
            const wikiPhoto = await fetchWikipediaPlayerPhoto(player.name);
            if (wikiPhoto) return [player.name, wikiPhoto];
          } catch { /* ignore */ }
          return [player.name, null];
        })
      );
      for (const [name, photo] of results) {
        if (name && photo) combinedMap.set(name, photo);
      }
    }
    if (combinedMap.size > 0) {
      enriched = enriched.map((player) => {
        if (!player || player.photo) return player;
        const found = combinedMap.get(player.name);
        return found ? { ...player, photo: found } : player;
      });
    }
  }

  // ------ Step 5: AI-assisted photo resolution via Gemini ------
  const aiCandidates = enriched.filter((p) => p && !p.photo && p.name && p.name !== "Onbekend");
  console.log(`[photos][ai] ${teamName}: ${aiCandidates.length} players without photo, attempting Gemini AI...`);
  if (aiCandidates.length > 0 && aiCandidates.length <= 60) {
    try {
      const aiPhotoMap = await resolvePlayerPhotosViaAI(aiCandidates, teamName);
      console.log(`[photos][ai] ${teamName}: Gemini returned ${aiPhotoMap.size} photos`);
      if (aiPhotoMap.size > 0) {
        enriched = enriched.map((player) => {
          if (!player || player.photo) return player;
          const found = aiPhotoMap.get(player.name);
          return found ? { ...player, photo: found } : player;
        });
      }
    } catch (err) {
      console.warn(`[photos][ai] AI photo step failed:`, err.message);
    }
  }

  // ------ Step 6: ESPN CDN headshot fallback (validated — skip black placeholders) ------
  const espnCandidates = enriched.filter((p) => p && !p.photo && /^\d+$/.test(String(p.id || "").trim()));
  if (espnCandidates.length > 0) {
    const espnResults = await Promise.all(
      espnCandidates.map(async (player) => {
        const espnId = String(player.id || "").trim();
        const url = `https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png`;
        const validated = await validateEspnHeadshot(url);
        return [player.name, validated];
      })
    );
    const espnMap = new Map(espnResults.filter(([, v]) => v));
    if (espnMap.size > 0) {
      enriched = enriched.map((player) => {
        if (!player || player.photo) return player;
        const found = espnMap.get(player.name);
        return found ? { ...player, photo: found } : player;
      });
    }
    console.log(`[photos][espn] ${teamName}: ${espnMap.size}/${espnCandidates.length} ESPN headshots validated`);
  }

  // ------ Step 7: UI Avatars guaranteed fallback (generates avatar from initials) ------
  enriched = enriched.map((player) => {
    if (!player || player.photo) return player;
    const name = String(player.name || "Player").trim();
    if (!name || name === "Onbekend") return player;
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=1a1a2e&color=e0e0e0&bold=true&format=png`;
    return { ...player, photo: avatarUrl, isGeneratedAvatar: true };
  });

  const withPhoto = enriched.filter((p) => p && p.photo).length;
  const total = enriched.filter((p) => p).length;
  console.log(`[photos] ${teamName}: ${withPhoto}/${total} players have photos`);

  return enriched;
}

function inferStrengthsWeaknesses(position, age) {
  const pos = String(position || "").toUpperCase();
  const years = Number(age || 0);
  const strengths = [];
  const weaknesses = [];

  if (/GK/.test(pos)) {
    strengths.push("Reflexen", "Positionering", "1-op-1 reddingen");
    weaknesses.push("Meevoetballen onder druk");
  } else if (/CB|LB|RB|WB|DEF|BACK/.test(pos)) {
    strengths.push("Duelkracht", "Positionering", "Defensieve organisatie");
    weaknesses.push("Ruimte in de rug");
  } else if (/DM|CM|AM|MID|LM|RM/.test(pos)) {
    strengths.push("Balcirculatie", "Spelinzicht", "Passing");
    weaknesses.push("Luchtduels tegen fysiek sterke tegenstanders");
  } else if (/ST|CF|FW|LW|RW|ATT|STRIKER/.test(pos)) {
    strengths.push("Afwerking", "Loopacties", "Diepgang");
    weaknesses.push("Defensieve bijdrage");
  } else {
    strengths.push("Werkethiek", "Tactisch inzicht");
    weaknesses.push("Constante impact over 90 minuten");
  }

  if (years > 0 && years <= 21) {
    strengths.push("Ontwikkelingspotentieel");
    weaknesses.push("Ervaring in topwedstrijden");
  } else if (years >= 32) {
    strengths.push("Ervaring", "Leiderschap");
    weaknesses.push("Herstelsnelheid");
  }

  return {
    strengths: Array.from(new Set(strengths)).slice(0, 5),
    weaknesses: Array.from(new Set(weaknesses)).slice(0, 5),
  };
}

async function aiAnalyzePlayerProfile(player, context = {}) {
  const hasAnyProvider = Boolean(
    process.env.OLLAMA_MODEL ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY
  );

  // Zilliz cache check – ook bruikbaar zonder AI provider
  const zKey = `${String(player?.name || "")}_${String(player?.position || "")}_${String(context?.league || "")}`;
  const zCached = await zillizGet("player_analysis", zKey);
  if (zCached?.summary || zCached?.strengths?.length) return zCached;

  if (!hasAnyProvider) return null;

  const sys = {
    role: "system",
    content: "Je bent een elite voetbalscout met diepgaande kennis van profvoetballers wereldwijd. Je gebruikt je volledige trainingskennis over bekende spelers. Antwoord strikt in geldig JSON.",
  };
  const playerName = String(player?.name || "");
  const playerPos = String(player?.position || "");
  const playerAge = player?.age ? `${player.age} jaar` : "";
  const playerClub = String(player?.currentClub || "");
  const user = {
    role: "user",
    content:
      `Maak een gedetailleerde professionele spelersanalyse voor: ${playerName}${playerPos ? ` (${playerPos})` : ""}${playerAge ? `, ${playerAge}` : ""}${playerClub ? `, ${playerClub}` : ""}.` +
      `\n\nAls je deze speler herkent uit je trainingsdata (bijv. een bekende international of topcompetitiespeler), gebruik dan je kennis van zijn/haar speelstijl, kwaliteiten en actuele rol. Wees specifiek en concreet – vermijd generieke omschrijvingen.` +
      `\n\nOutput ALLEEN geldig JSON:\n{"summary":"2-3 zinnen concrete scoutsanalyse over speelstijl en impact","strengths":["max 5 concrete sterke punten"],"weaknesses":["max 3 concrete zwaktes"]}` +
      `\n\nINPUT:\n` + JSON.stringify({ player, context }, null, 2),
  };

  const providers = [];
  if (process.env.OLLAMA_MODEL) providers.push(() => ollamaChat([sys, user], { temperature: 0.25 }));
  if (process.env.DEEPSEEK_API_KEY) providers.push(() => deepseekChat([sys, user], { temperature: 0.25 }));
  if (process.env.OPENROUTER_API_KEY) providers.push(() => openrouterChat([sys, user], { temperature: 0.25 }));
  if (process.env.GROQ_API_KEY) providers.push(() => groqChat([sys, user], { temperature: 0.25 }));
  if (process.env.OPENAI_API_KEY) providers.push(() => openaiChat([sys, user], { temperature: 0.25 }));
  if (process.env.GEMINI_API_KEY) providers.push(() => geminiChat([sys, user], { temperature: 0.25 }));

  for (const run of providers) {
    try {
      const raw = await run();
      const parsed = tryParseJSON(raw);
      const summary = String(parsed?.summary || "").trim();
      const strengths = Array.isArray(parsed?.strengths) ? parsed.strengths.map((x) => String(x).trim()).filter(Boolean) : [];
      const weaknesses = Array.isArray(parsed?.weaknesses) ? parsed.weaknesses.map((x) => String(x).trim()).filter(Boolean) : [];
      if (summary || strengths.length || weaknesses.length) {
        const result = {
          summary: summary || null,
          strengths: strengths.slice(0, 5),
          weaknesses: weaknesses.slice(0, 5),
        };
        zillizPut("player_analysis", zKey, result); // asynchroon opslaan in Zilliz
        return result;
      }
    } catch {
      // try next provider
    }
  }

  return null;
}

function mapFormerClubs(transfers) {
  const clubs = [];
  for (const t of transfers || []) {
    const outClub = String(t?.teams?.out?.name || "").trim();
    const inClub = String(t?.teams?.in?.name || "").trim();
    const date = String(t?.date || "").trim();
    if (outClub) clubs.push({ name: outClub, role: "from", date });
    if (inClub) clubs.push({ name: inClub, role: "to", date });
  }
  const unique = [];
  const seen = new Set();
  for (const c of clubs) {
    const key = `${c.name}_${c.date}`;
    if (!c.name || seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique.slice(0, 12);
}

function mapEspnRosterPlayer(player) {
  const playerId = String(player?.id || "");
  const espnCdnUrl = playerId && /^\d+$/.test(playerId)
    ? `https://a.espncdn.com/i/headshots/soccer/players/full/${playerId}.png`
    : null;
  return {
    id: playerId,
    name: player?.displayName || player?.fullName || "Onbekend",
    jersey: player?.jersey ? String(player.jersey) : undefined,
    age: Number(player?.age || 0) || undefined,
    nationality: player?.citizenship || player?.birthCountry || undefined,
    position: player?.position?.abbreviation || player?.position?.name || "",
    positionName: player?.position?.displayName || player?.position?.name || player?.position?.abbreviation || "",
    height: toMetersStringFromAny(player?.displayHeight || player?.height),
    weight: toKgStringFromAny(player?.displayWeight || player?.weight),
    marketValue: undefined,
    isRealValue: false,
    photo: normalizePlayerPhoto(playerId, player?.headshot?.href, espnCdnUrl),
  };
}

function getDateParam(req) {
  const q = String(req.query?.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return new Date().toISOString().slice(0, 10);
}


function footballSource() {
  return "espn";
}

async function footballApi(pathAndQuery, sportsrcParams = null) {
  // ESPN-only mode: kept for backward compatibility in legacy code paths.
  return { response: [] };
}

// -----------------------------
// Shared helpers (football)
// -----------------------------

function normalizeLeagueName(name) {
  if (!name) return name;
  const n = String(name).trim();
  // Champions League variants
  if (/champions.?league/i.test(n) || n === "UCL" || n === "UEFA CL") return "UEFA Champions League";
  // Europa League variants
  if (/europa.?league/i.test(n) || /uefa.?europa/i.test(n)) return "UEFA Europa League";
  // Conference League variants
  if (/conference.?league/i.test(n) || /uefa.?conference/i.test(n) || /europa.?conference/i.test(n)) return "UEFA Conference League";
  // Belgian second division (must be checked BEFORE generic pro league pattern)
  if (/challenger/i.test(n) || /bel\.?2/i.test(n) || /belgian.?second/i.test(n) || /tweede.*klasse/i.test(n)) return "Challenger Pro League";
  // Belgium first division
  if (/jupiler|pro.?league|belgian.?first|eerste.*klasse/i.test(n)) return "Jupiler Pro League";
  // Belgian Cup
  if (/belgian.?cup|beker.*belgi/i.test(n)) return "Belgian Cup";
  // Premier League
  if (/premier.?league|epl|english.?premier/i.test(n)) return "Premier League";
  // La Liga
  if (/la.?liga|laliga|primera.?division|spain.*1/i.test(n)) return "La Liga";
  // Bundesliga
  if (/bundesliga|german.*1|1.*bundesliga/i.test(n)) return "Bundesliga";
  // Ligue 1
  if (/ligue.?1|french.?1|ligue1/i.test(n)) return "Ligue 1";
  // Serie A
  if (/serie.?a|italian.?1|serie.*italiana/i.test(n)) return "Serie A";
  return n;
}

function seasonForDate(d = new Date()) {
  // Season 2025/26 starts in July 2025 → return 2025
  // Season 2024/25 starts in July 2024 → return 2024
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 1-12
  return month >= 7 ? year : year - 1;
}

function formatSeasonLabel(season) {
  if (!season) return "";
  const next = (season + 1) % 100;
  return `${season}/${String(next).padStart(2, "0")}`;
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: TZ,
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(11, 16);
  }
}

const LEAGUE_IDS = {
  "Premier League": 39,
  "UEFA Champions League": 2,
  "Champions League": 2,
  "UEFA Europa League": 3,
  "UEFA Conference League": 848,
  "La Liga": 140,
  "Bundesliga": 78,
  "Jupiler Pro League": 144,
  "Challenger Pro League": 145,
  "Ligue 1": 61,
  "Serie A": 135,
};

const HERO_GRADIENTS = {
  "Premier League": ["#1B0A2E", "#0D0516"],
  "UEFA Champions League": ["#0A1628", "#050B14"],
  "UEFA Europa League": ["#1A1008", "#0D0804"],
  "UEFA Conference League": ["#081A16", "#040D0B"],
  "La Liga": ["#1A0810", "#0D0408"],
  "Bundesliga": ["#1A0808", "#0D0404"],
  "Jupiler Pro League": ["#0A1A0F", "#050D08"],
  "Challenger Pro League": ["#0A1A0F", "#050D08"],
  "Ligue 1": ["#0E0A1A", "#07050D"],
  "Serie A": ["#0A101A", "#05080D"],
};

const OFFICIAL_BROADCASTER_URLS = {
  ziggo: "https://www.ziggogo.tv/",
  dazn: "https://www.dazn.com/",
  espn: "https://www.espn.com/watch/",
  viaplay: "https://viaplay.com/",
  tnt: "https://www.discoveryplus.com/",
  eurosport: "https://www.eurosport.com/watch/",
  canal: "https://www.canalplus.com/",
  bein: "https://www.beinsports.com/",
  sky: "https://www.sky.com/watch",
  amazon: "https://www.primevideo.com/",
  paramount: "https://www.paramountplus.com/",
  peacock: "https://www.peacocktv.com/sports",
  fubo: "https://www.fubo.tv/",
};

function normalizeBroadcasterName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function broadcasterUrlFromName(name) {
  const normalized = normalizeBroadcasterName(name);
  if (!normalized) return "";
  const foundKey = Object.keys(OFFICIAL_BROADCASTER_URLS).find((key) => normalized.includes(key));
  if (foundKey) return OFFICIAL_BROADCASTER_URLS[foundKey];
  return "https://www.google.com/search?q=" + encodeURIComponent(`${String(name)} live stream official`);
}

function extractWatchOptionsFromEspnBroadcasts(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  const out = [];

  for (const row of list) {
    const candidates = [
      row?.market?.name,
      row?.market,
      row?.station?.callSign,
      row?.station?.name,
      row?.station,
      row?.media?.shortName,
      row?.media?.name,
      row?.name,
      row?.displayName,
      row?.shortName,
    ];
    for (const candidate of candidates) {
      const label = String(candidate || "").trim();
      if (!label) continue;
      const key = normalizeBroadcasterName(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: label,
        url: broadcasterUrlFromName(label),
        source: "official-broadcast",
      });
    }
  }

  return out.slice(0, 8);
}

const STREAM_SERVERS = [
  { id: "auto", name: "AUTO", quality: "BEST" },
];

const STREAM_URL_CACHE = new Map();

function buildStreamCandidates(matchId) {
  return [
    `https://embedme.top/embed/alpha/${matchId}/1`,
    `https://embedme.top/embed/alpha/${matchId}/2`,
    `https://embedme.top/embed/alpha/${matchId}/3`,
  ];
}

async function probeUrl(url, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)" },
      redirect: "follow",
      signal: controller.signal,
    });
    return resp.ok || (resp.status >= 300 && resp.status < 500);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOfficialWatchOptionsForMatch(matchId, espnLeague = "eng.1") {
  const id = String(matchId || "").trim();
  if (!id) return [];
  try {
    const leagueSlug = ESPN_LEAGUE_SLUGS[espnLeague] || espnLeague;
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueSlug)}/summary?event=${encodeURIComponent(id)}`;
    const summaryResp = await fetch(summaryUrl, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!summaryResp.ok) return [];
    const summary = await summaryResp.json();
    const headerComp = summary?.header?.competitions?.[0] || {};
    return extractWatchOptionsFromEspnBroadcasts([
      ...(Array.isArray(headerComp?.broadcasts) ? headerComp.broadcasts : []),
      ...(Array.isArray(summary?.broadcasts) ? summary.broadcasts : []),
    ]);
  } catch {
    return [];
  }
}

async function resolveBestStreamCandidate(matchId, options = {}) {
  const id = String(matchId || "").trim();
  const league = String(options?.league || "eng.1").trim() || "eng.1";
  const cacheKey = `${id}_${league}`;
  const cached = STREAM_URL_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < 2 * 60 * 1000) {
    return cached;
  }

  const officialOptions = await fetchOfficialWatchOptionsForMatch(id, league);
  const officialUrls = officialOptions.map((opt) => String(opt?.url || "").trim()).filter(Boolean);
  if (officialUrls.length > 0) {
    const hit = {
      url: officialUrls[0],
      source: "official-broadcast",
      officialOptions,
      candidates: [...officialUrls, ...buildStreamCandidates(id)],
      ts: Date.now(),
    };
    STREAM_URL_CACHE.set(cacheKey, hit);
    return hit;
  }

  const candidates = buildStreamCandidates(id);
  for (const candidate of candidates) {
    const ok = await probeUrl(candidate);
    if (ok) {
      const hit = {
        url: candidate,
        source: "embed-auto",
        officialOptions: [],
        candidates,
        ts: Date.now(),
      };
      STREAM_URL_CACHE.set(cacheKey, hit);
      return hit;
    }
  }

  const fallback = {
    url: candidates[0],
    source: "embed-fallback",
    officialOptions: [],
    candidates,
    ts: Date.now(),
  };
  STREAM_URL_CACHE.set(cacheKey, fallback);
  return fallback;
}

async function resolveBestStreamUrl(matchId) {
  const resolved = await resolveBestStreamCandidate(matchId, {});
  return resolved.url;
}

function buildStreamUrl(matchId, serverId) {
  void serverId;
  return buildStreamCandidates(matchId)[0];
}

function normalizeStatusFromApiSports(fix) {
  const short = fix?.fixture?.status?.short;
  const elapsed = fix?.fixture?.status?.elapsed;
  const liveShort = new Set(["1H", "2H", "ET", "P", "BT", "HT", "LIVE"]);
  const finishedShort = new Set(["FT", "AET", "PEN"]);
  if (liveShort.has(short)) return { status: "live", minute: elapsed ?? undefined };
  if (finishedShort.has(short)) return { status: "finished" };
  return { status: "upcoming" };
}

function mapFixtureToMatch(fix) {
  const leagueName = fix?.league?.name || "";
  const { status, minute } = normalizeStatusFromApiSports(fix);
  const id = String(fix?.fixture?.id);
  return {
    id,
    league: leagueName,
    homeTeam: fix?.teams?.home?.name || "",
    awayTeam: fix?.teams?.away?.name || "",
    homeTeamLogo: normalizeTeamLogo(fix?.teams?.home?.name, fix?.teams?.home?.logo || null),
    awayTeamLogo: normalizeTeamLogo(fix?.teams?.away?.name, fix?.teams?.away?.logo || null),
    homeScore: Number(fix?.goals?.home ?? 0),
    awayScore: Number(fix?.goals?.away ?? 0),
    status,
    minute,
    startDate: fix?.fixture?.date || null,
    startTime: formatTime(fix?.fixture?.date),
    watchOptions: [],
    servers: STREAM_SERVERS.map((s) => ({
      id: s.id,
      name: s.name,
      quality: s.quality,
      url: buildStreamUrl(id, s.id),
    })),
    sport: "football",
    heroGradient: HERO_GRADIENTS[leagueName] || ["#101828", "#0b1220"],
  };
}

// SportSRC returns a different schema than ESPN.
// The app expects the flattened `Match` shape used by MatchCard.tsx.
function mapSportSrcToMatch(m) {
  // Robust extraction across common SportSRC variants
  const id = String(
    m?.id ?? m?.match_id ?? m?.fixture_id ?? m?.game_id ?? m?.event_id ?? ""
  );

  let leagueName =
    m?.league?.name ||
    m?.competition?.name ||
    m?.tournament?.name ||
    m?.league_name ||
    m?.competition_name ||
    "";

  // Normalize to the labels used in the app filters
  const ln = String(leagueName).toLowerCase();
  if (ln.includes("premier")) leagueName = "Premier League";
  else if (ln.includes("champions") && ln.includes("uefa")) leagueName = "UEFA Champions League";
  else if (ln.includes("la liga") || ln.includes("laliga")) leagueName = "La Liga";
  else if (ln.includes("bundesliga")) leagueName = "Bundesliga";
  else if (ln.includes("jupiler") || ln.includes("pro league") || ln.includes("belg")) leagueName = "Jupiler Pro League";
  else if (ln.includes("ligue 1") || ln.includes("ligue1")) leagueName = "Ligue 1";
  else if (ln.includes("serie a") || ln.includes("seriea")) leagueName = "Serie A";

  const st = String(m?.status || m?.status_name || "").toLowerCase();
  const status = st.includes("inprogress") || st.includes("live")
    ? "live"
    : st.includes("finished") || st.includes("ended")
      ? "finished"
      : "upcoming";

  const minuteRaw = m?.minute ?? m?.elapsed ?? m?.time ?? null;
  const minute = minuteRaw != null ? Number(minuteRaw) : undefined;

  const homeTeam =
    m?.home_team?.name || m?.homeTeam?.name || m?.home_name || m?.home || "";
  const awayTeam =
    m?.away_team?.name || m?.awayTeam?.name || m?.away_name || m?.away || "";

  const homeTeamLogo =
    normalizeTeamLogo(homeTeam, m?.home_team?.logo || m?.homeTeam?.logo || m?.home_logo || null);
  const awayTeamLogo =
    normalizeTeamLogo(awayTeam, m?.away_team?.logo || m?.awayTeam?.logo || m?.away_logo || null);

  const homeScore = Number(
    m?.home_score ?? m?.scores?.home ?? m?.score?.home ?? m?.home_goals ?? 0
  );
  const awayScore = Number(
    m?.away_score ?? m?.scores?.away ?? m?.score?.away ?? m?.away_goals ?? 0
  );

  const dateIso = m?.date || m?.start_time || m?.fixture?.date || null;

  // Use the same demo servers as elsewhere
  const matchId = id || `${Date.now()}`;
  return {
    id: matchId,
    league: leagueName,
    homeTeam,
    awayTeam,
    homeTeamLogo,
    awayTeamLogo,
    homeScore: Number.isFinite(homeScore) ? homeScore : 0,
    awayScore: Number.isFinite(awayScore) ? awayScore : 0,
    status,
    minute,
    startDate: dateIso,
    startTime: dateIso ? formatTime(dateIso) : undefined,
    servers: STREAM_SERVERS.map((s) => ({
      id: s.id,
      name: s.name,
      quality: s.quality,
      url: buildStreamUrl(matchId, s.id),
    })),
    sport: "football",
    heroGradient: HERO_GRADIENTS[leagueName] || ["#101828", "#0b1220"],
  };
}

// -----------------------------
// DeepSeek AI (OpenAI-compatible) + OpenAI fallback
// -----------------------------

async function deepseekChat(messages, { temperature = 0.4 } = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    const e = new Error("DEEPSEEK_API_KEY missing");
    e.statusCode = 500;
    throw e;
  }

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature,
      messages,
      stream: false,
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`DeepSeek error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }

  return data?.choices?.[0]?.message?.content ?? "";
}

async function openaiChat(messages, { temperature = 0.4, model = "gpt-4o-mini" } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const e = new Error("OPENAI_API_KEY missing");
    e.statusCode = 500;
    throw e;
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`OpenAI error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }

  return data?.choices?.[0]?.message?.content ?? "";
}

async function openrouterChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const e = new Error("OPENROUTER_API_KEY missing");
    e.statusCode = 500;
    throw e;
  }

  const useModel = model || process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      temperature,
      messages,
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`OpenRouter error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }

  return data?.choices?.[0]?.message?.content ?? "";
}

async function groqChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    const e = new Error("GROQ_API_KEY missing");
    e.statusCode = 500;
    throw e;
  }

  const useModel = model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      temperature,
      messages,
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`Groq error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }

  return data?.choices?.[0]?.message?.content ?? "";
}

async function ollamaChat(messages, { temperature = 0.35, model } = {}) {
  const base = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const useModel = model || process.env.OLLAMA_MODEL || "llama3.1:8b-instruct";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let r;
  try {
    r = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: useModel,
        stream: false,
        options: { temperature },
        messages,
      }),
    });
  } catch (error) {
    clearTimeout(timeout);
    const e = new Error("Ollama niet bereikbaar op localhost:11434");
    e.statusCode = 503;
    e.details = { cause: String(error?.message || error) };
    throw e;
  }
  clearTimeout(timeout);

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Ollama error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }

  return data?.message?.content ?? "";
}

// Google Gemini – gratis tier: 1500 req/dag, geen creditcard vereist (GEMINI_API_KEY env)
async function geminiChat(messages, { temperature = 0.4, model } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error("GEMINI_API_KEY missing");
    e.statusCode = 500;
    throw e;
  }

  const useModel = model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    // Use Gemini's OpenAI-compatible endpoint for easy integration
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: useModel,
        temperature,
        messages,
      }),
      signal: controller.signal,
    });

    const data = await r.json();
    if (!r.ok) {
      const e = new Error(`Gemini error (${r.status})`);
      e.statusCode = r.status;
      e.details = data;
      throw e;
    }

    return data?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (err?.name === "AbortError") {
      const e = new Error("Gemini timeout");
      e.statusCode = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// xAI Grok – API-compatible with OpenAI (XAI_API_KEY env)
async function xaiChat(messages, { temperature = 0.35, model } = {}) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    const e = new Error("XAI_API_KEY missing");
    e.statusCode = 500;
    throw e;
  }
  const useModel = model || process.env.XAI_MODEL || "grok-3-mini";
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: useModel, temperature, messages }),
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`xAI Grok error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeThreeWayPercentages(homePct, drawPct, awayPct) {
  let home = Number.isFinite(homePct) ? homePct : 0;
  let draw = Number.isFinite(drawPct) ? drawPct : 0;
  let away = Number.isFinite(awayPct) ? awayPct : 0;

  const sum = home + draw + away;
  if (sum <= 0) return { homePct: 34, drawPct: 33, awayPct: 33 };

  home = Math.round((home / sum) * 100);
  draw = Math.round((draw / sum) * 100);
  away = 100 - home - draw;

  home = clamp(home, 0, 100);
  draw = clamp(draw, 0, 100);
  away = clamp(away, 0, 100);

  const fixed = home + draw + away;
  if (fixed !== 100) {
    const diff = 100 - fixed;
    if (home >= draw && home >= away) home += diff;
    else if (away >= home && away >= draw) away += diff;
    else draw += diff;
  }

  return { homePct: home, drawPct: draw, awayPct: away };
}

function xgToGoals(xg) {
  const value = Number(xg);
  if (!Number.isFinite(value)) return 0;
  if (value < 0.75) return 0;
  if (value < 1.25) return 1;
  if (value < 1.75) return 2;
  if (value < 2.35) return 3;
  return 4;
}

function normalizeOutcome(value) {
  const v = String(value || "").toLowerCase();
  if (v === "home" || v === "home win" || v === "home_win" || v === "1") return "Home Win";
  if (v === "away" || v === "away win" || v === "away_win" || v === "2") return "Away Win";
  if (v === "draw" || v === "x" || v === "tie") return "Draw";
  return "";
}

function parseAiPredictionToUiShape(raw) {
  const parsed = typeof raw === "string" ? tryParseJSON(raw) : raw;
  if (!parsed || typeof parsed !== "object") {
    const e = new Error("AI gaf geen geldige JSON terug");
    e.statusCode = 502;
    throw e;
  }

  const outcome = normalizeOutcome(parsed.result || parsed.prediction || parsed.outcome);
  if (!outcome) {
    const e = new Error("AI output mist prediction/result");
    e.statusCode = 502;
    throw e;
  }

  const confidence = clamp(Math.round(toNumber(parsed.confidence, 58)), 1, 99);

  let homePct = Math.round(toNumber(parsed.homePct, NaN));
  let drawPct = Math.round(toNumber(parsed.drawPct, NaN));
  let awayPct = Math.round(toNumber(parsed.awayPct, NaN));

  if (!Number.isFinite(homePct) || !Number.isFinite(drawPct) || !Number.isFinite(awayPct)) {
    const base = Math.max(40, Math.min(85, confidence));
    if (outcome === "Home Win") {
      homePct = base;
      drawPct = Math.max(8, 100 - base - 15);
      awayPct = 100 - homePct - drawPct;
    } else if (outcome === "Away Win") {
      awayPct = base;
      drawPct = Math.max(8, 100 - base - 15);
      homePct = 100 - awayPct - drawPct;
    } else {
      drawPct = Math.max(35, Math.min(55, base));
      homePct = Math.round((100 - drawPct) / 2);
      awayPct = 100 - drawPct - homePct;
    }
  }

  const scoreline = parsed.predictedScore || parsed.scoreline || parsed.score || null;
  const reasoning = parsed.summary || parsed.reasoning || null;
  const riskLevel =
    parsed.riskLevel || parsed.risk || (confidence >= 65 ? "Low" : confidence >= 54 ? "Medium" : "High");
  const bothTeamsToScorePct = clamp(Math.round(toNumber(parsed.bothTeamsToScorePct ?? parsed.bttsPct, 0)), 0, 100);
  const over25Pct = clamp(Math.round(toNumber(parsed.over25Pct ?? parsed.over2_5Pct ?? parsed.over25Probability, 0)), 0, 100);
  const edgeScore = clamp(Math.round(toNumber(parsed.edgeScore, confidence)), 0, 100);

  const normalizedPct = normalizeThreeWayPercentages(homePct, drawPct, awayPct);

  return {
    prediction: outcome,
    confidence,
    predictedScore: scoreline,
    xgHome: parsed.xgHome ?? parsed.xg_home ?? null,
    xgAway: parsed.xgAway ?? parsed.xg_away ?? null,
    homePct: normalizedPct.homePct,
    drawPct: normalizedPct.drawPct,
    awayPct: normalizedPct.awayPct,
    bothTeamsToScorePct,
    over25Pct,
    doubleChanceHomePct: clamp(normalizedPct.homePct + normalizedPct.drawPct, 0, 100),
    doubleChanceAwayPct: clamp(normalizedPct.awayPct + normalizedPct.drawPct, 0, 100),
    edgeScore,
    confidenceReason: parsed.confidenceReason || null,
    modelVersion: parsed.modelVersion || "ai-v2",
    momentum: parsed.momentum || null,
    danger: parsed.danger || null,
    riskLevel,
    summary: reasoning,
    keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : [],
    tacticalNotes: Array.isArray(parsed.tacticalNotes) ? parsed.tacticalNotes : [],
    h2hSummary: parsed.h2hSummary || null,
    formHome: parsed.formHome || null,
    formAway: parsed.formAway || null,
    tip: parsed.tip || null,
    // Enhanced analysis fields
    matchInsight: parsed.matchInsight || null,
    formGuide: parsed.formGuide && typeof parsed.formGuide === "object" ? parsed.formGuide : null,
    tacticalEdge: parsed.tacticalEdge && typeof parsed.tacticalEdge === "object" ? parsed.tacticalEdge : null,
    attackingStrength: parsed.attackingStrength && typeof parsed.attackingStrength === "object" ? {
      home: clamp(Math.round(toNumber(parsed.attackingStrength.home, 50)), 0, 100),
      away: clamp(Math.round(toNumber(parsed.attackingStrength.away, 50)), 0, 100),
    } : null,
    defensiveStrength: parsed.defensiveStrength && typeof parsed.defensiveStrength === "object" ? {
      home: clamp(Math.round(toNumber(parsed.defensiveStrength.home, 50)), 0, 100),
      away: clamp(Math.round(toNumber(parsed.defensiveStrength.away, 50)), 0, 100),
    } : null,
    playerImpact: Array.isArray(parsed.playerImpact) ? parsed.playerImpact.slice(0, 3) : null,
    matchPattern: parsed.matchPattern || null,
    predictionExplanation: parsed.predictionExplanation || parsed.predictionExplanation || null,
    nextGoalProbability: parsed.nextGoalProbability != null ? clamp(Math.round(toNumber(parsed.nextGoalProbability, 0)), 0, 100) : null,
    formation: parsed.formation || null,
    pressureIndex: parsed.pressureIndex != null ? clamp(Math.round(toNumber(parsed.pressureIndex, 0)), 0, 100) : null,
    source: "ai",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeAiProviderError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const details = JSON.stringify(error?.details || {}).toLowerCase();
  const all = `${msg} ${details}`;

  const e = new Error("AI analyse tijdelijk niet beschikbaar. Probeer later opnieuw.");
  e.statusCode = Number(error?.statusCode || 502);

  if (all.includes("insufficient balance") || all.includes("insufficient_quota") || all.includes("quota") || all.includes("credit")) {
    e.message = "AI provider saldo/quota is op. Gebruik een gratis provider (Ollama lokaal/OpenRouter free/Groq free) of vul tegoed aan.";
    e.statusCode = 402;
    return e;
  }

  if (all.includes("invalid api key") || all.includes("unauthorized") || all.includes("401")) {
    e.message = "AI API key ongeldig. Controleer je provider keys (DEEPSEEK/OPENAI/OPENROUTER/GROQ).";
    e.statusCode = 401;
    return e;
  }

  if (all.includes("ollama") || all.includes("econnrefused") || all.includes("not reachable") || all.includes("aborterror")) {
    e.message = "Lokale Ollama is niet bereikbaar. Start Ollama of gebruik een cloud AI-key.";
    e.statusCode = 503;
    return e;
  }

  return e;
}

function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, ".").replace(/[^\d.-]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deterministicPrediction(payload) {
  const homeScore = toNum(payload?.homeScore);
  const awayScore = toNum(payload?.awayScore);
  const minute = toNum(payload?.minute);

  const homeStats = payload?.stats?.home || {};
  const awayStats = payload?.stats?.away || {};
  // Support both snake_case (ESPN API) and camelCase keys
  const homePoss = toNum(homeStats.ball_possession ?? homeStats.possessionPct);
  const awayPoss = toNum(awayStats.ball_possession ?? awayStats.possessionPct);
  const homeShots = toNum(homeStats.total_shots ?? homeStats.totalShots);
  const awayShots = toNum(awayStats.total_shots ?? awayStats.totalShots);
  const homeSot = toNum(homeStats.shots_on_goal ?? homeStats.shotsOnTarget);
  const awaySot = toNum(awayStats.shots_on_goal ?? awayStats.shotsOnTarget);
  const homeCorners = toNum(homeStats.corner_kicks ?? homeStats.cornerKicks);
  const awayCorners = toNum(awayStats.corner_kicks ?? awayStats.cornerKicks);
  const homeFouls = toNum(homeStats.fouls);
  const awayFouls = toNum(awayStats.fouls);
  const homeRed = toNum(homeStats.red_cards);
  const awayRed = toNum(awayStats.red_cards);
  const homeYellow = toNum(homeStats.yellow_cards);
  const awayYellow = toNum(awayStats.yellow_cards);
  const homeBlocked = toNum(homeStats.blocked_shots);
  const awayBlocked = toNum(awayStats.blocked_shots);
  const homeOffsides = toNum(homeStats.offsides);
  const awayOffsides = toNum(awayStats.offsides);
  const homeGkSaves = toNum(homeStats.goalkeeper_saves);
  const awayGkSaves = toNum(awayStats.goalkeeper_saves);
  const context = payload?.context || {};
  const homeRank = toNum(context?.homeRank);
  const awayRank = toNum(context?.awayRank);
  const homePoints = toNum(context?.homePoints);
  const awayPoints = toNum(context?.awayPoints);
  const homeGoalDiff = toNum(context?.homeGoalDiff);
  const awayGoalDiff = toNum(context?.awayGoalDiff);
  const homeTopScorerGoals = toNum(context?.homeTopScorerGoals);
  const awayTopScorerGoals = toNum(context?.awayTopScorerGoals);

  const scoreEdge = (homeScore - awayScore) * 24;
  const shotEdge = (homeShots - awayShots) * 1.6;
  const sotEdge = (homeSot - awaySot) * 4.8;
  const possEdge = (homePoss - awayPoss) * 0.22;
  const cornerEdge = (homeCorners - awayCorners) * 1.2;
  const blockedEdge = (homeBlocked - awayBlocked) * 0.6;
  const offsidesEdge = (awayOffsides - homeOffsides) * 0.35;
  const savesEdge = (awayGkSaves - homeGkSaves) * 0.65;
  // Red card = numerical disadvantage (10 vs 11 players) ≈ 25 edge per card
  const cardEdge = (awayRed - homeRed) * 25;
  const yellowEdge = (awayYellow - homeYellow) * 2.2;
  const foulEdge = (awayFouls - homeFouls) * 0.25;
  const attackingHome = homeShots * 0.95 + homeSot * 1.9 + homeCorners * 0.5 + homePoss * 0.07;
  const attackingAway = awayShots * 0.95 + awaySot * 1.9 + awayCorners * 0.5 + awayPoss * 0.07;
  const attackingEdge = (attackingHome - attackingAway) * 0.35;
  const rankEdge = (awayRank > 0 && homeRank > 0) ? (awayRank - homeRank) * 1.1 : 0;
  const pointsEdge = (homePoints - awayPoints) * 0.18;
  const goalDiffEdge = (homeGoalDiff - awayGoalDiff) * 0.22;
  const topScorerEdge = (homeTopScorerGoals - awayTopScorerGoals) * 0.55;

  const events = Array.isArray(payload?.events) ? payload.events : [];
  const homeTag = String(payload?.homeTeam || "").toLowerCase();
  const awayTag = String(payload?.awayTeam || "").toLowerCase();
  let eventEdge = 0;
  for (const event of events.slice(0, 40)) {
    const joined = `${event?.type || ""} ${event?.detail || ""} ${event?.text || ""}`.toLowerCase();
    const isCard = /red|second yellow|penalty miss|own goal/.test(joined);
    const isPositive = /goal|penalty scored|big chance|shot on target/.test(joined);
    const toHome = homeTag && joined.includes(homeTag);
    const toAway = awayTag && joined.includes(awayTag);
    const weight = isCard ? 10 : isPositive ? 6 : 2;
    if (toHome && !toAway) eventEdge += weight;
    else if (toAway && !toHome) eventEdge -= weight;
  }

  const gamePhaseMultiplier = minute >= 75 ? 1.22 : minute >= 45 ? 1.08 : 1;
  // Home advantage baseline (+8 edge when no stats/score available)
  const noStatsAtAll = !homeScore && !awayScore && !homeShots && !awayShots && !homeSot && !awaySot && !homePoss && !awayPoss;
  const homeAdvantage = noStatsAtAll ? 8 : 0;
  const rawEdge = (
    scoreEdge + shotEdge + sotEdge + possEdge + cornerEdge + blockedEdge +
    offsidesEdge + savesEdge + cardEdge + yellowEdge + foulEdge + attackingEdge +
    rankEdge + pointsEdge + goalDiffEdge + topScorerEdge + eventEdge + homeAdvantage
  ) * gamePhaseMultiplier;

  const sigmoid = (x) => 1 / (1 + Math.exp(-x / 20));
  const baseHome = sigmoid(rawEdge);
  const baseAway = 1 - baseHome;

  let drawPct = Math.max(8, 30 - Math.abs(rawEdge) * 0.32);
  if (minute >= 75 && Math.abs(homeScore - awayScore) === 0) drawPct += 8;
  if (minute >= 80 && Math.abs(homeScore - awayScore) >= 2) drawPct -= 5;
  drawPct = Math.min(45, drawPct);

  let homePct = Math.max(5, Math.round(baseHome * (100 - drawPct)));
  let awayPct = Math.max(5, 100 - drawPct - homePct);

  const norm = homePct + drawPct + awayPct;
  homePct = Math.round((homePct / norm) * 100);
  drawPct = Math.round((drawPct / norm) * 100);
  awayPct = 100 - homePct - drawPct;

  let prediction = "Draw";
  if (homePct > awayPct && homePct > drawPct) prediction = "Home Win";
  else if (awayPct > homePct && awayPct > drawPct) prediction = "Away Win";

  const confidenceBase = Math.max(homePct, awayPct, drawPct);
  const statVolume = homeShots + awayShots + homeSot + awaySot + homeCorners + awayCorners;
  const confidenceBoost = clamp(Math.round(statVolume / 6), 0, 8);
  const confidence = clamp(confidenceBase + confidenceBoost, 35, 95);

  const hasXgInputs = (homeShots + awayShots + homeSot + awaySot) > 0;
  const hasContextInputs = Boolean(
    (homeRank > 0 && awayRank > 0) ||
    homePoints || awayPoints ||
    homeGoalDiff || awayGoalDiff ||
    homeTopScorerGoals || awayTopScorerGoals
  );
  const hasMatchSignal = Boolean(
    hasXgInputs ||
    events.length > 0 ||
    minute > 0 ||
    homeScore !== 0 ||
    awayScore !== 0 ||
    hasContextInputs
  );
  const xgHome = hasXgInputs
    ? Number((Math.max(0, homeShots * 0.075 + homeSot * 0.24 + homeCorners * 0.018)).toFixed(2))
    : null;
  const xgAway = hasXgInputs
    ? Number((Math.max(0, awayShots * 0.075 + awaySot * 0.24 + awayCorners * 0.018)).toFixed(2))
    : null;

  const predictedHome = xgHome == null ? homeScore : Math.max(homeScore, xgToGoals(xgHome) + (minute > 70 ? 0 : 0));
  const predictedAway = xgAway == null ? awayScore : Math.max(awayScore, xgToGoals(xgAway) + (minute > 70 ? 0 : 0));

  const keyFactors = [];
  if (homePoss || awayPoss) keyFactors.push(`Balbezit ${homePoss || 0}% - ${awayPoss || 0}%`);
  if (homeShots || awayShots) keyFactors.push(`Schoten ${homeShots || 0} - ${awayShots || 0}`);
  if (homeSot || awaySot) keyFactors.push(`Op doel ${homeSot || 0} - ${awaySot || 0}`);
  if (homeRed > 0 || awayRed > 0) keyFactors.push(`Rode kaarten: thuis ${homeRed} - uit ${awayRed}`);
  else if (homeCorners || awayCorners) keyFactors.push(`Hoekschoppen ${homeCorners || 0} - ${awayCorners || 0}`);
  if (homeRank > 0 && awayRank > 0) keyFactors.push(`Klassement #${homeRank} vs #${awayRank}`);
  if (minute) keyFactors.push(`Wedstrijdminuut ${minute}`);

  const tacticalNotes = [];
  if (homeRed > 0) tacticalNotes.push(`Thuisploeg speelt met ${Math.max(7, 11 - homeRed)} man door rode kaart.`);
  if (awayRed > 0) tacticalNotes.push(`Uitploeg speelt met ${Math.max(7, 11 - awayRed)} man door rode kaart.`);
  if (Math.abs(homeSot - awaySot) >= 2) {
    tacticalNotes.push(homeSot > awaySot ? "Thuisploeg creëert de grootste kansen." : "Uitploeg creëert de grootste kansen.");
  }
  if (Math.abs(homePoss - awayPoss) >= 10) {
    tacticalNotes.push(homePoss > awayPoss ? "Thuisploeg controleert het tempo via balbezit." : "Uitploeg controleert het tempo via balbezit.");
  }
  if (homeRank > 0 && awayRank > 0 && Math.abs(homeRank - awayRank) >= 4) {
    tacticalNotes.push(homeRank < awayRank ? "Thuisploeg heeft op basis van klassement een structureel voordeel." : "Uitploeg heeft op basis van klassement een structureel voordeel.");
  }
  if (homeGkSaves > 0 || awayGkSaves > 0) {
    if (homeGkSaves >= 3) tacticalNotes.push(`Keeper thuisploeg redt uitstekend (${homeGkSaves}x).`);
    if (awayGkSaves >= 3) tacticalNotes.push(`Keeper uitploeg redt uitstekend (${awayGkSaves}x).`);
  }
  if (homeFouls + awayFouls > 0 && Math.abs(homeFouls - awayFouls) >= 3) {
    tacticalNotes.push(homeFouls > awayFouls ? "Thuisploeg speelt met meer overtredingen, risico op kaarten." : "Uitploeg speelt met meer overtredingen, risico op kaarten.");
  }
  if (tacticalNotes.length === 0) {
    tacticalNotes.push("Match is tactisch in evenwicht op basis van de huidige cijfers.");
  }

  // Estimate next-goal probability based on shots on target frequency
  let nextGoalProbability = null;
  if (hasXgInputs && minute > 0 && minute < 90) {
    const totalSot = homeSot + awaySot;
    const minutesPlayed = Math.max(1, minute);
    const sotPerMin = totalSot / minutesPlayed;
    // Each shot on target has ~0.33 chance of being a goal; 15 minutes window
    const rawProb = Math.min(95, Math.round(sotPerMin * 15 * 0.33 * 100));
    nextGoalProbability = Math.max(5, rawProb);
  }

  const over25Pct = hasXgInputs && xgHome != null && xgAway != null
    ? clamp(Math.round(((xgHome + xgAway) / 3.2) * 100), 8, 92)
    : clamp(Math.round(40 + (homeShots + awayShots) * 1.5 + (homeSot + awaySot) * 2), 8, 90);

  const bothTeamsToScorePct = hasXgInputs && xgHome != null && xgAway != null
    ? clamp(Math.round((Math.min(xgHome, xgAway) / Math.max(0.7, Math.max(xgHome, xgAway))) * 100 * 0.85), 10, 88)
    : clamp(Math.round(35 + Math.min(homeSot, awaySot) * 9), 10, 85);

  const confidenceReason = confidence >= 72
    ? "Sterke statistische voorsprong in score, kansen en momentum."
    : confidence >= 58
      ? "Meerdere signalen wijzen in dezelfde richting, maar met wedstrijdrisico."
      : "Wedstrijdbeeld is volatiel; uitkomst blijft open.";

  const edgeScore = clamp(Math.round(Math.abs(rawEdge)), 0, 100);

  return {
    prediction,
    confidence,
    predictedScore: `${predictedHome}-${predictedAway}`,
    homePct,
    drawPct,
    awayPct,
    bothTeamsToScorePct,
    over25Pct,
    doubleChanceHomePct: clamp(homePct + drawPct, 0, 100),
    doubleChanceAwayPct: clamp(awayPct + drawPct, 0, 100),
    edgeScore,
    confidenceReason,
    modelVersion: "fallback-v2.2",
    xgHome,
    xgAway,
    nextGoalProbability,
    momentum: homePct > awayPct ? "Home" : awayPct > homePct ? "Away" : "Balanced",
    danger: homeSot > awaySot ? "Home Attack" : awaySot > homeSot ? "Away Attack" : "Balanced",
    riskLevel: confidence >= 70 ? "Low" : confidence >= 56 ? "Medium" : "High",
    summary: "Analyse op basis van live score, schotkwaliteit, kaarten, event-impact en momentum (provider-onafhankelijke fallback).",
    keyFactors,
    tacticalNotes,
    h2hSummary: null,
    formHome: null,
    formAway: null,
    tip: prediction === "Draw"
      ? "Gelijkspel blijft plausibel; overweeg een voorzichtige live-benadering met focus op late fases."
      : `${prediction === "Home Win" ? "Thuisploeg" : "Uitploeg"} heeft statistisch voordeel; monitor kaarten en omschakelmomenten.`,
    // Enhanced analysis fields (computed from stats)
    matchInsight: hasMatchSignal
      ? `${homeTag || "Thuisploeg"} ontvangt ${awayTag || "Uitploeg"} in een ${confidence >= 65 ? "duidelijk" : "spannende"} confrontatie. ${
          homeRank > 0 && awayRank > 0
            ? `Op klassement staan ze #${homeRank} vs #${awayRank}.`
            : "Klassementgegevens zijn momenteel niet beschikbaar."
        }`
      : null,
    formGuide: hasContextInputs
      ? {
          homeForm: `${homeTag || "Thuisploeg"} staat ${homeRank > 0 ? `op positie ${homeRank}` : "in de middenmoot"} met ${homePoints || 0} punten en een doelsaldo van ${homeGoalDiff >= 0 ? "+" : ""}${homeGoalDiff || 0}.`,
          awayForm: `${awayTag || "Uitploeg"} staat ${awayRank > 0 ? `op positie ${awayRank}` : "in de middenmoot"} met ${awayPoints || 0} punten en een doelsaldo van ${awayGoalDiff >= 0 ? "+" : ""}${awayGoalDiff || 0}.`,
        }
      : null,
    tacticalEdge: hasXgInputs
      ? {
          homeStrengths: [
            homeSot > awaySot ? `Scherpere afronding (${homeSot} schoten op doel)` : null,
            homePoss > awayPoss + 5 ? `Balbezit-dominantie (${homePoss}%)` : null,
            homeCorners > awayCorners + 2 ? `Druk via hoekschoppen (${homeCorners})` : null,
          ].filter(Boolean).slice(0, 3),
          homeWeaknesses: [
            awaySot > homeSot ? `Kwetsbaar voor schoten op doel (${awaySot} tegen)` : null,
            awayPoss > homePoss + 5 ? `Verliest controle in balbezit` : null,
            homeRed > 0 ? `Numeriek nadeel door ${homeRed} rode kaart${homeRed > 1 ? "en" : ""}` : null,
          ].filter(Boolean).slice(0, 3),
          awayStrengths: [
            awaySot > homeSot ? `Scherpere afronding (${awaySot} schoten op doel)` : null,
            awayPoss > homePoss + 5 ? `Balbezit-dominantie (${awayPoss}%)` : null,
            awayCorners > homeCorners + 2 ? `Druk via hoekschoppen (${awayCorners})` : null,
          ].filter(Boolean).slice(0, 3),
          awayWeaknesses: [
            homeSot > awaySot ? `Kwetsbaar voor schoten op doel (${homeSot} tegen)` : null,
            homePoss > awayPoss + 5 ? `Verliest controle in balbezit` : null,
            awayRed > 0 ? `Numeriek nadeel door ${awayRed} rode kaart${awayRed > 1 ? "en" : ""}` : null,
          ].filter(Boolean).slice(0, 3),
        }
      : null,
    attackingStrength: hasXgInputs
      ? {
          home: clamp(Math.round(40 + homeShots * 1.5 + homeSot * 3 + homeCorners * 0.8), 10, 95),
          away: clamp(Math.round(40 + awayShots * 1.5 + awaySot * 3 + awayCorners * 0.8), 10, 95),
        }
      : null,
    defensiveStrength: hasXgInputs
      ? {
          home: clamp(Math.round(60 - awaySot * 3 + homeBlocked * 1.5 + homeGkSaves * 2), 10, 95),
          away: clamp(Math.round(60 - homeSot * 3 + awayBlocked * 1.5 + awayGkSaves * 2), 10, 95),
        }
      : null,
    playerImpact: null,
    matchPattern: hasXgInputs
      ? (homePoss > awayPoss + 8
          ? `${homeTag || "Thuisploeg"} controleert met balbezit, ${awayTag || "Uitploeg"} zoekt de counter.`
          : awayPoss > homePoss + 8
            ? `${awayTag || "Uitploeg"} houdt de bal, ${homeTag || "Thuisploeg"} speelt op de omschakeling.`
            : `Open en evenwichtige wedstrijd met kansen aan beide kanten.`)
      : null,
    predictionExplanation: hasMatchSignal
      ? `${prediction === "Draw" ? "Analyse wijst op een gelijk opgaande strijd" : prediction === "Home Win" ? "Thuisploeg heeft een statistisch voordeel" : "Uitploeg heeft een statistisch voordeel"} op basis van ${hasXgInputs ? "schotkwaliteit en balbezit" : "score en wedstrijdverloop"}. ${
          homeRed > 0 || awayRed > 0 ? "Rode kaarten spelen een cruciale rol. " : ""
        }Confidence is ${confidence >= 65 ? "relatief hoog" : "gematigd"} gezien de beschikbare data.`
      : null,
    formation: null,
    pressureIndex: hasXgInputs ? clamp(Math.round(homePoss * 0.6 + homeCorners * 2 + homeShots * 1.2), 0, 100) : null,
    source: "fallback-stats",
    updatedAt: new Date().toISOString(),
    insufficientData: !hasMatchSignal,
    unavailableReason: !hasMatchSignal
      ? "Onvoldoende live-data voor analyse"
      : !hasXgInputs
        ? "xG beperkt: voorspelling gebruikt score, events en klassement-context"
        : null,
  };
}

function findTeamRowByName(rows, teamName) {
  const list = Array.isArray(rows) ? rows : [];
  const teamKey = normalizeTeamKey(teamName);
  if (!teamKey) return null;
  for (const row of list) {
    const rowKey = normalizeTeamKey(row?.team);
    if (!rowKey) continue;
    if (rowKey === teamKey || rowKey.includes(teamKey) || teamKey.includes(rowKey)) {
      return row;
    }
  }
  return null;
}

function findTopScorerByTeam(rows, teamName) {
  const list = Array.isArray(rows) ? rows : [];
  const teamKey = normalizeTeamKey(teamName);
  if (!teamKey) return null;
  return list
    .filter((row) => {
      const rowKey = normalizeTeamKey(row?.team);
      return rowKey && (rowKey === teamKey || rowKey.includes(teamKey) || teamKey.includes(rowKey));
    })
    .sort((a, b) => Number(b?.goals || 0) - Number(a?.goals || 0))[0] || null;
}

async function enrichPredictPayloadContext(payload) {
  const base = payload && typeof payload === "object" ? payload : {};
  const leagueName = normalizeLeagueName(base?.league || "");
  const homeTeam = String(base?.homeTeam || "");
  const awayTeam = String(base?.awayTeam || "");
  const context = base?.context && typeof base.context === "object" ? { ...base.context } : {};

  if (!leagueName || !homeTeam || !awayTeam) {
    return { ...base, context };
  }

  const needStandings = !(context.homeRank || context.awayRank || context.homePoints || context.awayPoints || context.homeGoalDiff || context.awayGoalDiff);
  const needScorers = !(context.homeTopScorerGoals || context.awayTopScorerGoals);

  const season = seasonForDate(new Date());
  const standingsKey = `predict_ctx_standings_${leagueName}_${season}`;
  const scorersKey = `predict_ctx_scorers_${leagueName}_${season}`;

  const [standingsRows, scorersRows] = await Promise.all([
    needStandings
      ? getOrFetch(standingsKey, 5 * 60_000, async () => {
          const raw = await espnStandings(leagueName);
          return mapEspnStandings(raw);
        }).catch(() => [])
      : Promise.resolve([]),
    needScorers
      ? getOrFetch(scorersKey, 5 * 60_000, async () => {
          const raw = await espnTopScorers(leagueName);
          return mapEspnTopScorers(raw);
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const homeStanding = needStandings ? findTeamRowByName(standingsRows, homeTeam) : null;
  const awayStanding = needStandings ? findTeamRowByName(standingsRows, awayTeam) : null;
  const homeTopScorer = needScorers ? findTopScorerByTeam(scorersRows, homeTeam) : null;
  const awayTopScorer = needScorers ? findTopScorerByTeam(scorersRows, awayTeam) : null;

  return {
    ...base,
    context: {
      ...context,
      homeRank: context.homeRank ?? homeStanding?.rank ?? null,
      awayRank: context.awayRank ?? awayStanding?.rank ?? null,
      homePoints: context.homePoints ?? homeStanding?.points ?? null,
      awayPoints: context.awayPoints ?? awayStanding?.points ?? null,
      homeGoalDiff: context.homeGoalDiff ?? homeStanding?.goalDiff ?? null,
      awayGoalDiff: context.awayGoalDiff ?? awayStanding?.goalDiff ?? null,
      homeTopScorer: context.homeTopScorer ?? homeTopScorer?.name ?? null,
      awayTopScorer: context.awayTopScorer ?? awayTopScorer?.name ?? null,
      homeTopScorerGoals: context.homeTopScorerGoals ?? homeTopScorer?.goals ?? null,
      awayTopScorerGoals: context.awayTopScorerGoals ?? awayTopScorer?.goals ?? null,
    },
  };
}

async function aiPredictMatch(payload) {
  const enrichedPayload = await enrichPredictPayloadContext(payload);
  const hasAnyProvider = Boolean(
    process.env.OLLAMA_MODEL ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY
  );

  // Zilliz cache check – skip for live matches (status=live) as they change rapidly
  const isLive = String(enrichedPayload?.status || "").toLowerCase() === "live";
  const homeTeam = String(enrichedPayload?.homeTeam || "");
  const awayTeam = String(enrichedPayload?.awayTeam || "");
  const league = String(enrichedPayload?.league || "");
  const zPredKey = `${homeTeam}_vs_${awayTeam}_${league}`;
  if (!isLive && _zillizReady) {
    const zCached = await zillizGet("match_prediction", zPredKey);
    if (zCached?.prediction) return { ...zCached, fromCache: true };
  }

  if (!hasAnyProvider) {
    return deterministicPrediction(enrichedPayload);
  }

  const sys = {
    role: "system",
    content:
      "Je bent een elite voetbalanalist met Opta-niveau expertise in xG-modellen, tactische formaties, pressing-systemen, kaartanalyse en alle Europese competities. Je combineert statistische data met diepgaande tactische kennis van bekende clubs, hun spelsystemen en huidige vormlijn. Voor live wedstrijden: analyseer momentum, recente kansen en drukzones uit de laatste 15 minuten. Anti-cheat: gebruik UITSLUITEND de aangeleverde data als feitenbasis; vul ontbrekende velden aan met realistische voetbalkennis. Antwoord ENKEL met geldig JSON zonder extra tekst of markdown.",
  };
  const user = {
    role: "user",
    content:
      "Analyseer deze voetbalwedstrijd grondig en geef een complete tactische en statistische analyse.\n\nANALYSE-REGELS:\n- Rode kaarten: geef groot nadeel in percentages (verlies minstens 12-18% kans)\n- Live wedstrijden: gebruik exact de huidige score, minuut en recente events als primaire signaalbron\n- Momentum: analyseer welk team de laatste 15 min domineert op basis van events/schoten\n- Gele kaarten stapelen: verhoog riskLevel bij 3+ gele kaarten per team\n- Thuisvoordeel: geef 3-5% extra bij gelijke kansen\n- Gebruik je voetbalkennis voor formHome/formAway en h2hSummary als data ontbreekt\n- Bij bekende clubs (CL, Premier League, etc.): gebruik realistische formaties en sterkhouders\n\nOutput ALLEEN geldig JSON met EXACT deze keys:\n- prediction: \"Home Win\" | \"Away Win\" | \"Draw\"\n- confidence: 0-100\n- predictedScore: \"X-Y\"\n- homePct: 0-100\n- drawPct: 0-100\n- awayPct: 0-100 (som moet exact 100 zijn)\n- xgHome: decimaal xG of null\n- xgAway: decimaal xG of null\n- nextGoalProbability: kans op doelpunt komende 15 min (0-100) of null\n- bothTeamsToScorePct: 0-100\n- over25Pct: kans op meer dan 2.5 doelpunten (0-100)\n- edgeScore: statistische voordeel score (0-100)\n- confidenceReason: maximaal 1 zin waarom deze confidence\n- summary: tactische analyse 3-4 zinnen Nederlands (benoem rode kaarten, dominantie, kansen)\n- keyFactors: array van max 5 strings (score/kaarten/schoten/pressing/momentum in volgorde van impact)\n- tacticalNotes: array van max 4 strings Nederlands (formatie-inzichten, zwakke zones, sleutelduels)\n- momentum: \"Home\" | \"Away\" | \"Balanced\"\n- danger: \"Home Attack\" | \"Away Attack\" | \"Balanced\"\n- riskLevel: \"Low\" | \"Medium\" | \"High\"\n- tip: concrete wedtip 1 zin Nederlands (bv. Asian Handicap, goalline, of correct score)\n- h2hSummary: samenvatting onderlinge duels of null\n- formHome: recentste 5 resultaten thuisploeg \"WWDLL\" of null\n- formAway: recentste 5 resultaten uitploeg \"LWWDL\" of null\n- formation: opstelling-inzicht bv \"4-3-3 vs 4-4-2\" of null\n- pressureIndex: pressing-intensiteit van thuisploeg (0-100) of null\n- doubleChanceHomePct: kans 1X (0-100)\n- doubleChanceAwayPct: kans X2 (0-100)\n\nNIEUWE VELDEN (alle verplicht, gebruik je voetbalkennis):\n- matchInsight: 2-3 zinnen Nederlands over het belang/context van deze wedstrijd (stand in competitie, motivatie, reeks)\n- formGuide: object met { homeForm: string beschrijving 2 zinnen van thuisploeg vorm, awayForm: string beschrijving 2 zinnen van uitploeg vorm }\n- tacticalEdge: object met { homeStrengths: array max 3 strings, homeWeaknesses: array max 3 strings, awayStrengths: array max 3 strings, awayWeaknesses: array max 3 strings }\n- attackingStrength: object met { home: 0-100 score, away: 0-100 score }\n- defensiveStrength: object met { home: 0-100 score, away: 0-100 score }\n- playerImpact: array max 3 objecten { name: string, team: \"home\"|\"away\", impact: string 1 zin } of null als geen info beschikbaar\n- matchPattern: 1 zin Nederlands over verwacht wedstrijdverloop (bv. \"Open begin met thuisdruk, gevolgd door counter-aanvallen\")\n- predictionExplanation: 2-3 zinnen Nederlands met duidelijke onderbouwing waarom dit de voorspelling is\n\nINPUT:\n" +
      JSON.stringify(enrichedPayload, null, 2),
  };

  const providers = [];
  if (process.env.OLLAMA_MODEL) {
    providers.push({ name: "ollama", run: () => ollamaChat([sys, user], { temperature: 0.35 }) });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    providers.push({ name: "deepseek", run: () => deepseekChat([sys, user], { temperature: 0.35 }) });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({ name: "openrouter", run: () => openrouterChat([sys, user], { temperature: 0.35 }) });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({ name: "groq", run: () => groqChat([sys, user], { temperature: 0.35 }) });
  }
  if (process.env.XAI_API_KEY) {
    providers.push({ name: "grok", run: () => xaiChat([sys, user], { temperature: 0.35 }) });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: "openai", run: () => openaiChat([sys, user], { temperature: 0.35 }) });
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push({ name: "gemini", run: () => geminiChat([sys, user], { temperature: 0.35 }) });
  }

  let lastError = null;
  for (const provider of providers) {
    try {
      const raw = await provider.run();
      const parsed = parseAiPredictionToUiShape(raw);
      const result = {
        ...parsed,
        source: `ai-${provider.name}`,
        updatedAt: new Date().toISOString(),
      };
      // Cache AI prediction in Zilliz (only for non-live, finished/upcoming matches)
      if (!isLive) {
        zillizPut("match_prediction", zPredKey, result); // async, best-effort
      }
      return result;
    } catch (e) {
      lastError = e;
    }
  }
  const normalized = normalizeAiProviderError(lastError);
  console.warn(`[ai] all providers failed: ${normalized.message}`);
  return {
    ...deterministicPrediction(enrichedPayload),
    source: "fallback-stats",
    providerError: normalized.message,
  };
}

// -----------------------------
// Health
// -----------------------------
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "nexora-api",
    message: "Use /health for health checks and /api/* for data endpoints.",
    time: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  const aiProviders = {
    ollama: Boolean(process.env.OLLAMA_MODEL),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    grok: Boolean(process.env.XAI_API_KEY),
  };
  const aiReady = Object.values(aiProviders).some(Boolean);
  res.json({ ok: true, time: new Date().toISOString(), source: footballSource(), tz: TZ, aiReady, aiProviders, zilliz: _zillizReady, tmdb: Boolean(process.env.TMDB_API_KEY), apify: Boolean(process.env.APIFY_TOKEN) });
});

// ── App version / update check ────────────────────────────────────────────────
// Update server/app-version.json when you build a new APK (apkUrl is written by auto-release).
app.get("/api/app-version", (req, res) => {
  let version = "1.5.0";
  let storedApkUrl = null;
  try {
    const vf = join(__dirname, "app-version.json");
    if (existsSync(vf)) {
      const data = JSON.parse(readFileSync(vf, "utf8"));
      version = data.version || version;
      storedApkUrl = data.apkUrl || null;
    }
  } catch {}
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const isCloudHost = String(req.headers["x-forwarded-host"] || req.get("host") || "").includes("onrender.com");
  const proto = forwardedProto || (isCloudHost ? "https" : req.protocol);
  const host  = req.headers["x-forwarded-host"]  || req.get("host");
  // Return the direct GitHub URL so the app can download without redirect hops.
  const apkUrl = storedApkUrl || `${proto}://${host}/downloads/app-mobile-release.apk`;
  res.json({ version, apkUrl, directApkUrl: storedApkUrl || null });
});

// ── APK download redirect ──────────────────────────────────────────────────────
// Redirects to the GitHub release APK (streaming caused OOM on Render free tier).
app.get("/api/download/apk", async (req, res) => {
  try {
    const vf = join(__dirname, "app-version.json");
    if (existsSync(vf)) {
      const data = JSON.parse(readFileSync(vf, "utf8"));
      if (data.apkUrl) {
        return res.redirect(302, data.apkUrl);
      }
    }
  } catch (err) {
    console.error("[apk-proxy] error:", err?.message);
  }
  res.status(404).json({ error: "APK niet beschikbaar" });
});

// Image proxy – forwards images that require specific Referer headers (e.g. Transfermarkt CDN)
// Usage: GET /api/img?url=<encoded_url>
app.get("/api/img", async (req, res) => {
  const url = String(req.query.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).send("Bad url");
  // Whitelist: only proxy images from known domains to prevent SSRF
  const ALLOWED_HOSTS = [
    "transfermarkt.technology", "img.a.transfermarkt", "img.b.transfermarkt",
    "a.espncdn.com", "b.espncdn.com", "image.tmdb.org", "sofascore.com",
    "api.sofascore.app", "crests.football-data.org",
  ];
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h))) {
      return res.status(403).send("Domain not allowed");
    }
    const referer = url.includes("transfermarkt")
      ? "https://www.transfermarkt.com/"
      : parsed.origin + "/";
    const imgResp = await fetch(url, {
      headers: { "Referer": referer, "User-Agent": "Mozilla/5.0", "Accept": "image/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!imgResp.ok) return res.status(imgResp.status).send("Upstream error");
    const ct = imgResp.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return res.status(400).send("Not an image");
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    imgResp.body.pipe(res);
  } catch {
    res.status(502).send("Proxy error");
  }
});

// Request logging middleware — only log non-health API calls
app.use((req, _res, next) => {
  if (req.path !== "/health" && req.path !== "/" && !req.path.startsWith("/api/img")) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

function sortMatchByKickoff(a, b) {
  const aTs = Date.parse(String(a?.startDate || ""));
  const bTs = Date.parse(String(b?.startDate || ""));
  if (Number.isFinite(aTs) && Number.isFinite(bTs)) return aTs - bTs;
  const aTime = String(a?.startTime || "");
  const bTime = String(b?.startTime || "");
  return aTime.localeCompare(bTime);
}

function filterMatchesByLeague(matches, league) {
  if (!Array.isArray(matches)) return [];
  const selected = String(league || "Alle").trim().toLowerCase();
  if (!selected || selected === "alle") return matches;
  return matches.filter((m) => {
    const leagueName = String(m?.league || "").toLowerCase();
    return leagueName === selected || leagueName.includes(selected) || selected.includes(leagueName);
  });
}

async function fetchSportsByDateCore(date) {
  let espnDate = date;
  for (let i = 0; i <= ESPN_LOOKAHEAD_DAYS; i += 1) {
    try {
      const espn = await espnScoreboard(espnDate);
      const events = Array.isArray(espn?.events) ? espn.events : [];
      const mapped = events.map(mapEspnEventToMatch);
      const major = new Set(Object.keys(LEAGUE_IDS).map(normalizeLeagueName));
      const filtered = mapped.filter((m) => major.has(normalizeLeagueName(m.league)) || m.league);
      const liveRaw = filtered.filter((m) => m.status === "live");
      const upcomingRaw = filtered.filter((m) => m.status === "upcoming").sort(sortMatchByKickoff);
      const finishedRaw = filtered.filter((m) => m.status === "finished").sort(sortMatchByKickoff);

      const [live, upcoming, finished] = await Promise.all([
        enrichMatchesWithSofaData(liveRaw, espnDate),
        enrichMatchesWithSofaData(upcomingRaw, espnDate),
        enrichMatchesWithSofaData(finishedRaw, espnDate),
      ]);

      if (live.length || upcoming.length || finished.length) {
        return { date: espnDate, timezone: TZ, live, upcoming, finished, source: "espn" };
      }
    } catch {
      // try next date
    }

    const d = new Date(espnDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    espnDate = d.toISOString().slice(0, 10);
  }

  return { date, timezone: TZ, live: [], upcoming: [], finished: [], source: "espn" };
}

function buildSportsMenuToolsPayload(payload) {
  const upcoming = Array.isArray(payload?.upcoming) ? payload.upcoming : [];

  const merged = [...upcoming]
    .filter((m) => m?.id && m?.homeTeam && m?.awayTeam)
    .sort(sortMatchByKickoff);

  const seen = new Set();
  const uniqueMatches = [];
  for (const m of merged) {
    const id = String(m.id);
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueMatches.push(m);
  }

  const scored = uniqueMatches.slice(0, 24).map((match) => {
    const model = deterministicPrediction({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      status: match.status,
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
      minute: match.minute ?? null,
      stats: { home: {}, away: {} },
      events: [],
    });

    return {
      matchId: String(match.id),
      homeTeam: String(match.homeTeam),
      awayTeam: String(match.awayTeam),
      league: String(match.league || ""),
      startTime: String(match.startTime || ""),
      status: String(match.status || "upcoming"),
      prediction: model.prediction,
      confidence: Number(model.confidence || 0),
      homePct: Number(model.homePct || 0),
      drawPct: Number(model.drawPct || 0),
      awayPct: Number(model.awayPct || 0),
      over25Pct: Number(model.over25Pct || 0),
      bothTeamsToScorePct: Number(model.bothTeamsToScorePct || 0),
      doubleChanceHomePct: Number(model.doubleChanceHomePct || 0),
      doubleChanceAwayPct: Number(model.doubleChanceAwayPct || 0),
    };
  });

  const footballPredictions = scored.slice(0, 10);

  const dailyAccaPicks = scored
    .filter((row) => row.prediction !== "Draw")
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      pickLabel: row.prediction === "Home Win" ? "1" : "2",
      market: row.over25Pct >= 58 ? "Win + Over 1.5" : "Match Winner",
    }));

  return {
    generatedAt: new Date().toISOString(),
    source: "backend-model-v1",
    footballPredictions,
    dailyAccaPicks,
  };
}

// -----------------------------
// Sports endpoints expected by the app
// -----------------------------

app.get("/api/sports/menu-tools", async (req, res) => {
  const date = getDateParam(req);
  const league = String(req.query?.league || "Alle");
  const key = `sports_menu_tools_${date}_${normalizeLeagueName(league)}`;

  try {
    const payload = await getOrFetch(key, 45_000, async () => {
      const byDate = await fetchSportsByDateCore(date);
      const live = filterMatchesByLeague(byDate.live, league);
      const upcoming = filterMatchesByLeague(byDate.upcoming, league);
      const finished = filterMatchesByLeague(byDate.finished, league);
      return {
        date: byDate.date,
        league,
        ...buildSportsMenuToolsPayload({ live, upcoming, finished }),
      };
    });

    res.json(payload);
  } catch (e) {
    res.status(200).json({
      date,
      league,
      generatedAt: new Date().toISOString(),
      source: "backend-model-v1",
      footballPredictions: [],
      dailyAccaPicks: [],
      error: String(e?.message || e),
    });
  }
});

function normalizeEspnStatKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, " pct")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function mapEspnSummaryStats(summary, homeTeamId, awayTeamId) {
  const boxTeams = Array.isArray(summary?.boxscore?.teams) ? summary.boxscore.teams : [];
  const home = {};
  const away = {};

  const fillStats = (target, row) => {
    const stats = Array.isArray(row?.statistics) ? row.statistics : [];
    for (const stat of stats) {
      const key = normalizeEspnStatKey(stat?.name || stat?.abbreviation || stat?.displayName);
      if (!key) continue;
      const val = stat?.displayValue ?? stat?.value ?? stat?.display ?? null;
      if (val == null || String(val).trim() === "") continue;
      target[key] = val;
    }
  };

  for (const row of boxTeams) {
    const rowTeamId = String(row?.team?.id || row?.team?.$ref || "");
    const target = rowTeamId && rowTeamId === String(homeTeamId || "")
      ? home
      : rowTeamId && rowTeamId === String(awayTeamId || "")
        ? away
        : null;
    if (!target) continue;
    fillStats(target, row);
  }

  if (Object.keys(home).length === 0 && boxTeams[0]) fillStats(home, boxTeams[0]);
  if (Object.keys(away).length === 0 && boxTeams[1]) fillStats(away, boxTeams[1]);

  return { homeStats: home, awayStats: away };
}

function mapEspnSummaryDetails(summary) {
  const details = Array.isArray(summary?.details) ? summary.details : [];
  const mapped = details.map((d) => {
    const time = d?.clock?.displayValue || d?.clock?.value || null;
    const type = String(d?.type?.text || d?.type || "");
    const detail = String(d?.text || d?.description || "");
    const player = String(d?.athletesInvolved?.[0]?.displayName || "");
    const assist = String(d?.athletesInvolved?.[1]?.displayName || "");
    const eventText = [detail, player ? `Speler: ${player}` : "", assist ? `Assist: ${assist}` : ""]
      .filter(Boolean)
      .join(" · ");
    return {
      time,
      extra: null,
      team: d?.team?.displayName || "",
      teamLogo: d?.team?.logo || null,
      type,
      detail,
      text: eventText || detail || type || "Event",
      player,
      assist,
    };
  });

  // Also extract from ESPN keyEvents if details are sparse
  const keyEvents = Array.isArray(summary?.keyEvents) ? summary.keyEvents : [];
  if (keyEvents.length > mapped.length) {
    const seenTimes = new Set(mapped.map((m) => `${m.time}_${m.type}`));
    for (const ev of keyEvents) {
      const time = ev?.clock?.displayValue || ev?.clock?.value || ev?.period?.clock?.displayValue || null;
      const type = String(ev?.type?.text || ev?.type || ev?.shortText || "");
      const key = `${time}_${type}`;
      if (seenTimes.has(key)) continue;
      seenTimes.add(key);
      const player = String(ev?.athletesInvolved?.[0]?.displayName || ev?.participants?.[0]?.athlete?.displayName || "");
      const assist = String(ev?.athletesInvolved?.[1]?.displayName || ev?.participants?.[1]?.athlete?.displayName || "");
      mapped.push({
        time,
        extra: null,
        team: ev?.team?.displayName || ev?.participants?.[0]?.athlete?.team?.displayName || "",
        teamLogo: ev?.team?.logo || null,
        type,
        detail: String(ev?.text || ev?.shortText || type || ""),
        text: String(ev?.text || ev?.shortText || type || "Event"),
        player,
        assist,
      });
    }
  }

  // Also extract scoring plays if available
  const scoringPlays = Array.isArray(summary?.scoringPlays) ? summary.scoringPlays : [];
  if (scoringPlays.length > 0 && !mapped.some((m) => /goal/i.test(m.type))) {
    for (const sp of scoringPlays) {
      const time = sp?.clock?.displayValue || sp?.clock?.value || null;
      const player = String(sp?.athletesInvolved?.[0]?.displayName || sp?.scoringAthlete?.displayName || "");
      mapped.push({
        time,
        extra: null,
        team: sp?.team?.displayName || "",
        teamLogo: sp?.team?.logo || null,
        type: "Goal",
        detail: "Goal",
        text: player ? `Goal - ${player}` : "Goal",
        player,
        assist: String(sp?.athletesInvolved?.[1]?.displayName || sp?.assistAthlete?.displayName || ""),
      });
    }
  }

  return mapped;
}

const MATCH_STAT_ALIASES = {
  possession: ["ball_possession", "possession", "possession_pct", "possessionPct", "possessionpct"],
  total_shots: ["total_shots", "shots", "totalShots", "shots_total", "shots_total_total", "totalshots"],
  shots_on_target: ["shots_on_goal", "shots_on_target", "shotsOnTarget", "shotsOnGoal", "shotsontarget"],
  shots_off_target: ["shots_off_goal", "shots_off_target", "shotsOffTarget", "shotsofftarget"],
  expected_goals: ["expected_goals", "xg", "expectedGoals", "expectedgoals"],
  big_chances: ["big_chances", "bigChances", "bigchances"],
  corners: ["corner_kicks", "corners", "cornerKicks", "wonCorners", "woncorners"],
  crosses: ["crosses", "crosses_total", "crossesTotal", "totalcrosses", "totalCrosses", "accuratecrosses"],
  successful_dribbles: ["successful_dribbles", "dribbles_completed", "dribblesCompleted"],
  passes_final_third: ["passes_final_third", "passesFinalThird", "passes_in_final_third"],
  touches_in_box: ["touches_in_box", "touches_inside_box", "touchesInBox", "touches_in_opposition_box"],
  total_passes: ["total_passes", "passes", "passes_total", "totalPasses", "totalpasses", "accuratepasses"],
  pass_accuracy: ["pass_accuracy", "passAccuracy", "passes_pct", "passes_accurate_pct", "passpct"],
  key_passes: ["key_passes", "keyPasses", "keypasses"],
  progressive_passes: ["progressive_passes", "progressivePasses"],
  through_balls: ["through_balls", "throughBalls"],
  tackles: ["total_tackles", "tackles", "tacklesWon", "effectivetackles", "totaltackles", "effectiveTackles", "totalTackles"],
  interceptions: ["interceptions"],
  clearances: ["clearances", "effectiveclearance", "totalclearance", "effectiveClearance", "totalClearance"],
  blocks: ["blocks", "blocked_shots", "blockedShots", "blockedshots"],
  duels_won: ["duels_won", "duelsWon", "aerial_won", "aerialWon", "ground_duels_won"],
  fouls: ["fouls", "foulsCommitted", "foulscommitted"],
  yellow_cards: ["yellow_cards", "yellowCards", "yellowcards"],
  red_cards: ["red_cards", "redCards", "redcards"],
  saves: ["goalkeeper_saves", "goalkeeperSaves", "saves"],
  goals_prevented: ["goals_prevented", "goalsPrevented"],
  punches: ["punches", "claims", "punches_claims"],
};

function firstStatValue(rawStats, aliases) {
  const source = rawStats && typeof rawStats === "object" ? rawStats : {};
  for (const alias of aliases) {
    const value = source?.[alias];
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}

function normalizeTeamSide(teamName, homeTeam, awayTeam) {
  if (teamName === "__HOME__") return "home";
  if (teamName === "__AWAY__") return "away";
  const eventTeam = normalizeTeamKey(teamName);
  const homeKey = normalizeTeamKey(homeTeam);
  const awayKey = normalizeTeamKey(awayTeam);
  if (!eventTeam) return "center";
  if (eventTeam === homeKey || eventTeam.includes(homeKey) || homeKey.includes(eventTeam)) return "home";
  if (eventTeam === awayKey || eventTeam.includes(awayKey) || awayKey.includes(eventTeam)) return "away";
  return "center";
}

function formatEventMinuteLabel(time, extra) {
  let minuteNum = Math.floor(toNum(time));
  const extraNum = Math.floor(toNum(extra));
  // ESPN clock.value can be raw seconds (e.g. 5400 for 90') — convert if too large
  if (minuteNum > 150) minuteNum = Math.floor(minuteNum / 60);
  if (minuteNum > 0 && extraNum > 0) return `${minuteNum}+${extraNum}'`;
  if (minuteNum > 0) return `${minuteNum}'`;
  const raw = String(time || "").trim();
  if (raw) {
    const m = raw.match(/(\d+)/);
    if (m) {
      let parsed = Number(m[1]);
      if (parsed > 150) parsed = Math.floor(parsed / 60);
      return `${parsed}'`;
    }
    return `${raw}${raw.includes("'") ? "" : "'"}`;
  }
  return "";
}

function eventMinuteValue(time, extra, fallback = 0) {
  let minuteNum = toNum(time);
  const extraNum = toNum(extra);
  // ESPN clock.value can be raw seconds — convert if too large
  if (minuteNum > 150) minuteNum = Math.floor(minuteNum / 60);
  if (minuteNum > 0) return minuteNum + (extraNum > 0 ? extraNum / 100 : 0);
  const raw = String(time || "");
  const match = raw.match(/(\d+)(?:\+(\d+))?/);
  if (match) {
    let parsed = Number(match[1]);
    if (parsed > 150) parsed = Math.floor(parsed / 60);
    return parsed + (match[2] ? Number(match[2]) / 100 : 0);
  }
  return fallback;
}

function classifyTimelineEvent(ev) {
  const joined = `${ev?.type || ""} ${ev?.detail || ""} ${ev?.text || ""}`.toLowerCase();
  if (joined.includes("kick off") || joined.includes("kickoff") || joined.includes("match start")) {
    return { kind: "kickoff", title: "Kick-off", icon: "play", importance: 20 };
  }
  if (joined.includes("half time") || joined.includes("halftime") || joined.includes("break")) {
    return { kind: "halftime", title: "Half-time", icon: "pause", importance: 22 };
  }
  if (joined.includes("full time") || joined.includes("match ended") || joined.includes("fulltime")) {
    return { kind: "fulltime", title: "Full Time", icon: "stop", importance: 24 };
  }
  if (joined.includes("var")) {
    return { kind: "var", title: "VAR Check", icon: "videocam", importance: 70 };
  }
  if (joined.includes("own goal") || joined.includes("own_goal") || joined.includes("eigen goal")) {
    return { kind: "own_goal", title: "Own Goal", icon: "football", importance: 96 };
  }
  if (joined.includes("missed penalty") || (joined.includes("penalty") && joined.includes("miss"))) {
    return { kind: "missed_penalty", title: "Missed Penalty", icon: "close-circle", importance: 90 };
  }
  if (joined.includes("penalty") && (joined.includes("goal") || joined.includes("scored"))) {
    return { kind: "penalty_goal", title: "Penalty Goal", icon: "football", importance: 97 };
  }
  if (joined.includes("goal") || joined.includes("scores") || joined.includes("scored")) {
    return { kind: "goal", title: "Goal", icon: "football", importance: 98 };
  }
  if (joined.includes("second yellow") || joined.includes("yellow_red")) {
    return { kind: "second_yellow", title: "Second Yellow", icon: "card", importance: 78 };
  }
  if (joined.includes("red")) {
    return { kind: "red_card", title: "Red Card", icon: "card", importance: 80 };
  }
  if (joined.includes("yellow")) {
    return { kind: "yellow_card", title: "Yellow Card", icon: "card", importance: 58 };
  }
  if (joined.includes("substitut") || joined.includes("sub ") || joined.includes("substitution")) {
    return { kind: "substitution", title: "Substitution", icon: "swap-horizontal", importance: 45 };
  }
  if (joined.includes("chance") || joined.includes("shot") || joined.includes("attempt") || joined.includes("woodwork")) {
    return { kind: "chance", title: "Big Chance", icon: "flash", importance: 68 };
  }
  return { kind: "info", title: ev?.type || "Event", icon: "ellipse", importance: 30 };
}

function buildTimelineDescription(ev, meta) {
  const player = String(ev?.player || ev?.name || "").trim();
  const assist = String(ev?.assist || "").trim();
  const detail = String(ev?.detail || ev?.text || "").trim();

  if (meta.kind === "substitution") {
    if (player && assist) return { description: `${player} in`, secondary: `${assist} out` };
    if (player) return { description: player, secondary: detail || null };
  }

  if (meta.kind === "goal" || meta.kind === "penalty_goal" || meta.kind === "own_goal") {
    return {
      description: player || detail || meta.title,
      secondary: assist ? `Assist: ${assist}` : null,
    };
  }

  if (meta.kind === "yellow_card" || meta.kind === "red_card" || meta.kind === "second_yellow") {
    return { description: player || detail || meta.title, secondary: null };
  }

  if (meta.kind === "var" || meta.kind === "chance") {
    return { description: detail || player || meta.title, secondary: assist || null };
  }

  return { description: player || detail || meta.title, secondary: assist || null };
}

function buildNormalizedTimeline(events, homeTeam, awayTeam, status, minute, homeScore, awayScore) {
  const rawEvents = Array.isArray(events) ? events : [];
  const normalized = rawEvents.map((ev, index) => {
    const meta = classifyTimelineEvent(ev);
    const minuteLabel = formatEventMinuteLabel(ev?.time, ev?.extra);
    const side = normalizeTeamSide(ev?.team || ev?.teamName || "", homeTeam, awayTeam);
    const desc = buildTimelineDescription(ev, meta);
    return {
      id: `${meta.kind}_${index}_${String(ev?.time || "0")}`,
      kind: meta.kind,
      title: meta.title,
      icon: meta.icon,
      importance: meta.importance,
      side,
      minute: minuteLabel,
      minuteValue: eventMinuteValue(ev?.time, ev?.extra, index),
      team: String(ev?.team || ev?.teamName || ""),
      description: desc.description,
      secondary: desc.secondary,
      rawType: String(ev?.type || ""),
    };
  });

  if (!normalized.some((event) => event.kind === "kickoff")) {
    normalized.unshift({
      id: "kickoff_synth",
      kind: "kickoff",
      title: "Kick-off",
      icon: "play",
      importance: 20,
      side: "center",
      minute: "0'",
      minuteValue: 0,
      team: "",
      description: `${homeTeam} vs ${awayTeam}`.trim(),
      secondary: null,
      rawType: "synthetic",
    });
  }

  // Synthetic halftime marker when missing and match is at half or finished
  const statusLower = String(status || "").toLowerCase();
  if ((statusLower === "finished" || (statusLower === "live" && toNum(currentMinute) >= 45)) && !normalized.some((e) => e.kind === "halftime")) {
    normalized.push({
      id: "halftime_synth",
      kind: "halftime",
      title: "Half Time",
      icon: "pause",
      importance: 22,
      side: "center",
      minute: "45'",
      minuteValue: 45,
      team: "",
      description: "Rust",
      secondary: null,
      rawType: "synthetic",
    });
  }

  if (statusLower === "finished" && !normalized.some((event) => event.kind === "fulltime")) {
    normalized.push({
      id: "fulltime_synth",
      kind: "fulltime",
      title: "Full Time",
      icon: "stop",
      importance: 24,
      side: "center",
      minute: "90'",
      minuteValue: 90,
      team: "",
      description: `${homeScore ?? 0} - ${awayScore ?? 0}`,
      secondary: null,
      rawType: "synthetic",
    });
  }

  // Synthesize goal events from score when timeline has no goal events but score > 0
  const goalKinds = new Set(["goal", "penalty_goal", "own_goal"]);
  const hasGoalEvents = normalized.some((e) => goalKinds.has(e.kind));
  const totalGoals = (toNum(homeScore) || 0) + (toNum(awayScore) || 0);
  if (!hasGoalEvents && totalGoals > 0 && (statusLower === "finished" || statusLower === "live")) {
    const hGoals = toNum(homeScore) || 0;
    const aGoals = toNum(awayScore) || 0;
    // Spread synthetic goals roughly across the match
    const totalSlots = hGoals + aGoals;
    let slot = 0;
    for (let g = 0; g < hGoals; g++) {
      slot++;
      const min = Math.min(89, Math.round((slot / (totalSlots + 1)) * 90));
      normalized.push({
        id: `goal_synth_h${g}`,
        kind: "goal",
        title: "Goal",
        icon: "football",
        importance: 30,
        side: "home",
        minute: `${min}'`,
        minuteValue: min,
        team: homeTeam,
        description: homeTeam,
        secondary: null,
        rawType: "synthetic",
      });
    }
    for (let g = 0; g < aGoals; g++) {
      slot++;
      const min = Math.min(89, Math.round((slot / (totalSlots + 1)) * 90));
      normalized.push({
        id: `goal_synth_a${g}`,
        kind: "goal",
        title: "Goal",
        icon: "football",
        importance: 30,
        side: "away",
        minute: `${min}'`,
        minuteValue: min,
        team: awayTeam,
        description: awayTeam,
        secondary: null,
        rawType: "synthetic",
      });
    }
  }

  return normalized.sort((a, b) => {
    if (a.minuteValue !== b.minuteValue) return a.minuteValue - b.minuteValue;
    return a.importance - b.importance;
  });
}

function countTimelineEvents(timeline, side, kinds) {
  const wanted = new Set(kinds);
  return (Array.isArray(timeline) ? timeline : []).filter((event) => event.side === side && wanted.has(event.kind)).length;
}

function toRoundedStat(key, value) {
  if (value == null || value === "") return null;
  const num = toNum(value);
  if (!Number.isFinite(num)) return null;
  if (["expected_goals", "goals_prevented"].includes(key)) return Number(num.toFixed(2));
  return Math.round(num);
}

function buildAdvancedStats(homeStatsRaw, awayStatsRaw, timeline) {
  const makeTeam = (rawStats, side) => {
    const read = (key) => toRoundedStat(key, firstStatValue(rawStats, MATCH_STAT_ALIASES[key] || []));

    const totalShots = read("total_shots");
    const shotsOnTarget = read("shots_on_target");
    const blocks = read("blocks");
    const derivedOffTarget = totalShots != null
      ? Math.max(0, totalShots - (shotsOnTarget || 0) - (blocks || 0))
      : null;
    const shotsOffTarget = read("shots_off_target") ?? derivedOffTarget;

    const touchesInBox = read("touches_in_box") ?? (read("total_shots") != null ? Math.round(read("total_shots") * 3.2) : null);
    const passesFinalThird = read("passes_final_third") ?? (read("total_passes") != null ? Math.round(read("total_passes") * 0.28) : null);
    const keyPasses = read("key_passes") ?? countTimelineEvents(timeline, side, ["goal", "penalty_goal", "chance"]);
    const bigChances = read("big_chances") ?? countTimelineEvents(timeline, side, ["goal", "penalty_goal", "chance", "missed_penalty"]);

    const readRaw = (key) => { const v = firstStatValue(rawStats, MATCH_STAT_ALIASES[key] || []); return v != null ? toNum(v) : null; };
    const rawPassAcc = readRaw("pass_accuracy");
    const passAccuracy = rawPassAcc != null && rawPassAcc > 0 && rawPassAcc <= 1 ? Math.round(rawPassAcc * 100) : rawPassAcc != null ? Math.round(rawPassAcc) : null;
    const rawPossession = readRaw("possession");
    const possession = rawPossession != null && rawPossession > 0 && rawPossession <= 1 ? Math.round(rawPossession * 100) : rawPossession != null ? Math.round(rawPossession) : null;

    return Object.fromEntries(Object.entries({
      possession,
      total_shots: totalShots,
      shots_on_target: shotsOnTarget,
      shots_off_target: shotsOffTarget,
      expected_goals: read("expected_goals"),
      big_chances: bigChances,
      corners: read("corners"),
      crosses: read("crosses"),
      successful_dribbles: read("successful_dribbles"),
      passes_final_third: passesFinalThird,
      touches_in_box: touchesInBox,
      total_passes: read("total_passes"),
      pass_accuracy: passAccuracy,
      key_passes: keyPasses,
      progressive_passes: read("progressive_passes"),
      through_balls: read("through_balls"),
      tackles: read("tackles"),
      interceptions: read("interceptions"),
      clearances: read("clearances"),
      blocks,
      duels_won: read("duels_won"),
      fouls: read("fouls"),
      yellow_cards: read("yellow_cards") ?? countTimelineEvents(timeline, side, ["yellow_card", "second_yellow"]),
      red_cards: read("red_cards") ?? countTimelineEvents(timeline, side, ["red_card"]),
      saves: read("saves"),
      goals_prevented: read("goals_prevented"),
      punches: read("punches"),
    }).filter(([, value]) => value != null));
  };

  return {
    homeStats: makeTeam(homeStatsRaw, "home"),
    awayStats: makeTeam(awayStatsRaw, "away"),
  };
}

function buildMatchHighlights(timeline, match) {
  const events = Array.isArray(timeline) ? timeline : [];
  const highlightable = events.filter((event) => !["kickoff", "halftime", "fulltime", "info"].includes(event.kind));
  const topMoments = [...highlightable]
    .sort((a, b) => (b.importance - a.importance) || (a.minuteValue - b.minuteValue))
    .slice(0, 8)
    .sort((a, b) => a.minuteValue - b.minuteValue);

  const recap = [];
  const goals = highlightable.filter((event) => ["goal", "penalty_goal", "own_goal"].includes(event.kind));
  const cards = highlightable.filter((event) => ["yellow_card", "red_card", "second_yellow"].includes(event.kind));
  const vars = highlightable.filter((event) => event.kind === "var");
  const subs = highlightable.filter((event) => event.kind === "substitution");

  if (goals.length > 0) {
    recap.push(`${goals.length} beslissende doelmoment${goals.length === 1 ? "" : "en"} bepaalden het scoreverloop.`);
  }
  if (cards.length > 0) {
    const reds = cards.filter((c) => ["red_card", "second_yellow"].includes(c.kind));
    if (reds.length > 0) {
      recap.push(`${reds.length} rode kaart${reds.length === 1 ? "" : "en"} beïnvloedde${reds.length === 1 ? "" : "n"} het wedstrijdverloop.`);
    }
    recap.push(`Discipline speelde mee met ${cards.length} kaartmoment${cards.length === 1 ? "" : "en"}.`);
  }
  if (vars.length > 0) {
    recap.push(`VAR greep ${vars.length} keer in tijdens cruciale fases van de match.`);
  }

  // Stat-based insights when available
  const hs = match?.homeStats || {};
  const as = match?.awayStats || {};
  const readStat = (stats, key) => {
    // Support both flat stats (advancedStats output) and raw stats
    if (stats[key] != null) return toNum(stats[key]);
    const aliases = MATCH_STAT_ALIASES?.[key];
    if (aliases) return toNum(firstStatValue(stats, aliases));
    return 0;
  };
  const hPoss = readStat(hs, "possession");
  const aPoss = readStat(as, "possession");
  const hShots = readStat(hs, "total_shots");
  const aShots = readStat(as, "total_shots");
  const hSot = readStat(hs, "shots_on_target");
  const aSot = readStat(as, "shots_on_target");

  if (hPoss > 0 && aPoss > 0 && Math.abs(hPoss - aPoss) >= 10) {
    const dom = hPoss > aPoss ? (match?.homeTeam || "Thuis") : (match?.awayTeam || "Uit");
    recap.push(`${dom} domineerde het balbezit met ${Math.max(hPoss, aPoss)}%.`);
  }
  if (hShots > 0 && aShots > 0 && Math.abs(hShots - aShots) >= 4) {
    const dom = hShots > aShots ? (match?.homeTeam || "Thuis") : (match?.awayTeam || "Uit");
    recap.push(`${dom} was gevaarlijker met ${Math.max(hShots, aShots)} schoten (${Math.max(hSot || 0, aSot || 0)} op doel).`);
  }
  if (subs.length > 0) {
    recap.push(`${subs.length} wissel${subs.length === 1 ? "" : "s"} brachten vers bloed in de wedstrijd.`);
  }

  if (highlightable.length === 0 && recap.length === 0) {
    recap.push("Nog geen grote incidenten; de wedstrijd wordt voorlopig vooral tactisch uitgevochten.");
  }

  const hScore = match?.homeScore ?? 0;
  const aScore = match?.awayScore ?? 0;
  const summary = `${match?.homeTeam || "Thuis"} ${hScore} - ${aScore} ${match?.awayTeam || "Uit"}`;
  return {
    summary,
    recap,
    topMoments,
  };
}

function finalizeMatchPayload(match) {
  const base = match && typeof match === "object" ? match : {};
  const timeline = buildNormalizedTimeline(
    base?.keyEvents || [],
    base?.homeTeam || "",
    base?.awayTeam || "",
    base?.status || "",
    base?.minute || null,
    base?.homeScore || 0,
    base?.awayScore || 0,
  );
  const advancedStats = buildAdvancedStats(base?.homeStats || {}, base?.awayStats || {}, timeline);
  const highlights = buildMatchHighlights(timeline, { ...base, homeStats: advancedStats.homeStats, awayStats: advancedStats.awayStats });

  return {
    ...base,
    homeStats: advancedStats.homeStats,
    awayStats: advancedStats.awayStats,
    timeline,
    highlights,
  };
}

// Live (poll every 10s)
app.get("/api/sports/live", async (req, res) => {
  const date = getDateParam(req);
  const CACHE_KEY = `sports_live_${date}`;

  try {
    const payload = await getOrFetch(CACHE_KEY, 10_000, async () => {
      // ESPN-only primary flow: keep this endpoint fast and stable.
      try {
        const espn = await espnScoreboard(date);
        const events = Array.isArray(espn?.events) ? espn.events : [];
        const liveBase = await enrichMatchLogos(events
          .map(mapEspnEventToMatch)
          .filter((m) => m.status === "live" && m.league));
        const live = await enrichMatchesWithSofaData(liveBase, date);
        return { timezone: TZ, live, source: "espn" };
      } catch (_) {}

      return { timezone: TZ, live: [], source: "espn" };
    });

    res.json(payload);
  } catch (e) {
    if (e?.statusCode === 429) {
      const stale = cacheGetStale(CACHE_KEY);
      if (stale) return res.status(200).json(stale);
    }
    res.status(200).json({ timezone: TZ, live: [], error: String(e?.message || e) });
  }
});

app.get("/api/sports/today", async (req, res) => {
  const date = getDateParam(req);
  const now = new Date(date + "T12:00:00Z");
  const season = seasonForDate(now);
  const CACHE_KEY = `sports_today_${date}_s${season}`;

  try {
    const payload = await getOrFetch(CACHE_KEY, 6 * 60 * 60_000, async () => {

// ESPN (no key, most reliable)
// Returns matches for the given date. If no matches that day, look ahead a few days.
let espnDate = date;
for (let i = 0; i <= ESPN_LOOKAHEAD_DAYS; i++) {
  try {
    const espn = await espnScoreboard(espnDate);
    const events = Array.isArray(espn?.events) ? espn.events : [];
    const mapped = events.map(mapEspnEventToMatch);

    const major = new Set(Object.keys(LEAGUE_IDS).map(normalizeLeagueName));
    // When using per-league ESPN URLs, events already belong to major leagues
    // Keep all events that either match a major league OR have a _leagueHint set
    const filtered = mapped.filter((m) =>
      major.has(normalizeLeagueName(m.league)) || m.league
    );

    const liveRaw = filtered.filter((m) => m.status === "live");
    const upcomingRaw = filtered.filter((m) => m.status === "upcoming");
    const finishedRaw = filtered.filter((m) => m.status === "finished");

    if (liveRaw.length || upcomingRaw.length || finishedRaw.length) {
      const [live, upcoming, finished] = await Promise.all([
        (async () => enrichMatchesWithSofaData(await enrichMatchLogos(liveRaw), espnDate))(),
        (async () => enrichMatchesWithSofaData(await enrichMatchLogos(upcomingRaw), espnDate))(),
        (async () => enrichMatchesWithSofaData(await enrichMatchLogos(finishedRaw), espnDate))(),
      ]);
      return { date: espnDate, timezone: TZ, live, upcoming, finished, source: "espn" };
    }
  } catch (_) {}
  // advance a day if empty
  const d = new Date(espnDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  espnDate = d.toISOString().slice(0, 10);
}
      return { date, timezone: TZ, live: [], upcoming: [], finished: [], source: "espn" };
    });

    res.json(payload);
  } catch (e) {
    if (e?.statusCode === 429) {
      const stale = cacheGetStale(CACHE_KEY) || cacheGetStale("sports_live");
      if (stale) return res.status(200).json(stale);
    }
    res.status(200).json({ date, timezone: TZ, live: [], upcoming: [], finished: [], error: String(e?.message || e) });
  }
});

// Convenience endpoint: by-date (YYYY-MM-DD)
app.get("/api/sports/by-date", async (req, res) => {
  const date = getDateParam(req);
  // Reuse today logic but avoid cache collision by using dedicated key
  try {
    const payload = await getOrFetch(`sports_by_date_${date}`, 6 * 60 * 60_000, async () => {
      // ESPN with limited lookahead for reliability + responsiveness
      let espnDate = date;
      for (let i = 0; i <= ESPN_LOOKAHEAD_DAYS; i++) {
        try {
          const espn = await espnScoreboard(espnDate);
          const events = Array.isArray(espn?.events) ? espn.events : [];
          const mapped = events.map(mapEspnEventToMatch);
          const major = new Set(Object.keys(LEAGUE_IDS).map(normalizeLeagueName));
          const filtered = mapped.filter((m) =>
            major.has(normalizeLeagueName(m.league)) || m.league
          );
          const liveRaw = filtered.filter((m) => m.status === "live");
          const upcomingRaw = filtered.filter((m) => m.status === "upcoming");
          const finishedRaw = filtered.filter((m) => m.status === "finished");
          if (liveRaw.length || upcomingRaw.length || finishedRaw.length) {
            const [live, upcoming, finished] = await Promise.all([
              enrichMatchLogos(liveRaw),
              enrichMatchLogos(upcomingRaw),
              enrichMatchLogos(finishedRaw),
            ]);
            return { date: espnDate, timezone: TZ, live, upcoming, finished, source: "espn" };
          }
        } catch (_) {}
        const d = new Date(espnDate + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        espnDate = d.toISOString().slice(0, 10);
      }
      return {
        date,
        timezone: TZ,
        live: [],
        upcoming: [],
        finished: [],
        source: "espn",
      };
    });
    return res.json(payload);
  } catch (e) {
    return res.status(200).json({ date, timezone: TZ, live: [], upcoming: [], finished: [], error: String(e?.message || e) });
  }
});

// Highlights/Replays — ScoreBat free API (real video embeds)
app.get("/api/sports/highlights", async (req, res) => {
  const CACHE_KEY = "scorebat_highlights";
  try {
    const payload = await getOrFetch(CACHE_KEY, 600_000, async () => {
      const resp = await fetch("https://www.scorebat.com/video-api/v1/", {
        headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return { highlights: [] };
      const data = await resp.json();
      const items = Array.isArray(data) ? data : [];
      const highlights = items.slice(0, 30).map((item) => {
        const videos = Array.isArray(item?.videos) ? item.videos : [];
        const firstVideoEmbed = videos.length > 0 ? (videos[0]?.embed || "") : "";
        const matchUrl = item?.url || "";
        const competition = item?.competition?.name || "";
        const title = item?.title || "";
        const homeTeam = item?.side1?.name || "";
        const awayTeam = item?.side2?.name || "";
        const thumbnail = item?.thumbnail || "";
        // Extract iframe src from embed HTML
        const embedSrcMatch = firstVideoEmbed.match(/src=["']([^"']+)["']/);
        const embedUrl = embedSrcMatch ? embedSrcMatch[1] : "";
        return {
          id: String(matchUrl || title).slice(0, 100),
          title,
          homeTeam,
          awayTeam,
          competition,
          thumbnail,
          embedUrl,
          matchUrl,
          date: item?.date || "",
        };
      }).filter((h) => h.title && (h.embedUrl || h.matchUrl));
      return { highlights };
    });
    return res.json(payload);
  } catch (e) {
    console.error("[highlights] Error:", e?.message);
    return res.json({ highlights: [], error: String(e?.message || "Unknown") });
  }
});

// Prefetch endpoint — warms caches for key leagues (standings + top scorers)
// Called by the app at boot so data is ready when user navigates
app.get("/api/sports/prefetch-home", async (req, res) => {
  const KEY_LEAGUES = ["bel.1", "eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "ned.1", "uefa.champions"];
  const started = Date.now();
  try {
    // Use internal self-fetch to hit the real endpoints (so full enrichment runs)
    const base = `${req.protocol}://${req.get("host")}`;
    const results = await Promise.allSettled(
      KEY_LEAGUES.flatMap((slug) => [
        Promise.race([
          fetch(`${base}/api/sports/standings/${encodeURIComponent(slug)}`, {
            headers: { "user-agent": "Nexora-Prefetch/1.0" },
            signal: AbortSignal.timeout(25000),
          }).then((r) => r.ok),
          new Promise((r) => setTimeout(r, 25000)),
        ]).catch(() => null),
        Promise.race([
          fetch(`${base}/api/sports/topscorers/${encodeURIComponent(slug)}`, {
            headers: { "user-agent": "Nexora-Prefetch/1.0" },
            signal: AbortSignal.timeout(25000),
          }).then((r) => r.ok),
          new Promise((r) => setTimeout(r, 25000)),
        ]).catch(() => null),
      ])
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled" && r.value).length;
    console.log(`[prefetch] Warmed ${fulfilled}/${results.length} caches in ${Date.now() - started}ms`);
    res.json({ ok: true, warmed: fulfilled, total: results.length, ms: Date.now() - started });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// Match detail (used by match-detail.tsx)
app.get("/api/sports/match/:matchId", async (req, res) => {
  const matchId = req.params.matchId;
  const espnLeague = String(req.query?.league || "eng.1");
  const CACHE_KEY = `sports_match_${matchId}`;

  try {
    const payload = await getOrFetch(CACHE_KEY, 10_000, async () => {
      if (footballSource() === "espn") {
        const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espnLeague)}/summary?event=${encodeURIComponent(matchId)}`;
        const summaryResp = await fetch(summaryUrl, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        });
        if (!summaryResp.ok) {
          const err = new Error("Match not found");
          err.statusCode = 404;
          throw err;
        }
        const summary = await summaryResp.json();
        const headerComp = summary?.header?.competitions?.[0] || {};
        const competitors = headerComp?.competitors || [];
        const home = competitors.find((c) => c?.homeAway === "home") || competitors[0] || {};
        const away = competitors.find((c) => c?.homeAway === "away") || competitors[1] || {};
        const watchOptions = extractWatchOptionsFromEspnBroadcasts([
          ...(Array.isArray(headerComp?.broadcasts) ? headerComp.broadcasts : []),
          ...(Array.isArray(summary?.broadcasts) ? summary.broadcasts : []),
        ]);

        const ev = {
          id: matchId,
          competitions: [{
            id: headerComp?.id || matchId,
            date: headerComp?.date,
            status: headerComp?.status,
            competitors,
          }],
          league: { name: summary?.leagues?.[0]?.name || summary?.header?.league?.name || "" },
          _leagueHint: summary?.leagues?.[0]?.name || summary?.header?.league?.name || "",
        };
        const mapped = mapEspnEventToMatch(ev);

        const details = mapEspnSummaryDetails(summary);

        const espnLineups = Array.isArray(summary?.rosters) ? summary.rosters : [];
        const lineupType = mapped?.status === "upcoming" ? "expected" : "official";
        const starters = espnLineups
          .map((block) => {
            const teamName = block?.team?.displayName || block?.team?.name || "";
            const teamLogo = normalizeTeamLogo(
              teamName,
              block?.team?.logo || block?.team?.logos?.[0]?.href || null,
              block?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(block.team.id))}.png` : null,
            );
            const players = [];
            const seen = new Set();

            const rosterArr = Array.isArray(block?.roster) ? block.roster : Object.values(block?.roster || {});
            for (const row of rosterArr) {
              const ath = row?.athlete || row || {};
              const id = String(ath?.id || row?.id || "");
              if (!id || seen.has(id)) continue;
              seen.add(id);
              const positionName = row?.position?.displayName || row?.position?.name || ath?.position?.displayName || ath?.position?.name || "";
              const position = row?.position?.abbreviation || ath?.position?.abbreviation || "";
              players.push({
                id,
                name: ath?.displayName || ath?.fullName || row?.displayName || "Onbekend",
                jersey: String(row?.jersey || ath?.jersey || "") || undefined,
                position,
                positionName,
                starter: Boolean(row?.starter),
                photo: normalizePlayerPhoto(
                  id,
                  ath?.headshot?.href,
                  /^\d+$/.test(id) ? `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png` : null,
                ),
              });
            }

            const startersOnly = players.filter((p) => p.starter !== false).slice(0, 11);

            return {
              team: teamName,
              teamLogo,
              formation: inferFormationFromPlayers(startersOnly),
              lineupType,
              players: startersOnly,
            };
          })
          .filter((t) => t.players.length > 0);

        for (const team of starters) {
          const valued = await enrichRosterMarketValues(team.players || [], team.team || "", mapped.league || espnLeague);
          team.players = await enrichRosterPhotos(valued, team.team || "");
        }

        const summaryStats = mapEspnSummaryStats(summary, home?.team?.id, away?.team?.id);

        const [withSofa] = await enrichMatchesWithSofaData([
          {
            ...mapped,
            homeTeamId: String(home?.team?.id || mapped.homeTeamId || ""),
            awayTeamId: String(away?.team?.id || mapped.awayTeamId || ""),
            venue: headerComp?.venue?.fullName || summary?.gameInfo?.venue?.fullName || "",
            city: headerComp?.venue?.address?.city || summary?.gameInfo?.venue?.address?.city || "",
            referee: summary?.gameInfo?.officials?.[0]?.displayName || "",
            round: summary?.header?.season?.type?.name || "",
            homeStats: summaryStats.homeStats,
            awayStats: summaryStats.awayStats,
            watchOptions,
            keyEvents: details,
            starters: espnLineups.length > 0 ? starters : [],
          },
        ], String(headerComp?.date || "").slice(0, 10));

        // SofaScore incident fallback: if ESPN returned no events, try SofaScore
        let mergedKeyEvents = withSofa?.keyEvents || details;
        if ((!mergedKeyEvents || mergedKeyEvents.length === 0) && withSofa?.sofaData?.id) {
          try {
            const sofaIncidents = await fetchSofaIncidents(withSofa.sofaData.id);
            if (sofaIncidents.length > 0) {
              mergedKeyEvents = sofaIncidents.map((inc) => ({
                ...inc,
                team: inc.team === "__HOME__" ? (mapped.homeTeam || "") : inc.team === "__AWAY__" ? (mapped.awayTeam || "") : inc.team,
              }));
              console.log(`[sofa] Fetched ${mergedKeyEvents.length} incidents for match ${matchId}`);
            }
          } catch { /* SofaScore incidents are best-effort */ }
        }

        // SofaScore stats fallback: if ESPN returned empty stats, try SofaScore
        let finalHomeStats = withSofa?.homeStats || {};
        let finalAwayStats = withSofa?.awayStats || {};
        const hasStats = Object.keys(finalHomeStats).length > 2 || Object.keys(finalAwayStats).length > 2;
        if (!hasStats && withSofa?.sofaData?.id) {
          try {
            const sofaStats = await fetchSofaStatistics(withSofa.sofaData.id);
            if (sofaStats) {
              finalHomeStats = { ...finalHomeStats, ...sofaStats.homeStats };
              finalAwayStats = { ...finalAwayStats, ...sofaStats.awayStats };
              console.log(`[sofa] Fetched stats fallback for match ${matchId}`);
            }
          } catch { /* SofaScore stats are best-effort */ }
        }

        // SofaScore lineups fallback: if ESPN returned no lineups, try SofaScore
        let finalStarters = withSofa?.starters || (espnLineups.length > 0 ? starters : []);
        if (finalStarters.length === 0 && withSofa?.sofaData?.id) {
          try {
            const sofaLineups = await fetchSofaLineups(withSofa.sofaData.id);
            if (sofaLineups && sofaLineups.length > 0) {
              finalStarters = sofaLineups;
              console.log(`[sofa] Fetched lineups fallback for match ${matchId}`);
            }
          } catch { /* SofaScore lineups are best-effort */ }
        }

        return finalizeMatchPayload({
          ...mapped,
          ...withSofa,
          homeTeamId: withSofa?.homeTeamId || String(home?.team?.id || mapped.homeTeamId || ""),
          awayTeamId: withSofa?.awayTeamId || String(away?.team?.id || mapped.awayTeamId || ""),
          venue: withSofa?.venue || headerComp?.venue?.fullName || summary?.gameInfo?.venue?.fullName || "",
          city: withSofa?.city || headerComp?.venue?.address?.city || summary?.gameInfo?.venue?.address?.city || "",
          referee: withSofa?.referee || summary?.gameInfo?.officials?.[0]?.displayName || "",
          round: withSofa?.round || summary?.header?.season?.type?.name || "",
          homeStats: finalHomeStats,
          awayStats: finalAwayStats,
          watchOptions: withSofa?.watchOptions || watchOptions,
          keyEvents: mergedKeyEvents,
          starters: finalStarters,
        });
      }

      if (footballSource() === "sportsrc") {
        const data = await footballApi(null, { type: "detail", id: matchId });
        return data?.data ?? data;
      }

      const [fixtureResp, statsResp, eventsResp, lineupsResp] = await Promise.all([
        footballApi(`/fixtures?id=${encodeURIComponent(matchId)}&timezone=${encodeURIComponent(TZ)}`),
        footballApi(`/fixtures/statistics?fixture=${encodeURIComponent(matchId)}`),
        footballApi(`/fixtures/events?fixture=${encodeURIComponent(matchId)}`),
        footballApi(`/fixtures/lineups?fixture=${encodeURIComponent(matchId)}`),
      ]);

      const fix = (fixtureResp?.response || [])[0];
      if (!fix) {
        const err = new Error("Match not found");
        err.statusCode = 404;
        throw err;
      }

      const mapped = mapFixtureToMatch(fix);

      const stats = statsResp?.response || [];
      const byTeamId = new Map(stats.map((s) => [String(s?.team?.id), s?.statistics || []]));
      const homeId = String(fix?.teams?.home?.id || "");
      const awayId = String(fix?.teams?.away?.id || "");

      const toStatsObj = (arr) => {
        const obj = {};
        for (const it of arr || []) {
          const key = String(it?.type || "")
            .toLowerCase()
            .replace(/\s+/g, "_");
          if (!key) continue;
          obj[key] = it?.value;
        }
        return obj;
      };

      const events = (eventsResp?.response || []).map((ev) => ({
        time: ev?.time?.elapsed ?? null,
        extra: ev?.time?.extra ?? null,
        team: ev?.team?.name || "",
        teamLogo: ev?.team?.logo || null,
        type: ev?.type || "",
        detail: ev?.detail || "",
        player: ev?.player?.name || "",
        assist: ev?.assist?.name || "",
      }));

      const lineups = lineupsResp?.response || [];
      const starters = lineups.map((lu) => ({
        team: lu?.team?.name || "",
        teamLogo: normalizeTeamLogo(lu?.team?.name || "", lu?.team?.logo || null),
        formation: lu?.formation || "",
        lineupType: mapped?.status === "upcoming" ? "expected" : "official",
        coach: lu?.coach?.name || "",
        players: (lu?.startXI || []).map((x) => {
          const p = x?.player || {};
          const id = String(p?.id || "");
          return {
            id,
            name: p?.name || "Onbekend",
            jersey: String(p?.number || "") || undefined,
            position: p?.pos || "",
            positionName: p?.pos || "",
            starter: true,
            photo: normalizePlayerPhoto(
              id,
              p?.photo,
            ),
          };
        }),
      }));

      for (const team of starters) {
        const valued = await enrichRosterMarketValues(team.players || [], team.team || "", mapped.league || espnLeague);
        team.players = await enrichRosterPhotos(valued, team.team || "");
      }

      const [withSofa] = await enrichMatchesWithSofaData([
        {
          ...mapped,
          homeTeamId: homeId,
          awayTeamId: awayId,
          venue: fix?.fixture?.venue?.name || "",
          city: fix?.fixture?.venue?.city || "",
          referee: fix?.fixture?.referee || "",
          round: fix?.league?.round || "",
          homeStats: toStatsObj(byTeamId.get(homeId)),
          awayStats: toStatsObj(byTeamId.get(awayId)),
          keyEvents: events,
          starters,
        },
      ], String(fix?.fixture?.date || "").slice(0, 10));

      return finalizeMatchPayload({
        ...mapped,
        ...withSofa,
        homeTeamId: withSofa?.homeTeamId || homeId,
        awayTeamId: withSofa?.awayTeamId || awayId,
        venue: withSofa?.venue || fix?.fixture?.venue?.name || "",
        city: withSofa?.city || fix?.fixture?.venue?.city || "",
        referee: withSofa?.referee || fix?.fixture?.referee || "",
        round: withSofa?.round || fix?.league?.round || "",
        homeStats: withSofa?.homeStats || toStatsObj(byTeamId.get(homeId)),
        awayStats: withSofa?.awayStats || toStatsObj(byTeamId.get(awayId)),
        keyEvents: withSofa?.keyEvents || events,
        starters: withSofa?.starters || starters,
      });
    });

    res.json(payload);
  } catch (e) {
    if (e?.statusCode === 429) {
      const stale = cacheGetStale(CACHE_KEY);
      if (stale) return res.status(200).json(stale);
    }
    res.status(200).json({ error: String(e?.message || e) });
  }
});

// ESPN standings helper
const ESPN_STANDINGS_BASE = "https://site.web.api.espn.com/apis/v2/sports/soccer";
const ESPN_SCORERS_BASE = "https://site.web.api.espn.com/apis/v2/sports/soccer";

const ESPN_LEAGUE_SLUGS = {
  "Premier League": "eng.1",
  Championship: "eng.2",
  "UEFA Champions League": "uefa.champions",
  "Champions League": "uefa.champions",
  "UEFA Europa League": "uefa.europa",
  "UEFA Conference League": "uefa.europa.conf",
  "La Liga": "esp.1",
  "La Liga 2": "esp.2",
  "Bundesliga": "ger.1",
  "2. Bundesliga": "ger.2",
  "Jupiler Pro League": "bel.1",
  "Challenger Pro League": "bel.2",
  "Ligue 1": "fra.1",
  "Ligue 2": "fra.2",
  "Serie A": "ita.1",
  "Serie B": "ita.2",
  Eredivisie: "ned.1",
  "Eerste Divisie": "ned.2",
  "Primeira Liga": "por.1",
  "Liga Portugal 2": "por.2",
  "Super Lig": "tur.1",
  "1. Lig": "tur.2",
};

async function fetchWithTimeout(fetchPromise, timeoutMs = 12000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
  );
  return Promise.race([fetchPromise, timeout]);
}

async function espnStandings(leagueName) {
  const slug = ESPN_LEAGUE_SLUGS[leagueName] || ESPN_LEAGUE_SLUGS[normalizeLeagueName(leagueName)] || leagueName;
  const base = `${ESPN_STANDINGS_BASE}/${slug}/standings`;
  // Try seasontype=1 (regular season) first — required for leagues like bel.1
  for (const st of [1, 2]) {
    const url = `${base}?seasontype=${st}`;
    const resp = await fetchWithTimeout(
      fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" } }),
      12000
    );
    if (!resp.ok) throw new Error(`ESPN standings ${resp.status}`);
    const data = await resp.json();
    // Check if this response has actual standings entries
    const groups = data?.children || [];
    const hasChildren = Array.isArray(groups) && groups[0]?.standings?.entries?.length > 0;
    const hasDirect = Array.isArray(data?.standings?.entries) && data.standings.entries.length > 0;
    if (hasChildren || hasDirect) return data;
    // seasontype=1 empty → try seasontype=2 (playoffs)
    console.log(`[standings] ${leagueName}: seasontype=${st} returned no entries, trying next`);
  }
  // If both empty, try without seasontype as final fallback
  const resp = await fetchWithTimeout(
    fetch(base, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" } }),
    12000
  );
  if (!resp.ok) throw new Error(`ESPN standings ${resp.status}`);
  return resp.json();
}

async function espnTopScorers(leagueName) {
  const slug = ESPN_LEAGUE_SLUGS[leagueName] || ESPN_LEAGUE_SLUGS[normalizeLeagueName(leagueName)] || leagueName;
  const url = `https://site.web.api.espn.com/apis/v2/sports/soccer/${slug}/leaders`;
  const resp = await fetchWithTimeout(
    fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" } }),
    12000
  );
  if (!resp.ok) throw new Error(`ESPN topscorers ${resp.status}`);
  return resp.json();
}

function mapEspnStandings(data) {
  try {
    const groups = data?.children || data?.standings?.entries || [];
    // ESPN standings can have nested groups (e.g. for Champions League)
    let entries = [];
    if (Array.isArray(groups) && groups[0]?.standings?.entries) {
      // Multiple groups (group stage etc.)
      for (const g of groups) {
        entries.push(...(g?.standings?.entries || []));
      }
    } else if (Array.isArray(data?.standings?.entries)) {
      entries = data.standings.entries;
    }
    return entries.map((entry, idx) => {
      const team = entry?.team || {};
      const stats = {};
      for (const s of entry?.stats || []) {
        stats[s.name] = s.value;
      }
      return {
        rank: entry?.rank ?? idx + 1,
        team: team.displayName || team.name || "",
        logo: normalizeTeamLogo(
          team.displayName || team.name || "",
          team.logos?.[0]?.href || team.logo || null,
          team.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(team.id))}.png` : null,
        ),
        teamId: String(team.id || ""),
        played: stats.gamesPlayed ?? stats.played ?? 0,
        wins: stats.wins ?? 0,
        draws: stats.ties ?? stats.draws ?? 0,
        losses: stats.losses ?? 0,
        goalsFor: stats.pointsFor ?? stats.goalsFor ?? 0,
        goalsAgainst: stats.pointsAgainst ?? stats.goalsAgainst ?? 0,
        goalDiff: stats.pointDifferential ?? stats.goalDiff ?? 0,
        points: stats.points ?? 0,
      };
    });
  } catch {
    return [];
  }
}

function mapEspnTopScorers(data) {
  try {
    // ESPN leaders endpoint: data.leaders[] -> { displayName, leaders[] -> { athlete, statistics } }
    const goalLeaders = (data?.leaders || []).find(
      l => l.name === "goals" || l.displayName?.toLowerCase().includes("goal") || l.abbreviation === "G"
    );
    if (!goalLeaders) return [];
    return (goalLeaders.leaders || []).map((entry, idx) => {
      const ath = entry?.athlete || {};
      const athleteId = String(ath?.id || "");
      return {
        rank: idx + 1,
        id: athleteId,
        name: ath.displayName || ath.fullName || "",
        photo: normalizePlayerPhoto(athleteId, ath.headshot?.href, athleteId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(athleteId)}.png` : null),
        team: ath.team?.displayName || ath.team?.name || "",
        teamId: String(ath?.team?.id || ""),
        teamLogo: normalizeTeamLogo(
          ath.team?.displayName || ath.team?.name || "",
          ath.team?.logos?.[0]?.href || ath.team?.logo || null,
          ath.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(ath.team.id))}.png` : null,
        ),
        goals: entry?.value ?? 0,
        displayValue: String(entry?.displayValue ?? entry?.value ?? 0),
        stat: "Goals",
      };
    });
  } catch {
    return [];
  }
}

const ESPN_STATS_LEAGUE_CODES = {
  "Premier League": "ENG.1",
  Championship: "ENG.2",
  "FA Cup": "ENG.FA",
  "UEFA Champions League": "UEFA.CHAMPIONS",
  "Champions League": "UEFA.CHAMPIONS",
  "UEFA Europa League": "UEFA.EUROPA",
  "UEFA Conference League": "UEFA.EUROPA.CONF",
  "La Liga": "ESP.1",
  "La Liga 2": "ESP.2",
  "Copa del Rey": "ESP.COPA_DEL_REY",
  "Bundesliga": "GER.1",
  "2. Bundesliga": "GER.2",
  "DFB Pokal": "GER.DFB_POKAL",
  "Jupiler Pro League": "BEL.1",
  "Challenger Pro League": "BEL.2",
  "Belgian Cup": "BEL.CUP",
  "Ligue 1": "FRA.1",
  "Ligue 2": "FRA.2",
  "Coupe de France": "FRA.COUPE_DE_FRANCE",
  "Serie A": "ITA.1",
  "Serie B": "ITA.2",
  "Coppa Italia": "ITA.COPPA_ITALIA",
  Eredivisie: "NED.1",
  "Eerste Divisie": "NED.2",
  "KNVB Beker": "NED.KNVB_BEKER",
  "Primeira Liga": "POR.1",
  "Liga Portugal 2": "POR.2",
  "Taca de Portugal": "POR.TACA_DE_PORTUGAL",
  "Super Lig": "TUR.1",
  "1. Lig": "TUR.2",
  "Turkish Cup": "TUR.TURKISH_CUP",
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function espnTopScorersFromHtml(leagueName) {
  const code = ESPN_STATS_LEAGUE_CODES[leagueName]
    || ESPN_STATS_LEAGUE_CODES[normalizeLeagueName(leagueName)]
    || leagueName.toUpperCase(); // fallback: eng.1 → ENG.1

  const url = `https://www.espn.com/soccer/stats/_/league/${encodeURIComponent(code)}`;
  const resp = await fetchWithTimeout(
    fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "text/html" } }),
    12000
  );
  if (!resp.ok) throw new Error(`ESPN stats html ${resp.status}`);
  const html = await resp.text();

  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const row = tr[1] || "";
    if (!row.includes("/soccer/player/_/id/")) continue;

    const playerMatch = row.match(/\/soccer\/player\/_\/id\/(\d+)\/[^\"]*\">([^<]+)<\/a>/i);
    const teamMatch = row.match(/\/soccer\/club\/_\/id\/(\d+)\/[^\"]*\">([^<]+)<\/a>/i);
    const goalsMatches = Array.from(row.matchAll(/<td class=\"tar Table__TD\"><span class=\"tar\">(\d+)<\/span><\/td>/gi));
    const rankMatch = row.match(/<td class=\"Table__TD\">(\d+)<\/td>/i);

    if (!playerMatch || goalsMatches.length === 0) continue;

    const athleteId = String(playerMatch[1] || "");
    const name = decodeHtml(playerMatch[2]);
    const teamName = decodeHtml(teamMatch?.[2] || "");
    const goals = Number(goalsMatches[goalsMatches.length - 1]?.[1] || 0);
    const rank = Number(rankMatch?.[1] || rows.length + 1);

    rows.push({
      rank,
      name,
      photo: athleteId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(athleteId)}.png` : null,
      team: teamName,
      teamLogo: null,
      goals,
      displayValue: String(goals),
      stat: "Goals",
    });
  }

  return rows.slice(0, 30);
}

// Standings: app calls /api/sports/standings/:league (league is human string)
app.get("/api/sports/standings/:league", async (req, res) => {
  const leagueName = normalizeLeagueName(decodeURIComponent(req.params.league));
  const leagueId = LEAGUE_IDS[leagueName];
  const season = seasonForDate(new Date());
  const seasonLabel = formatSeasonLabel(season);
  const key = `standings_${leagueName}_${season}`;

  try {
    const payload = await getOrFetch(key, 6 * 60_000, async () => {
      // 1) Try ESPN first (no key needed)
      try {
        const espnData = await espnStandings(leagueName);
        let standings = mapEspnStandings(espnData);
        if (standings.length > 0) {
          standings = await enrichStandingsLogos(standings, leagueName);
          console.log(`[standings] ${leagueName}: ESPN → ${standings.length} teams (logos enriched)`);
          return { league: leagueName, season, seasonLabel, standings, source: "espn" };
        }
      } catch (e) {
        console.warn(`[standings] ESPN failed for ${leagueName}: ${e.message}`);
      }

      if (!leagueId) {
        return { league: leagueName, season, seasonLabel, standings: [], error: "League niet gevonden" };
      }
      return { league: leagueName, season, seasonLabel, standings: [], source: "espn", error: "Standings tijdelijk niet beschikbaar via ESPN" };
    });
    res.json(payload);
  } catch (e) {
    console.error(`[standings] Error for ${leagueName}:`, e.message);
    res.status(200).json({ league: leagueName, season, seasonLabel, standings: [], error: String(e?.message || e) });
  }
});

// Top scorers
app.get("/api/sports/topscorers/:league", async (req, res) => {
  const leagueName = normalizeLeagueName(decodeURIComponent(req.params.league));
  const leagueId = LEAGUE_IDS[leagueName];
  const season = seasonForDate(new Date());
  const seasonLabel = formatSeasonLabel(season);
  const key = `topscorers_${leagueName}_${season}`;

  try {
    const payload = await getOrFetch(key, 6 * 60_000, async () => {
      // 1) ESPN first
      try {
        const espnData = await espnTopScorers(leagueName);
        let scorers = mapEspnTopScorers(espnData);
        if (scorers.length > 0) {
          // Enrich team logos via Football-logos + TheSportsDB
          scorers = await enrichScorersLogos(scorers, leagueName);
          console.log(`[topscorers] ${leagueName}: ESPN → ${scorers.length} scorers`);
          // Enrich scorer photos (Transfermarkt + TheSportsDB + Wikipedia + fallbacks)
          scorers = await enrichScorersPhotos(scorers, leagueName);
          return { league: leagueName, season, seasonLabel, scorers, source: "espn" };
        }
      } catch (e) {
        console.warn(`[topscorers] ESPN failed for ${leagueName}: ${e.message}`);
      }

      // 1b) ESPN HTML fallback (no key)
      try {
        let htmlScorers = await espnTopScorersFromHtml(leagueName);
        if (htmlScorers.length > 0) {
          htmlScorers = await enrichScorersLogos(htmlScorers, leagueName);
          console.log(`[topscorers] ${leagueName}: ESPN HTML → ${htmlScorers.length} scorers`);
          htmlScorers = await enrichScorersPhotos(htmlScorers, leagueName);
          return { league: leagueName, season, seasonLabel, scorers: htmlScorers, source: "espn-html" };
        }
      } catch (e) {
        console.warn(`[topscorers] ESPN HTML failed for ${leagueName}: ${e.message}`);
      }

      if (!leagueId) {
        return { league: leagueName, season, seasonLabel, scorers: [], error: "League niet gevonden" };
      }
      return { league: leagueName, season, seasonLabel, scorers: [], source: "espn", error: "Topscorers tijdelijk niet beschikbaar via ESPN" };
    });
    res.json(payload);
  } catch (e) {
    console.error(`[topscorers] Error for ${leagueName}:`, e.message);
    res.status(200).json({ league: leagueName, season, seasonLabel, scorers: [], error: String(e?.message || e) });
  }
});

// Competition matches (current round + nearby weeks for a specific competition)
async function espnLeagueMatches(leagueName, wideRange = false) {
  const baseUrl = ESPN_LEAGUE_SCOREBOARDS[leagueName];
  if (!baseUrl) return [];
  const leagueSlug = String(baseUrl.match(/\/soccer\/([^/]+)\/scoreboard/)?.[1] || "");
  const now = new Date();
  // Build a set of date strings: current + date offsets
  const dateStrs = [""];
  const offsets = wideRange ? [-28, -21, -14, -7, 7, 14, 21, 28] : [-14, -7, 7, 14];
  for (const offsetDays of offsets) {
    const d = new Date(now.getTime() + offsetDays * 86400000);
    dateStrs.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  const seen = new Set();
  const allEvents = [];
  await Promise.allSettled(
    dateStrs.map(async (dateStr) => {
      const url = dateStr ? `${baseUrl}?dates=${dateStr}&limit=20` : `${baseUrl}?limit=50`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const resp = await fetch(url, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", "accept": "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return;
        const data = await resp.json();
        for (const ev of (data?.events || [])) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id);
            allEvents.push({ ...ev, _leagueHint: leagueName, _espnLeagueHint: leagueSlug });
          }
        }
      } catch { clearTimeout(timer); }
    })
  );
  return allEvents;
}

app.get("/api/sports/competition-matches/:league", async (req, res) => {
  const leagueName = normalizeLeagueName(decodeURIComponent(req.params.league));
  const key = `comp_matches_${leagueName}`;
  try {
    const payload = await getOrFetch(key, 5 * 60_000, async () => {
      const events = await espnLeagueMatches(leagueName, true);
      const matchesRaw = events.map(mapEspnEventToMatch);
      const enrichedLogos = await enrichMatchLogos(matchesRaw);
      const matches = await enrichMatchesWithSofaData(enrichedLogos);
      const now = Date.now();
      // Sort: upcoming / live first, then recent finished
      matches.sort((a, b) => {
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        const aFuture = da >= now;
        const bFuture = db >= now;
        if (aFuture && !bFuture) return -1;
        if (!aFuture && bFuture) return 1;
        return aFuture ? da - db : db - da; // upcoming: soonest first; finished: most recent first
      });
      console.log(`[comp-matches] ${leagueName}: ${matches.length} matches`);
      return { league: leagueName, matches, source: "espn" };
    });
    res.json(payload);
  } catch (e) {
    console.error(`[comp-matches] Error for ${leagueName}:`, e.message);
    res.status(200).json({ league: leagueName, matches: [], error: String(e?.message || e) });
  }
});

// Competition teams list
app.get("/api/sports/competition-teams/:league", async (req, res) => {
  const leagueName = normalizeLeagueName(decodeURIComponent(req.params.league));
  const espnSlug = ESPN_LEAGUE_SLUGS[leagueName];
  if (!espnSlug) {
    return res.json({ league: leagueName, teams: [], error: "Unknown league" });
  }
  const key = `comp_teams_${leagueName}`;
  try {
    const payload = await getOrFetch(key, 10 * 60_000, async () => {
      const resp = await fetchWithTimeout(
        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espnSlug)}/teams`, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        }),
        15000
      );
      const json = resp.ok ? await resp.json() : {};
      const rawTeams = json?.sports?.[0]?.leagues?.[0]?.teams || json?.teams || [];
      const teams = rawTeams.map((entry) => {
        const t = entry?.team || entry;
        return {
          id: String(t?.id || ""),
          name: t?.displayName || t?.name || "",
          abbreviation: t?.abbreviation || "",
          logo: t?.logos?.[0]?.href || t?.logo || "",
          color: t?.color ? `#${t.color}` : null,
        };
      }).filter(t => t.id && t.name);
      teams.sort((a, b) => a.name.localeCompare(b.name));
      console.log(`[comp-teams] ${leagueName}: ${teams.length} teams`);
      return { league: leagueName, teams, source: "espn" };
    });
    res.json(payload);
  } catch (e) {
    console.error(`[comp-teams] Error for ${leagueName}:`, e.message);
    res.status(200).json({ league: leagueName, teams: [], error: String(e?.message || e) });
  }
});

// Team detail
app.get("/api/sports/team/:teamId", async (req, res) => {
  const teamId = String(req.params.teamId);
  const espnLeague = String(req.query?.league || "eng.1");
  const teamNameFromQuery = String(req.query?.teamName || "").trim();
  const season = seasonForDate(new Date());
  const key = `team_${teamId}_${season}_${espnLeague}`;

  try {
    const payload = await getOrFetch(key, 1_800_000, async () => {
      let resolvedTeamId = teamId;

      // National team ID mapping — verified ESPN IDs from fifa.world/teams
      const NATIONAL_TEAM_IDS = {
        algeria: "624", argentina: "202", australia: "628", austria: "474",
        belgium: "459", brazil: "205", canada: "206", colombia: "208",
        croatia: "477", ecuador: "209", egypt: "2620", england: "448",
        france: "478", germany: "481", ghana: "4469", "ir iran": "469",
        "ivory coast": "4789", japan: "627", jordan: "2917", mexico: "203",
        morocco: "2869", netherlands: "449", "new zealand": "2666", norway: "464",
        panama: "2659", paraguay: "210", portugal: "482", qatar: "4398",
        "saudi arabia": "655", scotland: "580", senegal: "654", "south africa": "467",
        "south korea": "451", spain: "164", switzerland: "475", tunisia: "659",
        "united states": "660", usa: "660", uruguay: "212", uzbekistan: "2570",
        italy: "162", wales: "7825", poland: "7820", denmark: "376",
        sweden: "7824", ukraine: "7827", turkey: "10010", "czech republic": "7802",
        romania: "7822", serbia: "8723", chile: "207", cameroon: "656",
        nigeria: "657", ireland: "8702",
      };

      if (teamId.startsWith("name:")) {
        const rawName = decodeURIComponent(teamId.replace(/^name:/, "")).toLowerCase();

        // Try direct national team ID mapping first
        const nationalId = NATIONAL_TEAM_IDS[rawName];
        if (nationalId && espnLeague.includes("fifa")) {
          resolvedTeamId = nationalId;
        } else {
          // Fallback: search teams list
          const teamsResp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espnLeague)}/teams`, {
            headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          const teamsJson = teamsResp.ok ? await teamsResp.json() : {};
          const teams = teamsJson?.sports?.[0]?.leagues?.[0]?.teams || teamsJson?.teams || [];
          const found = teams
            .map((t) => t?.team || t)
            .find((t) => {
              const n = String(t?.displayName || t?.name || "").toLowerCase();
              return n === rawName || n.includes(rawName) || rawName.includes(n);
            });
          if (found?.id) resolvedTeamId = String(found.id);
        }
      }

      // If name: resolution failed completely, try dynamic lookup on fifa.world
      if (resolvedTeamId.startsWith("name:") && espnLeague.includes("fifa")) {
        const rawName = decodeURIComponent(resolvedTeamId.replace(/^name:/, "")).toLowerCase();
        try {
          const fallbackResp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams`, {
            headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          const fallbackJson = fallbackResp.ok ? await fallbackResp.json() : {};
          const fallbackTeams = fallbackJson?.sports?.[0]?.leagues?.[0]?.teams || fallbackJson?.teams || [];
          const match = fallbackTeams.map((t) => t?.team || t).find((t) => {
            const n = String(t?.displayName || t?.name || "").toLowerCase();
            return n === rawName || n.includes(rawName) || rawName.includes(n);
          });
          if (match?.id) resolvedTeamId = String(match.id);
        } catch {}
      }

      // For national teams, try multiple league contexts for roster data
      const leagueVariants = espnLeague.includes("fifa") ? [espnLeague, "fifa.friendly", "uefa.nations", "uefa.euro"] : [espnLeague];

      let teamJson = {};
      let rosterJson = {};
      for (const leagueSlug of leagueVariants) {
        const [teamResp, rosterResp] = await Promise.all([
          fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueSlug)}/teams/${encodeURIComponent(resolvedTeamId)}`, {
            headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }),
          fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueSlug)}/teams/${encodeURIComponent(resolvedTeamId)}/roster`, {
            headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }),
        ]);
        teamJson = teamResp.ok ? await teamResp.json() : {};
        rosterJson = rosterResp.ok ? await rosterResp.json() : {};
        // If we got team data, stop trying variants
        if (teamJson?.team?.id || teamJson?.team?.displayName) break;
      }
      const team = teamJson?.team || {};

      const flattenAthletes = (input) => {
        if (!input) return [];
        if (Array.isArray(input)) {
          return input.flatMap((item) => {
            if (!item) return [];
            if (item?.athlete) return [item.athlete];
            if (item?.items && Array.isArray(item.items)) return flattenAthletes(item.items);
            if (item?.athletes && Array.isArray(item.athletes)) return flattenAthletes(item.athletes);
            if (item?.displayName || item?.fullName || item?.id) return [item];
            return [];
          });
        }
        return [];
      };

      const athletes = flattenAthletes(rosterJson?.athletes || rosterJson?.groups || rosterJson?.items || []);
      const dedup = new Map();
      for (const player of athletes) {
        const mapped = mapEspnRosterPlayer(player);
        if (!mapped?.name) continue;
        const id = String(mapped.id || mapped.name);
        if (!dedup.has(id)) dedup.set(id, mapped);
      }
      const players = Array.from(dedup.values());

      // Build basic team response first (fast) — enrichment runs with a deadline
      const teamDisplayName = team?.displayName || team?.name || teamNameFromQuery || "";
      const isNationalTeam = espnLeague.includes("fifa") || /teamlogos\/countries/i.test(String(team?.logos?.[0]?.href || ""));
      const espnLogo = team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(team.id))}.png` : null;
      const rawTeamLogo = team?.logos?.[0]?.href || team?.logo || null;
      const footballLogosUrl = resolveFootballLogosUrl(teamDisplayName, normalizeLeagueName(espnLeague) || "");

      // Run enrichment + logo resolution with a shorter deadline so screens render fast.
      const ENRICH_DEADLINE = 12_000;
      const enrichResult = await Promise.race([
        (async () => {
          const [valuedPlayers, photoPlayers, sportsDbLogo] = await Promise.all([
            Promise.race([
              enrichRosterMarketValues(players, teamDisplayName, espnLeague),
              new Promise((resolve) => setTimeout(() => resolve(players), 4000)),
            ]),
            Promise.race([
              enrichRosterPhotos(players, teamDisplayName),
              new Promise((resolve) => setTimeout(() => resolve(players), 8000)),
            ]),
            fetchTheSportsDBTeamLogo(teamDisplayName),
          ]);
          const valueMap = new Map((valuedPlayers || []).map((player) => [String(player?.id || player?.name || ""), player]));
          const enrichedPlayers = (photoPlayers || players).map((player) => {
            const playerKey = String(player?.id || player?.name || "");
            const valued = valueMap.get(playerKey);
            return valued ? { ...valued, ...player, photo: player?.photo || valued?.photo || null } : player;
          });
          // Reuse TM data from enrichRosterMarketValues cache (already fetched and cached during enrichment)
          const tmClubData = cacheGet(`transfermarkt_club_${normalizePersonName(teamDisplayName)}`);
          const clubMarketValue = tmClubData?._clubMarketValue || null;
          const resolvedLogo = isNationalTeam
            ? normalizeTeamLogo(teamDisplayName, footballLogosUrl, sportsDbLogo, rawTeamLogo, espnLogo)
            : normalizeTeamLogo(teamDisplayName, footballLogosUrl, rawTeamLogo, espnLogo, sportsDbLogo);
          return { enrichedPlayers, squadMarketValue: clubMarketValue ? formatEURShort(clubMarketValue) : null, resolvedLogo };
        })(),
        new Promise((resolve) => setTimeout(() => resolve(null), ENRICH_DEADLINE)),
      ]);

      // If enrichment timed out, use basic player data and ESPN logo
      const finalPlayers = enrichResult?.enrichedPlayers ?? players;
      const squadValue = enrichResult?.squadMarketValue ?? null;
      const resolvedLogo = enrichResult?.resolvedLogo ?? (rawTeamLogo || espnLogo || footballLogosUrl || null);

      return {
        id: String(team?.id || resolvedTeamId || ""),
        name: teamDisplayName || "Team",
        shortName: team?.abbreviation || team?.shortDisplayName || "",
        logo: resolvedLogo,
        color: (() => {
          const raw = String(team?.color || "").replace("#", "");
          if (!/^[0-9a-fA-F]{3,8}$/.test(raw)) return "#1a3a6b";
          const hex = raw.length === 3 ? raw.split("").map(c => c + c).join("") : raw.slice(0, 6);
          const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
          const lum = (0.299 * r + 0.587 * g + 0.114 * b);
          if (lum > 220) return "#1a3a6b"; // too bright (e.g. #ffffff)
          if (lum < 25) return "#1a3a6b";  // too dark (e.g. #000000)
          return `#${hex}`;
        })(),
        leagueName: rosterJson?.team?.links?.[0]?.text || espnLeague,
        leagueRank: undefined,
        leaguePoints: undefined,
        leaguePlayed: undefined,
        venue: team?.venue?.fullName || team?.venue?.name || "",
        coach: team?.staff?.[0]?.displayName || "",
        record: "",
        squadMarketValue: squadValue,
        players: finalPlayers,
        source: "espn",
      };
    });

    res.json(payload);
  } catch (e) {
    console.error(`[team-detail] Error for ${teamId}:`, e.message);
    res.status(200).json({ id: "", name: teamNameFromQuery || "Team", logo: null, color: "#151515", players: [], error: String(e?.message || e) });
  }
});

app.get("/api/sports/player/:playerId", async (req, res) => {
  const playerId = String(req.params.playerId || "").trim();
  const playerName = String(req.query?.name || "").trim();
  const teamName = String(req.query?.team || "").trim();
  const espnLeague = String(req.query?.league || "eng.1");
  const cacheKey = `player_profile_${playerId}_${playerName}_${teamName}_${espnLeague}`;

  try {
    const payload = await getOrFetch(cacheKey, 600_000, async () => {
      let espnAthlete = null;
      let espnTeam = null;

      if (playerId) {
        try {
          const athleteResp = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${encodeURIComponent(espnLeague)}/athletes/${encodeURIComponent(playerId)}`, {
            headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
          });
          if (athleteResp.ok) {
            const athleteJson = await athleteResp.json();
            espnAthlete = athleteJson?.athlete || athleteJson || null;
            espnTeam = athleteJson?.team || athleteJson?.athlete?.team || null;
          }
        } catch {
          espnAthlete = null;
        }
      }

      const apiSports = null;
      const apifyFallback = await fetchApifyPlayerFallback(
        playerId,
        playerName || espnAthlete?.displayName || espnAthlete?.fullName,
        teamName || espnTeam?.displayName || espnTeam?.name
      );

      const profile = apiSports?.profile?.player || {};
      const profileStats = apiSports?.profile?.statistics?.[0] || {};

      const name =
        profile?.name ||
        espnAthlete?.displayName ||
        espnAthlete?.fullName ||
        playerName ||
        "Onbekend";

      const normalizedPlayer = {
        id: String(profile?.id || espnAthlete?.id || playerId || ""),
        name,
        age: Number(profile?.age || espnAthlete?.age || apifyFallback?.age || 0) || undefined,
        nationality: profile?.nationality || espnAthlete?.citizenship || espnAthlete?.birthCountry || apifyFallback?.nationality || undefined,
        position:
          profileStats?.games?.position ||
          espnAthlete?.position?.abbreviation ||
          espnAthlete?.position?.name ||
          apifyFallback?.position ||
          "",
      };

      const valuedFromModel = (await enrichRosterMarketValues([normalizedPlayer], teamName || profileStats?.team?.name || espnTeam?.displayName || "", espnLeague))[0] || normalizedPlayer;

      // Direct Transfermarkt player search – better accuracy for individual profiles
      const tmDirect = await fetchTransfermarktPlayerDirect(name, teamName || espnTeam?.displayName || "");

      let valued = valuedFromModel;
      // Prefer direct Transfermarkt value over club-based fuzzy or estimated
      if (tmDirect?.marketValueEur && (!valued?.isRealValue || valued?.valueMethod === "estimated")) {
        valued = {
          ...valued,
          marketValue: formatEURShort(tmDirect.marketValueEur),
          isRealValue: true,
          valueMethod: "transfermarkt-direct",
        };
      } else if (apifyFallback?.marketValue && !valued?.marketValue) {
        valued = {
          ...valued,
          marketValue: apifyFallback.marketValue,
          isRealValue: true,
          valueMethod: "apify-transfermarkt",
        };
      }

      const fallbackInsights = inferStrengthsWeaknesses(valued?.position, valued?.age);

      // Club history: prefer Transfermarkt direct transfers > API-Sports > Apify
      const tmTransfers = tmDirect?.transfers || [];
      const apiSportsTransfers = mapFormerClubs(apiSports?.transfers || []);
      const apifyTransfers = apifyFallback?.formerClubs || [];
      const formerClubs = tmTransfers.length ? tmTransfers : (apiSportsTransfers.length ? apiSportsTransfers : apifyTransfers);

      const aiInsights = await aiAnalyzePlayerProfile(
        {
          ...valued,
          currentClub: profileStats?.team?.name || espnTeam?.displayName || espnTeam?.name || teamName || apifyFallback?.team || null,
          formerClubs,
        },
        {
          league: espnLeague,
          source: apifyFallback?.source || apiSports?.source || "espn",
        }
      );

      const sourceTag = apifyFallback?.source || apiSports?.source || "espn";

      const clubName = profileStats?.team?.name || espnTeam?.displayName || espnTeam?.name || teamName || apifyFallback?.team || "";
      const basePhoto = normalizePlayerPhoto(
        valued?.id,
        profile?.photo,
        apifyFallback?.photo,
        espnAthlete?.headshot?.href,
      );
      // Transfermarkt direct photo as early fallback
      let resolvedPhoto = basePhoto || (tmDirect?.photo || null);
      // Transfermarkt club-based photo lookup
      if (!resolvedPhoto && clubName) {
        const tmPlayers = await fetchTransfermarktClubPlayers(clubName);
        if (Array.isArray(tmPlayers)) {
          const normName = normalizePersonName(name || "");
          for (const p of tmPlayers) {
            if (p.photo && (p.name === normName || similarityScore(normName, p.name) >= 0.5)) {
              resolvedPhoto = p.photo;
              break;
            }
          }
        }
      }
      if (!resolvedPhoto && clubName) {
        const dbPlayers = await fetchTheSportsDBTeamPlayers(clubName);
        const normName = normalizePersonName(name || "");
        for (const dbp of dbPlayers) {
          if (dbp.name === normName || similarityScore(normName, dbp.name) >= 0.5) {
            resolvedPhoto = dbp.photo;
            break;
          }
        }
      }
      // Final fallback: Wikipedia
      if (!resolvedPhoto && name && name !== "Onbekend") {
        resolvedPhoto = await fetchWikipediaPlayerPhoto(name) || null;
      }
      // AI-assisted Wikipedia title resolution via Gemini
      if (!resolvedPhoto && name && name !== "Onbekend") {
        try {
          const aiMap = await resolvePlayerPhotosViaAI(
            [{ name, nationality: espnAthlete?.citizenship || "", position: position || "" }],
            clubName || ""
          );
          if (aiMap.size > 0) resolvedPhoto = aiMap.values().next().value || null;
        } catch { /* ignore */ }
      }
      // TheSportsDB individual search fallback
      if (!resolvedPhoto && name && name !== "Onbekend") {
        try {
          const tsdbCacheKey = `tsdb_player_${normalizePersonName(name)}`;
          let tsdbPhoto = cacheGet(tsdbCacheKey);
          if (tsdbPhoto === null) {
            const normName = normalizePersonName(name);
            // Try full name first, then surname only
            const searchQueries = [name];
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) searchQueries.push(parts[parts.length - 1]);
            for (const q of searchQueries) {
              if (tsdbPhoto) break;
              const tsdbResp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(q)}`, {
                headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
                signal: AbortSignal.timeout(4000),
              });
              if (!tsdbResp.ok) continue;
              const tsdbData = await tsdbResp.json();
              const results = Array.isArray(tsdbData?.player) ? tsdbData.player : [];
              for (const r of results) {
                const rName = normalizePersonName(r?.strPlayer || "");
                const photo = r?.strCutout || r?.strThumb || r?.strRender || null;
                if (photo && /^https?:\/\//i.test(photo) && similarityScore(normName, rName) >= 0.45) {
                  tsdbPhoto = photo;
                  break;
                }
              }
            }
            cacheSet(tsdbCacheKey, tsdbPhoto || null, 86_400_000);
          }
          if (tsdbPhoto) resolvedPhoto = tsdbPhoto;
        } catch { /* ignore */ }
      }
      // ESPN CDN headshot fallback (validated — skip black placeholders)
      const espnPlayerId = String(espnAthlete?.id || valued?.id || "");
      if (!resolvedPhoto && espnPlayerId && /^\d+$/.test(espnPlayerId)) {
        const espnUrl = `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(espnPlayerId)}.png`;
        const validated = await validateEspnHeadshot(espnUrl);
        if (validated) resolvedPhoto = validated;
      }
      // Gemini AI Wikipedia photo lookup
      if (!resolvedPhoto && name && name !== "Onbekend") {
        try {
          const aiMap = await resolvePlayerPhotosViaAI([{ name, nationality: valued?.nationality, position: valued?.position }], clubName);
          const aiPhoto = aiMap.get(name);
          if (aiPhoto) resolvedPhoto = aiPhoto;
        } catch { /* ignore */ }
      }
      // UI Avatars guaranteed fallback
      if (!resolvedPhoto && name && name !== "Onbekend") {
        resolvedPhoto = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=1a1a2e&color=e0e0e0&bold=true&format=png`;
      }
      const baseClubLogo = normalizeTeamLogo(
        clubName,
        profileStats?.team?.logo || espnTeam?.logo || espnTeam?.logos?.[0]?.href || apifyFallback?.teamLogo || null
      );
      const resolvedClubLogo = baseClubLogo || await fetchTheSportsDBTeamLogo(clubName) || await fetchWikipediaTeamLogo(clubName) || null;

      return {
        id: String(valued?.id || ""),
        name: valued?.name || name,
        photo: resolvedPhoto,
        age: valued?.age,
        birthDate: profile?.dateOfBirth || espnAthlete?.dateOfBirth || apifyFallback?.birthDate || null,
        nationality: valued?.nationality,
        position: valued?.position,
        height: toMetersStringFromAny(profile?.height || espnAthlete?.displayHeight || espnAthlete?.height || apifyFallback?.height),
        weight: toKgStringFromAny(profile?.weight || espnAthlete?.displayWeight || espnAthlete?.weight || apifyFallback?.weight),
        currentClub: clubName || null,
        currentClubLogo: resolvedClubLogo,
        formerClubs,
        marketValue: valued?.marketValue || null,
        isRealValue: Boolean(valued?.isRealValue),
        valueMethod: valued?.valueMethod || "estimated",
        strengths: aiInsights?.strengths?.length ? aiInsights.strengths : fallbackInsights.strengths,
        weaknesses: aiInsights?.weaknesses?.length ? aiInsights.weaknesses : fallbackInsights.weaknesses,
        analysis:
          aiInsights?.summary ||
          `${name} (${valued?.position || "Speler"}) wordt beoordeeld op actuele profieldata, positie-eisen en recente context van club/rol.`,
        source: aiInsights ? `${sourceTag}+ai` : `${sourceTag}+deterministic`,
        updatedAt: new Date().toISOString(),
      };
    });

    res.json(payload);
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
});

// AI predict endpoint used by app
app.post("/api/sports/predict", async (req, res) => {
  try {
    const prediction = await aiPredictMatch(req.body || {});
    res.json(prediction);
  } catch (e) {
    // still respond 200 so UI doesn't spin forever
    res.status(200).json({ prediction: null, error: String(e?.message || e), code: Number(e?.statusCode || 500) });
  }
});

app.get("/api/sports/stream/:matchId", async (req, res) => {
  try {
    const matchId = String(req.params.matchId || "").trim();
    const league = String(req.query?.league || "eng.1").trim() || "eng.1";
    if (!matchId) return res.status(400).json({ error: "Missing matchId" });
    const resolved = await resolveBestStreamCandidate(matchId, { league });
    return res.json({
      matchId,
      league,
      url: resolved.url,
      candidates: resolved.candidates,
      officialOptions: resolved.officialOptions,
      source: resolved.source,
    });
  } catch (e) {
    return res.status(200).json({ matchId: String(req.params.matchId || ""), url: buildStreamCandidates(String(req.params.matchId || ""))[0], source: "fallback", error: String(e?.message || e) });
  }
});

// -----------------------------
// M3U playlist parsing endpoints
// -----------------------------

function classifyCategory(group, url, name) {
  // 1. Xtream Codes URL path patterns (most reliable)
  const urlStr = String(url || "");
  if (/\/live\//.test(urlStr)) return "live";
  if (/\/movie\//.test(urlStr)) return "movie";
  if (/\/series\//.test(urlStr)) return "series";

  const g = String(group || "").toLowerCase();

  // 2. Series group detection (check before movies — many providers put series in VOD groups)
  if (/\bseries?\b|\bserie\b|seizoen|season|tv.?show|episode|tvshow|sitcom|docu.?series|mini.?series/i.test(g) ||
      g.includes("tv shows") || g.includes("show")) return "series";

  // 3. Name-based series detection (S01E01, Season 1, Episode 3, etc.)
  const n = String(name || "");
  if (
    /\bS\d{1,2}\s*E\d{1,3}\b/i.test(n) ||
    /\bSeason\s+\d/i.test(n) ||
    /\bSeizoen\s+\d/i.test(n) ||
    /\bSaison\s+\d/i.test(n) ||
    /\bStaffel\s+\d/i.test(n) ||
    /\bEp\.?\s*\d{1,3}\b/i.test(n) ||
    /\bEpisode\s+\d/i.test(n) ||
    /\bAfl\.?\s*\d/i.test(n) ||
    /\bTemporada\s+\d/i.test(n) ||
    /\b\d{1,2}x\d{2,3}\b/.test(n)
  ) return "series";

  // 4. Movie group detection
  if (g.includes("movie") || g.includes("film") || g.includes("vod") || g.includes("cinema") ||
      g.includes("bioscoop") || g.includes("spielfilm") || g.includes("pelicul") || g.includes("kino")) return "movie";

  // 5. URL file extension hints
  if (/\.(mp4|mkv|avi|mov|wmv|divx|xvid)(\?|$)/i.test(urlStr)) return "movie";

  return "live";
}

function parseM3U(content) {
  const lines = String(content || "").split(/\r?\n/);
  const items = [];
  let current = null;

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    if (l.startsWith("#EXTINF")) {
      // Example: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
      const name = (l.split(",").slice(1).join(",") || "").trim();
      const attr = {};
      const re = /(\w+(?:-\w+)*)="([^"]*)"/g;
      let m;
      while ((m = re.exec(l)) !== null) {
        attr[m[1]] = m[2];
      }

      const group = attr["group-title"] || "Other";

      current = {
        id: `${attr["tvg-id"] || ""}${name || attr["tvg-name"] || ""}`.trim() || `${Date.now()}_${Math.random()}`,
        name: name || attr["tvg-name"] || "Unknown",
        title: name || attr["tvg-name"] || "Unknown",
        group,
        logo: attr["tvg-logo"] || null,
        tvgId: attr["tvg-id"] || null,
        category: null, // classified after URL is known
        url: null,
        poster: attr["tvg-logo"] || null,
        backdrop: null,
        synopsis: "",
        year: null,
        rating: null,
        tmdbId: null,
      };
    } else if (!l.startsWith("#") && current) {
      current.url = l;
      current.category = classifyCategory(current.group, current.url, current.name);
      items.push(current);
      current = null;
    }
  }

  const live = items.filter((c) => c.category === "live");
  const movies = items.filter((c) => c.category === "movie");
  const series = items.filter((c) => c.category === "series");

  return { live, movies, series };
}

/**
 * Extract a clean title from an IPTV channel name for TMDB search.
 * Strips episode info (S01E01), quality tags, year in brackets, etc.
 */
function extractTitleForSearch(name) {
  let t = String(name || "");
  // Remove common IPTV prefixes like "NL: ", "EN: ", "FR| "
  t = t.replace(/^[A-Z]{2}[:\-|]\s*/i, "");
  // Remove season/episode patterns — keep only the show title
  t = t.replace(/\s*[Ss]\d{1,2}\s*[Ee]\d{1,3}.*$/, "");
  t = t.replace(/\s*Season\s+\d.*$/i, "");
  t = t.replace(/\s*Seizoen\s+\d.*$/i, "");
  t = t.replace(/\s*Saison\s+\d.*$/i, "");
  t = t.replace(/\s*Staffel\s+\d.*$/i, "");
  t = t.replace(/\s*Temporada\s+\d.*$/i, "");
  t = t.replace(/\s*\d{1,2}x\d{2,3}.*$/, "");
  t = t.replace(/\s*Ep\.?\s*\d.*$/i, "");
  t = t.replace(/\s*Episode\s+\d.*$/i, "");
  t = t.replace(/\s*Afl\.?\s*\d.*$/i, "");
  // Remove quality tags and brackets
  t = t.replace(/\[.*?\]|\(.*?\)/g, "");
  t = t.replace(/\b(4K|UHD|FHD|HD|SD|HEVC|H265|H264|AAC|AC3|x265|x264|720p|1080p|2160p|HDR|WEB-DL|BluRay|BRRip|DVDRip)\b/gi, "");
  t = t.replace(/\s*\(\d{4}\)\s*$/, ""); // trailing (2024)
  t = t.replace(/\s*\d{4}\s*$/, ""); // trailing year
  t = t.replace(/[_\-]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * Enrich parsed playlist items with TMDB poster/backdrop/metadata.
 * Batches unique titles and does limited concurrent TMDB searches.
 */
async function enrichWithTmdb(parsed) {
  if (!process.env.TMDB_API_KEY) return parsed;

  const items = [...(parsed.movies || []), ...(parsed.series || [])];
  // Only enrich items without posters (or with low-quality tvg-logo)
  const needsEnrich = items.filter(it => !it.poster || !it.poster.startsWith("http") || it.poster.includes("tvg"));

  if (needsEnrich.length === 0) return parsed;

  // Deduplicate by extracted title to avoid hitting TMDB repeatedly
  const titleMap = new Map(); // cleanTitle -> { type, items[] }
  for (const item of needsEnrich) {
    const cleanTitle = extractTitleForSearch(item.name);
    if (!cleanTitle || cleanTitle.length < 2) continue;
    const key = cleanTitle.toLowerCase();
    if (!titleMap.has(key)) {
      titleMap.set(key, {
        title: cleanTitle,
        type: item.category === "series" ? "tv" : "movie",
        items: [],
      });
    }
    titleMap.get(key).items.push(item);
  }

  // Limit to 50 unique titles to avoid rate limits / slow response
  const entries = Array.from(titleMap.values()).slice(0, 50);
  const CONCURRENT = 5;

  for (let i = 0; i < entries.length; i += CONCURRENT) {
    const batch = entries.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        try {
          const endpoint = entry.type === "tv" ? "/search/tv" : "/search/movie";
          const data = await tmdb(`${endpoint}?query=${encodeURIComponent(entry.title)}&page=1`);
          const first = (data?.results || [])[0];
          if (!first) return null;

          const poster = first.poster_path ? `${TMDB_IMG_500}${first.poster_path}` : null;
          const backdrop = first.backdrop_path ? `${TMDB_IMG_780}${first.backdrop_path}` : null;
          const year = (first.release_date || first.first_air_date || "").slice(0, 4);
          const rating = first.vote_average ? Number(Number(first.vote_average).toFixed(1)) : 0;

          // Apply to all items with this title
          for (const item of entry.items) {
            if (poster) item.poster = poster;
            if (backdrop) item.backdrop = backdrop;
            if (first.overview) item.synopsis = first.overview;
            if (year) item.year = Number(year) || null;
            if (rating) item.rating = rating;
            item.tmdbId = Number(first.id) || null;
          }
          return first;
        } catch {
          return null;
        }
      })
    );
  }

  return parsed;
}

function channelNameFromUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    const tail = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "Live Stream");
    return tail.replace(/\.(m3u8?|ts|mpd)$/i, "").replace(/[_-]+/g, " ").trim() || u.hostname;
  } catch {
    return "Live Stream";
  }
}

function isPublicHttpUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const hn = String(u.hostname || "").toLowerCase();
    const isPrivateHost = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(hn);
    if (isPrivateHost && process.env.NODE_ENV !== "development") return false;
    return true;
  } catch {
    return false;
  }
}

function resolvePlaylistEntryUrl(baseUrl, entryUrl) {
  const raw = String(entryUrl || "").trim();
  if (!raw) return raw;
  try {
    return new URL(raw).toString();
  } catch {}

  try {
    return new URL(raw, String(baseUrl || "")).toString();
  } catch {
    return raw;
  }
}

async function probePlaylistStreamUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!isPublicHttpUrl(url)) {
    return { ok: false, url, code: 400 };
  }

  const methods = ["HEAD", "GET"];
  for (const method of methods) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const resp = await fetch(url, {
        method,
        headers: IPTV_HEADERS,
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);
      const code = Number(resp.status || 0);
      // Many IPTV providers answer 401/403 while stream still valid for player session.
      if ((code >= 200 && code < 500) || code === 206) {
        const finalUrl = String(resp.url || url);
        return { ok: true, url: finalUrl, code };
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return { ok: false, url, code: 0 };
}

// IPTV-friendly headers that most M3U/Xtream servers accept
const IPTV_HEADERS = {
  "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
};

app.post("/api/playlist/parse", playlistLimiter, async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });

    // SSRF protection: only public http/https URLs
    let parsedUrl;
    try { parsedUrl = new URL(String(url)); } catch { return res.status(400).json({ error: "Ongeldige URL" }); }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "Alleen http:// en https:// URLs zijn toegestaan" });
    }
    const hn = parsedUrl.hostname.toLowerCase();
    const isPrivateHost = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(hn);
    if (isPrivateHost && process.env.NODE_ENV !== "development") {
      return res.status(400).json({ error: "Interne netwerk-adressen zijn niet toegestaan" });
    }

    // Try with IPTV-friendly VLC user agent first (most servers accept this)
    let txt = "";
    let fetchOk = false;

    const TIMEOUT = 90_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    try {
      const r = await fetch(url, {
        headers: IPTV_HEADERS,
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      txt = await r.text();
      fetchOk = true;
    } catch (e1) {
      clearTimeout(timer);
      // Fallback: try with generic browser UA
      try {
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), TIMEOUT);
        const r2 = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
          },
          redirect: "follow",
          signal: controller2.signal,
        });
        clearTimeout(timer2);
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        txt = await r2.text();
        fetchOk = true;
      } catch (e2) {
        // Both failed – return error so client can try direct
        return res.status(502).json({
          error: `Server kan URL niet bereiken: ${e1.message}. Probeer de directe URL of upload het bestand.`,
        });
      }
    }

    const isHls = txt.includes("#EXT-X-STREAM-INF") || txt.includes("#EXT-X-TARGETDURATION");
    if (isHls) {
      const channelName = channelNameFromUrl(url);
      return res.json({
        live: [{
          id: `hls_${Date.now()}`,
          name: channelName,
          title: channelName,
          group: "HLS",
          logo: null,
          tvgId: null,
          category: "live",
          url,
          poster: null,
          backdrop: null,
          synopsis: "",
          year: null,
          rating: null,
          tmdbId: null,
        }],
        movies: [],
        series: [],
        source: url,
      });
    }

    if (!txt.includes("#EXTM3U") && !txt.includes("#EXTINF")) {
      return res.status(422).json({ error: "Geen geldig M3U bestand op deze URL." });
    }

    const parsed = parseM3U(txt);
    parsed.live = (parsed.live || []).map((ch) => ({ ...ch, url: resolvePlaylistEntryUrl(url, ch?.url) }));
    parsed.movies = (parsed.movies || []).map((ch) => ({ ...ch, url: resolvePlaylistEntryUrl(url, ch?.url) }));
    parsed.series = (parsed.series || []).map((ch) => ({ ...ch, url: resolvePlaylistEntryUrl(url, ch?.url) }));
    // Enrich movies/series with TMDB poster, backdrop, metadata
    await enrichWithTmdb(parsed);
    res.json({ ...parsed, source: url });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/playlist/activate", playlistLimiter, async (req, res) => {
  try {
    const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];
    if (channels.length === 0) {
      return res.status(400).json({ error: "channels array is vereist" });
    }

    const unique = [];
    const seen = new Set();
    for (const row of channels.slice(0, 80)) {
      const id = String(row?.id || row?.url || "").trim();
      const url = String(row?.url || "").trim();
      if (!id || !url || seen.has(id)) continue;
      seen.add(id);
      unique.push({ id, url });
    }

    const activated = {};
    let okCount = 0;
    for (const row of unique) {
      const probe = await probePlaylistStreamUrl(row.url);
      if (probe.ok) {
        activated[row.id] = probe.url;
        okCount += 1;
      }
    }

    return res.json({
      ok: true,
      tested: unique.length,
      activated: okCount,
      urls: activated,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// Xtream Codes API endpoint - fetches categories + streams server-side
// to bypass CORS restrictions that block client-side Xtream API calls
app.post("/api/playlist/xtream", playlistLimiter, async (req, res) => {
  try {
    const { host, username, password } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ error: "host, username en password zijn vereist" });
    }

    let baseUrl = String(host).trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = "http://" + baseUrl;

    // SSRF protection
    let parsedHost;
    try { parsedHost = new URL(baseUrl); } catch { return res.status(400).json({ error: "Ongeldige host URL" }); }
    const hn = parsedHost.hostname.toLowerCase();
    const isPrivateHost = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(hn);
    if (isPrivateHost && process.env.NODE_ENV !== "development") {
      return res.status(400).json({ error: "Interne netwerk-adressen zijn niet toegestaan" });
    }

    const user = encodeURIComponent(String(username).trim());
    const pass = encodeURIComponent(String(password).trim());

    const candidateUrls = [
      `${baseUrl}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=m3u8`,
      `${baseUrl}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=ts`,
      `${baseUrl}/get.php?username=${user}&password=${pass}&type=m3u_plus`,
    ];

    try {
      let txt = "";
      let ok = false;
      for (const m3uUrl of candidateUrls) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90_000);
        const resp = await fetch(m3uUrl, {
          headers: IPTV_HEADERS,
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) continue;
        txt = await resp.text();
        if (txt.includes("#EXTM3U") || txt.includes("#EXTINF") || txt.includes("#EXT-X-STREAM-INF") || txt.includes("#EXT-X-TARGETDURATION")) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        return res.status(422).json({ error: "Geen geldig M3U ontvangen van Xtream server. Controleer credentials of output type." });
      }

      const isHls = txt.includes("#EXT-X-STREAM-INF") || txt.includes("#EXT-X-TARGETDURATION");
      if (isHls) {
        const channelName = channelNameFromUrl(baseUrl);
        return res.json({
          live: [{
            id: `xtream_hls_${Date.now()}`,
            name: channelName,
            title: channelName,
            group: "Xtream",
            logo: null,
            tvgId: null,
            category: "live",
            url: candidateUrls[0],
            poster: null,
            backdrop: null,
            synopsis: "",
            year: null,
            rating: null,
            tmdbId: null,
          }],
          movies: [],
          series: [],
          source: "xtream",
        });
      }

      const parsed = parseM3U(txt);
      parsed.live = (parsed.live || []).map((ch) => ({ ...ch, url: resolvePlaylistEntryUrl(baseUrl, ch?.url) }));
      parsed.movies = (parsed.movies || []).map((ch) => ({ ...ch, url: resolvePlaylistEntryUrl(baseUrl, ch?.url) }));
      parsed.series = (parsed.series || []).map((ch) => ({ ...ch, url: resolvePlaylistEntryUrl(baseUrl, ch?.url) }));
      // Enrich movies/series with TMDB poster, backdrop, metadata
      await enrichWithTmdb(parsed);
      console.log(`[xtream] ${baseUrl}: ${parsed.live.length} live, ${parsed.movies.length} movies, ${parsed.series.length} series`);
      res.json({ ...parsed, source: "xtream" });
    } catch (fetchErr) {
      res.status(502).json({
        error: `Kan Xtream server niet bereiken: ${fetchErr.message}. Controleer of de host URL correct is.`,
      });
    }
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});


// NOTE: requires TMDB_API_KEY env.
// Returns empty lists if TMDB_API_KEY is missing (so UI doesn't spin forever).
// -----------------------------

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_500 = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_780 = "https://image.tmdb.org/t/p/w780";
const TMDB_PROFILE_185 = "https://image.tmdb.org/t/p/w185";

async function tmdb(pathAndQuery) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;

  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE}${pathAndQuery}${sep}api_key=${encodeURIComponent(
    key
  )}&language=nl-NL`;

  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`TMDB error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }
  return data;
}

// Fetch TMDB videos with all languages included (trailers are often only in English)
async function tmdbVideosAllLangs(mediaType, tmdbId) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const url = `${TMDB_BASE}/${mediaType}/${encodeURIComponent(tmdbId)}/videos?api_key=${encodeURIComponent(key)}&include_video_language=en,nl,de,fr,null`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function pickTrailerCandidates(videos, limit = 5) {
  const items = Array.isArray(videos?.results) ? videos.results : [];
  const ranked = items
    .map((video) => {
      const site = String(video?.site || "").toLowerCase();
      const type = String(video?.type || "").toLowerCase();
      const key = String(video?.key || "").trim();
      const language = String(video?.iso_639_1 || "").toLowerCase();
      if (!key || site !== "youtube") return null;

      let score = 0;
      if (type.includes("trailer")) score += 220;
      else if (type.includes("teaser")) score += 140;
      else if (type.includes("clip")) score += 40;
      else score -= 50;

      if (video?.official) score += 80;
      if (language === "en") score += 50;
      else if (language === "nl") score += 35;
      else if (!language || language === "null" || language === "und") score += 20;
      else if (["de", "fr"].includes(language)) score += 10;

      const size = Number(video?.size || 0);
      if (Number.isFinite(size) && size > 0) score += Math.min(size, 2160) / 20;
      if (video?.published_at) {
        const ts = Date.parse(String(video.published_at));
        if (Number.isFinite(ts)) score += ts / 1e13;
      }

      return {
        key,
        site: "youtube",
        type: String(video?.type || "Trailer"),
        name: String(video?.name || "Trailer"),
        language: language || null,
        official: Boolean(video?.official),
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const unique = [];
  for (const candidate of ranked) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    unique.push(candidate);
    if (unique.length >= limit) break;
  }
  return unique;
}

function pickTrailerKey(videos) {
  return pickTrailerCandidates(videos, 1)[0]?.key || null;
}

function mapTrendingItem(it, type) {
  return {
    id: String(it.id),
    tmdbId: Number(it.id),
    title: it.title || it.name || "",
    poster: it.poster_path ? `${TMDB_IMG_500}${it.poster_path}` : null,
    backdrop: it.backdrop_path ? `${TMDB_IMG_780}${it.backdrop_path}` : null,
    synopsis: it.overview || "",
    year: (it.release_date || it.first_air_date || "").slice(0, 4),
    imdb: it.vote_average ? String(Number(it.vote_average).toFixed(1)) : null,
    rating: it.vote_average ?? null,
    genre: [],
    quality: "HD",
    type,
  };
}

function minutesToDuration(mins) {
  if (!mins || typeof mins !== "number") return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

function mapFullDetail(detail, videos, credits, type) {
  if (!detail) return null;

  const poster = detail.poster_path ? `${TMDB_IMG_500}${detail.poster_path}` : null;
  const backdrop = detail.backdrop_path ? `${TMDB_IMG_780}${detail.backdrop_path}` : null;

  const cast = (credits?.cast || [])
    .slice(0, 20)
    .map((c) => ({
      id: String(c.id),
      name: c.name,
      character: c.character || "",
      photo: c.profile_path ? `${TMDB_PROFILE_185}${c.profile_path}` : null,
    }));

  const genres = (detail.genres || []).map((g) => g.name).filter(Boolean);

  const trailerCandidates = pickTrailerCandidates(videos);
  const trailerKey = trailerCandidates[0]?.key || null;

  const networks = (detail.networks || []).map((n) => n.name).filter(Boolean);
  const creators = (detail.created_by || []).map((n) => n.name).filter(Boolean);
  const directors = (credits?.crew || [])
    .filter((person) => String(person?.job || "").toLowerCase() === "director")
    .map((person) => person.name)
    .filter(Boolean);
  const writers = (credits?.crew || [])
    .filter((person) => {
      const job = String(person?.job || "").toLowerCase();
      return job === "writer" || job === "screenplay" || job === "story";
    })
    .map((person) => person.name)
    .filter(Boolean);
  const spokenLanguages = (detail.spoken_languages || [])
    .map((lang) => lang.english_name || lang.name || lang.iso_639_1)
    .filter(Boolean);
  const countries = (detail.production_countries || [])
    .map((country) => country.name || country.iso_3166_1)
    .filter(Boolean);
  const studios = (detail.production_companies || [])
    .map((company) => company.name)
    .filter(Boolean);
  const runtimeMinutes = type === "movie"
    ? (Number(detail.runtime || 0) || null)
    : (Number((detail.episode_run_time || [])[0] || 0) || null);

  return {
    id: String(detail.id),
    tmdbId: Number(detail.id),
    type,
    title: detail.title || detail.name || "",
    originalTitle: detail.original_title || detail.original_name || detail.title || detail.name || "",
    tagline: detail.tagline || "",
    synopsis: detail.overview || "",
    poster,
    backdrop,
    trailerKey,
    trailerCandidates,
    year: (detail.release_date || detail.first_air_date || "").slice(0, 4),
    releaseDate: detail.release_date || detail.first_air_date || null,
    status: detail.status || "",
    imdb: detail.vote_average ? String(Number(detail.vote_average).toFixed(1)) : null,
    rating: detail.vote_average ? String(Number(detail.vote_average).toFixed(1)) : null,
    duration: runtimeMinutes ? minutesToDuration(runtimeMinutes) : null,
    runtimeMinutes,
    originalLanguage: String(detail.original_language || "").toUpperCase() || null,
    spokenLanguages,
    countries,
    studios,
    directors,
    writers,
    seasons: type === "series"
      ? (detail.seasons || [])
          .filter((s) => s.season_number > 0)
          .map((s) => ({
            id: String(s.id || s.season_number),
            name: s.name || `Seizoen ${s.season_number}`,
            seasonNumber: s.season_number,
            episodes: s.episode_count || 0,
            poster: s.poster_path ? `${TMDB_IMG_500}${s.poster_path}` : null,
            airDate: s.air_date || null,
          }))
      : null,
    totalSeasons: type === "series" ? Number(detail.number_of_seasons || (detail.seasons || []).length || 0) || null : null,
    totalEpisodes: type === "series" ? Number(detail.number_of_episodes || 0) || null : null,
    genre: genres,
    quality: "HD",
    cast,
    networks,
    creators,
    _raw: detail,
  };
}

app.get("/api/movies/trending", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ trending: [], newReleases: [], topRated: [], popular: [], upcoming: [], hiddenGems: [], acclaimed: [], error: "TMDB_API_KEY niet geconfigureerd." });

    const [trending, nowPlaying, topRated, popular, upcoming, trendingP2, popularP2] = await Promise.all([
      tmdb("/trending/movie/week"),
      tmdb("/movie/now_playing"),
      tmdb("/movie/top_rated"),
      tmdb("/movie/popular"),
      tmdb("/movie/upcoming"),
      tmdb("/trending/movie/week?page=2"),
      tmdb("/movie/popular?page=2"),
    ]);

    // Hidden gems: high rating, lower popularity
    const hiddenGems = await tmdb("/discover/movie?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1").catch(() => ({ results: [] }));
    // Critically acclaimed: 8+ rating, 1000+ votes
    const acclaimed = await tmdb("/discover/movie?sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=8&page=1").catch(() => ({ results: [] }));

    res.json({
      trending: [...(trending?.results || []), ...(trendingP2?.results || [])].map((it) => mapTrendingItem(it, "movie")),
      newReleases: (nowPlaying?.results || []).map((it) => mapTrendingItem(it, "movie")),
      topRated: (topRated?.results || []).map((it) => mapTrendingItem(it, "movie")),
      popular: [...(popular?.results || []), ...(popularP2?.results || [])].map((it) => mapTrendingItem(it, "movie")),
      upcoming: (upcoming?.results || []).map((it) => mapTrendingItem(it, "movie")),
      hiddenGems: (hiddenGems?.results || []).slice(0, 20).map((it) => mapTrendingItem(it, "movie")),
      acclaimed: (acclaimed?.results || []).slice(0, 20).map((it) => mapTrendingItem(it, "movie")),
    });
  } catch (e) {
    res.status(200).json({ trending: [], newReleases: [], topRated: [], popular: [], upcoming: [], hiddenGems: [], acclaimed: [], error: String(e?.message || e) });
  }
});

app.get("/api/series/trending", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ trending: [], newReleases: [], topRated: [], popular: [], airingToday: [], hiddenGems: [], error: "TMDB_API_KEY niet geconfigureerd." });

    const [trending, onTheAir, topRated, popular, airingToday, trendingP2, popularP2] = await Promise.all([
      tmdb("/trending/tv/week"),
      tmdb("/tv/on_the_air"),
      tmdb("/tv/top_rated"),
      tmdb("/tv/popular"),
      tmdb("/tv/airing_today"),
      tmdb("/trending/tv/week?page=2"),
      tmdb("/tv/popular?page=2"),
    ]);

    // Hidden gems: high rating, lower popularity
    const hiddenGems = await tmdb("/discover/tv?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1").catch(() => ({ results: [] }));

    res.json({
      trending: [...(trending?.results || []), ...(trendingP2?.results || [])].map((it) => mapTrendingItem(it, "series")),
      newReleases: (onTheAir?.results || []).map((it) => mapTrendingItem(it, "series")),
      topRated: (topRated?.results || []).map((it) => mapTrendingItem(it, "series")),
      popular: [...(popular?.results || []), ...(popularP2?.results || [])].map((it) => mapTrendingItem(it, "series")),
      airingToday: (airingToday?.results || []).map((it) => mapTrendingItem(it, "series")),
      hiddenGems: (hiddenGems?.results || []).slice(0, 20).map((it) => mapTrendingItem(it, "series")),
    });
  } catch (e) {
    res.status(200).json({ trending: [], newReleases: [], topRated: [], popular: [], airingToday: [], hiddenGems: [], error: String(e?.message || e) });
  }
});

// Discover movies by genre — provides genre-specific rows for richer browsing
app.get("/api/movies/discover-by-genre", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ rows: [] });
    const genreMap = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
      27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
      878: "Sci-Fi", 53: "Thriller", 10752: "War", 37: "Western",
    };
    const genreIds = Object.keys(genreMap);
    // Fetch 6 popular genres in parallel (Action, Comedy, Drama, Horror, Sci-Fi, Thriller)
    const selected = [28, 35, 18, 27, 878, 53];
    const promises = selected.map(gid =>
      tmdb(`/discover/movie?with_genres=${gid}&sort_by=popularity.desc&page=1&vote_count.gte=100`)
    );
    const results = await Promise.all(promises);
    const rows = selected.map((gid, i) => ({
      genreId: gid,
      genreName: genreMap[gid],
      items: (results[i]?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")),
    })).filter(r => r.items.length > 0);
    res.json({ rows });
  } catch (e) {
    res.json({ rows: [], error: String(e?.message || e) });
  }
});

// Discover series by genre
app.get("/api/series/discover-by-genre", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ rows: [] });
    const genreMap = {
      10759: "Action & Adventure", 35: "Comedy", 80: "Crime", 99: "Documentary",
      18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
      10764: "Reality", 10765: "Sci-Fi & Fantasy", 53: "Thriller",
    };
    const selected = [10759, 35, 80, 18, 9648, 10765];
    const promises = selected.map(gid =>
      tmdb(`/discover/tv?with_genres=${gid}&sort_by=popularity.desc&page=1&vote_count.gte=50`)
    );
    const results = await Promise.all(promises);
    const rows = selected.map((gid, i) => ({
      genreId: gid,
      genreName: genreMap[gid],
      items: (results[i]?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series")),
    })).filter(r => r.items.length > 0);
    res.json({ rows });
  } catch (e) {
    res.json({ rows: [], error: String(e?.message || e) });
  }
});

// Search TMDB by title — used by IPTV items that have no tmdbId
app.get("/api/tmdb/search", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json(null);
    const { query, type } = req.query;
    if (!query) return res.status(400).json({ error: "Missing query" });
    const endpoint = type === "tv" ? "/search/tv" : "/search/movie";
    const data = await tmdb(`${endpoint}?query=${encodeURIComponent(String(query))}&page=1`);
    const first = (data?.results || [])[0];
    if (!first) return res.json(null);
    const mediaType = type === "tv" ? "series" : "movie";
    const [detail, videos, credits] = await Promise.all([
      tmdb(type === "tv" ? `/tv/${first.id}` : `/movie/${first.id}`),
      tmdb(type === "tv" ? `/tv/${first.id}/videos` : `/movie/${first.id}/videos`),
      tmdb(type === "tv" ? `/tv/${first.id}/credits` : `/movie/${first.id}/credits`),
    ]);
    let finalVideos = videos;
    if (!pickTrailerKey(videos)) {
      const allLangVideos = await tmdbVideosAllLangs(type === "tv" ? "tv" : "movie", first.id);
      if (allLangVideos && pickTrailerKey(allLangVideos)) finalVideos = allLangVideos;
    }
    res.json(mapFullDetail(detail, finalVideos, credits, mediaType));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Multi-result search — returns grouped movies + series results
app.get("/api/search/multi", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ movies: [], series: [] });
    const query = String(req.query.query || "").trim();
    if (!query || query.length < 2) return res.json({ movies: [], series: [] });
    const [movieData, tvData] = await Promise.all([
      tmdb(`/search/movie?query=${encodeURIComponent(query)}&page=1`),
      tmdb(`/search/tv?query=${encodeURIComponent(query)}&page=1`),
    ]);
    const movies = (movieData?.results || []).slice(0, 15).map(it => mapTrendingItem(it, "movie"));
    const series = (tvData?.results || []).slice(0, 15).map(it => mapTrendingItem(it, "series"));
    res.json({ movies, series });
  } catch (e) {
    res.json({ movies: [], series: [], error: String(e?.message || e) });
  }
});

// ─── AI Recommendations ───────────────────────────────────────────────────────

// "Recommended For You" — TMDB discover based on user's genre preferences
app.get("/api/recommendations/for-you", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ movies: [], series: [] });
    const genreIds = String(req.query.genres || "").split(",").filter(Boolean).slice(0, 5);
    const genreStr = genreIds.join(",");
    if (!genreStr) return res.json({ movies: [], series: [] });

    const cacheKey = `rec-for-you-${genreStr}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [movieData, tvData] = await Promise.all([
      tmdb(`/discover/movie?with_genres=${genreStr}&sort_by=vote_average.desc&vote_count.gte=100&page=1`),
      tmdb(`/discover/tv?with_genres=${genreStr}&sort_by=vote_average.desc&vote_count.gte=50&page=1`),
    ]);
    const movies = (movieData?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie"));
    const series = (tvData?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series"));
    const result = { movies, series };
    cacheSet(cacheKey, result, 30 * 60 * 1000); // 30 min
    res.json(result);
  } catch (e) {
    res.json({ movies: [], series: [], error: String(e?.message || e) });
  }
});

// "Because You Watched [Title]" — TMDB similar + recommendations for a movie/series
app.get("/api/recommendations/similar/:id", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ items: [] });
    const { id } = req.params;
    const type = req.query.type === "series" ? "tv" : "movie";

    const cacheKey = `rec-similar-${type}-${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [similar, recs] = await Promise.all([
      tmdb(`/${type}/${encodeURIComponent(id)}/similar?page=1`),
      tmdb(`/${type}/${encodeURIComponent(id)}/recommendations?page=1`),
    ]);
    const mediaType = type === "tv" ? "series" : "movie";
    const seen = new Set();
    const items = [];
    for (const it of [...(recs?.results || []), ...(similar?.results || [])]) {
      if (seen.has(String(it.id))) continue;
      seen.add(String(it.id));
      items.push(mapTrendingItem(it, mediaType));
      if (items.length >= 20) break;
    }
    const result = { items };
    cacheSet(cacheKey, result, 30 * 60 * 1000); // 30 min
    res.json(result);
  } catch (e) {
    res.json({ items: [], error: String(e?.message || e) });
  }
});

app.get("/api/movies/:id/full", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json(null);

    let id = req.params.id;
    let detail, videos, credits;

    try {
      [detail, videos, credits] = await Promise.all([
        tmdb(`/movie/${encodeURIComponent(id)}`),
        tmdb(`/movie/${encodeURIComponent(id)}/videos`),
        tmdb(`/movie/${encodeURIComponent(id)}/credits`),
      ]);
    } catch (idErr) {
      // Fallback: search by title if direct ID lookup fails (e.g. 404)
      const title = String(req.query.title || "").trim();
      if (title && idErr?.statusCode === 404) {
        const search = await tmdb(`/search/movie?query=${encodeURIComponent(title)}`);
        const first = search?.results?.[0];
        if (first?.id) {
          id = String(first.id);
          [detail, videos, credits] = await Promise.all([
            tmdb(`/movie/${encodeURIComponent(id)}`),
            tmdb(`/movie/${encodeURIComponent(id)}/videos`),
            tmdb(`/movie/${encodeURIComponent(id)}/credits`),
          ]);
        } else {
          throw idErr;
        }
      } else {
        throw idErr;
      }
    }

    // If no trailer found in nl-NL, retry with all languages
    let finalVideos = videos;
    if (!pickTrailerKey(videos)) {
      const allLangVideos = await tmdbVideosAllLangs("movie", id);
      if (allLangVideos && pickTrailerKey(allLangVideos)) finalVideos = allLangVideos;
    }

    res.json(mapFullDetail(detail, finalVideos, credits, "movie"));
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
});

app.get("/api/series/:id/full", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json(null);

    let id = req.params.id;
    let detail, videos, credits;

    try {
      [detail, videos, credits] = await Promise.all([
        tmdb(`/tv/${encodeURIComponent(id)}`),
        tmdb(`/tv/${encodeURIComponent(id)}/videos`),
        tmdb(`/tv/${encodeURIComponent(id)}/credits`),
      ]);
    } catch (idErr) {
      // Fallback: search by title if direct ID lookup fails (e.g. 404)
      const title = String(req.query.title || "").trim();
      if (title && idErr?.statusCode === 404) {
        const search = await tmdb(`/search/tv?query=${encodeURIComponent(title)}`);
        const first = search?.results?.[0];
        if (first?.id) {
          id = String(first.id);
          [detail, videos, credits] = await Promise.all([
            tmdb(`/tv/${encodeURIComponent(id)}`),
            tmdb(`/tv/${encodeURIComponent(id)}/videos`),
            tmdb(`/tv/${encodeURIComponent(id)}/credits`),
          ]);
        } else {
          throw idErr;
        }
      } else {
        throw idErr;
      }
    }

    // If no trailer found in nl-NL, retry with all languages
    let finalVideos = videos;
    if (!pickTrailerKey(videos)) {
      const allLangVideos = await tmdbVideosAllLangs("tv", id);
      if (allLangVideos && pickTrailerKey(allLangVideos)) finalVideos = allLangVideos;
    }

    res.json(mapFullDetail(detail, finalVideos, credits, "series"));
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
});
// ─── Genre catalog (discover) ─────────────────────────────────────────────────
// Returns genre rows using TMDB /discover, from 2000 to now.
// Supports ?page=N for infinite scroll — each TMDB genre has up to 500 pages.

const MOVIE_GENRES = [
  { id: 28,    name: "Action" },
  { id: 35,    name: "Comedy" },
  { id: 18,    name: "Drama" },
  { id: 27,    name: "Horror" },
  { id: 878,   name: "Science Fiction" },
  { id: 53,    name: "Thriller" },
  { id: 10749, name: "Romance" },
  { id: 16,    name: "Animation" },
  { id: 80,    name: "Crime" },
  { id: 12,    name: "Adventure" },
  { id: 14,    name: "Fantasy" },
  { id: 10402, name: "Music" },
  { id: 9648,  name: "Mystery" },
  { id: 36,    name: "History" },
  { id: 10752, name: "War" },
];

const SERIES_GENRES = [
  { id: 10759, name: "Action & Adventure" },
  { id: 35,    name: "Comedy" },
  { id: 18,    name: "Drama" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 27,    name: "Horror" },
  { id: 9648,  name: "Mystery" },
  { id: 80,    name: "Crime" },
  { id: 16,    name: "Animation" },
  { id: 10762, name: "Kids" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk Show" },
  { id: 10768, name: "Politics" },
];

app.get("/api/movies/genres-catalog", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ genres: [] });
    const page = Math.max(1, Math.min(500, parseInt(req.query.page) || 1));
    const results = await Promise.all(
      MOVIE_GENRES.map(async (g) => {
        const data = await tmdb(
          `/discover/movie?with_genres=${g.id}&primary_release_date.gte=2000-01-01&sort_by=popularity.desc&vote_count.gte=50&page=${page}`
        );
        return {
          id: g.id,
          name: g.name,
          items: (data?.results || []).map((it) => mapTrendingItem(it, "movie")),
          totalPages: data?.total_pages || 1,
          totalResults: data?.total_results || 0,
        };
      })
    );
    res.json({ genres: results.filter((g) => g.items.length > 0), page });
  } catch (e) {
    res.status(200).json({ genres: [], error: String(e?.message || e) });
  }
});

app.get("/api/series/genres-catalog", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ genres: [] });
    const page = Math.max(1, Math.min(500, parseInt(req.query.page) || 1));
    const results = await Promise.all(
      SERIES_GENRES.map(async (g) => {
        const data = await tmdb(
          `/discover/tv?with_genres=${g.id}&first_air_date.gte=2000-01-01&sort_by=popularity.desc&vote_count.gte=50&page=${page}`
        );
        return {
          id: g.id,
          name: g.name,
          items: (data?.results || []).map((it) => mapTrendingItem(it, "series")),
          totalPages: data?.total_pages || 1,
          totalResults: data?.total_results || 0,
        };
      })
    );
    res.json({ genres: results.filter((g) => g.items.length > 0), page });
  } catch (e) {
    res.status(200).json({ genres: [], error: String(e?.message || e) });
  }
});

// ─── All movies / series (no genre filter, full popularity sort) ──────────────
// Supports ?page=N for infinite scroll. Up to ~10,000 results per sort.
app.get("/api/movies/all", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ items: [] });
    const page = Math.max(1, Math.min(500, parseInt(req.query.page) || 1));
    const sortBy = req.query.sort_by || "popularity.desc";
    const year = req.query.year ? `&primary_release_year=${req.query.year}` : "";
    const decade = req.query.decade;
    let dateRange = year;
    if (decade && !year) {
      const from = `${decade}-01-01`;
      const to = `${parseInt(decade) + 9}-12-31`;
      dateRange = `&primary_release_date.gte=${from}&primary_release_date.lte=${to}`;
    }
    const data = await tmdb(
      `/discover/movie?sort_by=${sortBy}&vote_count.gte=10&primary_release_date.gte=1990-01-01${dateRange}&page=${page}`
    );
    res.json({
      items: (data?.results || []).map((it) => mapTrendingItem(it, "movie")),
      page,
      totalPages: data?.total_pages || 1,
      totalResults: data?.total_results || 0,
    });
  } catch (e) {
    res.status(200).json({ items: [], error: String(e?.message || e) });
  }
});

app.get("/api/series/all", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ items: [] });
    const page = Math.max(1, Math.min(500, parseInt(req.query.page) || 1));
    const sortBy = req.query.sort_by || "popularity.desc";
    const year = req.query.year ? `&first_air_date_year=${req.query.year}` : "";
    const decade = req.query.decade;
    let dateRange = year;
    if (decade && !year) {
      const from = `${decade}-01-01`;
      const to = `${parseInt(decade) + 9}-12-31`;
      dateRange = `&first_air_date.gte=${from}&first_air_date.lte=${to}`;
    }
    const data = await tmdb(
      `/discover/tv?sort_by=${sortBy}&vote_count.gte=10&first_air_date.gte=1990-01-01${dateRange}&page=${page}`
    );
    res.json({
      items: (data?.results || []).map((it) => mapTrendingItem(it, "series")),
      page,
      totalPages: data?.total_pages || 1,
      totalResults: data?.total_results || 0,
    });
  } catch (e) {
    res.status(200).json({ items: [], error: String(e?.message || e) });
  }
});

// ─── Decade rows for movies/series ───────────────────────────────────────────
// Returns one row per decade: 1990s, 2000s, 2010s, 2020s
app.get("/api/movies/decades", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ decades: [] });
    const decades = [
      { decade: "2020", name: "2020s" },
      { decade: "2010", name: "2010s" },
      { decade: "2000", name: "2000s" },
      { decade: "1990", name: "1990s" },
    ];
    const results = await Promise.all(
      decades.map(async (d) => {
        const data = await tmdb(
          `/discover/movie?sort_by=popularity.desc&vote_count.gte=50&primary_release_date.gte=${d.decade}-01-01&primary_release_date.lte=${parseInt(d.decade) + 9}-12-31&page=1`
        );
        return {
          decade: d.decade,
          name: d.name,
          items: (data?.results || []).map((it) => mapTrendingItem(it, "movie")),
        };
      })
    );
    res.json({ decades: results.filter((d) => d.items.length > 0) });
  } catch (e) {
    res.status(200).json({ decades: [], error: String(e?.message || e) });
  }
});

app.get("/api/series/decades", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ decades: [] });
    const decades = [
      { decade: "2020", name: "2020s" },
      { decade: "2010", name: "2010s" },
      { decade: "2000", name: "2000s" },
      { decade: "1990", name: "1990s" },
    ];
    const results = await Promise.all(
      decades.map(async (d) => {
        const data = await tmdb(
          `/discover/tv?sort_by=popularity.desc&vote_count.gte=50&first_air_date.gte=${d.decade}-01-01&first_air_date.lte=${parseInt(d.decade) + 9}-12-31&page=1`
        );
        return {
          decade: d.decade,
          name: d.name,
          items: (data?.results || []).map((it) => mapTrendingItem(it, "series")),
        };
      })
    );
    res.json({ decades: results.filter((d) => d.items.length > 0) });
  } catch (e) {
    res.status(200).json({ decades: [], error: String(e?.message || e) });
  }
});

// -----------------------------
// Internet Archive – free public domain movies
// -----------------------------
const archiveMovieCache = { data: null, ts: 0 };

app.get("/api/movies/archive", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const rows = 20;
    const start = (page - 1) * rows;
    const now = Date.now();

    // Use per-page cache (60 min)
    const cacheKey = `page${page}`;
    if (!archiveMovieCache[cacheKey] || now - archiveMovieCache[cacheKey].ts > 60 * 60 * 1000) {
      const searchUrl =
        `https://archive.org/advancedsearch.php?q=mediatype%3Amovies+subject%3Afeature+format%3Ah.264+language%3Aen` +
        `&fl[]=identifier,title,year,description,subject` +
        `&sort[]=downloads+desc&output=json&rows=${rows}&start=${start}`;
      const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
      const data = await resp.json();
      const docs = data?.response?.docs || [];

      // For each doc, find the actual h.264 mp4 file via metadata
      const movies = (
        await Promise.all(
          docs.map(async (doc) => {
            try {
              const mResp = await fetch(
                `https://archive.org/metadata/${doc.identifier}/files`,
                { signal: AbortSignal.timeout(5000) }
              );
              const mData = await mResp.json();
              const files = mData?.result || [];
              const mp4 = files.find(
                (f) => f.format === "h.264" && f.name?.endsWith(".mp4")
              ) || files.find((f) => f.name?.endsWith(".mp4"));
              if (!mp4) return null;

              const desc = Array.isArray(doc.description)
                ? doc.description[0]
                : doc.description || "";
              const yearStr = String(doc.year || "").slice(0, 4);

              return {
                id: `archive-${doc.identifier}`,
                title: doc.title || doc.identifier,
                poster: `https://archive.org/services/img/${doc.identifier}`,
                backdrop: null,
                synopsis: desc.replace(/<[^>]+>/g, "").slice(0, 220),
                year: yearStr ? Number(yearStr) : null,
                imdb: null,
                rating: null,
                genre: ["Gratis"],
                quality: "HD",
                isIptv: true,
                streamUrl: `https://archive.org/download/${doc.identifier}/${mp4.name}`,
                color: "#1B2B4A",
              };
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);

      archiveMovieCache[cacheKey] = { data: movies, ts: now };
    }

    res.json({ movies: archiveMovieCache[cacheKey].data });
  } catch (e) {
    res.status(200).json({ movies: [], error: String(e?.message || e) });
  }
});

// -----------------------------
// Subtitle proxy — fetches subtitles from OpenSubtitles (when API key available)
// or from TMDB-linked subtitle sources
// -----------------------------
app.get("/api/subtitles/:tmdbId", tmdbLimiter, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const lang = String(req.query.lang || "en").slice(0, 5);
    const type = req.query.type === "series" ? "tv" : "movie";
    const season = req.query.season || "1";
    const episode = req.query.episode || "1";

    const cacheKey = `subs-${type}-${tmdbId}-${lang}-s${season}e${episode}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    // Try OpenSubtitles API if key is available
    const osApiKey = process.env.OPENSUBTITLES_API_KEY;
    if (osApiKey) {
      const params = new URLSearchParams({
        tmdb_id: String(tmdbId),
        languages: lang,
        type: type === "tv" ? "episode" : "movie",
      });
      if (type === "tv") {
        params.set("season_number", String(season));
        params.set("episode_number", String(episode));
      }
      const osRes = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?${params}`, {
        headers: { "Api-Key": osApiKey, "Content-Type": "application/json", "User-Agent": "Nexora v1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (osRes.ok) {
        const osData = await osRes.json();
        const subs = (osData?.data || []).slice(0, 10).map(s => ({
          id: s.id,
          language: s.attributes?.language || lang,
          format: s.attributes?.format || "srt",
          downloadUrl: s.attributes?.files?.[0]?.file_id ? `/api/subtitles/download/${s.attributes.files[0].file_id}` : null,
          rating: s.attributes?.ratings || 0,
          hearing_impaired: s.attributes?.hearing_impaired || false,
        })).filter(s => s.downloadUrl);
        const result = { subtitles: subs };
        cacheSet(cacheKey, result, 60 * 60 * 1000); // 1 hour
        return res.json(result);
      }
    }

    // Fallback: return empty (no subtitles available without API key)
    const result = { subtitles: [] };
    cacheSet(cacheKey, result, 5 * 60 * 1000); // negative cache: 5 min
    res.json(result);
  } catch (e) {
    res.json({ subtitles: [], error: String(e?.message || e) });
  }
});

// Download subtitle file (proxy through server to inject CORS headers)
app.get("/api/subtitles/download/:fileId", async (req, res) => {
  try {
    const osApiKey = process.env.OPENSUBTITLES_API_KEY;
    if (!osApiKey) return res.status(503).json({ error: "Subtitle service not configured" });
    const { fileId } = req.params;
    const dlRes = await fetch("https://api.opensubtitles.com/api/v1/download", {
      method: "POST",
      headers: { "Api-Key": osApiKey, "Content-Type": "application/json", "User-Agent": "Nexora v1.0" },
      body: JSON.stringify({ file_id: Number(fileId) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!dlRes.ok) return res.status(dlRes.status).json({ error: "Download failed" });
    const dlData = await dlRes.json();
    if (dlData?.link) {
      const subRes = await fetch(dlData.link, { signal: AbortSignal.timeout(10000) });
      res.set("Content-Type", "text/vtt; charset=utf-8");
      res.set("Cache-Control", "public, max-age=86400");
      const text = await subRes.text();
      // Convert SRT to VTT if needed
      if (text.trim().startsWith("1\n") || text.trim().startsWith("1\r\n")) {
        res.send("WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2"));
      } else {
        res.send(text);
      }
    } else {
      res.status(404).json({ error: "No download link" });
    }
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// -----------------------------
// Stream validation — probe a URL before playback
// -----------------------------
app.post("/api/stream/validate", playlistLimiter, async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") return res.status(400).json({ valid: false, error: "Missing URL" });
    // Block private IPs
    const parsed = new URL(url);
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) {
      return res.json({ valid: false, error: "Private address blocked" });
    }
    // HEAD request to check URL accessibility
    const probe = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
      headers: { "User-Agent": "Nexora/2.4 Stream Validator" },
    });
    const contentType = probe.headers.get("content-type") || "";
    const isValid = probe.ok && (
      contentType.includes("video") ||
      contentType.includes("mpegurl") ||
      contentType.includes("octet-stream") ||
      contentType.includes("mp2t") ||
      url.match(/\.(m3u8|ts|mp4|mkv|webm|mpd)(\?|$)/i)
    );
    res.json({
      valid: isValid,
      status: probe.status,
      contentType,
      redirected: probe.redirected,
      finalUrl: probe.url,
    });
  } catch (e) {
    res.json({ valid: false, error: String(e?.message || e) });
  }
});

// ─── EPG (Electronic Program Guide) ──────────────────────────────────────────
// Fetches & caches XMLTV EPG data for live TV channels

const epgCache = new Map(); // epgUrl -> { data, ts }
const EPG_TTL = 4 * 60 * 60 * 1000; // 4 hours

function parseXMLTV(xml) {
  const programmes = [];
  const channelNames = new Map();
  // Parse channel display names
  const chanRegex = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/gi;
  let cm;
  while ((cm = chanRegex.exec(xml)) !== null) {
    const id = cm[1];
    const nameMatch = cm[2].match(/<display-name[^>]*>([^<]+)<\/display-name>/i);
    if (nameMatch) channelNames.set(id, nameMatch[1].trim());
  }
  // Parse programmes
  const progRegex = /<programme\s+start="([^"]*)"[^]*?stop="([^"]*)"[^]*?channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/gi;
  let pm;
  while ((pm = progRegex.exec(xml)) !== null) {
    const start = pm[1];
    const stop = pm[2];
    const channel = pm[3];
    const body = pm[4];
    const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = body.match(/<desc[^>]*>([^<]+)<\/desc>/i);
    const catMatch = body.match(/<category[^>]*>([^<]+)<\/category>/i);
    const iconMatch = body.match(/<icon\s+src="([^"]+)"/i);
    if (titleMatch) {
      programmes.push({
        channel,
        channelName: channelNames.get(channel) || channel,
        title: titleMatch[1].trim(),
        description: descMatch ? descMatch[1].trim() : "",
        category: catMatch ? catMatch[1].trim() : "",
        icon: iconMatch ? iconMatch[1] : null,
        start: parseXMLTVDate(start),
        stop: parseXMLTVDate(stop),
      });
    }
  }
  return { channels: Object.fromEntries(channelNames), programmes };
}

function parseXMLTVDate(str) {
  // Format: 20240101120000 +0100
  const m = String(str || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return str;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

app.get("/api/epg", async (req, res) => {
  try {
    const epgUrl = req.query.url;
    if (!epgUrl) return res.status(400).json({ error: "Missing EPG URL" });
    // SSRF protection
    try {
      const u = new URL(String(epgUrl));
      if (!["http:", "https:"].includes(u.protocol)) return res.status(400).json({ error: "Invalid protocol" });
      const hn = u.hostname.toLowerCase();
      if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(hn) && process.env.NODE_ENV !== "development") {
        return res.status(400).json({ error: "Private addresses not allowed" });
      }
    } catch { return res.status(400).json({ error: "Invalid URL" }); }

    const cacheKey = `epg-${epgUrl}`;
    const cached = epgCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < EPG_TTL) return res.json(cached.data);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch(epgUrl, { signal: controller.signal, headers: IPTV_HEADERS });
    clearTimeout(timer);
    if (!resp.ok) return res.status(502).json({ error: `EPG fetch failed: ${resp.status}` });
    const xml = await resp.text();
    const parsed = parseXMLTV(xml);
    epgCache.set(cacheKey, { data: parsed, ts: Date.now() });
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Get current & next programme for a specific channel
app.get("/api/epg/now/:channelId", (req, res) => {
  try {
    const { channelId } = req.params;
    const epgUrl = req.query.url;
    const cacheKey = `epg-${epgUrl}`;
    const cached = epgCache.get(cacheKey);
    if (!cached) return res.json({ now: null, next: null });
    const now = new Date().toISOString();
    const progs = (cached.data.programmes || [])
      .filter(p => p.channel === channelId)
      .sort((a, b) => a.start.localeCompare(b.start));
    const current = progs.find(p => p.start <= now && p.stop > now);
    const next = progs.find(p => p.start > now);
    res.json({ now: current || null, next: next || null });
  } catch (e) {
    res.json({ now: null, next: null });
  }
});

// ─── Trailer search endpoint ────────────────────────────────────────────────
// Returns YouTube trailer key for auto-preview
app.get("/api/trailer/:tmdbId", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ key: null });
    const { tmdbId } = req.params;
    const type = req.query.type === "series" ? "tv" : "movie";
    const cacheKey = `trailer-${type}-${tmdbId}`;
    const cached = cacheGet(cacheKey);
    if (cached !== null) return res.json(cached);

    const videos = await tmdb(`/${type}/${encodeURIComponent(tmdbId)}/videos`);
    let candidates = pickTrailerCandidates(videos);
    // Fallback: fetch with all languages if nl-NL has no trailer
    if (!candidates.length) {
      const allLangVideos = await tmdbVideosAllLangs(type, tmdbId);
      if (allLangVideos) candidates = pickTrailerCandidates(allLangVideos);
    }
    const result = { key: candidates[0]?.key || null, type: candidates[0]?.site || null, candidates };
    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000); // 24h
    res.json(result);
  } catch (e) {
    res.json({ key: null, type: null, candidates: [] });
  }
});

// ─── Netflix-style Homepage rows ─────────────────────────────────────────────
// Single endpoint that returns all homepage sections for efficiency
app.get("/api/homepage", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ rows: [] });

    const cacheKey = "homepage-v2";
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    // Fetch all homepage data in parallel
    const [
      trendingMovies, trendingTv,
      nowPlaying, airingToday,
      topRatedMovies, topRatedTv,
      popularMovies, popularTv,
      upcomingMovies,
      hiddenGemsMovies, hiddenGemsTv,
    ] = await Promise.all([
      tmdb("/trending/movie/week"),
      tmdb("/trending/tv/week"),
      tmdb("/movie/now_playing"),
      tmdb("/tv/airing_today"),
      tmdb("/movie/top_rated"),
      tmdb("/tv/top_rated"),
      tmdb("/movie/popular?page=2"),
      tmdb("/tv/popular?page=2"),
      tmdb("/movie/upcoming"),
      tmdb("/discover/movie?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1").catch(() => ({ results: [] })),
      tmdb("/discover/tv?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1").catch(() => ({ results: [] })),
    ]);

    const rows = [
      { id: "trending-movies", title: "Trending Now", type: "movie", items: (trendingMovies?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")) },
      { id: "trending-series", title: "Trending Series", type: "series", items: (trendingTv?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series")) },
      { id: "new-releases", title: "New Releases", type: "movie", items: (nowPlaying?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")) },
      { id: "airing-today", title: "Airing Today", type: "series", items: (airingToday?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series")) },
      { id: "top-rated-movies", title: "Top Rated Movies", type: "movie", items: (topRatedMovies?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")) },
      { id: "top-rated-series", title: "Top Rated Series", type: "series", items: (topRatedTv?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series")) },
      { id: "popular-movies", title: "Popular This Week", type: "movie", items: (popularMovies?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")) },
      { id: "popular-series", title: "Popular Series", type: "series", items: (popularTv?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series")) },
      { id: "upcoming", title: "Coming Soon", type: "movie", items: (upcomingMovies?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")) },
      { id: "hidden-gems-movies", title: "Hidden Gems", type: "movie", items: (hiddenGemsMovies?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "movie")) },
      { id: "hidden-gems-series", title: "Hidden Gem Series", type: "series", items: (hiddenGemsTv?.results || []).slice(0, 20).map(it => mapTrendingItem(it, "series")) },
    ].filter(r => r.items.length > 0);

    // Pick a hero (featured banner) from trending
    const heroItems = [...(trendingMovies?.results || []).slice(0, 5), ...(trendingTv?.results || []).slice(0, 3)];
    const hero = heroItems[0] ? {
      ...mapTrendingItem(heroItems[0], heroItems[0].title ? "movie" : "series"),
      trailerKey: null, // Client fetches trailer separately via /api/trailer/:id
    } : null;

    const result = { rows, hero, generatedAt: new Date().toISOString() };
    cacheSet(cacheKey, result, 15 * 60 * 1000); // 15 min
    res.json(result);
  } catch (e) {
    res.json({ rows: [], hero: null, error: String(e?.message || e) });
  }
});

// ─── Personalized recommendations ────────────────────────────────────────────
// Enhanced "Because You Watched" with batch support
app.post("/api/recommendations/batch", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ sections: [] });
    const { watchedIds } = req.body || {};
    if (!Array.isArray(watchedIds) || watchedIds.length === 0) return res.json({ sections: [] });

    // Limit to 5 items for performance
    const toProcess = watchedIds.slice(0, 5);
    const sections = [];

    for (const entry of toProcess) {
      const { tmdbId, type, title } = entry;
      if (!tmdbId) continue;
      const mediaType = type === "series" ? "tv" : "movie";
      const cacheKey = `batch-rec-${mediaType}-${tmdbId}`;
      const cached = cacheGet(cacheKey);
      if (cached) { sections.push(cached); continue; }

      try {
        const [similar, recs] = await Promise.all([
          tmdb(`/${mediaType}/${encodeURIComponent(tmdbId)}/similar?page=1`),
          tmdb(`/${mediaType}/${encodeURIComponent(tmdbId)}/recommendations?page=1`),
        ]);
        const seen = new Set();
        const items = [];
        for (const it of [...(recs?.results || []), ...(similar?.results || [])]) {
          if (seen.has(String(it.id))) continue;
          seen.add(String(it.id));
          items.push(mapTrendingItem(it, type === "series" ? "series" : "movie"));
          if (items.length >= 15) break;
        }
        if (items.length > 0) {
          const section = { id: `because-${tmdbId}`, title: `Because You Watched ${title || ""}`.trim(), items, sourceId: tmdbId };
          cacheSet(cacheKey, section, 60 * 60 * 1000); // 1h
          sections.push(section);
        }
      } catch {}
    }

    res.json({ sections });
  } catch (e) {
    res.json({ sections: [], error: String(e?.message || e) });
  }
});

// ─── Ultra Fast Search ───────────────────────────────────────────────────────
// Unified search across movies, series, and IPTV with fuzzy matching

function fuzzyMatch(query, text) {
  if (!query || !text) return { match: false, score: 0 };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Exact match
  if (t === q) return { match: true, score: 100 };
  // Contains
  if (t.includes(q)) return { match: true, score: 80 };
  // Starts with
  if (t.startsWith(q)) return { match: true, score: 90 };
  // Word start match
  const words = t.split(/\s+/);
  if (words.some(w => w.startsWith(q))) return { match: true, score: 70 };
  // Typo tolerance (1 char difference for queries > 3 chars)
  if (q.length > 3) {
    for (let i = 0; i < q.length; i++) {
      const variant = q.slice(0, i) + q.slice(i + 1);
      if (t.includes(variant)) return { match: true, score: 50 };
    }
    // Transposition
    for (let i = 0; i < q.length - 1; i++) {
      const transposed = q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2);
      if (t.includes(transposed)) return { match: true, score: 45 };
    }
  }
  // Partial match (at least 60% of query chars in sequence)
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi / q.length >= 0.6) return { match: true, score: 30 };
  return { match: false, score: 0 };
}

// Search cache for <100ms responses
const searchCache = new Map();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 min

app.get("/api/search/unified", tmdbLimiter, async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    if (!query || query.length < 2) return res.json({ movies: [], series: [], iptv: [], totalResults: 0 });

    const cacheKey = `search-unified-${query.toLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
      return res.json(cached.data);
    }

    const startTime = Date.now();

    // Search TMDB movies + series in parallel
    const tmdbResults = process.env.TMDB_API_KEY ? await Promise.all([
      tmdb(`/search/movie?query=${encodeURIComponent(query)}&page=1`).catch(() => ({ results: [] })),
      tmdb(`/search/tv?query=${encodeURIComponent(query)}&page=1`).catch(() => ({ results: [] })),
    ]) : [{ results: [] }, { results: [] }];

    const movies = (tmdbResults[0]?.results || []).slice(0, 15).map(it => ({
      ...mapTrendingItem(it, "movie"),
      relevance: fuzzyMatch(query, it.title || it.name || "").score,
    }));

    const series = (tmdbResults[1]?.results || []).slice(0, 15).map(it => ({
      ...mapTrendingItem(it, "series"),
      relevance: fuzzyMatch(query, it.name || it.title || "").score,
    }));

    // Sort by relevance
    movies.sort((a, b) => b.relevance - a.relevance);
    series.sort((a, b) => b.relevance - a.relevance);

    const elapsed = Date.now() - startTime;
    const result = { movies, series, iptv: [], totalResults: movies.length + series.length, queryTimeMs: elapsed };
    searchCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (e) {
    res.json({ movies: [], series: [], iptv: [], totalResults: 0, error: String(e?.message || e) });
  }
});

// ─── CDN-aware streaming headers ─────────────────────────────────────────────
app.get("/api/stream/proxy-headers", (req, res) => {
  // Returns optimal headers for CDN edge caching
  res.json({
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    "CDN-Cache-Control": "public, max-age=3600",
    "Vary": "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
  });
});

// ─── Adaptive quality levels ─────────────────────────────────────────────────
app.get("/api/stream/quality-levels", (req, res) => {
  res.json({
    levels: [
      { id: "auto", label: "Auto", description: "Adaptive bitrate" },
      { id: "4k", label: "4K Ultra HD", bitrate: 25000000, resolution: "3840x2160" },
      { id: "fhd", label: "Full HD", bitrate: 8000000, resolution: "1920x1080" },
      { id: "hd", label: "HD", bitrate: 5000000, resolution: "1280x720" },
      { id: "sd", label: "SD", bitrate: 2500000, resolution: "854x480" },
    ],
  });
});

// -----------------------------
// Anti-piracy — stream URL signing with HMAC + domain/IP restriction
// -----------------------------
const STREAM_SIGNING_SECRET = process.env.STREAM_SIGNING_SECRET || crypto.randomBytes(32).toString("hex");

app.get("/api/stream/sign", (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing URL" });
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const deviceId = req.query.deviceId || "unknown";
    const expires = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    const payload = `${url}|${expires}|${ip}|${deviceId}`;
    const signature = crypto.createHmac("sha256", STREAM_SIGNING_SECRET).update(payload).digest("hex");
    res.json({
      signedUrl: url,
      token: signature,
      expires,
      ip,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/stream/verify", (req, res) => {
  try {
    const { url, token, expires } = req.query;
    if (!url || !token || !expires) return res.json({ valid: false, error: "Missing parameters" });
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(expires)) return res.json({ valid: false, error: "Token expired" });
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const deviceId = req.query.deviceId || "unknown";
    const payload = `${url}|${expires}|${ip}|${deviceId}`;
    const expected = crypto.createHmac("sha256", STREAM_SIGNING_SECRET).update(payload).digest("hex");
    res.json({ valid: token === expected });
  } catch (e) {
    res.json({ valid: false, error: String(e?.message || e) });
  }
});

// -----------------------------
// Device session tracking — concurrent stream limiting + account sharing detection
// -----------------------------
const activeSessions = new Map(); // deviceId -> { ip, startedAt, lastSeen, streamUrl, userAgent }
const ipHistory = new Map(); // ip -> Set<deviceId> — historical device tracking
const MAX_CONCURRENT_STREAMS = 3;
const MAX_DEVICES_PER_ACCOUNT = 5;
const SUSPICIOUS_DEVICE_THRESHOLD = 8; // More than this many unique devices = suspicious

function cleanSessions() {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (now - session.lastSeen > 5 * 60 * 1000) activeSessions.delete(id);
  }
}

app.post("/api/session/start", (req, res) => {
  try {
    const { deviceId, streamUrl } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "";
    const now = Date.now();

    cleanSessions();

    // Track device history per IP (account sharing detection)
    if (!ipHistory.has(ip)) ipHistory.set(ip, new Set());
    ipHistory.get(ip).add(deviceId);
    const uniqueDevices = ipHistory.get(ip).size;

    // Count active sessions for this IP
    let ipSessionCount = 0;
    const activeDeviceIPs = new Set();
    for (const [, session] of activeSessions) {
      if (session.ip === ip) { ipSessionCount++; activeDeviceIPs.add(session.ip); }
    }

    // Account sharing warning
    let sharingWarning = null;
    if (uniqueDevices > SUSPICIOUS_DEVICE_THRESHOLD) {
      sharingWarning = `Unusual activity detected: ${uniqueDevices} devices from this location`;
    }

    if (ipSessionCount >= MAX_CONCURRENT_STREAMS && !activeSessions.has(deviceId)) {
      return res.status(429).json({
        error: "Too many concurrent streams",
        maxStreams: MAX_CONCURRENT_STREAMS,
        activeStreams: ipSessionCount,
        sharingWarning,
      });
    }

    activeSessions.set(deviceId, { ip, startedAt: now, lastSeen: now, streamUrl: streamUrl || null, userAgent });
    res.json({
      ok: true,
      activeStreams: ipSessionCount + (activeSessions.has(deviceId) ? 0 : 1),
      maxStreams: MAX_CONCURRENT_STREAMS,
      sharingWarning,
    });
  } catch (e) {
    res.json({ ok: true }); // don't block playback on errors
  }
});

app.post("/api/session/heartbeat", (req, res) => {
  try {
    const { deviceId } = req.body || {};
    if (deviceId && activeSessions.has(deviceId)) {
      activeSessions.get(deviceId).lastSeen = Date.now();
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

app.post("/api/session/stop", (req, res) => {
  try {
    const { deviceId } = req.body || {};
    if (deviceId) activeSessions.delete(deviceId);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// Account sharing detection status
app.get("/api/session/status", (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    cleanSessions();
    let activeCount = 0;
    for (const [, session] of activeSessions) {
      if (session.ip === ip) activeCount++;
    }
    const uniqueDevices = ipHistory.get(ip)?.size || 0;
    res.json({
      activeStreams: activeCount,
      maxStreams: MAX_CONCURRENT_STREAMS,
      uniqueDevices,
      suspicious: uniqueDevices > SUSPICIOUS_DEVICE_THRESHOLD,
    });
  } catch (e) {
    res.json({ activeStreams: 0, maxStreams: MAX_CONCURRENT_STREAMS });
  }
});

// -----------------------------
// Start
// -----------------------------
app.listen(PORT, () => {
  console.log(`Nexora server running on :${PORT} (sports source: ${footballSource()})`);
  // Initialiseer Zilliz vector cache (non-blocking)
  zillizInit().catch(() => {});
  // Keep-alive: ping /health every 10 min to prevent Render free-tier sleep
  const selfPingUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
  if (selfPingUrl) {
    setInterval(async () => {
      try { await fetch(`${selfPingUrl}/health`, { signal: AbortSignal.timeout(10000) }); } catch {}
    }, 10 * 60 * 1000);
    console.log(`Keep-alive ping enabled → ${selfPingUrl}/health`);
  }

  // Background enrichment agent: warm logo/photo/value caches for active leagues
  const ENRICHMENT_INTERVAL = 30 * 60 * 1000; // 30 min
  async function runEnrichmentCycle() {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const espn = await espnScoreboard(date).catch(() => null);
      const events = Array.isArray(espn?.events) ? espn.events : [];
      const matches = events.map(mapEspnEventToMatch).filter((m) => m.league);
      const teamNames = [...new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam].filter(Boolean)))];

      // Warm logo cache from football-logos + TheSportsDB
      for (const name of teamNames) {
        const league = matches.find((m) => m.homeTeam === name || m.awayTeam === name)?.league || "";
        resolveFootballLogosUrl(name, league);
      }
      for (let i = 0; i < teamNames.length; i += 5) {
        const batch = teamNames.slice(i, i + 5);
        await Promise.allSettled(batch.map((n) => fetchTheSportsDBTeamLogo(n)));
      }

      // Warm player value cache for today's teams (best-effort)
      const uniqueTeams = teamNames.slice(0, 10); // limit to 10 teams per cycle
      for (const teamName of uniqueTeams) {
        try {
          await fetchTransfermarktClubPlayers(teamName);
        } catch {}
      }
      console.log(`[enrichment] Warmed caches for ${teamNames.length} teams, ${uniqueTeams.length} rosters`);
    } catch (e) {
      console.error("[enrichment] Cycle error:", e.message);
    }
  }
  // Initial run after 60s, then every 30 min
  setTimeout(runEnrichmentCycle, 60_000);
  setInterval(runEnrichmentCycle, ENRICHMENT_INTERVAL);
});
