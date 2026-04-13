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
  useMoviesByCompany,
  useMoviesByGenreAll,
  useTvByGenreAll,
  useTvByNetwork,
  useTvByNetworkKids,
} from "@/lib/use-tmdb";
import type { Movie, Series } from "@/types/streaming";

const { width: W } = Dimensions.get("window");
const NUM_COLS = W > 700 ? 4 : 3;
const CARD_GAP = 10;
const CARD_W = Math.floor((W - 32 - CARD_GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.round(CARD_W * 1.48);

export default function GenrePage() {
  const insets = useSafeAreaInsets();
  const { genreId, genreTitle, type, source } = useLocalSearchParams<{
    genreId: string;
    genreTitle: string;
    type: "movie" | "series" | "tv";
    source?: "genre" | "network" | "company";
  }>();

  const numericId = Number(genreId ?? 0);
  const isMovie = type === "movie";
  const src = source ?? "genre";

  const { data: movieData = [], isFetching: loadingMovies } =
    useMoviesByGenreAll([numericId], src === "genre" && isMovie && numericId > 0);
  const { data: tvData = [], isFetching: loadingSeries } = useTvByGenreAll(
    [numericId],
    src === "genre" && !isMovie && numericId > 0,
  );
  // Disney Junior (281) and Boomerang (523) need a relaxed vote-count filter
  const isKidsNetwork = numericId === 281 || numericId === 523;
  const { data: networkDataStd = [], isFetching: loadingNetworkStd } =
    useTvByNetwork(numericId, src === "network" && !isKidsNetwork && numericId > 0);
  const { data: networkDataKids = [], isFetching: loadingNetworkKids } =
    useTvByNetworkKids(numericId, src === "network" && isKidsNetwork && numericId > 0);
  const networkData = isKidsNetwork ? networkDataKids : networkDataStd;
  const loadingNetwork = isKidsNetwork ? loadingNetworkKids : loadingNetworkStd;
  const { data: companyData = [], isFetching: loadingCompany } =
    useMoviesByCompany([numericId], src === "company" && numericId > 0);

  const isLoading =
    src === "network"
      ? loadingNetwork
      : src === "company"
        ? loadingCompany
        : isMovie
          ? loadingMovies
          : loadingSeries;

  const rawItems =
    src === "network"
      ? (networkData as (Movie | Series)[])
      : src === "company"
        ? (companyData as (Movie | Series)[])
        : isMovie
          ? (movieData as (Movie | Series)[])
          : (tvData as (Movie | Series)[]);

  const items: {
    id: string;
    title: string;
    poster: string | null;
    backdrop: string | null;
  }[] = rawItems
    .filter((item: Movie | Series) => item.poster ?? item.backdrop)
    .map((item: Movie | Series) => ({
      id: item.id,
      title: item.title ?? "",
      poster: item.poster ?? null,
      backdrop: item.backdrop ?? null,
    }));

  const openDetail = useCallback((item: { id: string; title: string }) => {
    router.push({
      pathname: "/detail",
      params: { id: item.id, title: item.title },
    });
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {genreTitle ?? "Genre"}
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
