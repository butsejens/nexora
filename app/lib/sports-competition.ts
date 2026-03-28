type GenericMatch = Record<string, any>;

const ESPN_CODE_TO_NAME: Record<string, string> = {
  "eng.1": "Premier League",
  "esp.1": "La Liga",
  "ger.1": "Bundesliga",
  "ita.1": "Serie A",
  "fra.1": "Ligue 1",
  "bel.1": "Jupiler Pro League",
  "bel.2": "Challenger Pro League",
  "ned.1": "Eredivisie",
  "uefa.champions": "UEFA Champions League",
  "uefa.europa": "UEFA Europa League",
  "uefa.europa.conf": "UEFA Conference League",
  "uefa.nations": "UEFA Nations League",
  "fifa.world": "FIFA World Cup",
};

const NAME_TO_ESPN_CODE: Record<string, string> = {
  "premier league": "eng.1",
  "la liga": "esp.1",
  "bundesliga": "ger.1",
  "serie a": "ita.1",
  "ligue 1": "fra.1",
  "jupiler pro league": "bel.1",
  "challenger pro league": "bel.2",
  "eredivisie": "ned.1",
  "uefa champions league": "uefa.champions",
  "uefa europa league": "uefa.europa",
  "uefa conference league": "uefa.europa.conf",
  "uefa nations league": "uefa.nations",
  "fifa world cup": "fifa.world",
};

function toLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
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
  return ESPN_CODE_TO_NAME[toLower(espnLeague)] || "";
}

export function resolveMatchEspnLeagueCode(match: GenericMatch): string {
  const direct = readDirectEspnLeague(match);
  if (direct) return direct;

  const competitionName = readCompetitionName(match);
  const rawLeague = readRawLeague(match);
  const byName = NAME_TO_ESPN_CODE[toLower(competitionName)] || NAME_TO_ESPN_CODE[toLower(rawLeague)] || "";
  return byName;
}

export function resolveMatchCompetitionLabel(match: GenericMatch): string {
  const competitionName = readCompetitionName(match);
  const rawLeague = readRawLeague(match);
  const espnLeague = resolveMatchEspnLeagueCode(match);
  const codeMappedName = mapEspnLeagueCodeToName(espnLeague);
  const preferred = competitionName || rawLeague || codeMappedName;
  const normalized = toLower(preferred);

  if (/friendly|friendlies/.test(normalized)) return "International Friendly";
  if (preferred) return preferred;
  if (isInternationalByCode(espnLeague)) return "International";
  return "Competition";
}
