import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useMatchday(date: string) {
  return useQuery({
    queryKey: ["sports", "matchday", date],
    queryFn: async () => apiRequestJson(`/api/sports/by-date?date=${encodeURIComponent(date)}`),
  });
}
