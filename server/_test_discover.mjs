// Quick live test: fetch iptv-org sports playlist and count channels
const r = await fetch("https://iptv-org.github.io/iptv/categories/sports.m3u");
const txt = await r.text();
const lines = txt.split(/\r?\n/);
let extinf = 0, urls = 0;
for (const l of lines) {
  if (l.startsWith("#EXTINF")) extinf++;
  else if (l.startsWith("http")) urls++;
}
console.log(`iptv-org/sports: ${extinf} entries, ${urls} stream URLs`);
console.log(`Sample:`, lines.find(l => l.startsWith("http")));
console.log("DISCOVER_TEST:OK");
