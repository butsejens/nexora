import { useQuery } from "@tanstack/react-query";
import { getMovieFull, getSeriesFull, mediaKeys } from "@/lib/services/media-service";

export function useMediaDetail(type: "movie" | "series", id: string) {
  const tmdbId = Number(id || 0);
  return useQuery({
    queryKey: type === "movie" ? mediaKeys.movieFull(tmdbId || 0) : mediaKeys.seriesFull(tmdbId || 0),
    queryFn: async () => {
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;
      return type === "movie" ? getMovieFull(tmdbId) : getSeriesFull(tmdbId);
    },
    enabled: Number.isFinite(tmdbId) && tmdbId > 0,
    staleTime: 10 * 60_000,
  });
}
