import { useQuery } from "@tanstack/react-query";
import { getTrendingMovies, getTrendingSeries } from "@/lib/services/media-service";

export function useTrendingMedia() {
  return useQuery({
    queryKey: ["media", "trending", "unified"],
    queryFn: async () => {
      const [movies, series] = await Promise.all([
        getTrendingMovies(1),
        getTrendingSeries(1),
      ]);
      return { movies, series };
    },
    staleTime: 90_000,
  });
}
