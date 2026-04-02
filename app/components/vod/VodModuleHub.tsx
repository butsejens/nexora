import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
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

import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import {
  buildVodCatalogRootQuery,
  buildVodCollectionsQuery,
  buildVodHomeQuery,
  deriveCuratedHomeMedia,
} from "@/services/realtime-engine";
import { COLORS } from "@/constants/colors";

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
};

const FILTERS: { key: VodSearchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "TV Shows" },
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

function mapAnyToUiItems(items: any[]): UiItem[] {
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
        rating: Number(item?.rating || 0) || undefined,
        quality: String(item?.quality || "HD"),
        studio: String(item?.studios?.[0] || item?.productionCompanies?.[0]?.name || "").trim() || undefined,
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

export function VodModuleHub({ initialPane = "home", initialFilter = "all" }: VodModuleHubProps) {
  const insets = useSafeAreaInsets();
  const [pane, setPane] = useState<VodModulePane>(initialPane === "more" ? "home" : initialPane);
  const [filter, setFilter] = useState<VodSearchFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const homeQuery = useQuery(buildVodHomeQuery(true));
  const catalogQuery = useQuery(buildVodCatalogRootQuery(true));
  const collectionsQuery = useQuery(buildVodCollectionsQuery(true));

  const curated = useMemo(() => deriveCuratedHomeMedia(homeQuery.data), [homeQuery.data]);
  const homeItems = useMemo(
    () => mapAnyToUiItems([...(curated.movies || []), ...(curated.series || []), ...(curated.newReleases || [])]),
    [curated.movies, curated.newReleases, curated.series],
  );
  const catalogItems = useMemo(() => mapAnyToUiItems(catalogQuery.data?.items || []), [catalogQuery.data?.items]);

  const discoveryItems = useMemo(
    () => dedupeItems([...homeItems, ...catalogItems]),
    [catalogItems, homeItems],
  );

  const queryNorm = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return discoveryItems.filter((item) => {
      if (filter !== "all" && item.type !== filter) {
        if (!(filter === "anime" && /anime/i.test(item.title))) return false;
      }
      if (!queryNorm) return true;
      return `${item.title} ${item.studio || ""}`.toLowerCase().includes(queryNorm);
    });
  }, [discoveryItems, filter, queryNorm]);

  const platformGroups = useMemo(() => groupByPlatform(discoveryItems), [discoveryItems]);

  const collectionCards = useMemo(() => {
    const rows = Array.isArray(collectionsQuery.data) ? collectionsQuery.data : [];
    return rows.slice(0, 10).map((row: any, index: number) => ({
      id: String(row?.id || `collection-${index}`),
      name: String(row?.name || "Collection"),
      count: Number(row?.itemCount || 0),
      poster: row?.poster || row?.backdrop || null,
    }));
  }, [collectionsQuery.data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([homeQuery.refetch(), catalogQuery.refetch(), collectionsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <NexoraHeader
        variant="module"
        title="FILMS & SERIES"
        titleColor={COLORS.accent}
        showSearch
        showNotification
        showFavorites
        onSearch={() => setPane("search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
      />

      <PaneTabs pane={pane} onChange={setPane} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 92 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />}
      >
        <View style={styles.searchBoxWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search films, series or studios"
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
            onFocus={() => setPane("search")}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = item.key === filter;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.kpiRow}>
          <Kpi label="Catalog" value={String(discoveryItems.length)} />
          <Kpi label="Collections" value={String(collectionCards.length)} />
          <Kpi label="Studios" value={String(platformGroups.length)} />
        </View>

        {(pane === "home" || pane === "search") ? (
          <Section title={pane === "search" ? "Search Results" : "Trending"}>
            {(homeQuery.isLoading || catalogQuery.isLoading) && !filteredItems.length ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.accent} />
              </View>
            ) : filteredItems.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {filteredItems.slice(0, pane === "search" ? 30 : 14).map((item) => (
                  <RealContentCard
                    key={item.id}
                    width={130}
                    item={{
                      id: item.id,
                      title: item.title,
                      year: item.year || 0,
                      imdb: item.rating || 0,
                      quality: item.quality || "HD",
                      poster: item.poster,
                      backdrop: item.backdrop,
                    }}
                    onPress={() =>
                      router.push({
                        pathname: "/detail",
                        params: {
                          id: item.id,
                          type: item.type,
                          title: item.title,
                        },
                      })
                    }
                  />
                ))}
              </ScrollView>
            ) : (
              <Panel title="No results" subtitle="Try a different title or switch filter." />
            )}
          </Section>
        ) : null}

        {pane === "collections" ? (
          <Section title="Collections">
            {collectionCards.length ? (
              <View style={styles.grid}>
                {collectionCards.map((row) => (
                  <TouchableOpacity
                    key={row.id}
                    style={styles.collectionCard}
                    activeOpacity={0.85}
                    onPress={() => setQuery(row.name)}
                  >
                    <Text style={styles.collectionTitle}>{row.name}</Text>
                    <Text style={styles.collectionMeta}>{row.count} titles</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Panel title="No collections available" subtitle="Refresh to sync new curated bundles." />
            )}
          </Section>
        ) : null}

        {pane === "platforms" ? (
          <Section title="Platforms">
            {platformGroups.length ? (
              <View style={styles.grid}>
                {platformGroups.map((group) => (
                  <TouchableOpacity
                    key={group.name}
                    style={styles.platformCard}
                    activeOpacity={0.86}
                    onPress={() => {
                      setQuery(group.name);
                      setPane("search");
                    }}
                  >
                    <Text style={styles.platformTitle}>{group.name}</Text>
                    <Text style={styles.platformMeta}>{group.count} titles</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Panel title="No platform clusters" subtitle="Studios and providers will appear once metadata is synced." />
            )}
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PaneTabs({ pane, onChange }: { pane: VodModulePane; onChange: (next: VodModulePane) => void }) {
  const tabs: { key: VodModulePane; label: string }[] = [
    { key: "home", label: "Home" },
    { key: "search", label: "Search" },
    { key: "collections", label: "Collections" },
    { key: "platforms", label: "Platforms" },
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function Panel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.panel}>
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
    paddingVertical: 40,
    alignItems: "center",
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  tabPill: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  tabPillActive: {
    backgroundColor: COLORS.accentGlow,
    borderColor: COLORS.accentGlowStrong,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  tabTextActive: {
    color: COLORS.text,
  },
  content: {
    paddingHorizontal: 16,
    gap: 16,
  },
  searchBoxWrap: {
    marginTop: 4,
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  filterRow: {
    gap: 8,
  },
  filterChip: {
    minHeight: 34,
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
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  filterTextActive: {
    color: COLORS.text,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 12,
    justifyContent: "space-between",
  },
  kpiValue: {
    color: COLORS.text,
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
  },
  kpiLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },
  rail: {
    paddingRight: 12,
    paddingBottom: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  collectionCard: {
    width: "48%",
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 12,
    justifyContent: "space-between",
  },
  collectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  collectionMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  platformCard: {
    width: "48%",
    minHeight: 86,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 12,
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
    padding: 14,
    gap: 6,
  },
  panelTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  panelSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
});
