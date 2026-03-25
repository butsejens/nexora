/**
 * Nexora – User State Service
 *
 * Centralized, persistent user preference and activity state:
 *   - Followed teams
 *   - Followed matches (with notification flag)
 *   - Watch progress / continue watching
 *   - Watch history
 *   - Mood preferences (derived from history)
 *
 * All state is persisted via the cache-service (AsyncStorage-backed).
 * This service is the single source of truth for user-generated state
 * that must survive app restarts.
 *
 * Usage:
 *   Consume via the UserStateContext (context/UserStateContext.tsx).
 *   Do NOT call these functions directly in components — use the context hooks.
 */

import {
  cacheGet, cacheSet, cacheDel, cacheGetStale,
  CacheTTL, CacheKey,
} from "./cache-service";
import type {
  FollowedTeam, FollowedMatch, WatchProgress, WatchHistoryItem,
  MoodPreference, EntityId, ISODateString,
} from "@/lib/domain/models";

// ─── Followed Teams ───────────────────────────────────────────────────────────

export async function loadFollowedTeams(): Promise<FollowedTeam[]> {
  return (await cacheGetStale<FollowedTeam[]>(CacheKey.followedTeams())) ?? [];
}

export async function saveFollowedTeams(teams: FollowedTeam[]): Promise<void> {
  await cacheSet(CacheKey.followedTeams(), teams, CacheTTL.USER_STATE);
}

export async function followTeam(team: Omit<FollowedTeam, "followedAt">): Promise<FollowedTeam[]> {
  const current = await loadFollowedTeams();
  if (current.some(t => t.teamId === team.teamId)) return current;
  const entry: FollowedTeam = { ...team, followedAt: new Date().toISOString() };
  const updated = [...current, entry];
  await saveFollowedTeams(updated);
  return updated;
}

export async function unfollowTeam(teamId: EntityId): Promise<FollowedTeam[]> {
  const current = await loadFollowedTeams();
  const updated = current.filter(t => t.teamId !== teamId);
  await saveFollowedTeams(updated);
  return updated;
}

export function isTeamFollowed(teams: FollowedTeam[], teamId: EntityId): boolean {
  return teams.some(t => t.teamId === teamId);
}

// ─── Followed Matches ─────────────────────────────────────────────────────────

export async function loadFollowedMatches(): Promise<FollowedMatch[]> {
  return (await cacheGetStale<FollowedMatch[]>(CacheKey.followedMatches())) ?? [];
}

export async function saveFollowedMatches(matches: FollowedMatch[]): Promise<void> {
  await cacheSet(CacheKey.followedMatches(), matches, CacheTTL.USER_STATE);
}

export async function followMatch(match: Omit<FollowedMatch, "followedAt">): Promise<FollowedMatch[]> {
  const current = await loadFollowedMatches();
  if (current.some(m => m.matchId === match.matchId)) {
    // Update notification flag if already followed
    const updated = current.map(m =>
      m.matchId === match.matchId ? { ...m, notificationsEnabled: match.notificationsEnabled } : m
    );
    await saveFollowedMatches(updated);
    return updated;
  }
  const entry: FollowedMatch = { ...match, followedAt: new Date().toISOString() };
  const updated = [...current, entry];
  await saveFollowedMatches(updated);
  return updated;
}

export async function unfollowMatch(matchId: EntityId): Promise<FollowedMatch[]> {
  const current = await loadFollowedMatches();
  const updated = current.filter(m => m.matchId !== matchId);
  await saveFollowedMatches(updated);
  return updated;
}

/** Remove followed matches whose start time is more than 24h in the past */
export async function pruneExpiredFollowedMatches(): Promise<void> {
  const current = await loadFollowedMatches();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const pruned = current.filter(m => {
    if (!m.startTime) return true;
    return new Date(m.startTime).getTime() > cutoff;
  });
  if (pruned.length !== current.length) {
    await saveFollowedMatches(pruned);
  }
}

// ─── Watch Progress / Continue Watching ───────────────────────────────────────

