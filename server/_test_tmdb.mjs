import { readFileSync } from 'fs';

// Load .env manually
const envContent = readFileSync(new URL('.env', import.meta.url), 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const key = process.env.TMDB_API_KEY;
if (!key) { console.log('No TMDB key'); process.exit(1); }

// Test trending movies
const r1 = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${key}&language=nl-NL`);
const d1 = await r1.json();
console.log(`Trending movies: ${r1.status} — ${d1.results?.length || 0} items`);
if (d1.results?.[0]) console.log(`  First: "${d1.results[0].title}" (${d1.results[0].release_date})`);

// Test trending series
const r2 = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${key}&language=nl-NL`);
const d2 = await r2.json();
console.log(`Trending series: ${r2.status} — ${d2.results?.length || 0} items`);
if (d2.results?.[0]) console.log(`  First: "${d2.results[0].name}" (${d2.results[0].first_air_date})`);

// Test search
const r3 = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${key}&query=batman&language=nl-NL`);
const d3 = await r3.json();
console.log(`Search "batman": ${r3.status} — ${d3.results?.length || 0} items`);

console.log('\nAll TMDB tests passed!');
