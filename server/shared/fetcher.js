/**
 * Nexora – Safe HTTP Fetcher
 *
 * All upstream HTTP calls must go through this module.
 * Features:
 *   - Timeout enforcement (AbortController)
 *   - Exponential-backoff retry for transient failures
 *   - Structured error logging (never silently swallowed)
 *   - Response validation (status check before JSON parse)
 *   - Redacted URLs in logs (strips API keys from query params)
 *   - Never passes raw upstream errors to the caller without context
 *   - Per-source rate limiting via Bottleneck (prevents API bans)
 *
 * Usage:
 *   import { safeFetch, safeFetchJson } from './fetcher.js';
 *   const data = await safeFetchJson('https://...', { timeoutMs: 4000, source: 'espn' });
 */

import nodeFetch from "node-fetch";
import Bottleneck from "bottleneck";
import { createLogger } from "./logger.js";
import { recordUpstreamRequest } from "./metrics.js";

const log = createLogger("fetcher");

// ─── Per-source Bottleneck rate limiters ─────────────────────────────────────
// Concurrency + min interval prevents hammering upstream APIs.
// Values are conservative — raise them only if upstreams allow it.
const LIMITER_DEFAULTS = { maxConcurrent: 4, minTime: 250 };
const LIMITER_PROFILES = {
  espn: { maxConcurrent: 6, minTime: 150 }, // ESPN public API — generous
  sofascore: { maxConcurrent: 2, minTime: 600 }, // SofaScore — strict; 403 on abuse
  transfermarkt: { maxConcurrent: 2, minTime: 500 }, // Transfermarkt scraping proxy
  omdb: { maxConcurrent: 4, minTime: 300 },
  openai: { maxConcurrent: 2, minTime: 1000 },
  tmdb: { maxConcurrent: 4, minTime: 250 },
};

const limiters = new Map();

function getLimiter(source) {
  const key = String(source || "default")
    .toLowerCase()
    .split(".")[0];
  if (!limiters.has(key)) {
    const profile = LIMITER_PROFILES[key] || LIMITER_DEFAULTS;
    limiters.set(key, new Bottleneck(profile));
  }
  return limiters.get(key);
}

const SENSITIVE_PARAMS = new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "secret",
  "access_token",
  "auth",
]);
const BREAKER_FAILURE_THRESHOLD = Number(
  process.env.FETCH_CB_FAILURE_THRESHOLD || 6,
);
const BREAKER_COOLDOWN_MS = Number(process.env.FETCH_CB_COOLDOWN_MS || 15_000);
const breakers = new Map();

function sourceKey(source, url) {
  if (source && source !== "external") return String(source);
  try {
    return new URL(url).host || "external";
  } catch {
    return "external";
  }
}

function isBreakerOpen(key) {
  const b = breakers.get(key);
  if (!b) return false;
  const now = Date.now();
  if (b.openUntil && b.openUntil > now) return true;
  if (b.openUntil && b.openUntil <= now) {
    b.openUntil = 0;
    b.failures = 0;
    breakers.set(key, b);
  }
  return false;
}

function markBreakerSuccess(key) {
  breakers.set(key, { failures: 0, openUntil: 0 });
}

