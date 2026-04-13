import { resolveLeagueDisplayName } from "@/lib/sports-data";

export type CompetitionType = "league" | "cup" | "international";

export type CountryDefinition = {
  id: string;
  name: string;
  shortName: string;
  countryCode: string;
  region: "country" | "region";
  flagUri: string;
  sortOrder: number;
};

export type CompetitionDefinition = {
  id: string;
  name: string;
  shortName: string;
  countryId: string;
  countryCode: string;
  espnLeague: string;
  type: CompetitionType;
  priority: number;
  aliases: string[];
};

export const ALL_COUNTRIES_ID = "all";
export const ALL_COMPETITIONS_ID = "all";

// ── Countries & Regions ───────────────────────────────────────────────
export const SPORT_COUNTRIES: CountryDefinition[] = [
  {
    id: "EU",
    name: "Europa",
    shortName: "Europa",
    countryCode: "EU",
    region: "region",
    flagUri: "https://flagcdn.com/w80/eu.png",
    sortOrder: 1,
  },
  {
    id: "BE",
    name: "België",
    shortName: "België",
    countryCode: "BE",
    region: "country",
    flagUri: "https://flagcdn.com/w80/be.png",
    sortOrder: 2,
  },
  {
    id: "GB",
    name: "Engeland",
    shortName: "Engeland",
    countryCode: "GB",
    region: "country",
    flagUri: "https://flagcdn.com/w80/gb-eng.png",
    sortOrder: 3,
  },
  {
    id: "ES",
    name: "Spanje",
    shortName: "Spanje",
    countryCode: "ES",
    region: "country",
    flagUri: "https://flagcdn.com/w80/es.png",
    sortOrder: 4,
  },
  {
    id: "DE",
    name: "Duitsland",
    shortName: "Duitsland",
    countryCode: "DE",
    region: "country",
    flagUri: "https://flagcdn.com/w80/de.png",
    sortOrder: 5,
  },
  {
    id: "IT",
    name: "Italië",
    shortName: "Italië",
    countryCode: "IT",
    region: "country",
    flagUri: "https://flagcdn.com/w80/it.png",
    sortOrder: 6,
  },
  {
    id: "FR",
    name: "Frankrijk",
    shortName: "Frankrijk",
    countryCode: "FR",
    region: "country",
    flagUri: "https://flagcdn.com/w80/fr.png",
    sortOrder: 7,
  },
  {
    id: "NL",
    name: "Nederland",
    shortName: "Nederland",
    countryCode: "NL",
    region: "country",
    flagUri: "https://flagcdn.com/w80/nl.png",
    sortOrder: 8,
  },
  {
    id: "PT",
    name: "Portugal",
    shortName: "Portugal",
    countryCode: "PT",
    region: "country",
    flagUri: "https://flagcdn.com/w80/pt.png",
    sortOrder: 9,
  },
  {
    id: "TR",
    name: "Turkije",
    shortName: "Turkije",
    countryCode: "TR",
    region: "country",
    flagUri: "https://flagcdn.com/w80/tr.png",
    sortOrder: 10,
  },
  {
    id: "SC",
    name: "Schotland",
    shortName: "Schotland",
    countryCode: "SC",
    region: "country",
    flagUri: "https://flagcdn.com/w80/gb-sct.png",
    sortOrder: 11,
  },
];