/**
 * Track or update watch progress for a piece of content.
 * Idempotent — can be called repeatedly as position updates.
 */
export async function trackWatchProgress(progress: WatchProgress): Promise<void> {
  await cacheSet(
    CacheKey.watchProgress(progress.contentId),
    progress,
    CacheTTL.WATCH_PROGRESS,
  );
  // Also update in the history list
  await updateWatchHistory(progress);
}

export async function getWatchProgress(contentId: EntityId): Promise<WatchProgress | null> {
  return cacheGetStale<WatchProgress>(CacheKey.watchProgress(contentId));
}

export async function clearWatchProgress(contentId: EntityId): Promise<void> {
  await cacheDel(CacheKey.watchProgress(contentId));
}

// ─── Watch History ────────────────────────────────────────────────────────────

const MAX_HISTORY_ITEMS = 200;

export async function loadWatchHistory(): Promise<WatchHistoryItem[]> {
  return (await cacheGetStale<WatchHistoryItem[]>(CacheKey.watchHistory())) ?? [];
}

export async function updateWatchHistory(progress: WatchProgress): Promise<void> {
  let history = await loadWatchHistory();

  const existing = history.findIndex(h => h.contentId === progress.contentId);
  const item: WatchHistoryItem = {
    ...progress,
    lastWatchedAt: new Date().toISOString(),
  };

  if (existing >= 0) {
    history[existing] = item;
  } else {
    history = [item, ...history];
  }

  // Move most recent to front, cap list
  history.sort((a, b) => new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime());
  if (history.length > MAX_HISTORY_ITEMS) {
    history = history.slice(0, MAX_HISTORY_ITEMS);
  }

  await cacheSet(CacheKey.watchHistory(), history, CacheTTL.WATCH_PROGRESS);
}

export async function clearWatchHistory(): Promise<void> {
  await cacheDel(CacheKey.watchHistory());
}

/**
 * Get "continue watching" items: progress > 5% and < 95%.
 * Sorted by most recently watched.
 */
export async function getContinueWatching(limit = 20): Promise<WatchHistoryItem[]> {
  const history = await loadWatchHistory();
  return history
    .filter(h => h.progress > 0.05 && h.progress < 0.95)
    .slice(0, limit);
}

// ─── Mood Preferences ─────────────────────────────────────────────────────────

/**
 * Derive mood affinities from watch history genre_ids.
 * This is a lightweight client-side alternative to server-side ML ranking.
 */
const GENRE_TO_MOOD: Record<number, string> = {
  28: "action",   12: "adventure", 16: "animation", 35: "comedy",
  80: "crime",    99: "documentary", 18: "drama",   10751: "family",
  14: "fantasy",  36: "history",   27: "horror",    10402: "music",
  9648: "mystery", 10749: "romance", 878: "scifi",   53: "thriller",
  10752: "war",    37: "western",
};

export async function deriveMoodPreferences(): Promise<MoodPreference[]> {
  const history = await loadWatchHistory();
  const moodCounts: Record<string, number> = {};
  let total = 0;

  for (const item of history) {
    for (const genreId of item.genreIds ?? []) {
      const mood = GENRE_TO_MOOD[genreId];
      if (mood) {
        moodCounts[mood] = (moodCounts[mood] ?? 0) + 1;
        total++;
      }
    }
  }

  if (total === 0) return [];

  const now = new Date().toISOString();
  const prefs: MoodPreference[] = Object.entries(moodCounts)
    .map(([mood, count]) => ({
      mood,
      affinity: count / total,
      lastUpdatedAt: now,
    }))
    .sort((a, b) => b.affinity - a.affinity);

  await cacheSet(CacheKey.moodPreferences(), prefs, CacheTTL.USER_STATE);
  return prefs;
}

export async function loadMoodPreferences(): Promise<MoodPreference[]> {
  return (await cacheGetStale<MoodPreference[]>(CacheKey.moodPreferences())) ?? [];
}
