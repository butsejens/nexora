/**
 * Nexora – Media Data Orchestrator
 *
 * Defines the priority chain for VOD/media data sources and applies
 * field-level merge rules so no valid data is ever overwritten by empty data.
 *
 * Priority chain (highest → lowest):
 *   1. TMDB           – title, overview, poster, backdrop, cast, genres, trailers
 *   2. Legacy home API – homepage rails/rows (fallback when TMDB is unavailable)
 *   3. TVMaze          – series air schedule, episode lists (series only)
 *   4. IPTV sources    – streamUrl, isPlayable (NEVER overwrites metadata)
 *
 * Field ownership contract:
 *   title / overview / poster / backdrop / cast / genres   → TMDB ONLY
 *   streamUrl / isPlayable / streamSources                 → IPTV sources ONLY
 *   aired / nextEpisode / network                          → TVMaze (series gap-fill)
 *   rails / rows (home screen)                             → TMDB first, legacy API as fallback
 */

import { mergeWithFallback, mergeImageUrl, isValidValue } from "./mergeUtils";
import type { MediaType } from "@/lib/domain/models";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Loosely-typed title object that any source may return */
export type PartialTitle = {
  id?: string | number | null;
  tmdbId?: number | null;
  title?: string | null;
  originalTitle?: string | null;
  overview?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  releaseDate?: string | null;
  rating?: number | null;
  genres?: string[] | null;
  cast?: unknown[] | null;
  type?: MediaType | null;
  networkName?: string | null;
  /** Raw IPTV stream URL — isolated from metadata fields */
  streamUrl?: string | null;
  isPlayable?: boolean | null;
  streamSources?: unknown[] | null;
  source?: string;
  [key: string]: unknown;
};

// ─── Title merge ──────────────────────────────────────────────────────────────

/** Fields that belong exclusively to IPTV sources and must not affect metadata */
const IPTV_ONLY_FIELDS = ["streamUrl", "isPlayable", "streamSources"] as const;

/**
 * Merge title metadata from multiple sources.
 * TMDB must be passed first — its metadata fields are never overwritten.
 * IPTV-only fields (streamUrl, isPlayable) are handled separately and never
 * overwrite TMDB metadata fields.
 *
 * @param tmdb    Primary source: TMDB title object
 * @param tvmaze  TVMaze enrichment (series schedule, episode info)
 * @param iptv    IPTV source data (stream availability only)
 */
export function mergeTitleData(
  tmdb: PartialTitle,
  tvmaze?: PartialTitle | null,
  iptv?: PartialTitle | null,
): PartialTitle {
  // Start with TMDB as primary
  let result: PartialTitle = { ...tmdb };
  delete result.source;

  // TVMaze: only fills gaps in metadata (never overwrites TMDB fields)
  if (tvmaze) {
    const { source: _src, ...tvmazeRest } = tvmaze;
    // Remove IPTV-only fields from TVMaze data (safety guard)
    for (const f of IPTV_ONLY_FIELDS) delete (tvmazeRest as Record<string, unknown>)[f];
    result = mergeWithFallback(result as Record<string, unknown>, tvmazeRest as Record<string, unknown>) as PartialTitle;
  }

  // Poster: pick best validated image (TMDB always wins if valid)
  const bestPoster = mergeImageUrl(tmdb.poster ?? null, tvmaze?.poster ?? null);
  if (bestPoster && !isValidValue(result.poster)) {
    result.poster = bestPoster;
  }

  // IPTV: only ever adds stream availability, never overwrites metadata
  if (iptv) {
    if (!isValidValue(result.streamUrl) && isValidValue(iptv.streamUrl)) {
      result.streamUrl = iptv.streamUrl;
    }
    if (!isValidValue(result.isPlayable) && iptv.isPlayable === true) {
      result.isPlayable = true;
    }
  }

  return result;
}

// ─── Home feed merge ──────────────────────────────────────────────────────────

export interface HomeFeedRow {
  label: string;
  items: PartialTitle[];
}

/**
 * Merge home-screen rails/rows from TMDB and the legacy homepage API.
 * TMDB rows take priority; legacy rows only fill slots where TMDB has no data.
 *
 * @param tmdbRows   Rows from TMDB (trending, top-rated, etc.)
 * @param legacyRows Rows from legacy /api/homepage (fallback only)
 */
export function mergeHomeFeed(tmdbRows: HomeFeedRow[], legacyRows: HomeFeedRow[]): HomeFeedRow[] {
  if (!legacyRows.length) return tmdbRows;
  if (!tmdbRows.length) return legacyRows;

  const labelIndex = new Map<string, HomeFeedRow>();
  for (const row of tmdbRows) {
    labelIndex.set(row.label.toLowerCase(), row);
  }

  for (const row of legacyRows) {
    const key = row.label.toLowerCase();
    if (!labelIndex.has(key)) {
      // TMDB has no row with this label — add the legacy row as fallback
      labelIndex.set(key, row);
    }
    // If TMDB already has this row, the legacy row is ignored entirely
  }

  // Return in TMDB order first, then any extra legacy rows
  const tmdbOrder = tmdbRows.map(r => r.label.toLowerCase());
  const extras = [...labelIndex.keys()].filter(k => !tmdbOrder.includes(k));
  return [
    ...tmdbOrder.map(k => labelIndex.get(k)!),
    ...extras.map(k => labelIndex.get(k)!),
  ];
}
