const DEFAULT_LEAGUES = [
  "eng.1",
  "esp.1",
  "ger.1",
  "ita.1",
  "fra.1",
  "bel.1",
  "ned.1",
  "por.1",
  "tur.1",
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",
];

function parseLeaguesArg(argv) {
  const arg = argv.find((v) => v.startsWith("--leagues="));
  if (!arg) return DEFAULT_LEAGUES;
  return arg
    .slice("--leagues=".length)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function extractEntries(data) {
  const groups = Array.isArray(data?.children) ? data.children : [];
  if (groups.length > 0 && Array.isArray(groups[0]?.standings?.entries)) {
    return groups.flatMap((g) => (Array.isArray(g?.standings?.entries) ? g.standings.entries : []));
  }
  if (Array.isArray(data?.standings?.entries)) {
    return data.standings.entries;
  }
  return [];
}

async function fetchLeagueStandings(slug) {
  const base = `https://site.web.api.espn.com/apis/v2/sports/soccer/${slug}/standings`;

  for (const seasonType of [1, 2]) {
    const response = await fetchWithTimeout(`${base}?seasontype=${seasonType}`);
    if (!response.ok) continue;
    const json = await response.json();
    const entries = extractEntries(json);
    if (entries.length > 0) {
      return { seasonType, entries };
    }
  }

  const fallbackResponse = await fetchWithTimeout(base);
  if (!fallbackResponse.ok) {
    throw new Error(`HTTP ${fallbackResponse.status}`);
  }
  const fallbackJson = await fallbackResponse.json();
  return { seasonType: null, entries: extractEntries(fallbackJson) };
}

async function main() {
  const leagues = parseLeaguesArg(process.argv.slice(2));
  let okCount = 0;

  for (const slug of leagues) {
    try {
      const { seasonType, entries } = await fetchLeagueStandings(slug);
      const marker = seasonType == null ? "fallback" : `seasontype=${seasonType}`;
      console.log(`${slug}: ${entries.length} entries via ${marker}`);
      if (entries.length > 0) okCount += 1;
    } catch (error) {
      console.log(`${slug}: ERROR ${String(error?.message || error)}`);
    }
  }

  const failed = leagues.length - okCount;
  console.log(`summary: ${okCount}/${leagues.length} leagues returned standings`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`fatal: ${String(error?.message || error)}`);
  process.exitCode = 1;
});
