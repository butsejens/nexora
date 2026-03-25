/**
 * Nexora – Client-side Entity Identity Resolver
 *
 * Ensures that the same real-world entity (player, team, competition, title)
 * always maps to the same canonical ID, regardless of which data source
 * provides it.
 *
 * This is the client-side counterpart to the server's fuzzy-match logic.
 * For players and teams, the server is still the authoritative resolver;
 * this layer provides fast local resolution for UI deduplication.
 */

import type { EntityId, Confidence, ResolutionResult, CompetitionId } from "./models";

// ─── String similarity helpers (mirror server logic) ─────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/**
 * Token-overlap similarity [0..1].
 * Symmetric: order doesn't matter.
 */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

/**
 * Combined similarity: token overlap + normalized Levenshtein
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  const levScore = maxLen > 0 ? 1 - levenshtein(na, nb) / maxLen : 1;
  const tokenScore = tokenSimilarity(a, b);
  return levScore * 0.45 + tokenScore * 0.55;
}

// ─── Team identity ────────────────────────────────────────────────────────────

export interface TeamCandidate {
  id: EntityId;
  name: string;
  alternateNames?: string[];
  country?: string;
  espnId?: string;
}

/**
 * Resolve a raw team name to a canonical TeamCandidate from a known list.
 * Returns null when confidence is below threshold.
 */
export function resolveTeamIdentity(
  rawName: string,
  candidates: TeamCandidate[],
  minConfidence: Confidence = 0.70,
): ResolutionResult<TeamCandidate> | null {
  if (!rawName || candidates.length === 0) return null;

  let best: { candidate: TeamCandidate; score: Confidence } | null = null;

  for (const candidate of candidates) {
    const names = [candidate.name, ...(candidate.alternateNames ?? [])];
    let maxScore = 0;
    for (const name of names) {
      const score = nameSimilarity(rawName, name);
      if (score > maxScore) maxScore = score;
    }
    if (!best || maxScore > best.score) {
      best = { candidate, score: maxScore };
    }
  }

  if (!best || best.score < minConfidence) return null;

  return {
    entity: best.candidate,
    canonicalId: best.candidate.id,
    confidence: best.score,
    resolvedVia: "name-similarity",
  };
}

// ─── Player identity ──────────────────────────────────────────────────────────

export interface PlayerCandidate {
  id: EntityId;
  espnId?: string | null;
  name: string;
  teamId?: EntityId | null;
  teamName?: string | null;
  nationality?: string | null;
  birthDate?: string | null;
  position?: string | null;
}

export interface PlayerRawInput {
  espnId?: string | null;
  name: string;
  teamName?: string | null;
  nationality?: string | null;
  birthDate?: string | null;
  position?: string | null;
}

/**
 * Resolve a raw player input to a canonical player.
 * ESPN ID is the strongest signal; falls back to name + contextual scoring.
 */
