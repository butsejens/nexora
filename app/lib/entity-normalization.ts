export type EntityKind = "team" | "competition" | "player" | "country";

const TRANSLITERATION_MAP: Record<string, string> = {
  ß: "ss",
  ł: "l",
  đ: "d",
  þ: "th",
  ð: "d",
  ø: "o",
  æ: "ae",
  œ: "oe",
};

const STOP_WORDS = new Set([
  "fc",
  "cf",
  "sc",
  "ac",
  "afc",
  "club",
  "de",
  "der",
  "the",
  "sv",
  "kv",
  "krc",
  "rc",
  "as",
  "fk",
  "nk",
]);

const SPONSOR_TERMS = new Set([
  "jupiler",
  "betclic",
  "bkt",
  "carabao",
  "sky",
  "uber",
  "emirates",
  "heineken",
  "barclays",
  "serie",
]);

const TEAM_ALIAS_MAP: Record<string, string[]> = {
  "bayern munich": [
    "bayern munchen",
    "bayern m nchen",
    "fc bayern munchen",
    "fc bayern",
    "bayern",
  ],
  "paris saint germain": ["psg", "paris sg", "paris saint-germain"],
  "sporting cp": ["sporting lisbon", "sporting clube de portugal", "sporting"],
  "rsc anderlecht": ["anderlecht", "r s c anderlecht"],
  "club brugge": [
    "club brugge kv",
    "club brugge k v",
    "brugge",
    "club bruges",
    "fc bruges",
    "fc club brugge",
  ],
  "raal la louviere": [
    "raal",
    "raal louviere",
    "raal la louviere centre",
    "la louviere",
    "r a a louvieroise",
    "raal la louvieroise",
  ],
  "manchester united": ["man utd", "man united", "manchester utd"],
  "manchester city": ["man city", "manchester c"],
  "newcastle united": ["newcastle"],
  internazionale: ["inter", "inter milan"],
  "borussia monchengladbach": [
    "gladbach",
    "monchengladbach",
    "borussia mgladbach",
  ],
};

const COMPETITION_ALIAS_MAP: Record<string, string[]> = {
  "belgian pro league": [
    "jupiler pro league",
    "first division a",
    "pro league",
    "belgie pro league",
    "belgium pro league",
  ],
  "challenger pro league": [
    "belgian first division b",
    "first division b",
    "1b",
  ],
  "uefa champions league": ["champions league", "ucl"],
  "uefa europa league": ["europa league", "uel"],
  "uefa conference league": [
    "conference league",
    "uecl",
    "europa conference league",
  ],
  "premier league": ["epl", "english premier league"],
  championship: ["efl championship"],
  "la liga": ["laliga", "primera division", "la liga ea sports"],
  bundesliga: ["bundesliga 1", "german bundesliga", "1 bundesliga"],
  "2 bundesliga": ["2. bundesliga", "zweite bundesliga"],
  "serie a": ["serie a enilive", "italian serie a"],
  "serie b": ["serie bkt"],
  "ligue 1": ["ligue 1 mcdonalds", "french ligue 1", "ligue 1 uber eats"],
  "ligue 2": ["french ligue 2", "ligue 2 bkt"],
  eredivisie: ["dutch eredivisie", "nederland eredivisie"],
  "eerste divisie": ["keuken kampioen divisie", "dutch second division"],
  // ── Portugal ──────────────────────────────────────────────────────────────
  "primeira liga": [
    "liga portugal",
    "liga nos",
    "liga bwin",
    "liga portugal bwin",
    "portuguesa",
    "primera liga",
  ],
  "liga portugal 2": ["liga pro", "segunda liga"],
  "taca de portugal": [
    "taca de portugal",
    "taça de portugal",
    "portuguese cup",
    "taca portugal",
  ],
  // ── Turkey ────────────────────────────────────────────────────────────────
  "super lig": [
    "super lig turkey",
    "turk telekom super lig",
    "ziraat super lig",
  ],
  "1 lig": ["tff first league", "turkish first league"],
  // ── Scotland ──────────────────────────────────────────────────────────────
  "scottish premiership": [
    "scottish premier league",
    "spfl premiership",
    "premiership scotland",
  ],
  "scottish championship": ["spfl championship"],
  // ── Austria ───────────────────────────────────────────────────────────────
  "austrian bundesliga": [
    "admiral bundesliga",
    "tipico bundesliga",
    "ost bundesliga",
    "austria bundesliga",
  ],
  // ── Switzerland ───────────────────────────────────────────────────────────
  "swiss super league": [
    "raiffeisen super league",
    "credit suisse super league",
    "squisito pizza super league",
    "super league suisse",
    "sui 1",
  ],
  "swiss challenge league": ["challenge league switzerland", "mysports league"],
  // ── Greece ────────────────────────────────────────────────────────────────
  "super league greece": [
    "super league 1",
    "greek super league",
    "greek premier league",
    "stoiximan super league",
  ],
  // ── Poland ────────────────────────────────────────────────────────────────
  ekstraklasa: ["polish ekstraklasa", "pko ekstraklasa", "pko bp ekstraklasa"],
  // ── Czech Republic ────────────────────────────────────────────────────────
  "czech first league": ["fortuna liga", "chance liga", "czech league"],
  // ── Romania ───────────────────────────────────────────────────────────────
  "romanian liga 1": [
    "liga 1",
    "superliga romania",
    "superliga",
    "casa liga 1",
  ],
  // ── Denmark ───────────────────────────────────────────────────────────────
  "danish superliga": ["superliga denmark", "3f superliga"],
  // ── Sweden ────────────────────────────────────────────────────────────────
  allsvenskan: ["swedish allsvenskan", "swedish premier league"],
  // ── Norway ────────────────────────────────────────────────────────────────
  eliteserien: ["norwegian eliteserien", "tippeligaen"],
  // ── Finland ───────────────────────────────────────────────────────────────
  veikkausliiga: ["finnish premier division"],
  // ── Netherlands (cups) ────────────────────────────────────────────────────
  "knvb beker": ["dutch cup", "toto knvb cup", "knvb cup"],
};

