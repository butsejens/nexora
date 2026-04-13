import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
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
import { Ionicons } from "@expo/vector-icons";

import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import ContinueWatchingRail from "@/features/media/components/ContinueWatchingRail";
import CollectionRail from "@/features/media/components/CollectionRail";
import StudioGrid from "@/features/media/components/StudioGrid";
import { useRecommendations } from "@/hooks/useMedia";
import {
  getVodCatalogChunk,
  getVodCollections,
  getVodHomePayload,
  getVodStudios,
  mediaKeys,
  type VodCollectionPayload,
  type VodStudioPayload,
} from "@/lib/services/media-service";
import {
  buildCategoryRails,
  buildCollectionGroups,
  buildStudioGroups,
  type VodModuleItem,
} from "@/lib/vod-module";
import { useTranslation } from "@/lib/useTranslation";

const { width: SCREEN_W } = Dimensions.get("window");

type Pane = "home" | "movies" | "series" | "collections" | "studios";
type Filter =
  | "all"
  | "action"
  | "comedy"
  | "drama"
  | "thriller"
  | "family"
  | "horror"
  | "sci-fi"
  | "romance"
  | "adventure"
  | "animation"
  | "crime"
  | "documentary"
  | "mystery"
  | "fantasy"
  | "war"
  | "western"
  | "history";
type SortOrder = "default" | "newest" | "oldest";

type HubProps = {
  initialPane?: "home" | "search" | "collections" | "platforms" | "more";
  initialFilter?: "all" | "movie" | "series" | "anime";
};

function toType(item: VodModuleItem): "movie" | "series" {
  return item.type === "series" ? "series" : "movie";
}

function toMediaId(item: VodModuleItem): string {
  const raw = item.tmdbId || item.id;
  return String(raw || "").trim();
}

function toCardItem(item: VodModuleItem) {
  return {
    id: toMediaId(item),
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
    year: Number(item.year || 0) || 0,
    imdb: Number(item.rating || item.imdb || 0) || 0,
    quality: item.quality || "HD",
    synopsis: item.synopsis || item.overview,
    genre: item.genre,
    isTrending: item.isTrending,
    isNew: item.isNew,
    imdbRating: item.imdbRating,
    imdbVotes: item.imdbVotes,
    rottenTomatoesRating: item.rottenTomatoesRating,
    metacriticScore: item.metacriticScore,
  };
}

function goToMediaDetail(item: VodModuleItem) {
  const id = toMediaId(item);
  if (!id) return;
  router.push({
    pathname: "/media/detail",
    params: {
      id,
      type: toType(item),
      title: item.title,
      ...(item.poster ? { poster: item.poster } : {}),
      ...(item.backdrop ? { backdrop: item.backdrop } : {}),
      ...(item.year ? { year: String(item.year) } : {}),
      ...(item.synopsis ? { overview: item.synopsis } : {}),
      ...(item.tmdbId ? { tmdbId: String(item.tmdbId) } : {}),
    },
  });
}

function filterByGenre(
  items: VodModuleItem[],
  filter: Filter,
  query: string,
): VodModuleItem[] {
  const FILTER_GENRE_IDS: Record<Exclude<Filter, "all">, number[]> = {
    action: [28, 10759],
    comedy: [35],
    drama: [18],
    thriller: [53],
    family: [10751],
    horror: [27],
    "sci-fi": [878, 10765],
    romance: [10749, 10766],
    adventure: [12, 10759],
    animation: [16, 10762],
    crime: [80],
    documentary: [99],
    mystery: [9648],
    fantasy: [14],
    war: [10752, 10768],
    western: [37],
    history: [36, 10768],
  };

  const hasGenreMatch = (
    item: VodModuleItem,
    activeFilter: Exclude<Filter, "all">,
  ) => {
    const labels = Array.isArray(item.genre) ? item.genre : [];
    const byLabel = labels.some((label) =>
      String(label || "")
        .toLowerCase()
        .includes(activeFilter),
    );
    if (byLabel) return true;
    const ids = Array.isArray(item.genreIds)
      ? item.genreIds.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : [];
    const wanted = FILTER_GENRE_IDS[activeFilter] || [];
    return wanted.some((gid) => ids.includes(gid));
  };

  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    const haystack =
      `${item.title} ${item.synopsis || ""} ${(item.genre || []).join(" ")}`.toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (filter === "all") return true;
    return hasGenreMatch(item, filter);
  });
}

