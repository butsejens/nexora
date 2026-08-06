import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import { createClient } from "redis";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { basename, dirname, join } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import crypto from "crypto";
import {
  buildNativeMetadataResponse,
  buildOtaMetadataResponse,
  buildUpdateManifestResponse,
} from "./update-manifest.js";

// ─── Shared infrastructure ────────────────────────────────────────────────────
import { log as serverLog, createLogger } from "./shared/logger.js";
import { requestTracer, globalErrorHandler } from "./shared/tracer.js";
import { initRedis } from "./shared/cache.js";
import { startWorker } from "./shared/queue.js";

// ─── New modular route handlers ───────────────────────────────────────────────
// These clean routers mount at /api/media, /api/updates, and root.
import mediaRouter from "./modules/media.js";
import updatesRouter from "./modules/updates.js";
import diagnosticsRouter from "./modules/diagnostics.js";
import { router as usersRouter } from "./modules/users.js";
import imageProxyRouter from "./modules/image-proxy.js";
import {
  router as streamHealthRouter,
  startHealthCheckSchedule,
} from "./modules/stream-health.js";

// --- Redis client setup (legacy + shared module) ---
// Load .env from the server directory regardless of the process cwd (e.g. when
// started as `node server/index.js` from the monorepo root).
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });
// Only create Redis client when REDIS_URL is explicitly set (not the default localhost fallback)
const redisUrl = process.env.REDIS_URL || "";
let redisClient;
if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) =>
        retries >= 3 ? false : Math.min(retries * 500, 3000),
    },
  });
  redisClient.on("error", (err) =>
    serverLog.error("Redis error (legacy client)", { message: err.message }),
  );
  redisClient
    .connect()
    .then(() => serverLog.info("Redis connected (legacy client)"))
    .catch((e) => {
      serverLog.warn("Redis connect failed (legacy client)", {
        message: e.message,
      });
      redisClient = null;
    });
} else {
  serverLog.info("REDIS_URL not set — using in-memory cache only");
}
// Initialize the shared cache module with the same Redis URL (empty string = skip Redis)
initRedis(redisUrl || null);

// Redis get/set helpers (async) — keep for legacy inline routes
let redisReady = false;
if (redisClient) {
  redisClient.on("ready", () => {
    redisReady = true;
  });
  redisClient.on("end", () => {
    redisReady = false;
  });
  redisClient.on("error", () => {
    redisReady = false;
  });
}

async function redisGet(key) {
  if (!redisClient || !redisReady) return null;
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function redisSet(key, value, ttlMs) {
  if (!redisClient || !redisReady) return;
  try {
    await redisClient.set(key, JSON.stringify(value), {
      PX: ttlMs || 60000,
    });
  } catch {}
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure .env is loaded from the server directory regardless of the cwd.
dotenv.config({ path: join(__dirname, ".env") });

const app = express();

// ─── Security headers (helmet) ────────────────────────────────────────────────
// Sets sensible HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
// Content-Type sniffing disabled; MIME types must be explicit.
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // allow media embeds
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        mediaSrc: ["'self'", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  }),
);

// ─── Global API rate-limiter ──────────────────────────────────────────────────
// 300 req / 1 min per IP for all /api/* routes.
// Tighter per-route limits can be added at router level.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests — please slow down",
    code: "RATE_LIMITED",
  },
  skip: (req) => req.path === "/health" || req.path === "/api/ping",
});
app.use("/api", apiLimiter);

// CORS: allow all in development, restrict to configured domain in production
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors(
    allowedOrigin
      ? {
          origin: (origin, cb) => {
            if (!origin || origin === allowedOrigin) cb(null, true);
            else cb(new Error("CORS not allowed"), false);
          },
          credentials: true,
        }
      : undefined,
  ),
);
app.use(express.json({ limit: "10mb" }));

// ─── Response timeout ─────────────────────────────────────────────────────────
// Ensures no request hangs longer than 45s — returns a timeout error to the client.
// Poster generation gets 120s since gpt-image-1 is slow.
app.use((req, res, next) => {
  const isSlowRoute =
    req.path.includes("/poster/generate");
  const TIMEOUT_MS = isSlowRoute ? 120_000 : 45_000;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      serverLog.warn("Response timeout", {
        path: req.path,
        method: req.method,
        timeout: TIMEOUT_MS,
      });
      res
        .status(504)
        .json({ error: "Server response timeout", path: req.path });
    }
  }, TIMEOUT_MS);
  res.on("finish", () => clearTimeout(timer));
  res.on("close", () => clearTimeout(timer));
  next();
});

// ─── Observability middleware ─────────────────────────────────────────────────
// Must be first (after body parsing) so all routes are traced.
app.use(requestTracer);

// ─── New modular routes ───────────────────────────────────────────────────────
// These mount BEFORE the legacy inline handlers so they take priority.
// Migration path: once legacy inline routes are removed, these become the only handlers.
app.use("/api/media", mediaRouter); // clean media with canonical envelopes
app.use("/api/updates", updatesRouter); // clean update metadata
app.use(diagnosticsRouter); // /health, /api/ping, /api/config-check
app.use(usersRouter); // /api/user/* + /api/session/*
app.use("/api/image", imageProxyRouter); // secure image proxy + resize (sharp)
app.use("/api/streams", streamHealthRouter); // dynamic stream providers

const DOWNLOADS_DIR = join(__dirname, "public", "downloads");

// Explicit APK file endpoint used by in-app native update flow.
app.get("/downloads/apk/:fileName", (req, res) => {
  const fileName = String(req.params.fileName || "").trim();
  if (!/\.apk$/i.test(fileName)) {
    return res
      .status(400)
      .json({ error: "Invalid APK file name", code: "APK_INVALID_FILE" });
  }

  const resolvedName = basename(fileName);
  const filePath = join(DOWNLOADS_DIR, resolvedName);
  if (!existsSync(filePath)) {
    return res
      .status(404)
      .json({ error: "APK file not found", code: "APK_NOT_FOUND" });
  }

  const stats = statSync(filePath);
  if (!Number.isFinite(Number(stats.size)) || Number(stats.size) <= 0) {
    return res
      .status(404)
      .json({ error: "APK file is invalid", code: "APK_INVALID_SIZE" });
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${resolvedName}"`,
  );
  res.setHeader("Content-Length", String(stats.size));
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.sendFile(filePath);
});

// Public install landing page shared with testers — points to the latest APK
// and explains the Android "unknown sources" install steps in Dutch, since a
// bare file link left people stuck at "100% downloaded, nothing happens".
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get(["/install", "/download"], (req, res) => {
  const manifest = buildUpdateManifestResponse(req);
  const apk = manifest.native.apk;
  const userAgent = String(req.headers["user-agent"] || "");
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Messenger/i.test(userAgent);
  const downloadUrl = apk.available ? escapeHtml(apk.downloadUrl) : null;
  const version = escapeHtml(manifest.native.version);
  const sizeLabel = escapeHtml(apk.fileSizeLabel || "");

  const inAppWarning = isInAppBrowser
    ? `<p><strong>⚠️ Open deze pagina in Chrome:</strong> tik rechtsboven op de drie puntjes (⋮) en kies "Open in browser" of "Openen in Chrome". In-app browsers van WhatsApp/Instagram/Messenger kunnen de installatie niet afronden.</p>`
    : "";

  const downloadSection = downloadUrl
    ? `<p><a href="${downloadUrl}">⬇️ Download CINELOG v${version} (${sizeLabel})</a></p>`
    : `<p>De APK is momenteel niet beschikbaar. Probeer het later opnieuw.</p>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CINELOG downloaden</title>
</head>
<body>
<h1>CINELOG installeren op Android</h1>
<p>Deze app is veilig en bevat geen virussen. Android toont een waarschuwing omdat de app niet uit de Play Store komt — dat is normaal voor test-versies.</p>
${inAppWarning}
${downloadSection}
<h2>Na het downloaden (blijft het staan op 100%?)</h2>
<ol>
<li>Trek de meldingenbalk naar beneden en tik op het bestand <code>nexora-v${version}.apk</code>, of open je "Bestanden"/"Downloads" app en tik op het bestand.</li>
<li>Android vraagt mogelijk om "installeren van onbekende bronnen" toe te staan. Tik op "Instellingen", zet de schakelaar aan voor je browser/bestanden-app, en ga terug.</li>
<li>Tik opnieuw op het bestand en kies "Installeren".</li>
<li>Zie je "Play Protect heeft een onbekende app geblokkeerd"? Tik op "Meer info" of "Details" en daarna op "Toch installeren".</li>
</ol>
<p>Werkt het nog steeds niet? Probeer een andere browser (Chrome) of een andere internetverbinding (wifi in plaats van mobiele data, of omgekeerd).</p>
</body>
</html>`);
});

// ── Simple in-memory rate limiter ────────────────────────────────────────────
// Prevents abuse of heavy endpoints (playlist parsing, TMDB calls)
function makeRateLimiter(maxPerWindow, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = String(
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
    );
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxPerWindow) {
      return res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
    }
    next();
  };
}

const playlistLimiter = makeRateLimiter(10, 15 * 60 * 1000); // 10 per 15min
const tmdbLimiter = makeRateLimiter(60, 60 * 1000); // 60 per minute

const PORT = process.env.PORT || 8080;
// Public URL used to generate absolute proxy links (set by Render automatically)
const PUBLIC_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PUBLIC_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, "");

function proxyPhotoUrl(url) {
  if (!url || !url.startsWith("http")) return url || null;
  return url;
}
const TZ = process.env.APP_TZ || "Europe/Brussels";

