import { apiRequest } from "@/lib/query-client";
import { enrichSportsLeagueResource } from "@/lib/sports-enrichment";

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
  if (kind === "standings") {
    if (Array.isArray(json?.standings)) return json.standings.length;
    if (Array.isArray(json?.teams)) return json.teams.length;
    if (Array.isArray(json?.data)) return json.data.length;
    return 0;
  }
  if (kind === "topscorers") return getLeaderboardRows("topscorers", json).length;
  if (kind === "topassists") return getLeaderboardRows("topassists", json).length;
  if (kind === "competition-stats") {
    const numericSignals = [json?.totalGoals, json?.totalMatches, json?.avgGoalsPerMatch]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)).length;
    const listSignals = [
      Array.isArray(json?.leaderTable) ? json.leaderTable.length : 0,
      Array.isArray(json?.bestAttack) ? json.bestAttack.length : 0,
      Array.isArray(json?.bestDefense) ? json.bestDefense.length : 0,
      Array.isArray(json?.mostWins) ? json.mostWins.length : 0,
      Array.isArray(json?.mostDraws) ? json.mostDraws.length : 0,
    ].reduce((sum, n) => sum + n, 0);
    return numericSignals + listSignals;
  }
  if (kind === "competition-teams") return Array.isArray(json?.teams) ? json.teams.length : 0;
  if (kind === "competition-matches") return Array.isArray(json?.matches) ? json.matches.length : 0;
  return 0;
}

export function getLeaderboardRows(kind: "topscorers" | "topassists", json: any): any[] {
  const unwrapRows = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.entries)) return raw.entries;
    if (Array.isArray(raw?.leaders)) return raw.leaders;
    if (Array.isArray(raw?.leaderboard)) return raw.leaderboard;
    return [];
  };

  const normalizeAssistShape = (rows: any[]): any[] => {
    return rows.map((row: any) => {
      const assists =
        row?.assists ??
        row?.displayValue ??
        row?.value ??
        row?.statValue ??
        row?.stats?.assists ??
        row?.stats?.assistsPerGame ??
        null;
      return {
        ...row,
        assists,
        displayValue: row?.displayValue ?? assists,
      };
    });
  };

  const extractMetric = (row: any): number => {
    const raw = kind === "topassists"
      ? row?.assists ?? row?.displayValue ?? row?.value ?? row?.statValue ?? row?.stats?.assists ?? row?.stats?.assistsPerGame
      : row?.goals ?? row?.displayValue ?? row?.value ?? row?.statValue ?? row?.stats?.goals;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    const fallback = String(raw ?? "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
    const normalized = Number(fallback);
    return Number.isFinite(normalized) ? normalized : -1;
  };

  const dedupeRows = (rows: any[]): any[] => {
    const chosen = new Map<string, any>();
    for (const row of rows) {
      const name = String(row?.name || row?.player || row?.athlete?.displayName || "").trim().toLowerCase();
      const team = String(row?.team || row?.teamName || row?.club?.name || "").trim().toLowerCase();
      if (!name) continue;
      const key = `${name}|${team}`;
      const existing = chosen.get(key);
      const currentMetric = extractMetric(row);
      const existingMetric = existing ? extractMetric(existing) : -1;
      const currentHasPhoto = Boolean(row?.photo || row?.image || row?.headshot || row?.theSportsDbPhoto);
      const existingHasPhoto = Boolean(existing?.photo || existing?.image || existing?.headshot || existing?.theSportsDbPhoto);
      if (!existing || currentMetric > existingMetric || (currentMetric === existingMetric && currentHasPhoto && !existingHasPhoto)) {
        chosen.set(key, row);
      }
    }
    return [...chosen.values()];
  };

  if (kind === "topscorers") {
    const rows = dedupeRows([
      ...unwrapRows(json?.scorers),
      ...unwrapRows(json?.players),
      ...unwrapRows(json?.topScorers),
      ...unwrapRows(json?.data),
    ]);
    if (rows.length > 0) return rows;
    return [];
  }

  const assistsRows = dedupeRows([
    ...unwrapRows(json?.assists),
    ...unwrapRows(json?.topAssists),
    ...unwrapRows(json?.players),
    ...unwrapRows(json?.leaders),
    ...unwrapRows(json?.data),
  ]);
  if (assistsRows.length > 0) return normalizeAssistShape(assistsRows);

  return [];
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
      if (result.count > 0 && !result?.json?.error) {
        return enrichSportsLeagueResource(kind, result.json, {
          leagueName: params.leagueName || params.espnLeague,
        });
      }
    }
    return enrichSportsLeagueResource(kind, best.json || {}, {
      leagueName: params.leagueName || params.espnLeague,
    });
  }

  const results = await Promise.all(candidates.map((candidate) => fetchCandidate(kind, candidate)));
  const best = results.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const aPenalty = a?.json?.error ? 1 : 0;
    const bPenalty = b?.json?.error ? 1 : 0;
    return aPenalty - bPenalty;
  })[0];
  return enrichSportsLeagueResource(kind, best?.json || {}, {
    leagueName: params.leagueName || params.espnLeague,
  });
}
