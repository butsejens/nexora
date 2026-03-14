import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Platform, RefreshControl,
  TouchableOpacity, TextInput, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import { SafeHaptics } from "@/lib/safeHaptics";
import { SilentResetBoundary } from "@/components/SilentResetBoundary";

const CATEGORY_SORT: Record<string, string> = {
  trending: "popularity.desc",
  airingToday: "first_air_date.desc",
  newReleases: "first_air_date.desc",
  topRated: "vote_average.desc",
  popular: "popularity.desc",
};

const IPTV_PALETTE = ["#1B2B4B","#2B1B4B","#1B4B2B","#4B1B2B","#4B2B1B","#1B3B4B","#2B4B1B","#3B1B4B","#1B4B3B","#2B3B1B"];
function iptvColor(title: string): string {
  let h = 0; for (const c of String(title || "")) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return IPTV_PALETTE[h % IPTV_PALETTE.length];
}

async function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timeout")), ms)),
  ]);
}

async function fetchSeries() {
  try {
    const res = await withTimeout(apiRequest("GET", "/api/series/trending"), 8000);
    return await res.json();
  } catch (error: any) {
    return {
      trending: [], newReleases: [], topRated: [], popular: [], airingToday: [], hiddenGems: [],
      error: String(error?.message || "Series request failed"),
    };
  }
}

async function fetchSeriesGenres(page = 1) {
  try {
    const res = await withTimeout(apiRequest("GET", `/api/series/genres-catalog?page=${page}`), 20000);
    return await res.json();
  } catch {
    return { genres: [] };
  }
}

async function fetchSeriesDecades() {
  try {
    const res = await withTimeout(apiRequest("GET", "/api/series/decades"), 15000);
    return await res.json();
  } catch {
    return { decades: [] };
  }
}

async function fetchGenreDiscover() {
  try {
    const res = await withTimeout(apiRequest("GET", "/api/series/discover-by-genre"), 15000);
    return await res.json();
  } catch {
    return { rows: [] };
  }
}

