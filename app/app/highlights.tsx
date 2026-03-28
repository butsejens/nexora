import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import { Image as ExpoImage } from "expo-image";

import { COLORS } from "@/constants/colors";
import { buildHighlightsQuery } from "@/services/realtime-engine";
import { useFollowState } from "@/context/UserStateContext";
import { useOnboardingStore } from "@/store/onboarding-store";
import { selectHighlightsForFeed } from "@/lib/ai";

function withAutoplay(url: string): string {
  if (!url) return "";
  if (url.includes("autoplay=")) return url;
  const glue = url.includes("?") ? "&" : "?";
  return `${url}${glue}autoplay=1&muted=1`;
}

export default function HighlightsFeedScreen() {
  const { height } = useWindowDimensions();
  const { followedTeams } = useFollowState();
  const selectedTeams = useOnboardingStore((state) => state.selectedTeams);
  const selectedCompetitions = useOnboardingStore((state) => state.selectedCompetitions);
  const [activeIndex, setActiveIndex] = useState(0);

  const highlightsQuery = useQuery(buildHighlightsQuery(true));

  const favoriteTeams = useMemo(
    () => [
      ...followedTeams.map((team) => String(team?.teamName || "")),
      ...selectedTeams.map((team) => String(team?.name || "")),
    ].filter(Boolean),
    [followedTeams, selectedTeams],
  );
  const preferredLeagues = useMemo(
    () => selectedCompetitions.map((competition) => String(competition?.name || competition?.id || "")).filter(Boolean),
    [selectedCompetitions],
  );

  const feed = useMemo(() => {
    return selectHighlightsForFeed({
      highlights: highlightsQuery.data || [],
      favoriteTeams,
      preferredLeagues,
    });
  }, [favoriteTeams, preferredLeagues, highlightsQuery.data]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>AUTO HIGHLIGHTS</Text>
        <View style={styles.iconGhost} />
      </View>

      <FlatList
        data={feed}
        keyExtractor={(entry, idx) => `${String(entry?.item?.id || idx)}_${idx}`}
        pagingEnabled
        snapToInterval={height - 96}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const offset = event.nativeEvent.contentOffset.y;
          const next = Math.max(0, Math.round(offset / Math.max(1, height - 96)));
          setActiveIndex(next);
        }}
        renderItem={({ item, index }) => {
          const clip = item.item;
          const embedUrl = withAutoplay(String(clip?.embedUrl || clip?.matchUrl || ""));
          const active = activeIndex === index;
          return (
            <View style={[styles.slide, { height: Math.max(460, height - 96) }]}>
              <View style={styles.card}>
                {active && embedUrl ? (
                  <WebView
                    source={{ uri: embedUrl }}
                    style={styles.player}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                  />
                ) : clip?.thumbnail ? (
                  <ExpoImage source={{ uri: String(clip.thumbnail) }} style={styles.player} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={styles.playerFallback}>
                    <Ionicons name="play-circle-outline" size={40} color="rgba(255,255,255,0.7)" />
                  </View>
                )}

                <View style={styles.overlay}>
                  <Text style={styles.competition}>{String(clip?.competition || "Highlight")}</Text>
                  <Text style={styles.headline} numberOfLines={2}>{String(clip?.title || "Top match moment")}</Text>
                  <View style={styles.reasonPills}>
                    {(item.reasons || []).map((reason) => (
                      <Text key={`${clip?.id || "clip"}_${reason}`} style={styles.reasonPill}>{reason}</Text>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="film-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Nog geen highlights beschikbaar</Text>
            <Text style={styles.emptyBody}>De feed wordt automatisch gevuld zodra clips beschikbaar zijn.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  iconGhost: { width: 34, height: 34 },
  title: {
    color: "#FFFFFF",
    fontFamily: "Inter_800ExtraBold",
    fontSize: 15,
    letterSpacing: 0.9,
  },
  slide: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  player: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  playerFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D1018",
  },
  overlay: {
    marginTop: "auto",
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    gap: 8,
  },
  competition: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  headline: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    lineHeight: 22,
  },
  reasonPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  reasonPill: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.28)",
    backgroundColor: "rgba(229,9,20,0.14)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emptyState: {
    paddingTop: 120,
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  emptyBody: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
