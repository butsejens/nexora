import { useTeam } from "@/hooks/useTeam";

export function useTeamProfile(teamId: string) {
  return useTeam({
    teamId,
    league: "eng.1",
    sport: "soccer",
  });
}
