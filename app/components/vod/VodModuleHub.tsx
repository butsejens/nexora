import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { SafeHaptics } from "@/lib/safeHaptics";
import {
  getMovieFull,
  getSeriesFull,
  getVodCatalogChunk,
  getVodCollections,
  getVodHomePayload,
  getVodStudios,
  mediaKeys,
  searchMedia,
} from "@/lib/services/media-service";
import { buildMoodRecommendations, createContinueWatching } from "@/lib/vod-curation";
import {
  buildCategoryRails,
  buildCollectionGroups,
  buildStudioGroups,
  enrichVodModuleItem,
  filterBySearchFilter,
  type VodCollectionGroup,
  type VodModuleItem,
  type VodModulePane,
  type VodSearchFilter,
  type VodStudioGroup,
} from "@/lib/vod-module";
import {
  buildVodCatalogRootQuery,
  buildVodCollectionsQuery,
  buildVodHomeQuery,
  buildVodStudiosQuery,
} from "@/services/realtime-engine";

type VodModuleHubProps = {
  initialPane?: VodModulePane;
  initialFilter?: VodSearchFilter;
};

type PlatformGroup = {
  key: string;
  label: string;
  logoUri?: string | null;
  fallbackColor?: string;
  totalCount: number;
  items: VodModuleItem[];
};

const SEARCH_FILTERS: { key: VodSearchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "TV Shows" },
  { key: "anime", label: "Anime" },
];

const PLATFORM_PROVIDER_CONFIG: {
  key: string;
  label: string;
  aliases: string[];
  logoUri: string;
  fallbackColor: string;
}[] = [
  { key: "netflix", label: "Netflix", aliases: ["netflix"], logoUri: "https://logo.clearbit.com/netflix.com?size=256", fallbackColor: "#E50914" },
  { key: "disney", label: "Disney+", aliases: ["disney", "walt disney", "pixar", "marvel studios"], logoUri: "https://logo.clearbit.com/disneyplus.com?size=256", fallbackColor: "#113CCF" },
  { key: "prime", label: "Prime Video", aliases: ["amazon", "prime video", "amazon studios"], logoUri: "https://logo.clearbit.com/primevideo.com?size=256", fallbackColor: "#00A8E1" },
  { key: "hbo", label: "HBO Max", aliases: ["hbo", "max"], logoUri: "https://logo.clearbit.com/max.com?size=256", fallbackColor: "#7F2BFF" },
  { key: "apple", label: "Apple TV+", aliases: ["apple", "apple tv"], logoUri: "https://logo.clearbit.com/tv.apple.com?size=256", fallbackColor: "#A5A5A5" },
  { key: "paramount", label: "Paramount+", aliases: ["paramount", "paramount+"], logoUri: "https://logo.clearbit.com/paramountplus.com?size=256", fallbackColor: "#1A4DFF" },
  { key: "hulu", label: "Hulu", aliases: ["hulu", "fx productions", "searchlight"], logoUri: "https://logo.clearbit.com/hulu.com?size=256", fallbackColor: "#1CE783" },
  { key: "peacock", label: "Peacock", aliases: ["peacock", "nbcuniversal", "focus features"], logoUri: "https://logo.clearbit.com/peacocktv.com?size=256", fallbackColor: "#FFD400" },
  { key: "crunchyroll", label: "Crunchyroll", aliases: ["crunchyroll", "funimation", "anime"], logoUri: "https://logo.clearbit.com/crunchyroll.com?size=256", fallbackColor: "#F47521" },
  { key: "youtube", label: "YouTube", aliases: ["youtube", "google"], logoUri: "https://logo.clearbit.com/youtube.com?size=256", fallbackColor: "#FF0000" },
  { key: "mubi", label: "Mubi", aliases: ["mubi"], logoUri: "https://logo.clearbit.com/mubi.com?size=256", fallbackColor: "#0F0F0F" },
  { key: "lionsgate", label: "Lionsgate", aliases: ["lionsgate"], logoUri: "https://logo.clearbit.com/lionsgate.com?size=256", fallbackColor: "#1F4FFF" },
  { key: "sony", label: "Sony", aliases: ["sony pictures", "columbia pictures", "screen gems"], logoUri: "https://logo.clearbit.com/sonypictures.com?size=256", fallbackColor: "#1A1A1A" },
  { key: "a24", label: "A24", aliases: ["a24"], logoUri: "https://logo.clearbit.com/a24films.com?size=256", fallbackColor: "#D8D8D8" },
  { key: "universal", label: "Universal", aliases: ["universal", "illumination", "dreamworks"], logoUri: "https://logo.clearbit.com/universalpictures.com?size=256", fallbackColor: "#0046FF" },
  { key: "warner", label: "Warner Bros", aliases: ["warner", "dc studios", "new line cinema"], logoUri: "https://logo.clearbit.com/warnerbros.com?size=256", fallbackColor: "#1D4ED8" },
  { key: "mgm", label: "MGM", aliases: ["mgm"], logoUri: "https://logo.clearbit.com/mgm.com?size=256", fallbackColor: "#A78733" },
];

