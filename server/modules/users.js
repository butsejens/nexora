/**
 * server/modules/users.js
 * User state and session management routes.
 *
 * Routes:
 *   GET    /api/user/followed-teams    — get followed team IDs (device-scoped)
 *   POST   /api/user/followed-teams    — follow a team
 *   DELETE /api/user/followed-teams/:teamId — unfollow a team
 *
 *   POST   /api/session/start
 *   POST   /api/session/heartbeat
 *   POST   /api/session/stop
 *   GET    /api/session/status
 *
 * These are mounted on the root app (not under a prefix) because they share the
 * same root paths used by existing clients.
 */

import { Router } from 'express';
import { createLogger } from '../shared/logger.js';
import { ok, err, send } from '../shared/response.js';

const log = createLogger("users");
const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CONCURRENT_STREAMS = 3;
const SUSPICIOUS_DEVICE_THRESHOLD = 5;
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;   // 4h
const USER_STATE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7d

// ─── In-memory stores ─────────────────────────────────────────────────────────
/** { deviceId → { ip, startedAt, lastSeen, streamUrl, userAgent } } */
const activeSessions = new Map();

/** { ip → Set<deviceId> }  — for account-sharing detection */
const ipHistory = new Map();

/** { deviceId → { followedTeams: Set<string>, updatedAt: number } } */
const userStateStore = new Map();

// ─── GC routines ─────────────────────────────────────────────────────────────
function cleanSessions() {
  const cutoff = Date.now() - SESSION_TIMEOUT_MS;
  for (const [id, session] of activeSessions) {
    if (session.lastSeen < cutoff) activeSessions.delete(id);
  }
}

function cleanUserStateStore() {
  const cutoff = Date.now() - USER_STATE_TTL_MS;
  for (const [id, entry] of userStateStore) {
    if (entry.updatedAt < cutoff) userStateStore.delete(id);
  }
}

setInterval(cleanSessions, 30 * 60 * 1000).unref();      // every 30 min
setInterval(cleanUserStateStore, 60 * 60 * 1000).unref(); // every hour

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Extract and validate device-id from request (header or query param). */
function getDeviceId(req) {
  const id = req.headers["x-device-id"] || req.query.deviceId || "";
  // Alphanumeric + dash/underscore only, max 128 chars
  if (!id || !/^[\w-]{1,128}$/.test(id)) return null;
  return id;
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getOrCreateUserState(deviceId) {
  if (!userStateStore.has(deviceId)) {
    userStateStore.set(deviceId, { followedTeams: new Set(), updatedAt: Date.now() });
  }
  return userStateStore.get(deviceId);
}

// ─── User state routes ────────────────────────────────────────────────────────

/** GET /api/user/followed-teams */
router.get("/api/user/followed-teams", (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return send(res, err("INVALID_DEVICE", "Missing or invalid X-Device-Id header"), 400);
  const state = getOrCreateUserState(deviceId);
  return send(res, ok({ teams: [...state.followedTeams] }));
});

/** POST /api/user/followed-teams  body: { teamId: string } */
router.post("/api/user/followed-teams", (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return send(res, err("INVALID_DEVICE", "Missing or invalid X-Device-Id header"), 400);
  const { teamId } = req.body || {};
  if (!teamId || typeof teamId !== "string" || teamId.length > 256) {
    return send(res, err("INVALID_PARAMS", "Invalid teamId"), 400);
  }
  const state = getOrCreateUserState(deviceId);
  state.followedTeams.add(teamId.trim());
  state.updatedAt = Date.now();
  log.debug("Team followed", { deviceId: deviceId.slice(0, 8), teamId });
  return send(res, ok({ teams: [...state.followedTeams] }));
});

/** DELETE /api/user/followed-teams/:teamId */
router.delete("/api/user/followed-teams/:teamId", (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) return send(res, err("INVALID_DEVICE", "Missing or invalid X-Device-Id header"), 400);
  const teamId = decodeURIComponent(req.params.teamId || "");
  if (!teamId || teamId.length > 256) return send(res, err("INVALID_PARAMS", "Invalid teamId"), 400);
  const state = getOrCreateUserState(deviceId);
  state.followedTeams.delete(teamId);
  state.updatedAt = Date.now();
  log.debug("Team unfollowed", { deviceId: deviceId.slice(0, 8), teamId });
  return send(res, ok({ teams: [...state.followedTeams] }));
});

// ─── Session routes ───────────────────────────────────────────────────────────

/** POST /api/session/start  body: { deviceId, streamUrl? } */
router.post("/api/session/start", (req, res) => {
  try {
    const { deviceId, streamUrl } = req.body || {};
    if (!deviceId || typeof deviceId !== "string" || !/^[\w-]{1,128}$/.test(deviceId)) {
      return res.json({ ok: true }); // non-blocking — don't fail playback
    }

    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const now = Date.now();

    cleanSessions();

    // Track device history per IP for account-sharing detection
    if (!ipHistory.has(ip)) ipHistory.set(ip, new Set());
    ipHistory.get(ip).add(deviceId);
    const uniqueDevices = ipHistory.get(ip).size;

    // Count active sessions for this IP
    let ipSessionCount = 0;
    for (const [, session] of activeSessions) {
      if (session.ip === ip) ipSessionCount++;
    }

    const sharingWarning =
      uniqueDevices > SUSPICIOUS_DEVICE_THRESHOLD
        ? `Unusual activity: ${uniqueDevices} devices from this location`
        : null;

    if (ipSessionCount >= MAX_CONCURRENT_STREAMS && !activeSessions.has(deviceId)) {
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

    return res.json({
      ok: true,
      activeStreams: ipSessionCount + (activeSessions.has(deviceId) ? 0 : 1),
      maxStreams: MAX_CONCURRENT_STREAMS,
      sharingWarning,
    });
  } catch (e) {
    log.warn("Session start error (non-blocking)", { error: e?.message });
    return res.json({ ok: true }); // never block playback
  }
});

/** POST /api/session/heartbeat  body: { deviceId } */
router.post("/api/session/heartbeat", (req, res) => {
  try {
    const { deviceId } = req.body || {};
    if (deviceId && activeSessions.has(deviceId)) {
      activeSessions.get(deviceId).lastSeen = Date.now();
    }
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
});

/** POST /api/session/stop  body: { deviceId } */
router.post("/api/session/stop", (req, res) => {
  try {
    const { deviceId } = req.body || {};
    if (deviceId) activeSessions.delete(deviceId);
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
});

/** GET /api/session/status — account-sharing detection */
router.get("/api/session/status", (req, res) => {
  try {
    const ip = getClientIp(req);
    cleanSessions();
    let activeCount = 0;
    for (const [, session] of activeSessions) {
      if (session.ip === ip) activeCount++;
    }
    const uniqueDevices = ipHistory.get(ip)?.size || 0;
    return res.json({
      activeStreams: activeCount,
      maxStreams: MAX_CONCURRENT_STREAMS,
      uniqueDevices,
      suspicious: uniqueDevices > SUSPICIOUS_DEVICE_THRESHOLD,
    });
  } catch (e) {
    return res.json({ activeStreams: 0, maxStreams: MAX_CONCURRENT_STREAMS });
  }
});

export { router };
export default router;
