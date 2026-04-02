/**
 * Nexora – Sports Data Orchestrator
 *
 * Defines the priority chain for sports data sources and applies
 * field-level merge rules so no valid data is ever overwritten by empty data.
 *
 * Priority chain (highest → lowest):
 *   1. ESPN           – scores, status, minute, clock, period, lineups, event timelines
 *   2. football-data  – standings, historical results, squad lists
 *   3. Transfermarkt  – player photos, market values, contract info
 *   4. Sofascore      – live incidents, detailed lineups for ongoing matches
 *   5. AI enrichment  – biographical text, predictions (ADDITIVE only, never overwrites)
 *
 * Field ownership contract:
 *   score / status / minute / clock / period  → ESPN ONLY (never overwritten by other sources)
 *   logo (team)                               → logo-manager / football-logos CDN
 *   photo (player)                            → player-image-system (Transfermarkt > ESPN)
 *   marketValue / contractUntil               → Transfermarkt ONLY
 *   standings rows                            → football-data (verified) > ESPN (fallback)
 */

import { mergeWithFallback, mergeImageUrl, isValidValue, mergeSources } from "./mergeUtils";
import type { Match, Team, Player } from "@/lib/domain/models";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Partial match data from any source (ESPN, Sofascore, etc.) */
export type PartialMatch = Partial<Match> & { source?: string };

/** Partial team data from any source */
export type PartialTeam = Partial<Team> & { source?: string };

/** Partial player data from any source */
export type PartialPlayer = Partial<Player> & { source?: string };

// ─── Match merge ──────────────────────────────────────────────────────────────

/**
 * Merge match data from multiple sources.
 * ESPN data must be passed first — its score/status/minute are never overwritten.
 *
 * @param espn   Primary match data from ESPN (may be partial if match not found)
 * @param others Additional sources in priority order (sofascore, football-data, …)
 */
export function mergeMatchData(espn: PartialMatch, ...others: PartialMatch[]): PartialMatch {
  // Start with ESPN as ground truth
  let result: PartialMatch = { ...espn };

  for (const source of others) {
    // These fields are EXCLUSIVELY owned by ESPN when ESPN has valid data.
    // Other sources must not overwrite them even if they provide values.
    const espnOwned = ["status", "score", "homeScore", "awayScore", "clock", "minute", "period"] as const;

    const filtered = { ...source };
    for (const field of espnOwned) {
      if (isValidValue((espn as Record<string, unknown>)[field])) {
        delete (filtered as Record<string, unknown>)[field];
      }
    }

    // Remove source tracking field before merging
    delete (filtered as Record<string, unknown>).source;
    result = mergeWithFallback(result as Record<string, unknown>, filtered as Record<string, unknown>) as PartialMatch;
  }

  return result;
}

// ─── Team merge ───────────────────────────────────────────────────────────────

/**
 * Merge team data from multiple sources.
 * Logo is handled by the logo-manager; here we only apply field-level merge.
 *
 * @param primary   Highest-priority source (ESPN team overview)
 * @param fallbacks Additional sources in descending priority
 */
export function mergeTeamData(primary: PartialTeam, ...fallbacks: PartialTeam[]): PartialTeam {
  // Merge scalar fields normally
  const sources = [primary, ...fallbacks].map(s => {
    const { source: _src, ...rest } = s as Record<string, unknown>;
    return rest as PartialTeam;
  });
  const merged = mergeSources(sources as Record<string, unknown>[]) as PartialTeam;

  // Logo: pick the best validated image in priority order
  const logoUri = [primary, ...fallbacks]
    .map(s => (s.logo as { uri?: string } | undefined)?.uri ?? null)
    .reduce<string | null>((best, candidate) => mergeImageUrl(best, candidate), null);

  if (logoUri && !merged.logo) {
    (merged as Record<string, unknown>).logo = { uri: logoUri, source: "merged", confidence: 0.8 };
  }

  return merged;
}

// ─── Player merge ─────────────────────────────────────────────────────────────

/**
 * Merge player data from ESPN (primary) + Transfermarkt (market value/photo).
 * AI enrichment payload is accepted as the lowest-priority source.
 *
 * @param espn           ESPN player data (canonical identity)
 * @param transfermarkt  Transfermarkt enrichment (marketValue, image, contractUntil)
 * @param ai             AI-generated enrichment (lowest priority, additive only)
 */
export function mergePlayerData(
  espn: PartialPlayer,
  transfermarkt?: PartialPlayer | null,
  ai?: PartialPlayer | null,
): PartialPlayer {
  const sources = [espn, transfermarkt, ai].filter(Boolean) as PartialPlayer[];

  const merged = mergeSources(
    sources.map(({ source: _src, ...rest }) => rest as Record<string, unknown>),
  ) as PartialPlayer;

  // Image: Transfermarkt > ESPN (using validated URL check)
  const espnImageUri = espn.image?.uri ?? null;
  const tmImageUri = transfermarkt?.image?.uri ?? null;
  const bestUri = mergeImageUrl(tmImageUri, espnImageUri); // Transfermarkt first

  if (bestUri && (!merged.image || !isValidValue(merged.image.uri))) {
    (merged as Record<string, unknown>).image = {
      uri: bestUri,
      source: tmImageUri === bestUri ? "transfermarkt" : "espn",
      confidence: 0.85,
    };
  }

  return merged;
}
