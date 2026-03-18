/**
 * NEXORA EPG (Electronic Program Guide) MANAGER
 *
 * Fetches and caches XMLTV EPG data for live TV channels.
 * Provides current/next programme info for channel cards.
 */

import { apiRequest } from "./query-client";

export interface EPGProgramme {
  channel: string;
  channelName: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  start: string;
  stop: string;
}

export interface EPGData {
  channels: Record<string, string>;
  programmes: EPGProgramme[];
}

// Client-side EPG cache
let cachedEpg: { data: EPGData; ts: number; url: string } | null = null;
const EPG_CLIENT_TTL = 30 * 60 * 1000; // 30 min client-side

/**
 * Fetch EPG data from server (which caches the XMLTV parsing)
 */
export async function fetchEPG(epgUrl: string): Promise<EPGData | null> {
  if (!epgUrl) return null;

  // Client cache
  if (cachedEpg && cachedEpg.url === epgUrl && Date.now() - cachedEpg.ts < EPG_CLIENT_TTL) {
    return cachedEpg.data;
  }

  try {
    const res = await apiRequest("GET", `/api/epg?url=${encodeURIComponent(epgUrl)}`);
    const data = await res.json();
    if (data.programmes) {
      cachedEpg = { data, ts: Date.now(), url: epgUrl };
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get current & next programme for a channel
 */
export function getCurrentProgramme(
  epgData: EPGData | null,
  channelId: string
): { now: EPGProgramme | null; next: EPGProgramme | null } {
  if (!epgData || !channelId) return { now: null, next: null };

  const now = new Date().toISOString();
  const progs = epgData.programmes
    .filter(p => p.channel === channelId)
    .sort((a, b) => a.start.localeCompare(b.start));

  const current = progs.find(p => p.start <= now && p.stop > now) || null;
  const next = progs.find(p => p.start > now) || null;

  return { now: current, next };
}

/**
 * Get programme schedule for a channel (today)
 */
export function getChannelSchedule(
  epgData: EPGData | null,
  channelId: string
): EPGProgramme[] {
  if (!epgData || !channelId) return [];

  const today = new Date().toISOString().slice(0, 10);
  return epgData.programmes
    .filter(p => p.channel === channelId && p.start.startsWith(today))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Clear EPG cache (e.g., when switching playlists)
 */
export function clearEPGCache(): void {
  cachedEpg = null;
}
