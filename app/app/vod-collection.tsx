import React from "react";
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { withTimeout } from "@/lib/utils";

async function fetchCollection(id?: string, title?: string) {
  const query = id ? `id=${encodeURIComponent(id)}` : `title=${encodeURIComponent(title || "")}`;
  const response = await withTimeout(apiRequest("GET", `/api/vod/collection?${query}`), 15000);
  return response.json();
}

export default function VodCollectionScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["vod-collection", params.id || params.name],
    queryFn: () => fetchCollection(params.id, params.name),
    staleTime: 20 * 60 * 1000,
  });

  const collection = data?.collection;
  const items = data?.items || [];

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
            {collection?.backdrop ? <Image source={{ uri: collection.backdrop }} style={styles.heroImage} /> : null}
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <Text style={styles.label}>WATCH IN ORDER</Text>
              <Text style={styles.title}>{collection?.name || params.name || "Collection"}</Text>
              <Text style={styles.subtitle}>{items.length} titles · oldest to newest</Text>
              {collection?.overview ? <Text style={styles.overview}>{collection.overview}</Text> : null}
            </View>
          </View>

          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>Chronological Order</Text>
          </View>
          <FlatList
            horizontal
            data={items}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            renderItem={({ item }) => (
              <RealContentCard
                item={{ ...item, year: Number(item.year || 0) || undefined, imdb: Number(item.imdb || item.rating || 0) || undefined } as any}
                onPress={() => router.push({ pathname: "/detail", params: { id: item.id, type: "movie", title: item.title, tmdbId: item.tmdbId ? String(item.tmdbId) : undefined } })}
                width={150}
              />
            )}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 48 },
  hero: { height: 320, margin: 18, borderRadius: 24, overflow: "hidden", backgroundColor: COLORS.card },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  heroContent: { position: "absolute", left: 18, right: 18, bottom: 18, gap: 8 },
  label: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2.2 },
  title: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 30, lineHeight: 34 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontFamily: "Inter_500Medium", fontSize: 13 },
  overview: { color: "rgba(255,255,255,0.74)", fontFamily: "Inter_400Regular", lineHeight: 20 },
  timelineHeader: { paddingHorizontal: 18, marginBottom: 12 },
  timelineTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 22 },
  row: { paddingHorizontal: 18 },
});