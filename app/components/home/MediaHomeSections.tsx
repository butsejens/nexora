import React, { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { RealContentCard } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { buildMoodRecommendations, createContinueWatching, type VodMood } from "@/lib/vod-curation";
import { enrichVodModuleItem, type VodModuleItem } from "@/lib/vod-module";

type MediaHomeSectionsProps = {
  title?: string;
  compact?: boolean;
  sportsMood?: VodMood;
};

type MediaPayload = {
  trendingMovies: VodModuleItem[];
  trendingSeries: VodModuleItem[];
  catalogPicks: VodModuleItem[];
};

async function fetchJson(path: string) {
  const response = await apiRequest("GET", path);
  return response.json();
}

async function fetchMediaPayload(): Promise<MediaPayload> {
  const [movieData, seriesData, catalogData] = await Promise.all([
    fetchJson("/api/movies/trending"),
    fetchJson("/api/series/trending"),
    fetchJson("/api/vod/catalog?type=all&years=30&chunkYears=4&pagesPerYear=1"),
  ]);

  const trendingMovies = [
    ...(Array.isArray(movieData?.trending) ? movieData.trending : []),
    ...(Array.isArray(movieData?.popular) ? movieData.popular : []),
  ]
    .slice(0, 18)
    .map((item: any) => enrichVodModuleItem({ ...item, type: "movie", isTrending: true }));

  const trendingSeries = [
    ...(Array.isArray(seriesData?.trending) ? seriesData.trending : []),
    ...(Array.isArray(seriesData?.popular) ? seriesData.popular : []),
  ]
    .slice(0, 18)
    .map((item: any) => enrichVodModuleItem({ ...item, type: "series", isTrending: true }));

  return {
    trendingMovies,
    trendingSeries,
    catalogPicks: (Array.isArray(catalogData?.items) ? catalogData.items : [])
      .slice(0, 24)
      .map((item: any) => enrichVodModuleItem(item)),
  };
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function MediaRail({
  title,
  items,
  isFavorite,
  onToggleFavorite,
}: {
  title: string;
  items: VodModuleItem[];
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <>
      <SectionTitle title={title} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        {items.map((item) => {
          const id = String(item.id || item.tmdbId || "");
          if (!id) return null;
          return (
            <RealContentCard
              key={`${item.type}_${id}`}
              width={122}
              item={{
                id,
                title: item.title,
                year: Number(item.year || 0),
                imdb: Number(item.imdb || item.rating || 0),
                quality: item.quality || "HD",
                poster: item.poster || null,
                backdrop: item.backdrop || null,
                progress: item.progress,
                isTrending: item.isTrending,
                isNew: item.isNew,
              }}
              showProgress={item.progress != null}
              isFavorite={isFavorite(id)}
              onFavorite={() => onToggleFavorite(id)}
              onPress={() => {
                router.push({
                  pathname: "/detail",
                  params: {
                    id,
                    type: item.type,
                    title: item.title,
                    tmdbId: item.tmdbId ? String(item.tmdbId) : undefined,
                  },
                });
              }}
            />
          );
        })}
      </ScrollView>
    </>
  );
}

export function MediaHomeSections({ title = "Entertainment for you", compact = false, sportsMood = "fun" }: MediaHomeSectionsProps) {
  const { isFavorite, toggleFavorite, watchHistory } = useNexora();

  const mediaQuery = useQuery({
    queryKey: ["home", "media-sections"],
    queryFn: fetchMediaPayload,
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });

  const continueWatching = useMemo(() => {
    const movieRows = createContinueWatching(watchHistory as any, "movie", 8);
    const seriesRows = createContinueWatching(watchHistory as any, "series", 8);
    return [...movieRows, ...seriesRows]
      .slice(0, compact ? 8 : 12)
      .map((item: any) => enrichVodModuleItem({ ...item, type: item.season ? "series" : item.type || "movie" }));
  }, [compact, watchHistory]);

  const recommended = useMemo(() => {
    const movieCandidates = (mediaQuery.data?.trendingMovies || []).map((item) => ({ item, source: "trending" }));
    const seriesCandidates = (mediaQuery.data?.trendingSeries || []).map((item) => ({ item, source: "trending" }));
    // Use sports mood for primary rail, secondary mood for series rail
    const secondaryMood = sportsMood === "thriller" ? "binge" : sportsMood === "binge" ? "emotional" : "fun";
    return [
      ...buildMoodRecommendations(sportsMood, movieCandidates as any, watchHistory as any, "movie", compact ? 6 : 8),
      ...buildMoodRecommendations(secondaryMood, seriesCandidates as any, watchHistory as any, "series", compact ? 6 : 8),
      ...(mediaQuery.data?.catalogPicks || []).slice(0, compact ? 4 : 8),
    ]
      .slice(0, compact ? 8 : 12)
      .map((item: any) => enrichVodModuleItem({ ...item, type: item.season ? "series" : item.type || "movie" }));
  }, [compact, mediaQuery.data?.catalogPicks, mediaQuery.data?.trendingMovies, mediaQuery.data?.trendingSeries, sportsMood, watchHistory]);

  return (
    <View style={styles.wrap}>
      <View style={styles.blockHeader}>
        <View>
          <Text style={styles.blockEyebrow}>HOME</Text>
          <Text style={styles.blockTitle}>{title}</Text>
        </View>
        {mediaQuery.isFetching ? <ActivityIndicator size="small" color={COLORS.accent} /> : null}
      </View>

      {!mediaQuery.isLoading && !continueWatching.length && !recommended.length && !(mediaQuery.data?.trendingMovies?.length || mediaQuery.data?.trendingSeries?.length) ? (
        <View style={styles.emptyCard}>
          <Ionicons name="film-outline" size={22} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Entertainment feed is empty</Text>
          <Text style={styles.emptyText}>Start watching or save a few titles to personalize this section.</Text>
        </View>
      ) : null}

      <MediaRail title="Continue watching" items={continueWatching} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
      <MediaRail title="Picked for you" items={recommended} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
      <MediaRail title="Trending movies" items={(mediaQuery.data?.trendingMovies || []).slice(0, compact ? 8 : 12)} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
      <MediaRail title="Trending series" items={(mediaQuery.data?.trendingSeries || []).slice(0, compact ? 8 : 12)} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  blockHeader: {
    paddingHorizontal: 18,
    marginTop: 20,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockEyebrow: {
    color: COLORS.accent,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  blockTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 4,
  },
  emptyCard: {
    marginHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 18,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 10,
    marginBottom: 6,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  railContent: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
});