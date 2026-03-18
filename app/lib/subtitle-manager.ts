/**
 * NEXORA SUBTITLE MANAGER
 *
 * Multi-language subtitle support:
 * - English, Dutch, French, Spanish, German, Arabic, Portuguese, Italian
 * - SRT and VTT formats
 * - External subtitle loading
 * - Server-side subtitle proxy
 */

import { apiRequest, getApiUrl } from "./query-client";

export interface SubtitleTrack {
  id: string;
  language: string;
  languageLabel: string;
  format: "srt" | "vtt";
  downloadUrl: string;
  rating: number;
  hearingImpaired: boolean;
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

function getLanguageLabel(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang?.label || code.toUpperCase();
}

/**
 * Fetch available subtitles for a TMDB item
 */
export async function fetchSubtitles(
  tmdbId: number | string,
  options?: { lang?: string; type?: "movie" | "series"; season?: number; episode?: number }
): Promise<SubtitleTrack[]> {
  try {
    const params = new URLSearchParams();
    if (options?.lang) params.set("lang", options.lang);
    if (options?.type) params.set("type", options.type);
    if (options?.season) params.set("season", String(options.season));
    if (options?.episode) params.set("episode", String(options.episode));

    const res = await apiRequest("GET", `/api/subtitles/${tmdbId}?${params}`);
    const data = await res.json();

    return (data.subtitles || []).map((s: any) => ({
      id: String(s.id),
      language: s.language || "en",
      languageLabel: getLanguageLabel(s.language || "en"),
      format: s.format || "srt",
      downloadUrl: s.downloadUrl ? `${getApiUrl()}${s.downloadUrl}` : "",
      rating: s.rating || 0,
      hearingImpaired: s.hearing_impaired || false,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch subtitles for all supported languages
 */
export async function fetchMultiLanguageSubtitles(
  tmdbId: number | string,
  type?: "movie" | "series",
  season?: number,
  episode?: number,
): Promise<Record<string, SubtitleTrack[]>> {
  const result: Record<string, SubtitleTrack[]> = {};

  // Fetch all languages in parallel
  const promises = SUPPORTED_LANGUAGES.map(async (lang) => {
    const subs = await fetchSubtitles(tmdbId, { lang: lang.code, type, season, episode });
    return { code: lang.code, subs };
  });

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.subs.length > 0) {
      result[r.value.code] = r.value.subs;
    }
  }

  return result;
}

/**
 * Convert SRT content to VTT format
 */
export function srtToVtt(srt: string): string {
  if (srt.trim().startsWith("WEBVTT")) return srt;
  const converted = srt
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/^\d+\s*$/gm, "");
  return "WEBVTT\n\n" + converted.trim();
}

/**
 * Get best subtitle track for a language from available tracks
 */
export function getBestTrack(tracks: SubtitleTrack[], preferredLang: string): SubtitleTrack | null {
  const langTracks = tracks.filter(t => t.language === preferredLang);
  if (langTracks.length === 0) return null;
  // Prefer non-hearing-impaired, then highest rated
  const sorted = langTracks.sort((a, b) => {
    if (a.hearingImpaired !== b.hearingImpaired) return a.hearingImpaired ? 1 : -1;
    return b.rating - a.rating;
  });
  return sorted[0];
}
