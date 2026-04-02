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
 *
 * Usage:
 *   import { safeFetch, safeFetchJson } from './fetcher.js';
 *   const data = await safeFetchJson('https://...', { timeoutMs: 4000 });
 */

import nodeFetch from 'node-fetch';
import { createLogger } from './logger.js';

const log = createLogger('fetcher');

const SENSITIVE_PARAMS = new Set(['api_key', 'apikey', 'key', 'token', 'secret', 'access_token', 'auth']);

/** Redact API keys from URLs before logging */
function redactUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    for (const param of SENSITIVE_PARAMS) {
      if (u.searchParams.has(param)) u.searchParams.set(param, '[REDACTED]');
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
export async function safeFetch(url, {
  timeoutMs    = 8_000,
  retries      = 1,
  retryDelayMs = 500,
  headers      = {},
  method       = 'GET',
  body         = undefined,
} = {}) {
  const safeUrl = redactUrl(url);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      log.debug('retrying fetch', { url: safeUrl, attempt, delayMs: delay });
      await sleep(delay);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const startMs = Date.now();
      const res = await nodeFetch(url, {
        method,
        headers: { 'User-Agent': 'Nexora-Server/1.0', ...headers },
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startMs;
      log.debug('fetch complete', { url: safeUrl, status: res.status, latencyMs });

      return res;
    } catch (err) {
      lastError = err;
      const isTimeout = err.name === 'AbortError';
      const isTransient = isTimeout || isNetworkError(err);

      log.warn('fetch error', {
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

  const msg = lastError?.name === 'AbortError'
    ? `Timeout after ${timeoutMs}ms fetching ${safeUrl}`
    : `Fetch failed for ${safeUrl}: ${lastError?.message ?? 'unknown'}`;

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
  const { source = 'external', ...fetchOpts } = opts;
  const safeUrl = redactUrl(url);

  const res = await safeFetch(url, fetchOpts);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const msg = `HTTP ${res.status} from ${source} (${safeUrl}): ${body.slice(0, 200)}`;
    log.error('upstream HTTP error', { source, url: safeUrl, status: res.status, bodyPreview: body.slice(0, 200) });
    throw new UpstreamError(msg, source, res.status);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    const body = await res.text().catch(() => '');
    const msg = `Non-JSON response from ${source} (${safeUrl}): content-type=${contentType}`;
    log.warn('non-JSON upstream response', { source, url: safeUrl, contentType });
    throw new UpstreamError(msg, source, res.status);
  }

  try {
    return await res.json();
  } catch (parseErr) {
    const msg = `JSON parse failed from ${source} (${safeUrl}): ${parseErr.message}`;
    log.error('JSON parse error', { source, url: safeUrl, message: parseErr.message });
    throw new UpstreamError(msg, source, res.status);
  }
}

// ─── Error Types ──────────────────────────────────────────────────────────────
export class FetchError extends Error {
  constructor(message, url, cause) {
    super(message);
    this.name = 'FetchError';
    this.url = url;
    this.cause = cause;
  }
}

export class UpstreamError extends Error {
  constructor(message, source, status) {
    super(message);
    this.name = 'UpstreamError';
    this.source = source;
    this.status = status;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isNetworkError(err) {
  return (
    err.code === 'ECONNRESET' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'EPIPE'
  );
}
