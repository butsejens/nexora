import { useQuery } from "@tanstack/react-query";
import { buildSportScheduleQuery } from "@/services/realtime-engine";

export function useMatchday(date: string) {
  return useQuery(buildSportScheduleQuery(date, Boolean(date)));
}
