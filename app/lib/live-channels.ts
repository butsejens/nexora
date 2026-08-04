/**
 * Live TV — channel discovery via server /api/iptv/discover (iptv-org)
 * and optional custom M3U via /api/playlist/parse.
 *
 * Only live entries with a direct stream URL are returned.
 * Playback goes through /player with native HLS (no embed ads).
 */

import { useQuery } from "@tanstack/react-query";

import { apiRequestJson } from "@/lib/query-client";
import type { LiveCategory, LiveChannel } from "@/types/streaming";

export type LiveCountry = {
  id: string;
  label: string;
  flag: string;
};

export type LiveSourceMeta = {
  id: string;
  label: string;
  flag?: string;
  icon?: string;
  type: "country" | "category";
};

export type LiveChannelRow = LiveChannel & {
  country?: string;
  countryLabel?: string;
  countryFlag?: string;
};

type DiscoverEntry = {
  id?: string;
  name?: string;
  title?: string;
  url?: string;
  logo?: string | null;
  poster?: string | null;
  group?: string;
  tvgId?: string | null;
  epgId?: string | null;
  category?: string;
  country?: string;
  countryLabel?: string;
  countryFlag?: string;
};

type DiscoverResponse = {
  live?: DiscoverEntry[];
  source?: string;
  meta?: { label?: string; flag?: string; icon?: string };
};

type SourcesResponse = {
  countries?: LiveSourceMeta[];
  categories?: LiveSourceMeta[];
};

const DEFAULT_COUNTRIES: LiveCountry[] = [
  { id: "all", label: "Alle landen", flag: "🌍" },
  { id: "be", label: "België", flag: "🇧🇪" },
  { id: "nl", label: "Nederland", flag: "🇳🇱" },
  { id: "de", label: "Duitsland", flag: "🇩🇪" },
  { id: "fr", label: "Frankrijk", flag: "🇫🇷" },
  { id: "gb", label: "UK", flag: "🇬🇧" },
  { id: "es", label: "Spanje", flag: "🇪🇸" },
  { id: "pt", label: "Portugal", flag: "🇵🇹" },
  { id: "it", label: "Italië", flag: "🇮🇹" },
  { id: "us", label: "USA", flag: "🇺🇸" },
  { id: "ca", label: "Canada", flag: "🇨🇦" },
  { id: "tr", label: "Turkije", flag: "🇹🇷" },
  { id: "pl", label: "Polen", flag: "🇵🇱" },
  { id: "ro", label: "Roemenië", flag: "🇷🇴" },
  { id: "ch", label: "Zwitserland", flag: "🇨🇭" },
  { id: "at", label: "Oostenrijk", flag: "🇦🇹" },
  { id: "se", label: "Zweden", flag: "🇸🇪" },
  { id: "no", label: "Noorwegen", flag: "🇳🇴" },
  { id: "dk", label: "Denemarken", flag: "🇩🇰" },
  { id: "ie", label: "Ierland", flag: "🇮🇪" },
  { id: "ar", label: "Arabisch", flag: "🌍" },
];

const CATEGORY_CHIPS: LiveSourceMeta[] = [
  { id: "news", label: "Nieuws", icon: "📰", type: "category" },
  { id: "sports", label: "Sport", icon: "🏆", type: "category" },
  { id: "kids", label: "Kids", icon: "🧒", type: "category" },
  { id: "documentary", label: "Docu", icon: "🎬", type: "category" },
  { id: "entertainment", label: "Entertainment", icon: "🎭", type: "category" },
  { id: "music", label: "Muziek", icon: "🎵", type: "category" },
];

function mapCategory(raw: string | undefined): LiveCategory {
  const v = String(raw || "").toLowerCase();
  if (v.includes("news") || v.includes("nieuws")) return "news";
  if (v.includes("sport")) return "sports";
  if (v.includes("kid") || v.includes("child") || v.includes("cartoon"))
    return "kids";
  if (v.includes("docu")) return "documentary";
  if (v.includes("music") || v.includes("muziek")) return "music";
  if (v.includes("lifestyle") || v.includes("cook") || v.includes("travel"))
    return "lifestyle";
  return "entertainment";
}

function isPlayableStreamUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  // Prefer native player formats; skip known embed/ad shells
  if (/\.(m3u8|mp4)(\?|$)/i.test(u)) return true;
  if (u.includes(".m3u8") || u.includes("/live/") || u.includes("playlist"))
    return true;
  // Many iptv-org entries are raw TS/HLS without extension — still try HTTPS
  if (u.startsWith("https://")) return true;
  return false;
}

