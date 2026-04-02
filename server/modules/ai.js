/**
 * server/modules/ai.js
 * AI enrichment routes mounted at /api/ai
 *
 * Routes:
 *   GET /api/ai/player-analysis/:playerId  — cached player scout report
 *   GET /api/ai/player-analysis-stream/:playerId  — SSE streaming version
 *   GET /api/ai/health
 *
 * Legacy aliases registered on the root app via registerAiAliases(app).
 */

import { Router } from 'express';
import { runLLM, tryParseJSON, hasAnyProvider } from '../shared/ai.js';
import { createLogger } from '../shared/logger.js';
import { cache, TTL } from '../shared/cache.js';
import { ok, err, send } from '../shared/response.js';

const log = createLogger("ai-module");
const router = Router();

// ─── In-memory player analysis store (disk-backed in legacy index.js) ─────────
// Kept simple here: in-memory with TTL. The legacy code serialises to JSON file;
// once index.js legacy routes are removed, this becomes the only store.
const PLAYER_ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const _playerAnalysisStore = new Map();

function makePlayerAnalysisKey({ playerId, name, team, league, language }) {
  const normalize = (v) =>
    String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return [
    String(playerId || ""),
    normalize(name),
    normalize(team),
    String(league || "eng.1").toLowerCase(),
    String(language || "nl").toLowerCase(),
  ].join("|");
}

function getStoredAnalysis(key) {
  const row = _playerAnalysisStore.get(key);
  if (!row) return null;
  if (Date.now() - row.updatedAt > PLAYER_ANALYSIS_TTL_MS) {
    _playerAnalysisStore.delete(key);
    return null;
  }
  return row;
}

function setStoredAnalysis(key, payload) {
  _playerAnalysisStore.set(key, { ...payload, updatedAt: Date.now() });
  // GC: prune when store grows large
  if (_playerAnalysisStore.size > 2000) {
    const cutoff = Date.now() - PLAYER_ANALYSIS_TTL_MS;
    for (const [k, v] of _playerAnalysisStore) {
      if (v.updatedAt < cutoff) _playerAnalysisStore.delete(k);
    }
  }
}

// ─── Position-based strength/weakness inference (no AI required) ──────────────
function inferStrengthsWeaknesses(position, age) {
  const pos = String(position || "").toUpperCase();
  const years = Number(age || 0);
  const strengths = [];
  const weaknesses = [];

  if (/GK/.test(pos)) {
    strengths.push("Reflexen", "Positionering", "1-op-1 reddingen");
    weaknesses.push("Meevoetballen onder druk");
  } else if (/CB|LB|RB|WB|DEF|BACK/.test(pos)) {
    strengths.push("Duelkracht", "Positionering", "Defensieve organisatie");
    weaknesses.push("Ruimte in de rug");
  } else if (/DM|CM|AM|MID|LM|RM/.test(pos)) {
    strengths.push("Balcirculatie", "Spelinzicht", "Passing");
    weaknesses.push("Luchtduels tegen fysiek sterke tegenstanders");
  } else if (/ST|CF|FW|LW|RW|ATT|STRIKER/.test(pos)) {
    strengths.push("Afwerking", "Loopacties", "Diepgang");
    weaknesses.push("Defensieve bijdrage");
  } else {
    strengths.push("Werkethiek", "Tactisch inzicht");
    weaknesses.push("Constante impact over 90 minuten");
  }

  if (years > 0 && years <= 21) {
    strengths.push("Ontwikkelingspotentieel");
    weaknesses.push("Ervaring in topwedstrijden");
  } else if (years >= 32) {
    strengths.push("Ervaring", "Leiderschap");
    weaknesses.push("Herstelsnelheid");
  }

  return {
    strengths: [...new Set(strengths)].slice(0, 5),
    weaknesses: [...new Set(weaknesses)].slice(0, 5),
  };
}

