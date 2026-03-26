import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { SafeHaptics } from "@/lib/safeHaptics";
import { buildMoodRecommendations, createContinueWatching } from "@/lib/vod-curation";
import {
  buildCategoryRails,
  buildCollectionGroups,
  buildStudioGroups,
  enrichVodModuleItem,
  filterBySearchFilter,
  pickFeaturedItem,
  type VodCollectionGroup,
  type VodModuleItem,
  type VodModulePane,
  type VodSearchFilter,
  type VodStudioGroup,
} from "@/lib/vod-module";
import { withTimeout } from "@/lib/utils";

type VodModuleHubProps = {
  initialPane?: VodModulePane;
  initialFilter?: VodSearchFilter;
};

type HomePayload = {
  featured: VodModuleItem | null;
  trendingMovies: VodModuleItem[];
  trendingSeries: VodModuleItem[];
  recentMovies: VodModuleItem[];
  recentSeries: VodModuleItem[];
  topRatedMovies: VodModuleItem[];
  topRatedSeries: VodModuleItem[];
  allItems: VodModuleItem[];
};

type CatalogPayload = {
  items: VodModuleItem[];
  meta?: {
    nextCursorYear?: number | null;
    hasMore?: boolean;
  };
};

type CuratedCollectionPayload = {
  id: string;
  name: string;
  itemCount: number;
  items: VodModuleItem[];
  poster?: string | null;
  backdrop?: string | null;
};

type CuratedStudioPayload = {
  id: string;
  name: string;
  logo?: string | null;
  itemCount: number;
  items: VodModuleItem[];
};

const SEARCH_FILTERS: { key: VodSearchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "TV Shows" },
  { key: "anime", label: "Anime" },
];

async function fetchJson(path: string) {
  const response = await withTimeout(apiRequest("GET", path), 15000);
  return response.json();
}

async function fetchDetail(type: "movie" | "series", id: string | number) {
  const path = type === "movie" ? `/api/movies/${id}/full` : `/api/series/${id}/full`;
  const data = await fetchJson(path);
  return data?.error ? null : data;
}