// Lightweight keep-alive ping — intentionally minimal so Render dyno stays warm.
// The app pings this every 4 minutes to prevent free-tier spin-down.
app.get("/api/ping", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

// Config-check endpoint: reports which optional services are configured.
// Does NOT expose actual key values — only boolean flags.
// Useful for debugging "why is data missing?" without exposing secrets.
app.get("/api/config-check", (_req, res) => {
  res.json({
    ok: true,
    services: {
      tmdb: Boolean(process.env.TMDB_API_KEY),
      tmdbProviders: Boolean(process.env.TMDB_API_KEY), // watch/providers uses same TMDB key
      tvmaze: true, // TV schedules & next episode — keyless, always available
      radioBrowser: true, // internet radio stations — keyless, always available
      openMeteo: true, // weather forecasts — keyless, always available
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      xai: Boolean(process.env.XAI_API_KEY),
      redis: Boolean(process.env.REDIS_URL),
      omdb: Boolean(process.env.OMDB_API_KEY),
    },
    warnings: [
      ...(!process.env.TMDB_API_KEY
        ? [
            "TMDB_API_KEY not set — movies/series will be empty. Get a free key at https://www.themoviedb.org/settings/api",
          ]
        : []),
      ...(!process.env.OMDB_API_KEY
        ? [
            "OMDB_API_KEY not set — real IMDb ratings, Rotten Tomatoes scores and awards will be unavailable",
          ]
        : []),
      ...(!process.env.GEMINI_API_KEY &&
      !process.env.OPENROUTER_API_KEY &&
      !process.env.OPENAI_API_KEY &&
      !process.env.DEEPSEEK_API_KEY &&
      !process.env.GROQ_API_KEY &&
      !process.env.XAI_API_KEY
        ? ["No AI provider key set — recommendations will be disabled"]
        : []),
    ],
  });
});

// Connectivity diagnostic — tests actual TMDB API connectivity
app.get("/api/diag/connectivity", async (_req, res) => {
  const results = {};
  const testFetch = async (label, url, timeoutMs = 8000) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      const start = Date.now();
      const r = await fetch(url, {
        signal: c.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(t);
      const elapsed = Date.now() - start;
      const body = await r.text().catch(() => "");
      let count = 0;
      try {
        count = JSON.parse(body)?.results?.length || 0;
      } catch {}
      results[label] = {
        ok: r.ok,
        status: r.status,
        ms: elapsed,
        items: count,
      };
    } catch (e) {
      clearTimeout(t);
      results[label] = { ok: false, error: e.message };
    }
  };
  const key = process.env.TMDB_API_KEY;
  await Promise.all([
    key
      ? testFetch(
          "tmdb",
          `https://api.themoviedb.org/3/trending/movie/week?api_key=${encodeURIComponent(key)}&language=nl-NL`,
        )
      : Promise.resolve((results.tmdb = { ok: false, error: "no key" })),
  ]);
  res.json({ ok: true, results });
});

// -----------------------------
// Cache (in-memory)
// -----------------------------
const __cache = new Map(); // key -> { value, expiresAt, staleValue, staleAt }
const __inflight = new Map();

function cacheGet(key) {
  // Redis is checked asynchronously only via getOrFetch — this sync path
  // serves the ~20 legacy callers that don't await cacheGet.
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
  // Fire-and-forget Redis write when available
  if (redisClient && redisReady) {
    redisSet(key, value, ttlMs).catch(() => {});
  }
  // Always set in-memory
  const now = Date.now();
  __cache.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleValue: value,
    staleAt: now,
  });
}

const MEDIA_DAILY_REFRESH_TIME = String(
  process.env.MEDIA_DAILY_REFRESH_TIME || "03:30",
).trim();
const MEDIA_DAILY_REFRESH_TZ = String(
  process.env.MEDIA_DAILY_REFRESH_TZ || "Europe/Amsterdam",
).trim();

function parseDailyRefreshTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 3, minute: 30 };
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return { hour, minute };
}

function getNowPartsInTimezone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const read = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function clearMediaCaches() {
  const before = __cache.size;
  const mediaKeyPattern =
    /^(movies_|series_|movie_|tv_|vod-|vod_|trailer_|tmdb|search_|media_)/i;
  for (const key of __cache.keys()) {
    if (mediaKeyPattern.test(String(key))) {
      __cache.delete(key);
    }
  }
  return {
    before,
    after: __cache.size,
    cleared: Math.max(0, before - __cache.size),
  };
}

async function runDailyMediaRefresh(baseUrl) {
  const cacheStats = clearMediaCaches();
  const routes = [
    "/api/movies/trending?page=1&language=nl-NL",
    "/api/series/trending?page=1&language=nl-NL",
    "/api/vod/catalog?type=all&years=30&chunkYears=6&pagesPerYear=2",
    "/api/vod/collection?title=Avatar&depth=5",
    "/api/vod/collection?title=Marvel&depth=5",
    "/api/vod/studio?id=420&name=Marvel%20Studios&depth=7",
    "/api/vod/studio?id=174&name=Warner%20Bros.%20Pictures&depth=7",
  ];
  const started = Date.now();
  const results = await Promise.allSettled(
    routes.map(async (route) => {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { "user-agent": "Nexora-MediaRefresh/1.0" },
        signal: AbortSignal.timeout(35_000),
      });
      return { route, ok: response.ok, status: response.status };
    }),
  );
  const okCount = results.filter(
    (r) => r.status === "fulfilled" && r.value?.ok,
  ).length;
  serverLog.info("Daily media refresh completed", {
    cacheCleared: cacheStats.cleared,
    warmed: okCount,
    total: routes.length,
    ms: Date.now() - started,
  });
}

function startDailyMediaRefreshScheduler(baseUrl) {
  const target = parseDailyRefreshTime(MEDIA_DAILY_REFRESH_TIME);
  let lastRunDateKey = "";
  let inProgress = false;

  const tick = async () => {
    if (inProgress) return;
    const now = getNowPartsInTimezone(MEDIA_DAILY_REFRESH_TZ);
    const dateKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
    const isTargetMinute =
      now.hour === target.hour && now.minute === target.minute;
    if (!isTargetMinute || lastRunDateKey === dateKey) return;

    inProgress = true;
    try {
      await runDailyMediaRefresh(baseUrl);
      lastRunDateKey = dateKey;
    } catch (error) {
      serverLog.warn("Daily media refresh failed", {
        message: error?.message || String(error),
      });
    } finally {
      inProgress = false;
    }
  };

  serverLog.info("Daily media refresh scheduler enabled", {
    time: MEDIA_DAILY_REFRESH_TIME,
    timezone: MEDIA_DAILY_REFRESH_TZ,
  });

  // Run check immediately and then every minute.
  tick().catch(() => {});
  setInterval(() => {
    tick().catch(() => {});
  }, 60 * 1000);
}

async function getOrFetch(key, ttlMs, fetcher) {
  const cached = await cacheGet(key);
  if (cached) return cached;
  const existing = __inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const value = await fetcher();
      await cacheSet(key, value, ttlMs);
      return value;
    } finally {
      __inflight.delete(key);
    }
  })();
  __inflight.set(key, p);
  return p;
}

// IPTV-friendly headers that most M3U/Xtream servers accept
const IPTV_HEADERS = {
  "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
};

app.post("/api/playlist/parse", playlistLimiter, async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });

    // SSRF protection: only public http/https URLs
    let parsedUrl;
    try {
      parsedUrl = new URL(String(url));
    } catch {
      return res.status(400).json({ error: "Ongeldige URL" });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res
        .status(400)
        .json({ error: "Alleen http:// en https:// URLs zijn toegestaan" });
    }
    const hn = parsedUrl.hostname.toLowerCase();
    const isPrivateHost =
      /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(
        hn,
      );
    if (isPrivateHost && process.env.NODE_ENV !== "development") {
      return res
        .status(400)
        .json({ error: "Interne netwerk-adressen zijn niet toegestaan" });
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
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
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

    const isHls =
      txt.includes("#EXT-X-STREAM-INF") ||
      txt.includes("#EXT-X-TARGETDURATION");
    if (isHls) {
      const channelName = channelNameFromUrl(url);
      return res.json({
        live: [
          {
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
          },
        ],
        movies: [],
        series: [],
        source: url,
      });
    }

    if (!txt.includes("#EXTM3U") && !txt.includes("#EXTINF")) {
      return res
        .status(422)
        .json({ error: "Geen geldig M3U bestand op deze URL." });
    }

    const parsed = parseM3U(txt);
    parsed.live = (parsed.live || []).map((ch) => ({
      ...ch,
      url: resolvePlaylistEntryUrl(url, ch?.url),
    }));
    parsed.movies = (parsed.movies || []).map((ch) => ({
      ...ch,
      url: resolvePlaylistEntryUrl(url, ch?.url),
    }));
    parsed.series = (parsed.series || []).map((ch) => ({
      ...ch,
      url: resolvePlaylistEntryUrl(url, ch?.url),
    }));
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

    // Cap at 60 candidates and probe concurrently in batches of 5.
    // (Previously 80 sequential probes with 6.5s timeout each was impractically slow.)
    const unique = [];
    const seen = new Set();
    for (const row of channels.slice(0, 60)) {
      const id = String(row?.id || row?.url || "").trim();
      const url = String(row?.url || "").trim();
      if (!id || !url || seen.has(id)) continue;
      seen.add(id);
      unique.push({ id, url });
    }

    const activated = {};
    let okCount = 0;
    const CONCURRENT = 5;
    for (let i = 0; i < unique.length; i += CONCURRENT) {
      const batch = unique.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          // Short 3s timeout for activation probes — player handles actual errors
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3000);
          try {
            const resp = await fetch(row.url, {
              method: "HEAD",
              headers: IPTV_HEADERS,
              redirect: "follow",
              signal: ctrl.signal,
            });
            clearTimeout(t);
            const code = Number(resp.status || 0);
            // Accept 2xx, 206, 3xx, 401, 403 — reject 404/410 and other 4xx gone codes.
            if (
              (code >= 200 && code < 300) ||
              code === 206 ||
              (code >= 300 && code < 400) ||
              code === 401 ||
              code === 403
            ) {
              return { id: row.id, url: String(resp.url || row.url), ok: true };
            }
          } catch {
            clearTimeout(t);
          }
          return { id: row.id, url: row.url, ok: false };
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) {
          activated[r.value.id] = r.value.url;
          okCount++;
        }
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
      return res
        .status(400)
        .json({ error: "host, username en password zijn vereist" });
    }

    let baseUrl = String(host).trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = "http://" + baseUrl;

    // SSRF protection
    let parsedHost;
    try {
      parsedHost = new URL(baseUrl);
    } catch {
      return res.status(400).json({ error: "Ongeldige host URL" });
    }
    const hn = parsedHost.hostname.toLowerCase();
    const isPrivateHost =
      /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(
        hn,
      );
    if (isPrivateHost && process.env.NODE_ENV !== "development") {
      return res
        .status(400)
        .json({ error: "Interne netwerk-adressen zijn niet toegestaan" });
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
        if (
          txt.includes("#EXTM3U") ||
          txt.includes("#EXTINF") ||
          txt.includes("#EXT-X-STREAM-INF") ||
          txt.includes("#EXT-X-TARGETDURATION")
        ) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        return res.status(422).json({
          error:
            "Geen geldig M3U ontvangen van Xtream server. Controleer credentials of output type.",
        });
      }

      const isHls =
        txt.includes("#EXT-X-STREAM-INF") ||
        txt.includes("#EXT-X-TARGETDURATION");
      if (isHls) {
        const channelName = channelNameFromUrl(baseUrl);
        return res.json({
          live: [
            {
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
            },
          ],
          movies: [],
          series: [],
          source: "xtream",
        });
      }

      const parsed = parseM3U(txt);
      parsed.live = (parsed.live || []).map((ch) => ({
        ...ch,
        url: resolvePlaylistEntryUrl(baseUrl, ch?.url),
      }));
      parsed.movies = (parsed.movies || []).map((ch) => ({
        ...ch,
        url: resolvePlaylistEntryUrl(baseUrl, ch?.url),
      }));
      parsed.series = (parsed.series || []).map((ch) => ({
        ...ch,
        url: resolvePlaylistEntryUrl(baseUrl, ch?.url),
      }));
      // Enrich movies/series with TMDB poster, backdrop, metadata
      await enrichWithTmdb(parsed);
      console.log(
        `[xtream] ${baseUrl}: ${parsed.live.length} live, ${parsed.movies.length} movies, ${parsed.series.length} series`,
      );
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

