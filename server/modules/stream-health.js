/**
 * Nexora – Stream Provider Health Monitor
 *
 * Background service that periodically tests all stream embed providers and
 * automatically swaps dead ones with working reserves.
 *
 * Features:
 *   - Tests movie + TV embed URLs with timeout & WAF/Cloudflare detection
 *   - Maintains ranked active list (24 providers) + reserve pool
 *   - Auto-replaces dead providers from reserves
 *   - Exposes REST endpoints for the mobile app to fetch live provider list
 *   - Structured logging via shared logger
 *
 * Endpoints (mounted via Express router):
 *   GET /api/streams/providers  — returns current active provider list for app
 *   GET /api/streams/health     — returns full health report (active + reserves)
 *   POST /api/streams/check     — manually trigger a health check cycle
 */

import { Router } from "express";
import fetch from "node-fetch";
import { createLogger } from "../shared/logger.js";

const log = createLogger("stream-health");

// ─── Provider Registry ────────────────────────────────────────────────────────
// Each provider has: id, label, movieUrl(tmdbId), tvUrl(tmdbId, s, e)
// This is the single source of truth; the app reads from the API endpoint.
//
// Ordered by the live /api/streams/health snapshot taken 2026-09-23: verified
// healthy providers lead the active rotation so the app's first try succeeds
// instead of burning through dead ones first. Providers that resolved to
// ENOTFOUND (the domain is genuinely gone, not just temporarily down) were
// removed outright rather than kept in rotation to fail forever.

function defineProvider(id, label, movieTpl, tvTpl) {
  return {
    id,
    label,
    movieUrl: (tmdbId) => movieTpl.replace("{id}", tmdbId),
    tvUrl: (tmdbId, s, e) =>
      tvTpl.replace("{id}", tmdbId).replace("{s}", s).replace("{e}", e),
  };
}

const ALL_PROVIDERS = [
  // ── Verified healthy 2026-09-23 — always tried first ──
  defineProvider(
    "vidlinkpro",
    "Server 1",
    "https://vidlink.pro/movie/{id}",
    "https://vidlink.pro/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "vidsrcme",
    "Server 2",
    "https://vidsrc.me/embed/movie?tmdb={id}",
    "https://vidsrc.me/embed/tv?tmdb={id}&season={s}&episode={e}",
  ),
  defineProvider(
    "videasy",
    "Server 3",
    "https://player.videasy.net/movie/{id}",
    "https://player.videasy.net/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "rive",
    "Server 4",
    "https://rivestream.live/embed?type=movie&id={id}",
    "https://rivestream.live/embed?type=tv&id={id}&season={s}&episode={e}",
  ),
  defineProvider(
    "111movies",
    "Server 5",
    "https://111movies.net/movie/{id}",
    "https://111movies.net/tv/{id}/{s}/{e}",
  ),
  // ── Intermittent 2026-09-23 (cert/timeout/404 — worth retrying) ──
  defineProvider(
    "vidsrcnl",
    "Server 6",
    "https://player.vidsrc.nl/embed/movie/{id}",
    "https://player.vidsrc.nl/embed/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "warezcdn",
    "Server 7",
    "https://warezcdn.com/embed/movie/{id}",
    "https://warezcdn.com/embed/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "flicky",
    "Server 8",
    "https://flicky.host/embed/movie/?id={id}",
    "https://flicky.host/embed/tv/?id={id}&s={s}&e={e}",
  ),
  defineProvider(
    "2embedorg",
    "Server 9",
    "https://www.2embed.org/embed/movie?id={id}",
    "https://www.2embed.org/embed/tv?id={id}&s={s}&e={e}",
  ),
  // ── Untested reserves, promoted to active to fill out the rotation ──
  defineProvider(
    "vidsrcxyz",
    "Server 10",
    "https://vidsrc.xyz/embed/movie/{id}",
    "https://vidsrc.xyz/embed/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "multiembed",
    "Server 11",
    "https://multiembed.mov/?video_id={id}&tmdb=1",
    "https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}",
  ),
  defineProvider(
    "nontongo",
    "Server 12",
    "https://www.nontongo.win/embed/movie/{id}",
    "https://www.nontongo.win/embed/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "smashystream",
    "Server 13",
    "https://embed.smashystream.com/playere.php?tmdb={id}",
    "https://embed.smashystream.com/playere.php?tmdb={id}&season={s}&episode={e}",
  ),
  // ── Reserve pool ──
  defineProvider(
    "premiumize",
    "Reserve-1",
    "https://www.premiumize.me/embed/movie/{id}",
    "https://www.premiumize.me/embed/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "embedcc",
    "Reserve-2",
    "https://www.2embed.cc/embed/{id}",
    "https://www.2embed.cc/embedtv/{id}&s={s}&e={e}",
  ),
  defineProvider(
    "vidfast",
    "Reserve-3",
    "https://vidfast.pro/movie/{id}",
    "https://vidfast.pro/tv/{id}/{s}/{e}",
  ),
  defineProvider(
    "moviesapi",
    "Reserve-4",
    "https://moviesapi.club/movie/{id}",
    "https://moviesapi.club/tv/{id}-{s}-{e}",
  ),
  defineProvider(
    "superembed",
    "Reserve-5",
    "https://superembed.stream/movie/{id}",
    "https://superembed.stream/tv/{id}/{s}/{e}",
  ),
];

