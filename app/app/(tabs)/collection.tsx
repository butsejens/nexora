import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { FRANCHISE_COLLECTIONS } from "@/constants/franchiseCollections";
import { FeaturedCollectionRail } from "@/components/streaming/PremiumRails";
import type { RailItem } from "@/components/streaming/PremiumRails";

function openDetail(item: RailItem) {
  const type = String(item.id).startsWith("tmdb_s_") ? "series" : "movie";
  router.push({ pathname: "/media/detail", params: { id: item.id, type } });
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      data={FRANCHISE_COLLECTIONS}
      keyExtractor={(item) => String(item.id)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: TOP_NAV_H + insets.top + 10,
        paddingBottom: insets.bottom + 90,
      }}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          <Text style={styles.title}>Collecties</Text>
          <Text style={styles.subtitle}>
            Ontdek alle films uit je favoriete filmreeksen, van Marvel tot
            Harry Potter.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <FeaturedCollectionRail collectionId={item.id} onPress={openDetail} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});
