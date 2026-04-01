import { Image } from "react-native";
import type { QueryClient } from "@tanstack/react-query";

import { CacheTTL, cacheGetStale, cachePeekStale, cacheSet } from "@/lib/services/cache-service";
import {
  getSportsByDate,
  getSportsLive,
  getMatchDetailRaw,
  sportKeys,
} from "../lib/services/sports-service";
import {
  getVodCatalogChunk,
  getVodCollections,
  getVodHomePayload,
  getVodStudios,
  mediaKeys,
  type VodHomePayload,
} from "@/lib/services/media-service";
import { apiRequestJson } from "@/lib/query-client";
import { createContinueWatching } from "@/lib/vod-curation";
import { enrichVodModuleItem } from "@/lib/vod-module";
import { logRealtimeEvent, measureRealtimeTask } from "@/services/realtime-telemetry";
import { getMatchdayYmd } from "@/lib/date/matchday";

type QueryKey = readonly unknown[];

type RealtimeQueryConfig<T> = {
  queryKey: QueryKey;
  cacheKey: string;
  label: string;
  ttlMs: number;
  staleTime: number;
  gcTime?: number;
  refetchInterval?: number | false | ((data: T | undefined) => number | false);
  enabled?: boolean;
  retry?: boolean | number | ((failureCount: number, error: unknown) => boolean);
  refetchOnReconnect?: boolean;
  refetchOnMount?: boolean;
  fetcher: () => Promise<T>;
  shouldPersist?: (data: T) => boolean;
  collectImageUrls?: (data: T) => string[];
};

type SportsPayload = {
  live?: any[];
  upcoming?: any[];
  finished?: any[];
};

type HighlightsPayload = {
  highlights?: any[];
};

type MediaSectionsPayload = {
  trendingMovies: any[];
  trendingSeries: any[];
  catalogPicks: any[];
};

export const realtimeCacheKeys = {
  homeSports: (date: string) => `home:sports:${date}`,
  homeHighlights: () => "home:sports:highlights",
  vodHome: () => "media:vod:home",
  vodCatalogRoot: () => "media:vod:catalog:root",
  vodCollections: () => "media:vod:collections",
  vodStudios: () => "media:vod:studios",
  mediaSections: () => "media:home:sections",
  matchDetail: (matchId: string, league: string) => `sports:match-detail:${matchId}:${league}`,
};

export const realtimePolicies = {
  sportsLive: { ttlMs: CacheTTL.LIVE_MATCH, staleTime: 8_000, refetchInterval: 8_000 },
  sportsSchedule: { ttlMs: CacheTTL.TODAY_SPORTS, staleTime: 45_000, refetchInterval: 45_000 },
  sportsHighlights: { ttlMs: CacheTTL.MATCH_DETAIL, staleTime: 60_000, refetchInterval: 60_000 },
  matchDetailLive: { ttlMs: CacheTTL.MATCH_DETAIL, staleTime: 8_000, refetchInterval: 8_000 },
  vodHome: { ttlMs: CacheTTL.HOME_RAILS, staleTime: 90_000, refetchInterval: 5 * 60_000 },
  vodCatalog: { ttlMs: CacheTTL.HOME_RAILS, staleTime: 15 * 60_000, refetchInterval: false as const },
  collections: { ttlMs: CacheTTL.HOME_RAILS, staleTime: 30 * 60_000, refetchInterval: 60 * 60_000 },
  mediaSections: { ttlMs: CacheTTL.HOME_RAILS, staleTime: 2 * 60_000, refetchInterval: 10 * 60_000 },
};

function serializeQueryKey(queryKey: QueryKey): string {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey.join(":"));
  }
}

function uniqueItemsByKey<T>(items: T[], getKey: (item: T, index: number) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = getKey(item, index);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function prefetchImages(urls: string[]) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean))).slice(0, 12);
  if (uniqueUrls.length === 0) return;
  void Promise.allSettled(uniqueUrls.map((url) => Image.prefetch(url))).then((results) => {
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    logRealtimeEvent("image", "prefetch-complete", {
      requested: uniqueUrls.length,
      successCount,
    });
  });
}

