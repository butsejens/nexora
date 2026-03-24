async function test() {
  // bel.1 with various seasontype params
  const combos = [
    ['bel.1', '?season=2025&seasontype=1'],
    ['bel.1', '?season=2025&seasontype=2'],
    ['bel.1', '?seasontype=1'],
    ['bel.1', '?seasontype=2'],
    ['bel.1', '?season=2024&seasontype=1'],
    ['bel.1', '?season=2024&seasontype=2'],
    // Also try cup competitions
    ['bel.cup', ''],
    ['esp.copa_del_rey', ''],
    ['ger.dfb_pokal', ''],
    ['fra.coupe_de_france', ''],
    ['ita.coppa_italia', ''],
    ['ned.knvb_beker', ''],
    ['por.taca_de_portugal', ''],
    ['tur.turkish_cup', ''],
  ];
  
  for (const [slug, params] of combos) {
    try {
      const url = 'https://site.web.api.espn.com/apis/v2/sports/soccer/' + slug + '/standings' + params;
      const resp = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
        signal: AbortSignal.timeout(12000)
      });
      if (!resp.ok) {
        console.log(slug + params + ': HTTP ' + resp.status);
        continue;
      }
      const data = await resp.json();
      const groups = data?.children || [];
      let entries = [];
      if (Array.isArray(groups) && groups[0]?.standings?.entries) {
        for (const g of groups) entries.push(...(g?.standings?.entries || []));
      } else if (Array.isArray(data?.standings?.entries)) {
        entries = data.standings.entries;
      }
      if (entries.length > 0) {
        const first = entries[0];
        const team = first?.team?.displayName || first?.team?.name || '?';
        console.log(slug + params + ': ' + entries.length + ' entries (first: ' + team + ')');
      } else {
        console.log(slug + params + ': 0 entries | keys=' + Object.keys(data||{}).join(','));
      }
    } catch (e) {
      console.log(slug + params + ': ERROR ' + e.message);
    }
  }
}
test();
