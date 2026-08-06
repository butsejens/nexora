import React from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { MOVIE_STUDIOS, type MovieStudio } from "@/constants/movieStudios";

function openStudio(studio: MovieStudio) {
  router.push({
    pathname: "/media/genre",
    params: {
      genreId: String(studio.id),
      genreTitle: studio.name,
      type: "movie",
      source: "company",
    },
  });
}

export default function StudiosScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numCols = width > 900 ? 4 : width > 600 ? 3 : 2;
  const gap = 12;
  const tileW = Math.floor((width - 32 - gap * (numCols - 1)) / numCols);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      data={MOVIE_STUDIOS}
      key={numCols}
      numColumns={numCols}
      keyExtractor={(item) => String(item.id)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: TOP_NAV_H + insets.top + 10,
        paddingBottom: insets.bottom + 90,
      }}
      columnWrapperStyle={{ gap }}
      ItemSeparatorComponent={() => <View style={{ height: gap }} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          <Text style={styles.title}>Studios</Text>
          <Text style={styles.subtitle}>
            {
              "Blader door films van je favoriete studio's, zoals Marvel, Pixar en Warner Bros."
            }
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={[styles.tile, { width: tileW }]}
          onPress={() => openStudio(item)}
        >
          <LinearGradient
            colors={[item.color1, item.color2]}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.tileText} numberOfLines={2}>
            {item.name}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 6,
    marginBottom: 2,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
  },
  tile: {
    height: 88,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  tileText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