// ── Competitions ──────────────────────────────────────────────────────
export const SPORT_COMPETITIONS: CompetitionDefinition[] = [
  // ── Europa (UEFA) ─────────────────────────────────────────────────
  {
    id: "uefa-champions",
    name: "UEFA Champions League",
    shortName: "Champions League",
    countryId: "EU",
    countryCode: "EU",
    espnLeague: "uefa.champions",
    type: "international",
    priority: 1,
    aliases: ["Champions League", "UCL", "CL"],
  },
  {
    id: "uefa-europa",
    name: "UEFA Europa League",
    shortName: "Europa League",
    countryId: "EU",
    countryCode: "EU",
    espnLeague: "uefa.europa",
    type: "international",
    priority: 2,
    aliases: ["Europa League", "UEL"],
  },
  {
    id: "uefa-conference",
    name: "UEFA Europa Conference League",
    shortName: "Conference League",
    countryId: "EU",
    countryCode: "EU",
    espnLeague: "uefa.europa.conf",
    type: "international",
    priority: 3,
    aliases: ["Conference League", "UECL"],
  },
  {
    id: "uefa-nations",
    name: "UEFA Nations League",
    shortName: "Nations League",
    countryId: "EU",
    countryCode: "EU",
    espnLeague: "uefa.nations",
    type: "international",
    priority: 4,
    aliases: ["Nations League", "UNL"],
  },

  // ── België ────────────────────────────────────────────────────────
  {
    id: "bel-1",
    name: "Jupiler Pro League",
    shortName: "Jupiler Pro League",
    countryId: "BE",
    countryCode: "BE",
    espnLeague: "bel.1",
    type: "league",
    priority: 1,
    aliases: [
      "Belgian Pro League",
      "First Division A",
      "Eerste Klasse A",
      "Pro League",
      "Belgian First Division A",
    ],
  },
  {
    id: "bel-2",
    name: "Challenger Pro League",
    shortName: "Challenger Pro League",
    countryId: "BE",
    countryCode: "BE",
    espnLeague: "bel.2",
    type: "league",
    priority: 2,
    aliases: ["Belgian First Division B", "Eerste Klasse B"],
  },
  {
    id: "bel-cup",
    name: "Beker van België",
    shortName: "Beker van België",
    countryId: "BE",
    countryCode: "BE",
    espnLeague: "bel.cup",
    type: "cup",
    priority: 3,
    aliases: ["Belgian Cup", "Croky Cup"],
  },

  // ── Engeland ──────────────────────────────────────────────────────
  {
    id: "eng-1",
    name: "Premier League",
    shortName: "Premier League",
    countryId: "GB",
    countryCode: "GB",
    espnLeague: "eng.1",
    type: "league",
    priority: 1,
    aliases: ["EPL", "English Premier League"],
  },
  {
    id: "eng-2",
    name: "EFL Championship",
    shortName: "Championship",
    countryId: "GB",
    countryCode: "GB",
    espnLeague: "eng.2",
    type: "league",
    priority: 2,
    aliases: ["Championship", "English Championship"],
  },
  {
    id: "eng-fa",
    name: "FA Cup",
    shortName: "FA Cup",
    countryId: "GB",
    countryCode: "GB",
    espnLeague: "eng.fa",
    type: "cup",
    priority: 3,
    aliases: ["Emirates FA Cup"],
  },
  {
    id: "eng-league-cup",
    name: "Carabao Cup",
    shortName: "Carabao Cup",
    countryId: "GB",
    countryCode: "GB",
    espnLeague: "eng.league_cup",
    type: "cup",
    priority: 4,
    aliases: ["EFL Cup", "League Cup"],
  },

  // ── Spanje ────────────────────────────────────────────────────────
  {
    id: "esp-1",
    name: "La Liga",
    shortName: "La Liga",
    countryId: "ES",
    countryCode: "ES",
    espnLeague: "esp.1",
    type: "league",
    priority: 1,
    aliases: ["LaLiga", "Primera División", "La Liga EA Sports"],
  },
  {
    id: "esp-2",
    name: "La Liga 2",
    shortName: "La Liga 2",
    countryId: "ES",
    countryCode: "ES",
    espnLeague: "esp.2",
    type: "league",
    priority: 2,
    aliases: ["Segunda División", "LaLiga Hypermotion"],
  },
  {
    id: "esp-cup",
    name: "Copa del Rey",
    shortName: "Copa del Rey",
    countryId: "ES",
    countryCode: "ES",
    espnLeague: "esp.copa_del_rey",
    type: "cup",
    priority: 3,
    aliases: ["Spanish Cup"],
  },

  // ── Duitsland ─────────────────────────────────────────────────────
  {
    id: "ger-1",
    name: "Bundesliga",
    shortName: "Bundesliga",
    countryId: "DE",
    countryCode: "DE",
    espnLeague: "ger.1",
    type: "league",
    priority: 1,
    aliases: ["German Bundesliga"],
  },
  {
    id: "ger-2",
    name: "2. Bundesliga",
    shortName: "2. Bundesliga",
    countryId: "DE",
    countryCode: "DE",
    espnLeague: "ger.2",
    type: "league",
    priority: 2,
    aliases: ["Zweite Bundesliga"],
  },
  {
    id: "ger-cup",
    name: "DFB-Pokal",
    shortName: "DFB-Pokal",
    countryId: "DE",
    countryCode: "DE",
    espnLeague: "ger.dfb_pokal",
    type: "cup",
    priority: 3,
    aliases: ["German Cup"],
  },

  // ── Italië ────────────────────────────────────────────────────────
  {
    id: "ita-1",
    name: "Serie A",
    shortName: "Serie A",
    countryId: "IT",
    countryCode: "IT",
    espnLeague: "ita.1",
    type: "league",
    priority: 1,
    aliases: ["Italian Serie A"],
  },
  {
    id: "ita-2",
    name: "Serie B",
    shortName: "Serie B",
    countryId: "IT",
    countryCode: "IT",
    espnLeague: "ita.2",
    type: "league",
    priority: 2,
    aliases: ["Italian Serie B"],
  },
  {
    id: "ita-cup",
    name: "Coppa Italia",
    shortName: "Coppa Italia",
    countryId: "IT",
    countryCode: "IT",
    espnLeague: "ita.coppa_italia",
    type: "cup",
    priority: 3,
    aliases: ["Italian Cup"],
  },

  // ── Frankrijk ─────────────────────────────────────────────────────
  {
    id: "fra-1",
    name: "Ligue 1",
    shortName: "Ligue 1",
    countryId: "FR",
    countryCode: "FR",
    espnLeague: "fra.1",
    type: "league",
    priority: 1,
    aliases: ["Ligue 1 McDonald's", "French Ligue 1"],
  },
  {
    id: "fra-2",
    name: "Ligue 2",
    shortName: "Ligue 2",
    countryId: "FR",
    countryCode: "FR",
    espnLeague: "fra.2",
    type: "league",
    priority: 2,
    aliases: ["French Ligue 2"],
  },
  {
    id: "fra-cup",
    name: "Coupe de France",
    shortName: "Coupe de France",
    countryId: "FR",
    countryCode: "FR",
    espnLeague: "fra.coupe_de_france",
    type: "cup",
    priority: 3,
    aliases: ["French Cup"],
  },

  // ── Nederland ─────────────────────────────────────────────────────
  {
    id: "ned-1",
    name: "Eredivisie",
    shortName: "Eredivisie",
    countryId: "NL",
    countryCode: "NL",
    espnLeague: "ned.1",
    type: "league",
    priority: 1,
    aliases: ["Dutch Eredivisie"],
  },
  {
    id: "ned-2",
    name: "Eerste Divisie",
    shortName: "Eerste Divisie",
    countryId: "NL",
    countryCode: "NL",
    espnLeague: "ned.2",
    type: "league",
    priority: 2,
    aliases: ["Keuken Kampioen Divisie"],
  },
  {
    id: "ned-cup",
    name: "KNVB Beker",
    shortName: "KNVB Beker",
    countryId: "NL",
    countryCode: "NL",
    espnLeague: "ned.knvb_beker",
    type: "cup",
    priority: 3,
    aliases: ["Dutch Cup"],
  },

  // ── Portugal ──────────────────────────────────────────────────────
  {
    id: "por-1",
    name: "Liga Portugal",
    shortName: "Liga Portugal",
    countryId: "PT",
    countryCode: "PT",
    espnLeague: "por.1",
    type: "league",
    priority: 1,
    aliases: ["Primeira Liga", "Liga Portugal Betclic"],
  },
  {
    id: "por-cup",
    name: "Taça de Portugal",
    shortName: "Taça de Portugal",
    countryId: "PT",
    countryCode: "PT",
    espnLeague: "por.taca_de_portugal",
    type: "cup",
    priority: 2,
    aliases: ["Portuguese Cup"],
  },

  // ── Turkije ───────────────────────────────────────────────────────
  {
    id: "tur-1",
    name: "Süper Lig",
    shortName: "Süper Lig",
    countryId: "TR",
    countryCode: "TR",
    espnLeague: "tur.1",
    type: "league",
    priority: 1,
    aliases: ["Super Lig", "Turkish Süper Lig"],
  },
  {
    id: "tur-cup",
    name: "Türkiye Kupası",
    shortName: "Türkiye Kupası",
    countryId: "TR",
    countryCode: "TR",
    espnLeague: "tur.cup",
    type: "cup",
    priority: 2,
    aliases: ["Turkish Cup"],
  },

  // ── Schotland ─────────────────────────────────────────────────────
  {
    id: "sco-1",
    name: "Scottish Premiership",
    shortName: "Premiership",
    countryId: "SC",
    countryCode: "SC",
    espnLeague: "sco.1",
    type: "league",
    priority: 1,
    aliases: ["SPFL Premiership", "Scottish Premier League", "SPL"],
  },
  {
    id: "sco-cup",
    name: "Scottish Cup",
    shortName: "Scottish Cup",
    countryId: "SC",
    countryCode: "SC",
    espnLeague: "sco.cup",
    type: "cup",
    priority: 2,
    aliases: ["Scottish FA Cup"],
  },

  // ── UEFA Super Cup ────────────────────────────────────────────────
  {
    id: "uefa-super",
    name: "UEFA Super Cup",
    shortName: "Super Cup",
    countryId: "EU",
    countryCode: "EU",
    espnLeague: "uefa.super_cup",
    type: "international",
    priority: 5,
    aliases: ["European Super Cup"],
  },
];

