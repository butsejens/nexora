/**
 * Nexora – Football Logos CDN Utility
 * Based on: github.com/luukhopman/football-logos
 *
 * Provides deterministic logo URLs for clubs and national teams.
 * The CDN serves SVG logos organised by competition slug.
 *
 * Usage:
 *   import { getClubLogoUrl, getNationalTeamLogoUrl, getLeagueLogoUrl } from './football-logos.js';
 *   const url = getClubLogoUrl('real-madrid', 'laliga');   // SVG
 *   const png = getClubLogoUrl('real-madrid', 'laliga', 'png', 128); // PNG 128px
 */

// CDN base — jsdelivr serves the GitHub repo directly at no cost
const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/luukhopman/football-logos@main/logos";

// ─── League slug mapping ──────────────────────────────────────────────────────
// Maps ESPN league IDs / common names → football-logos competition folder names

const LEAGUE_SLUG_MAP = {
  // Club competitions
  "eng.1": "premier-league",
  "esp.1": "laliga",
  "ger.1": "bundesliga",
  "ita.1": "serie-a",
  "fra.1": "ligue-1",
  "ned.1": "eredivisie",
  "por.1": "primeira-liga",
  "bel.1": "jupiler-pro-league",
  "uefa.champions": "champions-league",
  "uefa.europa": "europa-league",
  "uefa.europa.conf": "conference-league",
  // National team competitions
  "fifa.worldq.conmebol": "south-america",
  "fifa.worldq.uefa": "europe",
  "fifa.worldcup": "world-cup",
  "uefa.euro": "euro",
  "conmebol.americacup": "copa-america",
  "caf.nations": "africa-cup-of-nations",
};

// ─── Team name → slug mapping (common misspellings/aliases) ──────────────────

