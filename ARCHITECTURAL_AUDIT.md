# Nexora — Full Architectural Audit
*Generated after reading all backend and client code. Intended for use in planning a full rewrite.*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [server/index.js — Route Inventory](#2-serverindexjs--route-inventory)
3. [server/data/](#3-serverdata)
4. [server/update-manifest.json + update-manifest.js](#4-serverupdate-manifestjson--update-manifestjs)
5. [app/api/](#5-appapi)
6. [app/services/](#6-appservices)
7. [app/lib/services/](#7-applibservices)
8. [app/lib/](#8-applib)
9. [cloudflare/sports-worker/](#9-cloudflaresports-worker)
10. [app/features/](#10-appfeatures)
11. [app/constants/](#11-appconstants)
12. [External API Catalogue](#12-external-api-catalogue)
13. [Full Problem Register](#13-full-problem-register)
14. [Caching Architecture Map](#14-caching-architecture-map)
15. [Rewrite Recommendations](#15-rewrite-recommendations)

---

## 1. Executive Summary

Nexora is a React Native/Expo app backed by a **Node.js/Express monolith** (`server/index.js`, **11,691 lines**). The server is hosted on Render free tier behind a Cloudflare Worker cache proxy. The app covers: live sports scores, match detail, league standings, player/team profiles, AI-generated analysis, IPTV playlist management, VOD (TMDB movies/series), trailer playback, EPG, radio stations, and OTA/native app updates.

**Critical facts going into a rewrite:**
- The backend is a single god-file with **92 routes**, all business logic, all enrichment pipelines, all scraping helpers, and all static data tables.
- The primary sports data source is **ESPN's undocumented public API** (no key, TOS ambiguous). Sofascore and Transfermarkt are **scraped directly** in violation of their terms.
- There are **four independent caching layers** (Cloudflare KV → Cloudflare D1 → Render Redis → server in-memory Map) with no unified TTL or invalidation strategy.
- Client-side code **re-enriches** data that the server already enriched — duplicating business logic across the wire.
- Session tracking, user followed-teams, device concurrency limits, and IPTV state are all stored in **in-memory Maps** that vanish on every server restart.

---

## 2. server/index.js — Route Inventory

### File Facts
- **Size**: 11,691 lines
- **Structure**: Single Express app file. No router splitting. All helpers, all business logic, all static dictionaries, and all route handlers live in the same file.
- **Language**: Dutch/English mixed (comments, AI prompts, error messages, variable names).

### Complete Route Map

| Method | Path | Purpose | Cache TTL | Rate Limiter | External Calls |
|--------|------|---------|-----------|--------------|----------------|
| GET | `/` | Root info JSON | none | – | – |
| GET | `/health` | Health check incl. AI/Zilliz status | `no-store` | – | – |
| GET | `/downloads/apk/:fileName` | Serve APK from `public/downloads/` | – | – | filesystem |
| GET | `/api/sports/health` | Alias health | – | – | – |
| GET | `/api/ping` | Ping | – | – | – |
| GET | `/api/config-check` | Boolean flags for configured integrations | – | – | – |
| GET | `/api/espn/catalog` | Static JSON of league/sport metadata | – | – | – |
| GET | `/api/espn/public` | **Full ESPN API proxy passthrough** | 30s | – | ESPN |
| GET | `/api/app-updates/manifest` | Full update manifest JSON | `no-store` | – | filesystem |
| GET | `/api/app-updates/ota` | OTA channel metadata | `no-store` | – | filesystem |
| GET | `/api/app-updates/native` | APK download links + SHA256 | `no-store` | – | filesystem |
| GET | `/api/img` | Image proxy (Transfermarkt/ESPN/TMDB/Sofascore) | `public, max-age=86400` | – | upstream image CDN |
| GET | `/api/sports/menu-tools` | Match predictions + acca picks (AI-enhanced) | 45s | – | ESPN + Sofascore + all AI providers |
| GET | `/api/sports/live` | Live matches (ESPN → Sofascore enrichment) | 10s | – | ESPN + Sofascore |
| GET | `/api/sports/live/by-date` | 307 redirect to `/api/sports/by-date` | – | – | – |
| GET | `/api/sports/by-date` | Matches by date (ESPN or api-football → Sofascore) | 45s today, 10m past | – | ESPN + Sofascore + Football Logos GitHub |
| GET | `/api/sports/today` | Alias — internally re-routes to `/api/sports/by-date` | – | – | – |
| GET | `/api/sports/highlights` | Match highlight video embeds | 10m | – | ScoreBat free API |
| GET | `/api/sports/prefetch-home` | Cache warmer — makes **self-HTTP calls** to 8 standings/scorers endpoints | – | – | self (HTTP) |
| GET | `/api/sports/match/:matchId` | Match detail + lineups + stats + events | 10s | – | ESPN + Sofascore (3× fallback calls) + TM (market values) |
| GET | `/api/sports/standings/:league` | League standings | 5m | – | ESPN standings API |
| GET | `/api/sports/topscorers/:league` | Top goal scorers | 10m | – | ESPN core API → HTML scrape fallback |
| GET | `/api/sports/topassists/:league` | Top assist providers | 10m | – | ESPN core API |
| GET | `/api/sports/competition-stats/:league` | Competition aggregate stats | 10m | – | ESPN |
| GET | `/api/sports/competition-matches/:league` | Competition match list | 10m | – | ESPN |
| GET | `/api/sports/competition-teams/:league` | Competition team list | 10m | – | ESPN |
| GET | `/api/sports/team/:teamId` | Team detail + roster (w/ market values + photos) | 30m | – | ESPN × 4 variants + TM + TheSportsDB + Football Logos |
| GET | `/api/sports/player/:playerId` | Player profile (w/ photo + market value + transfers) | 10m | – | ESPN + TM + TheSportsDB + Wikipedia + Apify + multiple AI |
| GET | `/api/sports/player-analysis/:playerId` | AI-generated player analysis (JSON) | 30d file cache | – | all AI providers + Zilliz |
| GET | `/api/sports/player-analysis-stream/:playerId` | SSE streaming player analysis | – | – | all AI providers |
| GET | `/api/sports/team/:teamId/player-quality` | Data quality report (makes internal HTTP call to team endpoint!) | – | – | self (HTTP) |
| GET | `/api/sports/multisport/scoreboard` | Multi-sport scoreboard (basketball, NFL, MLB, etc.) | – | – | ESPN (all sport leagues in parallel) |
| GET | `/api/sports/news` | ESPN sports news | – | – | ESPN now.core API |
| GET | `/api/sports/match/:matchId/odds` | Match betting odds | – | – | ESPN (bet-odds API undocumented) |
| GET | `/api/sports/multisport/teams` | Multi-sport team list | – | – | ESPN |
| GET | `/api/sports/multisport/standings` | Multi-sport standings | – | – | ESPN |
| GET | `/api/sports/multisport/game/:gameId` | Multi-sport game detail | – | – | ESPN |
| GET | `/api/sports/multisport/teams/:teamId` | Multi-sport team detail | – | – | ESPN |
| GET | `/api/sports/multisport/rankings` | Multi-sport rankings (tennis, golf, etc.) | – | – | ESPN |
| GET | `/api/sports/stream/:matchId` | Stream URL lookup (from IPTV playlist) | – | – | none |
| POST | `/api/playlist/parse` | Parse M3U/M3U8 playlist URL | – | `playlistLimiter` | user-provided URL (SSRF-mitigated) |
| POST | `/api/playlist/activate` | Store/activate IPTV playlist | – | `playlistLimiter` | – |
| POST | `/api/playlist/xtream` | Xtream Codes API proxy | – | `playlistLimiter` | user-provided Xtream host |
| GET | `/api/movies/trending` | TMDB trending movies | – | `tmdbLimiter` | TMDB |
| GET | `/api/series/trending` | TMDB trending series | – | `tmdbLimiter` | TMDB |
| GET | `/api/movies/discover-by-genre` | TMDB genre discovery | – | `tmdbLimiter` | TMDB |
| GET | `/api/series/discover-by-genre` | TMDB genre discovery | – | `tmdbLimiter` | TMDB |
| GET | `/api/tmdb/search` | TMDB search | – | `tmdbLimiter` | TMDB |
| GET | `/api/search/multi` | TMDB multi-entity search | – | `tmdbLimiter` | TMDB |
| GET | `/api/recommendations/for-you` | Personalized recommendations | – | `tmdbLimiter` | TMDB |
| GET | `/api/recommendations/similar/:id` | Similar content | – | `tmdbLimiter` | TMDB |
| GET | `/api/movies/:id/full` | Full movie detail (TMDB + OMDB merge) | – | `tmdbLimiter` | TMDB + OMDB |
| GET | `/api/series/:id/full` | Full series detail (TMDB + OMDB merge) | – | `tmdbLimiter` | TMDB + OMDB |
| GET | `/api/series/:id/season/:seasonNumber` | Season episode list | – | `tmdbLimiter` | TMDB |
| GET | `/api/vod/collection` | VOD collection (TMDB collection) | – | `tmdbLimiter` | TMDB |
| GET | `/api/vod/studio` | VOD studio catalog | – | `tmdbLimiter` | TMDB |
| GET | `/api/vod/catalog` | Full VOD catalog (genre × type) | – | `tmdbLimiter` | TMDB (multiple parallel calls) |
| GET | `/api/movies/genres-catalog` | Movies by genre | – | `tmdbLimiter` | TMDB |
| GET | `/api/series/genres-catalog` | Series by genre | – | `tmdbLimiter` | TMDB |
| GET | `/api/movies/all` | All movies paginated | – | `tmdbLimiter` | TMDB |
| GET | `/api/series/all` | All series paginated | – | `tmdbLimiter` | TMDB |
| GET | `/api/movies/decades` | Movies by decade | – | `tmdbLimiter` | TMDB |
| GET | `/api/series/decades` | Series by decade | – | `tmdbLimiter` | TMDB |
| GET | `/api/movies/archive` | Archive movies (TMDB + OMDB year ranges) | – | – | TMDB + OMDB |
| GET | `/api/subtitles/:tmdbId` | OpenSubtitles search | – | `tmdbLimiter` | OpenSubtitles API |
| GET | `/api/subtitles/download/:fileId` | Subtitle file download | – | – | OpenSubtitles API |
| POST | `/api/stream/validate` | HEAD-check stream URL | – | `playlistLimiter` | user-provided stream URL |
| GET | `/api/epg` | TV guide EPG data | – | – | user EPG URL from IPTV settings |
| GET | `/api/epg/now/:channelId` | Currently airing program | – | – | – |
| GET | `/api/trailer/:tmdbId` | TMDB video trailer | – | `tmdbLimiter` | TMDB |
| GET | `/api/homepage` | Aggregated homepage (trending + sports + highlights) | – | `tmdbLimiter` | TMDB + ESPN + ScoreBat |
| POST | `/api/recommendations/batch` | Batch recommendations for watch history | – | `tmdbLimiter` | TMDB |
| GET | `/api/search/unified` | Cross-domain search (sports + VOD) | – | `tmdbLimiter` | TMDB + ESPN |
| GET | `/api/stream/proxy-headers` | **Static** CDN headers JSON | – | – | – |
| GET | `/api/stream/quality-levels` | **Static** quality levels JSON | – | – | – |
| GET | `/api/stream/sign` | HMAC-SHA256 stream URL signing | – | – | – |
| GET | `/api/stream/verify` | HMAC stream token verification | – | – | – |
| POST | `/api/session/start` | Register device session | – | – | – |
| POST | `/api/session/heartbeat` | Keep session alive | – | – | – |
| POST | `/api/session/stop` | End session | – | – | – |
| GET | `/api/session/status` | Get session status | – | – | – |
| GET | `/api/user/followed-teams` | Get followed teams | – | – | – |
| POST | `/api/user/followed-teams` | Follow a team | – | – | – |
| DELETE | `/api/user/followed-teams/:teamId` | Unfollow a team | – | – | – |
| GET | `/api/movies/:id/providers` | TMDB streaming providers (Where to Watch) | – | `tmdbLimiter` | TMDB |
| GET | `/api/series/:id/providers` | TMDB streaming providers | – | `tmdbLimiter` | TMDB |
| GET | `/api/tvmaze/search` | TVMaze series search | – | – | TVMaze |
| GET | `/api/tvmaze/show/imdb/:imdbId` | TVMaze lookup by IMDB ID | – | – | TVMaze |
| GET | `/api/tvmaze/schedule` | TVMaze airing schedule | – | – | TVMaze |
| GET | `/api/radio/stations` | Radio station search | – | – | radio-browser.info |
| GET | `/api/radio/top` | Top radio stations | – | – | radio-browser.info |
| GET | `/api/weather` | Weather data | – | – | open-meteo.com |

### Key Static Lookup Tables (in-code, require deploy to update)

| Table | Size | Purpose |
|-------|------|---------|
| `ESPN_LEAGUE_SCOREBOARDS` | 30 entries | Soccer league ESPN slugs |
| `ESPN_MULTISPORT_LEAGUES` | 17 sports | Multi-sport league-to-slug map |
| `TEAM_LOGO_ALIASES` | ~300 entries | Team name → logo alias normalization |
| `TEAM_FILENAME_TO_FOLDER` | ~300 entries | Logo filename → GitHub folder path |
| `TM_CLUB_NAME_MAP` | 40+ entries | ESPN team name → Transfermarkt name |
| `NATIONAL_TEAM_IDS` | 50+ entries | Country name → ESPN team ID |
| `NATIONAL_TEAM_IDS_BY_CODE` | 50+ entries | ISO country code → ESPN team ID |
| `ESPN_LEAGUE_SLUGS` | ~80 entries | League human name → ESPN slug |
| `ESPN_STATS_LEAGUE_CODES` | ~60 entries | League name → ESPN stats code |
| `LEAGUE_IDS` | ~30 entries | Canonical league slug → ID |

### Route-Level Problems

**R1 — `/api/espn/public` is an open proxy.**
```js
app.get("/api/espn/public", async (req, res) => {
  // Forwards any path from req.query.path to ESPN
```
Any client can call `?path=/v2/sports/soccer/eng.1/teams` or any other ESPN endpoint. No path allowlist, no output normalization, no rate limit. An attacker can use this to enumerate all ESPN data or cause DDOS spikes against ESPN.

**R2 — `/api/sports/prefetch-home` makes internal HTTP calls to itself.**
```js
const base = `${req.protocol}://${req.get("host")}`;
const results = await Promise.allSettled([
  fetch(`${base}/api/sports/standings/bel.1`),
  ...
```
Self-referential HTTP is fragile, wasteful, and breaks in environments where `req.get("host")` is incorrect (reverse proxies, Cloudflare). It also double-counts request logging.

**R3 — `/api/sports/team/:teamId/player-quality` makes an internal HTTP call to `/api/sports/team/:teamId`.**
```js
const detailResp = await fetch(`${origin}/api/sports/team/${teamId}?...`);
```
Same issue as R2. Roundtrips through the full network stack for data that could be called as a function.

**R4 — `/api/sports/stream/:matchId` reveals IPTV stream URLs.**
This endpoint returns stored stream URLs from the in-memory activation store, which may contain private IPTV credentials. Any client with a valid `matchId` can retrieve URLs for matches they don't own.

**R5 — `/api/playlist/xtream` proxies arbitrary user-provided hosts.**
```js
app.post("/api/playlist/xtream", playlistLimiter, async (req, res) => {
  const { server, username, password } = req.body;
  fetch(`${server}/player_api.php?username=${username}&password=${password}...`)
```
`server` is user-provided. Although the intent is to proxy Xtream Codes servers, this is effectively an SSRF vector if not strictly validated. The current code has no host validation or allowlist.

**R6 — `/api/stream/sign` returns the original URL unmodified.**
```js
res.json({ signedUrl: url, token: signature, expires, ip });
```
The `signedUrl` field is just the original URL, not a signed/proxied URL — the signing is purely advisory. Any downstream consumer that checks only `signedUrl` without verifying the token gets no protection.

**R7 — `activeSessions`, `ipHistory`, `followedTeams` are in-memory Maps.**
```js
const activeSessions = new Map();
const ipHistory = new Map();
```
These vanish on every server restart. Concurrent stream limiting and account-sharing detection are completely reset. User followed-teams state is also lost.

**R8 — Top scorers fallback to **HTML scraping** ESPN's public website.**
```js
async function espnTopScorersFromHtml(leagueName) {
  const url = `https://www.espn.com/soccer/stats/_/league/${code}`;
  ...
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
```
HTML scraping breaks silently on any ESPN layout change. Regex-based HTML parsing is fragile. This is also not rate-limited.

**R9 — `STREAM_SIGNING_SECRET` regenerates on every restart.**
```js
const STREAM_SIGNING_SECRET = process.env.STREAM_SIGNING_SECRET || crypto.randomBytes(32).toString("hex");
```
Without `STREAM_SIGNING_SECRET` in env, all signed tokens become invalid on restart, invalidating all in-flight sessions.

**R10 — Dutch AI prompts hardcoded.**
```js
content: "Je bent een voetbalanalist. Geef enkel geldige JSON zonder markdown of extra tekst.",
```
AI prompts in Dutch reduce portability and LLM compatibility. Many models perform better in English. Language should be a parameter, not hardcoded in the prompt.

---

## 3. server/data/

### Files

```
server/data/
└── player-analysis-cache.json
```

**Format** (`player-analysis-cache.json`):
```json
{
  "version": 1,
  "items": {
    "<cacheKey>": {
      "playerId": "...",
      "name": "...",
      "language": "nl",
      "analysis": { ... },
      "updatedAt": "<ISO timestamp>"
    }
  }
}
```

**Purpose**: Persistent store for AI-generated player analysis. TTL is 30 days per item, checked by comparing `updatedAt` to `Date.now()`.

**Read/Write code** (server/index.js):
```js
const ANALYSIS_CACHE_FILE = path.join(__dirname, "data", "player-analysis-cache.json");

async function readAnalysisCacheFile() {
  try {
    const raw = await fs.readFile(ANALYSIS_CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch { return { version: 1, items: {} }; }
}

async function writeAnalysisCacheFile(data) {
  await fs.writeFile(ANALYSIS_CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
}
```

### Problems

**D1 — Ephemeral filesystem on Render.**
Render's free-tier containers have an **ephemeral disk** — the filesystem is wiped on every deploy and after extended idle periods. All AI-generated analysis data is lost on every deploy. The file store is an illusion of persistence.

**D2 — No write locking / race conditions.**
Multiple concurrent requests can read-parse-modify-write the JSON file simultaneously. Under load, writes can corrupt or overwrite each other (`read → parallel writes → last write wins`).

**D3 — Unbounded growth.**
There is no eviction strategy beyond TTL. The file grows indefinitely. No maximum size limit. On a Render free tier with a small disk quota, this will eventually fail silently.

**D4 — File I/O on every cache miss blocks the event loop.**
`fs.readFile` + `JSON.parse` on a large cache file on every player analysis request adds latency proportional to file size.

---

## 4. server/update-manifest.json + update-manifest.js

### server/update-manifest.json

```json
{
  "version": "2.6.32",
  "versionCode": 20632,
  "releaseDate": "2026-04-02",
  "releaseNotes": "...",
  "apkUrl": "https://github.com/JensD98/nexora/releases/download/v2.6.32/nexora-v2.6.32.apk",
  "ota": {
    "strategy": "expo-updates",
    "channel": "production",
    "runtimeVersion": "2.6.32",
    "updateUrl": "https://u.expo.dev/..."
  },
  "server": {
    "requiredMinVersion": "2.5.0",
    "requiresAppUpdate": false,
    "maintenanceMode": false
  }
}
```

### server/update-manifest.js

Exports:
- `loadUpdateManifest()` — reads and parses JSON
- `resolveNativeApkTargets(manifest)` — scans `public/downloads/` for APK files, computes SHA256 per file
- `buildUpdateManifestResponse(req)` — merges manifest + resolved APKs
- `buildOtaMetadataResponse(req)` — returns OTA-only slice
- `buildNativeMetadataResponse(req)` — returns native APK slice

Status: **Well-structured**, clean separation, safe helpers.

### server/app-version.json

```json
{ "version": "2.6.32", "apkUrl": "..." }
```

Used by legacy `/api/app-version` endpoint (this route was not found in the current route map — it may have been removed but the file wasn't cleaned up).

### Problems

**M1 — Two version sources of truth.**
`server/app-version.json` and `server/update-manifest.json` both contain version + APK URL. They must be kept in sync manually.

**M2 — Client-side `normalizeManifest()` duplicates server-side loading.**
`app/services/update-service.ts` re-parses and re-normalizes the manifest shape that `server/update-manifest.js` already normalizes. Both use different field names for the same data.

**M3 — `releaseDate` in update-manifest.json has no validation.**
There is no schema validation on the JSON file. A typo in `releaseDate` or `versionCode` fails silently.

---

## 5. app/api/

### Files

```
app/api/
├── aiAnalysisApi.ts
├── imageUtils.ts
├── marketValueApi.ts
├── playerApi.ts
└── teamApi.ts
```

### app/api/playerApi.ts

**Purpose**: Fetches `/api/sports/player/:id` and calls client-side enrichment.

**Key sections**:
```ts
export async function fetchPlayer(playerId: string, opts: PlayerFetchOptions = {}): Promise<PlayerProfile> {
  const raw = await apiRequest<PlayerProfile>(`/api/sports/player/${playerId}?${qs(params)}`);
  return enrichPlayerProfilePayload(raw);   // ← client-side re-enrichment
}
```

**Response shape expected**: `PlayerProfile` with `name`, `photo`, `team`, `position`, `age`, `nationality`, `marketValue`, `stats`, `transferHistory`.

### app/api/teamApi.ts

**Purpose**: Fetches `/api/sports/team/:id` and calls client-side enrichment.

```ts
export async function fetchTeam(teamId: string, opts = {}): Promise<TeamDetail> {
  const raw = await apiRequest<TeamDetail>(`/api/sports/team/${teamId}?${qs(params)}`);
  return enrichTeamDetailPayload(raw);   // ← client-side re-enrichment
}
```

### app/api/marketValueApi.ts

**Purpose**: Wraps `fetchPlayer`, extracts market value fields. 

```ts
export async function fetchPlayerMarketValue(playerId: string, opts = {}): Promise<MarketValueResult> {
  const player = await fetchPlayer(playerId, opts);
  return {
    currentValue: player.marketValue,
    history: normalizeHistory(player.formerClubs),   // ← WRONG: formerClubs are transfer events, not market value history
    ...
  };
}

function normalizeHistory(formerClubs?: FormerClub[]): MarketValuePoint[] {
  return (formerClubs || []).map(club => ({
    date: club.joinedDate || club.leftDate || "",
    value: parseMarketValue(club.transferFee),       // ← transfer fee ≠ market value at that date
  }));
}
```

### app/api/aiAnalysisApi.ts

**Purpose**: Fetches AI player analysis (JSON + SSE streaming endpoints).

**Key issues**:
```ts
function qs(params: Record<string, string | undefined>): string {
  return Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
}
```
This `qs` helper is copy-pasted identically in `playerApi.ts` and `teamApi.ts`.

SSE reader has no max-buffer guard:
```ts
const reader = response.body.getReader();
let accumulated = "";
while (true) {
  const { done, value } = await reader.read();
  accumulated += decoder.decode(value);   // ← can grow unbounded on a slow/broken stream
  ...
}
```

### app/api/imageUtils.ts

**Purpose**: Proxies Transfermarkt image URLs through `/api/img`.

```ts
export function getProxiedImageUrl(tmUrl: string): string {
  return `${API_BASE}/api/img?url=${encodeURIComponent(tmUrl)}`;
}
```

Status: Clean, minimal, correct.

### Problems

**A1 — Double enrichment: client re-enriches server-enriched data.**
`enrichPlayerProfilePayload()` and `enrichTeamDetailPayload()` in `app/lib/sports-enrichment.ts` post-process data the server already enriched — including parsing market values, normalizing former clubs, and normalizing photo URLs. This means two sets of normalization rules must be kept in sync.

**A2 — `marketValueApi.ts` semantic error.**
`normalizeHistory()` maps `formerClubs` (transfer events with join/leave dates and transfer fees) to `MarketValuePoint[]` objects. Transfer fee is not the same as market value at that date. This produces a market value graph that shows fees, not valuations.

**A3 — `qs()` helper duplicated across 3 files.**
Identical URL query string builder in `aiAnalysisApi.ts`, `playerApi.ts`, and `teamApi.ts`. One change requires three edits.

**A4 — Unguarded SSE buffer accumulation.**
The SSE reader in `aiAnalysisApi.ts` accumulates chunks with no max size limit. A slow or broken server connection could grow the buffer indefinitely.

**A5 — `app/api/marketValueApi.ts` is pure wrapping.**
It calls `fetchPlayer`, extracts 3 fields, re-normalizes them. `fetchPlayer` already returns the same data. This layer adds a round-trip through `enrichPlayerProfilePayload` for no net gain.

---

## 6. app/services/

### Files

```
app/services/
├── apiClient.ts           ← pure re-export (1 line)
├── crash-log.ts
├── native-apk-flow.ts
├── onboarding-ai.ts
├── onboarding-data.ts
├── onboarding-preload.ts  ← pure re-export (1 line)
├── onboarding-storage.ts
├── preloadService.ts      ← pure re-export (1 line)
├── queryClient.ts
├── realtime-engine.ts
├── realtime-telemetry.ts
├── startup-bootstrap.ts
├── startup-flow.ts
├── startup-orchestrator.ts
├── storage.ts             ← pure re-export (1 line)
├── update-decision.ts
├── update-diagnostics.ts
├── update-service.ts
└── websocketService.ts
```

### app/services/apiClient.ts
```ts
export { apiRequest, apiRequestJson } from "@/lib/query-client";
```
**1 line of actual code.** Pure re-export — no value added.

### app/services/storage.ts
```ts
export { getCache, setCache, clearCache, ... } from "@/lib/services/cache-service";
```
**Pure re-export — no value added.**

### app/services/preloadService.ts
```ts
export { startOnboardingPreload } from "@/services/onboarding-preload";
```
**Pure re-export — no value added.**

### app/services/realtime-engine.ts

**Purpose**: Core data refresh coordination. Defines `buildRealtimeQueryOptions()`, `fetchWithPersistentCache()`, cache key definitions, and TTL policies.

**Key design**: Bridges React Query with AsyncStorage. Provides stale-while-revalidate semantics, stable cache keys, and TTL policies per data type.

**TTL Map (defined here)**:
```ts
const TTL = {
  LIVE: 10_000,         // 10s
  BY_DATE: 45_000,      // 45s
  STANDINGS: 300_000,   // 5m
  PLAYER: 600_000,      // 10m
  TEAM: 1_800_000,      // 30m
};
```

Status: Well-structured. These TTLs drive both React Query's `staleTime` and AsyncStorage's TTL. **Problem**: The server-side cache has its own TTL map (different values) — no single source of truth.

### app/services/update-service.ts

**Purpose**: Fetches update manifest, decides whether to prompt user for native/OTA update, shows dialogs.

**Key issue**:
```ts
function normalizeManifest(raw: any): UpdateManifest {
  return {
    version: raw?.version || raw?.latestVersion,
    apkUrl: raw?.apkUrl || raw?.native?.recommended?.downloadUrl,
    ...
  };
}
```
This mirrors `server/update-manifest.js`'s `buildNativeMetadataResponse()`. Two normalization functions for the same data shape, in different languages.

### app/services/websocketService.ts

**Purpose**: Generic WebSocket factory with exponential backoff reconnect.

**Problem**: No WebSocket server is visible in this codebase. This service may be dead code, or intended for a future feature.

### Problems

**S1 — Three files are pure re-exports with zero added value.**
`apiClient.ts`, `storage.ts`, `preloadService.ts` exist purely as indirection layers. They add import hops with no logic, no type enrichment, and no future flexibility.

**S2 — TTL values defined in two places.**
`realtime-engine.ts` defines client-side TTLs; `server/index.js` defines server-side cache TTLs. They are different numbers for the same endpoints. There is no contract ensuring they align.

**S3 — `update-service.ts` duplicates server-side manifest normalization.**
`normalizeManifest()` must be kept in sync with `buildNativeMetadataResponse()`. Any field rename on the server breaks the client silently (both use `any` types).

**S4 — `websocketService.ts` appears to be dead code.**
No WebSocket server exists in `server/index.js`. The service is either unused or was written speculatively for a future real-time feature.

---

## 7. app/lib/services/

### Files

```
app/lib/services/
├── cache-service.ts
├── download-service.ts
├── media-service.ts
├── recommendation-service.ts
├── sports-service.ts
└── user-state-service.ts
```

### app/lib/services/cache-service.ts

**Purpose**: Two-tier cache — in-memory `Map` (fast reads) + AsyncStorage (persistent, TTL-checked).

**Design**:
- `getCache(key)`: returns in-memory value or reads from AsyncStorage
- `setCache(key, value, ttl)`: writes to in-memory immediately, debounces AsyncStorage writes
- Stale-while-revalidate: `getStale(key)` returns expired values for background refresh

Status: **Well designed**. Correct stale-while-revalidate semantics. Debouncing prevents excessive AsyncStorage writes.

### app/lib/services/sports-service.ts

**Purpose**: Domain service for all sports data. Fetches live/by-date/standings/players/teams; normalizes raw responses into typed domain models.

**Key functions**: `getSportsLive()`, `getSportsByDate(date)`, `getSportsStandings(league)`, `getPlayerProfile(id)`, `getTeamDetail(id)`.

**Problems**:
```ts
// Duplicate safeFetch defined HERE and also in media-service.ts
async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
```
```ts
// Naming inconsistency: alias exports
export const getSportHome = getSportsHome;
export const getLiveMatches = getSportsLive;
```

### app/lib/services/media-service.ts

**Purpose**: Domain service for VOD data. Fetches movies, series, collections, studios. Enforces `isPlayable: false` for TMDB-only items (no stream URL = not playable).

**Duplicate**:
```ts
// Identical to function in sports-service.ts
async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
```

### Problems

**LS1 — `safeFetch` duplicated in sports-service and media-service.**
Identical 3-line function defined twice. A shared `lib/utils.ts` or the existing `lib/query-client.ts` is the right home.

**LS2 — Naming inconsistency in sports-service exports.**
`getSportHome/getLiveMatches` are aliases for `getSportsHome/getSportsLive`. Consumers import either name; codebase uses both.

**LS3 — `any[]` types on `SportsPayload` fields.**
Large portions of the sports service payload use `any[]` instead of `Match[]`/`Team[]`. TypeScript provides no structural guarantee at compile time.

---

## 8. app/lib/

### Key Files

```
app/lib/
├── ai/
│   ├── ai-summary-service.ts
│   ├── aiMatchStoryGenerator.ts
│   ├── aiPredictionService.ts
│   ├── highlight-engine.ts
│   ├── index.ts
│   ├── match-ranking-service.ts
│   ├── momentum-calculator.ts
│   ├── notification-engine.ts
│   ├── probabilityEngine.ts
│   └── stats-mode-manager.ts
├── domain/
│   ├── models.ts
│   ├── normalizers.ts
│   └── identity-resolver.ts
├── services/ (see section 7)
├── query-client.ts
├── sports-data.ts
├── sports-enrichment.ts
├── vod-curation.ts
├── logo-manager.ts
├── match-analysis-engine.ts
└── epg-manager.ts
```

### app/lib/query-client.ts

**Purpose**: Core HTTP fetch layer. `apiRequest<T>(path)` with multi-base failover. TanStack `QueryClient` setup.

**Key sections**:
```ts
export function getApiBaseCandidates(): string[] {
  const candidates = [
    process.env.EXPO_PUBLIC_API_URL,             // configured base
    "https://nexora-api.onrender.com",           // Render production
    "https://nexora.pages.dev",                  // Cloudflare Pages
    __DEV__ ? "http://localhost:8080" : undefined,
    __DEV__ ? "http://10.0.2.2:8080" : undefined, // Android emulator
    __DEV__ ? "http://localhost:8082" : undefined,
  ].filter(Boolean);
  return [...new Set(candidates)];
}

let lastWorkingApiBase: string | null = null;  // ← mutable module-level state
```

**Failover logic**: On a 5xx or network error, tries next candidate in order and stores `lastWorkingApiBase`. Subsequent requests skip to the last known-good base.

**Problem**: `lastWorkingApiBase` is module-level mutable state. In concurrent requests, one request updating this state can cause another request to skip a valid primary and use a stale fallback.

### app/lib/sports-enrichment.ts

**Purpose**: Client-side post-processing of server responses — `enrichPlayerProfilePayload()`, `enrichTeamDetailPayload()`, leaderboard deduplication.

**Duplicated helpers** (also exist in server):
```ts
function stripHtmlArtifacts(value?: string): string {...}  // ← also in server/index.js
function normalizePersonName(name: string): string {...}   // ← also in server/index.js
```

### app/lib/domain/normalizers.ts

**Purpose**: Converts raw server API shapes into canonical `Match`, `Team`, `Player`, `Movie`, `Series` domain models.

**Key design**: `normalizeMatchFromServer()` handles both string (legacy) and object (current) `homeTeam`/`awayTeam` shapes — good backward compat handling.

Status: Well-structured. This is the correct layer for shape normalization.

### app/lib/ai/ directory

**10 AI service files** that wrap the same server endpoints with client-side post-processing and caching:
- `aiPredictionService.ts`: Calls `/api/sports/menu-tools`, maps predictions to UI model
- `aiMatchStoryGenerator.ts`: Calls `/api/sports/player-analysis`, parses streaming response
- `probabilityEngine.ts`: Client-side deterministic prediction model (mirrors `deterministicPrediction()` in server)
- `highlight-engine.ts`: Filters/ranks highlights from server response
- `match-ranking-service.ts`: Ranks matches by "interest score"
- `momentum-calculator.ts`: Computes momentum from match events
- `notification-engine.ts`: Schedules match start notifications
- `ai-summary-service.ts`: AI text summarization helper
- `stats-mode-manager.ts`: Manages stats display mode selection

**Problem**: `probabilityEngine.ts` implements a **deterministic prediction algorithm client-side** that is identical to `deterministicPrediction()` in `server/index.js`. Both must be kept in sync.

### Problems

**L1 — `normalizePersonName()` and `stripHtmlArtifacts()` duplicated server ↔ client.**
Both exist in `server/index.js` and `app/lib/sports-enrichment.ts`. Bug fixes in one don't propagate to the other.

**L2 — `deterministicPrediction()` algorithm duplicated in `app/lib/ai/probabilityEngine.ts`.**
Server and client each have their own implementation of the match probability model. They will drift apart.

**L3 — Module-level mutable `lastWorkingApiBase` state in query-client.ts.**
Race-prone in concurrent requests. Causes unpredictable failover behavior under load.

**L4 — `getApiBaseCandidates()` includes hardcoded localhost URLs.**
Even after filtering `__DEV__`, the logic is present in production bundle. The array construction runs unconditionally.

**L5 — `app/lib/sports-enrichment.ts` double-enriches already-enriched server data.**
Server returns fully enriched player/team profiles. Client enriches again. Net result: any enrichment bug must be fixed in two places.

---

## 9. cloudflare/sports-worker/

### File: `cloudflare/sports-worker/src/index.js`

**Purpose**: Cloudflare Worker acting as a caching reverse proxy in front of the Render backend. Handles only `/api/sports/*` routes (other routes pass through directly).

**Caching strategy**:
1. KV store (primary — fast Cloudflare edge cache)
2. D1 SQLite (secondary — stale fallback when KV misses)
3. In-flight deduplication (Map of pending promises, per cache key)

**Path TTL map**:
```js
function resolveTtlMs(pathname) {
  if (pathname.includes("/live")) return 10_000;
  if (pathname.includes("/by-date")) return 45_000;
  if (pathname.includes("/standings")) return 300_000;
  if (pathname.includes("/player/")) return 600_000;
  if (pathname.includes("/team/")) return 1_800_000;
  return 60_000; // default
}
```

**CORS handling**: Sets `Access-Control-Allow-Origin: *` on all responses. Handles OPTIONS preflight.

**Health bypass**: `/health` and `/api/ping` bypass cache.

**KV + D1 write pattern**:
```js
// Both writes fire async — no await
ctx.waitUntil(kv.put(cacheKey, body, { expirationTtl: ttl }));
ctx.waitUntil(d1.prepare("INSERT OR REPLACE INTO cache ...").run());
```

Status: Clean, well-structured, correct in-flight dedup.

### Problems

**CF1 — Fourth caching layer adds TTL complexity with no unified strategy.**
The full cache stack is: Worker KV → Worker D1 → Render Redis → Render in-memory Map. All four have different TTLs. A cache invalidation during a hot match means:
- Render in-memory: cleared by `cacheSet(..., 10s)`
- Render Redis: cleared after 10s TTL
- Worker KV: not cleared — continues serving stale for its own TTL
- Worker D1: not cleared — serves as further stale fallback

There is no cache invalidation signal from backend to Cloudflare.

**CF2 — KV and D1 writes are fire-and-forget.**
```js
ctx.waitUntil(kv.put(...));
ctx.waitUntil(d1.prepare(...).run());
```
Silent write failures are never surfaced. If KV write fails, the next request gets a fresh fetch but no error is observable.

**CF3 — `resolveTtlMs()` TTL values are duplicates of server-side TTLs and client-side TTLs — three separate definitions.**
No single source of truth for cache TTL contracts.

**CF4 — Worker only caches `/api/sports/*`.**
TMDB routes (`/api/movies/*`, `/api/series/*`) are not cached at the edge, even though they are the highest-traffic routes and have stable, cacheable responses (TMDB data changes rarely).

---

## 10. app/features/

### Structure

```
app/features/
├── sports/
│   ├── hooks/
│   │   ├── useCompetition.ts
│   │   ├── usePlayerProfile.ts
│   │   ├── useSportHomeFeed.ts
│   │   ├── useSportsAnalysis.ts
│   │   └── useTeamProfile.ts
│   └── services/
│       ├── sportsAnalysisEngine.ts
│       ├── sportsApi.ts
│       ├── sportsLogoResolver.ts
│       ├── sportsPhotoResolver.ts
│       └── sportsResolver.ts
└── media/
    └── ...
```

### app/features/sports/services/sportsApi.ts

```ts
export { apiRequest, apiRequestJson } from "@/lib/query-client";
```
**Another pure re-export.** This is the fourth file that re-exports the same two functions from `lib/query-client`.

### Problems

**F1 — `app/features/sports/services/sportsApi.ts` is yet another pure re-export.**
Fourth occurrence of re-exporting `apiRequest`/`apiRequestJson` from `lib/query-client`. The import chain is: `lib/query-client` → `services/apiClient.ts` → `features/sports/services/sportsApi.ts`. Three hops to the same function.

**F2 — Logo and photo resolution duplicated in features layer.**
`sportsLogoResolver.ts` and `sportsPhotoResolver.ts` resolve logos/photos client-side — the same resolution the server already did. This exists because the server sometimes returns null/placeholder values and the client tries to recover at render time.

**F3 — `useSportsAnalysis` hook calls both JSON and streaming endpoints.**
If the stream endpoint is available, it reads chunks from SSE. If not, it falls back to the JSON endpoint. This means the hook can be in mid-stream when the component unmounts, causing dangling readers.

---

## 11. app/constants/

### Files

```
app/constants/
├── env.ts
├── routes.ts
└── module-registry.ts
```

### app/constants/env.ts

```ts
export const ENV = {
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    ...
  },
  revenuecat: {
    apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY,
  },
  admob: {
    bannerId: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID,
    ...
  },
  api: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL || "https://nexora-api.onrender.com",
    sportsBaseUrl: process.env.EXPO_PUBLIC_SPORTS_API_URL || "https://nexora-api.onrender.com",
  },
};
```

Status: Clean, minimal, correctly typed.

**Problem**: `api.baseUrl` and `api.sportsBaseUrl` both default to `https://nexora-api.onrender.com`. The Cloudflare Worker URL (which should be the primary) is not the default — it must be explicitly set via `EXPO_PUBLIC_API_URL`. If this env var is unset in a build, all traffic bypasses the Cloudflare cache layer and hits Render directly.

---

## 12. External API Catalogue

| API | Auth | Used For | ToS Risk | Key |
|-----|------|---------|----------|-----|
| ESPN site.api.espn.com | None (public, unofficial) | All soccer scores, standings, scorers, teams, players | High — undocumented endpoint | No |
| ESPN sports.core.api.espn.com | None (public, unofficial) | Season leaders, detailed athlete data | High | No |
| ESPN now.core.api.espn.com | None | News | High | No |
| ESPN www.espn.com HTML | None | Top scorer HTML scrape fallback | Very High (scraping) | No |
| Sofascore api.sofascore.com (v1) | None (direct scrape, no key) | Match incidents, statistics, lineups | **Critical** (TOS violation) | No |
| Transfermarkt (unofficial community) | None | Player market values, squad data | Very High — unofficial community Vercel app, no SLA | No |
| TheSportsDB | None (free tier) | Team logos, player photos | Low | No |
| Wikipedia API | None | Player photos, team logos | Low | No |
| Wikimedia Commons | None | Image assets | Low | No |
| Football-Logos GitHub (raw) | None | SVG/PNG team logos | Low (GitHub raw URL) | No |
| ScoreBat | None (free tier) | Match highlight embeds | Low | No |
| TMDB | API key required | Movies, series, trailers, recommendations | Low | Yes |
| OMDB | API key required | Movie/series metadata enrichment | Low | Yes |
| OpenSubtitles | API key required | Subtitle search/download | Low | Yes |
| TVMaze | None | Series metadata, schedule | Low | No |
| radio-browser.info | None | Radio station directory | Low | No |
| open-meteo.com | None | Weather | Low | No |
| Apify | API key (optional) | Player data crawling (fallback) | Med | Yes (optional) |
| Zilliz (Milvus Cloud) | API key required | Vector DB — misused as KV store | Low | Yes |
| ui-avatars.com | None | Fallback player avatar generation | Low | No |
| Gemini | API key | AI analysis / predictions | Low | Yes (optional) |
| OpenAI | API key | AI analysis / predictions | Low | Yes (optional) |
| OpenRouter | API key | AI analysis / predictions | Low | Yes (optional) |
| Groq | API key | AI analysis / predictions | Low | Yes (optional) |
| DeepSeek | API key | AI analysis / predictions | Low | Yes (optional) |
| Ollama | Local URL | AI analysis / predictions (local) | None | No |
| XAI (Grok) | API key | AI analysis / predictions | Low | Yes (optional) |

---

## 13. Full Problem Register

Problems are rated **P0** (critical/data loss/security) → **P4** (minor/cosmetic).

### P0 — Security / Data Loss

| ID | File | Problem |
|----|------|---------|
| P0-1 | `server/index.js` (line 439) | **`/api/espn/public` is an open proxy** — forwards any `?path=` to ESPN with no allowlist, no normalization. SSRF-adjacent: can be used to probe ESPN internal API surfaces. |
| P0-2 | `server/index.js` (line 9271) | **`/api/playlist/xtream` proxies arbitrary user-provided hostnames** — no host validation. Effectively an SSRF vector. |
| P0-3 | `server/index.js` (`activeSessions`, `ipHistory`, `followedTeams`) | **All session state and user data in in-memory Maps** — wiped on every restart. Concurrent stream limiting is completely ineffective across restarts. |
| P0-4 | `server/index.js` (STREAM_SIGNING_SECRET) | **Stream signing secret regenerates on restart** — all outstanding signed tokens become invalid on server restart. |
| P0-5 | `server/data/player-analysis-cache.json` | **Ephemeral file cache on Render** — all AI analysis data is destroyed on every deploy. App shows stale/empty analysis until re-generated. |
| P0-6 | `server/index.js` (race on file write) | **No write lock on `player-analysis-cache.json`** — concurrent writes can corrupt the file. |

### P1 — ToS / Legal Risk

| ID | File | Problem |
|----|------|---------|
| P1-1 | `server/index.js` (`fetchSofaIncidents`, `fetchSofaStatistics`, `fetchSofaLineups`) | **Direct scraping of Sofascore's private API** without any key or agreement. Sofascore actively blocks scrapers. One IP ban or HTML change breaks lineups, incidents, and stats for all matches. |
| P1-2 | `server/index.js` (`fetchTransfermarktPlayerDirect`, `fetchTransfermarktClubPlayers`) | **Using an unofficial community Transfermarkt wrapper** (`transfermarkt-api-sigma.vercel.app`) — no SLA, no ToS agreement with Transfermarkt, could be shut down at any time. |
| P1-3 | `server/index.js` (`espnTopScorersFromHtml`) | **HTML scraping ESPN's public website** — regex-based HTML parser. One ESPN layout change silently breaks top-scorer data. |

### P2 — Architecture

| ID | File | Problem |
|----|------|---------|
| P2-1 | `server/index.js` | **11,691-line monolith.** All routes, business logic, enrichment pipelines, static data, scraping, AI, caching in one file. Cannot be unit tested, cannot be maintained in parallel. |
| P2-2 | Multiple | **Four independent caching layers** with no unified TTL or invalidation: Cloudflare KV → Cloudflare D1 → Render Redis → Render in-memory Map. A live match update can be stale in KV/D1 for minutes after the backend has fresh data. |
| P2-3 | `server/index.js` (lines 5344, 5380) | **`/api/sports/prefetch-home` and `/api/sports/team/:id/player-quality` make HTTP calls to themselves.** Breaks in reverse-proxy environments, wastes a full TCP+HTTP round trip to access local functions. |
| P2-4 | `server/index.js` (Zilliz) | **Zilliz vector DB used as a key-value store.** Embeddings are deterministic pseudo-vectors (hash-to-float), not semantic. The entire vector search capability is wasted. This adds latency, billing, and an external dependency for what is basically a Redis set/get. |
| P2-5 | `server/index.js` (`enrichScorersPhotos`) | **7-step blocking photo waterfall**: Transfermarkt preprocessing → TM direct → TheSportsDB → Wikipedia → AI-LLM → ESPN CDN → UI-Avatars. Each step waits for the previous. Under cold-cache conditions this can take 30+ seconds per scorer. |
| P2-6 | Various | **Three TTL definitions for the same endpoints:** server `getOrFetch(key, ttlMs)`, client `realtime-engine.ts TTL`, Cloudflare Worker `resolveTtlMs()`. All three must be manually kept in sync. |
| P2-7 | `app/api/playerApi.ts`, `app/api/teamApi.ts` | **Client re-enriches server-enriched data.** `enrichPlayerProfilePayload()` and `enrichTeamDetailPayload()` post-process responses the server already fully enriched. |

### P3 — Code Quality / Duplication

| ID | File | Problem |
|----|------|---------|
| P3-1 | `app/services/apiClient.ts`, `storage.ts`, `preloadService.ts` | **Pure re-export files add import indirection with no value.** Four files exist solely to re-export from one source. |
| P3-2 | `server/index.js` + `app/lib/sports-enrichment.ts` | **`normalizePersonName()`, `stripHtmlArtifacts()`, similarity scoring duplicated across server and client.** Bug in one doesn't fix the other. |
| P3-3 | `server/index.js` + `app/lib/ai/probabilityEngine.ts` | **`deterministicPrediction()` algorithm duplicated.** Both sides compute match probability independently. They will drift. |
| P3-4 | `app/lib/services/sports-service.ts` + `media-service.ts` | **`safeFetch()` utility duplicated.** Identical 3-line helper defined in two separate service files. |
| P3-5 | `app/api/aiAnalysisApi.ts`, `playerApi.ts`, `teamApi.ts` | **`qs()` URL builder duplicated across three files.** Three separate copies of the same 4-line helper. |
| P3-6 | `server/index.js` | **Multiple duplicated static lookup tables.** `ESPN_LEAGUE_SLUGS` and `ESPN_STATS_LEAGUE_CODES` cover the same leagues with different casing and slightly different entries; both must be kept in sync. Same for `NATIONAL_TEAM_IDS` and `NATIONAL_TEAM_IDS_BY_CODE`. |
| P3-7 | `server/app-version.json` + `server/update-manifest.json` | **Two version sources of truth.** Both contain `version` and `apkUrl`. They drift silently. |
| P3-8 | `app/services/update-service.ts` + `server/update-manifest.js` | **Manifest normalization duplicated across server and client.** Two normalization functions for the same JSON schema. |
| P3-9 | `app/features/sports/services/sportsApi.ts` | **Fourth re-export of `apiRequest`.** Import chain: `lib/query-client` → `services/apiClient` → `features/sports/services/sportsApi`. |
| P3-10 | `app/lib/ai/probabilityEngine.ts` | **Client-side re-implementation of server's `deterministicPrediction()`.** Both compute match win probabilities separately. |

### P4 — Minor / Correctness

| ID | File | Problem |
|----|------|---------|
| P4-1 | `app/api/marketValueApi.ts` | **Semantic error: transfer fee ≠ market value.** `normalizeHistory()` maps `formerClubs` (transfer events with fees) to `MarketValuePoint[]`. The resulting graph shows transfer fees, not valuations. |
| P4-2 | `app/api/aiAnalysisApi.ts` | **Unguarded SSE buffer accumulation.** `accumulated` string grows without bound on a slow/broken stream. |
| P4-3 | `app/lib/query-client.ts` | **Module-level mutable `lastWorkingApiBase` state.** Race-prone under concurrent requests. |
| P4-4 | `server/index.js` | **Dutch and English mixed in AI prompts, code comments, error messages.** No consistent language policy. |
| P4-5 | `app/constants/env.ts` | **Cloudflare Worker URL is not the default `baseUrl`.** If `EXPO_PUBLIC_API_URL` is unset in a build, all traffic bypasses the Cloudflare edge cache and hits Render directly. |
| P4-6 | `app/lib/services/sports-service.ts` | **Duplicate alias exports.** `getSportHome` = `getSportsHome`, `getLiveMatches` = `getSportsLive`. Consumers use either name; codebase uses both. |
| P4-7 | `server/index.js` | **All hardcoded static tables require a code deploy to update.** Adding a new league, team logo alias, or national team ID requires editing `server/index.js` and re-deploying. |
| P4-8 | `app/services/websocketService.ts` | **WebSocket service appears to be dead code.** No WebSocket server in `server/index.js`. |

---

## 14. Caching Architecture Map

```
Client Request
      │
      ▼
Cloudflare Worker (edge cache)
  ├─ In-flight dedup Map (per Worker instance, ephemeral)
  ├─ Cloudflare KV        TTL: per path (10s–30m)
  └─ Cloudflare D1 SQLite  TTL: per path (stale fallback)
      │ MISS
      ▼
Render Express Server
  ├─ In-memory Map (module-level, ephemeral, ~2× faster than Redis)
  └─ Redis                 TTL: per endpoint (10s–30m)
      │ MISS
      ▼
External APIs
  ESPN / Sofascore / TM / TMDB / Wikipedia / ...
      │
      ▼
Zilliz (vector KV, non-semantic, ~500ms latency)
  └─ Player analysis cache only
      │ and also
      ▼
data/player-analysis-cache.json (ephemeral filesystem)
  └─ 30-day TTL per item (destroyed on every deploy)
```

**Client-side (React Native)**:
```
React Query (in-memory, per session)
  └─ AsyncStorage (persistent across app restarts)
      └─ In-memory read-through Map (fast path)
```

**Total independent caching layers**: **7** (Cloudflare KV, Cloudflare D1, Render in-memory, Redis, Zilliz, filesystem JSON, and client-side AsyncStorage/ReactQuery).

---

## 15. Rewrite Recommendations

These are directional — not prescriptive — based solely on the audit findings.

### Backend

1. **Split the monolith into modules** organized by domain: `sports/`, `media/`, `iptv/`, `updates/`, `auth/`. Each domain gets its own router file, service layer, and data layer.

2. **Replace in-memory state with a real store**. Sessions, followed teams, and device tracking need Redis or a DB (Postgres/SQLite). Render supports persistent disks or you can use Cloudflare D1 as the session store.

3. **Eliminate the file-based JSON cache** (`data/player-analysis-cache.json`). Move AI analysis caching to Redis with a proper TTL and an LRU eviction bound.

4. **Replace Zilliz with the Redis instance you already have.** `HSET player:analysis:<key> data <json> ttl <timestamp>` replaces the entire Zilliz integration with zero external dependency and no pseudo-vector overhead.

5. **Replace the 7-step serial photo waterfall with a race.** `Promise.any([fetchTM(), fetchSportsDB(), fetchWikipedia()])` — first non-null result wins, all others cancel. Cap total timeout at 5s and fall back to UI-Avatars.

6. **Remove the ESPN public proxy** (`/api/espn/public`) or add strict path allowlisting. The current implementation is an open relay.

7. **Replace Sofascore direct scraping** with an official alternative (api-football.com, sportmonks.com, or football-data.org) for incidents/lineups. Or, accept that lineups/incidents are a premium feature and gate them accordingly.

8. **Move static lookup tables out of code.** Store league slugs, team logo aliases, TM club name maps in a JSON file or a small DB table. Update without a deploy.

9. **Make self-HTTP calls into direct function calls.** `prefetch-home` and `player-quality` call themselves via HTTP. Extract their logic into importable functions.

10. **Establish a single TTL source of truth.** Define TTLs in one shared config file. Import them in the Cloudflare Worker, the Express server, and the client.

### Client

1. **Delete the pure re-export files** — `apiClient.ts`, `storage.ts`, `preloadService.ts`, `features/sports/services/sportsApi.ts`. Call source modules directly.

2. **Remove client-side enrichment** (`enrichPlayerProfilePayload`, `enrichTeamDetailPayload`). If the server's response is incomplete, fix it on the server. The client should consume the domain model as-is from `lib/domain/normalizers.ts`.

3. **Fix the `marketValueApi` semantic bug.** `formerClubs` contains transfer events, not market valuations. Either source real market value history from TM's history endpoint, or remove the `MarketValuePoint[]` graph entirely.

4. **Consolidate the `qs()` utility** into a single location (e.g., `lib/url.ts`).

5. **Consolidate `safeFetch()`** into `lib/utils.ts` or `lib/query-client.ts`.

6. **Move `deterministicPrediction()` to a shared package** or remove the client-side copy and call the server endpoint. One algorithm, one implementation.

7. **Cap the SSE buffer** in `aiAnalysisApi.ts` with a max byte limit.

8. **Make `EXPO_PUBLIC_API_URL` default to the Cloudflare Worker URL** in `env.ts`, not `onrender.com` directly.
