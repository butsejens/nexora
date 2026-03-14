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

// Club Brugge ESPN CDN logo (Jupiler Pro League team ID: 6718)
const CLUB_BRUGGE_NEW_LOGO = "https://a.espncdn.com/i/teamlogos/soccer/500/6718.png";

function normalizeTeamLogo(teamName, logoUrl, ...fallbackCandidates) {
  const name = String(teamName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const logo = String(logoUrl || "").toLowerCase();
  if (
    name.includes("clubbrugge") ||
    name.includes("clubbruggekv") ||
    logo.includes("club-brugge") ||
    logo.includes("clubbrugge")
  ) {
    return CLUB_BRUGGE_NEW_LOGO;
  }

  const candidates = [logoUrl, ...fallbackCandidates];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}

function normalizePlayerPhoto(_playerId, ...candidates) {
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (/^https?:\/\//i.test(v)) return v;
  }
  return null;
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
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  const denom = Math.max(setA.size, setB.size, 1);
  return overlap / denom;
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
      photo: p?.strCutout || p?.strThumb || null,
    })).filter((p) => p.name && p.photo);

    cacheSet(cacheKey, list, 86_400_000); // cache 24h
    return list;
  } catch {
    cacheSet(cacheKey, [], 300_000);
    return [];
  }
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
    ];
    for (const variant of footballerVariants) {
      const photo = await fetchPageImage(variant);
      if (photo) { cacheSet(cacheKey, photo, 86_400_000); return photo; }
    }

    // Final: Wikipedia opensearch
    const searchResp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(playerName)}&limit=3&format=json&origin=*`,
      { headers: { "User-Agent": "NexoraApp/1.0 (sports app)" }, signal: AbortSignal.timeout(4000) }
    );
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const results = searchData?.[1] || [];
      for (const title of results.slice(0, 3)) {
        const photo = await fetchPageImage(title);
        if (photo) { cacheSet(cacheKey, photo, 86_400_000); return photo; }
      }
    }

    cacheSet(cacheKey, null, 300_000);
    return null;
  } catch {
    cacheSet(cacheKey, null, 300_000);
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

  // Batched TheSportsDB lookups (max 5 parallel) to avoid rate-limit on free key
  const tsdbMap = {};
  for (let i = 0; i < teamNames.length; i += 5) {
    const batch = teamNames.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (name) => [name, await fetchTheSportsDBTeamLogo(name)]));
    for (const [name, logo] of results) tsdbMap[name] = logo;
  }

  // Wikipedia only for teams that TSDB missed AND have no existing ESPN CDN logo
  const needsWiki = teamNames.filter((name) => {
    const hasExistingLogo = matches.some((m) => (m.homeTeam === name && m.homeTeamLogo) || (m.awayTeam === name && m.awayTeamLogo));
    return !tsdbMap[name] && !hasExistingLogo;
  });
  const wikiMap = {};
  if (needsWiki.length > 0) {
    const results = await Promise.all(needsWiki.map(async (name) => [name, await fetchWikipediaTeamLogo(name)]));
    for (const [name, logo] of results) wikiMap[name] = logo;
  }

  return matches.map((m) => ({
    ...m,
    // Priority: TSDB badge > existing ESPN CDN URL > Wikipedia (last resort)
    homeTeamLogo: tsdbMap[m.homeTeam] || m.homeTeamLogo || wikiMap[m.homeTeam] || null,
    awayTeamLogo: tsdbMap[m.awayTeam] || m.awayTeamLogo || wikiMap[m.awayTeam] || null,
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

  const batches = await Promise.allSettled(dates.map((d) => fetchSofaEventsByDate(d)));
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const raw of batch.value || []) {
      const sofa = buildSofaDataFromEvent(raw);
      if (!sofa) continue;
      if (sofa.id) byId.set(sofa.id, sofa);

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
    const sofa = byId.get(id) || byKey.get(`${hk}__${ak}`) || null;
    return { ...match, sofaData: sofa };
  });
}

function leagueValueMultiplier(leagueName) {
  const n = String(leagueName || "").toLowerCase();
  if (n.includes("jupiler") || n.includes("bel.1") || n.includes("pro league")) return 0.12;
  if (n.includes("challenger") || n.includes("bel.2")) return 0.06;
  if (n.includes("bundesliga") || n.includes("la liga") || n.includes("ligue 1") || n.includes("serie a")) return 0.85;
  if (n.includes("premier") || n.includes("champions")) return 1.0;
  if (n.includes("eredivisie") || n.includes("scottish") || n.includes("liga nos") || n.includes("primeira")) return 0.35;
  return 0.7; // generic mid-tier fallback
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

// Transfermarkt community API – free, no key required
// https://transfermarkt-api.vercel.app (open-source wrapper)
async function fetchTransfermarktClubPlayers(teamName) {
  if (!teamName) return null;
  const normKey = normalizePersonName(teamName);
  const cacheKey = `transfermarkt_club_${normKey}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    const q = encodeURIComponent(String(teamName).trim());
    const searchResp = await fetch(`https://transfermarkt-api.vercel.app/clubs/search/${q}`, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchResp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const searchData = await searchResp.json();
    const clubs = Array.isArray(searchData?.results) ? searchData.results : [];
    const club = clubs[0];
    if (!club?.id) { cacheSet(cacheKey, null, 300_000); return null; }

    const playersResp = await fetch(`https://transfermarkt-api.vercel.app/clubs/${encodeURIComponent(club.id)}/players`, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!playersResp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const playersData = await playersResp.json();
    const players = Array.isArray(playersData?.players) ? playersData.players : [];

    const result = players.map((p) => ({
      name: normalizePersonName(p?.name || ""),
      marketValueEur: p?.marketValue?.value ?? p?.marketValue ?? null,
      photo: proxyPhotoUrl(String(p?.image || p?.photo || p?.picture || "").trim() || null),
    })).filter((p) => p.name);

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
  if (Array.isArray(tmPlayers)) {
    for (const p of tmPlayers) {
      const eur = parseNumberish(p.marketValueEur);
      if (Number.isFinite(eur) && eur > 0) tmValueMap.set(p.name, eur);
    }
  }
  console.log(`[market] ${teamName}: Transfermarkt found ${tmValueMap.size}/${players.length} values`);

  return players.map((p) => {
    const next = { ...p };
    const normedName = normalizePersonName(next.name || "");

    // Transfermarkt first (real value)
    const tmValue = tmValueMap.get(normedName);
    if (Number.isFinite(tmValue) && tmValue > 0) {
      next.marketValue = formatEURShort(tmValue);
      next.isRealValue = true;
      next.valueMethod = "transfermarkt";
      return next;
    }

    next.marketValue = "";
    next.isRealValue = false;
    next.valueMethod = "unverified";
    return next;
  });
}

async function enrichRosterPhotos(players, teamName) {
  if (!Array.isArray(players) || players.length === 0) return players || [];
  const needsPhoto = players.some((p) => p && !p.photo);
  if (!needsPhoto) return players;

  // Step 0: Transfermarkt community API – has player profile images (cached, already fetched for values)
  const tmPlayers = teamName ? await fetchTransfermarktClubPlayers(teamName) : null;
  const tmPhotoMap = new Map();
  if (Array.isArray(tmPlayers)) {
    for (const p of tmPlayers) {
      if (p.name && p.photo && /^https?:\/\//i.test(p.photo)) tmPhotoMap.set(p.name, p.photo);
    }
  }
  let enriched = players.map((player) => {
    if (!player || player.photo) return player;
    const normName = normalizePersonName(player.name || "");
    const photo = tmPhotoMap.get(normName);
    return photo ? { ...player, photo } : player;
  });

  // Step 1: TheSportsDB – exact normalized name matches only
  const dbPlayers = await fetchTheSportsDBTeamPlayers(teamName);
  enriched = enriched.map((player) => {
    if (!player || player.photo) return player;
    const normName = normalizePersonName(player.name || "");
    if (!normName) return player;
    let best = null;
    for (const dbp of dbPlayers) {
      if (dbp.name === normName) { best = dbp; break; }
    }
    if (best) return { ...player, photo: best.photo };
    return player;
  });

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
    photo: normalizePlayerPhoto(
      playerId,
      player?.headshot?.href,
    ),
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
  // Belgium
  if (/jupiler|pro.?league|belgian.?first|eerste.*klasse/i.test(n)) return "Jupiler Pro League";
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
  });

  const data = await r.json();
  if (!r.ok) {
    const e = new Error(`Gemini error (${r.status})`);
    e.statusCode = r.status;
    e.details = data;
    throw e;
  }

  return data?.choices?.[0]?.message?.content ?? "";
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

// ── Short download redirect (for Downloader app on TV) ──────────────────────
app.get("/download", (req, res) => {
  res.redirect(301, "/api/download/apk");
});

// Numeric shortcode: type "1234567" in Downloader → downloads TV APK
app.get("/1234567", (req, res) => {
  res.redirect(301, "/api/download/tv");
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
  // Always expose the download through our own redirect endpoint so the app
  // never needs to open a raw GitHub URL (avoids browser-specific download issues).
  const apkUrl = storedApkUrl ? `${proto}://${host}/api/download/apk` : `${proto}://${host}/downloads/nexora.apk`;
  res.json({ version, apkUrl, directApkUrl: storedApkUrl || null });
});

// ── APK download proxy ─────────────────────────────────────────────────────────
// Streams the APK through Render so the user never gets redirected to GitHub.
app.get("/api/download/apk", async (req, res) => {
  try {
    const vf = join(__dirname, "app-version.json");
    if (existsSync(vf)) {
      const data = JSON.parse(readFileSync(vf, "utf8"));
      if (data.apkUrl) {
        const upstream = await fetch(data.apkUrl, { timeout: 60000 });
        if (!upstream.ok) {
          return res.status(502).json({ error: `APK niet beschikbaar (${upstream.status})` });
        }
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", 'attachment; filename="nexora.apk"');
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) res.setHeader("Content-Length", contentLength);
        upstream.body.pipe(res);
        return;
      }
    }
  } catch (err) {
    console.error("[apk-proxy] error:", err?.message);
  }
  res.status(404).json({ error: "APK niet beschikbaar" });
});

