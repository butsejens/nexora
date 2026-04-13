import React, { useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import {
  useTrending,
  usePopularMovies,
  usePopularSeries,
  useTopRatedMovies,
  useTopRatedSeries,
  useNowPlayingMovies,
  useOnAirSeries,
} from "@/lib/use-tmdb";
import { useLiveChannels } from "@/lib/live-channels";
import { useProfileStore } from "@/store/profileStore";
import type { Movie, Series } from "@/types/streaming";

const { width: W, height: H } = Dimensions.get("window");
const HERO_H = Math.min(H * 0.72, 620);
const POSTER_W = W > 1024 ? 190 : W > 760 ? 168 : 146;
const POSTER_H = Math.round(POSTER_W * 1.5);
// Top 10 card dimensions — taller poster, square number overlapping left edge
const TOP10_CARD_W = W > 760 ? 176 : 152;
const TOP10_CARD_H = Math.round(TOP10_CARD_W * 1.52);
const TOP10_NUM_SIZE = W > 760 ? 132 : 112; // font-size for the big number
// Provider IDs to show on home screen — 5 main services for NL/BE (Netflix, Disney+, Prime, Apple TV+, Videoland)
const STREAMING_SERVICES = [
  { id: 8, label: "Netflix" },
  { id: 337, label: "Disney+" },
  { id: 119, label: "Prime Video" },
  { id: 350, label: "Apple TV+" },
  { id: 188, label: "Videoland" },
] as const;

type Content = Movie | Series;
const EMPTY_CONTENT: Content[] = [];

function contentKey(item: Content): string {
  return `${item.type}:${item.id}`;
}

function dedupe(items: Content[]): Content[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = contentKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withPoster(items: Content[]): Content[] {
  return items.filter((item) => !!item.poster);
}

/** Require a backdrop image AND a decent rating for hero eligibility. */
function heroEligible(items: Content[]): Content[] {
  return items.filter((item) => !!item.backdrop && item.rating >= 6.8);
}

function toDetail(item: Content) {
  router.push({
    pathname: "/detail",
    params: { id: item.id, type: item.type },
  });
}

function Hero({ item }: { item: Content }) {
  return (
    <View style={styles.hero}>
      <ExpoImage
        source={item.backdrop ?? item.poster ?? undefined}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
      />
      {/* Bottom fade — keeps top of image fully visible */}
      <LinearGradient
        colors={["transparent", "rgba(6,5,10,0.30)", COLORS.background]}
        locations={[0.42, 0.74, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Subtle left vignette for text legibility only */}
      <LinearGradient
        colors={["rgba(6,5,10,0.38)", "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.55, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.heroContent}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.heroMeta}>
          <Text style={styles.heroMetaText}>{item.year}</Text>
          <View style={styles.dot} />
          <Ionicons name="star" size={12} color={COLORS.gold} />
          <Text style={styles.heroMetaText}>{item.rating.toFixed(1)}</Text>
          {item.genres.slice(0, 2).map((g) => (
            <React.Fragment key={g}>
              <View style={styles.dot} />
              <Text style={styles.heroMetaText}>{g}</Text>
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.heroDesc} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.heroButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.watchBtn,
              pressed && { opacity: 0.82 },
            ]}
            onPress={() => toDetail(item)}
          >
            <Ionicons name="play" size={16} color="#000" />
            <Text style={styles.watchBtnText}>Kijk nu</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.listBtn,
              pressed && { opacity: 0.82 },
            ]}
            onPress={() => toDetail(item)}
          >
            <Ionicons name="add" size={17} color={COLORS.text} />
            <Text style={styles.listBtnText}>Mijn lijst</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Top 10 accent colors — cycle through vivid hues like VTM GO magenta
const TOP10_COLORS = [
  "#E91E8C",
  "#D32CE6",
  "#9B27AF",
  "#5E35B1",
  "#1E88E5",
  "#00ACC1",
  "#43A047",
  "#FB8C00",
  "#E53935",
  "#8E24AA",
];

function Top10Rail({ data }: { data: Content[] }) {
  if (data.length === 0) return null;
  const items = data.slice(0, 10);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Top 10 op Nexora</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item, i) => `top10-${i}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railPad}
        ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
        renderItem={({ item, index }) => {
          const accentColor = TOP10_COLORS[index % TOP10_COLORS.length];
          return (
            <Pressable style={styles.top10Item} onPress={() => toDetail(item)}>
              {/* Poster card — absolutely positioned on the right */}
              <View style={styles.top10Card}>
                <ExpoImage
                  source={item.poster ?? item.backdrop ?? undefined}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={200}
                />
                <LinearGradient
                  colors={["transparent", "rgba(6,5,10,0.75)"]}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
              {/* Big number — absolutely positioned on the left, in front */}
              <Text style={[styles.top10Num, { color: accentColor }]}>
                {index + 1}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function StreamingServiceRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.providerRow}
    >
      {STREAMING_SERVICES.map((svc) => (
        <Pressable
          key={svc.id}
          style={styles.providerTile}
          onPress={() =>
            router.push({
              pathname: "/media/provider",
              params: { providerId: svc.id, name: svc.label },
            })
          }
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.02)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.providerLabel} numberOfLines={1}>
            {svc.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Section({
  title,
  data,
  seeAll,
}: {
  title: string;
  data: Content[];
  seeAll?: string;
}) {
  if (data.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {seeAll ? (
          <Pressable onPress={() => router.push(seeAll as any)}>
            <Text style={styles.seeAll}>Alles</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={data}
        keyExtractor={(item) => `${title}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railPad}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        renderItem={({ item }) => (
          <Pressable style={styles.poster} onPress={() => toDetail(item)}>
            <ExpoImage
              source={item.poster ?? item.backdrop ?? undefined}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient
              colors={["transparent", "rgba(6,5,10,0.86)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.posterFooter}>
              <Text style={styles.posterTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const activeProfile = useProfileStore((s) => s.getActiveProfile());

  const trendingQuery = useTrending();
  const popularMoviesQuery = usePopularMovies();
  const popularSeriesQuery = usePopularSeries();
  const topMoviesQuery = useTopRatedMovies();
  const topSeriesQuery = useTopRatedSeries();
  const nowPlayingQuery = useNowPlayingMovies();
  const onAirQuery = useOnAirSeries();
  const liveQuery = useLiveChannels();

  const trending = trendingQuery.data ?? EMPTY_CONTENT;
  const popularMovies = popularMoviesQuery.data ?? EMPTY_CONTENT;
  const popularSeries = popularSeriesQuery.data ?? EMPTY_CONTENT;
  const topMovies = topMoviesQuery.data ?? EMPTY_CONTENT;
  const topSeries = topSeriesQuery.data ?? EMPTY_CONTENT;
  const nowPlaying = nowPlayingQuery.data ?? EMPTY_CONTENT;
  const onAir = onAirQuery.data ?? EMPTY_CONTENT;

  const fallbackPool = useMemo(
    () =>
      dedupe([
        ...popularMovies,
        ...popularSeries,
        ...topMovies,
        ...topSeries,
        ...nowPlaying,
        ...onAir,
      ]),
    [popularMovies, popularSeries, topMovies, topSeries, nowPlaying, onAir],
  );

  const top10Data = useMemo(
    () =>
      withPoster(
        dedupe([
          ...(trending as Content[]),
          ...topMovies,
          ...topSeries,
          ...popularMovies,
          ...popularSeries,
        ]),
      ).slice(0, 10),
    [trending, topMovies, topSeries, popularMovies, popularSeries],
  );

  const top10Ids = useMemo(
    () => new Set(top10Data.map((item) => contentKey(item))),
    [top10Data],
  );

  // Build each rail sequentially so no item appears in more than one section.
  // usedIds grows after each rail is computed — later rails filter it out.
  const { mustWatch, seriesPicks, moviePicks, trendingRail } = useMemo(() => {
    const used = new Set<string>(top10Ids);

    const pick = (candidates: Content[], limit: number): Content[] => {
      const result: Content[] = [];
      for (const item of withPoster(dedupe(candidates))) {
        const key = contentKey(item);
        if (used.has(key)) continue;
        result.push(item);
        if (result.length >= limit) break;
      }
      result.forEach((item) => used.add(contentKey(item)));
      return result;
    };

    const mustWatch = pick(
      [...popularMovies, ...nowPlaying, ...topMovies] as Content[],
      16,
    );
    const seriesPicks = pick(
      [...popularSeries, ...topSeries, ...onAir] as Content[],
      16,
    );
    const moviePicks = pick(
      [...topMovies, ...popularMovies, ...nowPlaying] as Content[],
      16,
    );
    const trendingRail = pick(
      [...(trending as Content[]), ...fallbackPool],
      16,
    );

    return { mustWatch, seriesPicks, moviePicks, trendingRail };
  }, [
    top10Ids,
    popularMovies,
    nowPlaying,
    topMovies,
    popularSeries,
    topSeries,
    onAir,
    trending,
    fallbackPool,
  ]);

  // Pick the best hero: must have a real backdrop + rating ≥ 6.8
  const heroItem = (heroEligible(trending as Content[])[0] ??
    heroEligible(fallbackPool)[0] ??
    withPoster(trending as Content[])[0] ??
    withPoster(fallbackPool)[0]) as Content | undefined;

  const isLoading =
    trendingQuery.isLoading ||
    popularMoviesQuery.isLoading ||
    popularSeriesQuery.isLoading;

  const hasAnyContent =
    !!heroItem ||
    mustWatch.length > 0 ||
    seriesPicks.length > 0 ||
    moviePicks.length > 0 ||
    trendingRail.length > 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([
      trendingQuery.refetch(),
      popularMoviesQuery.refetch(),
      popularSeriesQuery.refetch(),
      topMoviesQuery.refetch(),
      topSeriesQuery.refetch(),
      nowPlayingQuery.refetch(),
      onAirQuery.refetch(),
      liveQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {heroItem ? <Hero item={heroItem} /> : null}

        <StreamingServiceRow />

        <View style={styles.welcomeRow}>
          <Text style={styles.welcomeTitle}>
            Welkom {activeProfile?.name ?? "bij Nexora"}
          </Text>
        </View>

        {isLoading && !hasAnyContent ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Content laden...</Text>
          </View>
        ) : null}

        {!isLoading && !hasAnyContent ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Geen content ontvangen</Text>
            <Text style={styles.emptyBody}>
              Controleer je internetverbinding en vernieuw.
            </Text>
            <Pressable style={styles.retryBtn} onPress={onRefresh}>
              <Text style={styles.retryText}>Opnieuw laden</Text>
            </Pressable>
          </View>
        ) : null}

        <Section title="Nu trending" data={trendingRail} />
        <Top10Rail data={top10Data} />
        <Section
          title="Must watch films"
          data={mustWatch}
          seeAll="/(tabs)/movies"
        />
        <Section
          title="Beste series"
          data={seriesPicks}
          seeAll="/(tabs)/series"
        />
        <Section title="Top films" data={moviePicks} seeAll="/(tabs)/movies" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  hero: {
    width: "100%",
    height: HERO_H,
    justifyContent: "flex-end",
  },
  heroContent: {
    paddingHorizontal: 16,
    paddingBottom: 26,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 52,
    lineHeight: 56,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -1.2,
    maxWidth: "72%",
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    flexWrap: "wrap",
    gap: 6,
  },
  heroMetaText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  heroDesc: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginTop: 10,
    maxWidth: "66%",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 20,
    backgroundColor: COLORS.textFaint,
  },
  heroButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  watchBtnText: {
    color: "#000",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
  },
  listBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  providerRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    marginTop: 10,
  },
  providerTile: {
    width: Math.round(W * 0.27),
    minWidth: 90,
    maxWidth: 130,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  providerLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  welcomeRow: {
    marginTop: 24,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  welcomeTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.4,
  },
  liveHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  section: { marginTop: 20 },
  sectionHead: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  seeAll: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  railPad: { paddingHorizontal: 16 },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
  },
  // Top 10 rail
  top10Item: {
    width: TOP10_CARD_W + Math.round(TOP10_NUM_SIZE * 0.42),
    height: TOP10_CARD_H,
  },
  top10Num: {
    position: "absolute",
    left: 0,
    bottom: 4,
    fontSize: TOP10_NUM_SIZE,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -3,
    zIndex: 2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 6,
  },
  top10Card: {
    position: "absolute",
    right: 0,
    top: 0,
    width: TOP10_CARD_W,
    height: TOP10_CARD_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    zIndex: 1,
  },
  posterFooter: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 9,
  },
  posterTitle: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: "Inter_700Bold",
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "flex-start",
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  emptyBody: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
