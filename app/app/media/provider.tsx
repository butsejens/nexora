import React, { useCallback, useMemo, useState } from "react";
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
import { useProviderMovies, useProviderSeries } from "@/lib/use-tmdb";
import type { Movie, Series } from "@/types/streaming";

const { width: W } = Dimensions.get("window");
const NUM_COLS = W > 700 ? 4 : 3;
const CARD_GAP = 10;
const CARD_W = Math.floor((W - 32 - CARD_GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.round(CARD_W * 1.48);

type Filter = "all" | "movie" | "series";

const FILTER_LABELS: { key: Filter; label: string }[] = [
  { key: "all", label: "Alles" },
  { key: "movie", label: "Films" },
  { key: "series", label: "Series" },
];

export default function ProviderPage() {
  const insets = useSafeAreaInsets();
  const { providerId, name } = useLocalSearchParams<{
    providerId: string;
    name: string;
  }>();

  const [filter, setFilter] = useState<Filter>("all");
  const numericId = Number(providerId ?? 0);

  const { data: movies = [], isFetching: loadingMovies } = useProviderMovies(
    numericId > 0 ? numericId : null,
  );
  const { data: series = [], isFetching: loadingSeries } = useProviderSeries(
    numericId > 0 ? numericId : null,
  );

  const isLoading = loadingMovies || loadingSeries;

  const items = useMemo(() => {
    const allItems: (Movie | Series)[] =
      filter === "movie"
        ? movies
        : filter === "series"
          ? series
          : [...movies, ...series];

    const seen = new Set<string>();
    return allItems
      .filter((item) => {
        if (!item.poster && !item.backdrop) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => b.rating - a.rating);
  }, [movies, series, filter]);

  const openDetail = useCallback((item: Movie | Series) => {
    router.push({
      pathname: "/detail",
      params: { id: item.id, type: item.type },
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
          {name ?? "Streaming"}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_LABELS.map(({ key, label }) => (
          <Pressable
            key={key}
            style={[styles.filterTab, filter === key && styles.filterTabActive]}
            onPress={() => setFilter(key)}
          >
            <Text
              style={[
                styles.filterLabel,
                filter === key && styles.filterLabelActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
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
              colors={["transparent", "rgba(6,5,10,0.80)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.cardFooter}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.rating > 0 ? (
                <Text style={styles.cardRating}>
                  ★ {item.rating.toFixed(1)}
                </Text>
              ) : null}
            </View>
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
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterTabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  filterLabelActive: {
    color: "#fff",
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
  },
  cardFooter: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 7,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
  },
  cardRating: {
    color: COLORS.gold ?? "#F5C518",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  empty: {
    paddingTop: 80,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
