import {
  findCompetitionLeagueByEspn,
  resolveCompetitionDisplayNameFromConfig,
  resolveEspnLeagueCodeFromConfig,
} from "@/lib/competition-league-config";

type GenericMatch = Record<string, any>;

function toLower(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function readCompetitionName(match: GenericMatch): string {
  return String(
    match?.competition?.displayName ||
      match?.competition?.name ||
      match?.competition?.shortName ||
      match?.leagueName ||
      "",
  ).trim();
}

function readRawLeague(match: GenericMatch): string {
  return String(match?.league || "").trim();
}

function readDirectEspnLeague(match: GenericMatch): string {
  return String(match?.espnLeague || match?.competition?.espnSlug || "").trim();
}

function isInternationalByCode(espnLeague: string): boolean {
  const key = toLower(espnLeague);
  return /fifa|nations|euro|world|copa|afc|caf|concacaf|conmebol/.test(key);
}

export function mapEspnLeagueCodeToName(espnLeague: string): string {
  const direct = findCompetitionLeagueByEspn(espnLeague);
  if (direct?.name) return direct.name;
  return resolveCompetitionDisplayNameFromConfig({ espnLeague });
}

export function resolveMatchEspnLeagueCode(match: GenericMatch): string {
  const direct = readDirectEspnLeague(match);
  if (direct) return direct;

  const competitionName = readCompetitionName(match);
  const rawLeague = readRawLeague(match);
  const byName =
    resolveEspnLeagueCodeFromConfig({ name: competitionName }) ||
    resolveEspnLeagueCodeFromConfig({ name: rawLeague }) ||
    "";
  return byName;
}

export function resolveMatchCompetitionLabel(match: GenericMatch): string {
  const competitionName = readCompetitionName(match);
  const rawLeague = readRawLeague(match);
  const espnLeague = resolveMatchEspnLeagueCode(match);
  const codeMappedName = mapEspnLeagueCodeToName(espnLeague);
  const preferred =
    resolveCompetitionDisplayNameFromConfig({
      name: competitionName || rawLeague,
      espnLeague,
    }) ||
    competitionName ||
    rawLeague ||
    codeMappedName;
  const normalized = toLower(preferred);

  if (/friendly|friendlies/.test(normalized)) return "International Friendly";
  if (preferred) return preferred;
  if (isInternationalByCode(espnLeague)) return "International";
  return "Competition";
}
