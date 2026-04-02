import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import {
  buildVodCatalogRootQuery,
  buildVodCollectionsQuery,
  buildVodHomeQuery,
} from "@/services/realtime-engine";
import { COLORS } from "@/constants/colors";

const { width: SCREEN_W } = Dimensions.get("window");

type VodModulePane = "home" | "search" | "collections" | "platforms" | "more";
type VodSearchFilter = "all" | "movie" | "series" | "anime";

type VodModuleHubProps = {
  initialPane?: VodModulePane;
  initialFilter?: VodSearchFilter;
};

type UiItem = {
  id: string;
  title: string;
  type: "movie" | "series";
  poster?: string | null;
  backdrop?: string | null;
  year?: number;
  rating?: number;
  quality?: string;
  studio?: string;
  isTrending?: boolean;
  isNew?: boolean;
  synopsis?: string;
  genre?: string[];
};

const FILTERS: { key: VodSearchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "Series" },
  { key: "anime", label: "Anime" },
];

function dedupeItems(items: UiItem[]): UiItem[] {
  const seen = new Set<string>();
  const out: UiItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id || item.title.toLowerCase()}`;
    if (!item.title || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mapAnyToUiItems(items: any[], defaults?: Partial<UiItem>): UiItem[] {
  return dedupeItems(
    (Array.isArray(items) ? items : []).map((item, index) => {
      const type = String(item?.type || "movie") === "series" ? "series" : "movie";
      return {
        id: String(item?.tmdbId || item?.id || `item-${index}`),
        title: String(item?.title || item?.name || "Untitled"),
        type,
        poster: item?.poster || null,
        backdrop: item?.backdrop || null,
        year: Number(item?.year || 0) || undefined,
        rating: Number(item?.rating || item?.imdb || 0) || undefined,
        quality: String(item?.quality || "HD"),
        studio: String(item?.studios?.[0] || item?.productionCompanies?.[0]?.name || "").trim() || undefined,
        synopsis: item?.synopsis || item?.overview || undefined,
        genre: Array.isArray(item?.genre) ? item.genre : undefined,
        ...defaults,
      };
    }),
  );
}

function groupByPlatform(items: UiItem[]) {
  const map = new Map<string, UiItem[]>();
  for (const item of items) {
    const key = item.studio || "Other";
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([name, rows]) => ({ name, count: rows.length, items: rows.slice(0, 12) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);
}

function navigateToDetail(item: UiItem) {
  router.push({ pathname: "/detail", params: { id: item.id, type: item.type, title: item.title } });
}

function toCardItem(item: UiItem) {
  return {
    id: item.id,
    title: item.title,
    year: item.year || 0,
    imdb: item.rating || 0,
    quality: item.quality || "HD",
    poster: item.poster,
    backdrop: item.backdrop,
    isTrending: item.isTrending,
    isNew: item.isNew,
    synopsis: item.synopsis,
    genre: item.genre,
  };
}

export function VodModuleHub({ initialPane = "home", initialFilter = "all" }: VodModuleHubProps) {
  const insets = useSafeAreaInsets();
  const [pane, setPane] = useState<VodModulePane>(initialPane === "more" ? "home" : initialPane);
  const [filter, setFilter] = useState<VodSearchFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const homeQuery = useQuery(buildVodHomeQuery(true));
  const catalogQuery = useQuery(buildVodCatalogRootQuery(true));
  const collectionsQuery = useQuery(buildVodCollectionsQuery(true));

  const vodHome = homeQuery.data;

  // -- Categorized rails from vodHome --
  const featured = useMemo(() => {
    const f = vodHome?.featured;
    if (!f?.title) return null;
    return {
      id: String(f.tmdbId || f.id || ""),
      title: f.title,
      type: (f.type === "series" ? "series" : "movie") as "movie" | "series",
      poster: f.poster || null,
      backdrop: f.backdrop || null,
      year: Number(f.year || 0) || undefined,
      rating: Number(f.rating || f.imdb || 0) || undefined,
      quality: String(f.quality || "HD"),
      synopsis: f.synopsis || f.overview || undefined,
      genre: Array.isArray(f.genre) ? f.genre : undefined,
    };
  }, [vodHome?.featured]);

  const trendingMovies = useMemo(
    () => mapAnyToUiItems(vodHome?.trendingMovies || [], { isTrending: true }),
    [vodHome?.trendingMovies],
  );
  const trendingSeries = useMemo(
    () => mapAnyToUiItems(vodHome?.trendingSeries || [], { isTrending: true }),
    [vodHome?.trendingSeries],
  );
  const newReleaseMovies = useMemo(
    () => mapAnyToUiItems(vodHome?.recentMovies || [], { isNew: true }),
    [vodHome?.recentMovies],
  );
  const newReleaseSeries = useMemo(
    () => mapAnyToUiItems(vodHome?.recentSeries || [], { isNew: true }),
    [vodHome?.recentSeries],
  );
  const topRatedMovies = useMemo(
    () => mapAnyToUiItems(vodHome?.topRatedMovies || []),
    [vodHome?.topRatedMovies],
  );
  const topRatedSeries = useMemo(
    () => mapAnyToUiItems(vodHome?.topRatedSeries || []),
    [vodHome?.topRatedSeries],
  );
  const catalogItems = useMemo(
    () => mapAnyToUiItems(catalogQuery.data?.items || []),
    [catalogQuery.data?.items],
  );

  const allItems = useMemo(
    () => dedupeItems([...trendingMovies, ...trendingSeries, ...newReleaseMovies, ...newReleaseSeries, ...catalogItems]),
    [trendingMovies, trendingSeries, newReleaseMovies, newReleaseSeries, catalogItems],
  );

  // -- Search --
  const queryNorm = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!queryNorm) return [];
    return allItems.filter((item) => {
      if (filter !== "all" && item.type !== filter) {
        if (!(filter === "anime" && /anime/i.test(item.title))) return false;
      }
      return `${item.title} ${item.studio || ""}`.toLowerCase().includes(queryNorm);
    });
  }, [allItems, filter, queryNorm]);

  // -- Collections --
  const collectionCards = useMemo(() => {
    const rows = Array.isArray(collectionsQuery.data) ? collectionsQuery.data : [];
    return rows.slice(0, 10).map((row: any, index: number) => ({
      id: String(row?.id || `collection-${index}`),
      name: String(row?.name || "Collection"),
      count: Number(row?.itemCount || 0),
      poster: row?.poster || row?.backdrop || null,
      items: mapAnyToUiItems(row?.items || []).slice(0, 8),
    }));
  }, [collectionsQuery.data]);

  const platformGroups = useMemo(() => groupByPlatform(allItems), [allItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([homeQuery.refetch(), catalogQuery.refetch(), collectionsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const isLoading = homeQuery.isLoading && !vodHome;

  return (
    <View style={styles.screen}>
      <NexoraHeader
        variant="module"
        title="FILMS & SERIES"
        titleColor={COLORS.accent}
        showSearch
        showNotification
        showFavorites
        onSearch={() => { setPane("search"); }}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
      />

      <PaneTabs pane={pane} onChange={setPane} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 92 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />}
      >
        {/* ── Search bar (always visible) ── */}
        {pane === "search" && (
          <View style={styles.searchBoxWrap}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={COLORS.textMuted} style={{ marginLeft: 14 }} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search films, series..."
                placeholderTextColor={COLORS.textMuted}
                style={styles.searchInput}
                autoFocus
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")} style={{ paddingRight: 14 }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map((f) => {
                const active = f.key === filter;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(f.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Loading state ── */}
        {isLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Loading catalog...</Text>
          </View>
        )}

        {/* ── SEARCH PANE ── */}
        {pane === "search" && !isLoading && (
          <View style={styles.content}>
            {queryNorm && searchResults.length > 0 ? (
              <View style={styles.searchGrid}>
                {searchResults.slice(0, 30).map((item) => (
                  <RealContentCard
                    key={item.id}
                    width={(SCREEN_W - 48) / 3}
                    item={toCardItem(item)}
                    onPress={() => navigateToDetail(item)}
                  />
                ))}
              </View>
            ) : queryNorm ? (
              <Panel
                icon="search-outline"
                title="No results"
                subtitle={`Nothing found for "${query}". Try another title.`}
              />
            ) : allItems.length > 0 ? (
              <>
                <Section title="Browse All">
                  <View style={styles.searchGrid}>
                    {allItems.slice(0, 18).map((item) => (
                      <RealContentCard
                        key={item.id}
                        width={(SCREEN_W - 48) / 3}
                        item={toCardItem(item)}
                        onPress={() => navigateToDetail(item)}
                      />
                    ))}
                  </View>
                </Section>
              </>
            ) : null}
          </View>
        )}

        {/* ── HOME PANE ── */}
        {pane === "home" && !isLoading && (
          <>
            {/* Hero Banner */}
            {featured && (
              <RealHeroBanner
                item={{
                  id: featured.id,
                  title: featured.title,
                  year: featured.year || 0,
                  imdb: featured.rating || 0,
                  quality: featured.quality || "HD",
                  poster: featured.poster,
                  backdrop: featured.backdrop,
                  synopsis: featured.synopsis,
                  genre: featured.genre,
                }}
                onPlay={() => navigateToDetail(featured)}
                onInfo={() => navigateToDetail(featured)}
              />
            )}

            <View style={styles.content}>
              {/* Trending Movies */}
              <ContentRail
                title="Trending Movies"
                icon="flame"
                iconColor="#FF6B35"
                items={trendingMovies}
              />

              {/* Trending Series */}
              <ContentRail
                title="Trending Series"
                icon="tv-outline"
                iconColor={COLORS.cyan}
                items={trendingSeries}
              />

              {/* New Releases */}
              {(newReleaseMovies.length > 0 || newReleaseSeries.length > 0) && (
                <ContentRail
                  title="New Releases"
                  icon="sparkles"
                  iconColor={COLORS.gold}
                  items={dedupeItems([...newReleaseMovies, ...newReleaseSeries])}
                />
              )}

              {/* Top Rated */}
              {(topRatedMovies.length > 0 || topRatedSeries.length > 0) && (
                <ContentRail
                  title="Top Rated"
                  icon="star"
                  iconColor={COLORS.gold}
                  items={dedupeItems([...topRatedMovies, ...topRatedSeries])}
                />
              )}

              {/* Catalog picks */}
              {catalogItems.length > 0 && (
                <ContentRail
                  title="From the Catalog"
                  icon="library-outline"
                  iconColor={COLORS.textSecondary}
                  items={catalogItems}
                />
              )}

              {/* No data fallback */}
              {!featured && trendingMovies.length === 0 && trendingSeries.length === 0 && (
                <Panel
                  icon="film-outline"
                  title="Content loading..."
                  subtitle="Films and series will appear shortly. Pull down to refresh."
                />
              )}
            </View>
          </>
        )}

        {/* ── COLLECTIONS PANE ── */}
        {pane === "collections" && !isLoading && (
          <View style={styles.content}>
            {collectionsQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.accent} />
              </View>
            ) : collectionCards.length > 0 ? (
              collectionCards.map((coll) => (
                <View key={coll.id} style={styles.collectionSection}>
                  <View style={styles.collectionHeader}>
                    <ExpoImage
                      source={{ uri: coll.poster || undefined }}
                      style={styles.collectionPoster}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.collectionTitle}>{coll.name}</Text>
                      <Text style={styles.collectionMeta}>{coll.count} titles</Text>
                    </View>
                  </View>
                  {coll.items.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                      {coll.items.map((item) => (
                        <RealContentCard
                          key={item.id}
                          width={115}
                          item={toCardItem(item)}
                          onPress={() => navigateToDetail(item)}
                        />
                      ))}
                    </ScrollView>
                  )}
                </View>
              ))
            ) : (
              <Panel icon="albums-outline" title="No collections" subtitle="Collections will appear once data syncs." />
            )}
          </View>
        )}

        {/* ── PLATFORMS PANE ── */}
        {pane === "platforms" && !isLoading && (
          <View style={styles.content}>
            {platformGroups.length > 0 ? (
              <View style={styles.platformGrid}>
                {platformGroups.map((group) => (
                  <TouchableOpacity
                    key={group.name}
                    style={styles.platformCard}
                    activeOpacity={0.86}
                    onPress={() => { setQuery(group.name); setPane("search"); }}
                  >
                    <Text style={styles.platformTitle}>{group.name}</Text>
                    <Text style={styles.platformMeta}>{group.count} titles</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Panel icon="grid-outline" title="No platforms" subtitle="Studios and providers appear once metadata loads." />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ── Horizontal content rail ── */
function ContentRail({ title, icon, iconColor, items }: {
  title: string;
  icon: string;
  iconColor: string;
  items: UiItem[];
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={iconColor} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.slice(0, 16).map((item) => (
          <RealContentCard
            key={item.id}
            width={130}
            item={toCardItem(item)}
            onPress={() => navigateToDetail(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/* ── Navigation tabs ── */
function PaneTabs({ pane, onChange }: { pane: VodModulePane; onChange: (next: VodModulePane) => void }) {
  const tabs: { key: VodModulePane; label: string; icon: string }[] = [
    { key: "home", label: "Home", icon: "home-outline" },
    { key: "search", label: "Search", icon: "search-outline" },
    { key: "collections", label: "Collecties", icon: "albums-outline" },
    { key: "platforms", label: "Studio's", icon: "business-outline" },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
      {tabs.map((tab) => {
        const active = pane === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabPill, active && styles.tabPillActive]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.86}
          >
            <Ionicons
              name={(active ? tab.icon.replace("-outline", "") : tab.icon) as any}
              size={14}
              color={active ? COLORS.text : COLORS.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Panel({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={styles.panel}>
      <Ionicons name={icon as any} size={28} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingWrap: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 8,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: COLORS.glass,
    paddingHorizontal: 14,
  },
  tabPillActive: {
    backgroundColor: "rgba(229, 9, 20, 0.22)",
    borderColor: "rgba(229, 9, 20, 0.34)",
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tabTextActive: {
    color: COLORS.text,
  },
  content: {
    paddingHorizontal: 16,
    gap: 20,
    paddingTop: 8,
  },
  searchBoxWrap: {
    paddingHorizontal: 16,
    paddingTop: 2,
    gap: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    overflow: "hidden",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    paddingHorizontal: 10,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  filterRow: {
    gap: 8,
  },
  filterChip: {
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: COLORS.accentGlow,
    borderColor: COLORS.accentGlowStrong,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  filterTextActive: {
    color: COLORS.text,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },
  sectionCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginLeft: "auto",
  },
  rail: {
    paddingRight: 16,
    paddingBottom: 2,
  },
  searchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
  },
  collectionSection: {
    gap: 10,
  },
  collectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  collectionPoster: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: COLORS.card,
  },
  collectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  collectionMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  platformGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  platformCard: {
    width: "48%" as any,
    minHeight: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 14,
    justifyContent: "space-between",
  },
  platformTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  platformMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 20,
    gap: 4,
    alignItems: "center",
  },
  panelTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  panelSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