export default function SeriesScreen() {
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, iptvChannels, isChannelVisible, isLoadingPlaylist, watchHistory } = useNexora();
  const [groupFilter, setGroupFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingGuardReached, setLoadingGuardReached] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  // Server-side search
  const [serverResults, setServerResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = search.trim();
    if (!q || q.length < 2) { setServerResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/search/multi?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        setServerResults(data?.series || []);
      } catch { setServerResults([]); }
      setSearchLoading(false);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // Per-genre extra pages state
  const [genreExtras, setGenreExtras] = useState<Record<number, { page: number; items: any[]; loading: boolean }>>({});
  // Per-category extra pages state
  const [categoryExtras, setCategoryExtras] = useState<Record<string, { page: number; items: any[]; loading: boolean }>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["series", "trending"],
    queryFn: fetchSeries,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const { data: genresData, refetch: refetchGenres } = useQuery({
    queryKey: ["series", "genres"],
    queryFn: () => fetchSeriesGenres(1),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });

  const { data: decadesData } = useQuery({
    queryKey: ["series", "decades"],
    queryFn: fetchSeriesDecades,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });

  const { data: genreDiscoverData, refetch: refetchGenreDiscover } = useQuery({
    queryKey: ["series", "genre-discover"],
    queryFn: fetchGenreDiscover,
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });

  const iptvSeries = useMemo(
    () => iptvChannels.filter(c => c.category === "series" && isChannelVisible(c.id, c.group)),
    [iptvChannels, isChannelVisible]
  );

  const iptvGroups = useMemo(() => {
    const groups = new Set<string>();
    iptvSeries.forEach(c => { if (c.group) groups.add(c.group); });
    return ["All", ...Array.from(groups).sort()];
  }, [iptvSeries]);

  const filteredIptv = useMemo(() => {
    let list = groupFilter === "All" ? iptvSeries : iptvSeries.filter(c => c.group === groupFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.title || c.name || "").toLowerCase().includes(q));
    }
    return list.map(c => ({
      id: c.id, title: c.title || c.name, poster: c.poster || null,
      backdrop: c.backdrop || null, synopsis: c.synopsis || "",
      year: c.year, imdb: c.rating, genre: [], quality: "HD",
      isIptv: true, streamUrl: c.url, tmdbId: c.tmdbId,
      color: iptvColor(c.title || c.name || ""),
    }));
  }, [iptvSeries, groupFilter, search]);

  const trending = useMemo(() => data?.trending || [], [data]);
  const newReleases = useMemo(() => data?.newReleases || [], [data]);
  const topRated = useMemo(() => data?.topRated || [], [data]);
  const popular = useMemo(() => data?.popular || [], [data]);
  const airingToday = useMemo(() => data?.airingToday || [], [data]);
  const hiddenGems: any[] = useMemo(() => data?.hiddenGems || [], [data]);
  const seriesGenres: any[] = useMemo(() => genresData?.genres || [], [genresData]);
  const seriesDecades: any[] = useMemo(() => decadesData?.decades || [], [decadesData]);
  const genreDiscoverRows: any[] = useMemo(() => genreDiscoverData?.rows || [], [genreDiscoverData]);

  // Continue Watching — series from watch history
  const continueWatching = useMemo(() => {
    return watchHistory
      .filter(h => h.type === "series" && h.progress && h.progress > 0 && h.progress < 0.95)
      .slice(0, 20)
      .map(h => ({
        id: h.id, title: h.title, poster: null, backdrop: null, synopsis: "",
        year: undefined, imdb: undefined, genre: [], quality: "HD", isIptv: false, progress: h.progress,
      }));
  }, [watchHistory]);

  const recentlyWatched = useMemo(() => {
    return watchHistory
      .filter(h => h.type === "series")
      .slice(0, 15)
      .map(h => ({
        id: h.id, title: h.title, poster: null, backdrop: null, synopsis: "",
        year: undefined, imdb: undefined, genre: [], quality: "HD", isIptv: false,
      }));
  }, [watchHistory]);

  const heroItems = useMemo(() => {
    const pool = iptvSeries.length > 0 ? filteredIptv : [...trending, ...newReleases, ...popular];
    return pool.filter(Boolean).slice(0, 10);
  }, [iptvSeries, filteredIptv, trending, newReleases, popular]);

  const featured = heroItems[heroIndex % Math.max(heroItems.length, 1)] || null;

  // Auto-rotate hero banner every 8 seconds
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIndex((i) => (i + 1) % heroItems.length);
    }, 8_000);
    return () => clearInterval(timer);
  }, [heroItems.length]);

  const rawCatalogError =
    (data as any)?.error ||
    (isError ? "Series catalog not available" : "");
  const normalizedCatalogError = rawCatalogError ? normalizeApiError(rawCatalogError) : null;
  const catalogErrorRef = useMemo(() => (rawCatalogError ? buildErrorReference("NX-SER") : ""), [rawCatalogError]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const isTabLoading = isLoading || isLoadingPlaylist;

  useEffect(() => {
    if (!isTabLoading) { setLoadingGuardReached(false); return; }
    const timer = setTimeout(() => setLoadingGuardReached(true), 12_000);
    return () => clearTimeout(timer);
  }, [isTabLoading]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goToDetail = useCallback((item: any) => {
    if (item.isIptv) {
      router.push({
        pathname: "/detail",
        params: {
          id: item.id, type: "series", title: item.title,
          isIptv: "true", streamUrl: item.streamUrl,
          ...(item.tmdbId ? { tmdbId: String(item.tmdbId) } : {}),
        },
      });
    } else {
      router.push({ pathname: "/detail", params: { id: item.id, type: "series", title: item.title } });
    }
  }, []);

  const goToPlayer = useCallback((item: any) => {
    SafeHaptics.impactLight();
    const tmdbId = item.tmdbId ? String(item.tmdbId) : (!item.isIptv ? item.id : null);
    if (item.isIptv && item.streamUrl) {
      router.push({
        pathname: "/player",
        params: {
          streamUrl: item.streamUrl, title: item.title,
          type: "series", contentId: item.id,
          ...(tmdbId ? { tmdbId } : {}),
          season: "1", episode: "1",
        },
      });
    } else if (tmdbId) {
      router.push({
        pathname: "/player",
        params: {
          tmdbId, title: item.title,
          type: "series", contentId: item.id,
          season: "1", episode: "1",
        },
      });
    } else {
      goToDetail(item);
    }
  }, [goToDetail]);

  // ── Load more per genre ───────────────────────────────────────────────────
  const loadMoreGenre = useCallback(async (genreId: number) => {
    const current = genreExtras[genreId] || { page: 1, items: [], loading: false };
    if (current.loading) return;
    const nextPage = current.page + 1;
    setGenreExtras(prev => ({ ...prev, [genreId]: { ...current, loading: true } }));
    try {
      const data = await fetchSeriesGenres(nextPage);
      const genre = (data.genres || []).find((g: any) => g.id === genreId);
      const newItems = genre?.items || [];
      setGenreExtras(prev => ({
        ...prev,
        [genreId]: {
          page: nextPage,
          items: [...(prev[genreId]?.items || []), ...newItems],
          loading: false,
        },
      }));
    } catch {
      setGenreExtras(prev => ({ ...prev, [genreId]: { ...current, loading: false } }));
    }
  }, [genreExtras]);

  // ── Load more per main category ────────────────────────────────────────────
  const loadMoreCategory = useCallback(async (key: string) => {
    const current = categoryExtras[key] || { page: 1, items: [], loading: false };
    if (current.loading) return;
    const nextPage = current.page + 1;
    const sortBy = CATEGORY_SORT[key] || "popularity.desc";
    setCategoryExtras(prev => ({ ...prev, [key]: { ...current, loading: true } }));
    try {
      const res = await withTimeout(
        apiRequest("GET", `/api/series/all?page=${nextPage}&sort_by=${sortBy}`),
        15000
      );
      const d = await res.json();
      const newItems = d?.items || [];
      setCategoryExtras(prev => ({
        ...prev,
        [key]: {
          page: nextPage,
          items: [...(prev[key]?.items || []), ...newItems],
          loading: false,
        },
      }));
    } catch {
      setCategoryExtras(prev => ({ ...prev, [key]: { ...current, loading: false } }));
    }
  }, [categoryExtras]);

  // Deduplicate: build set of IDs already shown in all base rows
  const baseSeenIds = useMemo(() => {
    const seen = new Set<string>();
    [trending, airingToday, newReleases, topRated, popular, hiddenGems].forEach(arr =>
      arr.forEach((m: any) => seen.add(m.id))
    );
    return seen;
  }, [trending, airingToday, newReleases, topRated, popular, hiddenGems]);

  // Normalize title for dedup: lowercase, strip non-alphanumeric
  const normalizeTitle = (title: string, year?: string | number) => {
    const t = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return year ? `${t}__${String(year).slice(0, 4)}` : t;
  };

  const [dedupTrending, dedupAiringToday, dedupNewReleases, dedupTopRated, dedupPopular, dedupHiddenGems] = useMemo(() => {
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    const dedup = (arr: any[]) => arr.filter((m: any) => {
      if (seenIds.has(m.id)) return false;
      const norm = normalizeTitle(m.title, m.year);
      if (norm.length > 3 && seenTitles.has(norm)) return false;
      seenIds.add(m.id);
      if (norm.length > 3) seenTitles.add(norm);
      return true;
    });
    return [
      dedup(trending),
      dedup(airingToday),
      dedup(newReleases),
      dedup(topRated),
      dedup(popular),
      dedup(hiddenGems),
    ];
  }, [trending, airingToday, newReleases, topRated, popular, hiddenGems]);

  const filteredTmdb = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const local = [
      ...trending.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...newReleases.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...topRated.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...popular.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...airingToday.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...hiddenGems.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
    ];
    const merged = [...local, ...serverResults];
    const seen = new Set<string>();
    const exact: any[] = [];
    const partial: any[] = [];
    for (const m of merged) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if ((m.title || "").toLowerCase() === q) exact.push(m);
      else exact.length < 5 && (m.title || "").toLowerCase().startsWith(q) ? exact.push(m) : partial.push(m);
    }
    return [...exact, ...partial];
  }, [search, trending, newReleases, topRated, popular, airingToday, hiddenGems, serverResults]);

  const renderCard = useCallback((item: any, showProgress = false) => (
    <RealContentCard
      item={{ ...item, isIptv: item.isIptv ?? false }}
      onPress={() => goToDetail(item)}
      onFavorite={() => toggleFavorite(item.id)}
      isFavorite={isFavorite(item.id)}
      showProgress={showProgress}
    />
  ), [goToDetail, toggleFavorite, isFavorite]);

  const renderMainRow = (title: string, baseItems: any[], categoryKey: string) => {
    const extra = categoryExtras[categoryKey];
    const extraFiltered = (extra?.items || []).filter(
      (m: any) => !baseSeenIds.has(m.id)
    );
    const allItems = [...baseItems, ...extraFiltered];
    const loading = extra?.loading;
    if (allItems.length === 0) return null;
    return (
      <View style={styles.section} key={`main-${categoryKey}`}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <TouchableOpacity onPress={() => loadMoreCategory(categoryKey)} style={styles.seeAllBtn}>
            <Text style={styles.seeAllText}>More</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
        <FlatList
          horizontal
          data={allItems}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => renderCard(item)}
          contentContainerStyle={styles.carouselPadding}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={5}
          scrollEventThrottle={16}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => loadMoreCategory(categoryKey)}
              disabled={!!loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={COLORS.accent} />
                : <><Ionicons name="add" size={22} color={COLORS.accent} /><Text style={styles.loadMoreText}>More</Text></>
              }
            </TouchableOpacity>
          }
        />
      </View>
    );
  };

  const renderGenreRow = (genre: any) => {
    const extra = genreExtras[genre.id];
    const allItems = extra ? [...genre.items, ...extra.items] : genre.items;
    return (
      <View key={String(genre.id)} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{genre.name}</Text>
          <TouchableOpacity onPress={() => loadMoreGenre(genre.id)} style={styles.seeAllBtn}>
            <Text style={styles.seeAllText}>More</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
        <FlatList
          horizontal
          data={allItems}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => renderCard(item)}
          contentContainerStyle={styles.carouselPadding}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={5}
          scrollEventThrottle={16}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => loadMoreGenre(genre.id)}
              disabled={extra?.loading}
            >
              {extra?.loading
                ? <ActivityIndicator size="small" color={COLORS.accent} />
                : <>
                    <Ionicons name="chevron-forward-circle-outline" size={18} color={COLORS.accent} />
                    <Text style={styles.loadMoreText}>More</Text>
                  </>
              }
            </TouchableOpacity>
          }
        />
      </View>
    );
  };

  const renderSimpleRow = (title: string, items: any[], keyPrefix: string, showProgress = false) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section} key={keyPrefix}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item: any) => `${keyPrefix}-${item.id}`}
          renderItem={({ item }: any) => renderCard(item, showProgress)}
          contentContainerStyle={styles.carouselPadding}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={5}
          scrollEventThrottle={16}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <NexoraHeader
        title="Series"
        showSearch showFavorites showProfile
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      {isLoadingPlaylist && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading playlist...</Text>
        </View>
      )}

      {loadingGuardReached && (
        <View style={styles.watchdogBanner}>
          <Ionicons name="time-outline" size={14} color={COLORS.accent} />
          <Text style={styles.watchdogText}>
            Loading is taking longer than expected. Results will appear as they come in.
          </Text>
        </View>
      )}

      {normalizedCatalogError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={14} color={COLORS.live} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.errorText}>{normalizedCatalogError.userMessage}</Text>
            <Text style={styles.errorCodeText}>Error: {catalogErrorRef || normalizedCatalogError.code}</Text>
          </View>
        </View>
      ) : null}

      <SilentResetBoundary>
      <FlatList
        data={[]}
        keyExtractor={() => ""}
        renderItem={null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            setGenreExtras({});
            setCategoryExtras({});
            await Promise.all([refetch(), refetchGenres(), refetchGenreDiscover()]);
            setRefreshing(false);
          }} tintColor={COLORS.accent} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search series..."
                placeholderTextColor={COLORS.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} style={{ paddingRight: 12 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Search results – always mounted, hidden when not searching to avoid removeChild crash */}
            <View style={search.trim() ? undefined : { display: "none" }}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Search Results</Text>
                <View style={filteredIptv.length > 0 ? undefined : { display: "none" }}>
                  <FlatList horizontal data={filteredIptv} keyExtractor={(item: any) => item.id}
                    renderItem={({ item }: any) => renderCard(item)}
                    contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                </View>
                <View style={(filteredTmdb ?? []).length > 0 ? undefined : { display: "none" }}>
                  <FlatList horizontal data={filteredTmdb ?? []} keyExtractor={(item: any) => item.id}
                    renderItem={({ item }: any) => renderCard(item)}
                    contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                </View>
                <View style={filteredIptv.length === 0 && (filteredTmdb ?? []).length === 0 ? undefined : { display: "none" }}>
                  {searchLoading ? (
                    <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
                      <ActivityIndicator size="small" color={COLORS.accent} />
                      <Text style={{ fontFamily: "Inter_400Regular", color: COLORS.textMuted }}>Searching...</Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
                      <Ionicons name="tv-outline" size={40} color={COLORS.textMuted} />
                      <Text style={{ fontFamily: "Inter_400Regular", color: COLORS.textMuted }}>No series found for &quot;{search}&quot;</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Normal catalog – always mounted, hidden while searching to avoid removeChild crash */}
            <View style={search.trim() ? { display: "none" } : undefined}>
              {/* Hero banner - always mounted */}
              <View style={featured ? undefined : { display: "none" }}>
                <View style={styles.heroFrame}>
                  <RealHeroBanner
                    item={featured ?? { id: "", title: "", poster: null, backdrop: null, synopsis: "", year: undefined, imdb: undefined, genre: [], quality: "", isIptv: false, streamUrl: undefined, tmdbId: undefined, color: "" }}
                    onPlay={() => featured && goToPlayer(featured)}
                    onInfo={() => featured && goToDetail(featured)}
                  />
                  {/* Hero pagination dots */}
                  {heroItems.length > 1 && (
                    <View style={styles.heroDots}>
                      {heroItems.map((_, i) => (
                        <View key={i} style={[styles.heroDot, i === heroIndex % heroItems.length && styles.heroDotActive]} />
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Continue Watching — always mounted */}
              <View style={continueWatching.length > 0 ? undefined : { display: "none" }}>
                {renderSimpleRow("Continue Watching", continueWatching, "continue", true)}
              </View>

              {/* IPTV Playlist - always mounted */}
              <View style={iptvSeries.length > 0 ? undefined : { display: "none" }}>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Your Playlist</Text>
                  <View style={iptvGroups.length > 2 ? undefined : { display: "none" }}>
                    <FlatList
                      horizontal data={iptvGroups} keyExtractor={g => g}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[styles.chip, groupFilter === item && styles.chipActive]}
                          onPress={() => setGroupFilter(item)}>
                          <Text style={[styles.chipText, groupFilter === item && styles.chipTextActive]}>{item}</Text>
                        </TouchableOpacity>
                      )}
                      contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false} />
                  </View>
                  <FlatList
                    horizontal data={filteredIptv} keyExtractor={(item: any) => item.id}
                    renderItem={({ item }: any) => renderCard(item)}
                    contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false}
                    initialNumToRender={4} maxToRenderPerBatch={3} windowSize={5} scrollEventThrottle={16} />
                </View>
              </View>

              {renderMainRow("Trending This Week", dedupTrending, "trending")}
              {renderMainRow("On TV Now", dedupAiringToday, "airingToday")}
              {renderMainRow("New & Ongoing", dedupNewReleases, "newReleases")}
              {renderMainRow("Top Rated", dedupTopRated, "topRated")}
              {renderMainRow("Popular Now", dedupPopular, "popular")}
              {renderSimpleRow("Hidden Gems", dedupHiddenGems, "hidden-gems")}

              {/* Genre discover rows — Action, Comedy, Crime, Drama, Mystery, Sci-Fi */}
              {genreDiscoverRows.map((row: any) => row.items?.length > 0 && (
                <View key={`gd-${row.genreId}`} style={styles.section}>
                  <Text style={styles.sectionTitle}>{row.genreName}</Text>
                  <FlatList
                    horizontal
                    data={row.items}
                    keyExtractor={(item: any) => `gd-${row.genreId}-${item.id}`}
                    renderItem={({ item }: any) => renderCard(item)}
                    contentContainerStyle={styles.carouselPadding}
                    showsHorizontalScrollIndicator={false}
                    initialNumToRender={4}
                    maxToRenderPerBatch={3}
                    windowSize={5}
                    scrollEventThrottle={16}
                  />
                </View>
              ))}

              {/* Genre rows — skip genres already shown by discover-by-genre */}
              {seriesGenres.filter((g: any) => !genreDiscoverRows.some((r: any) => r.genreId === g.id)).map((genre: any) => genre.items?.length > 0 && renderGenreRow(genre))}

              {/* Watch Again — always mounted */}
              <View style={recentlyWatched.length > 0 ? undefined : { display: "none" }}>
                {renderSimpleRow("Watch Again", recentlyWatched, "watch-again")}
              </View>

              {/* Decade rows */}
              {seriesDecades.map((decade: any) => (
                decade.items?.length > 0 && (
                  <View key={decade.decade} style={styles.section}>
                    <Text style={styles.sectionTitle}>Best of the {decade.name}</Text>
                    <FlatList
                      horizontal
                      data={decade.items}
                      keyExtractor={(item: any) => `${decade.decade}-${item.id}`}
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding}
                      showsHorizontalScrollIndicator={false}
                      initialNumToRender={4}
                      maxToRenderPerBatch={3}
                      windowSize={5}
                      scrollEventThrottle={16}
                    />
                  </View>
                )
              ))}

              {isLoading && (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator color={COLORS.accent} />
                  <Text style={{ color: COLORS.textMuted, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 12 }}>
                    Loading series...
                  </Text>
                </View>
              )}
              {isError && !iptvSeries.length && (
                <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
                  <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
                  <Text style={{ fontFamily: "Inter_500Medium", color: COLORS.textMuted, textAlign: "center" }}>
                    {normalizedCatalogError?.userMessage || "Unable to load series."}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ height: bottomPad }} />
          </>
        }
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      />
      </SilentResetBoundary>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, marginHorizontal: 16, marginTop: 10, marginBottom: 14, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" },
  searchInput: { flex: 1, height: 42, paddingHorizontal: 10, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },
  heroFrame: {
    marginBottom: 8,
  },
  heroDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: -12,
    marginBottom: 8,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroDotActive: {
    backgroundColor: COLORS.accent,
    width: 18,
    borderRadius: 3,
  },
  chipRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row" },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.accent },
  loadingBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  watchdogBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent + "55",
  },
  watchdogText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent, flex: 1 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.liveGlow, borderWidth: 1, borderColor: COLORS.live,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  errorCodeText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, paddingHorizontal: 20, marginBottom: 14 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent },
  carouselPadding: { paddingHorizontal: 20, paddingRight: 8 },
  loadMoreBtn: {
    width: 64, alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: COLORS.cardElevated, borderRadius: 12,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)",
    marginLeft: 6, marginRight: 20, height: 203,
  },
  loadMoreText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
});