// ── TV APK download proxy ───────────────────────────────────────────────────
app.get("/api/download/tv", async (req, res) => {
  try {
    const vf = join(__dirname, "app-version.json");
    if (existsSync(vf)) {
      const data = JSON.parse(readFileSync(vf, "utf8"));
      if (data.tvApkUrl) {
        const upstream = await fetch(data.tvApkUrl, { timeout: 60000 });
        if (!upstream.ok) {
          return res.status(502).json({ error: `TV APK niet beschikbaar (${upstream.status})` });
        }
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", 'attachment; filename="nexora-tv.apk"');
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) res.setHeader("Content-Length", contentLength);
        upstream.body.pipe(res);
        return;
      }
    }
  } catch (err) {
    console.error("[tv-apk-proxy] error:", err?.message);
  }
  res.status(404).json({ error: "TV APK niet beschikbaar" });
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
  return details.map((d) => {
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
}

// Live (poll every 10s)
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
          const valued = await enrichRosterMarketValues(team.players || [], team.team || "");
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

        return {
          ...mapped,
          ...withSofa,
          homeTeamId: withSofa?.homeTeamId || String(home?.team?.id || mapped.homeTeamId || ""),
          awayTeamId: withSofa?.awayTeamId || String(away?.team?.id || mapped.awayTeamId || ""),
          venue: withSofa?.venue || headerComp?.venue?.fullName || summary?.gameInfo?.venue?.fullName || "",
          city: withSofa?.city || headerComp?.venue?.address?.city || summary?.gameInfo?.venue?.address?.city || "",
          referee: withSofa?.referee || summary?.gameInfo?.officials?.[0]?.displayName || "",
          round: withSofa?.round || summary?.header?.season?.type?.name || "",
          homeStats: withSofa?.homeStats || {},
          awayStats: withSofa?.awayStats || {},
          watchOptions: withSofa?.watchOptions || watchOptions,
          keyEvents: withSofa?.keyEvents || details,
          starters: withSofa?.starters || (espnLineups.length > 0 ? starters : []),
        };
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
        const valued = await enrichRosterMarketValues(team.players || [], team.team || "");
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

      return {
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
      };
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
  "FA Cup": "eng.fa",
  "UEFA Champions League": "uefa.champions",
  "Champions League": "uefa.champions",
  "UEFA Europa League": "uefa.europa",
  "UEFA Conference League": "uefa.europa.conf",
  "La Liga": "esp.1",
  "La Liga 2": "esp.2",
  "Copa del Rey": "esp.copa_del_rey",
  "Bundesliga": "ger.1",
  "2. Bundesliga": "ger.2",
  "DFB Pokal": "ger.dfb_pokal",
  "Jupiler Pro League": "bel.1",
  "Challenger Pro League": "bel.2",
  "Belgian Cup": "bel.cup",
  "Ligue 1": "fra.1",
  "Ligue 2": "fra.2",
  "Coupe de France": "fra.coupe_de_france",
  "Serie A": "ita.1",
  "Serie B": "ita.2",
  "Coppa Italia": "ita.coppa_italia",
  Eredivisie: "ned.1",
  "Eerste Divisie": "ned.2",
  "KNVB Beker": "ned.knvb_beker",
  "Primeira Liga": "por.1",
  "Liga Portugal 2": "por.2",
  "Taca de Portugal": "por.taca_de_portugal",
  "Super Lig": "tur.1",
  "1. Lig": "tur.2",
  "Turkish Cup": "tur.turkish_cup",
};

async function fetchWithTimeout(fetchPromise, timeoutMs = 12000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
  );
  return Promise.race([fetchPromise, timeout]);
}

