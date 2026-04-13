/**
 * image-resolver.ts — Central unified image resolver for all sports visuals.
 *
 * Single entry-point for:
 *   - Player photos (delegates to player-image-service)
 *   - Team logos (delegates to logo-manager)
 *   - Competition logos (delegates to logo-manager / competition-league-config)
 *
 * Additions over the existing services:
 *   1. Negative cache — failed URLs are tracked so broken images stop retrying.
 *   2. Screen-aware prefetch — preloads images for the next likely screen.
 *   3. Priority-based resolution — callers declare context (id, name, team,
 *      league, sport) and the resolver picks the best available source.
 *   4. Central `reportImageFailure()` — components report broken URLs so
 *      future resolves skip them.
 */

import {
  resolvePlayerPhoto,
  seedPlayerPhotos,
  prefetchPlayerPhotos,
  getCachedPhoto,
  usePhotoCacheVersion,
  hydratePhotoCache,
  invalidatePlayerPhoto,
  type PlayerSeed,
  type PlayerPhotoFieldType,
} from "@/lib/player-image-service";
import {
  resolveTeamLogoUri,
  resolveCompetitionBrand,
  resolveLogoImageSource,
  getInitials,
} from "@/lib/logo-manager";
import { Image as ExpoImage } from "expo-image";

// ───────────────────────────────────────────────────────────
// Re-exports — so consumers only import from image-resolver
// ───────────────────────────────────────────────────────────

export {
  seedPlayerPhotos,
  prefetchPlayerPhotos,
  getCachedPhoto,
  usePhotoCacheVersion,
  hydratePhotoCache,
  invalidatePlayerPhoto,
  getInitials,
};
export type { PlayerSeed };

// ───────────────────────────────────────────────────────────
// Negative cache — prevents retrying known-bad URLs
// ───────────────────────────────────────────────────────────

const NEGATIVE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_NEGATIVE = 2000;
const negativeCache = new Map<string, number>(); // url → timestamp

function isNegativelyCached(url: string | null | undefined): boolean {
  if (!url) return false;
  const ts = negativeCache.get(url);
  if (ts == null) return false;
  if (Date.now() - ts > NEGATIVE_TTL) {
    negativeCache.delete(url);
    return false;
  }
  return true;
}

/**
 * Report a URL that failed to load (404, network error, placeholder image).
 * Future calls to any resolve function will skip this URL for NEGATIVE_TTL.
 */
export function reportImageFailure(url: string | null | undefined): void {
  if (!url) return;
  negativeCache.set(url, Date.now());
  // Trim oldest entries if cache gets too large
  if (negativeCache.size > MAX_NEGATIVE) {
    const oldest = [...negativeCache.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, MAX_NEGATIVE / 2);
    for (const [key] of oldest) negativeCache.delete(key);
  }
}

/** Clear the negative cache (e.g. on manual refresh). */
export function clearNegativeCache(): void {
  negativeCache.clear();
}

// ───────────────────────────────────────────────────────────
// Player photo resolution
// ───────────────────────────────────────────────────────────

/**
 * Resolve a player photo URL. Returns null if none available.
 *
 * Resolution order:
 *  1. Seed photo from props (server-provided, highest trust)
 *  2. In-memory photo cache hit
 *  3. null (component shows initials)
 *
 * Skips any URL that has been reported as failed (negative cache).
 * This is SYNCHRONOUS — never triggers network.
 */
export function resolvePlayerImage(
  player: PlayerSeed,
  fieldType?: PlayerPhotoFieldType,
): string | null {
  const raw = resolvePlayerPhoto(player, fieldType);
  if (raw && isNegativelyCached(raw)) {
    if (__DEV__) {
      console.log(
        `[ImageResolver] ${player.name}: negative cache hit, skip ${raw}`,
      );
    }
    return null;
  }
  return raw;
}

// ───────────────────────────────────────────────────────────
// Team logo resolution
// ───────────────────────────────────────────────────────────

export type TeamLogoSeed = {
  teamName: string;
  uri?: string | null;
  resolvedLogo?: string | number | null;
  sport?: string | null;
};

/**
 * Resolve a team logo URI string.
 * Returns null when no logo is available (component shows initials).
 */
