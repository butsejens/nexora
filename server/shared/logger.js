/**
 * Nexora – Structured Logger (powered by pino)
 *
 * Drop-in replacement for the hand-rolled logger.
 * Keeps the same createLogger(module) / log.info(msg, data) API so all
 * existing callers continue to work without any changes.
 *
 * pino writes newline-delimited JSON to stdout by default.
 * Set LOG_LEVEL env var to control verbosity (default: info).
 * Set LOG_PRETTY=1 for human-readable output in development.
 *
 * Usage:
 *   import { createLogger } from './logger.js';
 *   const log = createLogger('sports');
 *   log.info('fetch started', { url, ttl });
 *   log.warn('upstream slow', { latencyMs });
 *   log.error('source failed', { source, error: err.message });
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const usePretty = isDev || process.env.LOG_PRETTY === "1";

const rootPino = pino({
  level: String(process.env.LOG_LEVEL || "info").toLowerCase(),
  // pino uses 'time' by default; rename to 'ts' to keep existing log shape
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  base: null, // drop default pid/hostname fields
  messageKey: "msg",
  // Pretty-print in dev; keep JSON in production for log aggregators
  ...(usePretty
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

/**
 * Create a module-scoped child logger.
 * @param {string} module - e.g. 'sports', 'media', 'cache'
 */
export function createLogger(module) {
  const child = rootPino.child({ module });
  return {
    debug: (msg, data) => child.debug(data ?? {}, msg),
    info: (msg, data) => child.info(data ?? {}, msg),
    warn: (msg, data) => child.warn(data ?? {}, msg),
    error: (msg, data) => child.error(data ?? {}, msg),
    // Expose raw pino child for advanced callers (e.g. pino-http)
    pino: child,
  };
}

// Root logger for startup and cross-cutting concerns
export const log = createLogger("nexora");

// Export the root pino instance for middleware (e.g. pino-http)
export { rootPino };