function dedupeModuleItems(items: VodModuleItem[]): VodModuleItem[] {
  const seen = new Set<string>();
  const output: VodModuleItem[] = [];
  for (const item of items) {
    const tmdbId = String(item.tmdbId || item.id || "").trim();
    const title = String(item.title || "").trim().toLowerCase();
    const key = tmdbId ? `${item.type}:${tmdbId}` : `${item.type}:${title}:${String(item.year || "")}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function normalizeTitle(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function fetchHomePayload(): Promise<HomePayload> {
  const [movieData, seriesData] = await Promise.all([
    fetchJson("/api/movies/trending"),
    fetchJson("/api/series/trending"),
  ]);

  const movieSeeds = [
    ...(movieData?.trending || []).slice(0, 14).map((item: any) => ({ ...item, isTrending: true })),
    ...(movieData?.popular || []).slice(0, 14),
    ...(movieData?.newReleases || []).slice(0, 14).map((item: any) => ({ ...item, isNew: true })),
    ...(movieData?.topRated || []).slice(0, 14),
  ];

  const seriesSeeds = [
    ...(seriesData?.trending || []).slice(0, 14).map((item: any) => ({ ...item, isTrending: true })),
    ...(seriesData?.popular || []).slice(0, 14),
    ...(seriesData?.newReleases || []).slice(0, 14).map((item: any) => ({ ...item, isNew: true })),
    ...(seriesData?.topRated || []).slice(0, 14),
  ];

  const enrichedMovies = dedupeModuleItems(
    movieSeeds.map((item: any) => enrichVodModuleItem({ ...item, type: "movie" }))
  )
    .filter((item) => item.title);

  const enrichedSeries = dedupeModuleItems(
    seriesSeeds.map((item: any) => enrichVodModuleItem({ ...item, type: "series" }))
  )
    .filter((item) => item.title);

  const allItems = dedupeModuleItems([...enrichedMovies, ...enrichedSeries]);
  return {
    featured: pickFeaturedItem(allItems),
    trendingMovies: enrichedMovies.filter((item) => item.isTrending).slice(0, 16),
    trendingSeries: enrichedSeries.filter((item) => item.isTrending).slice(0, 16),
    recentMovies: enrichedMovies.filter((item) => item.isNew).slice(0, 16),
    recentSeries: enrichedSeries.filter((item) => item.isNew).slice(0, 16),
    topRatedMovies: [...enrichedMovies].sort((a, b) => Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0)).slice(0, 16),
    topRatedSeries: [...enrichedSeries].sort((a, b) => Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0)).slice(0, 16),
    allItems,
  };
}

async function fetchCatalogChunk(cursorYear?: number | null): Promise<CatalogPayload> {
  const params = new URLSearchParams({
    type: "all",
    years: "30",
    chunkYears: "6",
    pagesPerYear: "2",
  });
  if (cursorYear) params.set("cursorYear", String(cursorYear));
  const payload = await fetchJson(`/api/vod/catalog?${params.toString()}`);
  return {
    items: dedupeModuleItems(((payload?.items || []) as any[]).map((item) => enrichVodModuleItem(item))),
    meta: payload?.meta,
  };
}

async function fetchCuratedCollections(): Promise<CuratedCollectionPayload[]> {
  const collectionTargets = ["Star Wars", "Harry Potter", "Marvel", "The Lord of the Rings"];
  const results = await Promise.all(
    collectionTargets.map(async (target) => {
      const payload = await fetchJson(`/api/vod/collection?title=${encodeURIComponent(target)}&depth=5`).catch(() => null);
      const items = dedupeModuleItems(((payload?.items || []) as any[]).map((item) => enrichVodModuleItem(item))).slice(0, 40);
      return {
        id: String(payload?.collection?.id || target).toLowerCase(),
        name: String(payload?.collection?.name || `${target} Collection`),
        itemCount: Number(payload?.stats?.total || items.length || 0),
        items,
        poster: payload?.collection?.poster || null,
        backdrop: payload?.collection?.backdrop || null,
      };
    })
  );
  return results.filter((item) => item.itemCount > 2);
}

async function fetchCuratedStudios(): Promise<CuratedStudioPayload[]> {
  const studioTargets = [
    { id: "420", name: "Marvel Studios" },
    { id: "2", name: "Walt Disney Pictures" },
    { id: "174", name: "Warner Bros. Pictures" },
    { id: "33", name: "Universal Pictures" },
    { id: "4", name: "Paramount Pictures" },
    { id: "25", name: "20th Century Studios" },
  ];
  const results = await Promise.all(
    studioTargets.map(async (target) => {
      const payload = await fetchJson(`/api/vod/studio?id=${encodeURIComponent(target.id)}&name=${encodeURIComponent(target.name)}&depth=7`).catch(() => null);
      const items = dedupeModuleItems(((payload?.items || []) as any[]).map((item) => enrichVodModuleItem(item))).slice(0, 60);
      return {
        id: String(payload?.studio?.id || target.id),
        name: String(payload?.studio?.name || target.name),
        logo: payload?.studio?.logo || null,
        itemCount: Number(payload?.stats?.total || items.length || 0),
        items,
      };
    })
  );
  return results.filter((item) => item.itemCount > 3);
}

function ModuleSection({ title, children, actionLabel, onAction }: { title: string; children: React.ReactNode; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} activeOpacity={0.8}>
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function CollectionCard({ group, onPress }: { group: VodCollectionGroup; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.collectionCard} onPress={onPress} activeOpacity={0.84}>
      {group.bannerUri ? <Image source={{ uri: group.bannerUri }} style={styles.collectionImage} /> : <View style={styles.collectionFallback} />}
      <View style={styles.collectionOverlay} />
      <View style={styles.collectionMeta}>
        <Text style={styles.collectionLabel}>COLLECTION</Text>
        <Text style={styles.collectionTitle} numberOfLines={2}>{group.name}</Text>
        <Text style={styles.collectionInfo}>
          {group.itemCount} titles{group.fromYear ? ` · ${group.fromYear}` : ""}{group.toYear && group.toYear !== group.fromYear ? ` - ${group.toYear}` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function StudioCard({ group, onPress }: { group: VodStudioGroup; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.studioCard} onPress={onPress} activeOpacity={0.84}>
      <View style={styles.studioLogoWrap}>
        {group.logoUri ? (
          <Image source={{ uri: group.logoUri }} resizeMode="contain" style={styles.studioLogo} />
        ) : (
          <Text style={styles.studioLogoFallback}>{group.name.slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.studioTitle} numberOfLines={2}>{group.name}</Text>
      <Text style={styles.studioInfo}>{group.itemCount} titles</Text>
    </TouchableOpacity>
  );
}

export function VodModuleHub({ initialPane = "home", initialFilter = "all" }: VodModuleHubProps) {
  const queryClient = useQueryClient();
  const { isFavorite, toggleFavorite, watchHistory } = useNexora();
  const [activePane, setActivePane] = useState<VodModulePane>(
    initialPane === "more" ? "home" : initialPane
  );
  const [searchFilter, setSearchFilter] = useState<VodSearchFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  const homeQuery = useQuery({
    queryKey: ["vod-module-home"],
    queryFn: fetchHomePayload,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });

  const searchQuery = useQuery({
    queryKey: ["vod-module-search", deferredQuery],
    queryFn: async () => {
      if (deferredQuery.length < 2) return { movies: [], series: [] };
      return fetchJson(`/api/search/multi?query=${encodeURIComponent(deferredQuery)}`);
    },
    enabled: activePane === "search" && deferredQuery.length >= 2,
    staleTime: 10 * 60 * 1000,
  });

  const catalogChunkOneQuery = useQuery({
    queryKey: ["vod-module-catalog", "chunk-1"],
    queryFn: () => fetchCatalogChunk(null),
    enabled: activePane === "home" && Boolean(homeQuery.data),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const catalogChunkTwoQuery = useQuery({
    queryKey: ["vod-module-catalog", "chunk-2", catalogChunkOneQuery.data?.meta?.nextCursorYear || "none"],
    queryFn: () => fetchCatalogChunk(catalogChunkOneQuery.data?.meta?.nextCursorYear || null),
    enabled: activePane === "home" && Boolean(catalogChunkOneQuery.data?.meta?.nextCursorYear),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const catalogChunkThreeQuery = useQuery({
    queryKey: ["vod-module-catalog", "chunk-3", catalogChunkTwoQuery.data?.meta?.nextCursorYear || "none"],
    queryFn: () => fetchCatalogChunk(catalogChunkTwoQuery.data?.meta?.nextCursorYear || null),
    enabled: activePane === "home" && Boolean(catalogChunkTwoQuery.data?.meta?.nextCursorYear),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const catalogChunkFourQuery = useQuery({
    queryKey: ["vod-module-catalog", "chunk-4", catalogChunkThreeQuery.data?.meta?.nextCursorYear || "none"],
    queryFn: () => fetchCatalogChunk(catalogChunkThreeQuery.data?.meta?.nextCursorYear || null),
    enabled: activePane === "home" && Boolean(catalogChunkThreeQuery.data?.meta?.nextCursorYear),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const curatedCollectionsQuery = useQuery({
    queryKey: ["vod-module-curated-collections"],
    queryFn: fetchCuratedCollections,
    enabled: activePane === "home",
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  const curatedStudiosQuery = useQuery({
    queryKey: ["vod-module-curated-studios"],
    queryFn: fetchCuratedStudios,
    enabled: activePane === "home",
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (activePane === "search") return;
    queryClient.prefetchQuery({ queryKey: ["vod-module-home"], queryFn: fetchHomePayload, staleTime: 15 * 60 * 1000 }).catch(() => undefined);
    queryClient.prefetchQuery({ queryKey: ["vod-module-catalog", "chunk-1"], queryFn: () => fetchCatalogChunk(null), staleTime: 30 * 60 * 1000 }).catch(() => undefined);
    queryClient.prefetchQuery({ queryKey: ["vod-module-curated-collections"], queryFn: fetchCuratedCollections, staleTime: 60 * 60 * 1000 }).catch(() => undefined);
    queryClient.prefetchQuery({ queryKey: ["vod-module-curated-studios"], queryFn: fetchCuratedStudios, staleTime: 60 * 60 * 1000 }).catch(() => undefined);
  }, [activePane, queryClient]);

  const allItems = useMemo(() => {
    const homeItems = homeQuery.data?.allItems || [];
    const chunkOne = catalogChunkOneQuery.data?.items || [];
    const chunkTwo = catalogChunkTwoQuery.data?.items || [];
    const chunkThree = catalogChunkThreeQuery.data?.items || [];
    const chunkFour = catalogChunkFourQuery.data?.items || [];
    const curatedCollectionItems = (curatedCollectionsQuery.data || []).flatMap((collection) => collection.items || []);
    const curatedStudioItems = (curatedStudiosQuery.data || []).flatMap((studio) => studio.items || []);
    return dedupeModuleItems([
      ...homeItems,
      ...chunkOne,
      ...chunkTwo,
      ...chunkThree,
      ...chunkFour,
      ...curatedCollectionItems,
      ...curatedStudioItems,
    ]);
  }, [
    catalogChunkFourQuery.data?.items,
    catalogChunkOneQuery.data?.items,
    catalogChunkThreeQuery.data?.items,
    catalogChunkTwoQuery.data?.items,
    curatedCollectionsQuery.data,
    curatedStudiosQuery.data,
    homeQuery.data?.allItems,
  ]);

  const collections = useMemo(() => {
    const curated = (curatedCollectionsQuery.data || []).map((collection) => ({
      key: `curated:${collection.id}`,
      name: collection.name,
      source: "fallback" as const,
      collectionId: Number(collection.id) || undefined,
      items: collection.items,
      itemCount: collection.itemCount,
      bannerUri: collection.backdrop || collection.items[0]?.backdrop || collection.items[0]?.poster || null,
      posterUri: collection.poster || collection.items[0]?.poster || null,
      fromYear: null,
      toYear: null,
    }));
    const grouped = buildCollectionGroups(allItems);
    return [...curated, ...grouped]
      .filter((group, index, arr) => arr.findIndex((entry) => entry.key === group.key || normalizeTitle(entry.name) === normalizeTitle(group.name)) === index)
      .slice(0, 20);
  }, [allItems, curatedCollectionsQuery.data]);
  const studios = useMemo(() => {
    const curated = (curatedStudiosQuery.data || []).map((studio) => ({
      id: Number(studio.id) || undefined,
      name: studio.name,
      logoUri: studio.logo || null,
      items: studio.items,
      itemCount: studio.itemCount,
    }));
    const grouped = buildStudioGroups(allItems);
    return [...curated, ...grouped]
      .filter((group, index, arr) => arr.findIndex((entry) => normalizeTitle(entry.name) === normalizeTitle(group.name)) === index)
      .slice(0, 20);
  }, [allItems, curatedStudiosQuery.data]);
  const genres = useMemo(() => buildCategoryRails(allItems, 24).slice(0, 14), [allItems]);
  const featured = homeQuery.data?.featured || null;

  const recommended = useMemo(() => {
    if (!allItems.length) return [];
    const movieCandidates = allItems
      .filter((item) => item.type === "movie")
      .map((item) => ({ item, source: item.isTrending ? "trending" : item.isNew ? "newReleases" : "popular" }));
    const seriesCandidates = allItems
      .filter((item) => item.type === "series")
      .map((item) => ({ item, source: item.isTrending ? "trending" : item.isNew ? "newReleases" : "popular" }));
    return [
      ...(buildMoodRecommendations("fun", movieCandidates as any, watchHistory as any, "movie", 6) as VodModuleItem[]),
      ...(buildMoodRecommendations("binge", seriesCandidates as any, watchHistory as any, "series", 6) as VodModuleItem[]),
    ].slice(0, 12);
  }, [allItems, watchHistory]);

  const continueWatching = useMemo(() => {
    const movies = createContinueWatching(watchHistory as any, "movie", 6) as VodModuleItem[];
    const series = createContinueWatching(watchHistory as any, "series", 6) as VodModuleItem[];
    return [...movies, ...series].slice(0, 12);
  }, [watchHistory]);

  const searchResults = useMemo(() => {
    const combined = [
      ...((searchQuery.data?.movies || []) as any[]).map((item) => enrichVodModuleItem({ ...item, type: "movie" })),
      ...((searchQuery.data?.series || []) as any[]).map((item) => enrichVodModuleItem({ ...item, type: "series" })),
    ];
    return filterBySearchFilter(combined, searchFilter);
  }, [searchFilter, searchQuery.data]);


  const warmDetailPayload = (item: VodModuleItem) => {
    const tmdbId = item.tmdbId ? String(item.tmdbId) : item.id;
    queryClient.prefetchQuery({
      queryKey: ["vod-detail-prefetch", item.type, tmdbId],
      queryFn: () => fetchDetail(item.type, tmdbId),
      staleTime: 10 * 60 * 1000,
    }).catch(() => undefined);
  };

  const goToDetail = (item: VodModuleItem) => {
    warmDetailPayload(item);
    const tmdbId = item.tmdbId ? String(item.tmdbId) : undefined;
    router.push({
      pathname: "/detail",
      params: {
        id: item.id,
        type: item.type,
        title: item.title,
        ...(tmdbId ? { tmdbId } : {}),
        ...(item.poster ? { poster: item.poster } : {}),
        ...(item.backdrop ? { backdrop: item.backdrop } : {}),
        ...(item.year ? { year: String(item.year) } : {}),
      },
    });
  };

  const goToPlayer = (item: VodModuleItem) => {
    SafeHaptics.impactLight();
    const tmdbId = item.tmdbId ? String(item.tmdbId) : undefined;
    router.push({
      pathname: "/player",
      params: {
        type: item.type,
        contentId: item.id,
        title: item.title,
        ...(tmdbId ? { tmdbId } : {}),
        ...(item.poster ? { poster: item.poster } : {}),
        season: "1",
        episode: "1",
      },
    });
  };

  const renderRail = (items: VodModuleItem[]) => (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => `${item.type}-${item.id}`}
      contentContainerStyle={styles.railContent}
      showsHorizontalScrollIndicator={false}
      renderItem={({ item }) => (
        <RealContentCard
          item={{
            ...item,
            year: Number(item.year || 0) || undefined,
            imdb: Number(item.imdb || item.rating || 0) || undefined,
            genre: item.genre,
            duration: item.duration || undefined,
            seasons: item.seasons || undefined,
          } as any}
          onPress={() => goToDetail(item)}
          onFavorite={() => toggleFavorite(item.id)}
          isFavorite={isFavorite(item.id)}
          showProgress={item.progress != null}
        />
      )}
    />
  );

  const homeSections = useMemo(() => {
    const sections = [
      { key: "trendingMovies", title: "Trending Movies", items: homeQuery.data?.trendingMovies || [] },
      { key: "trendingSeries", title: "Trending TV Shows", items: homeQuery.data?.trendingSeries || [] },
      { key: "recommended", title: "Recommended", items: recommended },
      { key: "continue", title: "Continue Watching", items: continueWatching },
      { key: "recentMovies", title: "Recently Added Movies", items: homeQuery.data?.recentMovies || [] },
      { key: "recentSeries", title: "Recently Added TV Shows", items: homeQuery.data?.recentSeries || [] },
      { key: "topRatedMovies", title: "Top Rated Movies", items: homeQuery.data?.topRatedMovies || [] },
      { key: "topRatedSeries", title: "Top Rated TV Shows", items: homeQuery.data?.topRatedSeries || [] },
    ];
    return sections.filter((section) => section.items.length > 0);
  }, [continueWatching, homeQuery.data, recommended]);

  return (
    <View style={styles.container}>
      <NexoraHeader
        variant="module"
        title="FILMS & SERIES"
        titleColor={COLORS.accent}
        showSearch
        showNotification
        showFavorites
        showProfile
        onSearch={() => router.push("/(tabs)/search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {homeQuery.isLoading && !homeQuery.data ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={styles.loadingText}>Building premium catalog...</Text>
          </View>
        ) : null}

        {activePane === "home" ? (
          <>
            {featured ? (
              <RealHeroBanner
                item={{
                  ...featured,
                  year: Number(featured.year || 0) || undefined,
                  imdb: Number(featured.imdb || featured.rating || 0) || undefined,
                  duration: featured.duration || undefined,
                  seasons: featured.seasons || undefined,
                  genre: featured.genre,
                } as any}
                onPlay={() => goToPlayer(featured)}
                onInfo={() => goToDetail(featured)}
              />
            ) : null}

            {collections.length ? (
              <ModuleSection title="Collections" actionLabel="See all" onAction={() => setActivePane("search")}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionRow}>
                  {collections.map((group) => (
                    <CollectionCard
                      key={group.key}
                      group={group}
                      onPress={() => router.push({ pathname: "/vod-collection", params: { id: String(group.collectionId || ""), name: group.name } })}
                    />
                  ))}
                </ScrollView>
              </ModuleSection>
            ) : null}

            {studios.length ? (
              <ModuleSection title="Studios">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.studioRow}>
                  {studios.map((group) => (
                    <StudioCard
                      key={`${group.id || group.name}`}
                      group={group}
                      onPress={() => router.push({ pathname: "/vod-studio", params: { id: String(group.id || ""), name: group.name } })}
                    />
                  ))}
                </ScrollView>
              </ModuleSection>
            ) : null}

            {homeSections.map((section) => (
              <ModuleSection key={section.key} title={section.title}>
                {renderRail(section.items)}
              </ModuleSection>
            ))}

            {genres.map((rail) => (
              <ModuleSection key={rail.key} title={rail.label}>
                {renderRail(rail.items)}
              </ModuleSection>
            ))}
          </>
        ) : null}

          {activePane === "search" ? (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search movies, TV shows, collections..."
                placeholderTextColor={COLORS.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {SEARCH_FILTERS.map((filter) => {
                const active = searchFilter === filter.key;
                return (
                  <TouchableOpacity key={filter.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setSearchFilter(filter.key)}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {deferredQuery.length < 2 ? (
              <ModuleSection title="Quick Browse">
                <View style={styles.quickBrowseGrid}>
                  {genres.slice(0, 8).map((rail) => (
                    <TouchableOpacity key={rail.key} style={styles.quickBrowseCard} onPress={() => setQuery(rail.label)}>
                      <Text style={styles.quickBrowseTitle}>{rail.label}</Text>
                      <Text style={styles.quickBrowseMeta}>{rail.items.length} curated picks</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ModuleSection>
            ) : searchQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.loadingText}>Searching catalog...</Text>
              </View>
            ) : searchResults.length ? (
              <ModuleSection title="Results">
                <View style={styles.resultsGrid}>
                  {searchResults.map((item) => (
                    <View key={`${item.type}-${item.id}`} style={styles.gridItem}>
                      <RealContentCard
                        item={{
                          ...item,
                          year: Number(item.year || 0) || undefined,
                          imdb: Number(item.imdb || item.rating || 0) || undefined,
                        } as any}
                        onPress={() => goToDetail(item)}
                        onFavorite={() => toggleFavorite(item.id)}
                        isFavorite={isFavorite(item.id)}
                        width={150}
                      />
                    </View>
                  ))}
                </View>
              </ModuleSection>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="film-outline" size={42} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No premium matches</Text>
                <Text style={styles.emptyText}>Try a broader term or switch the media filter.</Text>
              </View>
            )}
          </>
        ) : null}

      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 104 },
  loadingWrap: { paddingTop: 80, alignItems: "center", gap: 12 },
  loadingText: { color: COLORS.textSecondary, fontFamily: "Inter_500Medium" },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 22 },
  sectionAction: { color: COLORS.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  railContent: { paddingHorizontal: 18 },
  collectionRow: { paddingHorizontal: 18 },
  collectionCard: {
    width: 290,
    height: 172,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    marginRight: 14,
  },
  collectionImage: { ...StyleSheet.absoluteFillObject },
  collectionFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.cardElevated },
  collectionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.34)" },
  collectionMeta: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 6 },
  collectionLabel: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2.2 },
  collectionTitle: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 24, lineHeight: 28 },
  collectionInfo: { color: "rgba(255,255,255,0.78)", fontFamily: "Inter_500Medium", fontSize: 12 },
  studioRow: { paddingHorizontal: 18 },
  studioCard: {
    width: 150,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginRight: 12,
    gap: 10,
  },
  studioLogoWrap: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  studioLogo: { width: 80, height: 30 },
  studioLogoFallback: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 24 },
  studioTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  studioInfo: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, height: 50, color: COLORS.text, fontFamily: "Inter_400Regular" },
  filterRow: { paddingHorizontal: 18, gap: 10, marginBottom: 18 },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginRight: 10,
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterChipText: { color: COLORS.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  filterChipTextActive: { color: COLORS.text },
  quickBrowseGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 18 },
  quickBrowseCard: {
    width: "47%",
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 4,
  },
  quickBrowseTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 16 },
  quickBrowseMeta: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  resultsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 18 },
  gridItem: { width: "50%", marginBottom: 18 },
  emptyWrap: { paddingTop: 90, alignItems: "center", gap: 10, paddingHorizontal: 28 },
  emptyTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 20 },
  emptyText: { color: COLORS.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center" },
});