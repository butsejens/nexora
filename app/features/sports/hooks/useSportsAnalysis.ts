import { useMemo } from "react";
import { buildGroundedMatchAnalysis } from "@/lib/match-analysis-engine";

export function useSportsAnalysis(match: any, context?: any) {
  return useMemo(() => {
    if (!match) return null;
    return buildGroundedMatchAnalysis({
      homeTeam: String(match.homeTeam || ""),
      awayTeam: String(match.awayTeam || ""),
      context: context || {},
    } as any);
  }, [context, match]);
}
