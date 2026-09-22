/**
 * CineLog — heuristic parsing of Stremio-style addon stream payloads.
 *
 * Torrentio, Comet and Meteor don't share a strict schema beyond
 * `{ name?, title?, url?, infoHash?, behaviorHints? }` — quality, codec, size
 * and seeders are embedded as free text. This mirrors the parsing every
 * Stremio-compatible client does client-side.
 */

import type {
  NormalizedStream,
  ResolutionTier,
  StreamProviderId,
  StreamRequestContext,
} from "./types.ts";

export interface RawAddonStream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: {
    filename?: string;
    videoSize?: number;
    bingeGroup?: string;
    notWebReady?: boolean;
  };
}

function textOf(raw: RawAddonStream): string {
  return `${raw.name ?? ""}\n${raw.title ?? raw.description ?? ""}\n${raw.behaviorHints?.filename ?? ""}`;
}

export function parseResolution(text: string): ResolutionTier {
  if (/\b(2160p|4k|uhd)\b/i.test(text)) return "4k";
  if (/\b1080p\b/i.test(text)) return "1080p";
  if (/\b720p\b/i.test(text)) return "720p";
  if (/\b(480p|sd)\b/i.test(text)) return "480p";
  return "unknown";
}

export function parseVideoCodec(text: string): string | null {
  if (/\b(x265|hevc|h\.?265)\b/i.test(text)) return "hevc";
  if (/\bav1\b/i.test(text)) return "av1";
  if (/\b(x264|h\.?264|avc)\b/i.test(text)) return "h264";
  return null;
}

export function parseAudioCodec(text: string): string | null {
  if (/\btruehd\b/i.test(text)) return "truehd";
  if (/\bdts-?hd\b/i.test(text)) return "dts-hd";
  if (/\bdts\b/i.test(text)) return "dts";
  if (/\b(ac3|dd5\.1|dolby digital)\b/i.test(text)) return "ac3";
  if (/\beac3|dd\+/i.test(text)) return "eac3";
  if (/\baac\b/i.test(text)) return "aac";
  return null;
}

export function parseHdr(text: string): boolean {
  return /\bhdr(10\+?)?\b/i.test(text);
}

export function parseDolbyVision(text: string): boolean {
  return /\bdolby ?vision\b|\bdv\b/i.test(text);
}

export function parseCached(text: string): boolean {
  return /⚡|\bcached\b|\binstant\b|\brd\+|\[rd\]|\bpm\+|\[ad\]/i.test(text);
}

export function parseSeeders(text: string): number | null {
  const match = text.match(/👤\s*([\d,]+)/) || text.match(/\bseeders?\s*:?\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

const SIZE_UNITS: Record<string, number> = {
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

export function parseSizeBytes(
  text: string,
  videoSizeHint?: number,
): number | null {
  if (typeof videoSizeHint === "number" && videoSizeHint > 0) return videoSizeHint;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = SIZE_UNITS[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || !unit) return null;
  return Math.round(amount * unit);
}

const LANGUAGE_TAGS: Record<string, string> = {
  multi: "multi",
  english: "en",
  eng: "en",
  dutch: "nl",
  nl: "nl",
  flemish: "nl",
  french: "fr",
  fre: "fr",
  vf: "fr",
  vff: "fr",
  german: "de",
  ger: "de",
  spanish: "es",
  italian: "it",
};

export function parseLanguages(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const [needle, code] of Object.entries(LANGUAGE_TAGS)) {
    if (new RegExp(`\\b${needle}\\b`, "i").test(lower)) found.add(code);
  }
  // Flag emoji ranges (regional indicators) roughly map to language hints too.
  const flagMatches = text.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu);
  if (flagMatches) flagMatches.forEach((f) => found.add(f));
  return Array.from(found);
}

function magnetIdFromUrl(url: string): string | null {
  if (!url.startsWith("magnet:")) return null;
  const match = url.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
  return match ? match[1].toLowerCase() : null;
}

function seasonEpisodeMatches(
  text: string,
  context: StreamRequestContext,
): boolean {
  if (context.type !== "series") return true;
  const { seasonNumber, episodeNumber } = context;
  if (!seasonNumber || !episodeNumber) return true;
  // A pack that covers the whole season is fine; an explicit different
  // S/E tag means this file is for a different episode.
  const explicit = text.match(/S(\d{1,2})E(\d{1,3})/i);
  if (!explicit) return true;
  return Number(explicit[1]) === seasonNumber && Number(explicit[2]) === episodeNumber;
}

export function normalizeAddonStream(
  providerId: StreamProviderId,
  providerPriority: number,
  raw: RawAddonStream,
  context: StreamRequestContext,
  index: number,
): NormalizedStream | null {
  if (!raw || (!raw.url && !raw.infoHash)) return null;
  const text = textOf(raw);
  const infoHash = raw.infoHash ? raw.infoHash.toLowerCase() : null;
  const magnetId = raw.url ? magnetIdFromUrl(raw.url) : null;
  const playbackUrl = raw.url && !raw.url.startsWith("magnet:") ? raw.url : null;

  const dedupeKey = infoHash || magnetId || playbackUrl || `${providerId}:${index}`;

  return {
    id: `${providerId}:${dedupeKey}:${index}`,
    providerId,
    providerPriority,
    label: (raw.name || raw.title || "Stream").split("\n")[0].slice(0, 60),
    playbackUrl,
    infoHash,
    magnetId,
    resolution: parseResolution(text),
    videoCodec: parseVideoCodec(text),
    audioCodec: parseAudioCodec(text),
    isHdr: parseHdr(text),
    isDolbyVision: parseDolbyVision(text),
    isCached: parseCached(text) || Boolean(playbackUrl),
    seeders: parseSeeders(text),
    sizeBytes: parseSizeBytes(text, raw.behaviorHints?.videoSize),
    languages: parseLanguages(text),
    matchesRequest: seasonEpisodeMatches(text, context) && !raw.behaviorHints?.notWebReady,
  };
}

/** The dedup key used by the resolver — infoHash > magnet id > normalized URL. */
export function dedupeKeyOf(stream: NormalizedStream): string {
  if (stream.infoHash) return `hash:${stream.infoHash}`;
  if (stream.magnetId) return `magnet:${stream.magnetId}`;
  if (stream.playbackUrl) {
    try {
      const url = new URL(stream.playbackUrl);
      return `url:${url.origin}${url.pathname}`;
    } catch {
      return `url:${stream.playbackUrl}`;
    }
  }
  return `raw:${stream.id}`;
}
