/**
 * NEXORA ULTRA FAST SEARCH ENGINE
 *
 * Client-side search with:
 * - Instant search (< 100ms when cached)
 * - Fuzzy matching with typo tolerance
 * - Partial matching
 * - Ranking by: exact match > close match > popularity > metadata richness
 * - IPTV channel, movie, and series search combined
 */

import type { IPTVChannel } from "@/context/NexoraContext";

export interface SearchResult {
  id: string;
  title: string;
  type: "movie" | "series" | "channel" | "iptv-movie" | "iptv-series";
  poster?: string | null;
  year?: number | null;
  group?: string;
  rating?: number | null;
  score: number; // relevance score
  tmdbId?: number;
  url?: string;
}

// In-memory search cache for <100ms responses
const searchResultCache = new Map<string, { results: SearchResult[]; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

/**
 * Fuzzy match with scoring
 */
function fuzzyScore(query: string, text: string): number {
  if (!query || !text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match
  if (t === q) return 100;
  // Starts with
  if (t.startsWith(q)) return 95;
  // Contains
  if (t.includes(q)) return 85;
  // Word-start match
  const words = t.split(/\s+/);
  if (words.some(w => w.startsWith(q))) return 75;

  // Typo tolerance (1 char difference for queries > 3 chars)
  if (q.length > 3) {
    // Deletion
    for (let i = 0; i < q.length; i++) {
      const variant = q.slice(0, i) + q.slice(i + 1);
      if (t.includes(variant)) return 55;
    }
    // Transposition
    for (let i = 0; i < q.length - 1; i++) {
      const transposed = q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2);
      if (t.includes(transposed)) return 50;
    }
    // Substitution
    for (let i = 0; i < q.length; i++) {
      const prefix = q.slice(0, i);
      const suffix = q.slice(i + 1);
      if (t.includes(prefix) && t.includes(suffix) && prefix.length + suffix.length >= q.length - 1) {
        return 45;
      }
    }
  }

  // Subsequence match (chars appear in order)
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  const ratio = qi / q.length;
  if (ratio >= 0.8) return 35;
  if (ratio >= 0.6) return 20;

  return 0;
}

/**
 * Search IPTV channels locally with fuzzy matching
 */
export function searchIPTV(
  channels: IPTVChannel[],
  query: string,
  limit = 50
): SearchResult[] {
  if (!query || query.length < 2) return [];
  const q = query.trim();

  const results: SearchResult[] = [];

  for (const ch of channels) {
    const nameScore = fuzzyScore(q, ch.name || "");
    const titleScore = fuzzyScore(q, ch.title || "");
    const groupScore = fuzzyScore(q, ch.group || "") * 0.5; // Lower weight for group matches
    const score = Math.max(nameScore, titleScore, groupScore);

    if (score > 0) {
      const type = ch.category === "live" ? "channel"
        : ch.category === "movie" ? "iptv-movie"
        : "iptv-series";

      results.push({
        id: ch.id,
        title: ch.title || ch.name,
        type,
        poster: ch.poster || ch.logo || null,
        year: ch.year || null,
        group: ch.group,
        rating: ch.rating || null,
        score: score + (ch.rating ? ch.rating : 0) + (ch.poster ? 2 : 0), // Boost results with rich data
        tmdbId: ch.tmdbId,
        url: ch.url,
      });
    }
  }

  // Sort by score (highest first), then by name
  results.sort((a, b) => b.score - a.score || (a.title || "").localeCompare(b.title || ""));
  return results.slice(0, limit);
}

/**
 * Unified local search across all content
 */
export function searchAll(
  iptvChannels: IPTVChannel[],
  tmdbItems: { id: string; title: string; type: "movie" | "series"; poster?: string | null; year?: string | null; rating?: string | null; tmdbId?: number }[],
  query: string,
  limit = 50
): SearchResult[] {
  if (!query || query.length < 2) return [];

  const cacheKey = query.toLowerCase().trim();
  const cached = searchResultCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.results;
  }

  const iptvResults = searchIPTV(iptvChannels, query, limit);

  const tmdbResults: SearchResult[] = [];
  for (const item of tmdbItems) {
    const score = fuzzyScore(query, item.title);
    if (score > 0) {
      tmdbResults.push({
        id: item.id,
        title: item.title,
        type: item.type,
        poster: item.poster || null,
        year: item.year ? parseInt(String(item.year), 10) : null,
        rating: item.rating ? parseFloat(String(item.rating)) : null,
        score: score + (item.rating ? parseFloat(String(item.rating)) : 0) + (item.poster ? 3 : 0),
        tmdbId: item.tmdbId,
      });
    }
  }

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...tmdbResults, ...iptvResults]) {
    const key = r.tmdbId ? `tmdb-${r.tmdbId}` : r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  merged.sort((a, b) => b.score - a.score);
  const final = merged.slice(0, limit);

  searchResultCache.set(cacheKey, { results: final, ts: Date.now() });
  return final;
}

/**
 * Clear search cache
 */
export function clearSearchCache(): void {
  searchResultCache.clear();
}