export function resolveTeamImage(seed: TeamLogoSeed): string | null {
  // Explicit URI takes priority (route param or API data)
  const explicitUri = String(seed.uri || "").trim();
  if (explicitUri && !isNegativelyCached(explicitUri)) return explicitUri;

  // Resolved logo from logo-manager
  if (typeof seed.resolvedLogo === "string" && seed.resolvedLogo) {
    if (!isNegativelyCached(seed.resolvedLogo)) return seed.resolvedLogo;
  }

  // For non-soccer, don't apply football-logo heuristics
  const sport = String(seed.sport || "soccer").toLowerCase();
  if (sport && sport !== "soccer" && sport !== "futsal") return null;

  const resolved = resolveTeamLogoUri(seed.teamName, seed.uri);
  if (
    typeof resolved === "string" &&
    resolved &&
    !isNegativelyCached(resolved)
  ) {
    return resolved;
  }
  return null;
}

// ───────────────────────────────────────────────────────────
// Competition logo resolution
// ───────────────────────────────────────────────────────────

export type CompetitionLogoSeed = {
  name?: string | null;
  espnLeague?: string | null;
};

/**
 * Resolve a competition logo URI.
 * Returns null when no logo is available.
 */
export function resolveCompetitionImage(
  seed: CompetitionLogoSeed,
): string | null {
  const brand = resolveCompetitionBrand({
    name: seed.name || undefined,
    espnLeague: seed.espnLeague || undefined,
  });
  const source = resolveLogoImageSource(brand.logo);
  if (source && typeof source === "object" && "uri" in source) {
    const uri = source.uri;
    if (uri && !isNegativelyCached(uri)) return uri;
  }
  return null;
}

// ───────────────────────────────────────────────────────────
// Prefetch strategies — one call per screen type
// ───────────────────────────────────────────────────────────

/**
 * Prefetch images that will be needed on the team-detail screen.
 * Call when the user is likely to navigate there (e.g. on match card press).
 */
export function prefetchForTeamScreen(data: {
  teamName: string;
  teamLogo?: string | null;
  players?: PlayerSeed[];
}): void {
  // Team logo
  const logo = data.teamLogo || resolveTeamImage({ teamName: data.teamName });
  if (logo) {
    ExpoImage.prefetch(logo, { cachePolicy: "memory-disk" }).catch(() => {});
  }
  // Player photos
  if (data.players?.length) {
    seedPlayerPhotos(data.players);
    prefetchPlayerPhotos(data.players, 6, "player-profile-photo");
  }
}

/**
 * Prefetch images for the player-profile screen.
 * Call from team-detail when a player row is visible or about to be tapped.
 */
export function prefetchForPlayerScreen(player: PlayerSeed): void {
  const url = resolvePlayerImage(player, "player-profile-photo");
  if (url) {
    ExpoImage.prefetch(url, { cachePolicy: "memory-disk" }).catch(() => {});
  }
}

/**
 * Prefetch images for the match-detail screen.
 * Call from match card / sports-home when a match row is visible.
 */
export function prefetchForMatchScreen(data: {
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  players?: PlayerSeed[];
}): void {
  const urls: string[] = [];
  if (data.homeTeamLogo) urls.push(data.homeTeamLogo);
  if (data.awayTeamLogo) urls.push(data.awayTeamLogo);
  for (const url of urls) {
    ExpoImage.prefetch(url, { cachePolicy: "memory-disk" }).catch(() => {});
  }
  if (data.players?.length) {
    seedPlayerPhotos(data.players);
    prefetchPlayerPhotos(data.players, 6, "lineup-player-photo");
  }
}

/**
 * Batch prefetch arbitrary image URLs.
 * Deduplicates and respects negative cache.
 */
export function prefetchImages(urls: (string | null | undefined)[]): void {
  const valid = [
    ...new Set(
      urls.filter(
        (u): u is string =>
          Boolean(u) && /^https?:\/\//.test(u!) && !isNegativelyCached(u),
      ),
    ),
  ];
  for (const url of valid) {
    ExpoImage.prefetch(url, { cachePolicy: "memory-disk" }).catch(() =>
      reportImageFailure(url),
    );
  }
}