function markBreakerFailure(key) {
  const b = breakers.get(key) || { failures: 0, openUntil: 0 };
  b.failures += 1;
  if (b.failures >= BREAKER_FAILURE_THRESHOLD) {
    b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
  breakers.set(key, b);
}

/** Redact API keys from URLs before logging */
function redactUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    for (const param of SENSITIVE_PARAMS) {
      if (u.searchParams.has(param)) u.searchParams.set(param, "[REDACTED]");
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Fetch with timeout and retry.
 *
 * @param {string} url
 * @param {object} opts
 * @param {number}   [opts.timeoutMs=8000]
 * @param {number}   [opts.retries=1]         - max number of retries (0 = no retry)
 * @param {number}   [opts.retryDelayMs=500]  - base delay; doubles each retry
 * @param {object}   [opts.headers]
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [opts.method='GET']
 * @param {string|object} [opts.body]
 * @returns {Promise<import('node-fetch').Response>}
 */
export async function safeFetch(
  url,
  {
    timeoutMs = 8_000,
    retries = 1,
    retryDelayMs = 500,
    headers = {},
    method = "GET",
    body = undefined,
  } = {},
) {
  const safeUrl = redactUrl(url);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      log.debug("retrying fetch", { url: safeUrl, attempt, delayMs: delay });
      await sleep(delay);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const startMs = Date.now();
      const res = await nodeFetch(url, {
        method,
        headers: { "User-Agent": "Nexora-Server/1.0", ...headers },
        body:
          body !== undefined
            ? typeof body === "string"
              ? body
              : JSON.stringify(body)
            : undefined,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startMs;
      log.debug("fetch complete", {
        url: safeUrl,
        status: res.status,
        latencyMs,
      });

      return res;
    } catch (err) {
      lastError = err;
      const isTimeout = err.name === "AbortError";
      const isTransient = isTimeout || isNetworkError(err);

      log.warn("fetch error", {
        url: safeUrl,
        attempt,
        isTimeout,
        message: err.message,
      });

      if (!isTransient || attempt >= retries) break;
    } finally {
      clearTimeout(timer);
    }
  }

  const msg =
    lastError?.name === "AbortError"
      ? `Timeout after ${timeoutMs}ms fetching ${safeUrl}`
      : `Fetch failed for ${safeUrl}: ${lastError?.message ?? "unknown"}`;

  throw new FetchError(msg, safeUrl, lastError);
}

/**
 * Fetch JSON. Validates HTTP status and parses body.
 * Throws a structured error with source context for all failure modes.
 *
 * @param {string} url
 * @param {object} [opts] - same as safeFetch options
 * @param {string} [opts.source='external'] - label for logging
 * @returns {Promise<unknown>}
 */
export async function safeFetchJson(url, opts = {}) {
  const { source = "external", ...fetchOpts } = opts;
  // Schedule through the per-source Bottleneck limiter so we never exceed
  // the configured concurrency/rate for any upstream API.
  const limiter = getLimiter(source);
  return limiter.schedule(() => _safeFetchJsonInner(url, source, fetchOpts));
}

async function _safeFetchJsonInner(url, source, fetchOpts) {
  const safeUrl = redactUrl(url);
  const key = sourceKey(source, url);
  if (isBreakerOpen(key)) {
    const msg = `Circuit open for ${key}; upstream temporarily blocked`;
    log.warn("circuit breaker open", { source: key, url: safeUrl });
    recordUpstreamRequest({
      source: key,
      ok: false,
      isTimeout: false,
      latencyMs: 0,
    });
    throw new UpstreamError(msg, source, 503);
  }

  const started = Date.now();
  let res;
  try {
    res = await safeFetch(url, fetchOpts);
  } catch (fetchErr) {
    const isTimeout =
      fetchErr?.name === "FetchError" &&
      /timeout/i.test(String(fetchErr?.message || ""));
    markBreakerFailure(key);
    recordUpstreamRequest({
      source: key,
      ok: false,
      isTimeout,
      latencyMs: Date.now() - started,
    });
    throw fetchErr;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `HTTP ${res.status} from ${source} (${safeUrl}): ${body.slice(0, 200)}`;
    log.error("upstream HTTP error", {
      source,
      url: safeUrl,
      status: res.status,
      bodyPreview: body.slice(0, 200),
    });
    markBreakerFailure(key);
    recordUpstreamRequest({
      source: key,
      ok: false,
      isTimeout: false,
      latencyMs: Date.now() - started,
    });
    throw new UpstreamError(msg, source, res.status);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    const body = await res.text().catch(() => "");
    const msg = `Non-JSON response from ${source} (${safeUrl}): content-type=${contentType}`;
    log.warn("non-JSON upstream response", {
      source,
      url: safeUrl,
      contentType,
    });
    markBreakerFailure(key);
    recordUpstreamRequest({
      source: key,
      ok: false,
      isTimeout: false,
      latencyMs: Date.now() - started,
    });
    throw new UpstreamError(msg, source, res.status);
  }

  try {
    const parsed = await res.json();
    markBreakerSuccess(key);
    recordUpstreamRequest({
      source: key,
      ok: true,
      isTimeout: false,
      latencyMs: Date.now() - started,
    });
    return parsed;
  } catch (parseErr) {
    const msg = `JSON parse failed from ${source} (${safeUrl}): ${parseErr.message}`;
    log.error("JSON parse error", {
      source,
      url: safeUrl,
      message: parseErr.message,
    });
    markBreakerFailure(key);
    recordUpstreamRequest({
      source: key,
      ok: false,
      isTimeout: false,
      latencyMs: Date.now() - started,
    });
    throw new UpstreamError(msg, source, res.status);
  }
}

// ─── Error Types ──────────────────────────────────────────────────────────────
export class FetchError extends Error {
  constructor(message, url, cause) {
    super(message);
    this.name = "FetchError";
    this.url = url;
    this.cause = cause;
  }
}

export class UpstreamError extends Error {
  constructor(message, source, status) {
    super(message);
    this.name = "UpstreamError";
    this.source = source;
    this.status = status;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetworkError(err) {
  return (
    err.code === "ECONNRESET" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND" ||
    err.code === "ETIMEDOUT" ||
    err.code === "EPIPE"
  );
}
