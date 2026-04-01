import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import type { VodCollectionPayload } from "@/lib/services/media-service";

interface CollectionRailProps {
  collections: VodCollectionPayload[];
  title?: string;
}

export default function CollectionRail({ collections, title = "Collections" }: CollectionRailProps) {
  const queryClient = useQueryClient();

  if (!collections.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{collections.length} collections</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {collections.map((collection) => {
          const backdrop = collection.backdrop || collection.items[0]?.backdrop || collection.items[0]?.poster || null;
          return (
            <TouchableOpacity
              key={collection.id}
              style={styles.card}
              activeOpacity={0.84}
              onPress={() => {
                queryClient.setQueryData(["vod-collection", collection.id], {
                  collection: { id: collection.id, name: collection.name, poster: collection.poster, backdrop: collection.backdrop },
                  items: collection.items,
                  stats: { total: collection.itemCount },
                });
                router.push({ pathname: "/vod-collection", params: { id: collection.id, name: collection.name } });
              }}
            >
              {backdrop ? (
                <ExpoImage
                  source={{ uri: backdrop }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.cardElevated }]} />
              )}
              <View style={styles.overlay} />
              <View style={styles.meta}>
                <Text style={styles.label}>COLLECTION</Text>
                <Text style={styles.name} numberOfLines={2}>{collection.name}</Text>
                <Text style={styles.info}>{collection.itemCount} titles</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 28 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 18, marginBottom: 12 },
  title: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 22 },
  count: { color: COLORS.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  row: { paddingHorizontal: 18, gap: 14 },
  card: {
    width: 290,
    height: 172,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },
  meta: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 5 },
  label: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2.2 },
  name: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 22, lineHeight: 26 },
  info: { color: "rgba(255,255,255,0.75)", fontFamily: "Inter_500Medium", fontSize: 12 },
});