async function fetchWithPersistentCache<T>(config: RealtimeQueryConfig<T>): Promise<T> {
  const stale = await cacheGetStale<T>(config.cacheKey);
  if (stale != null) {
    logRealtimeEvent("cache", "stale-available", {
      label: config.label,
      cacheKey: config.cacheKey,
    });
  } else {
    logRealtimeEvent("cache", "miss", {
      label: config.label,
      cacheKey: config.cacheKey,
    });
  }

  try {
    const data = await measureRealtimeTask("fetch", config.label, config.fetcher, {
      cacheKey: config.cacheKey,
      queryKey: serializeQueryKey(config.queryKey),
    });
    if (config.shouldPersist?.(data) ?? true) {
      await cacheSet(config.cacheKey, data, config.ttlMs);
      logRealtimeEvent("cache", "write", {
        label: config.label,
        cacheKey: config.cacheKey,
        ttlMs: config.ttlMs,
      });
    }
    const imageUrls = config.collectImageUrls?.(data) || [];
    if (imageUrls.length > 0) prefetchImages(imageUrls);
    return data;
  } catch (error) {
    if (stale != null) {
      logRealtimeEvent("cache", "stale-used", {
        label: config.label,
        cacheKey: config.cacheKey,
        error: error instanceof Error ? error.message : String(error || "unknown"),
      });
      return stale;
    }
    throw error;
  }
}

export function buildRealtimeQueryOptions<T>(config: RealtimeQueryConfig<T>) {
  const interval = config.refetchInterval;
  return {
    queryKey: config.queryKey,
    placeholderData: () => {
      const cached = cachePeekStale<T>(config.cacheKey);
      if (cached != null) {
        logRealtimeEvent("cache", "memory-hit", {
          label: config.label,
          cacheKey: config.cacheKey,
        });
      }
      return cached ?? undefined;
    },
    queryFn: () => fetchWithPersistentCache(config),
    staleTime: config.staleTime,
    gcTime: config.gcTime,
    retry: config.retry ?? 1,
    enabled: config.enabled,
    refetchInterval: typeof interval === "function"
      ? (query: any) => interval(query?.state?.data as T | undefined)
      : interval,
    refetchIntervalInBackground: Boolean(interval),
    refetchOnReconnect: config.refetchOnReconnect ?? true,
    refetchOnMount: config.refetchOnMount ?? false,
  };
}

export function seedRealtimeQueryFromCache<T>(queryClient: QueryClient, queryKey: QueryKey, cacheKey: string) {
  const cached = cachePeekStale<T>(cacheKey);
  if (cached == null) return;
  queryClient.setQueryData(queryKey, cached);
  logRealtimeEvent("startup", "seed-query-from-cache", {
    cacheKey,
    queryKey: serializeQueryKey(queryKey),
  });
}

export async function prefetchRealtimeQuery<T>(queryClient: QueryClient, config: RealtimeQueryConfig<T>) {
  const data = await fetchWithPersistentCache(config);
  queryClient.setQueryData(config.queryKey, data);
}

export function buildHomeSportsPayload(payloads: Array<SportsPayload | null | undefined>): SportsPayload {
  const live = uniqueItemsByKey(
    payloads.flatMap((payload) => (Array.isArray(payload?.live) ? payload.live : [])),
    (item, index) => String(item?.id || `${item?.homeTeam || "home"}_${item?.awayTeam || "away"}_${item?.startDate || index}`),
  );
  const upcoming = uniqueItemsByKey(
    payloads.flatMap((payload) => (Array.isArray(payload?.upcoming) ? payload.upcoming : [])),
    (item, index) => String(item?.id || `${item?.homeTeam || "home"}_${item?.awayTeam || "away"}_${item?.startDate || index}`),
  );
  const finished = uniqueItemsByKey(
    payloads.flatMap((payload) => (Array.isArray(payload?.finished) ? payload.finished : [])),
    (item, index) => String(item?.id || `${item?.homeTeam || "home"}_${item?.awayTeam || "away"}_${item?.startDate || index}`),
  );
  return { live, upcoming, finished };
}

