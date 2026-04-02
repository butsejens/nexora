// Test TMDB + Sports endpoints on live Render server
const BASE = 'https://nexora-api-8xxb.onrender.com';

async function test(label, url, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const start = Date.now();
    const r = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - start;
    const body = await r.text();
    clearTimeout(timer);
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 200); }
    
    if (r.ok) {
      // Summarize the result
      if (parsed?.trending) {
        console.log(`✅ ${label}: ${r.status} in ${elapsed}ms — trending: ${parsed.trending?.length || 0}, popular: ${parsed.popular?.length || 0}, newReleases: ${parsed.newReleases?.length || 0}, topRated: ${parsed.topRated?.length || 0}`);
        if (parsed.trending?.[0]) console.log(`   First: "${parsed.trending[0].title || parsed.trending[0].name}"`);
      } else if (Array.isArray(parsed)) {
        console.log(`✅ ${label}: ${r.status} in ${elapsed}ms — ${parsed.length} items`);
      } else if (parsed?.events) {
        console.log(`✅ ${label}: ${r.status} in ${elapsed}ms — ${parsed.events?.length || 0} events`);
      } else {
        const summary = JSON.stringify(parsed).slice(0, 150);
        console.log(`✅ ${label}: ${r.status} in ${elapsed}ms — ${summary}`);
      }
    } else {
      console.log(`❌ ${label}: ${r.status} in ${elapsed}ms — ${JSON.stringify(parsed).slice(0, 100)}`);
    }
  } catch (e) {
    clearTimeout(timer);
    console.log(`❌ ${label}: ${e.message}`);
  }
}

console.log('Testing Nexora API endpoints...\n');

// Test sequentially to avoid overwhelming Render
await test('Movies Trending', `${BASE}/api/movies/trending`);
await test('Series Trending', `${BASE}/api/series/trending`);
await test('Sports Live', `${BASE}/api/sports/live`);
await test('Sports By Date', `${BASE}/api/sports/by-date?date=2026-04-02`);
await test('Sports Health', `${BASE}/api/sports/health`);

console.log('\nDone!');