export function resolvePlayerIdentity(
  raw: PlayerRawInput,
  candidates: PlayerCandidate[],
  minConfidence: Confidence = 0.56,
): ResolutionResult<PlayerCandidate> | null {
  if (candidates.length === 0) return null;

  // Fast path: exact ESPN ID match
  if (raw.espnId) {
    const exact = candidates.find(c => c.espnId && c.espnId === raw.espnId);
    if (exact) {
      return { entity: exact, canonicalId: exact.id, confidence: 1, resolvedVia: "espn-id" };
    }
  }

  let best: { candidate: PlayerCandidate; score: Confidence } | null = null;

  for (const candidate of candidates) {
    let score = nameSimilarity(raw.name, candidate.name) * 0.60;

    // Team name bonus
    if (raw.teamName && candidate.teamName) {
      const teamScore = nameSimilarity(raw.teamName, candidate.teamName);
      score += teamScore * 0.20;
    }

    // Nationality bonus
    if (raw.nationality && candidate.nationality &&
        normalize(raw.nationality) === normalize(candidate.nationality)) {
      score += 0.10;
    }

    // Position bonus
    if (raw.position && candidate.position &&
        normalize(raw.position) === normalize(candidate.position)) {
      score += 0.05;
    }

    // Birth date bonus
    if (raw.birthDate && candidate.birthDate &&
        String(raw.birthDate).slice(0, 10) === String(candidate.birthDate).slice(0, 10)) {
      score += 0.05;
    }

    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  if (!best || best.score < minConfidence) return null;

  return {
    entity: best.candidate,
    canonicalId: best.candidate.id,
    confidence: best.score,
    resolvedVia: "name+context",
  };
}

// ─── Competition identity ─────────────────────────────────────────────────────

const COMPETITION_ALIASES: Record<string, string> = {
  // Canonical slug → alternate display names (lowercase, normalized)
  "bel.1": ["jupiler pro league", "first division a", "pro league", "1a"],
  "bel.2": ["challenger pro league", "first division b", "1b"],
  "eng.1": ["premier league", "epl"],
  "eng.2": ["championship", "efl championship"],
  "esp.1": ["la liga", "laliga", "primera division"],
  "ger.1": ["bundesliga", "1. bundesliga"],
  "ita.1": ["serie a"],
  "fra.1": ["ligue 1"],
  "ned.1": ["eredivisie"],
  "uefa.champions": ["champions league", "ucl", "uefa champions league"],
  "uefa.europa": ["europa league", "uel", "uefa europa league"],
  "uefa.europa.conf": ["conference league", "uecl", "uefa conference league"],
};

const SLUG_BY_ALIAS: Map<string, string> = new Map();
for (const [slug, aliases] of Object.entries(COMPETITION_ALIASES)) {
  SLUG_BY_ALIAS.set(normalize(slug), slug);
  for (const alias of aliases) {
    SLUG_BY_ALIAS.set(normalize(alias), slug);
  }
}

/**
 * Resolve a raw competition name or slug to a canonical ESPN slug.
 * Returns null if unknown.
 */
export function resolveCompetitionSlug(raw: string): string | null {
  const key = normalize(raw);
  return SLUG_BY_ALIAS.get(key) ?? null;
}

/**
 * Check whether two CompetitionIds refer to the same competition.
 */
export function isSameCompetition(a: CompetitionId, b: CompetitionId): boolean {
  if (a.espnSlug && b.espnSlug) return a.espnSlug === b.espnSlug;
  return nameSimilarity(a.displayName, b.displayName) > 0.80;
}

// ─── Media identity ───────────────────────────────────────────────────────────

export interface MediaCandidate {
  tmdbId?: number | null;
  imdbId?: string | null;
  title: string;
  year?: number | null;
  type: "movie" | "series";
}

/**
 * Resolve a raw title+year+type to a canonical MediaCandidate.
 * TMDB/IMDB IDs are trusted directly; otherwise name+year scoring.
 */
export function resolveMediaIdentity(
  raw: { tmdbId?: number | null; imdbId?: string | null; title: string; year?: number | null; type?: string },
  candidates: MediaCandidate[],
  minConfidence: Confidence = 0.75,
): ResolutionResult<MediaCandidate> | null {
  // Fast path: TMDB ID
  if (raw.tmdbId) {
    const exact = candidates.find(c => c.tmdbId === raw.tmdbId);
    if (exact) {
      const id = String(exact.tmdbId ?? exact.title);
      return { entity: exact, canonicalId: id, confidence: 1, resolvedVia: "tmdb-id" };
    }
  }

  // Fast path: IMDB ID
  if (raw.imdbId) {
    const exact = candidates.find(c => c.imdbId && c.imdbId === raw.imdbId);
    if (exact) {
      const id = String(exact.tmdbId ?? exact.title);
      return { entity: exact, canonicalId: id, confidence: 1, resolvedVia: "imdb-id" };
    }
  }

  let best: { candidate: MediaCandidate; score: Confidence } | null = null;

  for (const candidate of candidates) {
    let score = nameSimilarity(raw.title, candidate.title) * 0.75;

    // Year bonus
    if (raw.year && candidate.year) {
      if (raw.year === candidate.year) score += 0.20;
      else if (Math.abs(raw.year - candidate.year) <= 1) score += 0.05;
    }

    // Type bonus
    if (raw.type && candidate.type && raw.type === candidate.type) {
      score += 0.05;
    }

    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  if (!best || best.score < minConfidence) return null;

  const id = String(best.candidate.tmdbId ?? best.candidate.title);
  return {
    entity: best.candidate,
    canonicalId: id,
    confidence: best.score,
    resolvedVia: "title+year",
  };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Deduplicate a list of entities that have a canonical ID.
 * When duplicates exist, the first occurrence wins (maintain order).
 */
export function deduplicateById<T extends { id: EntityId }>(items: T[]): T[] {
  const seen = new Set<EntityId>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/**
 * Deduplicate leaderboard rows by player name + team (when no id available).
 */
export function deduplicateLeaderboard<T extends { player: { name: string; teamName?: string | null } }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = `${normalize(row.player.name)}|${normalize(row.player.teamName ?? "")}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}