async function espnStandings(leagueName) {
  const slug = ESPN_LEAGUE_SLUGS[leagueName] || ESPN_LEAGUE_SLUGS[normalizeLeagueName(leagueName)] || leagueName;
  const url = `${ESPN_STANDINGS_BASE}/${slug}/standings`;
  const resp = await fetchWithTimeout(
    fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" } }),
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
        photo: ath.headshot?.href || (athleteId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(athleteId)}.png` : null),
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
        const standings = mapEspnStandings(espnData);
        if (standings.length > 0) {
          console.log(`[standings] ${leagueName}: ESPN → ${standings.length} teams`);
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
        const scorers = mapEspnTopScorers(espnData);
        if (scorers.length > 0) {
          // Enrich with market values per team (best-effort, cached by enrichRosterMarketValues)
          const teams = [...new Set(scorers.map(s => s.team).filter(Boolean))];
          await Promise.allSettled(
            teams.map(teamName =>
              Promise.race([
                (async () => {
                  const teamScorers = scorers.filter(s => s.team === teamName);
                  const minimal = teamScorers.map(s => ({ id: s.id, name: s.name }));
                  const enriched = await enrichRosterMarketValues(minimal, teamName, leagueName);
                  for (const s of teamScorers) {
                    const e = enriched.find(p => p.id === s.id || p.name === s.name);
                    if (e?.marketValue) { s.marketValue = e.marketValue; s.isRealValue = e.isRealValue; }
                  }
                })(),
                new Promise(r => setTimeout(r, 12000)),
              ])
            )
          );
          console.log(`[topscorers] ${leagueName}: ESPN → ${scorers.length} scorers (enriched)`);
          return { league: leagueName, season, seasonLabel, scorers, source: "espn" };
        }
      } catch (e) {
        console.warn(`[topscorers] ESPN failed for ${leagueName}: ${e.message}`);
      }

      // 1b) ESPN HTML fallback (no key)
      try {
        const htmlScorers = await espnTopScorersFromHtml(leagueName);
        if (htmlScorers.length > 0) {
          console.log(`[topscorers] ${leagueName}: ESPN HTML → ${htmlScorers.length} scorers`);
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
async function espnLeagueMatches(leagueName) {
  const baseUrl = ESPN_LEAGUE_SCOREBOARDS[leagueName];
  if (!baseUrl) return [];
  const leagueSlug = String(baseUrl.match(/\/soccer\/([^/]+)\/scoreboard/)?.[1] || "");
  const now = new Date();
  // Build a set of date strings: current + ±2 weeks
  const dateStrs = [""];
  for (const offsetDays of [-14, -7, 7, 14]) {
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
      const events = await espnLeagueMatches(leagueName);
      const matchesRaw = events.map(mapEspnEventToMatch);
      const matches = await enrichMatchesWithSofaData(matchesRaw);
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

// Team detail
app.get("/api/sports/team/:teamId", async (req, res) => {
  const teamId = String(req.params.teamId);
  const espnLeague = String(req.query?.league || "eng.1");
  const teamNameFromQuery = String(req.query?.teamName || "").trim();
  const season = seasonForDate(new Date());
  const key = `team_${teamId}_${season}_${espnLeague}`;

  try {
    const payload = await getOrFetch(key, 60_000, async () => {
      let resolvedTeamId = teamId;
      if (teamId.startsWith("name:")) {
        const rawName = decodeURIComponent(teamId.replace(/^name:/, "")).toLowerCase();
        const teamsResp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espnLeague)}/teams`, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
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

      const [teamResp, rosterResp] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espnLeague)}/teams/${encodeURIComponent(resolvedTeamId)}`, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        }),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(espnLeague)}/teams/${encodeURIComponent(resolvedTeamId)}/roster`, {
          headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        }),
      ]);

      const teamJson = teamResp.ok ? await teamResp.json() : {};
      const rosterJson = rosterResp.ok ? await rosterResp.json() : {};
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
      const valuedPlayers = await enrichRosterMarketValues(players, team?.displayName || team?.name || teamNameFromQuery || "", espnLeague);
      const enrichedPlayers = await enrichRosterPhotos(
        valuedPlayers,
        team?.displayName || team?.name || teamNameFromQuery || ""
      );

      const teamDisplayName = team?.displayName || team?.name || teamNameFromQuery || "";
      const baseLogo = normalizeTeamLogo(
        teamDisplayName,
        team?.logos?.[0]?.href || team?.logo || null,
        team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(String(team.id))}.png` : null,
      );
      const resolvedLogo = baseLogo || await fetchTheSportsDBTeamLogo(teamDisplayName) || await fetchWikipediaTeamLogo(teamDisplayName) || null;

      return {
        id: String(team?.id || resolvedTeamId || ""),
        name: teamDisplayName || "Team",
        shortName: team?.abbreviation || team?.shortDisplayName || "",
        logo: resolvedLogo,
        color: team?.color ? `#${String(team.color).replace("#", "")}` : "#151515",
        leagueName: rosterJson?.team?.links?.[0]?.text || espnLeague,
        leagueRank: undefined,
        leaguePoints: undefined,
        leaguePlayed: undefined,
        venue: team?.venue?.fullName || team?.venue?.name || "",
        coach: team?.staff?.[0]?.displayName || "",
        record: "",
        players: enrichedPlayers,
        source: "espn",
      };
    });

    res.json(payload);
  } catch (e) {
    res.status(200).json({ team: null, stats: null, error: String(e?.message || e) });
  }
});

