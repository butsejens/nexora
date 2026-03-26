import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useTrendingMedia() {
  return useQuery({
    queryKey: ["media", "trending"],
    queryFn: async () => {
      const [movies, series] = await Promise.all([
        apiRequestJson("/api/movies/trending"),
        apiRequestJson("/api/series/trending"),
      ]);
      return { movies, series };
    },
  });
}
