const leagues = ['eng.1', 'bel.1', 'ger.1', 'esp.1', 'fra.1', 'ita.1', 'ned.1', 'por.1', 'tur.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'bel.2', 'eng.2', 'esp.2', 'ger.2', 'fra.2', 'ita.2', 'ned.2', 'por.2', 'tur.2'];

async function test() {
  for (const slug of leagues) {
    try {
      const url = 'https://site.web.api.espn.com/apis/v2/sports/soccer/' + slug + '/standings';
      const resp = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Nexora/1.0)', accept: 'application/json' },
        signal: AbortSignal.timeout(12000)
      });
      if (!resp.ok) {
        console.log(slug + ': HTTP ' + resp.status);
        continue;
      }
      const data = await resp.json();
      const groups = data?.children || data?.standings?.entries || [];
      let entries = [];
      if (Array.isArray(groups) && groups[0]?.standings?.entries) {
        for (const g of groups) entries.push(...(g?.standings?.entries || []));
      } else if (Array.isArray(data?.standings?.entries)) {
        entries = data.standings.entries;
      }
      const topKeys = Object.keys(data || {}).join(',');
      console.log(slug + ': ' + entries.length + ' entries | children=' + (data?.children?.length || 0) + ' | direct=' + (data?.standings?.entries?.length || 0) + ' | keys: ' + topKeys);
      
      // If zero entries, dump more detail
      if (entries.length === 0) {
        if (data?.children) {
          console.log('  children[0] keys:', Object.keys(data.children[0] || {}).join(','));
          if (data.children[0]?.standings) {
            console.log('  children[0].standings keys:', Object.keys(data.children[0].standings || {}).join(','));
          }
        }
        if (data?.standings) {
          console.log('  standings keys:', Object.keys(data.standings || {}).join(','));
        }
      }
    } catch (e) {
      console.log(slug + ': ERROR ' + e.message);
    }
  }
}
test();