// ─── iptv-org Free Channel Discovery ─────────────────────────────────────────
// Fetches and caches public M3U playlists from iptv-org.github.io.
// Supported params (mutually exclusive):
//   country=nl  → https://iptv-org.github.io/iptv/countries/nl.m3u
//   category=news → https://iptv-org.github.io/iptv/categories/news.m3u
//
// Known free categories: news, kids, documentary, entertainment,
//   comedy, movies, music, series, cooking, travel, education
// Country: any ISO 3166-1 alpha-2 code (nl, be, de, fr, gb, es, us …)

const iptvOrgCache = new Map(); // cacheKey -> { data, ts }
const IPTV_ORG_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const IPTV_ORG_DISCOVER_LIMITS = {
  live: 1000,
  movies: 3000,
  series: 3000,
};
const IPTV_ORG_DISCOVER_CACHE_VERSION = `v2-${IPTV_ORG_DISCOVER_LIMITS.live}-${IPTV_ORG_DISCOVER_LIMITS.movies}-${IPTV_ORG_DISCOVER_LIMITS.series}`;
const IPTV_ORG_DISCOVER_AGGREGATES = {
  movies: [
    "categories/movies",
    "categories/entertainment",
    "categories/documentary",
    "categories/kids",
  ],
  series: [
    "categories/series",
    "categories/entertainment",
    "categories/kids",
    "categories/documentary",
  ],
};

function dedupeIptvOrgEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== "object") continue;
    const urlKey = String(entry.url || "")
      .trim()
      .toLowerCase();
    const epgKey = String(entry.epgId || "")
      .trim()
      .toLowerCase();
    const nameKey = String(entry.name || entry.title || "")
      .trim()
      .toLowerCase();
    const groupKey = String(entry.group || "")
      .trim()
      .toLowerCase();
    const key = urlKey || `${epgKey}::${nameKey}::${groupKey}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

// Country metadata for display (label + flag emoji)
const IPTV_ORG_COUNTRIES = {
  nl: { label: "Netherlands", flag: "🇳🇱" },
  be: { label: "Belgium", flag: "🇧🇪" },
  de: { label: "Germany", flag: "🇩🇪" },
  fr: { label: "France", flag: "🇫🇷" },
  gb: { label: "United Kingdom", flag: "🇬🇧" },
  es: { label: "Spain", flag: "🇪🇸" },
  us: { label: "United States", flag: "🇺🇸" },
  it: { label: "Italy", flag: "🇮🇹" },
  tr: { label: "Turkey", flag: "🇹🇷" },
  ar: { label: "Arabic", flag: "🌍" },
};

const IPTV_ORG_CATEGORIES = {
  news: { label: "News", icon: "📰" },
  kids: { label: "Kids", icon: "🧒" },
  documentary: { label: "Documentary", icon: "🎬" },
  entertainment: { label: "Entertainment", icon: "🎭" },
  music: { label: "Music", icon: "🎵" },
  movies: { label: "Movies", icon: "🎥" },
  cooking: { label: "Cooking", icon: "🍳" },
  travel: { label: "Travel", icon: "✈️" },
  education: { label: "Education", icon: "📚" },
};

// GET /api/iptv/discover?country=nl  OR  ?category=sports
// GET /api/iptv/discover/sources — returns the catalogue without fetching M3U
app.get("/api/iptv/discover/sources", (_req, res) => {
  res.json({
    countries: Object.entries(IPTV_ORG_COUNTRIES).map(([id, meta]) => ({
      id,
      ...meta,
      type: "country",
    })),
    categories: Object.entries(IPTV_ORG_CATEGORIES).map(([id, meta]) => ({
      id,
      ...meta,
      type: "category",
    })),
  });
});

app.get("/api/iptv/discover", playlistLimiter, async (req, res) => {
  try {
    const country = String(req.query.country || "")
      .toLowerCase()
      .trim();
    const category = String(req.query.category || "")
      .toLowerCase()
      .trim();

    if (!country && !category) {
      return res
        .status(400)
        .json({ error: "Geef een 'country' of 'category' parameter op." });
    }

    const param = country || category;
    // Only allow safe alphanumeric identifiers — prevents path traversal
    if (!/^[a-z]{2,32}$/.test(param)) {
      return res.status(400).json({ error: "Ongeldige parameter." });
    }

    const pathSegments = country
      ? [`countries/${param}`]
      : IPTV_ORG_DISCOVER_AGGREGATES[param] || [`categories/${param}`];
    const m3uUrls = pathSegments.map(
      (segment) => `https://iptv-org.github.io/iptv/${segment}.m3u`,
    );
    const primaryPathSegment = pathSegments[0];
    const primaryUrl = m3uUrls[0];
    const cacheKey = `iptv-org:${IPTV_ORG_DISCOVER_CACHE_VERSION}:${pathSegments.join("|")}`;

    const cached = iptvOrgCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < IPTV_ORG_CACHE_TTL) {
      return res.json(cached.data);
    }

    const fetchedPlaylists = [];
    for (const m3uUrl of m3uUrls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const r = await fetch(m3uUrl, {
          headers: { "User-Agent": "Nexora/2.4 Channel-Discovery" },
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!r.ok) continue;
        const txt = await r.text();
        if (!txt.includes("#EXTM3U") && !txt.includes("#EXTINF")) continue;
        fetchedPlaylists.push({ url: m3uUrl, parsed: parseM3U(txt) });
      } catch (_error) {
        clearTimeout(timer);
      }
    }

    if (!fetchedPlaylists.length) {
      return res.status(502).json({
        error: "Kan iptv-org niet bereiken of geen geldige M3U ophalen.",
      });
    }

    const live = dedupeIptvOrgEntries(
      fetchedPlaylists.flatMap((playlist) =>
        Array.isArray(playlist.parsed?.live) ? playlist.parsed.live : [],
      ),
    ).slice(0, IPTV_ORG_DISCOVER_LIMITS.live);
    const movies = dedupeIptvOrgEntries(
      fetchedPlaylists.flatMap((playlist) =>
        Array.isArray(playlist.parsed?.movies) ? playlist.parsed.movies : [],
      ),
    ).slice(0, IPTV_ORG_DISCOVER_LIMITS.movies);
    const series = dedupeIptvOrgEntries(
      fetchedPlaylists.flatMap((playlist) =>
        Array.isArray(playlist.parsed?.series) ? playlist.parsed.series : [],
      ),
    ).slice(0, IPTV_ORG_DISCOVER_LIMITS.series);

    const meta = country
      ? IPTV_ORG_COUNTRIES[param] || { label: param.toUpperCase(), flag: "🌍" }
      : IPTV_ORG_CATEGORIES[param] || { label: param, icon: "📺" };

    const data = {
      live,
      movies,
      series,
      source: "iptv-org",
      url: primaryUrl,
      urls: m3uUrls,
      meta,
    };
    iptvOrgCache.set(cacheKey, { data, ts: Date.now() });
    console.log(
      `[iptv-org] ${primaryPathSegment}: ${live.length} live, ${movies.length} movies, ${series.length} series from ${fetchedPlaylists.length} playlist(s)`,
    );
    res.json(data);
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
const TMDB_TIMEOUT_MS = Number(process.env.TMDB_TIMEOUT_MS || 7000);
const TMDB_CACHE_TTL_MS = Number(
  process.env.TMDB_CACHE_TTL_MS || 5 * 60 * 1000,
);