function sortByReleaseOrder(
  items: VodModuleItem[],
  order: SortOrder,
): VodModuleItem[] {
  if (order === "default") return items;
  const sorted = [...items].sort((a, b) => {
    const aDate = Date.parse(String(a.releaseDate || a.year || "")) || 0;
    const bDate = Date.parse(String(b.releaseDate || b.year || "")) || 0;
    return order === "newest" ? bDate - aDate : aDate - bDate;
  });
  return sorted;
}

function sortByRecent(items: VodModuleItem[]) {
  return [...items].sort((a, b) => {
    const aDate = Date.parse(String(a.releaseDate || a.year || "")) || 0;
    const bDate = Date.parse(String(b.releaseDate || b.year || "")) || 0;
    return bDate - aDate;
  });
}

export function VodModuleHub({
  initialPane = "home",
  initialFilter = "all",
}: HubProps) {
  const insets = useSafeAreaInsets();
  const { watchHistory } = useNexora();
  const { t } = useTranslation();

  const [pane, setPane] = useState<Pane>(() => {
    if (initialPane === "collections") return "collections";
    if (initialPane === "platforms") return "studios";
    if (initialFilter === "movie") return "movies";
    if (initialFilter === "series") return "series";
    return "home";
  });
  const [movieFilter, setMovieFilter] = useState<Filter>("all");
  const [seriesFilter, setSeriesFilter] = useState<Filter>("all");
  const [movieSort, setMovieSort] = useState<SortOrder>("default");
  const [seriesSort, setSeriesSort] = useState<SortOrder>("default");
  const [movieSearch, setMovieSearch] = useState("");
  const [seriesSearch, setSeriesSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const homeQuery = useQuery({
    queryKey: mediaKeys.vodHome(),
    queryFn: getVodHomePayload,
    staleTime: 120000,
  });
  const catalogQuery = useQuery({
    queryKey: mediaKeys.vodCatalog(null),
    queryFn: () => getVodCatalogChunk(null),
    staleTime: 120000,
  });
  const collectionsQuery = useQuery({
    queryKey: mediaKeys.vodCollections(),
    queryFn: getVodCollections,
    staleTime: 300000,
  });
  const studiosQuery = useQuery({
    queryKey: mediaKeys.vodStudios(),
    queryFn: getVodStudios,
    staleTime: 300000,
  });

  const recentTmdbIds = useMemo(
    () =>
      watchHistory
        .map((h) => Number(h.tmdbId || 0))
        .filter((v) => Number.isFinite(v) && v > 0)
        .slice(0, 12),
    [watchHistory],
  );
  const recommendationsQuery = useRecommendations(
    { recentTmdbIds },
    recentTmdbIds.length > 0,
  );

  const home = homeQuery.data;
  const featured = home?.featured || null;

  const allItems = useMemo(() => {
    const base = [
      ...(home?.allItems || []),
      ...(catalogQuery.data?.items || []),
    ];
    const seen = new Set<string>();
    const out: VodModuleItem[] = [];
    for (const item of base) {
      const key = `${item.type}:${toMediaId(item)}`;
      if (!item.title || !toMediaId(item) || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [home?.allItems, catalogQuery.data?.items]);

  const movieItems = useMemo(
    () => allItems.filter((item) => item.type === "movie"),
    [allItems],
  );
  const seriesItems = useMemo(
    () => allItems.filter((item) => item.type === "series"),
    [allItems],
  );

  const trendingMovies = home?.trendingMovies || [];
  const trendingSeries = home?.trendingSeries || [];
  const topRated = useMemo(() => {
    // Partial sort: only track top 20 instead of sorting entire array
    const top: VodModuleItem[] = [];
    for (const item of allItems) {
      const score = Number(item.rating || item.imdb || 0);
      if (top.length < 20) {
        top.push(item);
        top.sort(
          (a, b) =>
            Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0),
        );
      } else if (
        score >
        Number(top[top.length - 1].rating || top[top.length - 1].imdb || 0)
      ) {
        top[top.length - 1] = item;
        top.sort(
          (a, b) =>
            Number(b.rating || b.imdb || 0) - Number(a.rating || a.imdb || 0),
        );
      }
    }
    return top;
  }, [allItems]);
  const recentlyAdded = useMemo(
    () =>
      sortByRecent([
        ...(home?.recentMovies || []),
        ...(home?.recentSeries || []),
      ]).slice(0, 20),
    [home?.recentMovies, home?.recentSeries],
  );

  const recommendedItems = useMemo(() => {
    const rows = Array.isArray(recommendationsQuery.data)
      ? recommendationsQuery.data
      : [];
    return rows
      .map((item: any) => {
        const rawType = String(
          item?.type || item?.mediaType || item?.media_type || "movie",
        );
        const type =
          rawType === "series" || rawType === "tv" ? "series" : "movie";
        return {
          id: String(item?.id?.tmdbId || item?.tmdbId || item?.id || ""),
          tmdbId:
            Number(item?.id?.tmdbId || item?.tmdbId || item?.id || 0) || null,
          type,
          title: String(item?.title || item?.name || ""),
          poster: item?.posterUri || item?.poster || null,
          backdrop: item?.backdropUri || item?.backdrop || null,
          synopsis: item?.overview || null,
          year: item?.releaseYear || item?.year || null,
          rating: item?.rating || null,
          imdb: item?.rating || null,
          genre: Array.isArray(item?.genres)
            ? item.genres.map((g: any) => g?.name).filter(Boolean)
            : [],
        } as VodModuleItem;
      })
      .filter((item) => item.title && toMediaId(item))
      .slice(0, 20);
  }, [recommendationsQuery.data]);

  const continueWatching = useMemo(
    () =>
      watchHistory
        .filter(
          (row) =>
            (row.type === "movie" || row.type === "series") &&
            Number(row.progress || 0) > 0 &&
            Number(row.progress || 0) < 0.97,
        )
        .sort(
          (a, b) =>
            Date.parse(String(b.lastWatched || "")) -
            Date.parse(String(a.lastWatched || "")),
        )
        .slice(0, 18)
        .map((row) => ({
          id: String(row.id || row.contentId || row.tmdbId || ""),
          tmdbId: row.tmdbId,
          type: row.type as "movie" | "series",
          title: row.title,
          poster: row.poster || null,
          backdrop: row.backdrop || null,
          progress: Number(row.progress || 0),
          season: row.season,
          episode: row.episode,
        })),
    [watchHistory],
  );

  const filteredMovies = useMemo(
    () => filterByGenre(movieItems, movieFilter, movieSearch),
    [movieFilter, movieItems, movieSearch],
  );
  const filteredSeries = useMemo(
    () => filterByGenre(seriesItems, seriesFilter, seriesSearch),
    [seriesFilter, seriesItems, seriesSearch],
  );
  const movieStrictFilterMode =
    movieFilter !== "all" || movieSearch.trim().length > 0;
  const seriesStrictFilterMode =
    seriesFilter !== "all" || seriesSearch.trim().length > 0;

  const sortedFilteredMovies = useMemo(
    () => sortByReleaseOrder(filteredMovies, movieSort),
    [filteredMovies, movieSort],
  );
  const sortedFilteredSeries = useMemo(
    () => sortByReleaseOrder(filteredSeries, seriesSort),
    [filteredSeries, seriesSort],
  );

  const movieRails = useMemo(() => {
    const source = movieStrictFilterMode ? sortedFilteredMovies : movieItems;
    return buildCategoryRails(source, 18).map((rail) => ({
      ...rail,
      items: sortByReleaseOrder(rail.items, movieSort),
    }));
  }, [movieItems, movieSort, movieStrictFilterMode, sortedFilteredMovies]);

  const seriesRails = useMemo(() => {
    const source = seriesStrictFilterMode ? sortedFilteredSeries : seriesItems;
    return buildCategoryRails(source, 18).map((rail) => ({
      ...rail,
      items: sortByReleaseOrder(rail.items, seriesSort),
    }));
  }, [seriesItems, seriesSort, seriesStrictFilterMode, sortedFilteredSeries]);

  const resolvedCollections = useMemo(() => {
    const normalizeCollectionName = (name: string) =>
      String(name || "")
        .replace(/\s*[-:]?\s*(collection|collectie)\s*$/i, "")
        .trim()
        .toLowerCase();
    const apiCollections = (collectionsQuery.data ||
      []) as VodCollectionPayload[];
    const groupedCollections = buildCollectionGroups(allItems || [])
      .filter((group) => (group.itemCount || 0) > 0)
      .map((group) => ({
        id: group.key,
        ids: group.collectionId ? String(group.collectionId) : undefined,
        name: group.name,
        itemCount: group.itemCount,
        items: group.items,
        poster: group.posterUri || null,
        backdrop: group.bannerUri || null,
      }));
    return [...apiCollections, ...groupedCollections].filter(
      (entry, index, arr) =>
        arr.findIndex(
          (candidate) =>
            String(candidate.id).toLowerCase() ===
              String(entry.id).toLowerCase() ||
            normalizeCollectionName(candidate.name) ===
              normalizeCollectionName(entry.name),
        ) === index,
    );
  }, [allItems, collectionsQuery.data]);

  const resolvedStudios = useMemo(() => {
    const apiStudios = (studiosQuery.data || []) as VodStudioPayload[];
    const groupedStudios = buildStudioGroups(allItems || [])
      .filter((group) => (group.itemCount || 0) > 0)
      .map((group) => ({
        id: String(group.id || group.name),
        name: group.name,
        logo: group.logoUri || null,
        poster: group.items[0]?.poster || null,
        backdrop: group.items[0]?.backdrop || group.items[0]?.poster || null,
        itemCount: group.itemCount,
        items: group.items,
      }));
    return [...apiStudios, ...groupedStudios].filter(
      (entry, index, arr) =>
        arr.findIndex(
          (candidate) =>
            String(candidate.id).toLowerCase() ===
            String(entry.id).toLowerCase(),
        ) === index,
    );
  }, [allItems, studiosQuery.data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        homeQuery.refetch(),
        catalogQuery.refetch(),
        collectionsQuery.refetch(),
        studiosQuery.refetch(),
        recommendationsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const busy = homeQuery.isLoading && !home;

  return (
    <View style={styles.screen}>
      <View style={styles.headerShell}>
        <NexoraHeader
          variant="module"
          title={t("vod.title")}
          titleColor={COLORS.accent}
          showBack
          showSearch
          showNotification
          showFavorites
          onSearch={() => setPane("movies")}
          onNotification={() => router.push("/follow-center")}
          onFavorites={() => router.push("/favorites")}
        />
        <PaneTabs pane={pane} onChange={setPane} t={t} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {busy && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("vod.loadingMedia")}</Text>
          </View>
        )}

        {!busy && pane === "home" && (
          <>
            {featured ? (
              <RealHeroBanner
                item={toCardItem(featured)}
                onPlay={() => goToMediaDetail(featured)}
                onInfo={() => goToMediaDetail(featured)}
              />
            ) : null}

            <View style={styles.content}>
              <ContentRail
                title={t("vod.trendingMovies")}
                icon="flame"
                items={trendingMovies}
              />
              <ContentRail
                title={t("vod.trendingSeries")}
                icon="tv-outline"
                items={trendingSeries}
              />

              <ContinueWatchingRail
                items={continueWatching as any}
                onItemPress={(item) => {
                  router.push({
                    pathname: "/media/detail",
                    params: {
                      id: String(item.tmdbId || item.id),
                      type: item.type,
                      title: item.title,
                      ...(item.poster ? { poster: item.poster } : {}),
                      ...(item.backdrop ? { backdrop: item.backdrop } : {}),
                      ...(item.tmdbId ? { tmdbId: String(item.tmdbId) } : {}),
                    },
                  });
                }}
              />

              <ContentRail
                title={t("vod.recommended")}
                icon="sparkles"
                items={recommendedItems}
              />
              <CollectionRail
                collections={resolvedCollections}
                title={t("vod.collections")}
                limit={6}
                onSeeAll={() => setPane("collections")}
              />
              <StudioGrid
                studios={resolvedStudios}
                title={t("vod.studios")}
                limit={6}
                onSeeAll={() => setPane("studios")}
              />
              <ContentRail
                title={t("vod.topRated")}
                icon="star"
                items={topRated}
              />
              <ContentRail
                title={t("vod.recentlyAdded")}
                icon="time-outline"
                items={recentlyAdded}
              />
            </View>
          </>
        )}

        {!busy && pane === "movies" && (
          <View style={styles.content}>
            <CatalogHeader
              title={t("vod.movies")}
              value={movieSearch}
              onChangeText={setMovieSearch}
              filter={movieFilter}
              onFilterChange={setMovieFilter}
              sort={movieSort}
              onSortChange={setMovieSort}
              searchPlaceholder={t("vod.searchMovies")}
            />
            {!movieStrictFilterMode &&
              movieRails
                .slice(0, 6)
                .map((rail) => (
                  <ContentRail
                    key={rail.key}
                    title={rail.label}
                    icon="film-outline"
                    items={rail.items}
                  />
                ))}
            <GridSection
              title={t("vod.allMovies")}
              items={sortedFilteredMovies}
              emptyText={t("vod.noItemsFound")}
            />
          </View>
        )}

        {!busy && pane === "series" && (
          <View style={styles.content}>
            <CatalogHeader
              title={t("vod.series")}
              value={seriesSearch}
              onChangeText={setSeriesSearch}
              filter={seriesFilter}
              onFilterChange={setSeriesFilter}
              sort={seriesSort}
              onSortChange={setSeriesSort}
              searchPlaceholder={t("vod.searchSeries")}
            />
            {!seriesStrictFilterMode &&
              seriesRails
                .slice(0, 6)
                .map((rail) => (
                  <ContentRail
                    key={rail.key}
                    title={rail.label}
                    icon="albums-outline"
                    items={rail.items}
                  />
                ))}
            <GridSection
              title={t("vod.allSeries")}
              items={sortedFilteredSeries}
              emptyText={t("vod.noItemsFound")}
            />
          </View>
        )}

        {!busy && pane === "collections" && (
          <View style={styles.content}>
            {collectionsQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.loadingText}>{t("vod.loadingMedia")}</Text>
              </View>
            ) : resolvedCollections.length === 0 ? (
              <Text style={styles.emptyText}>{t("vod.noItemsFound")}</Text>
            ) : (
              <CollectionRail
                collections={resolvedCollections.map((collection) => ({
                  ...collection,
                  items: [...collection.items].sort((a, b) => {
                    const aDate =
                      Date.parse(String(a.releaseDate || a.year || "")) || 0;
                    const bDate =
                      Date.parse(String(b.releaseDate || b.year || "")) || 0;
                    return aDate - bDate;
                  }),
                }))}
                title={t("vod.collections")}
              />
            )}
          </View>
        )}

        {!busy && pane === "studios" && (
          <View style={styles.content}>
            {studiosQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.loadingText}>{t("vod.loadingMedia")}</Text>
              </View>
            ) : resolvedStudios.length === 0 ? (
              <Text style={styles.emptyText}>{t("vod.noItemsFound")}</Text>
            ) : (
              <StudioGrid studios={resolvedStudios} title={t("vod.studios")} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );

  function ContentRail({
    title,
    icon,
    items,
  }: {
    title: string;
    icon: string;
    items: VodModuleItem[];
  }) {
    if (!items.length) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={icon as any} size={16} color={COLORS.accent} />
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionCount}>{items.length}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {items.slice(0, 20).map((item) => (
            <RealContentCard
              key={`${item.type}-${toMediaId(item)}`}
              width={130}
              item={toCardItem(item)}
              onPress={() => goToMediaDetail(item)}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  function GridSection({
    title,
    items,
    emptyText,
  }: {
    title: string;
    items: VodModuleItem[];
    emptyText?: string;
  }) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionCount}>{items.length}</Text>
        </View>
        <FlatList
          data={items.slice(0, 60)}
          keyExtractor={(item) => `${item.type}-${toMediaId(item)}`}
          numColumns={3}
          scrollEnabled={false}
          columnWrapperStyle={styles.gridRow}
          maxToRenderPerBatch={9}
          windowSize={3}
          removeClippedSubviews={true}
          initialNumToRender={9}
          renderItem={({ item }) => (
            <RealContentCard
              width={(SCREEN_W - 48) / 3}
              item={toCardItem(item)}
              onPress={() => goToMediaDetail(item)}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {emptyText || "No items found for this filter."}
            </Text>
          }
        />
      </View>
    );
  }
}

function PaneTabs({
  pane,
  onChange,
  t,
}: {
  pane: Pane;
  onChange: (next: Pane) => void;
  t: (key: string) => string;
}) {
  const tabs: { key: Pane; labelKey: string; icon: string }[] = [
    { key: "home", labelKey: "vod.home", icon: "home-outline" },
    { key: "movies", labelKey: "vod.movies", icon: "film-outline" },
    { key: "series", labelKey: "vod.series", icon: "albums-outline" },
    { key: "collections", labelKey: "vod.collections", icon: "albums" },
    { key: "studios", labelKey: "vod.studios", icon: "business-outline" },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabRow}
    >
      {tabs.map((tab) => {
        const active = pane === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabPill, active && styles.tabPillActive]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={tab.icon as any}
              size={14}
              color={active ? COLORS.text : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {t(tab.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function CatalogHeader({
  title,
  value,
  onChangeText,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  searchPlaceholder,
}: {
  title: string;
  value: string;
  onChangeText: (text: string) => void;
  filter: Filter;
  onFilterChange: (next: Filter) => void;
  sort: SortOrder;
  onSortChange: (next: SortOrder) => void;
  searchPlaceholder?: string;
}) {
  const filters: Filter[] = [
    "all",
    "action",
    "comedy",
    "drama",
    "horror",
    "sci-fi",
    "thriller",
    "romance",
    "adventure",
    "animation",
    "crime",
    "documentary",
    "mystery",
    "fantasy",
    "family",
    "war",
    "western",
    "history",
  ];
  const sortModes: { key: SortOrder; label: string }[] = [
    { key: "default", label: "Relevant" },
    { key: "newest", label: "Nieuw -> Oud" },
    { key: "oldest", label: "Oud -> Nieuw" },
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  const activeSortLabel =
    sortModes.find((entry) => entry.key === sort)?.label || "Relevant";

  return (
    <View style={styles.catalogHeader}>
      <Text style={styles.catalogTitle}>{title}</Text>
      <View style={styles.searchRow}>
        <Ionicons
          name="search"
          size={16}
          color={COLORS.textMuted}
          style={{ marginLeft: 10 }}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={searchPlaceholder || `Search ${title.toLowerCase()}...`}
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
        />
      </View>
      <TouchableOpacity
        style={styles.menuTrigger}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="options-outline" size={16} color={COLORS.accent} />
        <Text
          style={styles.menuTriggerText}
        >{`Filter: ${filter.toUpperCase()}  •  Sort: ${activeSortLabel}`}</Text>
      </TouchableOpacity>

      <Modal
        visible={menuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={styles.menuSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Keuze menu</Text>
              <TouchableOpacity onPress={() => setMenuOpen(false)}>
                <Ionicons name="close" size={18} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.menuSectionTitle}>Genre</Text>
            <View style={styles.menuRowWrap}>
              {filters.map((entry) => {
                const active = filter === entry;
                return (
                  <TouchableOpacity
                    key={entry}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                    onPress={() => onFilterChange(entry)}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        active && styles.filterTextActive,
                      ]}
                    >
                      {entry.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.menuSectionTitle}>Sortering</Text>
            <View style={styles.menuRowWrap}>
              {sortModes.map((entry) => {
                const active = sort === entry.key;
                return (
                  <TouchableOpacity
                    key={entry.key}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                    onPress={() => onSortChange(entry.key)}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        active && styles.filterTextActive,
                      ]}
                    >
                      {entry.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  headerShell: {
    backgroundColor: COLORS.background,
    zIndex: 10,
    elevation: 10,
  },
  loadingWrap: { paddingTop: 54, alignItems: "center", gap: 12 },
  loadingText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },

  tabRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 8 },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 35,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glass,
    paddingHorizontal: 12,
  },
  tabPillActive: {
    backgroundColor: "rgba(229,9,20,0.2)",
    borderColor: "rgba(229,9,20,0.32)",
  },
  tabText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  tabTextActive: { color: COLORS.text },

  content: { paddingHorizontal: 16, paddingTop: 10, gap: 20 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  sectionCount: {
    marginLeft: "auto",
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  rail: { paddingRight: 16 },

  catalogHeader: { gap: 10 },
  catalogTitle: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    paddingHorizontal: 8,
  },
  filterRow: { gap: 8 },
  menuTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  menuTriggerText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
    maxHeight: "75%",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  menuTitle: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 18,
  },
  menuSectionTitle: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    marginTop: 2,
  },
  menuRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    paddingHorizontal: 11,
  },
  filterChipActive: {
    backgroundColor: COLORS.accentGlow,
    borderColor: COLORS.accentGlowStrong,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  filterTextActive: { color: COLORS.text },

  gridRow: { justifyContent: "space-between", marginBottom: 10 },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
});