app.get("/api/sports/player/:playerId", async (req, res) => {
  const playerId = String(req.params.playerId || "").trim();
  const playerName = String(req.query?.name || "").trim();
  const teamName = String(req.query?.team || "").trim();
  const espnLeague = String(req.query?.league || "eng.1");
  const cacheKey = `player_profile_${playerId}_${playerName}_${teamName}_${espnLeague}`;

  try {
    const payload = await getOrFetch(cacheKey, 120_000, async () => {
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
      const valued =
        apifyFallback?.marketValue && !valuedFromModel?.marketValue
          ? {
              ...valuedFromModel,
              marketValue: apifyFallback.marketValue,
              isRealValue: true,
              valueMethod: "apify-transfermarkt",
            }
          : valuedFromModel;
      const fallbackInsights = inferStrengthsWeaknesses(valued?.position, valued?.age);
      const aiInsights = await aiAnalyzePlayerProfile(
        {
          ...valued,
          currentClub: profileStats?.team?.name || espnTeam?.displayName || espnTeam?.name || teamName || apifyFallback?.team || null,
          formerClubs: mapFormerClubs(apiSports?.transfers || []).length ? mapFormerClubs(apiSports?.transfers || []) : (apifyFallback?.formerClubs || []),
        },
        {
          league: espnLeague,
          source: apifyFallback?.source || apiSports?.source || "espn",
        }
      );

      const formerClubs = mapFormerClubs(apiSports?.transfers || []).length
        ? mapFormerClubs(apiSports?.transfers || [])
        : (apifyFallback?.formerClubs || []);
      const sourceTag = apifyFallback?.source || apiSports?.source || "espn";

      const clubName = profileStats?.team?.name || espnTeam?.displayName || espnTeam?.name || teamName || apifyFallback?.team || "";
      const basePhoto = normalizePlayerPhoto(
        valued?.id,
        profile?.photo,
        apifyFallback?.photo,
        espnAthlete?.headshot?.href,
      );
      let resolvedPhoto = basePhoto;
      if (!resolvedPhoto && clubName) {
        const dbPlayers = await fetchTheSportsDBTeamPlayers(clubName);
        const normName = normalizePersonName(name || "");
        for (const dbp of dbPlayers) {
          if (dbp.name === normName || similarityScore(normName, dbp.name) >= 0.6) {
            resolvedPhoto = dbp.photo;
            break;
          }
        }
      }
      // Final fallback: Wikipedia
      if (!resolvedPhoto && name && name !== "Onbekend") {
        resolvedPhoto = await fetchWikipediaPlayerPhoto(name) || null;
      }
      // TheSportsDB individual search fallback
      if (!resolvedPhoto && name && name !== "Onbekend") {
        try {
          const tsdbCacheKey = `tsdb_player_${normalizePersonName(name)}`;
          let tsdbPhoto = cacheGet(tsdbCacheKey);
          if (tsdbPhoto === null) {
            const tsdbResp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`, {
              headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
              signal: AbortSignal.timeout(4000),
            });
            if (tsdbResp.ok) {
              const tsdbData = await tsdbResp.json();
              tsdbPhoto = tsdbData?.player?.[0]?.strCutout || tsdbData?.player?.[0]?.strThumb || null;
              cacheSet(tsdbCacheKey, tsdbPhoto, 86_400_000);
            }
          }
          if (tsdbPhoto) resolvedPhoto = tsdbPhoto;
        } catch { /* ignore */ }
      }
      // ESPN CDN headshot probe if we have a numeric ESPN ID
      const espnPlayerId = String(espnAthlete?.id || valued?.id || "");
      if (!resolvedPhoto && espnPlayerId && /^\d+$/.test(espnPlayerId)) {
        const espnCacheKey = `espn_headshot_${espnPlayerId}`;
        let espnPhoto = cacheGet(espnCacheKey);
        if (espnPhoto === null) {
          const espnUrl = `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(espnPlayerId)}.png`;
          try {
            const espnResp = await fetch(espnUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
            espnPhoto = espnResp.ok ? espnUrl : null;
            cacheSet(espnCacheKey, espnPhoto, 86_400_000);
          } catch {
            cacheSet(espnCacheKey, null, 300_000);
          }
        }
        if (espnPhoto) resolvedPhoto = espnPhoto;
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

function pickTrailerKey(videos) {
  const items = videos?.results || [];
  const yt = items.filter(
    (v) =>
      (v.site || "").toLowerCase() === "youtube" &&
      (v.type || "").toLowerCase().includes("trailer")
  );
  return (yt[0] || items[0] || {})?.key || null;
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

  const trailerKey = pickTrailerKey(videos);

  const networks = (detail.networks || []).map((n) => n.name).filter(Boolean);
  const creators = (detail.created_by || []).map((n) => n.name).filter(Boolean);

  return {
    id: String(detail.id),
    tmdbId: Number(detail.id),
    type,
    title: detail.title || detail.name || "",
    tagline: detail.tagline || "",
    synopsis: detail.overview || "",
    poster,
    backdrop,
    trailerKey,
    year: (detail.release_date || detail.first_air_date || "").slice(0, 4),
    imdb: detail.vote_average ? String(Number(detail.vote_average).toFixed(1)) : null,
    rating: detail.vote_average ? String(Number(detail.vote_average).toFixed(1)) : null,
    duration: type === "movie" ? minutesToDuration(detail.runtime) : null,
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
    res.json(mapFullDetail(detail, videos, credits, mediaType));
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

    const id = req.params.id;
    const [detail, videos, credits] = await Promise.all([
      tmdb(`/movie/${encodeURIComponent(id)}`),
      tmdb(`/movie/${encodeURIComponent(id)}/videos`),
      tmdb(`/movie/${encodeURIComponent(id)}/credits`),
    ]);

    res.json(mapFullDetail(detail, videos, credits, "movie"));
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
});

app.get("/api/series/:id/full", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json(null);

    const id = req.params.id;
    const [detail, videos, credits] = await Promise.all([
      tmdb(`/tv/${encodeURIComponent(id)}`),
      tmdb(`/tv/${encodeURIComponent(id)}/videos`),
      tmdb(`/tv/${encodeURIComponent(id)}/credits`),
    ]);

    res.json(mapFullDetail(detail, videos, credits, "series"));
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
    const key = pickTrailerKey(videos);
    const result = { key, type: "youtube" };
    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000); // 24h
    res.json(result);
  } catch (e) {
    res.json({ key: null });
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
});
