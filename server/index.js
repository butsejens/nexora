import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

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
      return res.status(429).json({ error: "Te veel verzoeken. Probeer het later opnieuw." });
    }
    next();
  };
}

const playlistLimiter = makeRateLimiter(10, 15 * 60 * 1000); // 10 per 15min
const tmdbLimiter = makeRateLimiter(60, 60 * 1000);          // 60 per minute


const PORT = process.env.PORT || 8080;
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

  const startResp = await fetch(`${APIFY_BASE}/acts/${encodeURIComponent(actor)}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input || {}),
  });
  if (!startResp.ok) return [];

  const runData = await startResp.json().catch(() => null);
  const datasetId = runData?.data?.defaultDatasetId;
  if (!datasetId) return [];

  const itemsResp = await fetch(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&token=${encodeURIComponent(token)}`);
  if (!itemsResp.ok) return [];
  const items = await itemsResp.json().catch(() => []);
  return Array.isArray(items) ? items : [];
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
async function fetchWikipediaPlayerPhoto(playerName) {
  if (!playerName) return null;
  const normName = normalizePersonName(playerName);
  const cacheKey = `wikipedia_photo_${normName}`;
  const cacheItem = __cache.get(cacheKey);
  if (cacheItem && Date.now() <= cacheItem.expiresAt) return cacheItem.value;

  try {
    const wikiTitle = String(playerName).trim().replace(/ /g, "_");
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=400&format=json&origin=*`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "NexoraApp/1.0 (sports app)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) { cacheSet(cacheKey, null, 300_000); return null; }
    const data = await resp.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) { cacheSet(cacheKey, null, 300_000); return null; }
    const photo = page?.thumbnail?.source || null;
    cacheSet(cacheKey, photo, 86_400_000); // 24h
    return photo;
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

// Enrich null team logos on a list of matches using TheSportsDB (parallel, cached)
async function enrichMatchLogos(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;
  const needsLogo = matches.filter((m) => !m.homeTeamLogo || !m.awayTeamLogo);
  if (needsLogo.length === 0) return matches;

  const teamNames = [...new Set(
    needsLogo.flatMap((m) => [
      !m.homeTeamLogo && m.homeTeam ? m.homeTeam : null,
      !m.awayTeamLogo && m.awayTeam ? m.awayTeam : null,
    ].filter(Boolean))
  )];

  const logoMap = Object.fromEntries(
    await Promise.all(teamNames.map(async (name) => [name, await fetchTheSportsDBTeamLogo(name)]))
  );

  return matches.map((m) => ({
    ...m,
    homeTeamLogo: m.homeTeamLogo || logoMap[m.homeTeam] || null,
    awayTeamLogo: m.awayTeamLogo || logoMap[m.awayTeam] || null,
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

function estimateMarketValueEUR(player) {
  const age = Number(player?.age || 0);
  const pos = String(player?.position?.abbreviation || player?.position || "").toUpperCase();
  const baseByPos = pos.includes("GK") ? 5_000_000 : pos.includes("CB") || pos.includes("LB") || pos.includes("RB") ? 8_000_000 : pos.includes("CM") || pos.includes("DM") || pos.includes("AM") ? 12_000_000 : 10_000_000;
  let ageFactor = 1;
  if (age > 0 && age < 21) ageFactor = 1.25;
  else if (age <= 24) ageFactor = 1.15;
  else if (age <= 28) ageFactor = 1.0;
  else if (age <= 31) ageFactor = 0.82;
  else if (age > 31) ageFactor = 0.65;
  return Math.max(1_000_000, Math.round(baseByPos * ageFactor));
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

async function aiEstimateRosterValues(players, teamName) {
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

  const prompt = [
    "Geef realistische EUR marktwaardes voor profvoetballers.",
    "Output strikt JSON object: {\"players\":[{\"id\":\"...\",\"value_eur\":12345678}]}",
    "Geen tekst buiten JSON.",
    `Team: ${teamName || "Unknown"}`,
    JSON.stringify(compact),
  ].join("\n");

  try {
    const sys = { role: "system", content: "Je bent een voetbal transferanalist. Altijd geldige JSON." };
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

async function enrichRosterMarketValues(players, teamName) {
  if (!Array.isArray(players) || players.length === 0) return players || [];

  const aiValues = await aiEstimateRosterValues(players, teamName);
  return players.map((p) => {
    const next = { ...p };
    const aiValue = aiValues?.get?.(String(next.id || ""));
    if (Number.isFinite(aiValue) && aiValue > 0) {
      next.marketValue = formatEURShort(aiValue);
      next.isRealValue = true;
      next.valueMethod = "ai-model";
      return next;
    }

    const estimated = estimateMarketValueEUR(next);
    if (Number.isFinite(estimated) && estimated > 0) {
      next.marketValue = formatEURShort(estimated);
      next.isRealValue = false;
      next.valueMethod = "estimated";
    }
    return next;
  });
}

async function enrichRosterPhotos(players, teamName) {
  if (!Array.isArray(players) || players.length === 0) return players || [];
  const needsPhoto = players.some((p) => p && !p.photo);
  if (!needsPhoto) return players;

  // Step 1: TheSportsDB – batch fetch all players for team (cached 24h)
  const dbPlayers = await fetchTheSportsDBTeamPlayers(teamName);
  let enriched = players.map((player) => {
    if (!player || player.photo) return player;
    const normName = normalizePersonName(player.name || "");
    if (!normName) return player;
    let best = null;
    let bestScore = 0;
    for (const dbp of dbPlayers) {
      if (dbp.name === normName) { best = dbp; break; }
      const score = similarityScore(normName, dbp.name);
      if (score > bestScore && score >= 0.6) { best = dbp; bestScore = score; }
    }
    if (best) return { ...player, photo: best.photo };
    return player;
  });

  // Step 2: Wikipedia fallback – lookup remaining players without photo (parallel, cached 24h)
  const stillNeed = enriched.filter((p) => p && !p.photo && p.name);
  if (stillNeed.length > 0) {
    const wikiResults = await Promise.allSettled(
      stillNeed.map((p) => fetchWikipediaPlayerPhoto(p.name))
    );
    const wikiMap = new Map();
    stillNeed.forEach((p, i) => {
      const res = wikiResults[i];
      if (res.status === "fulfilled" && res.value) wikiMap.set(p.name || "", res.value);
    });
    if (wikiMap.size > 0) {
      enriched = enriched.map((player) => {
        if (!player || player.photo) return player;
        const photo = wikiMap.get(player.name || "");
        return photo ? { ...player, photo } : player;
      });
    }
  }

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
    content: "Je bent een professionele voetbal scout. Antwoord strikt in JSON.",
  };
  const user = {
    role: "user",
    content:
      "Maak een korte objectieve speleranalyse op basis van de inputdata. Verzín geen clubs of statistieken buiten de input. Output alleen geldig JSON met keys: summary, strengths (array), weaknesses (array).\\n\\nINPUT:\\n" +
      JSON.stringify({ player, context }, null, 2),
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
  "Premier League": ["#2a004f", "#120024"],
  "UEFA Champions League": ["#001a4d", "#000b1f"],
  "UEFA Europa League": ["#4a2200", "#1d0e00"],
  "UEFA Conference League": ["#00483f", "#001f1b"],
  "La Liga": ["#4a0012", "#1f0008"],
  "Bundesliga": ["#3a0000", "#160000"],
  "Jupiler Pro League": ["#003014", "#00140a"],
  "Ligue 1": ["#1a0033", "#0c0018"],
  "Serie A": ["#330011", "#140007"],
};

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

async function resolveBestStreamUrl(matchId) {
  const id = String(matchId || "");
  const cached = STREAM_URL_CACHE.get(id);
  if (cached && Date.now() - cached.ts < 2 * 60 * 1000) {
    return cached.url;
  }

  const candidates = buildStreamCandidates(id);
  for (const candidate of candidates) {
    const ok = await probeUrl(candidate);
    if (ok) {
      STREAM_URL_CACHE.set(id, { url: candidate, ts: Date.now() });
      return candidate;
    }
  }

  const fallback = candidates[0];
  STREAM_URL_CACHE.set(id, { url: fallback, ts: Date.now() });
  return fallback;
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
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deterministicPrediction(payload) {
  const homeScore = toNum(payload?.homeScore);
  const awayScore = toNum(payload?.awayScore);
  const minute = toNum(payload?.minute);

  const homeStats = payload?.stats?.home || {};
  const awayStats = payload?.stats?.away || {};
  const homePoss = toNum(homeStats.possessionPct);
  const awayPoss = toNum(awayStats.possessionPct);
  const homeShots = toNum(homeStats.totalShots);
  const awayShots = toNum(awayStats.totalShots);
  const homeSot = toNum(homeStats.shotsOnTarget);
  const awaySot = toNum(awayStats.shotsOnTarget);

  const scoreEdge = (homeScore - awayScore) * 22;
  const shotEdge = (homeShots - awayShots) * 1.8;
  const sotEdge = (homeSot - awaySot) * 4.2;
  const possEdge = (homePoss - awayPoss) * 0.25;
  const rawEdge = scoreEdge + shotEdge + sotEdge + possEdge;

  const sigmoid = (x) => 1 / (1 + Math.exp(-x / 20));
  const baseHome = sigmoid(rawEdge);
  const baseAway = 1 - baseHome;

  let drawPct = Math.max(8, 28 - Math.abs(rawEdge) * 0.35);
  if (minute >= 75 && Math.abs(homeScore - awayScore) === 0) drawPct += 8;
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

  const confidence = Math.max(homePct, awayPct, drawPct);

  const hasXgInputs = (homeShots + awayShots + homeSot + awaySot) > 0;
  const xgHome = hasXgInputs ? Number((Math.max(0, homeShots * 0.08 + homeSot * 0.22)).toFixed(2)) : null;
  const xgAway = hasXgInputs ? Number((Math.max(0, awayShots * 0.08 + awaySot * 0.22)).toFixed(2)) : null;

  const predictedHome = xgHome == null ? homeScore : Math.max(homeScore, xgToGoals(xgHome) + (minute > 70 ? 0 : 0));
  const predictedAway = xgAway == null ? awayScore : Math.max(awayScore, xgToGoals(xgAway) + (minute > 70 ? 0 : 0));

  const keyFactors = [];
  if (homePoss || awayPoss) keyFactors.push(`Balbezit ${homePoss || 0}% - ${awayPoss || 0}%`);
  if (homeShots || awayShots) keyFactors.push(`Schoten ${homeShots || 0} - ${awayShots || 0}`);
  if (homeSot || awaySot) keyFactors.push(`Op doel ${homeSot || 0} - ${awaySot || 0}`);
  if (minute) keyFactors.push(`Wedstrijdminuut ${minute}`);

  const tacticalNotes = [];
  if (Math.abs(homeSot - awaySot) >= 2) {
    tacticalNotes.push(homeSot > awaySot ? "Thuisploeg creëert de grootste kansen." : "Uitploeg creëert de grootste kansen.");
  }
  if (Math.abs(homePoss - awayPoss) >= 10) {
    tacticalNotes.push(homePoss > awayPoss ? "Thuisploeg controleert het tempo via balbezit." : "Uitploeg controleert het tempo via balbezit.");
  }
  if (tacticalNotes.length === 0) {
    tacticalNotes.push("Match is tactisch in evenwicht op basis van de huidige cijfers.");
  }

  return {
    prediction,
    confidence,
    predictedScore: `${predictedHome}-${predictedAway}`,
    homePct,
    drawPct,
    awayPct,
    xgHome,
    xgAway,
    momentum: homePct > awayPct ? "Home" : awayPct > homePct ? "Away" : "Balanced",
    danger: homeSot > awaySot ? "Home Attack" : awaySot > homeSot ? "Away Attack" : "Balanced",
    riskLevel: confidence >= 65 ? "Low" : confidence >= 52 ? "Medium" : "High",
    summary: "Analyse op basis van live score en wedstrijdstatistieken (provider-onafhankelijke fallback).",
    keyFactors,
    tacticalNotes,
    tip: prediction === "Draw" ? "Gelijkspel blijft plausibel; let op late kansen." : `${prediction === "Home Win" ? "Thuisploeg" : "Uitploeg"} heeft statistisch voordeel op dit moment.`,
    source: "fallback-stats",
    updatedAt: new Date().toISOString(),
    insufficientData: !hasXgInputs,
    unavailableReason: !hasXgInputs ? "Onvoldoende data voor xG" : null,
  };
}

async function aiPredictMatch(payload) {
  const hasAnyProvider = Boolean(
    process.env.OLLAMA_MODEL ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY
  );

  // Zilliz cache check – skip for live matches (status=live) as they change rapidly
  const isLive = String(payload?.status || "").toLowerCase() === "live";
  const homeTeam = String(payload?.homeTeam || "");
  const awayTeam = String(payload?.awayTeam || "");
  const league = String(payload?.league || "");
  const zPredKey = `${homeTeam}_vs_${awayTeam}_${league}`;
  if (!isLive && _zillizReady) {
    const zCached = await zillizGet("match_prediction", zPredKey);
    if (zCached?.prediction) return { ...zCached, fromCache: true };
  }

  if (!hasAnyProvider) {
    return deterministicPrediction(payload);
  }

  const sys = {
    role: "system",
    content:
      "Je bent een professionele sportanalist. Antwoord kort en gestructureerd in JSON.",
  };
  const user = {
    role: "user",
    content:
      "Geef een voorspelling voor deze match op basis van de aangeleverde echte wedstrijdata (score, minuut, statistieken, events). Verzín geen extra feiten of vormreeksen die niet in de input staan. Output ALLEEN geldig JSON met keys: prediction (Home Win/Away Win/Draw), confidence (0-100), predictedScore, homePct, drawPct, awayPct, xgHome, xgAway, summary, keyFactors (array), tacticalNotes (array), momentum, danger, riskLevel, tip.\n\nINPUT:\n" +
      JSON.stringify(payload, null, 2),
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
    ...deterministicPrediction(payload),
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
  };
  const aiReady = Object.values(aiProviders).some(Boolean);
  res.json({ ok: true, time: new Date().toISOString(), source: footballSource(), tz: TZ, aiReady, aiProviders, zilliz: _zillizReady });
});

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${JSON.stringify(req.query)}`);
  next();
});