// ─── Core analysis function ───────────────────────────────────────────────────
async function analyzePlayerProfile(player, context = {}) {
  if (!hasAnyProvider()) return null;

  const playerName = String(player?.name || "");
  const sys = {
    role: "system",
    content:
      "Je bent een elite voetbalscout met diepgaande kennis van profvoetballers wereldwijd. " +
      "Gebruik je volledige trainingskennis over bekende spelers. Antwoord strikt in geldig JSON.",
  };
  const user = {
    role: "user",
    content:
      `Maak een gedetailleerde professionele spelersanalyse voor: ${playerName}` +
      (player?.position ? ` (${player.position})` : "") +
      (player?.age ? `, ${player.age} jaar` : "") +
      (player?.currentClub ? `, ${player.currentClub}` : "") +
      ".\n\n" +
      "Als je deze speler herkent uit je trainingsdata, gebruik dan je kennis van zijn/haar speelstijl, " +
      "kwaliteiten en actuele rol. Wees specifiek en concreet.\n\n" +
      'Output ALLEEN geldig JSON:\n{"summary":"2-3 zinnen concrete scoutsanalyse","strengths":["max 5 sterke punten"],"weaknesses":["max 3 zwaktes"]}\n\n' +
      "INPUT:\n" +
      JSON.stringify({ player, context }, null, 2),
  };

  const raw = await runLLM([sys, user], { temperature: 0.25 });
  const parsed = tryParseJSON(raw);
  const summary = String(parsed?.summary || "").trim();
  const strengths = (Array.isArray(parsed?.strengths) ? parsed.strengths : [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  const weaknesses = (Array.isArray(parsed?.weaknesses) ? parsed.weaknesses : [])
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!summary && !strengths.length) return null;
  return { summary: summary || null, strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 5) };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/ai/health */
router.get("/health", (_req, res) => {
  send(res, ok({ providers: hasAnyProvider() }));
});

/**
 * GET /api/ai/player-analysis/:playerId
 * Query: name, team, league, language, refresh
 */
router.get("/player-analysis/:playerId", async (req, res) => {
  const playerId = String(req.params.playerId || "").trim();
  const name = String(req.query?.name || "").trim();
  const team = String(req.query?.team || "").trim();
  const league = String(req.query?.league || "eng.1").trim() || "eng.1";
  const language = String(req.query?.language || "nl").toLowerCase() === "en" ? "en" : "nl";
  const refresh = String(req.query?.refresh || "") === "1";

  if (!playerId || playerId.length > 128) {
    return send(res, err("INVALID_PARAMS", "Invalid playerId"), 400);
  }

  const key = makePlayerAnalysisKey({ playerId, name, team, league, language });

  // Serve from cache if available and not forcing refresh
  if (!refresh) {
    const stored = getStoredAnalysis(key);
    if (stored?.summary) {
      return res.json({
        ...stored,
        cached: true,
        provider: "cached",
        updatedAt: new Date(stored.updatedAt || Date.now()).toISOString(),
      });
    }
  }

  // Fetch player profile from existing player endpoint (self-call)
  let playerProfile = null;
  try {
    const q = new URLSearchParams();
    if (name) q.set("name", name);
    if (team) q.set("team", team);
    if (league) q.set("league", league);
    const base = `${req.protocol}://${req.get("host")}`;
    const pRes = await fetch(
      `${base}/api/sports/player/${encodeURIComponent(playerId)}?${q.toString()}`,
      {
        headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      },
    );
    playerProfile = pRes.ok ? await pRes.json() : null;
  } catch (fetchErr) {
    log.warn("Player profile self-fetch failed", { playerId, error: fetchErr?.message });
  }

  const safeProfile = {
    id: playerId,
    name: String(playerProfile?.name || name || "Unknown player"),
    position: String(playerProfile?.position || ""),
    age: Number(playerProfile?.age || 0) || undefined,
    currentClub: String(playerProfile?.currentClub || team || ""),
    marketValue: playerProfile?.marketValue || null,
    formerClubs: Array.isArray(playerProfile?.formerClubs) ? playerProfile.formerClubs : [],
  };

  const ai = await analyzePlayerProfile(safeProfile, { league, source: playerProfile?.source || "sports-service" });
  const fallback = inferStrengthsWeaknesses(safeProfile.position, safeProfile.age);

  const defaultSummary =
    language === "en"
      ? `${safeProfile.name} is profiled via multi-source football data (ESPN + Transfermarkt + AI context).`
      : `${safeProfile.name} is geprofileerd via multi-source voetbaldatasets (ESPN + Transfermarkt + AI-context).`;

  const payload = {
    playerId: safeProfile.id || undefined,
    playerName: safeProfile.name,
    summary: String(ai?.summary || defaultSummary),
    strengths: ai?.strengths?.length ? ai.strengths.slice(0, 5) : fallback.strengths,
    weaknesses: ai?.weaknesses?.length ? ai.weaknesses.slice(0, 5) : fallback.weaknesses,
    tactical: null,
    physical: null,
    mental: null,
    transferPotential: safeProfile.marketValue ? String(safeProfile.marketValue) : null,
    language,
    provider: ai ? "ai" : "fallback",
    cached: false,
    updatedAt: new Date().toISOString(),
  };

  setStoredAnalysis(key, payload);
  res.json(payload);
});

/**
 * GET /api/ai/player-analysis-stream/:playerId
 * Server-sent events streaming version — wraps the non-stream endpoint.
 */
router.get("/player-analysis-stream/:playerId", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const playerId = String(req.params.playerId || "").trim();
    sendEvent({ type: "start", playerId });

    const base = `${req.protocol}://${req.get("host")}`;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (v != null) q.set(k, String(v));
    }

    const analysisRes = await fetch(
      `${base}/api/ai/player-analysis/${encodeURIComponent(playerId)}?${q.toString()}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const data = analysisRes.ok ? await analysisRes.json() : null;
    const summary = String(data?.summary || "").trim();

    if (summary) {
      const chunks = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
      for (const chunk of chunks) sendEvent({ type: "chunk", chunk });
    }

    sendEvent({ type: "done", data });
  } catch (streamErr) {
    sendEvent({ type: "error", message: String(streamErr?.message || "stream failed") });
  } finally {
    res.end();
  }
});

// ─── Legacy path aliases ──────────────────────────────────────────────────────
/**
 * Register legacy routes on the root app so existing clients don't break.
 * Called from index.js after mounting this router.
 *
 * Legacy:  /api/sports/player-analysis/:playerId
 * New:     /api/ai/player-analysis/:playerId
 */
function registerAiAliases(app) {
  // Sports-namespaced player analysis (legacy clients)
  app.get("/api/sports/player-analysis/:playerId", (req, res) => {
    req.url = `/api/ai/player-analysis/${req.params.playerId}?${new URLSearchParams(req.query)}`;
    res.redirect(307, `/api/ai/player-analysis/${encodeURIComponent(req.params.playerId)}?${new URLSearchParams(Object.assign({}, req.query))}`);
  });
  app.get("/api/sports/player-analysis-stream/:playerId", (req, res) => {
    res.redirect(307, `/api/ai/player-analysis-stream/${encodeURIComponent(req.params.playerId)}?${new URLSearchParams(Object.assign({}, req.query))}`);
  });
}

export { router, registerAiAliases };
export default router;
