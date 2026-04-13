/**
 * Nexora — Live TV Channel Catalogue (Belgian + International)
 *
 * Provides real Belgian broadcast channel metadata and live program data
 * fetched from the EPG.pw open guide API (https://epg.pw).
 *
 * Each channel carries:
 *  - Static metadata (id, name, logo URL, category)
 *  - Dynamic currentProgram / nextProgram fetched from EPG.pw
 *
 * Usage:
 *   import { getLiveChannels } from "@/lib/live-channels";
 *   const channels = await getLiveChannels();   // fetches + returns LiveChannel[]
 *
 * React Query hook:
 *   import { useLiveChannels } from "@/lib/live-channels";
 */

import { useQuery } from "@tanstack/react-query";
import type { LiveChannel, LiveProgram, LiveCategory } from "@/types/streaming";

// ── Channel metadata ──────────────────────────────────────────────────────────

interface ChannelMeta {
  id: string;
  name: string;
  /** EPG.pw channel id used to fetch program data */
  epgId: string;
  /** Absolute logo URL — hosted by the broadcasters' own CDN */
  logo: string | null;
  category: LiveCategory;
  isHD: boolean;
  isPremium?: boolean;
  sortOrder: number;
}

/**
 * Belgian broadcast and streaming channels.
 * Logo URLs use publicly available channel assets.
 * EPG channel IDs follow the EPG.pw naming convention.
 */
const CHANNEL_META: ChannelMeta[] = [
  {
    id: "vtm",
    name: "VTM",
    epgId: "VTM.be",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/VTM_logo_2019.svg/240px-VTM_logo_2019.svg.png",
    category: "entertainment",
    isHD: true,
    sortOrder: 1,
  },
  {
    id: "vtm2",
    name: "VTM 2",
    epgId: "VTM2.be",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/VTM2_logo.svg/240px-VTM2_logo.svg.png",
    category: "entertainment",
    isHD: true,
    sortOrder: 2,
  },
  {
    id: "vtm4",
    name: "VTM 4",
    epgId: "VTM4.be",
    logo: null,
    category: "entertainment",
    isHD: true,
    sortOrder: 3,
  },
  {
    id: "play4",
    name: "Play4",
    epgId: "Play4.be",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Play4_logo.svg/240px-Play4_logo.svg.png",
    category: "entertainment",
    isHD: true,
    sortOrder: 4,
  },
  {
    id: "play5",
    name: "Play5",
    epgId: "Play5.be",
    logo: null,
    category: "lifestyle",
    isHD: true,
    sortOrder: 5,
  },
  {
    id: "een",
    name: "Eén",
    epgId: "Een.be",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/EenTV.svg/240px-EenTV.svg.png",
    category: "entertainment",
    isHD: true,
    sortOrder: 6,
  },
  {
    id: "canvas",
    name: "Canvas",
    epgId: "Canvas.be",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Canvas_logo.svg/240px-Canvas_logo.svg.png",
    category: "documentary",
    isHD: true,
    sortOrder: 7,
  },
  {
    id: "ketnet",
    name: "Ketnet",
    epgId: "Ketnet.be",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Ketnet_logo.svg/240px-Ketnet_logo.svg.png",
    category: "kids",
    isHD: true,
    sortOrder: 8,
  },
  {
    id: "sporza",
    name: "Sporza",
    epgId: "Sporza.be",
    logo: null,
    category: "entertainment",
    isHD: true,
    sortOrder: 9,
  },
  {
    id: "bvn",
    name: "BVN",
    epgId: "BVN.nl",
    logo: null,
    category: "entertainment",
    isHD: false,
    sortOrder: 10,
  },
];

// ── EPG.pw API ────────────────────────────────────────────────────────────────

interface EpgEntry {
  title: string;
  description?: string;
  start: string; // ISO datetime
  stop: string; // ISO datetime
  channel: string;
}

async function fetchEpgForChannel(epgId: string): Promise<EpgEntry[]> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://epg.pw/api/epg.json?channel_id=${encodeURIComponent(epgId)}&date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function findCurrent(entries: EpgEntry[]): EpgEntry | null {
  const now = Date.now();
  return (
    entries.find((e) => {
      const start = new Date(e.start).getTime();
      const stop = new Date(e.stop).getTime();
      return start <= now && now < stop;
    }) ?? null
  );
}

function findNext(
  entries: EpgEntry[],
  current: EpgEntry | null,
): EpgEntry | null {
  if (!current) return entries[0] ?? null;
  const idx = entries.indexOf(current);
  return idx >= 0 ? (entries[idx + 1] ?? null) : null;
}

function epgEntryToProgram(entry: EpgEntry, idSuffix: string): LiveProgram {
  return {
    id: `epg_${idSuffix}_${entry.start}`,
    title: entry.title,
    description: entry.description,
    startTime: entry.start,
    endTime: entry.stop,
  };
}

// ── Main data fetch ───────────────────────────────────────────────────────────

async function fetchSingleChannel(meta: ChannelMeta): Promise<LiveChannel> {
  try {
    const entries = await fetchEpgForChannel(meta.epgId);
    const current = findCurrent(entries);
    const next = findNext(entries, current);
    return {
      id: meta.id,
      name: meta.name,
      logo: meta.logo,
      category: meta.category,
      isHD: meta.isHD,
      isPremium: meta.isPremium,
      sortOrder: meta.sortOrder,
      currentProgram: current ? epgEntryToProgram(current, meta.id) : null,
      nextProgram: next ? epgEntryToProgram(next, `${meta.id}_next`) : null,
    };
  } catch {
    // EPG fetch failed — return channel without program info
    return {
      id: meta.id,
      name: meta.name,
      logo: meta.logo,
      category: meta.category,
      isHD: meta.isHD,
      isPremium: meta.isPremium,
      sortOrder: meta.sortOrder,
      currentProgram: null,
      nextProgram: null,
    };
  }
}

/** Fetch all channels with live EPG data. Fetches concurrently; individual failures are silenced. */
export async function getLiveChannels(): Promise<LiveChannel[]> {
  const results = await Promise.allSettled(
    CHANNEL_META.map(fetchSingleChannel),
  );
  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((ch): ch is LiveChannel => ch !== null)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
}

// ── React Query hook ──────────────────────────────────────────────────────────

const STALE_3MIN = 3 * 60 * 1000;

/** Live channels with real-time EPG program data. Refreshes every 3 minutes. */
export function useLiveChannels() {
  return useQuery<LiveChannel[]>({
    queryKey: ["live-channels"],
    queryFn: getLiveChannels,
    staleTime: STALE_3MIN,
    refetchInterval: STALE_3MIN,
  });
}