const ACTIVE_SLOTS = 13;
const TEST_MOVIE_ID = "550"; // Fight Club
const TEST_TV_ID = "1396"; // Breaking Bad

const BLOCKED_HINTS = [
  "cloudflare",
  "just a moment",
  "checking your browser",
  "enable javascript",
  "access denied",
  "403 forbidden",
  "attention required",
];
const PARKED_HINTS = [
  "parked",
  "domain for sale",
  "buy this domain",
  "godaddy",
  "namecheap",
];

// ─── State ────────────────────────────────────────────────────────────────────
let activeProviders = ALL_PROVIDERS.slice(0, ACTIVE_SLOTS);
let reserveProviders = ALL_PROVIDERS.slice(ACTIVE_SLOTS);
let lastHealthReport = null;
let lastCheckAt = null;
let checkRunning = false;

// ─── Health Test ──────────────────────────────────────────────────────────────

async function testUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    const body = await res.text();
    const lower = body.toLowerCase();
    if (BLOCKED_HINTS.some((h) => lower.includes(h)))
      return { ok: false, reason: "cloudflare" };
    if (PARKED_HINTS.some((h) => lower.includes(h)))
      return { ok: false, reason: "parked" };
    if (res.status >= 400) return { ok: false, reason: `http-${res.status}` };
    return { ok: true, status: res.status, size: body.length };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      reason:
        err.name === "AbortError" ? "timeout" : err.code || "fetch-failed",
    };
  }
}

async function testProvider(provider) {
  const movieUrl = provider.movieUrl(TEST_MOVIE_ID);
  const tvUrl = provider.tvUrl(TEST_TV_ID, "1", "1");
  const [movie, tv] = await Promise.all([testUrl(movieUrl), testUrl(tvUrl)]);
  return { id: provider.id, movie, tv, healthy: movie.ok && tv.ok };
}

// ─── Health Check Cycle ───────────────────────────────────────────────────────

