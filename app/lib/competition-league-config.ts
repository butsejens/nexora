import { Asset } from "expo-asset";
import { normalizeCompetitionName } from "@/lib/entity-normalization";

export type CompetitionLeagueEntry = {
  name: string;
  espnLeague: string;
  aliases?: string[];
  logo: string | number;
};

export const COMPETITION_LOCAL_LOGOS = {
  clubBrugge: require("../assets/logos/club-brugge.png"),
  jupilerProLeague: require("../assets/logos/jupiler-pro-league.png"),
  challengerProLeague: require("../assets/logos/challenger-pro-league.png"),
  championsLeague: require("../assets/logos/champions-league.png"),
  europaLeague: require("../assets/logos/europa-league.png"),
  conferenceLeague: require("../assets/logos/conference-league.png"),
  raalLaLouviere: require("../assets/logos/raal-la-louviere.png"),
} as const;

const LOCAL_LOGO_REGISTRY: {
  key: string;
  filePath: string;
  moduleId: number;
}[] = [
  {
    key: "club-brugge",
    filePath: "app/assets/logos/club-brugge.png",
    moduleId: COMPETITION_LOCAL_LOGOS.clubBrugge,
  },
  {
    key: "jupiler-pro-league",
    filePath: "app/assets/logos/jupiler-pro-league.png",
    moduleId: COMPETITION_LOCAL_LOGOS.jupilerProLeague,
  },
  {
    key: "challenger-pro-league",
    filePath: "app/assets/logos/challenger-pro-league.png",
    moduleId: COMPETITION_LOCAL_LOGOS.challengerProLeague,
  },
  {
    key: "champions-league",
    filePath: "app/assets/logos/champions-league.png",
    moduleId: COMPETITION_LOCAL_LOGOS.championsLeague,
  },
  {
    key: "europa-league",
    filePath: "app/assets/logos/europa-league.png",
    moduleId: COMPETITION_LOCAL_LOGOS.europaLeague,
  },
  {
    key: "conference-league",
    filePath: "app/assets/logos/conference-league.png",
    moduleId: COMPETITION_LOCAL_LOGOS.conferenceLeague,
  },
  {
    key: "raal-la-louviere",
    filePath: "app/assets/logos/raal-la-louviere.png",
    moduleId: COMPETITION_LOCAL_LOGOS.raalLaLouviere,
  },
];

const ESPN = (id: number) =>
  `https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png`;

const BASKETBALL_LOGOS: Record<string, string> = {
  nba: "https://a.espncdn.com/i/leaguelogos/basketball/500/nba.png",
  euroleague:
    "https://a.espncdn.com/i/leaguelogos/basketball/500/euroleague.png",
};

