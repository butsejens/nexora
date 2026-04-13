/**
 * Nexora – User State Context
 *
 * Provides persistent sports follow state and improved watch progress:
 *   - Followed teams (with logo + competition)
 *   - Followed matches (with notification opt-in)
 *   - Watch progress (continue watching)
 *   - Mood preferences (derived from history)
 *
 * Backed by user-state-service (AsyncStorage + in-memory).
 * Designed to be composable alongside NexoraContext — does NOT duplicate
 * favorites/playlists state which already lives there.
 *
 * Usage:
 *   Wrap the root layout with <UserStateProvider>.
 *   Consume with useUserState() hook anywhere in the tree.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  loadFollowedTeams,
  saveFollowedTeams,
  followTeam,
  unfollowTeam,
  isTeamFollowed,
  loadFollowedMatches,
  followMatch,
  unfollowMatch,
  getContinueWatching,
  trackWatchProgress,
  clearWatchProgress,
  loadMoodPreferences,
  deriveMoodPreferences,
  pruneExpiredFollowedMatches,
} from "@/lib/services/user-state-service";
import { ensureMatchNotificationPermission } from "@/lib/match-notifications";
import type {
  FollowedTeam,
  FollowedMatch,
  WatchHistoryItem,
  MoodPreference,
  WatchProgress,
  EntityId,
} from "@/lib/domain/models";

// ─── Context type ─────────────────────────────────────────────────────────────

interface UserStateContextValue {
  // Follow — teams
  followedTeams: FollowedTeam[];
  isFollowingTeam: (teamId: EntityId) => boolean;
  followTeamAction: (team: Omit<FollowedTeam, "followedAt">) => Promise<void>;
  unfollowTeamAction: (teamId: EntityId) => Promise<void>;

  // Follow — matches
  followedMatches: FollowedMatch[];
  isFollowingMatch: (matchId: EntityId) => boolean;
  followMatchAction: (
    match: Omit<FollowedMatch, "followedAt">,
  ) => Promise<void>;
  unfollowMatchAction: (matchId: EntityId) => Promise<void>;

  // Continue watching
  continueWatching: WatchHistoryItem[];
  trackProgress: (progress: WatchProgress) => Promise<void>;
  clearProgress: (contentId: EntityId) => Promise<void>;

  // Mood preferences (derived from watch history genre affinities)
  moodPreferences: MoodPreference[];
  refreshMoodPreferences: () => Promise<void>;

  // Loading state
  isReady: boolean;
}

const UserStateContext = createContext<UserStateContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserStateProvider({ children }: { children: ReactNode }) {
  const [followedTeams, setFollowedTeams] = useState<FollowedTeam[]>([]);
  const [followedMatches, setFollowedMatches] = useState<FollowedMatch[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>(
    [],
  );
  const [moodPreferences, setMoodPreferences] = useState<MoodPreference[]>([]);
  const [isReady, setIsReady] = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [teams, matches, continueW, moods] = await Promise.all([
          loadFollowedTeams(),
          loadFollowedMatches(),
          getContinueWatching(),
          loadMoodPreferences(),
        ]);

        if (!active) return;
        setFollowedTeams(teams);
        setFollowedMatches(matches);
        setContinueWatching(continueW);
        setMoodPreferences(moods);

        // Prune expired followed matches in background
        pruneExpiredFollowedMatches().catch(() => {});
        // Derive mood preferences from accumulated watch history in background
        deriveMoodPreferences()
          .then((fresh) => {
            if (active) setMoodPreferences(fresh);
          })
          .catch(() => {});
      } catch {
        // Non-fatal — context works with empty defaults
      } finally {
        if (active) setIsReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // ── Teams ───────────────────────────────────────────────────────────────────

  const isFollowingTeam = useCallback(
    (teamId: EntityId) => isTeamFollowed(followedTeams, teamId),
    [followedTeams],
  );

  const followTeamAction = useCallback(
    async (team: Omit<FollowedTeam, "followedAt">) => {
      const updated = await followTeam(team);
      setFollowedTeams(updated);
    },
    [],
  );

  const unfollowTeamAction = useCallback(async (teamId: EntityId) => {
    const updated = await unfollowTeam(teamId);
    setFollowedTeams(updated);
  }, []);

  // ── Matches ─────────────────────────────────────────────────────────────────

  const isFollowingMatch = useCallback(
    (matchId: EntityId) => followedMatches.some((m) => m.matchId === matchId),
    [followedMatches],
  );

  const followMatchAction = useCallback(
    async (match: Omit<FollowedMatch, "followedAt">) => {
      const updated = await followMatch(match);
      setFollowedMatches(updated);
      // Request notification permission if user opted in for this match
      if (match.notificationsEnabled) {
        ensureMatchNotificationPermission().catch(() => {
          /* non-fatal */
        });
      }
    },
    [],
  );

  const unfollowMatchAction = useCallback(async (matchId: EntityId) => {
    const updated = await unfollowMatch(matchId);
    setFollowedMatches(updated);
  }, []);

  // ── Watch progress ───────────────────────────────────────────────────────────

  const trackProgress = useCallback(async (progress: WatchProgress) => {
    await trackWatchProgress(progress);
    // Refresh continue-watching list
    const updated = await getContinueWatching();
    setContinueWatching(updated);
  }, []);

  const clearProgress = useCallback(async (contentId: EntityId) => {
    await clearWatchProgress(contentId);
    const updated = await getContinueWatching();
    setContinueWatching(updated);
  }, []);

  // ── Mood preferences ─────────────────────────────────────────────────────────

  const refreshMoodPreferences = useCallback(async () => {
    const updated = await deriveMoodPreferences();
    setMoodPreferences(updated);
  }, []);

  // ── Memoized value ───────────────────────────────────────────────────────────

  const value = useMemo<UserStateContextValue>(
    () => ({
      followedTeams,
      isFollowingTeam,
      followTeamAction,
      unfollowTeamAction,
      followedMatches,
      isFollowingMatch,
      followMatchAction,
      unfollowMatchAction,
      continueWatching,
      trackProgress,
      clearProgress,
      moodPreferences,
      refreshMoodPreferences,
      isReady,
    }),
    [
      followedTeams,
      isFollowingTeam,
      followTeamAction,
      unfollowTeamAction,
      followedMatches,
      isFollowingMatch,
      followMatchAction,
      unfollowMatchAction,
      continueWatching,
      trackProgress,
      clearProgress,
      moodPreferences,
      refreshMoodPreferences,
      isReady,
    ],
  );

  return (
    <UserStateContext.Provider value={value}>
      {children}
    </UserStateContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUserState(): UserStateContextValue {
  const ctx = useContext(UserStateContext);
  if (!ctx) {
    throw new Error("useUserState must be used within a UserStateProvider");
  }
  return ctx;
}

// ─── Convenience hooks for individual concerns ────────────────────────────────

/** Access only the sports follow state */
export function useFollowState() {
  const {
    followedTeams,
    isFollowingTeam,
    followTeamAction,
    unfollowTeamAction,
    followedMatches,
    isFollowingMatch,
    followMatchAction,
    unfollowMatchAction,
  } = useUserState();
  return {
    followedTeams,
    isFollowingTeam,
    followTeamAction,
    unfollowTeamAction,
    followedMatches,
    isFollowingMatch,
    followMatchAction,
    unfollowMatchAction,
  };
}

/** Access only continue-watching / progress state */
export function useWatchProgress() {
  const { continueWatching, trackProgress, clearProgress } = useUserState();
  return { continueWatching, trackProgress, clearProgress };
}

/** Access mood preferences */
export function useMoodPreferences() {
  const { moodPreferences, refreshMoodPreferences } = useUserState();
  return { moodPreferences, refreshMoodPreferences };
}
