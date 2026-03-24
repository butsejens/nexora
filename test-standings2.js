async function test() {
  const slugs = ['bel.1', 'tur.2'];
  for (const slug of slugs) {
    const url = 'https://site.web.api.espn.com/apis/v2/sports/soccer/' + slug + '/standings';
    const resp = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Nexora/1.0)', accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (!resp.ok) { console.log(slug + ': HTTP ' + resp.status); continue; }
    const data = await resp.json();
    console.log('=== ' + slug + ' ===');
    console.log(JSON.stringify(data, null, 2).slice(0, 3000));
    console.log('...\n');
  }

  // Also try alternative ESPN API for bel.1
  console.log('=== ALT API: site.api.espn.com/apis/v2/sports/soccer/bel.1/standings ===');
  try {
    const altUrl = 'https://site.api.espn.com/apis/v2/sports/soccer/bel.1/standings';
    const resp2 = await fetch(altUrl, { 
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    console.log('HTTP ' + resp2.status);
    if (resp2.ok) {
      const d = await resp2.json();
      console.log(JSON.stringify(d, null, 2).slice(0, 2000));
    }
  } catch (e) { console.log('ERROR: ' + e.message); }

  // Try v3 API
  console.log('\n=== V3 API: sports.core.api.espn.com/v2/sports/soccer/leagues/bel.1/standings ===');
  try {
    const v3Url = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/bel.1/standings';
    const resp3 = await fetch(v3Url, { 
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    console.log('HTTP ' + resp3.status);
    if (resp3.ok) {
      const d = await resp3.json();
      console.log(JSON.stringify(d, null, 2).slice(0, 2000));
    }
  } catch (e) { console.log('ERROR: ' + e.message); }

  // Try with season parameter
  console.log('\n=== bel.1 with season=2025 ===');
  try {
    const sUrl = 'https://site.web.api.espn.com/apis/v2/sports/soccer/bel.1/standings?season=2025';
    const resp4 = await fetch(sUrl, { 
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    console.log('HTTP ' + resp4.status);
    if (resp4.ok) {
      const d = await resp4.json();
      const hasChildren = d?.children?.length || 0;
      const hasEntries = d?.standings?.entries?.length || 0;
      console.log('children=' + hasChildren + ' direct entries=' + hasEntries + ' keys=' + Object.keys(d||{}).join(','));
      if (hasChildren > 0) {
        console.log('children[0] keys:', Object.keys(d.children[0]||{}).join(','));
      }
      console.log(JSON.stringify(d, null, 2).slice(0, 2000));
    }
  } catch (e) { console.log('ERROR: ' + e.message); }

  // Try with season=2024
  console.log('\n=== bel.1 with season=2024 ===');
  try {
    const s2024 = 'https://site.web.api.espn.com/apis/v2/sports/soccer/bel.1/standings?season=2024';
    const resp5 = await fetch(s2024, { 
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    console.log('HTTP ' + resp5.status);
    if (resp5.ok) {
      const d = await resp5.json();
      const hasChildren = d?.children?.length || 0;
      const hasEntries = d?.standings?.entries?.length || 0;
      console.log('children=' + hasChildren + ' direct entries=' + hasEntries + ' keys=' + Object.keys(d||{}).join(','));
      if (hasChildren > 0) {
        console.log('children[0] keys:', Object.keys(d.children[0]||{}).join(','));
        console.log(JSON.stringify(d.children[0], null, 2).slice(0, 1000));
      }
    }
  } catch (e) { console.log('ERROR: ' + e.message); }
}
test();
