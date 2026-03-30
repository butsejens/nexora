import { apiRequest } from "../lib/query-client";
import { enrichTeamDetailPayload } from "../lib/sports-enrichment";
import type { TeamDto } from "@/types/data-layer";

export type FetchTeamParams = {
  teamId: string;
  teamName?: string;
  league?: string;
  sport?: string;
  countryCode?: string;
};

function qs(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  return query.toString();
}

export async function fetchTeam(params: FetchTeamParams): Promise<TeamDto> {
  const query = qs({
    teamName: params.teamName,
    league: params.league || "eng.1",
    sport: params.sport || "soccer",
    countryCode: params.countryCode,
  });
  const route = `/api/sports/team/${encodeURIComponent(params.teamId)}${query ? `?${query}` : ""}`;
  const response = await apiRequest("GET", route);
  const json = await response.json();
  return enrichTeamDetailPayload(json) as TeamDto;
}
