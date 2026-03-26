import { useEffect } from "react";

import { useFollowState, useUserState } from "@/context/UserStateContext";
import { useOnboardingStore } from "@/store/onboarding-store";

export function PersonalizationBridge() {
  const sportsEnabled = useOnboardingStore((state) => state.sportsEnabled);
  const selectedTeams = useOnboardingStore((state) => state.selectedTeams);
  const { isReady } = useUserState();
  const { followedTeams, followTeamAction } = useFollowState();

  useEffect(() => {
    if (!sportsEnabled || !isReady || selectedTeams.length === 0) return;

    const followedIds = new Set(followedTeams.map((team) => String(team.teamId || "")).filter(Boolean));
    const pendingTeams = selectedTeams.filter((team) => !followedIds.has(String(team.id || "")));
    if (pendingTeams.length === 0) return;

    void Promise.all(
      pendingTeams.map((team) =>
        followTeamAction({
          teamId: String(team.id || team.name),
          teamName: team.name,
          competition: team.competition || null,
          logo: null,
        }),
      ),
    ).catch(() => undefined);
  }, [followTeamAction, followedTeams, isReady, selectedTeams, sportsEnabled]);

  return null;
}