async function tmdb(pathAndQuery, options = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;

  const timeoutMs = Number(options?.timeoutMs || TMDB_TIMEOUT_MS);
  const cacheTtlMs = Number(options?.cacheTtlMs ?? TMDB_CACHE_TTL_MS);

  // Append api_key + language as query params (v3 auth — Bearer only works with v4 read-access tokens)
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE}${pathAndQuery}${sep}api_key=${encodeURIComponent(key)}&language=nl-NL`;

  const cacheKey = `tmdb:${url}`;
  if (cacheTtlMs > 0) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const data = await r.json();
    if (!r.ok) {
      const e = new Error(`TMDB error (${r.status})`);
      e.statusCode = r.status;
      e.details = data;
      throw e;
    }
    if (cacheTtlMs > 0) cacheSet(cacheKey, data, cacheTtlMs);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch TMDB videos with all languages included (trailers are often only in English)
async function tmdbVideosAllLangs(mediaType, tmdbId) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const cacheKey = `tmdb-videos-all:${mediaType}:${tmdbId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  // Use api_key query param (v3 auth) — Bearer only works with v4 read-access tokens
  const url = `${TMDB_BASE}/${mediaType}/${encodeURIComponent(tmdbId)}/videos?include_video_language=en,nl,de,fr,null&api_key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const payload = await r.json();
    cacheSet(cacheKey, payload, 30 * 60 * 1000);
    return payload;
  } catch {
    return null;
  }
}

// ─── OMDB (Open Movie Database) enrichment ───────────────────────────────────
// Provides real IMDb ratings, Rotten Tomatoes %, Metacritic, awards, box office.
// Free tier: 1 000 req/day — mitigated by 24 h per-title cache.
const OMDB_BASE = "https://www.omdbapi.com";
const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

async function omdbFetch(imdbId) {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return null;
  const cacheKey = `omdb:${imdbId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  try {
    const url = `${OMDB_BASE}/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbId)}&plot=full`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (data?.Response === "False") return null;
    await cacheSet(cacheKey, data, OMDB_CACHE_TTL_MS);
    return data;
  } catch {
    return null;
  }
}

// Returns only non-null OMDB fields to safely spread over mapFullDetail() output.
// The `imdb` key overrides the TMDB vote_average with the real IMDb rating when available.
function mergeOmdb(omdb) {
  if (!omdb) return {};
  const ratings = Array.isArray(omdb.Ratings) ? omdb.Ratings : [];
  const omdbImdb =
    omdb.imdbRating && omdb.imdbRating !== "N/A" ? omdb.imdbRating : null;
  const rtRaw =
    ratings.find((r) => r.Source === "Rotten Tomatoes")?.Value || null;
  const rtScore = rtRaw ? Number(String(rtRaw).replace(/[^0-9.]/g, "")) : null;
  const metacriticScore =
    omdb.Metascore && omdb.Metascore !== "N/A"
      ? Number(String(omdb.Metascore).replace(/[^0-9.]/g, ""))
      : null;
  const imdbVotes =
    omdb.imdbVotes && omdb.imdbVotes !== "N/A"
      ? Number(String(omdb.imdbVotes).replace(/,/g, ""))
      : null;

  return {
    ...(omdbImdb ? { imdb: omdbImdb } : {}),
    imdbId: omdb.imdbID || null,
    imdbRating: omdbImdb ? Number(omdbImdb) : null,
    imdbVotes,
    // Keep both legacy/raw and normalized fields for compatibility.
    rottenTomatoes: rtRaw,
    rottenTomatoesRating: Number.isFinite(rtScore) ? rtScore : null,
    metacritic:
      omdb.Metascore && omdb.Metascore !== "N/A" ? omdb.Metascore : null,
    metacriticScore: Number.isFinite(metacriticScore) ? metacriticScore : null,
    rated: omdb.Rated && omdb.Rated !== "N/A" ? omdb.Rated : null,
    awards: omdb.Awards && omdb.Awards !== "N/A" ? omdb.Awards : null,
    boxOffice:
      omdb.BoxOffice && omdb.BoxOffice !== "N/A" ? omdb.BoxOffice : null,
  };
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
      else if (!language || language === "null" || language === "und")
        score += 20;
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
  const genres = (it.genres || [])
    .map((g) => (typeof g === "string" ? g : g.name))
    .filter(Boolean);
  const genreIds = Array.isArray(it.genre_ids) ? it.genre_ids : [];

  // Extract basic production companies for studio identification
  const productionCompanies = (it.production_companies || [])
    .map((company) => ({
      id: Number(company.id),
      name: company.name,
      logo: company.logo_path ? `${TMDB_IMG_500}${company.logo_path}` : null,
    }))
    .filter((company) => company.id && company.name)
    .slice(0, 3);

  return {
    id: String(it.id),
    tmdbId: Number(it.id),
    title: it.title || it.name || "",
    poster: it.poster_path ? `${TMDB_IMG_500}${it.poster_path}` : null,
    backdrop: it.backdrop_path ? `${TMDB_IMG_780}${it.backdrop_path}` : null,
    synopsis: it.overview || "",
    overview: it.overview || "",
    year: (it.release_date || it.first_air_date || "").slice(0, 4),
    releaseDate: it.release_date || it.first_air_date || null,
    imdb: it.vote_average ? String(Number(it.vote_average).toFixed(1)) : null,
    rating: it.vote_average ?? null,
    genre: genres,
    genreIds: genreIds,
    quality: "HD",
    type,
    originalLanguage: it.original_language || null,
    productionCompanies: productionCompanies,
    popularity: it.popularity || null,
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

  const poster = detail.poster_path
    ? `${TMDB_IMG_500}${detail.poster_path}`
    : null;
  const backdrop = detail.backdrop_path
    ? `${TMDB_IMG_780}${detail.backdrop_path}`
    : null;

  const cast = (credits?.cast || []).slice(0, 20).map((c) => ({
    id: String(c.id),
    name: c.name,
    character: c.character || "",
    photo: c.profile_path ? `${TMDB_PROFILE_185}${c.profile_path}` : null,
  }));

  const genres = (detail.genres || []).map((g) => g.name).filter(Boolean);
  const genreIds = (detail.genres || [])
    .map((g) => Number(g.id))
    .filter((value) => Number.isFinite(value));
  const keywordList = Array.isArray(detail?.keywords?.keywords)
    ? detail.keywords.keywords
    : Array.isArray(detail?.keywords?.results)
      ? detail.keywords.results
      : [];
  const keywords = keywordList.map((keyword) => keyword?.name).filter(Boolean);

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
  const productionCompanies = (detail.production_companies || [])
    .map((company) => ({
      id: Number(company.id),
      name: company.name,
      logo: company.logo_path ? `${TMDB_IMG_500}${company.logo_path}` : null,
    }))
    .filter((company) => company.id && company.name);
  const runtimeMinutes =
    type === "movie"
      ? Number(detail.runtime || 0) || null
      : Number((detail.episode_run_time || [])[0] || 0) || null;

  return {
    id: String(detail.id),
    tmdbId: Number(detail.id),
    type,
    title: detail.title || detail.name || "",
    originalTitle:
      detail.original_title ||
      detail.original_name ||
      detail.title ||
      detail.name ||
      "",
    tagline: detail.tagline || "",
    synopsis: detail.overview || "",
    poster,
    backdrop,
    trailerKey,
    trailerCandidates,
    year: (detail.release_date || detail.first_air_date || "").slice(0, 4),
    releaseDate: detail.release_date || detail.first_air_date || null,
    status: detail.status || "",
    imdb: detail.vote_average
      ? String(Number(detail.vote_average).toFixed(1))
      : null,
    tmdbRating: detail.vote_average ? Number(detail.vote_average) : null,
    rating: detail.vote_average
      ? String(Number(detail.vote_average).toFixed(1))
      : null,
    voteCount: Number(detail.vote_count || 0) || null,
    popularity: Number(detail.popularity || 0) || null,
    duration: runtimeMinutes ? minutesToDuration(runtimeMinutes) : null,
    runtimeMinutes,
    budget: type === "movie" ? Number(detail.budget || 0) || null : null,
    revenue: type === "movie" ? Number(detail.revenue || 0) || null : null,
    originalLanguage:
      String(detail.original_language || "").toUpperCase() || null,
    spokenLanguages,
    countries,
    studios,
    directors,
    writers,
    seasons:
      type === "series"
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
    totalSeasons:
      type === "series"
        ? Number(
            detail.number_of_seasons || (detail.seasons || []).length || 0,
          ) || null
        : null,
    totalEpisodes:
      type === "series" ? Number(detail.number_of_episodes || 0) || null : null,
    genre: genres,
    genreIds,
    keywords,
    quality: "HD",
    cast,
    networks,
    creators,
    collection: detail.belongs_to_collection
      ? {
          id: Number(detail.belongs_to_collection.id),
          name: detail.belongs_to_collection.name,
          poster: detail.belongs_to_collection.poster_path
            ? `${TMDB_IMG_500}${detail.belongs_to_collection.poster_path}`
            : null,
          backdrop: detail.belongs_to_collection.backdrop_path
            ? `${TMDB_IMG_780}${detail.belongs_to_collection.backdrop_path}`
            : null,
        }
      : null,
    productionCompanies,
  };
}

function sortMediaChronologically(items) {
  return [...(items || [])].sort((left, right) => {
    const leftDate =
      Date.parse(
        left?.releaseDate || left?.release_date || left?.first_air_date || "",
      ) || 0;
    const rightDate =
      Date.parse(
        right?.releaseDate ||
          right?.release_date ||
          right?.first_air_date ||
          "",
      ) || 0;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return String(left?.title || left?.name || "").localeCompare(
      String(right?.title || right?.name || ""),
    );
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeMappedMedia(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const tmdbId = String(item?.tmdbId || item?.id || "").trim();
    const type = String(item?.type || "movie").trim();
    const title = String(item?.title || item?.name || "")
      .trim()
      .toLowerCase();
    const year = String(item?.year || "").slice(0, 4);
    const key = tmdbId ? `${type}:${tmdbId}` : `${type}:${title}:${year}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getThirtyYearWindow(yearCount = 30) {
  const currentYear = new Date().getUTCFullYear();
  const toYear = currentYear;
  const fromYear = currentYear - Math.max(1, yearCount) + 1;
  return { fromYear, toYear };
}

function buildYearSequence(fromYear, toYear) {
  const years = [];
  for (let year = fromYear; year <= toYear; year += 1) years.push(year);
  return years;
}

app.get("/api/movies/trending", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY)
      return res.json({
        trending: [],
        newReleases: [],
        topRated: [],
        popular: [],
        upcoming: [],
        hiddenGems: [],
        acclaimed: [],
        error: "TMDB_API_KEY niet geconfigureerd.",
      });

    const [
      trending,
      nowPlaying,
      topRated,
      popular,
      upcoming,
      trendingP2,
      popularP2,
    ] = await Promise.all([
      tmdb("/trending/movie/week"),
      tmdb("/movie/now_playing"),
      tmdb("/movie/top_rated"),
      tmdb("/movie/popular"),
      tmdb("/movie/upcoming"),
      tmdb("/trending/movie/week?page=2"),
      tmdb("/movie/popular?page=2"),
    ]);

    // Hidden gems: high rating, lower popularity
    const hiddenGems = await tmdb(
      "/discover/movie?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1",
    ).catch(() => ({ results: [] }));
    // Critically acclaimed: 8+ rating, 1000+ votes
    const acclaimed = await tmdb(
      "/discover/movie?sort_by=vote_average.desc&vote_count.gte=1000&vote_average.gte=8&page=1",
    ).catch(() => ({ results: [] }));

    res.json({
      trending: [
        ...(trending?.results || []),
        ...(trendingP2?.results || []),
      ].map((it) => mapTrendingItem(it, "movie")),
      newReleases: (nowPlaying?.results || []).map((it) =>
        mapTrendingItem(it, "movie"),
      ),
      topRated: (topRated?.results || []).map((it) =>
        mapTrendingItem(it, "movie"),
      ),
      popular: [...(popular?.results || []), ...(popularP2?.results || [])].map(
        (it) => mapTrendingItem(it, "movie"),
      ),
      upcoming: (upcoming?.results || []).map((it) =>
        mapTrendingItem(it, "movie"),
      ),
      hiddenGems: (hiddenGems?.results || [])
        .slice(0, 20)
        .map((it) => mapTrendingItem(it, "movie")),
      acclaimed: (acclaimed?.results || [])
        .slice(0, 20)
        .map((it) => mapTrendingItem(it, "movie")),
    });
  } catch (e) {
    res.status(200).json({
      trending: [],
      newReleases: [],
      topRated: [],
      popular: [],
      upcoming: [],
      hiddenGems: [],
      acclaimed: [],
      error: String(e?.message || e),
    });
  }
});

app.get("/api/series/trending", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY)
      return res.json({
        trending: [],
        newReleases: [],
        topRated: [],
        popular: [],
        airingToday: [],
        hiddenGems: [],
        error: "TMDB_API_KEY niet geconfigureerd.",
      });

    const [
      trending,
      onTheAir,
      topRated,
      popular,
      airingToday,
      trendingP2,
      popularP2,
    ] = await Promise.all([
      tmdb("/trending/tv/week"),
      tmdb("/tv/on_the_air"),
      tmdb("/tv/top_rated"),
      tmdb("/tv/popular"),
      tmdb("/tv/airing_today"),
      tmdb("/trending/tv/week?page=2"),
      tmdb("/tv/popular?page=2"),
    ]);

    // Hidden gems: high rating, lower popularity
    const hiddenGems = await tmdb(
      "/discover/tv?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1",
    ).catch(() => ({ results: [] }));

    res.json({
      trending: [
        ...(trending?.results || []),
        ...(trendingP2?.results || []),
      ].map((it) => mapTrendingItem(it, "series")),
      newReleases: (onTheAir?.results || []).map((it) =>
        mapTrendingItem(it, "series"),
      ),
      topRated: (topRated?.results || []).map((it) =>
        mapTrendingItem(it, "series"),
      ),
      popular: [...(popular?.results || []), ...(popularP2?.results || [])].map(
        (it) => mapTrendingItem(it, "series"),
      ),
      airingToday: (airingToday?.results || []).map((it) =>
        mapTrendingItem(it, "series"),
      ),
      hiddenGems: (hiddenGems?.results || [])
        .slice(0, 20)
        .map((it) => mapTrendingItem(it, "series")),
    });
  } catch (e) {
    res.status(200).json({
      trending: [],
      newReleases: [],
      topRated: [],
      popular: [],
      airingToday: [],
      hiddenGems: [],
      error: String(e?.message || e),
    });
  }
});

// Discover movies by genre — provides genre-specific rows for richer browsing
app.get("/api/movies/discover-by-genre", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ rows: [] });
    const genreMap = {
      28: "Action",
      12: "Adventure",
      16: "Animation",
      35: "Comedy",
      80: "Crime",
      99: "Documentary",
      18: "Drama",
      10751: "Family",
      14: "Fantasy",
      36: "History",
      27: "Horror",
      10402: "Music",
      9648: "Mystery",
      10749: "Romance",
      878: "Sci-Fi",
      53: "Thriller",
      10752: "War",
      37: "Western",
    };
    const genreIds = Object.keys(genreMap);
    // Fetch 6 popular genres in parallel (Action, Comedy, Drama, Horror, Sci-Fi, Thriller)
    const selected = [28, 35, 18, 27, 878, 53];
    const promises = selected.map((gid) =>
      tmdb(
        `/discover/movie?with_genres=${gid}&sort_by=popularity.desc&page=1&vote_count.gte=100`,
      ),
    );
    const results = await Promise.all(promises);
    const rows = selected
      .map((gid, i) => ({
        genreId: gid,
        genreName: genreMap[gid],
        items: (results[i]?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      }))
      .filter((r) => r.items.length > 0);
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
      10759: "Action & Adventure",
      35: "Comedy",
      80: "Crime",
      99: "Documentary",
      18: "Drama",
      10751: "Family",
      10762: "Kids",
      9648: "Mystery",
      10764: "Reality",
      10765: "Sci-Fi & Fantasy",
      53: "Thriller",
    };
    const selected = [10759, 35, 80, 18, 9648, 10765];
    const promises = selected.map((gid) =>
      tmdb(
        `/discover/tv?with_genres=${gid}&sort_by=popularity.desc&page=1&vote_count.gte=50`,
      ),
    );
    const results = await Promise.all(promises);
    const rows = selected
      .map((gid, i) => ({
        genreId: gid,
        genreName: genreMap[gid],
        items: (results[i]?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "series")),
      }))
      .filter((r) => r.items.length > 0);
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
    const data = await tmdb(
      `${endpoint}?query=${encodeURIComponent(String(query))}&page=1`,
    );
    const first = (data?.results || [])[0];
    if (!first) return res.json(null);
    const mediaType = type === "tv" ? "series" : "movie";
    const detail = await tmdb(
      type === "tv"
        ? `/tv/${first.id}?append_to_response=keywords,videos,credits,external_ids`
        : `/movie/${first.id}?append_to_response=keywords,videos,credits,external_ids`,
    );
    let videos = detail?.videos || { results: [] };
    const credits = detail?.credits || { cast: [], crew: [] };
    let finalVideos = videos;
    if (!pickTrailerKey(videos)) {
      const allLangVideos = await tmdbVideosAllLangs(
        type === "tv" ? "tv" : "movie",
        first.id,
      );
      if (allLangVideos && pickTrailerKey(allLangVideos))
        finalVideos = allLangVideos;
    }
    const omdbData = await omdbFetch(detail?.external_ids?.imdb_id);
    res.json({
      ...mapFullDetail(detail, finalVideos, credits, mediaType),
      ...mergeOmdb(omdbData),
    });
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
    const movies = (movieData?.results || [])
      .slice(0, 15)
      .map((it) => mapTrendingItem(it, "movie"));
    const series = (tvData?.results || [])
      .slice(0, 15)
      .map((it) => mapTrendingItem(it, "series"));
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
    const genreIds = String(req.query.genres || "")
      .split(",")
      .filter(Boolean)
      .slice(0, 5);
    const genreStr = genreIds.join(",");
    if (!genreStr) return res.json({ movies: [], series: [] });

    const cacheKey = `rec-for-you-${genreStr}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [movieData, tvData] = await Promise.all([
      tmdb(
        `/discover/movie?with_genres=${genreStr}&sort_by=vote_average.desc&vote_count.gte=100&page=1`,
      ),
      tmdb(
        `/discover/tv?with_genres=${genreStr}&sort_by=vote_average.desc&vote_count.gte=50&page=1`,
      ),
    ]);
    const movies = (movieData?.results || [])
      .slice(0, 20)
      .map((it) => mapTrendingItem(it, "movie"));
    const series = (tvData?.results || [])
      .slice(0, 20)
      .map((it) => mapTrendingItem(it, "series"));
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

    // Cache by ID only — title hint is a 404 fallback and does not change the result
    const cacheKey = `movie-full:${String(req.params.id || "")}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    let id = req.params.id;
    let detail;

    try {
      detail = await tmdb(
        `/movie/${encodeURIComponent(id)}?append_to_response=keywords,videos,credits,external_ids`,
      );
    } catch (idErr) {
      // Fallback: search by title if direct ID lookup fails (e.g. 404)
      const title = String(req.query.title || "").trim();
      if (title && idErr?.statusCode === 404) {
        const search = await tmdb(
          `/search/movie?query=${encodeURIComponent(title)}`,
        );
        const first = search?.results?.[0];
        if (first?.id) {
          id = String(first.id);
          detail = await tmdb(
            `/movie/${encodeURIComponent(id)}?append_to_response=keywords,videos,credits,external_ids`,
          );
        } else {
          throw idErr;
        }
      } else {
        throw idErr;
      }
    }

    const credits = detail?.credits || { cast: [], crew: [] };

    // Fetch all-language videos in parallel with the main detail to reduce latency
    const [allLangVideos, omdbData] = await Promise.all([
      tmdbVideosAllLangs("movie", id),
      omdbFetch(detail?.external_ids?.imdb_id),
    ]);
    const finalVideos =
      allLangVideos && pickTrailerKey(allLangVideos)
        ? allLangVideos
        : detail?.videos || { results: [] };

    const payload = {
      ...mapFullDetail(detail, finalVideos, credits, "movie"),
      ...mergeOmdb(omdbData),
    };
    cacheSet(cacheKey, payload, 30 * 60 * 1000);
    res.json(payload);
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
});

app.get("/api/series/:id/full", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json(null);

    // Cache by ID only — title hint is a 404 fallback and does not change the result
    const cacheKey = `series-full:${String(req.params.id || "")}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    let id = req.params.id;
    let detail;

    try {
      detail = await tmdb(
        `/tv/${encodeURIComponent(id)}?append_to_response=keywords,videos,credits,external_ids`,
      );
    } catch (idErr) {
      // Fallback: search by title if direct ID lookup fails (e.g. 404)
      const title = String(req.query.title || "").trim();
      if (title && idErr?.statusCode === 404) {
        const search = await tmdb(
          `/search/tv?query=${encodeURIComponent(title)}`,
        );
        const first = search?.results?.[0];
        if (first?.id) {
          id = String(first.id);
          detail = await tmdb(
            `/tv/${encodeURIComponent(id)}?append_to_response=keywords,videos,credits,external_ids`,
          );
        } else {
          throw idErr;
        }
      } else {
        throw idErr;
      }
    }

    const credits = detail?.credits || { cast: [], crew: [] };

    // Fetch all-language videos and OMDB in parallel to reduce latency
    const [allLangVideosTv, omdbData] = await Promise.all([
      tmdbVideosAllLangs("tv", id),
      omdbFetch(detail?.external_ids?.imdb_id),
    ]);
    const finalVideos =
      allLangVideosTv && pickTrailerKey(allLangVideosTv)
        ? allLangVideosTv
        : detail?.videos || { results: [] };

    const payload = {
      ...mapFullDetail(detail, finalVideos, credits, "series"),
      ...mergeOmdb(omdbData),
    };
    cacheSet(cacheKey, payload, 30 * 60 * 1000);
    res.json(payload);
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
});

app.get(
  "/api/series/:id/season/:seasonNumber",
  tmdbLimiter,
  async (req, res) => {
    try {
      if (!process.env.TMDB_API_KEY) return res.json({ episodes: [] });

      const id = String(req.params.id || "").trim();
      const seasonNumber = Math.max(
        1,
        Number(req.params.seasonNumber || 1) || 1,
      );
      const season = await tmdb(
        `/tv/${encodeURIComponent(id)}/season/${seasonNumber}`,
      );

      const episodes = (season?.episodes || []).map((ep) => ({
        id: String(ep.id || `${seasonNumber}-${ep.episode_number || 0}`),
        title: String(ep.name || `Episode ${ep.episode_number || ""}`).trim(),
        number: Number(ep.episode_number || 0) || 0,
        image: ep.still_path ? `${TMDB_IMG_780}${ep.still_path}` : null,
        durationMinutes: Number(ep.runtime || 0) || null,
        duration: minutesToDuration(Number(ep.runtime || 0) || 0),
        overview: String(ep.overview || "").trim(),
        airDate: ep.air_date || null,
        seasonNumber,
      }));

      res.json({
        id: String(season?.id || `${id}-s${seasonNumber}`),
        seasonNumber,
        name: String(season?.name || `Season ${seasonNumber}`),
        overview: String(season?.overview || "").trim(),
        poster: season?.poster_path
          ? `${TMDB_IMG_500}${season.poster_path}`
          : null,
        episodes,
      });
    } catch (e) {
      res.status(200).json({ episodes: [], error: String(e?.message || e) });
    }
  },
);

app.get("/api/vod/collection", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY)
      return res.json({ collection: null, items: [] });

    const requestedId = Number(req.query.id || 0);
    const requestedTitle = String(req.query.title || "").trim();
    const depth = clampInt(req.query.depth, 1, 5, 3);
    const cacheKey = `vod-collection:${requestedId || "none"}:${normalizeText(requestedTitle)}:${depth}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);
    let collectionId = requestedId;

    if (!collectionId && requestedTitle) {
      const search = await tmdb(
        `/search/movie?query=${encodeURIComponent(requestedTitle)}&page=1`,
      );
      const first = search?.results?.[0];
      if (first?.id) {
        const detail = await tmdb(
          `/movie/${encodeURIComponent(first.id)}?append_to_response=keywords`,
        ).catch(() => null);
        collectionId = Number(detail?.belongs_to_collection?.id || 0);
      }
    }

    if (!collectionId && !requestedTitle)
      return res.json({ collection: null, items: [] });

    let collectionPayload = null;
    if (collectionId) {
      collectionPayload = await tmdb(
        `/collection/${encodeURIComponent(collectionId)}`,
      ).catch(() => null);
    }

    const tmdbCollectionItems = (collectionPayload?.parts || []).map(
      (item) => ({
        ...mapTrendingItem(item, "movie"),
        type: "movie",
        releaseDate: item.release_date || null,
      }),
    );

    // Only run title-search fallback when we have no real TMDB collection parts
    let fallbackItems = [];
    const fallbackQuery = !tmdbCollectionItems.length
      ? requestedTitle || String(collectionPayload?.name || "").trim()
      : "";
    if (fallbackQuery) {
      const pages = Array.from({ length: depth }, (_, index) => index + 1);
      const movieSearches = await Promise.all(
        pages.map((page) =>
          tmdb(
            `/search/movie?query=${encodeURIComponent(fallbackQuery)}&page=${page}`,
          ).catch(() => ({ results: [] })),
        ),
      );
      const seriesSearches = await Promise.all(
        pages.map((page) =>
          tmdb(
            `/search/tv?query=${encodeURIComponent(fallbackQuery)}&page=${page}`,
          ).catch(() => ({ results: [] })),
        ),
      );

      const mappedMovies = movieSearches.flatMap((result) =>
        (result?.results || []).map((item) => ({
          ...mapTrendingItem(item, "movie"),
          type: "movie",
          releaseDate: item.release_date || null,
        })),
      );
      const mappedSeries = seriesSearches.flatMap((result) =>
        (result?.results || []).map((item) => ({
          ...mapTrendingItem(item, "series"),
          type: "series",
          releaseDate: item.first_air_date || null,
        })),
      );

      fallbackItems = [...mappedMovies, ...mappedSeries].filter((item) => {
        const normTitle = normalizeText(String(item?.title || ""));
        const normQuery = normalizeText(fallbackQuery);
        if (!normQuery) return true;
        return (
          normTitle.includes(normQuery) ||
          normQuery
            .split(" ")
            .some((token) => token.length >= 4 && normTitle.includes(token))
        );
      });
    }

    const items = sortMediaChronologically(
      dedupeMappedMedia([...tmdbCollectionItems, ...fallbackItems]),
    );
    const movieCount = items.filter((item) => item.type === "movie").length;
    const seriesCount = items.filter((item) => item.type === "series").length;

    const result = {
      collection: {
        id: Number(collectionPayload?.id || collectionId || 0) || null,
        name: collectionPayload?.name || requestedTitle || "Collection",
        overview: collectionPayload?.overview || "",
        poster: collectionPayload?.poster_path
          ? `${TMDB_IMG_500}${collectionPayload.poster_path}`
          : null,
        backdrop: collectionPayload?.backdrop_path
          ? `${TMDB_IMG_780}${collectionPayload.backdrop_path}`
          : null,
        source: collectionPayload ? "tmdb" : "search",
      },
      items,
      stats: {
        total: items.length,
        movies: movieCount,
        series: seriesCount,
      },
    };
    cacheSet(cacheKey, result, 30 * 60 * 1000);
    res.json(result);
  } catch (e) {
    res
      .status(200)
      .json({ collection: null, items: [], error: String(e?.message || e) });
  }
});

app.get("/api/vod/studio", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ studio: null, items: [] });

    const studioId = Number(req.query.id || 0);
    const studioName = String(req.query.name || "").trim();
    const depth = clampInt(req.query.depth, 1, 10, 6);
    if (!studioId && !studioName) return res.json({ studio: null, items: [] });

    let resolvedStudioId = studioId;
    let resolvedStudio = null;

    if (!resolvedStudioId && studioName) {
      const search = await tmdb(
        `/search/company?query=${encodeURIComponent(studioName)}&page=1`,
      ).catch(() => null);
      const first = (search?.results || [])[0] || null;
      if (first?.id) resolvedStudioId = Number(first.id);
      if (first) resolvedStudio = first;
    }

    if (resolvedStudioId) {
      const companyDetail = await tmdb(
        `/company/${encodeURIComponent(resolvedStudioId)}`,
      ).catch(() => null);
      if (companyDetail) resolvedStudio = companyDetail;
    }

    if (!resolvedStudioId) {
      return res.json({
        studio: {
          id: null,
          name: studioName || "Studio",
          logo: null,
          source: "query-only",
        },
        items: [],
      });
    }

    const pages = Array.from({ length: depth }, (_, index) => index + 1);
    const [
      moviePopularPages,
      movieTopRatedPages,
      seriesPopularPages,
      seriesTopRatedPages,
    ] = await Promise.all([
      Promise.all(
        pages.map((page) =>
          tmdb(
            `/discover/movie?with_companies=${encodeURIComponent(resolvedStudioId)}&sort_by=popularity.desc&vote_count.gte=20&page=${page}`,
          ).catch(() => ({ results: [] })),
        ),
      ),
      Promise.all(
        pages
          .slice(0, Math.min(depth, 4))
          .map((page) =>
            tmdb(
              `/discover/movie?with_companies=${encodeURIComponent(resolvedStudioId)}&sort_by=vote_average.desc&vote_count.gte=120&page=${page}`,
            ).catch(() => ({ results: [] })),
          ),
      ),
      Promise.all(
        pages.map((page) =>
          tmdb(
            `/discover/tv?with_companies=${encodeURIComponent(resolvedStudioId)}&sort_by=popularity.desc&vote_count.gte=10&page=${page}`,
          ).catch(() => ({ results: [] })),
        ),
      ),
      Promise.all(
        pages
          .slice(0, Math.min(depth, 4))
          .map((page) =>
            tmdb(
              `/discover/tv?with_companies=${encodeURIComponent(resolvedStudioId)}&sort_by=vote_average.desc&vote_count.gte=80&page=${page}`,
            ).catch(() => ({ results: [] })),
          ),
      ),
    ]);

    const movies = [...moviePopularPages, ...movieTopRatedPages].flatMap(
      (payload) =>
        (payload?.results || []).map((item) => ({
          ...mapTrendingItem(item, "movie"),
          type: "movie",
          releaseDate: item.release_date || null,
        })),
    );
    const series = [...seriesPopularPages, ...seriesTopRatedPages].flatMap(
      (payload) =>
        (payload?.results || []).map((item) => ({
          ...mapTrendingItem(item, "series"),
          type: "series",
          releaseDate: item.first_air_date || null,
        })),
    );

    const items = sortMediaChronologically(
      dedupeMappedMedia([...movies, ...series]),
    );
    const movieCount = items.filter((item) => item.type === "movie").length;
    const seriesCount = items.filter((item) => item.type === "series").length;

    res.json({
      studio: {
        id: resolvedStudioId,
        name: resolvedStudio?.name || studioName || "Studio",
        logo: resolvedStudio?.logo_path
          ? `${TMDB_IMG_780}${resolvedStudio.logo_path}`
          : null,
        headquarters: resolvedStudio?.headquarters || null,
        originCountry: resolvedStudio?.origin_country || null,
        source: "tmdb",
      },
      items,
      stats: {
        total: items.length,
        movies: movieCount,
        series: seriesCount,
      },
    });
  } catch (e) {
    res
      .status(200)
      .json({ studio: null, items: [], error: String(e?.message || e) });
  }
});

app.get("/api/vod/catalog", tmdbLimiter, async (req, res) => {
  try {
    if (!process.env.TMDB_API_KEY) return res.json({ items: [], meta: null });

    const type = String(req.query.type || "all").toLowerCase(); // movie | series | all
    const requestedYears = clampInt(req.query.years, 5, 30, 30);
    const chunkYears = clampInt(req.query.chunkYears, 1, 6, 3);
    const pagesPerYear = clampInt(req.query.pagesPerYear, 1, 3, 1);
    const { fromYear, toYear } = getThirtyYearWindow(requestedYears);
    const cacheKey = `vod_catalog_${type}_${requestedYears}_${chunkYears}_${pagesPerYear}_${String(req.query.cursorYear || "start")}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);
    const years = buildYearSequence(fromYear, toYear);

    const cursorYear = clampInt(
      req.query.cursorYear,
      fromYear,
      toYear,
      fromYear,
    );
    const startIndex = Math.max(0, years.indexOf(cursorYear));
    const selectedYears = years.slice(startIndex, startIndex + chunkYears);

    const allowMovies = type === "all" || type === "movie";
    const allowSeries = type === "all" || type === "series";

    const requests = [];
    for (const year of selectedYears) {
      for (let page = 1; page <= pagesPerYear; page += 1) {
        if (allowMovies) {
          requests.push(
            tmdb(
              `/discover/movie?primary_release_year=${year}&sort_by=popularity.desc&vote_count.gte=30&page=${page}`,
            )
              .then((payload) => ({ payload, mediaType: "movie", year }))
              .catch(() => ({
                payload: { results: [] },
                mediaType: "movie",
                year,
              })),
          );
        }
        if (allowSeries) {
          requests.push(
            tmdb(
              `/discover/tv?first_air_date_year=${year}&sort_by=popularity.desc&vote_count.gte=15&page=${page}`,
            )
              .then((payload) => ({ payload, mediaType: "series", year }))
              .catch(() => ({
                payload: { results: [] },
                mediaType: "series",
                year,
              })),
          );
        }
      }
    }

    const resolved = await Promise.all(requests);
    const mapped = resolved.flatMap((entry) =>
      (entry?.payload?.results || []).map((item) => ({
        ...mapTrendingItem(item, entry.mediaType),
        type: entry.mediaType,
        releaseDate:
          entry.mediaType === "movie"
            ? item.release_date || null
            : item.first_air_date || null,
      })),
    );

    const items = sortMediaChronologically(dedupeMappedMedia(mapped));
    const lastYear = selectedYears[selectedYears.length - 1] || cursorYear;
    const nextCursorYear = lastYear < toYear ? lastYear + 1 : null;

    const result = {
      items,
      meta: {
        mode: type,
        fromYear,
        toYear,
        loadedYears: selectedYears,
        nextCursorYear,
        hasMore: Boolean(nextCursorYear),
      },
    };

    cacheSet(cacheKey, result, 30 * 60 * 1000);
    res.json(result);
  } catch (e) {
    res
      .status(200)
      .json({ items: [], meta: null, error: String(e?.message || e) });
  }
});
// ─── Genre catalog (discover) ─────────────────────────────────────────────────
// Returns genre rows using TMDB /discover, from 2000 to now.
// Supports ?page=N for infinite scroll — each TMDB genre has up to 500 pages.

