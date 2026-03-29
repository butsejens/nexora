import { usePlayer } from "@/hooks/usePlayer";

export function usePlayerProfile(playerId: string) {
  return usePlayer({
    playerId,
    league: "eng.1",
    sport: "soccer",
  });
}