export const COMPETITION_LEAGUES: CompetitionLeagueEntry[] = [
  {
    name: "UEFA Champions League",
    espnLeague: "uefa.champions",
    aliases: ["Champions League", "UCL"],
    logo: COMPETITION_LOCAL_LOGOS.championsLeague,
  },
  {
    name: "UEFA Europa League",
    espnLeague: "uefa.europa",
    aliases: ["Europa League", "UEL"],
    logo: COMPETITION_LOCAL_LOGOS.europaLeague,
  },
  {
    name: "UEFA Conference League",
    espnLeague: "uefa.europa.conf",
    aliases: ["Conference League", "UECL", "UEFA Europa Conference League"],
    logo: COMPETITION_LOCAL_LOGOS.conferenceLeague,
  },
  {
    name: "UEFA Nations League",
    espnLeague: "uefa.nations",
    aliases: ["Nations League"],
    logo: ESPN(72),
  },
  {
    name: "Premier League",
    espnLeague: "eng.1",
    aliases: ["EPL", "English Premier League"],
    logo: ESPN(23),
  },
  {
    name: "EFL Championship",
    espnLeague: "eng.2",
    aliases: ["Championship"],
    logo: ESPN(24),
  },
  {
    name: "FA Cup",
    espnLeague: "eng.fa",
    aliases: ["Emirates FA Cup"],
    logo: ESPN(40),
  },
  {
    name: "Carabao Cup",
    espnLeague: "eng.league_cup",
    aliases: ["EFL Cup", "League Cup"],
    logo: ESPN(41),
  },
  {
    name: "La Liga",
    espnLeague: "esp.1",
    aliases: ["LaLiga", "Primera Division", "La Liga EA Sports"],
    logo: ESPN(15),
  },
  {
    name: "La Liga 2",
    espnLeague: "esp.2",
    aliases: ["Segunda Division", "LaLiga Hypermotion"],
    logo: ESPN(17),
  },
  {
    name: "Copa del Rey",
    espnLeague: "esp.copa_del_rey",
    aliases: ["Spanish Cup"],
    logo: ESPN(16),
  },
  {
    name: "Bundesliga",
    espnLeague: "ger.1",
    aliases: ["German Bundesliga"],
    logo: ESPN(10),
  },
  {
    name: "2. Bundesliga",
    espnLeague: "ger.2",
    aliases: ["2 Bundesliga", "Zweite Bundesliga"],
    logo: ESPN(19),
  },
  {
    name: "DFB-Pokal",
    espnLeague: "ger.dfb_pokal",
    aliases: ["DFB Pokal", "German Cup"],
    logo: ESPN(2061),
  },
  {
    name: "Serie A",
    espnLeague: "ita.1",
    aliases: ["Serie A Enilive"],
    logo: ESPN(12),
  },
  {
    name: "Serie B",
    espnLeague: "ita.2",
    aliases: ["Serie BKT"],
    logo: ESPN(13),
  },
  {
    name: "Coppa Italia",
    espnLeague: "ita.coppa_italia",
    aliases: [],
    logo: ESPN(14),
  },
  {
    name: "Ligue 1",
    espnLeague: "fra.1",
    aliases: ["Ligue 1 McDonalds", "Ligue 1 Uber Eats"],
    logo: ESPN(9),
  },
  {
    name: "Ligue 2",
    espnLeague: "fra.2",
    aliases: ["Ligue 2 BKT"],
    logo: ESPN(96),
  },
  {
    name: "Eredivisie",
    espnLeague: "ned.1",
    aliases: ["Dutch Eredivisie"],
    logo: ESPN(11),
  },
  {
    name: "Eerste Divisie",
    espnLeague: "ned.2",
    aliases: ["Keuken Kampioen Divisie", "Dutch Eerste Divisie"],
    logo: ESPN(105),
  },
  {
    name: "Jupiler Pro League",
    espnLeague: "bel.1",
    aliases: [
      "Jupiler Pro Leauge",
      "Belgian Pro League",
      "Belgian First Division A",
      "First Division A",
      "Pro League",
      "Eerste Klasse A",
    ],
    logo: COMPETITION_LOCAL_LOGOS.jupilerProLeague,
  },
  {
    name: "Challenger Pro League",
    espnLeague: "bel.2",
    aliases: [
      "Belgian First Division B",
      "First Division B",
      "Eerste Klasse B",
    ],
    logo: COMPETITION_LOCAL_LOGOS.challengerProLeague,
  },
  {
    name: "Beker van Belgie",
    espnLeague: "bel.cup",
    aliases: [
      "Belgian Cup",
      "Beker van Belgie",
      "Beker van België",
      "Croky Cup",
    ],
    logo: COMPETITION_LOCAL_LOGOS.jupilerProLeague,
  },
  {
    name: "Süper Lig",
    espnLeague: "tur.1",
    aliases: ["Super Lig"],
    logo: ESPN(18),
  },
  {
    name: "Scottish Premiership",
    espnLeague: "sco.1",
    aliases: ["Premiership"],
    logo: ESPN(45),
  },
  {
    name: "Austrian Bundesliga",
    espnLeague: "aus.1",
    aliases: ["Austrian Football Bundesliga"],
    logo: ESPN(5),
  },
  {
    name: "Super League Greece",
    espnLeague: "gre.1",
    aliases: ["Greek Super League", "Greek Cup"],
    logo: ESPN(98),
  },
  {
    name: "Liga Portugal",
    espnLeague: "por.1",
    aliases: ["Primeira Liga", "Liga Portugal Betclic", "Liga NOS"],
    logo: ESPN(14),
  },
  {
    name: "Swiss Super League",
    espnLeague: "sui.1",
    aliases: ["Super League"],
    logo: ESPN(17),
  },
  {
    name: "Superliga",
    espnLeague: "den.1",
    aliases: ["Danish Superliga"],
    logo: "",
  },
  {
    name: "Allsvenskan",
    espnLeague: "swe.1",
    aliases: ["Swedish Allsvenskan"],
    logo: ESPN(16),
  },
  {
    name: "Eliteserien",
    espnLeague: "nor.1",
    aliases: ["Norwegian Eliteserien"],
    logo: "",
  },
  {
    name: "Ekstraklasa",
    espnLeague: "pol.1",
    aliases: ["Polish Ekstraklasa"],
    logo: "",
  },
  {
    name: "Chance Liga",
    espnLeague: "cze.1",
    aliases: ["Czech First League", "Fortuna Liga"],
    logo: "",
  },
  {
    name: "MLS",
    espnLeague: "usa.1",
    aliases: ["Major League Soccer"],
    logo: ESPN(19),
  },
  {
    name: "Liga MX",
    espnLeague: "mex.1",
    aliases: ["Mexican Liga MX"],
    logo: ESPN(22),
  },
  {
    name: "Brasileirão",
    espnLeague: "bra.1",
    aliases: ["Brasileirao", "Campeonato Brasileiro Serie A"],
    logo: ESPN(85),
  },
  {
    name: "Liga Profesional",
    espnLeague: "arg.1",
    aliases: ["Argentine Primera Division"],
    logo: ESPN(1),
  },
  {
    name: "J1 League",
    espnLeague: "jpn.1",
    aliases: ["J.League", "Meiji Yasuda J1 League"],
    logo: ESPN(2199),
  },
  { name: "NBA", espnLeague: "nba", aliases: [], logo: BASKETBALL_LOGOS.nba },
  {
    name: "EuroLeague",
    espnLeague: "euroleague",
    aliases: [],
    logo: BASKETBALL_LOGOS.euroleague,
  },
];

