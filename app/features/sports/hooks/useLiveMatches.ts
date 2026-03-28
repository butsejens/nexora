import { useQuery } from "@tanstack/react-query";
import { buildSportLiveQuery, buildSportScheduleQuery } from "@/services/realtime-engine";

export function useLiveMatches(date?: string) {
  if (date) {
    return useQuery(buildSportScheduleQuery(date, true));
  }
  return useQuery(buildSportLiveQuery(true));
}