const CLUB_NAME_OVERRIDES = {
  "real madrid": "real-madrid",
  "fc barcelona": "barcelona",
  barcelona: "barcelona",
  "manchester city": "manchester-city",
  "manchester united": "manchester-united",
  "man city": "manchester-city",
  "man utd": "manchester-united",
  "man united": "manchester-united",
  "paris saint-germain": "paris-saint-germain",
  psg: "paris-saint-germain",
  "fc bayern": "bayern-munich",
  "fc bayern münchen": "bayern-munich",
  "bayern munich": "bayern-munich",
  internazionale: "inter-milan",
  inter: "inter-milan",
  "inter milan": "inter-milan",
  "ac milan": "ac-milan",
  "atletico madrid": "atletico-madrid",
  "atlético madrid": "atletico-madrid",
  "borussia dortmund": "borussia-dortmund",
  bvb: "borussia-dortmund",
  ajax: "ajax",
  "ajax amsterdam": "ajax",
  celtic: "celtic",
  rangers: "rangers",
  "as roma": "as-roma",
  roma: "as-roma",
  "ss lazio": "lazio",
  lazio: "lazio",
  porto: "porto",
  "fc porto": "porto",
  benfica: "benfica",
  "sl benfica": "benfica",
  "sporting cp": "sporting-cp",
  "sporting lisbon": "sporting-cp",
  "club brugge": "club-brugge",
  anderlecht: "anderlecht",
  "rb leipzig": "rb-leipzig",
  "bayer leverkusen": "bayer-leverkusen",
  sevilla: "sevilla",
  "sevilla fc": "sevilla",
  villarreal: "villarreal",
  "real betis": "real-betis",
  napoli: "napoli",
  "ssc napoli": "napoli",
  juventus: "juventus",
  atalanta: "atalanta",
  fiorentina: "fiorentina",
  chelsea: "chelsea",
  arsenal: "arsenal",
  liverpool: "liverpool",
  tottenham: "tottenham-hotspur",
  spurs: "tottenham-hotspur",
  "leicester city": "leicester-city",
  "aston villa": "aston-villa",
  newcastle: "newcastle-united",
  "newcastle united": "newcastle-united",
  "west ham": "west-ham-united",
  "west ham united": "west-ham-united",
  everton: "everton",
  wolves: "wolverhampton-wanderers",
  wolverhampton: "wolverhampton-wanderers",
  "crystal palace": "crystal-palace",
  brighton: "brighton",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a team display name to a kebab-case slug.
 * @param {string} name
 * @returns {string}
 */
function nameToSlug(name) {
  const lower = String(name || "")
    .toLowerCase()
    .trim();
  if (CLUB_NAME_OVERRIDES[lower]) return CLUB_NAME_OVERRIDES[lower];
  return lower
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve a league ID / common name to the football-logos folder name.
 * @param {string} league
 * @returns {string}
 */
function resolveLeague(league) {
  const l = String(league || "")
    .toLowerCase()
    .trim();
  return LEAGUE_SLUG_MAP[l] || l.replace(/[^a-z0-9]+/g, "-");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the CDN URL for a club logo.
 *
 * @param {string} teamName  - display name or slug (e.g. "Real Madrid")
 * @param {string} league    - ESPN league ID or common name (e.g. "esp.1")
 * @param {'svg'|'png'} [format='svg']
 * @param {number} [size]    - width in px (only used for the local proxy path)
 * @returns {string}         - URL string, never null
 */
export function getClubLogoUrl(teamName, league, format = "svg", size = null) {
  const slug = nameToSlug(teamName);
  const folder = resolveLeague(league);
  // SVG is served directly; PNG is converted on-the-fly via the image proxy
  const rawSvgUrl = `${CDN_BASE}/${folder}/${slug}.svg`;
  if (format === "png" && size) {
    // Use the Nexora image proxy to convert + resize
    return `/api/image/proxy?url=${encodeURIComponent(rawSvgUrl)}&w=${size}&h=${size}&format=png`;
  }
  return rawSvgUrl;
}

/**
 * Build the CDN URL for a national team logo.
 *
 * @param {string} countryName - e.g. "Belgium", "Brazil"
 * @param {'svg'|'png'} [format='svg']
 * @returns {string}
 */
export function getNationalTeamLogoUrl(countryName, format = "svg") {
  const slug = nameToSlug(countryName);
  const rawSvgUrl = `${CDN_BASE}/national-teams/${slug}.svg`;
  if (format === "png") {
    return `/api/image/proxy?url=${encodeURIComponent(rawSvgUrl)}&w=128&h=128&format=png`;
  }
  return rawSvgUrl;
}

/**
 * Build the CDN URL for a competition/league logo.
 *
 * @param {string} league    - ESPN league ID (e.g. "eng.1", "uefa.champions")
 * @param {'svg'|'png'} [format='svg']
 * @returns {string}
 */
export function getLeagueLogoUrl(league, format = "svg") {
  const folder = resolveLeague(league);
  const rawSvgUrl = `${CDN_BASE}/${folder}/logo.svg`;
  if (format === "png") {
    return `/api/image/proxy?url=${encodeURIComponent(rawSvgUrl)}&w=128&h=128&format=png`;
  }
  return rawSvgUrl;
}

/**
 * Enrich an array of matches with logo URLs.
 * Mutates each match object to add homeTeamLogo / awayTeamLogo if missing.
 *
 * @param {Array<{homeTeam: {name: string}, awayTeam: {name: string}, leagueSlug: string}>} matches
 * @returns {Array}
 */
export function enrichMatchesWithLogos(matches, format = "svg") {
  return (matches || []).map((m) => ({
    ...m,
    homeTeamLogo:
      m.homeTeamLogo ||
      (m.homeTeam?.name
        ? getClubLogoUrl(m.homeTeam.name, m.leagueSlug || "", format)
        : null),
    awayTeamLogo:
      m.awayTeamLogo ||
      (m.awayTeam?.name
        ? getClubLogoUrl(m.awayTeam.name, m.leagueSlug || "", format)
        : null),
    leagueLogo:
      m.leagueLogo ||
      (m.leagueSlug ? getLeagueLogoUrl(m.leagueSlug, format) : null),
  }));
}

export { CDN_BASE, LEAGUE_SLUG_MAP };
