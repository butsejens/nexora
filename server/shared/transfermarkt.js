/**
 * Nexora – Transfermarkt API Client
 * Based on: github.com/felipeall/transfermarkt-api (sigma.vercel.app)
 *
 * A thin wrapper around the public Transfermarkt REST API proxy.
 * Provides player search, club squads, market values, and transfers.
 *
 * All calls go through `safeFetchJson` so they benefit from:
 *   - Bottleneck rate limiting (2 req/s — sigma.vercel.app is rate-sensitive)
 *   - Circuit breaker
 *   - Retry with backoff
 *   - Structured logging
 *
 * Usage:
 *   import { tmSearchPlayers, tmGetPlayerDetail, tmGetClubSquad } from './transfermarkt.js';
 *   const result = await tmSearchPlayers('Erling Haaland');
 */

import { safeFetchJson } from "./fetcher.js";
import { createLogger } from "./logger.js";
import {
  validateSchema,
  TransfermarktSearchSchema,
  TransfermarktPlayerSchema,
} from "./schemas.js";
import { cache, TTL } from "./cache.js";

const log = createLogger("transfermarkt");

const TM_BASE =
  process.env.TRANSFERMARKT_API_URL || "https://transfermarkt-api.vercel.app";
const SOURCE = "transfermarkt";
const OPTS = { source: SOURCE, timeoutMs: 10_000, retries: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmGet(path) {
  return safeFetchJson(`${TM_BASE}${path}`, OPTS);
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search for players by name.
 * @param {string} name
 * @returns {Promise<Array<import('./schemas.js').TransfermarktPlayer>>}
 */
export async function tmSearchPlayers(name) {
  if (!name?.trim()) return [];
  const cacheKey = `tm:search:${name.toLowerCase().trim()}`;
  return cache.getOrFetch(cacheKey, TTL.PLAYER, async () => {
    try {
      const raw = await tmGet(
        `/players/search/${encodeURIComponent(name.trim())}`,
      );
      const parsed = validateSchema(
        TransfermarktSearchSchema,
        raw,
        "tm-search",
      );
      return parsed?.players ?? [];
    } catch (err) {
      log.warn("player search failed", { name, message: err.message });
      return [];
    }
  });
}

/**
 * Get full player profile from Transfermarkt.
 * @param {string} tmPlayerId - Transfermarkt numeric ID (e.g. "277473")
 * @returns {Promise<object|null>}
 */
export async function tmGetPlayerDetail(tmPlayerId) {
  if (!tmPlayerId) return null;
  const cacheKey = `tm:player:${tmPlayerId}`;
  return cache.getOrFetch(cacheKey, TTL.PLAYER, async () => {
    try {
      const raw = await tmGet(`/players/${tmPlayerId}/profile`);
      return validateSchema(TransfermarktPlayerSchema, raw, "tm-player");
    } catch (err) {
      log.warn("player detail failed", { tmPlayerId, message: err.message });
      return null;
    }
  });
}

/**
 * Get market value history for a player.
 * @param {string} tmPlayerId
 * @returns {Promise<Array|null>}
 */
export async function tmGetPlayerMarketValue(tmPlayerId) {
  if (!tmPlayerId) return null;
  const cacheKey = `tm:mv:${tmPlayerId}`;
  return cache.getOrFetch(cacheKey, TTL.PLAYER, async () => {
    try {
      const raw = await tmGet(`/players/${tmPlayerId}/market-value`);
      return raw?.marketValueHistory ?? raw ?? null;
    } catch (err) {
      log.warn("market value fetch failed", {
        tmPlayerId,
        message: err.message,
      });
      return null;
    }
  });
}

/**
 * Get current squad for a club.
 * @param {string} tmClubId - Transfermarkt club numeric ID
 * @returns {Promise<Array>}
 */
export async function tmGetClubSquad(tmClubId) {
  if (!tmClubId) return [];
  const cacheKey = `tm:squad:${tmClubId}`;
  return cache.getOrFetch(cacheKey, TTL.TEAM, async () => {
    try {
      const raw = await tmGet(`/clubs/${tmClubId}/players`);
      return raw?.players ?? raw ?? [];
    } catch (err) {
      log.warn("club squad fetch failed", { tmClubId, message: err.message });
      return [];
    }
  });
}

/**
 * Search for a player by name and return the best-matching profile with photo.
 * Convenience wrapper used by the lineup enrichment pipeline.
 *
 * @param {string} playerName
 * @returns {Promise<{ id: string|null, photo: string|null, marketValue: string|null }>}
 */
export async function tmEnrichPlayer(playerName) {
  const fallback = { id: null, photo: null, marketValue: null };
  if (!playerName?.trim()) return fallback;

  const results = await tmSearchPlayers(playerName);
  if (!results.length) return fallback;

  // Pick the first result (Transfermarkt search returns best match first)
  const best = results[0];
  return {
    id: best.id ?? null,
    photo: best.image ?? best.photo ?? null,
    marketValue: best.marketValue ?? null,
    name: best.name ?? playerName,
    url: best.url ?? null,
  };
}

export { TM_BASE };
