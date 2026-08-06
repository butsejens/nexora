/**
 * Nexora — My List
 * User's saved content: movies, series, live channels.
 */
import React, { useCallback, useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { useNexora } from "@/context/NexoraContext";
import { getMediaKind, getRawId } from "@/lib/id-namespace";
import { apiRequest } from "@/lib/query-client";

type ListItem = {
  favoriteId: string;
  id: string;
  type: "movie" | "series";
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  year?: number | null;
  genres?: string[];
  rating?: number;
  description?: string;
  totalSeasons?: number;
  totalEpisodes?: number;
};

async function fetchMovie(id: string): Promise<ListItem | null> {
  const res = await apiRequest("GET", `/api/movies/${id}/full`);
  const data = await res.json();
  return data && data.title && !data.error
    ? { ...data, type: "movie" as const }
    : null;
}

async function fetchSeries(id: string): Promise<ListItem | null> {
  const res = await apiRequest("GET", `/api/series/${id}/full`);
  const data = await res.json();
  return data && (data.title || data.name) && !data.error
    ? { ...data, title: data.title ?? data.name, type: "series" as const }
    : null;
}

// TMDB movie and TV IDs are independent numbering spaces and commonly collide,
// so use the kind recorded at favorite-time when available instead of guessing.
async function fetchTmdbItem(
  id: string,
  knownKind: "movie" | "series" | null,
): Promise<ListItem | null> {
  if (knownKind === "movie") return fetchMovie(id).catch(() => null);
  if (knownKind === "series") return fetchSeries(id).catch(() => null);

  const movie = await fetchMovie(id).catch(() => null);
  if (movie) return movie;
  return fetchSeries(id).catch(() => null);
}

function MyListCard({
  item,
  index,
  onRemove,
}: {
  item: ListItem;
  index: number;
  onRemove: (id: string) => void;
}) {
  const handlePress = () => {
    router.push({
      pathname: "/media/detail",
      params: {
        id: item.id,
        type: item.type,
      },
    });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.poster}>
          <ExpoImage
            source={item.poster ?? item.backdrop ?? undefined}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={300}
          />
          {!item.poster && !item.backdrop ? (
            <View style={styles.posterFallback}>
              <Ionicons
                name="bookmark-outline"
                size={24}
                color={COLORS.textMuted}
              />
            </View>
          ) : null}
          <LinearGradient
            colors={["transparent", "rgba(6,5,10,0.6)"]}
            style={StyleSheet.absoluteFillObject}
          />
          {item.type === "series" && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>SERIES</Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.year}>{item.year}</Text>
            <View style={styles.dot} />
            {(item.genres ?? []).slice(0, 1).map((g) => (
              <Text key={g} style={styles.genre}>
                {g}
              </Text>
            ))}
            <View style={styles.dot} />
            <Ionicons name="star" size={11} color={COLORS.gold} />
            <Text style={styles.rating}>{Number(item.rating ?? 0).toFixed(1)}</Text>
          </View>
          <Text style={styles.desc} numberOfLines={2}>
            {item.description}
          </Text>
        </View>

        <Pressable
          onPress={() => onRemove(item.favoriteId)}
          style={styles.removeBtn}
          accessibilityLabel={`Remove ${item.title} from list`}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

function EmptyList() {
  return (
    <View style={styles.empty}>
      <Ionicons name="bookmark-outline" size={52} color={COLORS.textFaint} />
      <Text style={styles.emptyTitle}>Your list is empty</Text>
      <Text style={styles.emptySubtitle}>
        Add movies and series you want to watch later
      </Text>
      <Pressable
        style={styles.browseBtn}
        onPress={() => router.push("/(tabs)/movies")}
      >
        <Text style={styles.browseBtnText}>Browse Movies</Text>
      </Pressable>
    </View>
  );
}

export default function MyListScreen() {
  const insets = useSafeAreaInsets();
  const { favorites, toggleFavorite } = useNexora();

  // Resolve favorites from TMDB
  const favIds = useMemo(() => favorites.map((id) => String(id)), [favorites]);

  const { data: resolvedItems = [], isLoading } = useQuery({
    queryKey: ["my-list", favIds.join(",")],
    queryFn: async () => {
      const results = await Promise.allSettled(
        favIds.slice(0, 80).map(async (favoriteId) => {
          const rawId = getRawId(favoriteId);
          const knownKind = getMediaKind(favoriteId);
          const item = await fetchTmdbItem(rawId, knownKind);
          if (!item) return null;
          return {
            ...item,
            favoriteId,
            id: rawId,
            description:
              item.description ||
              (item as { synopsis?: string }).synopsis ||
              "",
          };
        }),
      );
      return results
        .flatMap((r) => {
          if (r.status !== "fulfilled" || r.value == null) return [];
          return [r.value as ListItem];
        })
        .filter((item) => !!item.title);
    },
    enabled: favIds.length > 0,
    staleTime: 60_000,
  });

  const allContent = resolvedItems;
  const hasFavoriteIds = favIds.length > 0;

  const handleRemove = useCallback(
    (id: string) => {
      toggleFavorite(id);
    },
    [toggleFavorite],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ListItem; index: number }) => (
      <MyListCard item={item} index={index} onRemove={handleRemove} />
    ),
    [handleRemove],
  );

  return (
    <View style={styles.container}>
      <View style={{ height: TOP_NAV_H + insets.top }} />

      {isLoading && hasFavoriteIds ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Laden…</Text>
        </View>
      ) : hasFavoriteIds && allContent.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={52} color={COLORS.textFaint} />
          <Text style={styles.emptyTitle}>Saved items could not load</Text>
          <Text style={styles.emptySubtitle}>
            Your favorites are stored, but the details endpoint returned no usable data.
          </Text>
          <Pressable
            style={styles.browseBtn}
            onPress={() => router.push("/(tabs)/home")}
          >
            <Text style={styles.browseBtnText}>Go to Home</Text>
          </Pressable>
        </View>
      ) : allContent.length === 0 ? (
        <EmptyList />
      ) : (
        <FlatList
          data={allContent}
          keyExtractor={(item) => item.favoriteId}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  separator: { height: 10 },
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  poster: {
    width: 80,
    height: 115,
    backgroundColor: COLORS.cardElevated,
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  posterFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.cardElevated,
  },
  typeBadge: {
    position: "absolute",
    bottom: 6,
    left: 5,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  info: {
    flex: 1,
    padding: 12,
    gap: 4,
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  year: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 99,
    backgroundColor: COLORS.textFaint,
  },
  genre: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rating: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  desc: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 2,
  },
  removeBtn: {
    padding: 10,
    justifyContent: "flex-start",
    paddingTop: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  browseBtn: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 99,
  },
  browseBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