const COUNTRY_ALIAS_MAP: Record<string, string> = {
  belgie: "belgium",
  belgica: "belgium",
  belgien: "belgium",
  deutschland: "germany",
  duitsland: "germany",
  espana: "spain",
  espagna: "spain",
  italie: "italy",
  italia: "italy",
  frankrijk: "france",
  niederlande: "netherlands",
  holland: "netherlands",
  portugal: "portugal",
};

function transliterateText(input: string): string {
  let out = input;
  for (const [key, replacement] of Object.entries(TRANSLITERATION_MAP)) {
    out = out.replace(new RegExp(key, "gi"), replacement);
  }
  return out;
}

export function normalizeEntityText(value: unknown): string {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (!raw) return "";
  return transliterateText(
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/['`´’]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function normalizeCountryName(value: unknown): string {
  const normalized = normalizeEntityText(value);
  return COUNTRY_ALIAS_MAP[normalized] || normalized;
}

function stripSponsorTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !SPONSOR_TERMS.has(token));
}

export function normalizeCompetitionName(value: unknown): string {
  const normalized = normalizeEntityText(value);
  const tokens = stripSponsorTokens(normalized.split(" ").filter(Boolean));
  const compact = tokens.join(" ").trim();
  if (!compact) return normalized;
  for (const [canonical, aliases] of Object.entries(COMPETITION_ALIAS_MAP)) {
    if (compact === canonical || aliases.includes(compact)) return canonical;
  }
  return compact;
}

export function normalizeTeamName(
  value: unknown,
  opts?: { parentClub?: boolean },
): string {
  const normalized = normalizeEntityText(value);
  if (!normalized) return "";

  let team = normalized
    .replace(
      /\b(u ?17|u ?18|u ?19|u ?20|u ?21|u ?23|b team|b-team|reserves?|ii|jong)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!opts?.parentClub) {
    for (const [canonical, aliases] of Object.entries(TEAM_ALIAS_MAP)) {
      if (team === canonical || aliases.includes(team)) return canonical;
    }
    return team;
  }

  const parentTokens = team
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));
  const parent = parentTokens.join(" ").trim() || team;
  for (const [canonical, aliases] of Object.entries(TEAM_ALIAS_MAP)) {
    if (parent === canonical || aliases.includes(parent)) return canonical;
  }
  return parent;
}

export function normalizePlayerName(value: unknown): string {
  return normalizeEntityText(value)
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getEntityAliases(name: unknown, kind: EntityKind): string[] {
  const base = normalizeEntityText(name);
  if (!base) return [];
  const aliases = new Set<string>([base]);

  if (kind === "team") {
    const canonical = normalizeTeamName(base);
    const parent = normalizeTeamName(base, { parentClub: true });
    aliases.add(canonical);
    aliases.add(parent);
    for (const [nameKey, values] of Object.entries(TEAM_ALIAS_MAP)) {
      if (
        canonical === nameKey ||
        values.includes(canonical) ||
        values.includes(parent)
      ) {
        aliases.add(nameKey);
        for (const v of values) aliases.add(v);
      }
    }
  }

  if (kind === "competition") {
    const canonical = normalizeCompetitionName(base);
    aliases.add(canonical);
    for (const [nameKey, values] of Object.entries(COMPETITION_ALIAS_MAP)) {
      if (canonical === nameKey || values.includes(canonical)) {
        aliases.add(nameKey);
        for (const v of values) aliases.add(v);
      }
    }
  }

  if (kind === "player") {
    const canonical = normalizePlayerName(base);
    aliases.add(canonical);
    const compact = canonical.replace(/\s+/g, "");
    if (compact) aliases.add(compact);
  }

  if (kind === "country") {
    aliases.add(normalizeCountryName(base));
  }

  return [...aliases].filter(Boolean);
}

export function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(normalizeEntityText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeEntityText(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}
