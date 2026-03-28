import { useQuery } from "@tanstack/react-query";
import { getVodStudioById, mediaKeys } from "@/lib/services/media-service";

export function useStudios(id: string) {
  return useQuery({
    queryKey: mediaKeys.vodStudioDetail(id || "none"),
    queryFn: async () => getVodStudioById(id),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}