async function fetchDetail(type: "movie" | "series", id: string | number) {
  return type === "movie" ? getMovieFull(Number(id)) : getSeriesFull(Number(id));
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

function buildPlatformGroups(items: VodModuleItem[]): PlatformGroup[] {
  const normalized = (value: unknown) => String(value || "").toLowerCase();
  return PLATFORM_PROVIDER_CONFIG
    .map((provider) => {
      const filtered = items.filter((item) => {
        const haystack = normalized([
          ...(item.studios || []),
          ...((item.productionCompanies || []).map((company) => company?.name || "")),
          ...(item.keywords || []),
          item.title,
        ].join(" "));
        return provider.aliases.some((alias) => haystack.includes(alias));
      });
      return {
        key: provider.key,
        label: provider.label,
        logoUri: provider.logoUri,
        fallbackColor: provider.fallbackColor,
        totalCount: dedupeModuleItems(filtered).length,
        items: dedupeModuleItems(filtered).slice(0, 24),
      };
    })
    .filter((group) => group.totalCount > 0)
    .sort((left, right) => right.totalCount - left.totalCount || left.label.localeCompare(right.label));
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
      {group.bannerUri ? (
        <ExpoImage
          source={{ uri: group.bannerUri }}
          style={styles.collectionImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : <View style={styles.collectionFallback} />}
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
          <ExpoImage
            source={{ uri: group.logoUri }}
            style={styles.studioLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : (
          <Text style={styles.studioLogoFallback}>{group.name.slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.studioTitle} numberOfLines={2}>{group.name}</Text>
      <Text style={styles.studioInfo}>{group.itemCount} titles</Text>
    </TouchableOpacity>
  );
}

function CollectionSkeletonCard({ pulse }: { pulse: Animated.Value }) {
  return (
    <Animated.View style={[styles.collectionSkeletonCard, { opacity: pulse }]}>
      <View style={styles.collectionSkeletonOverlay} />
      <View style={styles.collectionSkeletonMeta}>
        <View style={styles.collectionSkeletonLabel} />
        <View style={styles.collectionSkeletonTitle} />
        <View style={styles.collectionSkeletonInfo} />
      </View>
    </Animated.View>
  );
}

function PlatformSkeletonCard({ pulse }: { pulse: Animated.Value }) {
  return (
    <Animated.View style={[styles.platformSkeletonCard, { opacity: pulse }]}>
      <View style={styles.platformSkeletonLogoWrap}>
        <View style={styles.platformSkeletonLogo} />
      </View>
      <View style={styles.platformSkeletonTitle} />
      <View style={styles.platformSkeletonMeta} />
    </Animated.View>
  );
}

function PlatformCard({
  platform,
  onPress,
}: {
  platform: PlatformGroup;
  onPress: () => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const shouldUseFallback = !platform.logoUri || logoFailed;

  return (
    <TouchableOpacity style={styles.platformCard} onPress={onPress} activeOpacity={0.84}>
      <View style={[styles.platformBrandBar, { backgroundColor: platform.fallbackColor || COLORS.accent }]} />
      <View
        style={[
          styles.platformLogoWrap,
          shouldUseFallback && {
            backgroundColor: `${platform.fallbackColor || "#E50914"}26`,
            borderColor: "transparent",
          },
        ]}
      >
        {shouldUseFallback ? (
          <Text style={styles.platformLogoFallback}>{platform.label.slice(0, 2).toUpperCase()}</Text>
        ) : (
          <ExpoImage
            source={{ uri: platform.logoUri as string }}
            style={styles.platformLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
            onError={() => setLogoFailed(true)}
          />
        )}
      </View>
      <View style={[styles.platformLogoGlow, { backgroundColor: `${platform.fallbackColor || "#E50914"}1F` }]} />
      <Text style={styles.platformTitle}>{platform.label}</Text>
      <Text style={styles.platformMeta}>{platform.totalCount} titles</Text>
    </TouchableOpacity>
  );
}

export function VodModuleHub({ initialPane = "home", initialFilter = "all" }: VodModuleHubProps) {
  useRenderTelemetry("VodModuleHub", { pane: initialPane });

  const queryClient = useQueryClient();
  const { isFavorite, toggleFavorite, watchHistory } = useNexora();
  const [activePane, setActivePane] = useState<VodModulePane>(
    initialPane === "more" ? "home" : initialPane
  );
  const [searchFilter, setSearchFilter] = useState<VodSearchFilter>(initialFilter);
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [deepCatalogEnabled, setDeepCatalogEnabled] = useState(false);
  const skeletonPulse = React.useRef(new Animated.Value(0.58)).current;
  const deferredQuery = useDeferredValue(query.trim());
  const isDiscoveryPane = activePane === "home" || activePane === "collections" || activePane === "platforms";

  useEffect(() => {
    // Keep first paint fast, then hydrate deeper catalog in idle time.
    let isMounted = true;
    const interaction = InteractionManager.runAfterInteractions(() => {
      if (!isMounted) return;
      setTimeout(() => {
        if (isMounted) setDeepCatalogEnabled(true);
      }, 650);
    });
    return () => {
      isMounted = false;
      interaction.cancel();
    };
  }, []);

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 1,
          duration: 820,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.58,
          duration: 820,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [skeletonPulse]);

  const homeQuery = useQuery(buildVodHomeQuery(isDiscoveryPane));

  const searchQuery = useQuery({
    queryKey: mediaKeys.search(deferredQuery),
    queryFn: () => searchMedia(deferredQuery),
    enabled: activePane === "search" && deferredQuery.length >= 2,
    staleTime: 10 * 60 * 1000,
  });

  const catalogChunkOneQuery = useQuery(buildVodCatalogRootQuery(isDiscoveryPane && deepCatalogEnabled && Boolean(homeQuery.data)));

  const catalogChunkTwoQuery = useQuery({
    queryKey: mediaKeys.vodCatalog(catalogChunkOneQuery.data?.meta?.nextCursorYear || null),
    queryFn: () => getVodCatalogChunk(catalogChunkOneQuery.data?.meta?.nextCursorYear || null),
    enabled: deepCatalogEnabled && isDiscoveryPane && Boolean(catalogChunkOneQuery.data?.meta?.nextCursorYear),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const catalogChunkThreeQuery = useQuery({
    queryKey: mediaKeys.vodCatalog(catalogChunkTwoQuery.data?.meta?.nextCursorYear || null),
    queryFn: () => getVodCatalogChunk(catalogChunkTwoQuery.data?.meta?.nextCursorYear || null),
    enabled: deepCatalogEnabled && isDiscoveryPane && Boolean(catalogChunkTwoQuery.data?.meta?.nextCursorYear),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const catalogChunkFourQuery = useQuery({
    queryKey: mediaKeys.vodCatalog(catalogChunkThreeQuery.data?.meta?.nextCursorYear || null),
    queryFn: () => getVodCatalogChunk(catalogChunkThreeQuery.data?.meta?.nextCursorYear || null),
    enabled: deepCatalogEnabled && isDiscoveryPane && Boolean(catalogChunkThreeQuery.data?.meta?.nextCursorYear),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const curatedCollectionsQuery = useQuery(buildVodCollectionsQuery(isDiscoveryPane));

  const curatedStudiosQuery = useQuery(buildVodStudiosQuery(isDiscoveryPane));

  useEffect(() => {
    if (activePane === "search") return;
    const interaction = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        queryClient.prefetchQuery({ queryKey: mediaKeys.vodHome(), queryFn: getVodHomePayload, staleTime: 15 * 60 * 1000 }).catch(() => undefined);
        queryClient.prefetchQuery({ queryKey: mediaKeys.vodCollections(), queryFn: getVodCollections, staleTime: 60 * 60 * 1000 }).catch(() => undefined);
        queryClient.prefetchQuery({ queryKey: mediaKeys.vodStudios(), queryFn: getVodStudios, staleTime: 60 * 60 * 1000 }).catch(() => undefined);
      }, 320);
    });
    return () => interaction.cancel();
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

  const fastDiscoveryItems = useMemo(() => {
    const homeItems = homeQuery.data?.allItems || [];
    const curatedCollectionItems = (curatedCollectionsQuery.data || []).flatMap((collection) => collection.items || []);
    const curatedStudioItems = (curatedStudiosQuery.data || []).flatMap((studio) => studio.items || []);
    return dedupeModuleItems([...homeItems, ...curatedCollectionItems, ...curatedStudioItems]);
  }, [curatedCollectionsQuery.data, curatedStudiosQuery.data, homeQuery.data?.allItems]);

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
    const grouped = buildCollectionGroups(deepCatalogEnabled ? allItems : fastDiscoveryItems);
    return [...curated, ...grouped]
      .filter((group, index, arr) => arr.findIndex((entry) => entry.key === group.key || normalizeTitle(entry.name) === normalizeTitle(group.name)) === index)
      .slice(0, 120);
  }, [allItems, curatedCollectionsQuery.data, deepCatalogEnabled, fastDiscoveryItems]);
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
  const platforms = useMemo(() => buildPlatformGroups(deepCatalogEnabled ? allItems : fastDiscoveryItems), [allItems, deepCatalogEnabled, fastDiscoveryItems]);
  const featured = homeQuery.data?.featured || null;
  const showCollectionSkeleton = collections.length === 0 && (homeQuery.isLoading || curatedCollectionsQuery.isLoading);
  const showPlatformSkeleton = platforms.length === 0 && (homeQuery.isLoading || catalogChunkOneQuery.isLoading);

  const availableGenres = useMemo(() => {
    const labels = new Set<string>();
    for (const item of allItems) {
      for (const genre of item.genre || []) {
        if (genre) labels.add(String(genre));
      }
    }
    return ["all", ...Array.from(labels).sort((a, b) => a.localeCompare(b)).slice(0, 18)];
  }, [allItems]);

  const availablePlatforms = useMemo(() => {
    return ["all", ...platforms.map((platform) => platform.label)];
  }, [platforms]);

  const prioritizedImageUris = useMemo(() => {
    const candidateUris = [
      featured?.backdrop,
      featured?.poster,
      ...platforms.map((platform) => platform.logoUri),
      ...collections.slice(0, 16).flatMap((collection) => [collection.bannerUri, collection.posterUri]),
      ...studios.slice(0, 12).map((studio) => studio.logoUri),
      ...allItems.slice(0, 48).flatMap((item) => [item.poster, item.backdrop]),
    ];

    const unique = new Set<string>();
    for (const value of candidateUris) {
      const uri = String(value || "").trim();
      if (!uri || (!uri.startsWith("http://") && !uri.startsWith("https://"))) continue;
      unique.add(uri);
      if (unique.size >= 72) break;
    }

    return Array.from(unique);
  }, [allItems, collections, featured?.backdrop, featured?.poster, platforms, studios]);

  useEffect(() => {
    if (!prioritizedImageUris.length) return;
    ExpoImage.prefetch(prioritizedImageUris).catch(() => undefined);
  }, [prioritizedImageUris]);

  const selectedPlatform = useMemo(() => {
    if (platformFilter === "all") return null;
    return platforms.find((platform) => platform.label.toLowerCase() === platformFilter.toLowerCase()) || null;
  }, [platformFilter, platforms]);

  const applyAdvancedFilters = useMemo(() => {
    return (items: VodModuleItem[]) => {
      const normalizedPlatform = platformFilter.toLowerCase();
      return items.filter((item) => {
        if (genreFilter !== "all") {
          const matchesGenre = (item.genre || []).some((genre) => String(genre).toLowerCase() === genreFilter.toLowerCase());
          if (!matchesGenre) return false;
        }

        if (yearFilter !== "all") {
          const itemYear = Number(String(item.year || "").slice(0, 4));
          if (!Number.isFinite(itemYear)) return false;
          if (yearFilter === "2020s" && itemYear < 2020) return false;
          if (yearFilter === "2010s" && (itemYear < 2010 || itemYear > 2019)) return false;
          if (yearFilter === "2000s" && (itemYear < 2000 || itemYear > 2009)) return false;
          if (yearFilter === "classic" && itemYear >= 2000) return false;
        }

        if (platformFilter !== "all") {
          const selectedProvider = PLATFORM_PROVIDER_CONFIG.find(
            (provider) => provider.label.toLowerCase() === normalizedPlatform || provider.key.toLowerCase() === normalizedPlatform
          );
          const platformAliases = selectedProvider?.aliases?.length ? selectedProvider.aliases : [normalizedPlatform];
          const haystack = [
            ...(item.studios || []),
            ...((item.productionCompanies || []).map((company) => company?.name || "")),
            ...(item.keywords || []),
            item.title,
          ].join(" ").toLowerCase();
          if (!platformAliases.some((alias) => haystack.includes(alias))) return false;
        }

        return true;
      });
    };
  }, [genreFilter, platformFilter, yearFilter]);

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
    return applyAdvancedFilters(filterBySearchFilter(combined, searchFilter));
  }, [applyAdvancedFilters, searchFilter, searchQuery.data]);

  const filteredCatalogResults = useMemo(() => {
    const typeFiltered = filterBySearchFilter(allItems, searchFilter);
    return applyAdvancedFilters(typeFiltered).slice(0, 180);
  }, [allItems, applyAdvancedFilters, searchFilter]);


  const warmDetailPayload = (item: VodModuleItem) => {
    const tmdbId = item.tmdbId ? String(item.tmdbId) : item.id;
    queryClient.prefetchQuery({
      queryKey: ["detail", item.type, tmdbId],
      queryFn: () => fetchDetail(item.type, tmdbId),
      staleTime: 10 * 60 * 1000,
    }).catch(() => undefined);
  };

  const goToDetail = (item: VodModuleItem) => {
    warmDetailPayload(item);
    const tmdbId = item.tmdbId ? String(item.tmdbId) : undefined;
    const preferredId = tmdbId || String(item.id);
    router.push({
      pathname: "/detail",
      params: {
        id: preferredId,
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
        title="Films & Series"
        titleColor={COLORS.accent}
        showSearch
        showNotification
        showFavorites
        onSearch={() => router.push("/(tabs)/search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {homeQuery.isLoading && !homeQuery.data ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.loadingText}>Building premium catalog...</Text>
          </View>
        ) : null}

        {/* Empty / error state — only when all sources are exhausted */}
        {activePane === "home" && deepCatalogEnabled && !homeQuery.isLoading && !catalogChunkOneQuery.isLoading && !curatedCollectionsQuery.isLoading && !curatedStudiosQuery.isLoading && homeSections.length === 0 && collections.length === 0 && allItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="film-outline" size={52} color={COLORS.accent} style={{ opacity: 0.5 }} />
            <Text style={styles.emptyTitle}>Catalog unavailable</Text>
            <Text style={styles.emptyMessage}>No media data was returned from home, collections, studios, or catalog endpoints.</Text>
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.8}
              onPress={() => {
                homeQuery.refetch();
                curatedCollectionsQuery.refetch();
                curatedStudiosQuery.refetch();
                catalogChunkOneQuery.refetch();
                catalogChunkTwoQuery.refetch();
                catalogChunkThreeQuery.refetch();
                catalogChunkFourQuery.refetch();
              }}
            >
              <Ionicons name="refresh-outline" size={15} color="#fff" />
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
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
              <ModuleSection title="Collections" actionLabel="See all" onAction={() => setActivePane("collections")}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionRow}>
                  {collections.slice(0, 24).map((group) => (
                    <CollectionCard
                      key={group.key}
                      group={group}
                      onPress={() => {
                        queryClient.setQueryData(["vod-collection", String(group.collectionId || "") || group.name], {
                          collection: {
                            id: group.collectionId,
                            name: group.name,
                            poster: group.posterUri || null,
                            backdrop: group.bannerUri || null,
                          },
                          items: group.items,
                          stats: { total: group.itemCount },
                        });
                        router.push({ pathname: "/vod-collection", params: { id: String(group.collectionId || ""), name: group.name } });
                      }}
                    />
                  ))}
                </ScrollView>
              </ModuleSection>
            ) : null}

            {showCollectionSkeleton ? (
              <ModuleSection title="Collections">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionRow}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <CollectionSkeletonCard key={`collection-skeleton-${index}`} pulse={skeletonPulse} />
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

            {platforms.length ? (
              <ModuleSection title="Platforms" actionLabel="Browse all" onAction={() => setActivePane("platforms")}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {platforms.slice(0, 18).map((platform) => (
                    <PlatformCard
                      key={platform.key}
                      platform={platform}
                      onPress={() => {
                        setPlatformFilter(platform.label);
                        setQuery("");
                        setActivePane("search");
                      }}
                    />
                  ))}
                </ScrollView>
              </ModuleSection>
            ) : null}

            {showPlatformSkeleton ? (
              <ModuleSection title="Platforms" actionLabel="Browse all" onAction={() => setActivePane("platforms")}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <PlatformSkeletonCard key={`platform-skeleton-${index}`} pulse={skeletonPulse} />
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

          {activePane === "collections" ? (
          <>
            <ModuleSection title="All Collections" actionLabel="Back" onAction={() => setActivePane("home")}>
              <View style={styles.collectionsGrid}>
                {collections.map((group) => (
                  <View key={`grid-${group.key}`} style={styles.collectionGridItem}>
                    <CollectionCard
                      group={group}
                      onPress={() => {
                        queryClient.setQueryData(["vod-collection", String(group.collectionId || "") || group.name], {
                          collection: {
                            id: group.collectionId,
                            name: group.name,
                            poster: group.posterUri || null,
                            backdrop: group.bannerUri || null,
                          },
                          items: group.items,
                          stats: { total: group.itemCount },
                        });
                        router.push({ pathname: "/vod-collection", params: { id: String(group.collectionId || ""), name: group.name } });
                      }}
                    />
                  </View>
                ))}
              </View>
            </ModuleSection>
          </>
        ) : null}

        {activePane === "platforms" ? (
          <>
            <ModuleSection title="All Platforms" actionLabel="Back" onAction={() => setActivePane("home")}>
              <View style={styles.platformsGrid}>
                {platforms.map((platform) => (
                  <View key={`platform-grid-${platform.key}`} style={styles.platformGridItem}>
                    <PlatformCard
                      platform={platform}
                      onPress={() => {
                        setPlatformFilter(platform.label);
                        setQuery("");
                        setActivePane("search");
                      }}
                    />
                  </View>
                ))}
              </View>
            </ModuleSection>
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

            {platformFilter !== "all" ? (
              <View style={styles.activePlatformWrap}>
                <View style={styles.activePlatformLeft}>
                  <View
                    style={[
                      styles.activePlatformLogoWrap,
                      {
                        backgroundColor: selectedPlatform?.fallbackColor || "rgba(255,255,255,0.2)",
                      },
                    ]}
                  >
                    {selectedPlatform?.logoUri ? (
                      <ExpoImage
                        source={{ uri: selectedPlatform.logoUri }}
                        style={styles.activePlatformLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        transition={80}
                      />
                    ) : (
                      <Text style={styles.activePlatformLogoFallback}>{platformFilter.slice(0, 2).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.activePlatformText}>Platform: {platformFilter}</Text>
                </View>
                <TouchableOpacity
                  style={styles.activePlatformClearBtn}
                  onPress={() => {
                    setPlatformFilter("all");
                    setQuery("");
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.activePlatformClearText}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : null}

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

            <Text style={styles.filterLabel}>Browse by Genre</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {availableGenres.map((genre) => {
                const active = genreFilter.toLowerCase() === genre.toLowerCase();
                return (
                  <TouchableOpacity key={`genre-${genre}`} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setGenreFilter(genre)}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{genre === "all" ? "All genres" : genre}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.filterLabel}>Browse by Year</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {["all", "2020s", "2010s", "2000s", "classic"].map((yearKey) => {
                const active = yearFilter === yearKey;
                const label = yearKey === "all" ? "All years" : yearKey;
                return (
                  <TouchableOpacity key={`year-${yearKey}`} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setYearFilter(yearKey)}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.filterLabel}>Browse by Platform</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {availablePlatforms.map((platform) => {
                const active = platformFilter.toLowerCase() === platform.toLowerCase();
                return (
                  <TouchableOpacity key={`platform-${platform}`} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setPlatformFilter(platform)}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{platform === "all" ? "All platforms" : platform}</Text>
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
            ) : null}

            {deferredQuery.length < 2 ? (
              filteredCatalogResults.length ? (
                <ModuleSection title="Extended Catalog" actionLabel="Customize filters" onAction={() => setSearchFilter("all")}>
                  <View style={styles.resultsGrid}>
                    {filteredCatalogResults.map((item) => (
                      <View key={`catalog-${item.type}-${item.id}`} style={styles.gridItem}>
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
                  <Ionicons name="filter-outline" size={42} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No matches for current filters</Text>
                  <Text style={styles.emptyText}>Try another genre, year, platform or media type.</Text>
                </View>
              )
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
  emptyWrap: { paddingTop: 100, alignItems: "center", gap: 14, paddingHorizontal: 32 },
  emptyTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 18 },
  emptyMessage: { color: COLORS.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13, textAlign: "center" },
  retryButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryButtonText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
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
  collectionSkeletonCard: {
    width: 290,
    height: 172,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginRight: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  collectionSkeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  collectionSkeletonMeta: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    gap: 8,
  },
  collectionSkeletonLabel: {
    width: 72,
    height: 10,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  collectionSkeletonTitle: {
    width: "78%",
    height: 22,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  collectionSkeletonInfo: {
    width: "54%",
    height: 11,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
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
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  studioLogo: { width: 80, height: 30 },
  studioLogoFallback: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 24 },
  studioTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  studioInfo: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  platformCard: {
    minWidth: 168,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginRight: 10,
    overflow: "hidden",
  },
  platformBrandBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    opacity: 0.9,
  },
  platformSkeletonCard: {
    minWidth: 168,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginRight: 10,
  },
  platformSkeletonLogoWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 10,
  },
  platformSkeletonLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  platformSkeletonTitle: {
    width: "76%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  platformSkeletonMeta: {
    width: "52%",
    height: 10,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 7,
  },
  platformLogoWrap: {
    width: 74,
    height: 74,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    marginBottom: 10,
  },
  platformLogo: { width: 56, height: 56 },
  platformLogoGlow: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 80,
    right: -18,
    top: -18,
  },
  platformLogoFallback: { color: "#FFFFFF", fontFamily: "Inter_800ExtraBold", fontSize: 13 },
  platformTitle: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
  },
  platformMeta: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 4,
  },
  platformsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 18,
    gap: 10,
  },
  platformGridItem: {
    width: "48%",
  },
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
  activePlatformWrap: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.35)",
    backgroundColor: "rgba(229,9,20,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activePlatformLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activePlatformLogoWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  activePlatformLogo: {
    width: 16,
    height: 16,
  },
  activePlatformLogoFallback: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 9,
  },
  activePlatformText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  activePlatformClearBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activePlatformClearText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
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
  collectionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 18,
    gap: 12,
  },
  collectionGridItem: {
    width: "100%",
  },
  filterLabel: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    marginLeft: 18,
    marginBottom: 8,
    marginTop: 4,
    textTransform: "uppercase",
  },
  emptyText: { color: COLORS.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center" },
});