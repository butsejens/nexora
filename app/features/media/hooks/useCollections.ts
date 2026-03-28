import { useQuery } from "@tanstack/react-query";
import { getVodCollectionById, mediaKeys } from "@/lib/services/media-service";

export function useCollections(id: string) {
  return useQuery({
    queryKey: mediaKeys.vodCollectionDetail(id || "none"),
    queryFn: async () => getVodCollectionById(id),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}
