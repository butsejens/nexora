/**
 * Nexora – Update Metadata Routes
 *
 * Clean router wrapping the already-solid update-manifest.js module.
 * Adds canonical response envelope and proper logging.
 *
 * Mounts at: /api/updates (registered in index.js)
 * Also keeps /api/app-updates/* compat aliases.
 */

import { Router } from 'express';
import {
  buildUpdateManifestResponse,
  buildOtaMetadataResponse,
  buildNativeMetadataResponse,
} from '../update-manifest.js';
import { send, ok, err } from '../shared/response.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('updates');
const router = Router();

/**
 * GET /api/updates/check
 * Smart update check — returns manifest + OTA + native together.
 * The client can use this single call to determine what action to take.
 */
router.get('/check', (req, res) => {
  try {
    const manifest = buildUpdateManifestResponse();
    const ota      = buildOtaMetadataResponse();
    const native   = buildNativeMetadataResponse();

    log.info('update check', {
      clientVersion: req.query.v ?? 'unknown',
      platform:      req.query.p ?? 'unknown',
    });

    return send(res, ok({
      manifest,
      ota,
      native,
    }, { source: 'internal' }));
  } catch (e) {
    log.error('update check error', { message: e.message });
    return send(res, err('UPDATE_CHECK_FAILED', 'Update metadata unavailable', { source: 'internal' }), 503);
  }
});

/**
 * GET /api/updates/ota
 * OTA update metadata only.
 */
router.get('/ota', (req, res) => {
  try {
    return send(res, ok(buildOtaMetadataResponse(), { source: 'internal' }));
  } catch (e) {
    return send(res, err('OTA_META_FAILED', 'OTA metadata unavailable'), 503);
  }
});

/**
 * GET /api/updates/native
 * Native APK release metadata only.
 */
router.get('/native', (req, res) => {
  try {
    return send(res, ok(buildNativeMetadataResponse(), { source: 'internal' }));
  } catch (e) {
    return send(res, err('NATIVE_META_FAILED', 'Native metadata unavailable'), 503);
  }
});

/**
 * GET /api/updates/manifest
 * Full manifest (combined).
 */
router.get('/manifest', (req, res) => {
  try {
    return send(res, ok(buildUpdateManifestResponse(), { source: 'internal' }));
  } catch (e) {
    return send(res, err('MANIFEST_FAILED', 'Manifest unavailable'), 503);
  }
});

// ─── Backward-compat aliases (/api/app-updates -> /api/updates)  ──────────────
// These are mounted at /api/app-updates in index.js using this router:
export function registerLegacyAliases(app) {
  app.get('/api/app-updates/manifest', (req, res) => res.redirect(307, '/api/updates/manifest'));
  app.get('/api/app-updates/ota',      (req, res) => res.redirect(307, '/api/updates/ota'));
  app.get('/api/app-updates/native',   (req, res) => res.redirect(307, '/api/updates/native'));
}

export default router;