async function runHealthCheck() {
  if (checkRunning) {
    log.warn("Health check already running, skipping");
    return lastHealthReport;
  }
  checkRunning = true;
  const startMs = Date.now();

  try {
    log.info("Stream health check started", {
      active: activeProviders.length,
      reserves: reserveProviders.length,
    });

    // Test active providers (batches of 6 to avoid throttling)
    const activeResults = [];
    for (let i = 0; i < activeProviders.length; i += 6) {
      const batch = activeProviders.slice(i, i + 6);
      const results = await Promise.all(batch.map(testProvider));
      activeResults.push(...results);
    }

    const healthy = activeResults.filter((r) => r.healthy);
    const broken = activeResults.filter((r) => !r.healthy);

    log.info("Active providers tested", {
      healthy: healthy.length,
      broken: broken.length,
      brokenIds: broken.map(
        (r) => `${r.id}(${r.movie.reason || ""}/${r.tv.reason || ""})`,
      ),
    });

    // If there are broken providers, try reserves
    let swapped = [];
    if (broken.length > 0 && reserveProviders.length > 0) {
      // Test reserves
      const reserveResults = [];
      for (let i = 0; i < reserveProviders.length; i += 6) {
        const batch = reserveProviders.slice(i, i + 6);
        const results = await Promise.all(batch.map(testProvider));
        reserveResults.push(...results);
      }

      const healthyReserves = reserveResults.filter((r) => r.healthy);

      // Swap broken active → reserve, healthy reserve → active
      for (const brokenResult of broken) {
        if (healthyReserves.length === 0) break;

        const replacement = healthyReserves.shift();
        const brokenIdx = activeProviders.findIndex(
          (p) => p.id === brokenResult.id,
        );
        const reserveIdx = reserveProviders.findIndex(
          (p) => p.id === replacement.id,
        );

        if (brokenIdx !== -1 && reserveIdx !== -1) {
          const brokenProvider = activeProviders[brokenIdx];
          const reserveProvider = reserveProviders[reserveIdx];

          // Swap: reserve gets the slot label, broken goes to reserve pool
          reserveProvider.label = brokenProvider.label;
          activeProviders[brokenIdx] = reserveProvider;
          brokenProvider.label = "Reserve";
          reserveProviders[reserveIdx] = brokenProvider;

          swapped.push({
            removed: brokenResult.id,
            reason: `${brokenResult.movie.reason || "ok"}/${brokenResult.tv.reason || "ok"}`,
            added: replacement.id,
          });
          log.info("Provider swapped", {
            removed: brokenResult.id,
            added: replacement.id,
          });
        }
      }
    }

    const elapsedMs = Date.now() - startMs;

    lastHealthReport = {
      checkedAt: new Date().toISOString(),
      elapsedMs,
      active: {
        total: activeProviders.length,
        healthy: healthy.length,
        broken: broken.length,
        details: activeResults.map((r) => ({
          id: r.id,
          healthy: r.healthy,
          movie: r.movie.ok
            ? { status: r.movie.status, size: r.movie.size }
            : { error: r.movie.reason },
          tv: r.tv.ok
            ? { status: r.tv.status, size: r.tv.size }
            : { error: r.tv.reason },
        })),
      },
      swaps: swapped,
      reserves: reserveProviders.length,
    };
    lastCheckAt = new Date().toISOString();

    log.info("Stream health check complete", {
      healthy: healthy.length,
      broken: broken.length,
      swaps: swapped.length,
      elapsedMs,
    });

    return lastHealthReport;
  } catch (err) {
    log.error("Stream health check failed", { error: err.message });
    return null;
  } finally {
    checkRunning = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Get current active provider list (for the mobile app) */
export function getActiveProviders() {
  return activeProviders.map((p) => ({ id: p.id, label: p.label }));
}

/** Get the embed URL template parts for a provider */
export function getProviderUrls(providerId) {
  const p = ALL_PROVIDERS.find((x) => x.id === providerId);
  if (!p) return null;
  return {
    movieUrl: p.movieUrl("{tmdbId}"),
    tvUrl: p.tvUrl("{tmdbId}", "{s}", "{e}"),
  };
}

// ─── Background Schedule ──────────────────────────────────────────────────────

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // daily refresh
const INITIAL_DELAY = 5 * 1000; // short startup warm-up before the first probe

export function startHealthCheckSchedule() {
  setTimeout(() => {
    runHealthCheck().catch((err) =>
      log.error("Initial stream check failed", { error: err.message }),
    );
  }, INITIAL_DELAY);

  setInterval(() => {
    runHealthCheck().catch((err) =>
      log.error("Scheduled stream check failed", { error: err.message }),
    );
  }, CHECK_INTERVAL);

  log.info("Stream health monitor scheduled", {
    intervalHours: CHECK_INTERVAL / 3_600_000,
    initialDelaySec: INITIAL_DELAY / 1000,
    reserveCount: reserveProviders.length,
  });
}

// ─── Express Router ───────────────────────────────────────────────────────────

export const router = Router();

/**
 * GET /api/streams/providers
 * Returns the current active provider list for the mobile app.
 * The app calls this on startup (or periodically) to get the latest working servers.
 */
router.get("/providers", async (_req, res) => {
  // Never block this request on a health check (a cold-start cycle takes
  // ~15s testing every provider) — serve the current best-known order
  // immediately and let the background schedule (or a prior /check call)
  // refresh it for next time.
  if (!lastHealthReport && !checkRunning) {
    void runHealthCheck().catch(() => undefined);
  }

  // Known-broken servers (per the last health check) are pushed to the end so
  // the app tries working servers first instead of stalling on a dead one.
  const healthById = new Map(
    (lastHealthReport?.active?.details || []).map((d) => [d.id, d.healthy]),
  );
  const ordered = [...activeProviders].sort((a, b) => {
    const aHealthy = healthById.get(a.id) ?? true;
    const bHealthy = healthById.get(b.id) ?? true;
    if (aHealthy === bHealthy) return 0;
    return aHealthy ? -1 : 1;
  });

  const providers = ordered.map((p, i) => ({
    id: p.id,
    label: `Server ${i + 1}`,
    movieUrl: p.movieUrl("{tmdbId}"),
    tvUrl: p.tvUrl("{tmdbId}", "{s}", "{e}"),
  }));
  res.json({
    ok: true,
    data: providers,
    meta: { lastCheck: lastCheckAt, count: providers.length },
  });
});

/**
 * GET /api/streams/health
 * Returns the full health report from the last check cycle.
 */
router.get("/health", (_req, res) => {
  if (!lastHealthReport) {
    return res.json({
      ok: true,
      data: null,
      meta: { message: "No check has run yet" },
    });
  }
  res.json({ ok: true, data: lastHealthReport });
});

/**
 * POST /api/streams/check
 * Manually trigger a health check. Protected by a simple token.
 */
router.post("/check", async (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  const expected = process.env.ADMIN_TOKEN;
  if (expected && token !== expected) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  try {
    const report = await runHealthCheck();
    res.json({ ok: true, data: report });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
