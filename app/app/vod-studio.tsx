import React from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { withTimeout } from "@/lib/utils";

async function fetchStudio(id?: string, name?: string) {
  const query = id ? `id=${encodeURIComponent(id)}&name=${encodeURIComponent(name || "")}` : `name=${encodeURIComponent(name || "")}`;
  const response = await withTimeout(apiRequest("GET", `/api/vod/studio?${query}&depth=5`), 15000);
  return response.json();
}

export default function VodStudioScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const { width: screenWidth } = useWindowDimensions();
  const columns = screenWidth >= 720 ? 4 : 3;
  const cardWidth = Math.floor((screenWidth - 18 * 2 - 10 * (columns - 1)) / columns);

  const { data, isLoading } = useQuery({
    queryKey: ["vod-studio", params.id || params.name],
    queryFn: () => fetchStudio(params.id, params.name),
    staleTime: 20 * 60 * 1000,
  });

  const studio = data?.studio;
  const items = data?.items || [];
  const stats = data?.stats;

  return (
    <View style={styles.container}>
      <NexoraHeader variant="module" title="STUDIO" titleColor={COLORS.accent} showSearch={false} showBack showProfile={false} />
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={columns}
          key={`studio-grid-${columns}`}
          keyExtractor={(item) => `${item.type || "movie"}-${item.id}`}
          contentContainerStyle={styles.content}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Studio identity row */}
              <View style={styles.studioIdentity}>
                {studio?.logo ? (
                  <Image source={{ uri: studio.logo }} resizeMode="contain" style={styles.studioLogoLarge} />
                ) : (
                  <View style={styles.studioLogoPlaceholder}>
                    <Text style={styles.studioLogoInitial}>{(studio?.name || params.name || "S").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.studioMetaBlock}>
                  <Text style={styles.label}>STUDIO</Text>
                  <Text style={styles.title}>{studio?.name || params.name || "Studio"}</Text>
                  <Text style={styles.subtitle}>
                    {items.length} titles
                    {stats ? ` · ${stats.movies || 0} movies / ${stats.series || 0} series` : ""}
                  </Text>
                </View>
              </View>
              {/* Section divider */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionAccentBar} />
                <Text style={styles.sectionTitle}>All Titles</Text>
                <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{items.length}</Text></View>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.cardWrap, { width: cardWidth }]}>
              <RealContentCard
                item={{ ...item, year: Number(item.year || 0) || undefined, imdb: Number(item.imdb || item.rating || 0) || undefined } as any}
                onPress={() => router.push({ pathname: "/detail", params: { id: item.id, type: item.type || "movie", title: item.title, tmdbId: item.tmdbId ? String(item.tmdbId) : undefined } })}
                width={cardWidth}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingBottom: 72 },
  headerBlock: { paddingTop: 8, paddingBottom: 4, gap: 0 },
  studioIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 4,
  },
  studioLogoLarge: {
    width: 88,
    height: 88,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  studioLogoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 18,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  studioLogoInitial: { color: COLORS.accent, fontSize: 36, fontFamily: "Inter_800ExtraBold" },
  studioMetaBlock: { flex: 1, gap: 4 },
  label: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase" },
  title: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 24, lineHeight: 28 },
  subtitle: { color: COLORS.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 14 },
  sectionAccentBar: { width: 3, height: 20, backgroundColor: COLORS.accent, borderRadius: 2 },
  sectionTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 18, flex: 1 },
  sectionBadge: {
    backgroundColor: "rgba(229,9,20,0.12)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.30)",
  },
  sectionBadgeText: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 11 },
  row: { gap: 10, marginBottom: 10 },
  cardWrap: { marginBottom: 0 },
});