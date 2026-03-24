// Test if adding ?seasontype=1 breaks working leagues
const leagues = ['eng.1', 'ger.1', 'esp.1', 'fra.1', 'ita.1', 'ned.1', 'por.1', 'tur.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'eng.2', 'esp.2', 'ger.2', 'fra.2', 'ita.2', 'ned.2'];

async function test() {
  for (const slug of leagues) {
    try {
      const url = 'https://site.web.api.espn.com/apis/v2/sports/soccer/' + slug + '/standings?seasontype=1';
      const resp = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
        signal: AbortSignal.timeout(12000)
      });
      if (!resp.ok) { console.log(slug + '?seasontype=1: HTTP ' + resp.status); continue; }
      const data = await resp.json();
      const groups = data?.children || [];
      let entries = [];
      if (Array.isArray(groups) && groups[0]?.standings?.entries) {
        for (const g of groups) entries.push(...(g?.standings?.entries || []));
      } else if (Array.isArray(data?.standings?.entries)) {
        entries = data.standings.entries;
      }
      console.log(slug + '?seasontype=1: ' + entries.length + ' entries');
    } catch (e) {
      console.log(slug + '?seasontype=1: ERROR ' + e.message);
    }
  }
}
test();
