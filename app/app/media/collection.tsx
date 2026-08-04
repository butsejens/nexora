import React, { useMemo } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import { getVodCollectionById } from "@/lib/services/media-service";
import type { VodModuleItem } from "@/lib/vod-module";

const { width: W } = Dimensions.get("window");
const NUM_COLS = W > 700 ? 4 : 3;
const CARD_GAP = 10;
const CARD_W = Math.floor((W - 32 - CARD_GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.round(CARD_W * 1.48);

function toMediaType(item: Partial<VodModuleItem>): "movie" | "series" {
  return String(item.type || "").toLowerCase() === "series" ? "series" : "movie";
}

function toMediaId(item: Partial<VodModuleItem>): string {
  const raw = String(item.tmdbId || item.id || "").trim();
  return raw;
}

export default function CollectionPage() {
  const insets = useSafeAreaInsets();
  const { id, ids, name } = useLocalSearchParams<{
    id?: string;
    ids?: string;
    name?: string;
  }>();

  const collectionIds = useMemo(() => {
    const fromIds = String(ids || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (fromIds.length > 0) return fromIds;
    return String(id || "").trim() ? [String(id).trim()] : [];
  }, [id, ids]);

  const collectionQuery = useQuery({
    queryKey: ["media", "collection-page", collectionIds.join(",")],
    queryFn: async () => {
      const payloads = await Promise.all(
        collectionIds.map((value) => getVodCollectionById(value)),
      );
      const valid = payloads.filter(Boolean);
      const mergedItems = valid.flatMap((payload: any) =>
        Array.isArray(payload?.items) ? payload.items : [],
      );
      return {
        first: valid[0] as any,
        items: mergedItems,
      };
    },
    enabled: collectionIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const items = useMemo(() => {
    const list = Array.isArray(collectionQuery.data?.items)
      ? (collectionQuery.data?.items as Partial<VodModuleItem>[])
      : [];
    const seen = new Set<string>();
    return list.filter((item) => {
      const mediaId = toMediaId(item);
      if (!mediaId) return false;
      if (!item.poster && !item.backdrop) return false;
      const key = `${toMediaType(item)}:${mediaId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [collectionQuery.data?.items]);

  const openDetail = (item: Partial<VodModuleItem>) => {
    const mediaId = toMediaId(item);
    if (!mediaId) return;
    router.push({
      pathname: "/media/detail",
      params: {
        id: mediaId,
        type: toMediaType(item),
        title: String(item.title || ""),
      },
    });
  };

  const headerTitle =
    String(name || "").trim() ||
    String(collectionQuery.data?.first?.collection?.name || "Collection");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => `${toMediaType(item)}:${toMediaId(item)}`}
        numColumns={NUM_COLS}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 40 },
        ]}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.empty}>
            {collectionQuery.isFetching ? (
              <ActivityIndicator size="large" color={COLORS.accent} />
            ) : (
              <Text style={styles.emptyText}>Geen titels gevonden</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openDetail(item)}>
            <ExpoImage
              source={item.poster || item.backdrop || undefined}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient
              colors={["transparent", "rgba(6,5,10,0.80)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.cardTitle} numberOfLines={2}>
              {String(item.title || "Untitled")}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  },
  grid: {
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  row: { gap: CARD_GAP },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    justifyContent: "flex-end",
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    padding: 8,
  },
  empty: { paddingTop: 80, alignItems: "center" },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
