/**
 * Nexora – IPTV Data Orchestrator
 *
 * Defines the priority chain for IPTV channel data and applies
 * field-level merge rules so no valid data is ever overwritten by empty data.
 *
 * Priority chain (highest → lowest):
 *   1. User M3U playlist   – streamUrl, channelName, group (user's own source, always wins)
 *   2. iptv-org free lists – streamUrl fallback, channel metadata from community lists
 *   3. EPG (XMLTV)         – programme schedule, description (metadata enrichment only)
 *   4. Logo CDN            – channel logo (any valid source accepted, first valid wins)
 *
 * Field ownership contract:
 *   streamUrl / channelName / group         → user M3U wins; iptv-org only fills gaps
 *   programme / schedule / epgId            → EPG ONLY (never overwrites stream data)
 *   logo / tvgLogo                          → first valid image from any source
 *
 * Security note: stream URLs from iptv-org are community-sourced. Never auto-play
 * without user consent. Validate URLs server-side before exposing to clients.
 */

import { mergeWithFallback, mergeImageUrl, isValidValue } from "./mergeUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IptvChannel {
  /** Internal channel ID (tvg-id or slugified name) */
  id: string;
  channelName: string;
  /** Primary stream URL — always plays user's own stream when available */
  streamUrl: string | null;
  /** Channel group/category (e.g. "Sports", "News") */
  group?: string | null;
  /** Logo image URL */
  logo?: string | null;
  /** EPG ID for schedule lookups */
  epgId?: string | null;
  /** Source that provided this channel entry */
  source?: "user" | "iptv-org" | "merged";
}

export interface EpgProgramme {
  channelId: string;
  title: string;
  start: string;   // ISO-8601
  stop: string;    // ISO-8601
  description?: string | null;
  category?: string | null;
}

// ─── Channel merge ────────────────────────────────────────────────────────────

/**
 * Merge a user M3U channel entry with the corresponding iptv-org community entry.
 * User data ALWAYS wins for stream URL and channel name.
 *
 * @param userChannel   Channel from the user's own M3U playlist (highest priority)
 * @param communityFallback  Channel from iptv-org free lists (fills gaps only)
 */
export function mergeChannelData(
  userChannel: IptvChannel,
  communityFallback?: IptvChannel | null,
): IptvChannel {
  if (!communityFallback) return { ...userChannel, source: "user" };

  const { source: _s, ...fallback } = communityFallback;

  // Stream URL: user ALWAYS wins — even if null (user intentionally removed it)
  // We do NOT fall back to community stream URL when user channel is present.
  const merged = mergeWithFallback(
    { ...userChannel } as Record<string, unknown>,
    { ...fallback, streamUrl: undefined } as Record<string, unknown>, // strip community streamUrl
  ) as unknown as IptvChannel;

  // Logo: pick first valid image from either source
  merged.logo = mergeImageUrl(userChannel.logo, communityFallback.logo);
  merged.source = "merged";

  return merged;
}

/**
 * Merge a channel-only entry (no user playlist) from iptv-org with EPG metadata.
 * EPG data fills description/schedule but never overwrites channel identity fields.
 *
 * @param channel   Base channel (from iptv-org or merged user+community)
 * @param epgMeta   EPG metadata for this channel (logo, epgId, category)
 */
export function enrichChannelWithEpg(
  channel: IptvChannel,
  epgMeta?: Partial<{ logo: string; epgId: string; }> | null,
): IptvChannel {
  if (!epgMeta) return channel;

  const result = { ...channel };

  // EPG may provide a better logo URL
  result.logo = mergeImageUrl(channel.logo, epgMeta.logo ?? null);

  // EPG ID: fill only if missing
  if (!isValidValue(result.epgId) && isValidValue(epgMeta.epgId)) {
    result.epgId = epgMeta.epgId ?? null;
  }

  return result;
}

// ─── Channel list deduplication ───────────────────────────────────────────────

/**
 * Merge two channel lists (user + community), deduplicating by channel ID.
 * User channels take priority; community channels only fill gaps.
 *
 * @param userChannels       Channels from the user's M3U playlist
 * @param communityChannels  Channels from iptv-org (indexed by id)
 */
export function mergeChannelLists(
  userChannels: IptvChannel[],
  communityChannels: IptvChannel[],
): IptvChannel[] {
  const communityIndex = new Map<string, IptvChannel>(
    communityChannels.map(ch => [ch.id.toLowerCase(), ch]),
  );

  const merged: IptvChannel[] = userChannels.map(userCh => {
    const match = communityIndex.get(userCh.id.toLowerCase());
    const result = mergeChannelData(userCh, match ?? null);
    if (match) communityIndex.delete(userCh.id.toLowerCase());
    return result;
  });

  // Append community-only channels that have no user equivalent
  // These are exposed as supplemental content (not auto-played)
  for (const ch of communityIndex.values()) {
    merged.push({ ...ch, source: "iptv-org" as const });
  }

  return merged;
}