const NORMALIZE_SEPARATORS = /[^a-z0-9]+/g;
const DIACRITICS = /[\u0300-\u036f]/g;

function normalizeToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(NORMALIZE_SEPARATORS, " ")
    .trim();
}

const COUNTRY_BY_ID = new Map(
  SPORT_COUNTRIES.map((country) => [country.id, country]),
);
const COMPETITION_BY_ID = new Map(
  SPORT_COMPETITIONS.map((competition) => [competition.id, competition]),
);
const COMPETITION_BY_ESPN = new Map(
  SPORT_COMPETITIONS.map((competition) => [
    competition.espnLeague,
    competition,
  ]),
);
const COMPETITION_BY_ALIAS = (() => {
  const map = new Map<string, CompetitionDefinition>();
  for (const competition of SPORT_COMPETITIONS) {
    const tokens = [
      competition.name,
      competition.shortName,
      ...competition.aliases,
      resolveLeagueDisplayName(competition.espnLeague),
    ];
    for (const token of tokens) {
      const normalized = normalizeToken(token);
      if (normalized) map.set(normalized, competition);
    }
  }
  return map;
})();

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  belgium: "BE",
  belgie: "BE",
  belgië: "BE",
  england: "GB",
  uk: "GB",
  "united kingdom": "GB",
  spain: "ES",
  espana: "ES",
  spanje: "ES",
  germany: "DE",
  deutschland: "DE",
  duitsland: "DE",
  italy: "IT",
  italia: "IT",
  italië: "IT",
  france: "FR",
  frankrijk: "FR",
  netherlands: "NL",
  nederland: "NL",
  holland: "NL",
  portugal: "PT",
  turkey: "TR",
  turkije: "TR",
  türkiye: "TR",
  scotland: "SC",
  schotland: "SC",
  europe: "EU",
  europa: "EU",
};

