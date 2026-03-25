import { apiRequest } from "@/lib/query-client";

export type SportsLeagueResourceKind =
  | "standings"
  | "topscorers"
  | "topassists"
  | "competition-stats"
  | "competition-teams"
  | "competition-matches";

type CandidateResult = {
  candidate: string;
  json: any;
  count: number;
};

function countForKind(kind: SportsLeagueResourceKind, json: any): number {
  if (kind === "standings") return Array.isArray(json?.standings) ? json.standings.length : 0;
  if (kind === "topscorers") return Array.isArray(json?.scorers) ? json.scorers.length : 0;
  if (kind === "topassists") return Array.isArray(json?.assists) ? json.assists.length : 0;
  if (kind === "competition-stats") return json?.totalGoals != null ? 1 : 0;
  if (kind === "competition-teams") return Array.isArray(json?.teams) ? json.teams.length : 0;
  if (kind === "competition-matches") return Array.isArray(json?.matches) ? json.matches.length : 0;
  return 0;
}

async function fetchCandidate(kind: SportsLeagueResourceKind, candidate: string): Promise<CandidateResult> {
  try {
    const res = await apiRequest("GET", `/api/sports/${kind}/${encodeURIComponent(candidate)}`);
    const json = await res.json();
    return { candidate, json, count: countForKind(kind, json) };
  } catch {
    return { candidate, json: null, count: 0 };
  }
}

export async function fetchSportsLeagueResourceWithFallback(
  kind: SportsLeagueResourceKind,
  params: { leagueName?: string; espnLeague?: string; sequential?: boolean }
): Promise<any> {
  const candidates = Array.from(new Set([String(params.leagueName || ""), String(params.espnLeague || "")].filter(Boolean)));
  if (candidates.length === 0) return {};

  const sequential = params.sequential !== false;
  if (sequential) {
    let best: CandidateResult = { candidate: candidates[0], json: {}, count: 0 };
    for (const candidate of candidates) {
      const result = await fetchCandidate(kind, candidate);
      if (result.count > best.count || (result.count === best.count && !result?.json?.error && best?.json?.error)) {
        best = result;
      }
      if (result.count > 0 && !result?.json?.error) return result.json;
    }
    return best.json || {};
  }

  const results = await Promise.all(candidates.map((candidate) => fetchCandidate(kind, candidate)));
  const best = results.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const aPenalty = a?.json?.error ? 1 : 0;
    const bPenalty = b?.json?.error ? 1 : 0;
    return aPenalty - bPenalty;
  })[0];
  return best?.json || {};
}
