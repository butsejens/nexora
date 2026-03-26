import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useStudios(id: string) {
  return useQuery({
    queryKey: ["media", "studio", id],
    queryFn: async () => apiRequestJson(`/api/vod/studio?id=${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}