export async function fetchHomeSportsSnapshot(date: string): Promise<SportsPayload> {
  const [livePayload, todayPayload] = await Promise.all([
    getSportsLive().catch(() => null),
    getSportsByDate(date).catch(() => null),
  ]);
  return buildHomeSportsPayload([livePayload, todayPayload]);
}

export async function fetchHighlightsSnapshot(): Promise<any[]> {
  const payload = await apiRequestJson<HighlightsPayload>("/api/sports/highlights");
  return Array.isArray(payload?.highlights) ? payload.highlights : [];
}

export function deriveCuratedHomeMedia(vodHome: VodHomePayload | null | undefined) {
  const trendingMovies = Array.isArray(vodHome?.trendingMovies) ? vodHome.trendingMovies : [];
  const trendingSeries = Array.isArray(vodHome?.trendingSeries) ? vodHome.trendingSeries : [];
  const recentMovies = Array.isArray(vodHome?.recentMovies) ? vodHome.recentMovies : [];
  const recentSeries = Array.isArray(vodHome?.recentSeries) ? vodHome.recentSeries : [];
  return {
    movies: trendingMovies.slice(0, 18),
    series: trendingSeries.slice(0, 18),
    newReleases: [...recentMovies, ...recentSeries]
      .sort((left, right) => Number(right?.year || 0) - Number(left?.year || 0))
      .slice(0, 12),
  };
}

export async function fetchMediaSectionsSnapshot(): Promise<MediaSectionsPayload> {
  const [vodHome, catalogRoot] = await Promise.all([
    getVodHomePayload(),
    getVodCatalogChunk(null),
  ]);
  return {
    trendingMovies: vodHome.trendingMovies,
    trendingSeries: vodHome.trendingSeries,
    catalogPicks: (catalogRoot.items || []).slice(0, 24),
  };
}

export function buildContinueWatchingRows(
  history: any[],
  syncedContinueWatching: any[] | null | undefined,
  limit = 8,
) {
  const baseHistory = Array.isArray(syncedContinueWatching) && syncedContinueWatching.length > 0
    ? syncedContinueWatching
    : history;
  const movieRows = createContinueWatching(baseHistory as any, "movie", limit);
  const seriesRows = createContinueWatching(baseHistory as any, "series", limit);
  return [...movieRows, ...seriesRows]
    .slice(0, limit)
    .map((item: any) => enrichVodModuleItem({ ...item, type: item.season ? "series" : item.type || "movie" }));
}

export function collectVodArtwork(vodHome: VodHomePayload) {
  return (vodHome?.allItems || [])
    .flatMap((item) => [item.poster, item.backdrop])
    .filter((value): value is string => Boolean(value))
    .slice(0, 12);
}

