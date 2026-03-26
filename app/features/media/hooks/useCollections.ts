import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useCollections(id: string) {
  return useQuery({
    queryKey: ["media", "collection", id],
    queryFn: async () => apiRequestJson(`/api/vod/collection?id=${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}
