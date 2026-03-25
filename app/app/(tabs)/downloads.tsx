import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Platform, TouchableOpacity,
  Image, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { SPACING, TYPOGRAPHY } from "@/constants/design-system";
import { NexoraHeader } from "@/components/NexoraHeader";
import { StateBlock, SurfaceCard } from "@/components/ui";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";
import type { DownloadedItem } from "@/context/NexoraContext";

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function DownloadCard({ item, onPlay, onDelete }: {
  item: DownloadedItem;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <View style={styles.card}>
      {/* Poster */}
      <View style={styles.poster}>
        {item.poster && !imgError ? (
          <Image source={{ uri: item.poster }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.posterPlaceholder]}>
            <Ionicons name={item.type === "series" ? "tv-outline" : "film-outline"} size={24} color={COLORS.textMuted} />
          </View>
        )}
        {/* Overlay gradient */}
        <View style={styles.posterOverlay} />
        <View style={styles.qualityTag}>
          <Text style={styles.qualityTagText}>{item.quality || "HD"}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <View style={styles.meta}>
          {item.year ? <Text style={styles.metaText}>{item.year}</Text> : null}
          {item.year && item.fileSize ? <Text style={styles.metaDot}>·</Text> : null}
          {item.fileSize ? <Text style={styles.metaText}>{formatBytes(item.fileSize)}</Text> : null}
        </View>
        <Text style={styles.dateText}>Gedownload op {formatDate(item.downloadedAt)}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.playBtn} onPress={onPlay} activeOpacity={0.8}>
            <Ionicons name="play" size={14} color={COLORS.background} />
            <Text style={styles.playBtnText}>Afspelen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={14} color={COLORS.live} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const { downloads, removeDownload } = useNexora();
  const [deleting, setDeleting] = useState<string | null>(null);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  const handlePlay = (item: DownloadedItem) => {
    SafeHaptics.impactLight();
    router.push({
      pathname: "/player",
      params: {
        streamUrl: item.filePath,
        title: item.title,
        type: item.type === "channel" ? "movie" : item.type,
        contentId: item.contentId,
        season: "1", episode: "1",
      },
    });
  };

  const handleDelete = (item: DownloadedItem) => {
    SafeHaptics.impactLight();
    Alert.alert(
      "Remove download",
      `Do you want to remove "${item.title}" from your device?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeleting(item.id);
            await removeDownload(item.id);
            setDeleting(null);
          },
        },
      ]
    );
  };

  const totalSize = downloads.reduce((acc, d) => acc + (d.fileSize || 0), 0);

  return (
    <View style={styles.container}>
      <NexoraHeader
        title="Downloads"
        showFavorites={false}
        showSearch={false}
        showProfile
        onProfile={() => router.push("/profile")}
      />

      {downloads.length > 0 && (
        <SurfaceCard style={styles.summary}>
          <Ionicons name="phone-portrait-outline" size={15} color={COLORS.accent} />
          <Text style={styles.summaryText}>
            {downloads.length} item{downloads.length !== 1 ? "s" : ""} opgeslagen
            {totalSize > 0 ? ` · ${formatBytes(totalSize)}` : ""}
          </Text>
        </SurfaceCard>
      )}

      {downloads.length === 0 ? (
        <View style={styles.empty}>
          <StateBlock
            icon="cloud-download-outline"
            title="Geen downloads"
            message="Download films of series vanuit je IPTV playlist om ze offline te bekijken."
          />
          <View style={styles.emptyActions}>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push("/(tabs)/movies")}
            >
              <Ionicons name="film-outline" size={16} color={COLORS.accent} />
              <Text style={styles.emptyBtnText}>Ga naar Movies</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push("/(tabs)/series")}
            >
              <Ionicons name="tv-outline" size={16} color={COLORS.accent} />
              <Text style={styles.emptyBtnText}>Ga naar Series</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={downloads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            deleting === item.id ? (
              <SurfaceCard style={[styles.card, { justifyContent: "center", alignItems: "center", height: 90 }]}>
                <ActivityIndicator color={COLORS.accent} />
              </SurfaceCard>
            ) : (
              <DownloadCard
                item={item}
                onPlay={() => handlePlay(item)}
                onDelete={() => handleDelete(item)}
              />
            )
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  summary: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  summaryText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  empty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 40, gap: 12,
  },
  emptyActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.accent,
    backgroundColor: COLORS.accentGlow,
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent },
  card: {
    flexDirection: "row", gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: "hidden",
  },
  poster: {
    width: 85, height: 125,
    backgroundColor: COLORS.border,
    position: "relative",
  },
  posterPlaceholder: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.cardElevated,
  },
  posterOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  qualityTag: {
    position: "absolute", bottom: 6, left: 6,
    backgroundColor: COLORS.accentGlow, borderRadius: 4, borderWidth: 1, borderColor: COLORS.accent,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  qualityTagText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.accent },
  info: { flex: 1, paddingVertical: 14, paddingRight: 14, gap: 4 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text, lineHeight: 20 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  metaDot: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  dateText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  playBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  playBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.background },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.liveGlow, borderWidth: 1, borderColor: COLORS.live + "80",
    alignItems: "center", justifyContent: "center",
  },
});
