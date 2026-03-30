import { apiRequest } from "../lib/query-client";
import type { PlayerAnalysisDto } from "@/types/data-layer";

export type FetchPlayerAnalysisParams = {
  playerId: string;
  name?: string;
  team?: string;
  league?: string;
  language?: "nl" | "en";
  forceRefresh?: boolean;
};

function qs(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  return query.toString();
}

export async function fetchPlayerAnalysis(params: FetchPlayerAnalysisParams): Promise<PlayerAnalysisDto> {
  const query = qs({
    name: params.name,
    team: params.team,
    league: params.league || "eng.1",
    language: params.language || "nl",
    refresh: params.forceRefresh ? "1" : undefined,
  });
  const route = `/api/sports/player-analysis/${encodeURIComponent(params.playerId)}${query ? `?${query}` : ""}`;
  const response = await apiRequest("GET", route);
  return (await response.json()) as PlayerAnalysisDto;
}

export async function streamPlayerAnalysis(
  params: FetchPlayerAnalysisParams,
  onMessage: (chunk: string) => void,
): Promise<PlayerAnalysisDto> {
  const query = qs({
    name: params.name,
    team: params.team,
    league: params.league || "eng.1",
    language: params.language || "nl",
    refresh: params.forceRefresh ? "1" : undefined,
  });
  const route = `/api/sports/player-analysis-stream/${encodeURIComponent(params.playerId)}${query ? `?${query}` : ""}`;
  const response = await apiRequest("GET", route);
  const body = response.body as ReadableStream<Uint8Array> | null;

  if (!body || typeof body.getReader !== "function") {
    return fetchPlayerAnalysis(params);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: PlayerAnalysisDto | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload) as { type?: string; chunk?: string; data?: PlayerAnalysisDto };
        if (parsed.type === "chunk" && parsed.chunk) onMessage(parsed.chunk);
        if (parsed.type === "done" && parsed.data) finalPayload = parsed.data;
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return finalPayload || fetchPlayerAnalysis(params);
}
