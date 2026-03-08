export type ParsedChannel = {
  id: string;
  playlistId: string;
  name: string;
  title: string;
  logo: string;
  group: string;
  url: string;
  category: "live" | "movie" | "series";
  poster: string | null;
  backdrop: string | null;
  synopsis: string;
  year: number | null;
  rating: number;
  tmdbId: number | null;
  seasons?: number;
};

const MAX_LIVE = 5000;
const MAX_MOVIES = 5000;
const MAX_SERIES = 3000;

function classify(group: string, url = "", name = ""): "live" | "movie" | "series" {
  // 1. Xtream Codes URL path patterns (most reliable)
  if (/\/live\//.test(url)) return "live";
  if (/\/movie\//.test(url)) return "movie";
  if (/\/series\//.test(url)) return "series";

  const g = group.toLowerCase().trim();

  // 2. Series group title detection (check BEFORE movies — many providers put series in VOD groups)
  if (
    /\bseries?\b|serie\b|seizoen|season|tv.?show|episode|tvshow|sitcom|docu.?series|mini.?series/i.test(g) ||
    /\|\s*series?|\|\s*serie/i.test(group)
  ) return "series";

  // 3. Name-based series detection (S01E01, S01 E01, Season 1, Episode 3, etc.)
  if (
    /\bS\d{1,2}\s*E\d{1,3}\b/i.test(name) ||        // S01E01, S1 E3
    /\bSeason\s+\d/i.test(name) ||                     // Season 1
    /\bSeizoen\s+\d/i.test(name) ||                     // Seizoen 1 (Dutch)
    /\bSaison\s+\d/i.test(name) ||                      // Saison 1 (French)
    /\bStaffel\s+\d/i.test(name) ||                     // Staffel 1 (German)
    /\bEp\.?\s*\d{1,3}\b/i.test(name) ||               // Ep01, Ep.01, Ep 1
    /\bEpisode\s+\d/i.test(name) ||                     // Episode 1
    /\bAfl\.?\s*\d/i.test(name) ||                      // Afl. 1, Afl1 (Dutch)
    /\bTemporada\s+\d/i.test(name) ||                   // Temporada 1 (Spanish/Portuguese)
    /\b\d{1,2}x\d{2,3}\b/.test(name)                    // 1x01, 2x03 format
  ) return "series";

  // 4. Movie group title detection (group names + genre names used by IPTV providers)
  if (
    /\bvod\b|movie|film|cinema|bioscoop|spielfilm|pelicul|kino|flick/i.test(g) ||
    /\|\s*movie|\|\s*film|\|\s*vod/i.test(group) ||
    // Genre-based movie group names
    /^(action|adventure|animation|comedy|crime|documentary|drama|fantasy|horror|komedie|kinder|kids|misdaad|mystery|romance|sci.?fi|thriller|western|animatie|tekenfilm|avontuur|historisch|musical|oorlog)\b/i.test(g)
  ) return "movie";

  // 5. URL file extension hints
  const urlLow = url.toLowerCase();
  if (/\.(mp4|mkv|avi|mov|wmv|divx|xvid)(\?|$)/.test(urlLow)) return "movie";

  return "live";
}

function cleanName(name: string): string {
  return name
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .replace(/\b(4K|HD|FHD|SD|UHD|HEVC|H265|H264|AAC|AC3|x265|x264)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId(url: string): string {
  const tail = url.replace(/[^a-zA-Z0-9]/g, "").slice(-18);
  return `iptv_${tail || Math.random().toString(36).slice(2, 12)}`;
}

/** Yield to the event loop so the UI can update between chunks */
function yieldToUI(): Promise<void> {
  return new Promise(resolve => setImmediate ? setImmediate(resolve) : setTimeout(resolve, 0));
}

export async function parseM3UContentAsync(
  content: string,
  onProgress?: (pct: number) => void
): Promise<{ live: ParsedChannel[]; movies: ParsedChannel[]; series: ParsedChannel[]; capped: boolean }> {
  const live: ParsedChannel[] = [];
  const movies: ParsedChannel[] = [];
  const series: ParsedChannel[] = [];
  let capped = false;

  const lines = content.split(/\r?\n/);
  const total = lines.length;
  const CHUNK = 4000; // lines per batch before yielding

  for (let i = 0; i < total; i++) {
    // Yield every CHUNK lines to keep UI responsive and fire progress updates
    if (i % CHUNK === 0 && i > 0) {
      onProgress?.(Math.min(99, Math.round((i / total) * 100)));
      await yieldToUI();
    }

    if (live.length >= MAX_LIVE && movies.length >= MAX_MOVIES && series.length >= MAX_SERIES) {
      capped = true;
      break;
    }

    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;

    const nameMatch = line.match(/,(.+)$/);
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);

    let streamUrl = "";
    for (let j = i + 1; j < Math.min(i + 5, total); j++) {
      const nl = lines[j].trim();
      if (nl && !nl.startsWith("#")) { streamUrl = nl; break; }
    }
    if (!streamUrl) continue;

    const rawName = (nameMatch?.[1] || "").trim();
    const group = groupMatch?.[1] || "General";
    const logo = logoMatch?.[1] || "";
    const cat = classify(group, streamUrl, rawName);

    if (cat === "live" && live.length >= MAX_LIVE) continue;
    if (cat === "movie" && movies.length >= MAX_MOVIES) continue;
    if (cat === "series" && series.length >= MAX_SERIES) continue;

    const clean = cleanName(rawName);
    const base: ParsedChannel = {
      id: makeId(streamUrl),
      playlistId: "",
      name: rawName,
      title: clean || rawName,
      logo,
      group,
      url: streamUrl,
      category: cat,
      poster: logo || null,
      backdrop: null,
      synopsis: "",
      year: null,
      rating: 0,
      tmdbId: null,
    };

    if (cat === "live") live.push(base);
    else if (cat === "movie") movies.push(base);
    else series.push({ ...base, seasons: 1 });
  }

  onProgress?.(100);
  return { live, movies, series, capped };
}

// Keep sync version for small files / web
export function parseM3UContent(content: string): {
  live: ParsedChannel[]; movies: ParsedChannel[]; series: ParsedChannel[]; capped: boolean
} {
  const live: ParsedChannel[] = [];
  const movies: ParsedChannel[] = [];
  const series: ParsedChannel[] = [];
  let capped = false;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (live.length >= MAX_LIVE && movies.length >= MAX_MOVIES && series.length >= MAX_SERIES) {
      capped = true; break;
    }
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;
    const nameMatch = line.match(/,(.+)$/);
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);
    let streamUrl = "";
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const nl = lines[j].trim();
      if (nl && !nl.startsWith("#")) { streamUrl = nl; break; }
    }
    if (!streamUrl) continue;
    const rawName = (nameMatch?.[1] || "").trim();
    const group = groupMatch?.[1] || "General";
    const logo = logoMatch?.[1] || "";
    const cat = classify(group, streamUrl, rawName);
    if (cat === "live" && live.length >= MAX_LIVE) continue;
    if (cat === "movie" && movies.length >= MAX_MOVIES) continue;
    if (cat === "series" && series.length >= MAX_SERIES) continue;
    const clean = cleanName(rawName);
    const base: ParsedChannel = {
      id: makeId(streamUrl), playlistId: "", name: rawName, title: clean || rawName,
      logo, group, url: streamUrl, category: cat,
      poster: logo || null, backdrop: null, synopsis: "", year: null, rating: 0, tmdbId: null,
    };
    if (cat === "live") live.push(base);
    else if (cat === "movie") movies.push(base);
    else series.push({ ...base, seasons: 1 });
  }
  return { live, movies, series, capped };
}
// New code should prefer parseM3UContentAsync (non-blocking). This sync version is
// kept for compatibility with small web files where async overhead isn't needed.
