const providers = [
  ["nunflix", "https://nunflix.org/embed/movie/550"],
  ["movieapi.club", "https://moviesapi.club/movie/550"],
  ["vidsrc.net", "https://vidsrc.net/embed/movie/550"],
  ["embedrise2", "https://embedrise.com/embed/movie/550"],
  ["primeflix", "https://primeflix.lol/embed/movie/550"],
  ["susflix", "https://susflix.tv/embed/movie/550"],
  ["filmku", "https://filmku.stream/embed/movie/550"],
  ["neoembed", "https://neoembed.xyz/embed/movie/550"],
  ["binged", "https://binged.live/embed/movie/550"],
  ["2embed.waffle", "https://2embed.wafflehacker.io/scrape?id=550&type=movie"],
  ["moviesapi2", "https://moviesapi.club/movie/tt0137523"],
  ["vidsrc.me2", "https://vidsrc.me/embed/movie/tt0137523"],
  ["vidsrc.xyz2", "https://vidsrc.xyz/embed/movie/tt0137523"],
];
const TIMEOUT = 8000;
async function tp(name, url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0" }, redirect: "follow" });
    clearTimeout(t);
    const b = await r.text();
    const cf = (b.match(/challenge-platform|__cf_chl|Just a moment/gi)||[]).length;
    const vid = (b.match(/hls\.js|jwplayer|video\.js|plyr|artplayer|fluidplayer|\.m3u8|vidstack/gi)||[]).length;
    const ok = r.status===200 && cf===0 && b.length>500;
    console.log((ok?"Y":"N")+" "+name.padEnd(22)+"H="+r.status+" SZ="+String(b.length).padStart(6)+" CF="+cf+" VID="+vid);
    return { name, ok };
  } catch(e) { clearTimeout(t); console.log("N "+name.padEnd(22)+"FAIL: "+e.message?.slice(0,40)); return { name, ok: false }; }
}
console.log("Testing", providers.length, "more providers...\n");
const res = await Promise.all(providers.map(([n,u])=>tp(n,u)));
console.log("\nWorking:", res.filter(r=>r.ok).map(r=>r.name).join(", "));
