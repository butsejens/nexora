/**
 * Nexora – Request Tracing Middleware
 *
 * Attaches a unique request ID to every request and response.
 * Logs request start and completion with latency, status code,
 * and relevant context for observability.
 *
 * Usage:
 *   import { requestTracer } from './tracer.js';
 *   app.use(requestTracer);
 */

import crypto from 'crypto';
import { createLogger } from './logger.js';

const log = createLogger('http');

/**
 * Express middleware that:
 *   - Sets X-Request-ID header (uses client's if provided)
 *   - Logs request start
 *   - Logs request completion with status and latency
 *   - Attaches req.requestId for downstream use
 */
export function requestTracer(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startMs = Date.now();

  log.debug('request start', {
    requestId,
    method: req.method,
    path:   req.path,
    ip:     req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
  });

  // Log on finish — covers both normal and error paths
  res.on('finish', () => {
    const latencyMs = Date.now() - startMs;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    log[level]('request complete', {
      requestId,
      method:    req.method,
      path:      req.path,
      status:    res.statusCode,
      latencyMs,
    });
  });

  next();
}

/**
 * Express error handler middleware.
 * Must be registered LAST: app.use(globalErrorHandler).
 * Converts unhandled errors into canonical 500 responses.
 */
export function globalErrorHandler(err, req, res, _next) {
  const requestId = req.requestId ?? '?';
  log.error('unhandled server error', {
    requestId,
    path:    req.path,
    message: err?.message,
    stack:   err?.stack?.split('\n').slice(0, 5).join(' | '),
  });

  if (!res.headersSent) {
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        code:    'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again.',
      },
      meta: {
        source:       'internal',
        is_cached:    false,
        is_fallback:  false,
        is_stale:     false,
        last_updated: new Date().toISOString(),
        ttl_ms:       null,
        request_id:   requestId,
      },
    });
  }
}
