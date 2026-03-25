/**
 * Nexora – Startup Preload / Warm Boot Hook
 *
 * Orchestrates warm-boot on app launch:
 *   1. Immediately hydrates in-memory cache from AsyncStorage
 *   2. Fires server-side sports prefetch (warms all league caches)
 *   3. Loads sports home data (today's matches)
 *   4. Preloads followed-team standings
 *   5. Starts player image warmup (existing system)
 *   6. Loads media home rails
 *   7. Triggers recommendation derivation in background
 *
 * All steps are non-blocking: the app renders from stale cache immediately
 * while fresh data arrives in the background.
 *
 * Usage:
 *   Call useAppPreload() once in the root layout (_layout.tsx).
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cacheWarmup, CacheKey } from "@/lib/services/cache-service";
import { getSportsHome, prefetchSportsHome, sportKeys } from "@/lib/services/sports-service";
import { getMediaHome, mediaKeys } from "@/lib/services/media-service";
import {
  loadFollowedTeams, loadFollowedMatches, loadWatchHistory,
  pruneExpiredFollowedMatches, deriveMoodPreferences,
} from "@/lib/services/user-state-service";
import { startPlayerImageWarmup } from "@/lib/player-image-system";

// ─── Preload order / timings ──────────────────────────────────────────────────

/** Delay between phases to avoid hammering the server immediately on start */
const PHASE_DELAY_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Cache key list to warm up from AsyncStorage ─────────────────────────────

const WARMUP_KEYS = [
  CacheKey.followedTeams(),
  CacheKey.followedMatches(),
  CacheKey.watchHistory(),
  CacheKey.moodPreferences(),
  CacheKey.homeRails(),
  CacheKey.recommendations(),
];

// Today's date in YYYY-MM-DD format (used as cache key for sports home)
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Preload phases ───────────────────────────────────────────────────────────

/**
 * Phase 0: Synchronous cache hydration.
 * Load persisted keys into the in-memory cache so subsequent reads are instant.
 */
async function phase0_hydrateCache(): Promise<void> {
  const date = today();
  await cacheWarmup([
    ...WARMUP_KEYS,
    CacheKey.sportsHome(date),
  ]);
}

/**
 * Phase 1: Fire-and-forget server prefetch.
 * Tells the server to warm its own caches for all leagues.
 */
function phase1_serverPrefetch(): void {
  prefetchSportsHome();
}

/**
 * Phase 2: Load user state into memory.
 * Load followed teams/matches + watch history — fast because cache was already warmed.
 */
async function phase2_userState(): Promise<void> {
  await Promise.all([
    loadFollowedTeams(),
    loadFollowedMatches(),
    loadWatchHistory(),
    pruneExpiredFollowedMatches(),
  ]);
}

/**
 * Phase 3: Fetch fresh sports home data and populate React Query cache.
 */
async function phase3_sportsHome(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  try {
    const data = await getSportsHome();
    queryClient.setQueryData(sportKeys.home(), data);
  } catch {
    // Not fatal — stale cache will be used
  }
}

/**
 * Phase 4: Load media home rails into React Query cache.
 */
async function phase4_mediaHome(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  try {
    const rails = await getMediaHome();
    queryClient.setQueryData(mediaKeys.home(), rails);
  } catch {
    // Not fatal
  }
}

/**
 * Phase 5: Start player image warmup (existing system, runs fully in background).
 */
function phase5_playerImageWarmup(queryClient: ReturnType<typeof useQueryClient>): void {
  // startPlayerImageWarmup is already designed to run in background
  startPlayerImageWarmup(queryClient).catch(() => {/* non-fatal */});
}

/**
 * Phase 6: Derive mood preferences from watch history.
 * Non-blocking — feeds into recommendations.
 */
async function phase6_moodDerivation(): Promise<void> {
  try {
    await deriveMoodPreferences();
  } catch {/* non-fatal */}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface PreloadState {
  isReady: boolean;
  phase: number;
}

/**
 * Call once in the root layout to trigger the warm boot sequence.
 * Returns the current phase so the boot screen can show meaningful progress.
 */
export function useAppPreload(): PreloadState {
  const queryClient = useQueryClient();
  const isReady = useRef(false);
  const phaseRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      try {
        // Phase 0: Hydrate local cache — blocks until done (fast)
        await phase0_hydrateCache();
        if (cancelled) return;
        phaseRef.current = 1;

        // Phase 1: Server prefetch — fire and forget
        phase1_serverPrefetch();
        phaseRef.current = 2;

        // Phase 2: User state loading — fast (already in memory after warmup)
        await phase2_userState();
        if (cancelled) return;
        phaseRef.current = 3;

        // Phase 3 & 4 in parallel: sports + media home
        await delay(PHASE_DELAY_MS);
        if (cancelled) return;

        await Promise.allSettled([
          phase3_sportsHome(queryClient),
          phase4_mediaHome(queryClient),
        ]);
        if (cancelled) return;
        phaseRef.current = 4;

        // Phase 5 & 6: player images + mood — fully background
        phase5_playerImageWarmup(queryClient);
        phase6_moodDerivation().catch(() => {});
        phaseRef.current = 5;

        isReady.current = true;
      } catch {
        // Preload errors are non-fatal — app always renders
        isReady.current = true;
      }
    }

    run();

    return () => { cancelled = true; };
  }, [queryClient]);

  return {
    get isReady() { return isReady.current; },
    get phase() { return phaseRef.current; },
  };
}
