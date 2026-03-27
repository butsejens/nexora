import React from "react";
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { withTimeout } from "@/lib/utils";

async function fetchCollection(id?: string, title?: string) {
  const query = id ? `id=${encodeURIComponent(id)}` : `title=${encodeURIComponent(title || "")}`;
  const response = await withTimeout(apiRequest("GET", `/api/vod/collection?${query}&depth=4`), 15000);
  return response.json();
}

export default function VodCollectionScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vod-collection", params.id || params.name],
    queryFn: () => fetchCollection(params.id, params.name),
    staleTime: 20 * 60 * 1000,
  });

  const normalize = (value: unknown) => String(value || "").toLowerCase().trim();
  const collection = data?.collection;
  const directItems = Array.isArray(data?.items) ? data.items : [];
  const fallbackFromCurated = (() => {
    const curated = (queryClient.getQueryData(["vod-module-curated-collections"]) as any[] | undefined) || [];
    const needleId = normalize(params.id);
    const needleName = normalize(params.name);
    const found = curated.find((entry: any) => {
      const idMatch = needleId && normalize(entry?.id) === needleId;
      const nameMatch = needleName && normalize(entry?.name).includes(needleName);
      return idMatch || nameMatch;
    });
    return Array.isArray(found?.items) ? found.items : [];
  })();
  const rawItems = directItems.length ? directItems : fallbackFromCurated;
  const items = [...rawItems].sort((left, right) => {
    const leftDate = Date.parse(String(left?.releaseDate || left?.year || "")) || 0;
    const rightDate = Date.parse(String(right?.releaseDate || right?.year || "")) || 0;
    return leftDate - rightDate;
  });
  const stats = data?.stats || { total: items.length };
  const heroBackdrop = collection?.backdrop || items[0]?.backdrop || items[0]?.poster || null;

  return (
    <View style={styles.container}>
      <NexoraHeader variant="module" title="COLLECTION" titleColor={COLORS.accent} showSearch={false} showProfile />
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            {heroBackdrop ? <Image source={{ uri: heroBackdrop }} style={styles.heroImage} /> : null}
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <Text style={styles.label}>WATCH IN ORDER</Text>
              <Text style={styles.title}>{collection?.name || params.name || "Collection"}</Text>
              <Text style={styles.subtitle}>
                {items.length} titles · oldest to newest
                {stats ? ` · ${stats.movies || 0} movies / ${stats.series || 0} series` : ""}
              </Text>
              {collection?.overview ? <Text style={styles.overview}>{collection.overview}</Text> : null}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.timelineTitle}>Chronological Order</Text>
            <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{items.length}</Text></View>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => `${item.type || "movie"}-${item.id}`}
            scrollEnabled={false}
            contentContainerStyle={styles.stack}
            ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
            renderItem={({ item, index }) => {
              const poster = item?.poster || item?.backdrop || null;
              const year = String(item?.year || item?.releaseDate || "").slice(0, 4);
              const rating = Number(item?.imdb || item?.rating || 0);
              return (
                <TouchableOpacity
                  style={styles.itemRow}
                  onPress={() => router.push({ pathname: "/detail", params: { id: item.id, type: item.type || "movie", title: item.title, tmdbId: item.tmdbId ? String(item.tmdbId) : undefined } })}
                  activeOpacity={0.86}
                >
                  {poster ? (
                    <Image source={{ uri: poster }} style={styles.itemPoster} />
                  ) : (
                    <View style={[styles.itemPoster, styles.itemPosterFallback]} />
                  )}
                  <View style={styles.itemMetaWrap}>
                    <Text style={styles.itemStep}>#{index + 1}</Text>
                    <Text style={styles.itemTitle} numberOfLines={2}>{String(item?.title || "Untitled")}</Text>
                    <Text style={styles.itemMeta}>
                      {year || "Unknown year"}
                      {Number.isFinite(rating) && rating > 0 ? ` · ${rating.toFixed(1)}★` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 64 },
  hero: { height: 340, margin: 16, borderRadius: 22, overflow: "hidden", backgroundColor: COLORS.card },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.52)" },
  heroContent: { position: "absolute", left: 18, right: 18, bottom: 20, gap: 8 },
  label: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase" },
  title: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 28, lineHeight: 32 },
  subtitle: { color: "rgba(255,255,255,0.72)", fontFamily: "Inter_500Medium", fontSize: 13 },
  overview: { color: "rgba(255,255,255,0.68)", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, marginTop: 22, marginBottom: 14 },
  sectionAccentBar: { width: 3, height: 20, backgroundColor: COLORS.accent, borderRadius: 2 },
  timelineTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 20, flex: 1 },
  sectionBadge: {
    backgroundColor: "rgba(229,9,20,0.12)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.30)",
  },
  sectionBadgeText: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 11 },
  stack: { paddingHorizontal: 18, paddingBottom: 6 },
  itemRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  itemPoster: {
    width: 96,
    height: 132,
    backgroundColor: COLORS.card,
  },
  itemPosterFallback: {
    backgroundColor: COLORS.cardElevated,
  },
  itemMetaWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  itemStep: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  itemTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    lineHeight: 24,
  },
  itemMeta: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  rowDivider: { height: 10 },
});