const LEAGUE_PREFIX_TO_COUNTRY: Record<string, string> = {
  bel: "BE",
  eng: "GB",
  esp: "ES",
  ger: "DE",
  ita: "IT",
  fra: "FR",
  ned: "NL",
  por: "PT",
  tur: "TR",
  sco: "SC",
  uefa: "EU",
  fifa: "EU",
};

export function getCountryById(countryId: string): CountryDefinition | null {
  return COUNTRY_BY_ID.get(countryId) || null;
}

export function getCompetitionById(
  competitionId: string,
): CompetitionDefinition | null {
  return COMPETITION_BY_ID.get(competitionId) || null;
}

export function getCompetitionsForCountry(
  countryId: string,
): CompetitionDefinition[] {
  const list =
    countryId === ALL_COUNTRIES_ID
      ? SPORT_COMPETITIONS
      : SPORT_COMPETITIONS.filter(
          (competition) => competition.countryId === countryId,
        );
  return [...list].sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );
}

export function resolveCompetitionByEspnOrName(params: {
  espnLeague?: string | null;
  leagueName?: string | null;
}): CompetitionDefinition | null {
  const espnLeague = String(params.espnLeague || "")
    .trim()
    .toLowerCase();
  if (espnLeague && COMPETITION_BY_ESPN.has(espnLeague)) {
    return COMPETITION_BY_ESPN.get(espnLeague) || null;
  }

  const leagueNameCandidates = [
    params.leagueName,
    resolveLeagueDisplayName(params.leagueName || ""),
    resolveLeagueDisplayName(espnLeague),
  ];

  for (const candidate of leagueNameCandidates) {
    const normalized = normalizeToken(candidate);
    if (!normalized) continue;
    const byAlias = COMPETITION_BY_ALIAS.get(normalized);
    if (byAlias) return byAlias;
  }

  return null;
}

