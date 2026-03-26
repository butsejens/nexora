import { useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/query-client";

export function useMediaDetail(type: "movie" | "series", id: string) {
  return useQuery({
    queryKey: ["media", "detail", type, id],
    queryFn: async () => apiRequestJson(`/api/${type === "movie" ? "movies" : "series"}/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}