const ENTRY_BY_ESPN = new Map<string, CompetitionLeagueEntry>();
const ENTRY_BY_NORMALIZED_NAME = new Map<string, CompetitionLeagueEntry>();

for (const entry of COMPETITION_LEAGUES) {
  const espnKey = String(entry.espnLeague || "")
    .trim()
    .toLowerCase();
  if (espnKey) ENTRY_BY_ESPN.set(espnKey, entry);

  const normalizedName = normalizeCompetitionName(entry.name);
  if (normalizedName) ENTRY_BY_NORMALIZED_NAME.set(normalizedName, entry);

  for (const alias of entry.aliases || []) {
    const normalizedAlias = normalizeCompetitionName(alias);
    if (normalizedAlias) ENTRY_BY_NORMALIZED_NAME.set(normalizedAlias, entry);
  }
}

export function findCompetitionLeagueByEspn(
  espnLeague?: string | null,
): CompetitionLeagueEntry | null {
  const key = String(espnLeague || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return ENTRY_BY_ESPN.get(key) || null;
}

export function findCompetitionLeagueByName(
  name?: string | null,
): CompetitionLeagueEntry | null {
  const normalized = normalizeCompetitionName(name || "");
  if (!normalized) return null;

  const direct = ENTRY_BY_NORMALIZED_NAME.get(normalized);
  if (direct) return direct;

  for (const [known, entry] of ENTRY_BY_NORMALIZED_NAME.entries()) {
    if (!known) continue;
    if (normalized.includes(known) || known.includes(normalized)) return entry;
  }

  return null;
}

export function resolveCompetitionLeague(input: {
  name?: string | null;
  espnLeague?: string | null;
}): CompetitionLeagueEntry | null {
  const byEspn = findCompetitionLeagueByEspn(input.espnLeague);
  if (byEspn) return byEspn;
  return findCompetitionLeagueByName(input.name);
}

export function resolveCompetitionDisplayNameFromConfig(input: {
  name?: string | null;
  espnLeague?: string | null;
}): string {
  const entry = resolveCompetitionLeague(input);
  if (entry?.name) return entry.name;
  return String(input.name || "").trim();
}

export function resolveEspnLeagueCodeFromConfig(input: {
  name?: string | null;
  espnLeague?: string | null;
}): string {
  const explicit = String(input.espnLeague || "").trim();
  if (explicit) return explicit;
  const entry = findCompetitionLeagueByName(input.name);
  return entry?.espnLeague || "";
}

let validatedAssets = false;

export function validateCompetitionLogoAssetPaths(debug = false): {
  checked: number;
  missing: string[];
} {
  const missing: string[] = [];

  for (const item of LOCAL_LOGO_REGISTRY) {
    try {
      const asset = Asset.fromModule(item.moduleId);
      const assetUri = String(asset?.uri || "").trim();
      if (!assetUri) missing.push(item.filePath);
    } catch {
      missing.push(item.filePath);
    }
  }

  if (debug) {
    if (missing.length === 0) {
      console.log(
        `[league-logo] local logo assets OK (${LOCAL_LOGO_REGISTRY.length} checked)`,
      );
    } else {
      console.warn(
        `[league-logo] missing local logo assets: ${missing.join(", ")}`,
      );
    }
  }

  return { checked: LOCAL_LOGO_REGISTRY.length, missing };
}

export function validateCompetitionLogoAssetsOnce(debug = false): void {
  if (validatedAssets) return;
  validatedAssets = true;
  validateCompetitionLogoAssetPaths(debug);
}