function resolveCountryCodeFromText(value: string): string | null {
  const normalized = normalizeToken(value);
  if (!normalized) return null;
  if (normalized.length === 2) return normalized.toUpperCase();
  return COUNTRY_NAME_TO_CODE[normalized] || null;
}

export function resolveCountryCodeForMatch(params: {
  espnLeague?: string | null;
  leagueName?: string | null;
  competitionCountry?: string | null;
}): string | null {
  const competition = resolveCompetitionByEspnOrName({
    espnLeague: params.espnLeague,
    leagueName: params.leagueName,
  });
  if (competition?.countryCode) return competition.countryCode;

  const fromCompetitionCountry = resolveCountryCodeFromText(
    String(params.competitionCountry || ""),
  );
  if (fromCompetitionCountry) return fromCompetitionCountry;

  const slug = String(params.espnLeague || "")
    .trim()
    .toLowerCase();
  const prefix = slug.split(".")[0] || "";
  return LEAGUE_PREFIX_TO_COUNTRY[prefix] || null;
}

export type FilterableMatch = {
  league?: string | null;
  espnLeague?: string | null;
  competitionCountry?: string | null;
};

export function canonicalCompetitionName(match: FilterableMatch): string {
  const competition = resolveCompetitionByEspnOrName({
    espnLeague: match.espnLeague,
    leagueName: match.league,
  });
  if (competition) return competition.name;
  return (
    resolveLeagueDisplayName(match.league || match.espnLeague || "") ||
    "Competition"
  );
}

export function canonicalizeMatchCompetition<T extends FilterableMatch>(
  match: T,
): T {
  const competition = resolveCompetitionByEspnOrName({
    espnLeague: match.espnLeague,
    leagueName: match.league,
  });
  const countryCode = resolveCountryCodeForMatch({
    espnLeague: match.espnLeague,
    leagueName: match.league,
    competitionCountry: match.competitionCountry,
  });

  const nextLeague = competition?.name || canonicalCompetitionName(match);
  const nextEspn =
    competition?.espnLeague ||
    String(match.espnLeague || "").trim() ||
    undefined;
  const nextCountry = competition?.countryCode || countryCode || null;

  return {
    ...match,
    league: nextLeague,
    espnLeague: nextEspn,
    competitionCountry: nextCountry,
  };
}

export function filterMatchesBySelection<T extends FilterableMatch>(
  matches: T[],
  selectedCountryId: string,
  selectedCompetitionId: string,
): T[] {
  const selectedCompetition =
    selectedCompetitionId === ALL_COMPETITIONS_ID
      ? null
      : getCompetitionById(selectedCompetitionId);

  return matches.filter((match) => {
    const canonical = canonicalizeMatchCompetition(match);

    if (selectedCountryId !== ALL_COUNTRIES_ID) {
      const selectedCountry = getCountryById(selectedCountryId);
      if (!selectedCountry) return false;
      const matchCountryCode =
        canonical.competitionCountry ||
        resolveCountryCodeForMatch({
          espnLeague: canonical.espnLeague,
          leagueName: canonical.league,
          competitionCountry: canonical.competitionCountry,
        });
      if (matchCountryCode !== selectedCountry.countryCode) return false;
    }

    if (selectedCompetition) {
      const matchCompetition = resolveCompetitionByEspnOrName({
        espnLeague: canonical.espnLeague,
        leagueName: canonical.league,
      });
      if (!matchCompetition) return false;
      if (matchCompetition.id !== selectedCompetition.id) return false;
    }

    return true;
  });
}