export async function primeBootstrapRealtimeData(queryClient: QueryClient, today: string) {
  const configs = [
    {
      queryKey: sportKeys.live(),
      cacheKey: `sports:live:${today}`,
      label: "bootstrap-sports-live",
      ttlMs: realtimePolicies.sportsLive.ttlMs,
      staleTime: realtimePolicies.sportsLive.staleTime,
      fetcher: () => getSportsLive(),
      shouldPersist: () => true,
    },
    {
      queryKey: sportKeys.homeByDate(today),
      cacheKey: `sports:today:${today}`,
      label: "bootstrap-sports-schedule",
      ttlMs: realtimePolicies.sportsSchedule.ttlMs,
      staleTime: realtimePolicies.sportsSchedule.staleTime,
      fetcher: () => getSportsByDate(today),
      shouldPersist: () => true,
    },
    {
      queryKey: mediaKeys.vodHome(),
      cacheKey: realtimeCacheKeys.vodHome(),
      label: "bootstrap-vod-home",
      ttlMs: realtimePolicies.vodHome.ttlMs,
      staleTime: realtimePolicies.vodHome.staleTime,
      fetcher: () => getVodHomePayload(),
      collectImageUrls: collectVodArtwork,
    },
    {
      queryKey: mediaKeys.vodCollections(),
      cacheKey: realtimeCacheKeys.vodCollections(),
      label: "bootstrap-vod-collections",
      ttlMs: realtimePolicies.collections.ttlMs,
      staleTime: realtimePolicies.collections.staleTime,
      fetcher: () => getVodCollections(),
      collectImageUrls: (collections) => collections.flatMap((entry: any) => [entry.poster || null, entry.backdrop || null]).filter(Boolean) as string[],
    },
  ] satisfies RealtimeQueryConfig<any>[];

  for (const config of configs) {
    seedRealtimeQueryFromCache(queryClient, config.queryKey, config.cacheKey);
  }

  await Promise.allSettled(configs.map((config) => prefetchRealtimeQuery(queryClient, config as RealtimeQueryConfig<any>)));
}

export function buildHomeSportsQuery(date: string, enabled: boolean) {
  return buildRealtimeQueryOptions<SportsPayload>({
    queryKey: ["home", "sports-curated", date],
    cacheKey: realtimeCacheKeys.homeSports(date),
    label: "home-sports",
    ttlMs: realtimePolicies.sportsSchedule.ttlMs,
    staleTime: realtimePolicies.sportsLive.staleTime,
    refetchInterval: realtimePolicies.sportsLive.refetchInterval,
    enabled,
    fetcher: () => fetchHomeSportsSnapshot(date),
    shouldPersist: (data) => (data.live?.length || 0) > 0 || (data.upcoming?.length || 0) > 0 || (data.finished?.length || 0) > 0,
  });
}

export function buildHighlightsQuery(enabled: boolean) {
  return buildRealtimeQueryOptions<any[]>({
    queryKey: ["home", "sports-highlights"],
    cacheKey: realtimeCacheKeys.homeHighlights(),
    label: "sports-highlights",
    ttlMs: realtimePolicies.sportsHighlights.ttlMs,
    staleTime: realtimePolicies.sportsHighlights.staleTime,
    refetchInterval: realtimePolicies.sportsHighlights.refetchInterval,
    enabled,
    fetcher: fetchHighlightsSnapshot,
    shouldPersist: () => true,
  });
}

export function buildVodHomeQuery(enabled: boolean) {
  return buildRealtimeQueryOptions<VodHomePayload>({
    queryKey: mediaKeys.vodHome(),
    cacheKey: realtimeCacheKeys.vodHome(),
    label: "vod-home",
    ttlMs: realtimePolicies.vodHome.ttlMs,
    staleTime: realtimePolicies.vodHome.staleTime,
    refetchInterval: realtimePolicies.vodHome.refetchInterval,
    enabled,
    fetcher: getVodHomePayload,
    shouldPersist: (data) => Array.isArray(data?.allItems) && data.allItems.length > 0,
    collectImageUrls: collectVodArtwork,
  });
}

export function buildVodCatalogRootQuery(enabled: boolean) {
  return buildRealtimeQueryOptions<Awaited<ReturnType<typeof getVodCatalogChunk>>>({
    queryKey: mediaKeys.vodCatalog(null),
    cacheKey: realtimeCacheKeys.vodCatalogRoot(),
    label: "vod-catalog-root",
    ttlMs: realtimePolicies.vodCatalog.ttlMs,
    staleTime: realtimePolicies.vodCatalog.staleTime,
    refetchInterval: realtimePolicies.vodCatalog.refetchInterval,
    enabled,
    fetcher: () => getVodCatalogChunk(null),
    shouldPersist: (data) => Array.isArray(data?.items) && data.items.length > 0,
    collectImageUrls: (data) => (data.items || []).flatMap((item) => [item.poster, item.backdrop]).filter(Boolean) as string[],
  });
}

