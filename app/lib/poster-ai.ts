import { apiRequestJson } from "@/lib/query-client";

export type PosterGenerateRequest = {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  date?: string;
  time?: string;
  isDerby?: boolean;
  venue?: string | null;
  status?: string | null; // "live" | "upcoming" | "finished"
  score?: string | null; // e.g. "2-1" for live/finished
  homeFeaturedPlayer?: string | null;
  awayFeaturedPlayer?: string | null;
};

export type PosterGenerateResponse = {
  ok: boolean;
  provider: string;
  headline: string;
  subline: string;
  imageUrl?: string | null;
};

export async function generatePosterCreative(
  payload: PosterGenerateRequest,
): Promise<PosterGenerateResponse> {
  const response = await apiRequestJson<{
    ok: boolean;
    data?: PosterGenerateResponse | null;
  }>("/api/ai/poster/generate", {
    method: "POST",
    data: payload,
    dedupe: false,
  });
  if (response?.ok && response?.data) return response.data;
  throw new Error("Poster generation failed");
}
