import { apiRequest } from "@/lib/query-client";
import { enrichPlayerProfilePayload } from "@/lib/sports-enrichment";
import type { PlayerProfileDto } from "@/types/data-layer";

export type FetchPlayerParams = {
  playerId: string;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
};

function qs(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  return query.toString();
}

export async function fetchPlayer(params: FetchPlayerParams): Promise<PlayerProfileDto> {
  const query = qs({
    name: params.name,
    team: params.team,
    league: params.league || "eng.1",
    sport: params.sport || "soccer",
  });
  const route = `/api/sports/player/${encodeURIComponent(params.playerId)}${query ? `?${query}` : ""}`;
  const response = await apiRequest("GET", route);
  const json = await response.json();
  const enriched = enrichPlayerProfilePayload(json, {
    id: params.playerId,
    name: params.name || "",
    team: params.team || "",
    league: params.league || "eng.1",
    sport: params.sport || "soccer",
  });
  return enriched as PlayerProfileDto;
}
