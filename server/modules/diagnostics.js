/**
 * Nexora – Diagnostics Routes
 *
 * Health, ping, and config-check endpoints.
 * These are always fast and never depend on external sources.
 * They do NOT expose secret values — only boolean availability flags.
 *
 * Mounts at: / (root) and /api via index.js
 */

import { Router } from 'express';
import { createLogger } from '../shared/logger.js';

const log = createLogger('diagnostics');
const router = Router();

/** GET /health — primary health check for Render/Cloudflare */
router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'nexora-api', ts: new Date().toISOString() });
});

/** GET /api/ping — keepalive ping (bypasses caches in Cloudflare worker) */
router.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/**
 * GET /api/config-check
 * Reports which optional services are configured (boolean flags only).
 * Does NOT expose actual key values.
 */
router.get('/api/config-check', (req, res) => {
  const warnings = [];

  if (!process.env.TMDB_API_KEY) {
    warnings.push('TMDB_API_KEY not set — movies/series will be empty. Get a free key at https://www.themoviedb.org/settings/api');
  }
  if (!process.env.OMDB_API_KEY) {
    warnings.push('OMDB_API_KEY not set — IMDb ratings and Rotten Tomatoes scores unavailable');
  }
  const hasAiKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.XAI_API_KEY
  );
  if (!hasAiKey) {
    warnings.push('No AI provider key set — match analysis / recommendations will be disabled');
  }

  log.info('config-check requested');

  res.json({
    ok: true,
    services: {
      tmdb:        Boolean(process.env.TMDB_API_KEY),
      espn:        true,    // ESPN is keyless
      scorebat:    true,    // highlights — keyless
      tvmaze:      true,    // TV schedules — keyless
      gemini:      Boolean(process.env.GEMINI_API_KEY),
      openrouter:  Boolean(process.env.OPENROUTER_API_KEY),
      openai:      Boolean(process.env.OPENAI_API_KEY),
      deepseek:    Boolean(process.env.DEEPSEEK_API_KEY),
      groq:        Boolean(process.env.GROQ_API_KEY),
      xai:         Boolean(process.env.XAI_API_KEY),
      redis:       Boolean(process.env.REDIS_URL),
      omdb:        Boolean(process.env.OMDB_API_KEY),
    },
    warnings,
  });
});

export default router;
