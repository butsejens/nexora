import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { SafeHaptics } from "@/lib/safeHaptics";

export interface ContinueWatchingItem {
  id: string;
  tmdbId?: string | number;
  type: "movie" | "series";
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  progress?: number; // 0-1
  season?: number;
  episode?: number;
}

interface ContinueWatchingRailProps {
  items: ContinueWatchingItem[];
  onItemPress?: (item: ContinueWatchingItem) => void;
}

export default function ContinueWatchingRail({ items, onItemPress }: ContinueWatchingRailProps) {
  if (!items.length) return null;

  const handlePress = (item: ContinueWatchingItem) => {
    SafeHaptics.impactLight();
    if (onItemPress) {
      onItemPress(item);
      return;
    }
    const tmdbId = item.tmdbId ? String(item.tmdbId) : undefined;
    router.push({
      pathname: "/media/detail",
      params: {
        id: tmdbId || item.id,
        type: item.type,
        title: item.title,
        ...(tmdbId ? { tmdbId } : {}),
        ...(item.poster ? { poster: item.poster } : {}),
        ...(item.backdrop ? { backdrop: item.backdrop } : {}),
      },
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={18} color={COLORS.accent} />
        <Text style={styles.title}>Continue Watching</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => {
          const image = item.backdrop || item.poster || null;
          const pct = Math.max(0, Math.min(1, item.progress ?? 0));
          return (
            <TouchableOpacity
              key={`${item.type}-${item.id}`}
              style={styles.card}
              activeOpacity={0.82}
              onPress={() => handlePress(item)}
            >
              {image ? (
                <ExpoImage
                  source={{ uri: image }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.cardElevated }]} />
              )}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
                style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
                start={{ x: 0, y: 0.4 }}
                end={{ x: 0, y: 1 }}
              >
                <View style={styles.cardBottom}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {item.type === "series" && (item.season || item.episode) ? (
                    <Text style={styles.cardSub}>S{item.season ?? 1} · E{item.episode ?? 1}</Text>
                  ) : null}
                  {pct > 0 ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` as any }]} />
                    </View>
                  ) : null}
                </View>
              </LinearGradient>
              <View style={styles.playBtnWrap}>
                <View style={styles.playBtn}>
                  <Ionicons name="play" size={14} color="#fff" />
                </View>
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
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, marginBottom: 12 },
  title: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 22 },
  row: { paddingHorizontal: 18, gap: 14 },
  card: {
    width: 240,
    height: 148,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  cardBottom: { padding: 10, gap: 4 },
  cardTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  cardSub: { color: "rgba(255,255,255,0.6)", fontFamily: "Inter_500Medium", fontSize: 11 },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: COLORS.accent },
  playBtnWrap: { position: "absolute", top: 8, right: 8 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
});