const MOVIE_GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
  { id: 27, name: "Horror" },
  { id: 878, name: "Science Fiction" },
  { id: 53, name: "Thriller" },
  { id: 10749, name: "Romance" },
  { id: 16, name: "Animation" },
  { id: 80, name: "Crime" },
  { id: 12, name: "Adventure" },
  { id: 14, name: "Fantasy" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 36, name: "History" },
  { id: 10752, name: "War" },
];

const SERIES_GENRES = [
  { id: 10759, name: "Action & Adventure" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 27, name: "Horror" },
  { id: 9648, name: "Mystery" },
  { id: 80, name: "Crime" },
  { id: 16, name: "Animation" },
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
          `/discover/movie?with_genres=${g.id}&primary_release_date.gte=2000-01-01&sort_by=popularity.desc&vote_count.gte=50&page=${page}`,
        );
        return {
          id: g.id,
          name: g.name,
          items: (data?.results || []).map((it) =>
            mapTrendingItem(it, "movie"),
          ),
          totalPages: data?.total_pages || 1,
          totalResults: data?.total_results || 0,
        };
      }),
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
          `/discover/tv?with_genres=${g.id}&first_air_date.gte=2000-01-01&sort_by=popularity.desc&vote_count.gte=50&page=${page}`,
        );
        return {
          id: g.id,
          name: g.name,
          items: (data?.results || []).map((it) =>
            mapTrendingItem(it, "series"),
          ),
          totalPages: data?.total_pages || 1,
          totalResults: data?.total_results || 0,
        };
      }),
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
    const VALID_MOVIE_SORT = new Set([
      "popularity.desc",
      "popularity.asc",
      "vote_average.desc",
      "vote_average.asc",
      "vote_count.desc",
      "vote_count.asc",
      "primary_release_date.desc",
      "primary_release_date.asc",
      "revenue.desc",
      "revenue.asc",
    ]);
    const page = Math.max(1, Math.min(500, parseInt(req.query.page) || 1));
    const sortBy = VALID_MOVIE_SORT.has(req.query.sort_by)
      ? req.query.sort_by
      : "popularity.desc";
    const year = req.query.year
      ? `&primary_release_year=${parseInt(req.query.year) || ""}`
      : "";
    const decade = req.query.decade;
    let dateRange = year;
    if (decade && !year) {
      const decadeInt = parseInt(decade) || 0;
      const from = `${decadeInt}-01-01`;
      const to = `${decadeInt + 9}-12-31`;
      dateRange = `&primary_release_date.gte=${from}&primary_release_date.lte=${to}`;
    }
    const data = await tmdb(
      `/discover/movie?sort_by=${sortBy}&vote_count.gte=10&primary_release_date.gte=1990-01-01${dateRange}&page=${page}`,
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
    const VALID_TV_SORT = new Set([
      "popularity.desc",
      "popularity.asc",
      "vote_average.desc",
      "vote_average.asc",
      "vote_count.desc",
      "vote_count.asc",
      "first_air_date.desc",
      "first_air_date.asc",
    ]);
    const page = Math.max(1, Math.min(500, parseInt(req.query.page) || 1));
    const sortBy = VALID_TV_SORT.has(req.query.sort_by)
      ? req.query.sort_by
      : "popularity.desc";
    const year = req.query.year
      ? `&first_air_date_year=${parseInt(req.query.year) || ""}`
      : "";
    const decade = req.query.decade;
    let dateRange = year;
    if (decade && !year) {
      const decadeInt = parseInt(decade) || 0;
      const from = `${decadeInt}-01-01`;
      const to = `${decadeInt + 9}-12-31`;
      dateRange = `&first_air_date.gte=${from}&first_air_date.lte=${to}`;
    }
    const data = await tmdb(
      `/discover/tv?sort_by=${sortBy}&vote_count.gte=10&first_air_date.gte=1990-01-01${dateRange}&page=${page}`,
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
          `/discover/movie?sort_by=popularity.desc&vote_count.gte=50&primary_release_date.gte=${d.decade}-01-01&primary_release_date.lte=${parseInt(d.decade) + 9}-12-31&page=1`,
        );
        return {
          decade: d.decade,
          name: d.name,
          items: (data?.results || []).map((it) =>
            mapTrendingItem(it, "movie"),
          ),
        };
      }),
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
          `/discover/tv?sort_by=popularity.desc&vote_count.gte=50&first_air_date.gte=${d.decade}-01-01&first_air_date.lte=${parseInt(d.decade) + 9}-12-31&page=1`,
        );
        return {
          decade: d.decade,
          name: d.name,
          items: (data?.results || []).map((it) =>
            mapTrendingItem(it, "series"),
          ),
        };
      }),
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
    if (
      !archiveMovieCache[cacheKey] ||
      now - archiveMovieCache[cacheKey].ts > 60 * 60 * 1000
    ) {
      const searchUrl =
        `https://archive.org/advancedsearch.php?q=mediatype%3Amovies+subject%3Afeature+format%3Ah.264+language%3Aen` +
        `&fl[]=identifier,title,year,description,subject` +
        `&sort[]=downloads+desc&output=json&rows=${rows}&start=${start}`;
      const resp = await fetch(searchUrl, {
        signal: AbortSignal.timeout(12000),
      });
      const data = await resp.json();
      const docs = data?.response?.docs || [];

      // For each doc, find the actual h.264 mp4 file via metadata
      const movies = (
        await Promise.all(
          docs.map(async (doc) => {
            try {
              const mResp = await fetch(
                `https://archive.org/metadata/${doc.identifier}/files`,
                { signal: AbortSignal.timeout(5000) },
              );
              const mData = await mResp.json();
              const files = mData?.result || [];
              const mp4 =
                files.find(
                  (f) => f.format === "h.264" && f.name?.endsWith(".mp4"),
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
          }),
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
      const osRes = await fetch(
        `https://api.opensubtitles.com/api/v1/subtitles?${params}`,
        {
          headers: {
            "Api-Key": osApiKey,
            "Content-Type": "application/json",
            "User-Agent": "Nexora v1.0",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (osRes.ok) {
        const osData = await osRes.json();
        const subs = (osData?.data || [])
          .slice(0, 10)
          .map((s) => ({
            id: s.id,
            language: s.attributes?.language || lang,
            format: s.attributes?.format || "srt",
            downloadUrl: s.attributes?.files?.[0]?.file_id
              ? `/api/subtitles/download/${s.attributes.files[0].file_id}`
              : null,
            rating: s.attributes?.ratings || 0,
            hearing_impaired: s.attributes?.hearing_impaired || false,
          }))
          .filter((s) => s.downloadUrl);
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
    if (!osApiKey)
      return res.status(503).json({ error: "Subtitle service not configured" });
    const { fileId } = req.params;
    const dlRes = await fetch("https://api.opensubtitles.com/api/v1/download", {
      method: "POST",
      headers: {
        "Api-Key": osApiKey,
        "Content-Type": "application/json",
        "User-Agent": "Nexora v1.0",
      },
      body: JSON.stringify({ file_id: Number(fileId) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!dlRes.ok)
      return res.status(dlRes.status).json({ error: "Download failed" });
    const dlData = await dlRes.json();
    if (dlData?.link) {
      const subRes = await fetch(dlData.link, {
        signal: AbortSignal.timeout(10000),
      });
      res.set("Content-Type", "text/vtt; charset=utf-8");
      res.set("Cache-Control", "public, max-age=86400");
      const text = await subRes.text();
      // Convert SRT to VTT if needed
      if (text.trim().startsWith("1\n") || text.trim().startsWith("1\r\n")) {
        res.send(
          "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2"),
        );
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
    if (!url || typeof url !== "string")
      return res.status(400).json({ valid: false, error: "Missing URL" });
    // Block private IPs
    const parsed = new URL(url);
    if (
      /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(
        parsed.hostname,
      )
    ) {
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
    const isValid =
      probe.ok &&
      (contentType.includes("video") ||
        contentType.includes("mpegurl") ||
        contentType.includes("octet-stream") ||
        contentType.includes("mp2t") ||
        url.match(/\.(m3u8|ts|mp4|mkv|webm|mpd)(\?|$)/i));
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
    const nameMatch = cm[2].match(
      /<display-name[^>]*>([^<]+)<\/display-name>/i,
    );
    if (nameMatch) channelNames.set(id, nameMatch[1].trim());
  }
  // Parse programmes
  const progRegex =
    /<programme\s+start="([^"]*)"[^]*?stop="([^"]*)"[^]*?channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/gi;
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
  const m = String(str || "").match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
  );
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
      if (!["http:", "https:"].includes(u.protocol))
        return res.status(400).json({ error: "Invalid protocol" });
      const hn = u.hostname.toLowerCase();
      if (
        /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(
          hn,
        ) &&
        process.env.NODE_ENV !== "development"
      ) {
        return res.status(400).json({ error: "Private addresses not allowed" });
      }
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const cacheKey = `epg-${epgUrl}`;
    const cached = epgCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < EPG_TTL)
      return res.json(cached.data);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch(epgUrl, {
      signal: controller.signal,
      headers: IPTV_HEADERS,
    });
    clearTimeout(timer);
    if (!resp.ok)
      return res
        .status(502)
        .json({ error: `EPG fetch failed: ${resp.status}` });
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
      .filter((p) => p.channel === channelId)
      .sort((a, b) => a.start.localeCompare(b.start));
    const current = progs.find((p) => p.start <= now && p.stop > now);
    const next = progs.find((p) => p.start > now);
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

    // Always fetch all-language videos (nl-NL filter returns 0 trailers for most titles)
    const allLangVideos = await tmdbVideosAllLangs(type, tmdbId);
    let candidates = allLangVideos ? pickTrailerCandidates(allLangVideos) : [];
    // Fallback: try the nl-NL call as well in case allLangVideos failed
    if (!candidates.length) {
      const videos = await tmdb(
        `/${type}/${encodeURIComponent(tmdbId)}/videos`,
      );
      candidates = pickTrailerCandidates(videos);
    }
    const result = {
      key: candidates[0]?.key || null,
      type: candidates[0]?.site || null,
      candidates,
    };
    // Only cache successful results for 24h; cache failures briefly so they retry sooner
    const ttl = result.key ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
    cacheSet(cacheKey, result, ttl);
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
      trendingMovies,
      trendingTv,
      nowPlaying,
      airingToday,
      topRatedMovies,
      topRatedTv,
      popularMovies,
      popularTv,
      upcomingMovies,
      hiddenGemsMovies,
      hiddenGemsTv,
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
      tmdb(
        "/discover/movie?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1",
      ).catch(() => ({ results: [] })),
      tmdb(
        "/discover/tv?sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=7.5&popularity.lte=40&page=1",
      ).catch(() => ({ results: [] })),
    ]);

    const rows = [
      {
        id: "trending-movies",
        title: "Trending Now",
        type: "movie",
        items: (trendingMovies?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      },
      {
        id: "trending-series",
        title: "Trending Series",
        type: "series",
        items: (trendingTv?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "series")),
      },
      {
        id: "new-releases",
        title: "New Releases",
        type: "movie",
        items: (nowPlaying?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      },
      {
        id: "airing-today",
        title: "Airing Today",
        type: "series",
        items: (airingToday?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "series")),
      },
      {
        id: "top-rated-movies",
        title: "Top Rated Movies",
        type: "movie",
        items: (topRatedMovies?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      },
      {
        id: "top-rated-series",
        title: "Top Rated Series",
        type: "series",
        items: (topRatedTv?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "series")),
      },
      {
        id: "popular-movies",
        title: "Popular This Week",
        type: "movie",
        items: (popularMovies?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      },
      {
        id: "popular-series",
        title: "Popular Series",
        type: "series",
        items: (popularTv?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "series")),
      },
      {
        id: "upcoming",
        title: "Coming Soon",
        type: "movie",
        items: (upcomingMovies?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      },
      {
        id: "hidden-gems-movies",
        title: "Hidden Gems",
        type: "movie",
        items: (hiddenGemsMovies?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "movie")),
      },
      {
        id: "hidden-gems-series",
        title: "Hidden Gem Series",
        type: "series",
        items: (hiddenGemsTv?.results || [])
          .slice(0, 20)
          .map((it) => mapTrendingItem(it, "series")),
      },
    ].filter((r) => r.items.length > 0);

    // Pick a hero (featured banner) from trending — tag each item with its media type before merging
    const heroPool = [
      ...(trendingMovies?.results || [])
        .slice(0, 5)
        .map((it) => ({ item: it, type: "movie" })),
      ...(trendingTv?.results || [])
        .slice(0, 3)
        .map((it) => ({ item: it, type: "series" })),
    ];
    const hero = heroPool[0]
      ? {
          ...mapTrendingItem(heroPool[0].item, heroPool[0].type),
          trailerKey: null, // Client fetches trailer separately via /api/trailer/:id
        }
      : null;

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
    if (!Array.isArray(watchedIds) || watchedIds.length === 0)
      return res.json({ sections: [] });

    // Limit to 5 items for performance, process all in parallel
    const toProcess = watchedIds.slice(0, 5);

    const settled = await Promise.allSettled(
      toProcess.map(async (entry) => {
        const { tmdbId, type, title } = entry;
        if (!tmdbId) return null;
        const mediaType = type === "series" ? "tv" : "movie";
        const cacheKey = `batch-rec-${mediaType}-${tmdbId}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return cached;

        const [similar, recs] = await Promise.all([
          tmdb(`/${mediaType}/${encodeURIComponent(tmdbId)}/similar?page=1`),
          tmdb(
            `/${mediaType}/${encodeURIComponent(tmdbId)}/recommendations?page=1`,
          ),
        ]);
        const seen = new Set();
        const items = [];
        for (const it of [
          ...(recs?.results || []),
          ...(similar?.results || []),
        ]) {
          if (seen.has(String(it.id))) continue;
          seen.add(String(it.id));
          items.push(
            mapTrendingItem(it, type === "series" ? "series" : "movie"),
          );
          if (items.length >= 15) break;
        }
        if (items.length === 0) return null;
        const section = {
          id: `because-${tmdbId}`,
          title: `Because You Watched ${title || ""}`.trim(),
          items,
          sourceId: tmdbId,
        };
        cacheSet(cacheKey, section, 60 * 60 * 1000);
        return section;
      }),
    );

    const sections = settled
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);

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
  if (words.some((w) => w.startsWith(q))) return { match: true, score: 70 };
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
    if (!query || query.length < 2)
      return res.json({ movies: [], series: [], iptv: [], totalResults: 0 });

    const cacheKey = `search-unified-${query.toLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
      return res.json(cached.data);
    }

    const startTime = Date.now();

    // Search TMDB movies + series in parallel
    const tmdbResults = process.env.TMDB_API_KEY
      ? await Promise.all([
          tmdb(`/search/movie?query=${encodeURIComponent(query)}&page=1`).catch(
            () => ({ results: [] }),
          ),
          tmdb(`/search/tv?query=${encodeURIComponent(query)}&page=1`).catch(
            () => ({ results: [] }),
          ),
        ])
      : [{ results: [] }, { results: [] }];

    const movies = (tmdbResults[0]?.results || []).slice(0, 15).map((it) => ({
      ...mapTrendingItem(it, "movie"),
      relevance: fuzzyMatch(query, it.title || it.name || "").score,
    }));

    const series = (tmdbResults[1]?.results || []).slice(0, 15).map((it) => ({
      ...mapTrendingItem(it, "series"),
      relevance: fuzzyMatch(query, it.name || it.title || "").score,
    }));

    // Sort by relevance
    movies.sort((a, b) => b.relevance - a.relevance);
    series.sort((a, b) => b.relevance - a.relevance);

    const elapsed = Date.now() - startTime;
    const result = {
      movies,
      series,
      iptv: [],
      totalResults: movies.length + series.length,
      queryTimeMs: elapsed,
    };
    searchCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (e) {
    res.json({
      movies: [],
      series: [],
      iptv: [],
      totalResults: 0,
      error: String(e?.message || e),
    });
  }
});

// ─── CDN-aware streaming headers ─────────────────────────────────────────────
app.get("/api/stream/proxy-headers", (req, res) => {
  // Returns optimal headers for CDN edge caching
  res.json({
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    "CDN-Cache-Control": "public, max-age=3600",
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
  });
});

// ─── Adaptive quality levels ─────────────────────────────────────────────────
app.get("/api/stream/quality-levels", (req, res) => {
  res.json({
    levels: [
      { id: "auto", label: "Auto", description: "Adaptive bitrate" },
      {
        id: "4k",
        label: "4K Ultra HD",
        bitrate: 25000000,
        resolution: "3840x2160",
      },
      {
        id: "fhd",
        label: "Full HD",
        bitrate: 8000000,
        resolution: "1920x1080",
      },
      { id: "hd", label: "HD", bitrate: 5000000, resolution: "1280x720" },
      { id: "sd", label: "SD", bitrate: 2500000, resolution: "854x480" },
    ],
  });
});

// -----------------------------
// Anti-piracy — stream URL signing with HMAC + domain/IP restriction
// -----------------------------
const STREAM_SIGNING_SECRET =
  process.env.STREAM_SIGNING_SECRET || crypto.randomBytes(32).toString("hex");

app.get("/api/stream/sign", (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing URL" });
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const deviceId = req.query.deviceId || "unknown";
    const expires = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    const payload = `${url}|${expires}|${ip}|${deviceId}`;
    const signature = crypto
      .createHmac("sha256", STREAM_SIGNING_SECRET)
      .update(payload)
      .digest("hex");
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
    if (!url || !token || !expires)
      return res.json({ valid: false, error: "Missing parameters" });
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(expires))
      return res.json({ valid: false, error: "Token expired" });
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const deviceId = req.query.deviceId || "unknown";
    const payload = `${url}|${expires}|${ip}|${deviceId}`;
    const expected = crypto
      .createHmac("sha256", STREAM_SIGNING_SECRET)
      .update(payload)
      .digest("hex");
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

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
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
      if (session.ip === ip) {
        ipSessionCount++;
        activeDeviceIPs.add(session.ip);
      }
    }

    // Account sharing warning
    let sharingWarning = null;
    if (uniqueDevices > SUSPICIOUS_DEVICE_THRESHOLD) {
      sharingWarning = `Unusual activity detected: ${uniqueDevices} devices from this location`;
    }

    if (
      ipSessionCount >= MAX_CONCURRENT_STREAMS &&
      !activeSessions.has(deviceId)
    ) {
      return res.status(429).json({
        error: "Too many concurrent streams",
        maxStreams: MAX_CONCURRENT_STREAMS,
        activeStreams: ipSessionCount,
        sharingWarning,
      });
    }

    activeSessions.set(deviceId, {
      ip,
      startedAt: now,
      lastSeen: now,
      streamUrl: streamUrl || null,
      userAgent,
    });
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
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
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

// ─────────────────────────────────────────────────────────────────────────────
// User State — server-side follow/preference store (device-id keyed, ephemeral)
// Kept in-memory; complements the client AsyncStorage-backed user-state-service.
// Enables: cross-device sync foundation, server-side personalisation.
// ─────────────────────────────────────────────────────────────────────────────

// { deviceId → { followedTeams: Set<string>, updatedAt: number } }
const userStateStore = new Map();

/** Prune entries not seen in 7 days to prevent unbounded growth */
function cleanUserStateStore() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, entry] of userStateStore) {
    if (entry.updatedAt < cutoff) userStateStore.delete(id);
  }
}
setInterval(cleanUserStateStore, 60 * 60 * 1000); // hourly

function getDeviceId(req) {
  const id = req.headers["x-device-id"] || req.query.deviceId || "";
  // Validate: max 128 chars, alphanumeric/dash/underscore only
  if (!id || !/^[\w-]{1,128}$/.test(id)) return null;
  return id;
}

function getOrCreateUserState(deviceId) {
  if (!userStateStore.has(deviceId)) {
    userStateStore.set(deviceId, {
      followedTeams: new Set(),
      updatedAt: Date.now(),
    });
  }
  return userStateStore.get(deviceId);
}
app.use(globalErrorHandler);

// ─── Global unhandled rejection guard ────────────────────────────────────────
// Prevents server crash when async route handlers try to send a response after
// the 45-second timeout middleware has already sent a 504 to the client.
process.on("unhandledRejection", (reason) => {
  serverLog.error("Unhandled promise rejection (suppressed)", {
    message: String(reason?.message || reason),
  });
});

app.listen(PORT, () => {
  serverLog.info(`Nexora server running on :${PORT}`, {
    port: PORT,
  });
  // Start BullMQ background worker (no-op when Redis unavailable)
  startWorker();
  // Start stream provider health monitoring so /api/streams/providers stays fresh
  startHealthCheckSchedule();
  const selfBaseUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.SELF_PING_URL ||
    `http://127.0.0.1:${PORT}`;
  // Keep-alive: ping /health every 10 min to prevent Render free-tier sleep
  const selfPingUrl =
    process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
  if (selfPingUrl) {
    setInterval(
      async () => {
        try {
          await fetch(`${selfPingUrl}/health`, {
            signal: AbortSignal.timeout(10000),
          });
        } catch {}
      },
      4 * 60 * 1000,
    );
    serverLog.info("Keep-alive ping enabled", { url: `${selfPingUrl}/health` });
  }

  // Daily VOD refresh: fixed-time cache reset + warmup so new titles appear automatically.
  startDailyMediaRefreshScheduler(selfBaseUrl);
});