// -----------------------------
// Sports endpoints expected by the app
// -----------------------------

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
        const live = await enrichMatchLogos(events
          .map(mapEspnEventToMatch)
          .filter((m) => m.status === "live" && m.league));
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
        enrichMatchLogos(liveRaw),
        enrichMatchLogos(upcomingRaw),
        enrichMatchLogos(finishedRaw),
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

        const details = (summary?.details || []).map((d) => ({
          time: d?.clock?.displayValue || d?.clock?.value || null,
          extra: null,
          team: d?.team?.displayName || "",
          teamLogo: d?.team?.logo || null,
          type: d?.type?.text || d?.type || "",
          detail: d?.text || "",
          player: d?.athletesInvolved?.[0]?.displayName || "",
          assist: "",
        }));

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

        return {
          ...mapped,
          homeTeamId: String(home?.team?.id || mapped.homeTeamId || ""),
          awayTeamId: String(away?.team?.id || mapped.awayTeamId || ""),
          venue: headerComp?.venue?.fullName || summary?.gameInfo?.venue?.fullName || "",
          city: headerComp?.venue?.address?.city || summary?.gameInfo?.venue?.address?.city || "",
          referee: summary?.gameInfo?.officials?.[0]?.displayName || "",
          round: summary?.header?.season?.type?.name || "",
          homeStats: {},
          awayStats: {},
          keyEvents: details,
          starters: espnLineups.length > 0 ? starters : [],
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

      return {
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
        name: ath.displayName || ath.fullName || "",
        photo: ath.headshot?.href || (athleteId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(athleteId)}.png` : null),
        team: ath.team?.displayName || ath.team?.name || "",
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
          console.log(`[topscorers] ${leagueName}: ESPN → ${scorers.length} scorers`);
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
      const valuedPlayers = await enrichRosterMarketValues(players, team?.displayName || team?.name || teamNameFromQuery || "");
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
      const resolvedLogo = baseLogo || await fetchTheSportsDBTeamLogo(teamDisplayName) || null;

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

      const valuedFromModel = (await enrichRosterMarketValues([normalizedPlayer], teamName || profileStats?.team?.name || espnTeam?.displayName || ""))[0] || normalizedPlayer;
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
      const baseClubLogo = normalizeTeamLogo(
        clubName,
        profileStats?.team?.logo || espnTeam?.logo || espnTeam?.logos?.[0]?.href || apifyFallback?.teamLogo || null
      );
      const resolvedClubLogo = baseClubLogo || await fetchTheSportsDBTeamLogo(clubName) || null;

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
    if (!matchId) return res.status(400).json({ error: "Missing matchId" });
    const url = await resolveBestStreamUrl(matchId);
    const candidates = buildStreamCandidates(matchId);
    return res.json({ matchId, url, candidates, source: "auto" });
  } catch (e) {
    return res.status(200).json({ matchId: String(req.params.matchId || ""), url: buildStreamCandidates(String(req.params.matchId || ""))[0], source: "fallback", error: String(e?.message || e) });
  }
});

// -----------------------------
// M3U playlist parsing endpoints
// -----------------------------

function classifyCategory(group) {
  const g = String(group || "").toLowerCase();
  if (g.includes("series") || g.includes("tv shows") || g.includes("show")) return "series";
  if (g.includes("movie") || g.includes("film") || g.includes("vod") || g.includes("cinema")) return "movie";
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
      const category = classifyCategory(group);

      current = {
        id: `${attr["tvg-id"] || ""}${name || attr["tvg-name"] || ""}`.trim() || `${Date.now()}_${Math.random()}`,
        name: name || attr["tvg-name"] || "Unknown",
        title: name || attr["tvg-name"] || "Unknown",
        group,
        logo: attr["tvg-logo"] || null,
        tvgId: attr["tvg-id"] || null,
        category,
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
      items.push(current);
      current = null;
    }
  }

  const live = items.filter((c) => c.category === "live");
  const movies = items.filter((c) => c.category === "movie");
  const series = items.filter((c) => c.category === "series");

  return { live, movies, series };
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
    seasons: type === "series" ? (detail.number_of_seasons ?? null) : null,
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
    if (!process.env.TMDB_API_KEY) return res.json({ trending: [], newReleases: [], topRated: [] });

    const [trending, nowPlaying, topRated] = await Promise.all([
      tmdb("/trending/movie/week"),
      tmdb("/movie/now_playing"),
      tmdb("/movie/top_rated"),
    ]);

    res.json({
      trending: (trending?.results || []).map((it) => mapTrendingItem(it, "movie")),
      newReleases: (nowPlaying?.results || []).map((it) => mapTrendingItem(it, "movie")),
      topRated: (topRated?.results || []).map((it) => mapTrendingItem(it, "movie")),
    });
  } catch (e) {
    res.status(200).json({ trending: [], newReleases: [], topRated: [], error: String(e?.message || e) });
  }
});

app.get("/api/series/trending", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ trending: [], newReleases: [], topRated: [] });

    const [trending, onTheAir, topRated] = await Promise.all([
      tmdb("/trending/tv/week"),
      tmdb("/tv/on_the_air"),
      tmdb("/tv/top_rated"),
    ]);

    res.json({
      trending: (trending?.results || []).map((it) => mapTrendingItem(it, "series")),
      newReleases: (onTheAir?.results || []).map((it) => mapTrendingItem(it, "series")),
      topRated: (topRated?.results || []).map((it) => mapTrendingItem(it, "series")),
    });
  } catch (e) {
    res.status(200).json({ trending: [], newReleases: [], topRated: [], error: String(e?.message || e) });
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
// -----------------------------
// Start
// -----------------------------
app.listen(PORT, () => {
  console.log(`Nexora server running on :${PORT} (sports source: ${footballSource()})`);
  // Initialiseer Zilliz vector cache (non-blocking)
  zillizInit().catch(() => {});
});
