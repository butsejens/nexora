// Test the new espnStandings logic with seasontype fallback
const ESPN_STANDINGS_BASE = "https://site.web.api.espn.com/apis/v2/sports/soccer";

async function fetchWithTimeout(fetchPromise, timeoutMs = 12000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
  );
  return Promise.race([fetchPromise, timeout]);
}

async function espnStandings(slug) {
  const base = `${ESPN_STANDINGS_BASE}/${slug}/standings`;
  for (const st of [1, 2]) {
    const url = `${base}?seasontype=${st}`;
    const resp = await fetchWithTimeout(
      fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" } }),
      12000
    );
    if (!resp.ok) throw new Error(`ESPN standings ${resp.status}`);
    const data = await resp.json();
    const groups = data?.children || [];
    const hasChildren = Array.isArray(groups) && groups[0]?.standings?.entries?.length > 0;
    const hasDirect = Array.isArray(data?.standings?.entries) && data.standings.entries.length > 0;
    if (hasChildren || hasDirect) {
      console.log(`  -> found via seasontype=${st}`);
      return data;
    }
    console.log(`  -> seasontype=${st} empty`);
  }
  const resp = await fetchWithTimeout(
    fetch(base, { headers: { "user-agent": "Mozilla/5.0 (Nexora/1.0)", accept: "application/json" } }),
    12000
  );
  if (!resp.ok) throw new Error(`ESPN standings ${resp.status}`);
  return resp.json();
}

function mapEspnStandings(data) {
  const groups = data?.children || data?.standings?.entries || [];
  let entries = [];
  if (Array.isArray(groups) && groups[0]?.standings?.entries) {
    for (const g of groups) entries.push(...(g?.standings?.entries || []));
  } else if (Array.isArray(data?.standings?.entries)) {
    entries = data.standings.entries;
  }
  return entries;
}

async function test() {
  const slugs = ['bel.1', 'eng.1', 'ger.1', 'uefa.champions', 'bel.2', 'ned.1'];
  for (const slug of slugs) {
    console.log(`\n${slug}:`);
    try {
      const data = await espnStandings(slug);
      const entries = mapEspnStandings(data);
      console.log(`  RESULT: ${entries.length} entries`);
      if (entries.length > 0) {
        console.log(`  First: ${entries[0]?.team?.displayName || entries[0]?.team?.name || '?'}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}
test();
