/**
 * Nexora – OMDB Integration
 *
 * Fetches IMDb and Rotten Tomatoes ratings from OMDB API.
 * OMDB aggregates multiple rating sources including Rotten Tomatoes.
 *
 * Requires: OMDB_API_KEY environment variable
 */

import { safeFetchJson } from '../shared/fetcher.js';
import { cache, TTL } from '../shared/cache.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('omdb');

// ─── OMDB Config ──────────────────────────────────────────────────────────────
const OMDB_BASE = 'https://www.omdbapi.com/';
const OMDB_KEY = String(process.env.OMDB_API_KEY || '').trim();
const OMDB_AVAILABLE = Boolean(OMDB_KEY);
const OMDB_TIMEOUT_MS = Number(process.env.OMDB_TIMEOUT_MS || 5_000);

function omdbUrl(title, year, type, imdbId) {
  const params = new URLSearchParams({
    apikey: OMDB_KEY,
    plot: 'short',
    type: type === 'series' ? 'series' : 'movie',
  });

  // Prefer IMDb ID if available
  if (imdbId) {
    params.append('i', imdbId);
  } else {
    params.append('t', title);
    if (year) {
      params.append('y', year);
    }
  }

  return `${OMDB_BASE}?${params}`;
}

/**
 * Fetch OMDB metadata for a title
 * @param {string} title - Movie/series title
 * @param {number|null} year - Release year
 * @param {'movie'|'series'} type - Content type
 * @param {string|null} imdbId - IMDb ID (e.g., "tt1234567")
 * @returns {Promise<{imdbRating: number|null, rottenTomatoesRating: number|null, rottenTomatoesAudienceScore: number|null, imdbId: string|null}>}
 */
export async function fetchOmdbRatings(title, year = null, type = 'movie', imdbId = null) {
  if (!OMDB_AVAILABLE) {
    log.debug('OMDB_API_KEY not configured, skipping OMDB enrichment');
    return {
      imdbRating: null,
      rottenTomatoesRating: null,
      rottenTomatoesAudienceScore: null,
      imdbId: null,
    };
  }

  try {
    // Build cache key
    const cacheKey = imdbId ? `omdb:id:${imdbId}` : `omdb:search:${title}:${year || 'any'}:${type}`;

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from OMDB
    const url = omdbUrl(title, year, type, imdbId);
    const result = await safeFetchJson(url, {
      timeoutMs: OMDB_TIMEOUT_MS,
      source: 'omdb',
      retries: 1,
    });

    // Check for API errors
    if (result?.Response === 'False') {
      log.debug('OMDB title not found', {
        title,
        year,
        type,
        error: result.Error,
      });
      return {
        imdbRating: null,
        imdbVotes: null,
        rottenTomatoesRating: null,
        metacriticScore: null,
        imdbId: null,
      };
    }

    // Extract ratings
    const omdbRatings = normalizeOmdbRatings(result);

    // Cache for 7 days
    await cache.set(cacheKey, omdbRatings, TTL.WEEK);

    return omdbRatings;
  } catch (error) {
    log.warn('OMDB fetch failed', {
      title,
      year,
      type,
      error: error.message,
    });
    return {
      imdbRating: null,
      imdbVotes: null,
      rottenTomatoesRating: null,
      metacriticScore: null,
      imdbId: null,
    };
  }
}

/**
 * Extract and normalize OMDB ratings from API response
 * @param {Object} omdbData - Raw OMDB API response
 * @returns {Object} Normalized ratings with multiple sources
 */
function normalizeOmdbRatings(omdbData) {
  let imdbRating = null;
  let imdbVotes = null;
  let rottenTomatoesRating = null;
  let metacriticScore = null;

  // Extract IMDb rating and votes
  if (omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
    imdbRating = parseFloat(omdbData.imdbRating);
    if (isNaN(imdbRating)) imdbRating = null;
  }

  if (omdbData.imdbVotes && omdbData.imdbVotes !== 'N/A') {
    imdbVotes = parseInt(omdbData.imdbVotes.replace(/,/g, ''), 10);
    if (isNaN(imdbVotes)) imdbVotes = null;
  }

  // Extract ratings from Ratings array (includes RT, Metacritic, etc.)
  if (Array.isArray(omdbData.Ratings)) {
    omdbData.Ratings.forEach((rating) => {
      // Rotten Tomatoes Critics Score
      if (rating.Source === 'Rotten Tomatoes') {
        const value = rating.Value.replace('%', '').trim();
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          rottenTomatoesRating = parsed; // Critics score (0-100)
        }
      }
      // Metacritic Score (can also be in Ratings array)
      if (rating.Source === 'Metacritic') {
        const value = rating.Value.split('/')[0].trim();
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          metacriticScore = parsed;
        }
      }
    });
  }

  // Fallback: Use metascore field if Ratings array didn't have it
  if (!metacriticScore && omdbData.Metascore && omdbData.Metascore !== 'N/A') {
    metacriticScore = parseInt(omdbData.Metascore, 10);
    if (isNaN(metacriticScore)) metacriticScore = null;
  }

  return {
    imdbRating,
    imdbVotes,
    imdbId: omdbData.imdbID || null,
    rottenTomatoesRating,
    metacriticScore,
  };
}

export default {
  fetchOmdbRatings,
  normalizeOmdbRatings,
};
