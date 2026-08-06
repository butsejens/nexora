/**
 * Generic "see all" browse page for rails that pool from a standard TMDB
 * list (Populair, Trending, Nu op tv, Hoogst gewaardeerd, jaren-reeksen)
 * rather than a single genre. Mirrors the layout of /media/genre.tsx so the
 * "Alle" button behaves consistently everywhere in the app.
 */
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import {
  useMoviesFromYearRange,
  useNowPlayingMoviesAll,
  useOnAirSeriesAll,
  usePopularMoviesAll,
  usePopularSeriesAll,
  useTopRatedMoviesAll,
  useTopRatedSeriesAll,
  useUpcomingMovies,
} from "@/lib/use-tmdb";
import type { Movie, Series } from "@/types/streaming";

const { width: W } = Dimensions.get("window");
const NUM_COLS = W > 700 ? 4 : 3;
const CARD_GAP = 10;
const CARD_W = Math.floor((W - 32 - CARD_GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.round(CARD_W * 1.48);

type ListType =
  | "popular"
  | "top_rated"
  | "now_playing"
  | "on_the_air"
  | "upcoming"
  | "year_range";

export default function ListPage() {
  const insets = useSafeAreaInsets();
  const { listType, type, title, fromYear, toYear } = useLocalSearchParams<{
    listType: ListType;
    type: "movie" | "series";
    title: string;
    fromYear?: string;
    toYear?: string;
  }>();

  const isMovie = type === "movie";
  const from = Number(fromYear ?? 0);
  const to = Number(toYear ?? 0);
  const isYearRange = listType === "year_range" && from > 0 && to > 0;

  const { data: popularMovies = [], isFetching: loadingPopularMovies } =
    usePopularMoviesAll(isMovie && listType === "popular");
  const { data: topRatedMovies = [], isFetching: loadingTopRatedMovies } =
    useTopRatedMoviesAll(isMovie && listType === "top_rated");
  const { data: nowPlayingMovies = [], isFetching: loadingNowPlayingMovies } =
    useNowPlayingMoviesAll(isMovie && listType === "now_playing");
  const { data: upcomingMovies = [], isFetching: loadingUpcomingMovies } =
    useUpcomingMovies(isMovie && listType === "upcoming");
  const { data: yearRangeMovies = [], isFetching: loadingYearRangeMovies } =
    useMoviesFromYearRange(from, to, isYearRange);

  const { data: popularSeries = [], isFetching: loadingPopularSeries } =
    usePopularSeriesAll(!isMovie && listType === "popular");
  const { data: topRatedSeries = [], isFetching: loadingTopRatedSeries } =
    useTopRatedSeriesAll(!isMovie && listType === "top_rated");
  const { data: onAirSeries = [], isFetching: loadingOnAirSeries } =
    useOnAirSeriesAll(!isMovie && listType === "on_the_air");

  const isLoading = isMovie
    ? listType === "popular"
      ? loadingPopularMovies
      : listType === "top_rated"
        ? loadingTopRatedMovies
        : listType === "now_playing"
          ? loadingNowPlayingMovies
          : listType === "upcoming"
            ? loadingUpcomingMovies
            : loadingYearRangeMovies
    : listType === "popular"
      ? loadingPopularSeries
      : listType === "top_rated"
        ? loadingTopRatedSeries
        : loadingOnAirSeries;

  const rawItems: (Movie | Series)[] = isMovie
    ? listType === "popular"
      ? popularMovies
      : listType === "top_rated"
        ? topRatedMovies
        : listType === "now_playing"
          ? nowPlayingMovies
          : listType === "upcoming"
            ? upcomingMovies
            : yearRangeMovies
    : listType === "popular"
      ? popularSeries
      : listType === "top_rated"
        ? topRatedSeries
        : onAirSeries;

  const items: {
    id: string;
    title: string;
    poster: string | null;
    backdrop: string | null;
  }[] = rawItems
    .filter((item) => item.poster ?? item.backdrop)
    .map((item) => ({
      id: item.id,
      title: item.title ?? "",
      poster: item.poster ?? null,
      backdrop: item.backdrop ?? null,
    }));

  const openDetail = useCallback((item: { id: string; title: string }) => {
    router.push({
      pathname: "/media/detail",
      params: { id: item.id, title: item.title },
    });
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title ?? "Alle"}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLS}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 40 },
        ]}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <ActivityIndicator size="large" color={COLORS.accent} />
            ) : (
              <Text style={styles.emptyText}>Geen resultaten gevonden</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openDetail(item)}>
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
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  grid: {
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  row: {
    gap: CARD_GAP,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    justifyContent: "flex-end",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    padding: 6,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  empty: {
    paddingTop: 80,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
