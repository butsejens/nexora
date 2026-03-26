import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const MODULE_NAV = [
  { key: "home" as const, label: "HOME", icon: "home-outline" as const },
  { key: "search" as const, label: "SEARCH", icon: "search-outline" as const },
  { key: "more" as const, label: "MORE", icon: "grid-outline" as const },
];

const SEARCH_FILTERS: { key: VodSearchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "TV Shows" },
  { key: "anime", label: "Anime" },
];

const MORE_MEDIA_ACTIONS = [
  { key: "movies", label: "Movies", icon: "film-outline" },
  { key: "series", label: "TV Shows", icon: "tv-outline" },
  { key: "anime", label: "Anime", icon: "sparkles-outline" },
  { key: "manga", label: "Manga", icon: "book-outline", badge: "Soon" },
  { key: "music", label: "Music", icon: "musical-notes-outline", badge: "Soon" },
  { key: "sports", label: "Live Sports", icon: "trophy-outline" },
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
    chunkYears: "4",
    pagesPerYear: "1",
  });
  if (cursorYear) params.set("cursorYear", String(cursorYear));
  const payload = await fetchJson(`/api/vod/catalog?${params.toString()}`);
  return {
    items: dedupeModuleItems(((payload?.items || []) as any[]).map((item) => enrichVodModuleItem(item))),
    meta: payload?.meta,
  };
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
  const { isFavorite, toggleFavorite, watchHistory, favorites } = useNexora();
  const [activePane, setActivePane] = useState<VodModulePane>(initialPane);
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

  useEffect(() => {
    if (activePane === "search") return;
    queryClient.prefetchQuery({ queryKey: ["vod-module-home"], queryFn: fetchHomePayload, staleTime: 15 * 60 * 1000 }).catch(() => undefined);
    queryClient.prefetchQuery({ queryKey: ["vod-module-catalog", "chunk-1"], queryFn: () => fetchCatalogChunk(null), staleTime: 30 * 60 * 1000 }).catch(() => undefined);
  }, [activePane, queryClient]);

  const allItems = useMemo(() => {
    const homeItems = homeQuery.data?.allItems || [];
    const chunkOne = catalogChunkOneQuery.data?.items || [];
    const chunkTwo = catalogChunkTwoQuery.data?.items || [];
    return dedupeModuleItems([...homeItems, ...chunkOne, ...chunkTwo]);
  }, [catalogChunkOneQuery.data?.items, catalogChunkTwoQuery.data?.items, homeQuery.data?.allItems]);

  const collections = useMemo(() => buildCollectionGroups(allItems.filter((item) => item.type === "movie")).slice(0, 18), [allItems]);
  const studios = useMemo(() => buildStudioGroups(allItems).slice(0, 18), [allItems]);
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

  const favoriteItems = useMemo(() => allItems.filter((item) => favorites.includes(item.id)), [allItems, favorites]);
  const historyPreview = useMemo(() => {
    return watchHistory.slice(0, 8).map((item: any) => enrichVodModuleItem({
      id: item.id,
      tmdbId: item.tmdbId,
      type: item.type === "movie" ? "movie" : "series",
      title: item.title,
      poster: item.poster,
      backdrop: item.backdrop,
      year: item.year,
      progress: item.progress,
      genreIds: item.genre_ids,
    }));
  }, [watchHistory]);

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

  const handleMediaAction = (key: string) => {
    if (key === "movies") {
      setSearchFilter("movie");
      setActivePane("search");
      return;
    }
    if (key === "series") {
      setSearchFilter("series");
      setActivePane("search");
      return;
    }
    if (key === "anime") {
      setSearchFilter("anime");
      setActivePane("search");
      return;
    }
    if (key === "sports") {
      router.push("/");
      return;
    }
    Alert.alert("Coming soon", "This module section is wired into the premium structure and can be activated as soon as a dedicated source is connected.");
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
        onSearch={() => setActivePane("search")}
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

            {catalogChunkOneQuery.isFetching || catalogChunkTwoQuery.isFetching ? (
              <View style={styles.catalogLoadingRow}>
                <ActivityIndicator color={COLORS.accent} size="small" />
                <Text style={styles.catalogLoadingText}>Expanding 30-year catalog in the background...</Text>
              </View>
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

          {activePane === "more" ? (
          <>
            <ModuleSection title="Media">
              <View style={styles.menuGrid}>
                {MORE_MEDIA_ACTIONS.map((item) => (
                  <TouchableOpacity key={item.key} style={styles.menuCard} onPress={() => handleMediaAction(item.key)}>
                    <View style={styles.menuIconWrap}>
                      <Ionicons name={item.icon as any} size={20} color={COLORS.accent} />
                    </View>
                    <Text style={styles.menuTitle}>{item.label}</Text>
                    <Text style={styles.menuMeta}>{item.badge || "Open"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ModuleSection>

            <ModuleSection title="User">
              <View style={styles.menuList}>
                <TouchableOpacity style={styles.menuRow} onPress={() => router.push("/favorites")}>
                  <Text style={styles.menuRowLabel}>Watchlist</Text>
                  <Text style={styles.menuRowValue}>{favoriteItems.length}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuRow} onPress={() => router.push("/profile")}>
                  <Text style={styles.menuRowLabel}>History</Text>
                  <Text style={styles.menuRowValue}>{watchHistory.length}</Text>
                </TouchableOpacity>
              </View>
            </ModuleSection>

            {favoriteItems.length ? (
              <ModuleSection title="Watchlist Preview">
                {renderRail(favoriteItems.slice(0, 12))}
              </ModuleSection>
            ) : null}

            {historyPreview.length ? (
              <ModuleSection title="History Preview">
                {renderRail(historyPreview.slice(0, 12))}
              </ModuleSection>
            ) : null}

            <ModuleSection title="System">
              <View style={styles.menuList}>
                <TouchableOpacity style={styles.menuRow} onPress={() => Alert.alert("Legal / DMCA", "DMCA and legal handling should be exposed from the service/legal backend. This entry is now wired into the module menu.")}>
                  <Text style={styles.menuRowLabel}>Legal / DMCA</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuRow} onPress={() => router.push("/settings")}>
                  <Text style={styles.menuRowLabel}>Settings</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </ModuleSection>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.moduleNavShell}>
        <View style={styles.moduleNav}>
          {MODULE_NAV.map((item) => {
            const active = activePane === item.key;
            return (
              <TouchableOpacity key={item.key} style={[styles.moduleNavItem, active && styles.moduleNavItemActive]} onPress={() => setActivePane(item.key)}>
                <Ionicons name={item.icon} size={18} color={active ? COLORS.text : COLORS.textMuted} />
                <Text style={[styles.moduleNavLabel, active && styles.moduleNavLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 170 },
  loadingWrap: { paddingTop: 80, alignItems: "center", gap: 12 },
  loadingText: { color: COLORS.textSecondary, fontFamily: "Inter_500Medium" },
  catalogLoadingRow: {
    marginHorizontal: 18,
    marginBottom: 18,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(229,9,20,0.08)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.22)",
  },
  catalogLoadingText: { color: COLORS.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
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
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 18 },
  menuCard: {
    width: "47%",
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(229,9,20,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 15 },
  menuMeta: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  menuList: {
    marginHorizontal: 18,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  menuRowLabel: { color: COLORS.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  menuRowValue: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 12 },
  moduleNavShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 82,
    alignItems: "center",
  },
  moduleNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(8,8,12,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  moduleNavItem: {
    minWidth: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
  },
  moduleNavItemActive: { backgroundColor: COLORS.accent },
  moduleNavLabel: { color: COLORS.textMuted, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.1 },
  moduleNavLabelActive: { color: COLORS.text },
});