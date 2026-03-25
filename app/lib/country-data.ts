import { t as tFn } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────
export type CompetitionTier = "division1" | "division2" | "cup" | "national";

export type CountryCompetition = {
  id: string;
  tier: CompetitionTier;
  title: string;
  league: string;
  espn: string;
  color: string;
  nationalTeamName?: string;
};

export type CountryCatalog = {
  countryCode: string;
  countryName: string;
  competitions: CountryCompetition[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export const tierPriority: Record<CompetitionTier, number> = {
  division1: 1,
  division2: 2,
  cup: 3,
  national: 4,
};

export function tierLabel(tier: CompetitionTier): string {
  if (tier === "division1") return tFn("countries.tier1");
  if (tier === "division2") return tFn("countries.tier2");
  if (tier === "cup") return tFn("countries.cup");
  return tFn("countries.nationalTeam");
}

export function tierIcon(tier: CompetitionTier): string {
  if (tier === "division1") return "trophy-outline";
  if (tier === "division2") return "podium-outline";
  if (tier === "cup") return "medal-outline";
  return "flag-outline";
}

// ── Country Competition Catalog ───────────────────────────────────────────────
export const COUNTRY_COMPETITIONS: CountryCatalog[] = [
  {
    countryCode: "BE",
    countryName: "countries.belgium",
    competitions: [
      { id: "be_d1", tier: "division1", title: "countries.tier1", league: "Jupiler Pro League", espn: "bel.1", color: "#006600" },
      { id: "be_d2", tier: "division2", title: "countries.tier2", league: "Challenger Pro League", espn: "bel.2", color: "#228b22" },
      { id: "be_cup", tier: "cup", title: "countries.cup", league: "Belgian Cup", espn: "bel.cup", color: "#4f7d4f" },
      { id: "be_nt", tier: "national", title: "countries.nationalTeam", league: "Belgium National Team", espn: "fifa.world", color: "#7f9f7f", nationalTeamName: "Belgium" },
    ],
  },
  {
    countryCode: "GB",
    countryName: "countries.england",
    competitions: [
      { id: "en_d1", tier: "division1", title: "countries.tier1", league: "Premier League", espn: "eng.1", color: "#3d0099" },
      { id: "en_d2", tier: "division2", title: "countries.tier2", league: "Championship", espn: "eng.2", color: "#5220a3" },
      { id: "en_cup", tier: "cup", title: "countries.cup", league: "FA Cup", espn: "eng.fa", color: "#6c3eb6" },
      { id: "en_nt", tier: "national", title: "countries.nationalTeam", league: "England National Team", espn: "fifa.world", color: "#8460c4", nationalTeamName: "England" },
    ],
  },
  {
    countryCode: "ES",
    countryName: "countries.spain",
    competitions: [
      { id: "es_d1", tier: "division1", title: "countries.tier1", league: "La Liga", espn: "esp.1", color: "#cc0033" },
      { id: "es_d2", tier: "division2", title: "countries.tier2", league: "La Liga 2", espn: "esp.2", color: "#d93d63" },
      { id: "es_cup", tier: "cup", title: "countries.cup", league: "Copa del Rey", espn: "esp.copa_del_rey", color: "#de5d81" },
      { id: "es_nt", tier: "national", title: "countries.nationalTeam", league: "Spain National Team", espn: "fifa.world", color: "#e1829f", nationalTeamName: "Spain" },
    ],
  },
  {
    countryCode: "DE",
    countryName: "countries.germany",
    competitions: [
      { id: "de_d1", tier: "division1", title: "countries.tier1", league: "Bundesliga", espn: "ger.1", color: "#cc0000" },
      { id: "de_d2", tier: "division2", title: "countries.tier2", league: "2. Bundesliga", espn: "ger.2", color: "#b42a2a" },
      { id: "de_cup", tier: "cup", title: "countries.cup", league: "DFB Pokal", espn: "ger.dfb_pokal", color: "#a64545" },
      { id: "de_nt", tier: "national", title: "countries.nationalTeam", league: "Germany National Team", espn: "fifa.world", color: "#956262", nationalTeamName: "Germany" },
    ],
  },
  {
    countryCode: "IT",
    countryName: "countries.italy",
    competitions: [
      { id: "it_d1", tier: "division1", title: "countries.tier1", league: "Serie A", espn: "ita.1", color: "#990033" },
      { id: "it_d2", tier: "division2", title: "countries.tier2", league: "Serie B", espn: "ita.2", color: "#ab3657" },
      { id: "it_cup", tier: "cup", title: "countries.cup", league: "Coppa Italia", espn: "ita.coppa_italia", color: "#b9617b" },
      { id: "it_nt", tier: "national", title: "countries.nationalTeam", league: "Italy National Team", espn: "fifa.world", color: "#c78a9f", nationalTeamName: "Italy" },
    ],
  },
  {
    countryCode: "FR",
    countryName: "countries.france",
    competitions: [
      { id: "fr_d1", tier: "division1", title: "countries.tier1", league: "Ligue 1", espn: "fra.1", color: "#330066" },
      { id: "fr_d2", tier: "division2", title: "countries.tier2", league: "Ligue 2", espn: "fra.2", color: "#5d3d82" },
      { id: "fr_cup", tier: "cup", title: "countries.cup", league: "Coupe de France", espn: "fra.coupe_de_france", color: "#7d63a0" },
      { id: "fr_nt", tier: "national", title: "countries.nationalTeam", league: "France National Team", espn: "fifa.world", color: "#9f8ac0", nationalTeamName: "France" },
    ],
  },
  {
    countryCode: "NL",
    countryName: "countries.netherlands",
    competitions: [
      { id: "nl_d1", tier: "division1", title: "countries.tier1", league: "Eredivisie", espn: "ned.1", color: "#ff6a00" },
      { id: "nl_d2", tier: "division2", title: "countries.tier2", league: "Eerste Divisie", espn: "ned.2", color: "#ff8b2f" },
      { id: "nl_cup", tier: "cup", title: "countries.cup", league: "KNVB Beker", espn: "ned.knvb_beker", color: "#ffa866" },
      { id: "nl_nt", tier: "national", title: "countries.nationalTeam", league: "Netherlands National Team", espn: "fifa.world", color: "#ffc39a", nationalTeamName: "Netherlands" },
    ],
  },
  {
    countryCode: "PT",
    countryName: "countries.portugal",
    competitions: [
      { id: "pt_d1", tier: "division1", title: "countries.tier1", league: "Primeira Liga", espn: "por.1", color: "#006600" },
      { id: "pt_d2", tier: "division2", title: "countries.tier2", league: "Liga Portugal 2", espn: "por.2", color: "#228b22" },
      { id: "pt_cup", tier: "cup", title: "countries.cup", league: "Taça de Portugal", espn: "por.taca_de_portugal", color: "#4a9e4a" },
      { id: "pt_nt", tier: "national", title: "countries.nationalTeam", league: "Portugal National Team", espn: "fifa.world", color: "#80c080", nationalTeamName: "Portugal" },
    ],
  },
  {
    countryCode: "TR",
    countryName: "countries.turkey",
    competitions: [
      { id: "tr_d1", tier: "division1", title: "countries.tier1", league: "Süper Lig", espn: "tur.1", color: "#cc0000" },
      { id: "tr_d2", tier: "division2", title: "countries.tier2", league: "1. Lig", espn: "tur.2", color: "#d94040" },
      { id: "tr_cup", tier: "cup", title: "countries.cup", league: "Turkish Cup", espn: "tur.turkish_cup", color: "#e06a6a" },
      { id: "tr_nt", tier: "national", title: "countries.nationalTeam", league: "Turkey National Team", espn: "fifa.world", color: "#e89090", nationalTeamName: "Turkey" },
    ],
  },
  {
    countryCode: "SCO",
    countryName: "countries.scotland",
    competitions: [
      { id: "sco_d1", tier: "division1", title: "countries.tier1", league: "Scottish Premiership", espn: "sco.1", color: "#003399" },
      { id: "sco_d2", tier: "division2", title: "countries.tier2", league: "Scottish Championship", espn: "sco.2", color: "#2255bb" },
      { id: "sco_cup", tier: "cup", title: "countries.cup", league: "Scottish FA Cup", espn: "sco.fa_cup", color: "#4477cc" },
      { id: "sco_nt", tier: "national", title: "countries.nationalTeam", league: "Scotland National Team", espn: "fifa.world", color: "#6699dd", nationalTeamName: "Scotland" },
    ],
  },
  {
    countryCode: "AT",
    countryName: "countries.austria",
    competitions: [
      { id: "at_d1", tier: "division1", title: "countries.tier1", league: "Austrian Bundesliga", espn: "aut.1", color: "#cc0000" },
      { id: "at_cup", tier: "cup", title: "countries.cup", league: "Austrian Cup", espn: "aut.cup", color: "#e05050" },
      { id: "at_nt", tier: "national", title: "countries.nationalTeam", league: "Austria National Team", espn: "fifa.world", color: "#e88080", nationalTeamName: "Austria" },
    ],
  },
  {
    countryCode: "CH",
    countryName: "countries.switzerland",
    competitions: [
      { id: "ch_d1", tier: "division1", title: "countries.tier1", league: "Swiss Super League", espn: "sui.1", color: "#cc0011" },
      { id: "ch_d2", tier: "division2", title: "countries.tier2", league: "Swiss Challenge League", espn: "sui.2", color: "#d93344" },
      { id: "ch_nt", tier: "national", title: "countries.nationalTeam", league: "Switzerland National Team", espn: "fifa.world", color: "#e26677", nationalTeamName: "Switzerland" },
    ],
  },
  {
    countryCode: "GR",
    countryName: "countries.greece",
    competitions: [
      { id: "gr_d1", tier: "division1", title: "countries.tier1", league: "Super League Greece", espn: "gre.1", color: "#003399" },
      { id: "gr_cup", tier: "cup", title: "countries.cup", league: "Greek Cup", espn: "gre.cup", color: "#3366cc" },
      { id: "gr_nt", tier: "national", title: "countries.nationalTeam", league: "Greece National Team", espn: "fifa.world", color: "#668edd", nationalTeamName: "Greece" },
    ],
  },
  {
    countryCode: "PL",
    countryName: "countries.poland",
    competitions: [
      { id: "pl_d1", tier: "division1", title: "countries.tier1", league: "Ekstraklasa", espn: "pol.1", color: "#cc0022" },
      { id: "pl_nt", tier: "national", title: "countries.nationalTeam", league: "Poland National Team", espn: "fifa.world", color: "#e05555", nationalTeamName: "Poland" },
    ],
  },
  {
    countryCode: "DK",
    countryName: "countries.denmark",
    competitions: [
      { id: "dk_d1", tier: "division1", title: "countries.tier1", league: "Danish Superliga", espn: "den.1", color: "#cc0011" },
      { id: "dk_nt", tier: "national", title: "countries.nationalTeam", league: "Denmark National Team", espn: "fifa.world", color: "#dd4444", nationalTeamName: "Denmark" },
    ],
  },
  {
    countryCode: "SE",
    countryName: "countries.sweden",
    competitions: [
      { id: "se_d1", tier: "division1", title: "countries.tier1", league: "Allsvenskan", espn: "swe.1", color: "#004499" },
      { id: "se_nt", tier: "national", title: "countries.nationalTeam", league: "Sweden National Team", espn: "fifa.world", color: "#3366bb", nationalTeamName: "Sweden" },
    ],
  },
  {
    countryCode: "NO",
    countryName: "countries.norway",
    competitions: [
      { id: "no_d1", tier: "division1", title: "countries.tier1", league: "Eliteserien", espn: "nor.1", color: "#cc0000" },
      { id: "no_nt", tier: "national", title: "countries.nationalTeam", league: "Norway National Team", espn: "fifa.world", color: "#dd4444", nationalTeamName: "Norway" },
    ],
  },
  {
    countryCode: "CZ",
    countryName: "countries.czechrepublic",
    competitions: [
      { id: "cz_d1", tier: "division1", title: "countries.tier1", league: "Czech First League", espn: "cze.1", color: "#003399" },
      { id: "cz_nt", tier: "national", title: "countries.nationalTeam", league: "Czech Republic National Team", espn: "fifa.world", color: "#3366cc", nationalTeamName: "Czech Republic" },
    ],
  },
  {
    countryCode: "RO",
    countryName: "countries.romania",
    competitions: [
      { id: "ro_d1", tier: "division1", title: "countries.tier1", league: "Romanian Liga 1", espn: "rou.1", color: "#cc8800" },
      { id: "ro_nt", tier: "national", title: "countries.nationalTeam", league: "Romania National Team", espn: "fifa.world", color: "#ddaa22", nationalTeamName: "Romania" },
    ],
  },
];
