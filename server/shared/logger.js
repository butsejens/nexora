/**
 * Nexora – Structured Logger
 *
 * Emits newline-delimited JSON logs with consistent fields.
 * Every log entry carries: timestamp, level, module, message, and optional data.
 *
 * Usage:
 *   import { createLogger } from './logger.js';
 *   const log = createLogger('sports');
 *   log.info('fetch started', { url, ttl });
 *   log.warn('upstream slow', { latencyMs });
 *   log.error('source failed', { source, error: err.message });
 */

const LOG_LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
const ACTIVE_LEVEL = LOG_LEVEL_RANK[
  String(process.env.LOG_LEVEL || 'info').toLowerCase()
] ?? 1;

function emit(level, module, message, data) {
  if (LOG_LEVEL_RANK[level] < ACTIVE_LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg: message,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  };
  // Use stderr for warn/error so stdout stays clean for healthy log pipelines
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

/**
 * Create a module-scoped logger.
 * @param {string} module - e.g. 'sports', 'media', 'cache'
 */
export function createLogger(module) {
  return {
    debug: (msg, data) => emit('debug', module, msg, data),
    info:  (msg, data) => emit('info',  module, msg, data),
    warn:  (msg, data) => emit('warn',  module, msg, data),
    error: (msg, data) => emit('error', module, msg, data),
  };
}

// Root logger for startup and cross-cutting concerns
export const log = createLogger('nexora');
