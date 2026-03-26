import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { withTimeout } from "@/lib/utils";

async function fetchStudio(id?: string, name?: string) {
  const query = id ? `id=${encodeURIComponent(id)}&name=${encodeURIComponent(name || "")}` : `name=${encodeURIComponent(name || "")}`;
  const response = await withTimeout(apiRequest("GET", `/api/vod/studio?${query}`), 15000);
  return response.json();
}

export default function VodStudioScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["vod-studio", params.id || params.name],
    queryFn: () => fetchStudio(params.id, params.name),
    staleTime: 20 * 60 * 1000,
  });

  const items = data?.items || [];

  return (
    <View style={styles.container}>
      <NexoraHeader variant="module" title="STUDIO" titleColor={COLORS.accent} showSearch={false} showProfile />
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.label}>STUDIO</Text>
              <Text style={styles.title}>{data?.studio?.name || params.name || "Studio"}</Text>
              <Text style={styles.subtitle}>{items.length} popular titles</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <RealContentCard
                item={{ ...item, year: Number(item.year || 0) || undefined, imdb: Number(item.imdb || item.rating || 0) || undefined } as any}
                onPress={() => router.push({ pathname: "/detail", params: { id: item.id, type: "movie", title: item.title, tmdbId: item.tmdbId ? String(item.tmdbId) : undefined } })}
                width={150}
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
  content: { paddingHorizontal: 18, paddingBottom: 48 },
  headerBlock: { paddingVertical: 18, gap: 6 },
  label: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2.2 },
  title: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 30, lineHeight: 34 },
  subtitle: { color: COLORS.textSecondary, fontFamily: "Inter_500Medium", fontSize: 13 },
  row: { justifyContent: "space-between" },
  cardWrap: { marginBottom: 18 },
});