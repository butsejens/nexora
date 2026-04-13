/**
 * Nexora – Canonical API Response Builder
 *
 * Every endpoint response must flow through these builders to guarantee
 * a consistent envelope that the mobile client can rely on.
 *
 * Envelope shape:
 * {
 *   ok: boolean,
 *   data: T | null,
 *   error: { code, message } | null,
 *   meta: {
 *     source: string,       // primary source used
 *     is_cached: boolean,
 *     is_fallback: boolean,
 *     is_stale: boolean,
 *     last_updated: string, // ISO-8601
 *     ttl_ms: number | null,
 *   }
 * }
 */

/**
 * Build a successful response envelope.
 *
 * @param {unknown} data
 * @param {object}  opts
 * @param {string}  opts.source       - primary data source, e.g. 'espn'
 * @param {boolean} [opts.isCached]
 * @param {boolean} [opts.isFallback]
 * @param {boolean} [opts.isStale]
 * @param {string}  [opts.lastUpdated] - ISO-8601; defaults to now
 * @param {number}  [opts.ttlMs]
 */
export function ok(data, opts = {}) {
  return {
    ok: true,
    data,
    error: null,
    meta: buildMeta(opts),
  };
}

/**
 * Build an error response envelope.
 *
 * @param {string} code    - machine-readable error code, e.g. 'SOURCE_UNAVAILABLE'
 * @param {string} message - human-readable description
 * @param {object} [opts]  - same meta options as ok()
 */
export function err(code, message, opts = {}) {
  return {
    ok: false,
    data: null,
    error: { code, message },
    meta: buildMeta(opts),
  };
}

/**
 * Build an empty-but-valid response for endpoints that may legitimately
 * return no items (e.g. no matches today). Frontend should show an
 * appropriate empty state, not an error.
 *
 * @param {unknown} emptyValue - e.g. [], {}, null
 * @param {object}  opts
 */
export function empty(emptyValue, opts = {}) {
  return {
    ok: true,
    data: emptyValue,
    error: null,
    meta: { ...buildMeta(opts), is_empty: true },
  };
}

function buildMeta({
  source       = 'internal',
  isCached     = false,
  isFallback   = false,
  isStale      = false,
  lastUpdated  = null,
  ttlMs        = null,
} = {}) {
  return {
    source,
    is_cached:   isCached,
    is_fallback: isFallback,
    is_stale:    isStale,
    last_updated: lastUpdated ?? new Date().toISOString(),
    ttl_ms:      ttlMs,
  };
}

/**
 * Send an express response with a canonical envelope.
 *
 * @param {import('express').Response} res
 * @param {unknown} payload   - the envelope from ok() / err() / empty()
 * @param {number}  [status]  - HTTP status (default 200; 500 for err payloads)
 */
export function send(res, payload, status) {
  const httpStatus = status ?? (payload.ok ? 200 : 500);
  return res.status(httpStatus).json(payload);
}