function toLiveChannel(entry: DiscoverEntry, index: number): LiveChannelRow | null {
  const streamUrl = String(entry.url || "").trim();
  if (!isPlayableStreamUrl(streamUrl)) return null;

  const name = String(entry.name || entry.title || "").trim();
  if (!name) return null;

  const idBase =
    String(entry.tvgId || entry.epgId || entry.id || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `ch-${index}`;

  return {
    id: `live-${idBase}-${index}`,
    name,
    logo: entry.logo || entry.poster || null,
    category: mapCategory(entry.group || entry.category),
    streamUrl,
    isHD: /hd|fhd|4k|uhd/i.test(name),
    sortOrder: index,
    currentProgram: null,
    nextProgram: null,
    country: entry.country || undefined,
    countryLabel: entry.countryLabel || undefined,
    countryFlag: entry.countryFlag || undefined,
  };
}

function dedupeChannels(channels: LiveChannelRow[]): LiveChannelRow[] {
  const seen = new Set<string>();
  const out: LiveChannelRow[] = [];
  for (const ch of channels) {
    const key = `${ch.name.toLowerCase()}::${String(ch.streamUrl || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
  }
  return out;
}

/** Country chips for the Live TV screen */
export function getDefaultLiveCountries(): LiveCountry[] {
  return DEFAULT_COUNTRIES;
}

/** Category chips */
export function getLiveCategoryChips(): LiveSourceMeta[] {
  return CATEGORY_CHIPS;
}

export async function fetchLiveDiscoverSources(): Promise<{
  countries: LiveSourceMeta[];
  categories: LiveSourceMeta[];
}> {
  try {
    const data = await apiRequestJson<SourcesResponse>(
      "/api/iptv/discover/sources",
    );
    return {
      countries:
        Array.isArray(data.countries) && data.countries.length
          ? data.countries
          : DEFAULT_COUNTRIES.map((c) => ({ ...c, type: "country" as const })),
      categories:
        Array.isArray(data.categories) && data.categories.length
          ? data.categories
          : CATEGORY_CHIPS,
    };
  } catch {
    return {
      countries: DEFAULT_COUNTRIES.map((c) => ({
        ...c,
        type: "country" as const,
      })),
      categories: CATEGORY_CHIPS,
    };
  }
}

/**
 * Discover live channels by country (ISO) or category.
 * Uses server-side iptv-org M3U fetch — only `live` bucket is kept.
 */
export async function discoverLiveChannels(params: {
  country?: string;
  category?: string;
}): Promise<LiveChannelRow[]> {
  const country = String(params.country || "")
    .toLowerCase()
    .trim();
  const category = String(params.category || "")
    .toLowerCase()
    .trim();

  if (!country && !category) {
    throw new Error("country of category is verplicht");
  }

  const qs = country
    ? `country=${encodeURIComponent(country)}`
    : `category=${encodeURIComponent(category)}`;

  const data = await apiRequestJson<DiscoverResponse>(
    `/api/iptv/discover?${qs}`,
  );

  const live = Array.isArray(data.live) ? data.live : [];
  const mapped = live
    .map((entry, i) => toLiveChannel(entry, i))
    .filter((ch): ch is LiveChannelRow => ch !== null);

  return dedupeChannels(mapped).sort((a, b) =>
    a.name.localeCompare(b.name, "nl", { sensitivity: "base" }),
  );
}

/**
 * Optional: load live-only channels from a custom M3U URL
 * (user-supplied playlist). Server parses and classifies.
 */
export async function parseLivePlaylist(url: string): Promise<LiveChannelRow[]> {
  const playlistUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(playlistUrl)) {
    throw new Error("Ongeldige playlist URL");
  }

  const data = await apiRequestJson<{ live?: DiscoverEntry[] }>(
    "/api/playlist/parse",
    { method: "POST", data: { url: playlistUrl } },
  );

  const live = Array.isArray(data.live) ? data.live : [];
  const mapped = live
    .map((entry, i) => toLiveChannel(entry, i))
    .filter((ch): ch is LiveChannelRow => ch !== null);

  return dedupeChannels(mapped);
}

const STALE_10MIN = 10 * 60 * 1000;

export function useLiveDiscoverSources() {
  return useQuery({
    queryKey: ["live-discover-sources"],
    queryFn: fetchLiveDiscoverSources,
    staleTime: 60 * 60 * 1000,
  });
}

export function useDiscoverLiveChannels(params: {
  country?: string;
  category?: string;
  enabled?: boolean;
}) {
  const country = params.country || "";
  const category = params.category || "";
  const enabled = params.enabled !== false && Boolean(country || category);

  return useQuery<LiveChannelRow[]>({
    queryKey: ["live-discover", country || null, category || null],
    queryFn: () => discoverLiveChannels({ country, category }),
    enabled,
    staleTime: STALE_10MIN,
  });
}

/** @deprecated Prefer useDiscoverLiveChannels — kept for callers expecting EPG-only meta */
export async function getLiveChannels(): Promise<LiveChannelRow[]> {
  return discoverLiveChannels({ country: "be" });
}

export function useLiveChannels() {
  return useDiscoverLiveChannels({ country: "be" });
}
