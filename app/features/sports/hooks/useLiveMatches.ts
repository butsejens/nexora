import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useLiveMatches(date?: string) {
  const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
  return useQuery({
    queryKey: ["sports", "live", date || "today"],
    queryFn: async () => apiRequestJson(`/api/sports/live${suffix}`),
  });
}
