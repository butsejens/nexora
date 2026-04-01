import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { COLORS } from "@/constants/colors";
import type { VodStudioPayload } from "@/lib/services/media-service";

interface StudioGridProps {
  studios: VodStudioPayload[];
  title?: string;
}

export default function StudioGrid({ studios, title = "Studios" }: StudioGridProps) {
  if (!studios.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {studios.map((studio) => (
          <TouchableOpacity
            key={studio.id}
            style={styles.card}
            activeOpacity={0.84}
            onPress={() => router.push({ pathname: "/vod-studio", params: { id: studio.id, name: studio.name } })}
          >
            <View style={styles.logoWrap}>
              {studio.logo ? (
                <ExpoImage
                  source={{ uri: studio.logo }}
                  style={styles.logo}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={100}
                />
              ) : (
                <Text style={styles.logoFallback}>{studio.name.slice(0, 2).toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.name} numberOfLines={2}>{studio.name}</Text>
            <Text style={styles.count}>{studio.itemCount} titles</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 28 },
  header: { paddingHorizontal: 18, marginBottom: 12 },
  title: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 22 },
  row: { paddingHorizontal: 18, gap: 12 },
  card: {
    width: 148,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
    gap: 10,
  },
  logoWrap: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  logo: { width: 80, height: 28 },
  logoFallback: { color: COLORS.background, fontFamily: "Inter_800ExtraBold", fontSize: 22 },
  name: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 16 },
  count: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
});