export function buildVodCollectionsQuery(enabled: boolean) {
  return buildRealtimeQueryOptions<Awaited<ReturnType<typeof getVodCollections>>>({
    queryKey: mediaKeys.vodCollections(),
    cacheKey: realtimeCacheKeys.vodCollections(),
    label: "vod-collections",
    ttlMs: realtimePolicies.collections.ttlMs,
    staleTime: realtimePolicies.collections.staleTime,
    refetchInterval: realtimePolicies.collections.refetchInterval,
    enabled,
    fetcher: getVodCollections,
    shouldPersist: (data) => Array.isArray(data) && data.length > 0,
    collectImageUrls: (collections) => collections.flatMap((entry) => [entry.poster || null, entry.backdrop || null]).filter(Boolean) as string[],
  });
}

export function buildVodStudiosQuery(enabled: boolean) {
  return buildRealtimeQueryOptions<Awaited<ReturnType<typeof getVodStudios>>>({
    queryKey: mediaKeys.vodStudios(),
    cacheKey: realtimeCacheKeys.vodStudios(),
    label: "vod-studios",
    ttlMs: realtimePolicies.collections.ttlMs,
    staleTime: realtimePolicies.collections.staleTime,
    refetchInterval: realtimePolicies.collections.refetchInterval,
    enabled,
    fetcher: getVodStudios,
    shouldPersist: (data) => Array.isArray(data) && data.length > 0,
  });
}

export function buildMediaSectionsQuery() {
  return buildRealtimeQueryOptions<MediaSectionsPayload>({
    queryKey: ["home", "media-sections"],
    cacheKey: realtimeCacheKeys.mediaSections(),
    label: "home-media-sections",
    ttlMs: realtimePolicies.mediaSections.ttlMs,
    staleTime: realtimePolicies.mediaSections.staleTime,
    refetchInterval: realtimePolicies.mediaSections.refetchInterval,
    enabled: true,
    fetcher: fetchMediaSectionsSnapshot,
    collectImageUrls: (data) => [
      ...data.trendingMovies.flatMap((item) => [item.poster, item.backdrop]),
      ...data.trendingSeries.flatMap((item) => [item.poster, item.backdrop]),
      ...data.catalogPicks.flatMap((item) => [item.poster, item.backdrop]),
    ].filter(Boolean) as string[],
  });
}

export function buildSportLiveQuery(enabled: boolean) {
  return buildRealtimeQueryOptions<Awaited<ReturnType<typeof getSportsLive>>>({
    queryKey: sportKeys.live(),
    cacheKey: `sports:live:${getMatchdayYmd()}`,
    label: "sports-live",
    ttlMs: realtimePolicies.sportsLive.ttlMs,
    staleTime: realtimePolicies.sportsLive.staleTime,
    refetchInterval: realtimePolicies.sportsLive.refetchInterval,
    enabled,
    fetcher: getSportsLive,
    shouldPersist: (data) => (data?.live?.length || 0) + (data?.upcoming?.length || 0) + (data?.finished?.length || 0) > 0,
  });
}

export function buildSportScheduleQuery(date: string, enabled: boolean) {
  return buildRealtimeQueryOptions<Awaited<ReturnType<typeof getSportsByDate>>>({
    queryKey: sportKeys.homeByDate(date),
    cacheKey: `sports:today:${date}`,
    label: "sports-schedule",
    ttlMs: realtimePolicies.sportsSchedule.ttlMs,
    staleTime: realtimePolicies.sportsSchedule.staleTime,
    refetchInterval: realtimePolicies.sportsSchedule.refetchInterval,
    enabled,
    fetcher: () => getSportsByDate(date),
    shouldPersist: (data) => (data?.live?.length || 0) + (data?.upcoming?.length || 0) + (data?.finished?.length || 0) > 0,
  });
}

export async function fetchFollowedMatchSnapshot(matchId: string, espnLeague: string) {
  return await getMatchDetailRaw({ matchId, league: espnLeague });
}