import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";

async function fetchMovieFull(id: string) {
  const res = await apiRequest("GET", `/api/movies/${id}/full`);
  return res.json();
}
async function fetchSeriesFull(id: string) {
  const res = await apiRequest("GET", `/api/series/${id}/full`);
  return res.json();
}

function Poster({ uri, size = 54 }: { uri?: string | null; size?: number }) {
  if (!uri) {
    return (
      <View style={[styles.posterFallback, { width: size, height: Math.round(size * 1.5) }]}>
        <Ionicons name="image-outline" size={18} color={COLORS.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: Math.round(size * 1.5), borderRadius: 10 }}
      resizeMode="cover"
    />
  );
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 1100);

  const { favorites, toggleFavorite, iptvChannels } = useNexora();

  const { iptvFavs, tmdbFavs } = useMemo(() => {
    const iptv = [] as any[];
    const tmdb = [] as string[];

    for (const id of favorites) {
      if (String(id).startsWith("iptv_")) iptv.push(id);
      else tmdb.push(String(id));
    }

    return { iptvFavs: iptv, tmdbFavs: tmdb };
  }, [favorites]);

  const iptvItems = useMemo(() => {
    const map = new Map(iptvChannels.map((c) => [c.id, c]));
    return iptvFavs.map((id) => map.get(id)).filter(Boolean);
  }, [iptvFavs, iptvChannels]);

  // Fetch TMDB favorites (best-effort: try movie then series)
  const { data: tmdbData } = useQuery({
    queryKey: ["favorites", "tmdb", tmdbFavs.join(",")],
    queryFn: async () => {
      const results = await Promise.allSettled(
        tmdbFavs.slice(0, 80).map(async (id) => {
          try {
            const m = await fetchMovieFull(id);
            return { ...m, _type: "movie" as const };
          } catch {}
          try {
            const s = await fetchSeriesFull(id);
            return { ...s, _type: "series" as const };
          } catch {}
          return null;
        }),
      );
      return results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value != null)
        .map((r) => r.value);
    },
    enabled: tmdbFavs.length > 0,
    staleTime: 60_000,
  });

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={styles.container}>
      <NexoraHeader showSearch showNotification showProfile   onProfile={() => router.push("/profile")}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad, width: contentWidth }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heroHeadline}>All your saved content in one place</Text>
        <Text style={styles.title}>Favorites</Text>

        <Text style={styles.sectionTitle}>IPTV</Text>
        {iptvItems.length === 0 ? (
          <Text style={styles.empty}>Geen IPTV favorieten.</Text>
        ) : (
          iptvItems.map((ch: any) => (
            <View key={ch.id} style={styles.row}>
              <Poster uri={ch.poster || ch.logo} />
              <TouchableOpacity
                style={styles.rowBody}
                onPress={() => {
                  if (ch.category === "live") {
                    // Live TV: skip detail, go direct to player
                    router.push({
                      pathname: "/player",
                      params: {
                        streamUrl: ch.url,
                        title: ch.title || ch.name,
                        type: ch.category,
                        contentId: ch.id,
                        poster: ch.poster || ch.logo || "",
                        ...(ch.tmdbId ? { tmdbId: String(ch.tmdbId) } : {}),
                      },
                    });
                  } else {
                    // Movie/Series: go through detail to get TMDB info first
                    router.push({
                      pathname: "/detail",
                      params: {
                        id: ch.id,
                        type: ch.category,
                        title: ch.title || ch.name,
                        isIptv: "true",
                        streamUrl: ch.url,
                      },
                    });
                  }
                }}
              >
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {ch.title || ch.name}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {ch.group} · {ch.category.toUpperCase()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleFavorite(ch.id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={COLORS.live} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Movies / Series</Text>
        {!tmdbData || tmdbData.length === 0 ? (
          <Text style={styles.empty}>Geen Movie/Series favorieten.</Text>
        ) : (
          tmdbData.map((it: any) => (
            <View key={`${it._type}_${it.id}`} style={styles.row}>
              <Poster uri={it.poster || null} />
              <TouchableOpacity
                style={styles.rowBody}
                onPress={() =>
                  router.push({
                    pathname: "/detail",
                    params: { id: String(it.id), type: it._type, title: it.title },
                  })
                }
              >
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {it.title}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {(it._type === "movie" ? "Movie" : "Series")}
                  {it.year ? ` · ${it.year}` : ""}
                  {it.imdb ? ` · ⭐ ${it.imdb}` : ""}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleFavorite(String(it.id))} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={COLORS.live} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  heroHeadline: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 27,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 10,
    marginBottom: 8,
  },
  empty: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", paddingVertical: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.cardElevated,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: COLORS.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rowSub: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 8 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14, marginHorizontal: 8 },
  posterFallback: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
  },
});
