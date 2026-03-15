// Test embed providers for availability
const providers = [
  ["vidsrc.dev", "https://vidsrc.dev/embed/movie/550"],
  ["vidsrc.nl", "https://player.vidsrc.nl/embed/movie/550"],
  ["2embed.skin", "https://www.2embed.skin/embed/movie/550"],
  ["multiembed", "https://multiembed.mov/directstream.php?video_id=tt0137523&tmdb=1"],
  ["embed.su", "https://embed.su/embed/movie/550"],
  ["superembed", "https://multiembed.mov/?video_id=tt0137523&tmdb=1"],
  ["vidsrc.icu", "https://vidsrc.icu/embed/movie/550"],
  ["vidsrc.stream", "https://vidsrc.stream/embed/movie/550"],
  ["filmxy", "https://filmxy.wafflehacker.io/embed/movie/550"],
  ["2embed.cc", "https://www.2embed.cc/embed/550"],
  ["moviesapi.online", "https://moviesapi.online/movie/550"],
  ["vidsrc.to", "https://vidsrc.to/embed/movie/550"],
  ["vidplay.site", "https://vidplay.site/embed/movie/550"],
  ["player.smashy", "https://player.smashy.stream/movie/550"],
  ["flicky.host", "https://flicky.host/embed/movie/?id=550"],
  ["rive.app", "https://rivestream.live/embed?type=movie&id=550"],
  ["showbox", "https://www.showbox.media/embed/movie/550"],
  ["vidsrc.in", "https://vidsrc.in/embed/movie/550"],
  ["vidbinge", "https://vidbinge.dev/embed/movie/550"],
  ["embedsu2", "https://embed.su/embed/movie/550/1/1"],
  ["warezcdn", "https://embed.warezcdn.link/movie/550"],
  ["watchsomuch", "https://embed.watchsomuch.tv/embed/movie/550"],
  ["gomovies", "https://gomovies.sx/embed/movie/550"],
  ["vidora", "https://vidora.stream/embed/movie/550"],
  ["vidcloud", "https://vidcloud9.com/embed/movie/550"],
  ["vidmoly", "https://vidmoly.to/embed-movie/550.html"],
  ["streamsb", "https://streamsb.com/embed/movie/550"],
  ["nontongo2", "https://nontongo.win/embed/movie/550"],
  ["sflix", "https://sflix.to/embed/movie/550"],
  ["catflix", "https://catflix.su/embed/movie/550"],
  ["goojara", "https://www.goojara.to/embed/movie/550"],
  ["2embedorg", "https://2embed.org/e/movie/550"],
  ["prime-wire", "https://www.primewire.tf/embed/movie/550"],
  ["moviee", "https://moviee.tv/embed/movie/550"],
  ["soapertv", "https://soaper.tv/embed/movie/550"],
  ["twoembed", "https://2embed.me/embed/movie/550"],
  ["nontongo3", "https://www.nontongo.win/movie/550"],
  ["vidsrcpro", "https://vidsrc.pro/embed/movie/550"],
  ["embedv", "https://embedv.net/embed/movie/550"],
  ["frembed", "https://frembed.pro/embed/movie/550"],
  ["cinescrape", "https://cinescrape.com/embed/movie/550"],
  ["vidsrcicu2", "https://vidsrc.icu/embed/movie?tmdb=550"],
  ["autoembed2", "https://player.autoembed.cc/embed/movie/550"],
  ["rivealt", "https://rivestream.xyz/embed?type=movie&id=550"],
  ["ling", "https://player.ling-online.net/embed/movie/550"],
];

const TIMEOUT = 8000;

async function testProvider(name, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0" },
      redirect: "follow",
    });
    clearTimeout(timer);
    const body = await res.text();
    const sz = body.length;
    const cf = (body.match(/challenge-platform|__cf_chl|Just a moment|Checking your browser/gi) || []).length;
    const vid = (body.match(/hls\.js|jwplayer|video\.js|plyr|artplayer|fluidplayer|\.m3u8|vidstack|shaka|clappr|dplayer/gi) || []).length;
    const yt = (body.match(/youtube\.com\/embed|youtu\.be/gi) || []).length;
    const ifr = (body.match(/<iframe/gi) || []).length;
    const video = (body.match(/<video/gi) || []).length;
    const sandbox = (body.match(/sandbox/gi) || []).length > 2;
    const status = res.status;
    const ok = status === 200 && cf === 0 && yt === 0 && sz > 500;
    const score = (vid > 0 ? 3 : 0) + (ifr > 0 ? 1 : 0) + (video > 0 ? 2 : 0) + (ok ? 1 : 0) - (cf > 0 ? 5 : 0) - (yt > 0 ? 5 : 0);
    console.log(`${ok ? "✅" : "❌"} ${name.padEnd(18)} | H=${status} SZ=${String(sz).padStart(6)} CF=${cf} VID=${vid} YT=${yt} IFR=${ifr} <video>=${video} SCORE=${score}`);
    return { name, url, ok, score, status, sz, cf, vid, yt, ifr, video };
  } catch (e) {
    clearTimeout(timer);
    console.log(`❌ ${name.padEnd(18)} | FAIL: ${e.message?.slice(0, 40)}`);
    return { name, url, ok: false, score: -10 };
  }
}

console.log("Testing", providers.length, "providers...\n");
const results = await Promise.all(providers.map(([n, u]) => testProvider(n, u)));

console.log("\n=== WORKING PROVIDERS (sorted by score) ===");
const working = results.filter(r => r.ok).sort((a, b) => b.score - a.score);
working.forEach(r => {
  console.log(`  ${r.name.padEnd(18)} score=${r.score} vid=${r.vid} iframe=${r.ifr}`);
});
console.log(`\nTotal working: ${working.length}/${providers.length}`);
