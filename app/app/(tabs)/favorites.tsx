import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { COLORS } from "@/constants/colors";
import { TYPOGRAPHY } from "@/constants/design-system";
import { NexoraHeader } from "@/components/NexoraHeader";
import { SectionHeader, StateBlock, SurfaceCard } from "@/components/ui";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { useTranslation } from "@/lib/useTranslation";

type WatchPriority = "must" | "top" | "later";

const PRIORITY_META: Record<
  WatchPriority,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  must: { label: "Must Watch", color: "#FFB703", icon: "flame" },
  top: { label: "Top Pick", color: "#00D4FF", icon: "sparkles" },
  later: { label: "Later", color: "#9CA3AF", icon: "time" },
};

const PRIORITY_ORDER: WatchPriority[] = ["must", "top", "later"];

function nextPriority(current?: WatchPriority): WatchPriority {
  if (!current) return "must";
  const idx = PRIORITY_ORDER.indexOf(current);
  return PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
}

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
      <View
        style={[
          styles.posterFallback,
          { width: size, height: Math.round(size * 1.5) },
        ]}
      >
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
  const { t } = useTranslation();
  const contentWidth = Math.min(width, 1100);

  const { favorites, toggleFavorite } = useNexora();
  const [priorityMap, setPriorityMap] = React.useState<
    Record<string, WatchPriority>
  >({});

  React.useEffect(() => {
    let alive = true;
    AsyncStorage.getItem("nexora_watch_priority")
      .then((raw) => {
        if (!alive) return;
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") setPriorityMap(parsed);
        } catch {}
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const setPriority = React.useCallback(
    async (id: string, value: WatchPriority) => {
      const next = { ...priorityMap, [id]: value };
      setPriorityMap(next);
      try {
        await AsyncStorage.setItem(
          "nexora_watch_priority",
          JSON.stringify(next),
        );
      } catch {}
    },
    [priorityMap],
  );

  const favIds = useMemo(() => favorites.map((id) => String(id)), [favorites]);

  // Fetch TMDB favorites (best-effort: try movie then series)
  const { data: tmdbData } = useQuery({
    queryKey: ["favorites", "tmdb", favIds.join(",")],
    queryFn: async () => {
      const results = await Promise.allSettled(
        favIds.slice(0, 80).map(async (id) => {
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
        .filter(
          (r): r is PromiseFulfilledResult<any> =>
            r.status === "fulfilled" && r.value != null,
        )
        .map((r) => r.value);
    },
    enabled: favIds.length > 0,
    staleTime: 60_000,
  });

  const tmdbSorted = useMemo(() => {
    const list = Array.isArray(tmdbData) ? tmdbData : [];
    return [...list]
      .filter((item: any) => {
        const t = String(item?.title || "").trim();
        // Filter out placeholder/corrupted entries with generic titles or no title
        return t && t !== "Movie" && t !== "Series" && t !== "Unknown";
      })
      .sort((a: any, b: any) => {
        const ida = `${a?._type || ""}_${String(a?.id || "")}`;
        const idb = `${b?._type || ""}_${String(b?.id || "")}`;
        const pa = priorityMap[ida] || priorityMap[String(a?.id || "")];
        const pb = priorityMap[idb] || priorityMap[String(b?.id || "")];
        const ai = pa ? PRIORITY_ORDER.indexOf(pa) : 99;
        const bi = pb ? PRIORITY_ORDER.indexOf(pb) : 99;
        return ai - bi;
      });
  }, [priorityMap, tmdbData]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={styles.container}>
      <NexoraHeader
        showSearch
        showNotification
        showProfile
        onProfile={() => router.push("/profile")}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPad, width: contentWidth },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heroHeadline}>{t("favorites.heroSubtitle")}</Text>
        <Text style={styles.title}>{t("favorites.title")}</Text>

        <SectionHeader
          title={t("favorites.moviesSeries")}
          subtitle={t("favorites.moviesSeriesSub")}
        />
        {tmdbSorted.length === 0 ? (
          <StateBlock
            icon="film-outline"
            title={t("favorites.noMoviesSeries")}
            message={t("favorites.noMoviesSeriesSub")}
          />
        ) : (
          tmdbSorted.map((it: any) => (
            <SurfaceCard key={`${it._type}_${it.id}`} style={styles.row}>
              <Poster uri={it.poster || null} />
              <TouchableOpacity
                style={styles.rowBody}
                onPress={() =>
                  router.push({
                    pathname: "/media/detail",
                    params: {
                      id: String(it.id),
                      type: it._type,
                      title: it.title,
                    },
                  })
                }
              >
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {it.title}
                </Text>
                {(() => {
                  const key = `${it._type}_${String(it.id)}`;
                  const prio = priorityMap[key] || priorityMap[String(it.id)];
                  return prio ? (
                    <View
                      style={[
                        styles.priorityBadge,
                        {
                          borderColor: `${PRIORITY_META[prio].color}77`,
                          backgroundColor: `${PRIORITY_META[prio].color}22`,
                        },
                      ]}
                    >
                      <Ionicons
                        name={PRIORITY_META[prio].icon}
                        size={11}
                        color={PRIORITY_META[prio].color}
                      />
                      <Text
                        style={[
                          styles.priorityText,
                          { color: PRIORITY_META[prio].color },
                        ]}
                      >
                        {PRIORITY_META[prio].label}
                      </Text>
                    </View>
                  ) : null;
                })()}
                <Text style={styles.rowSub} numberOfLines={1}>
                  {it._type === "movie"
                    ? t("favorites.movie")
                    : t("favorites.series")}
                  {it.year ? ` · ${it.year}` : ""}
                  {it.imdb ? ` · ⭐ ${it.imdb}` : ""}
                </Text>
              </TouchableOpacity>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => toggleFavorite(String(it.id))}
                  style={styles.iconBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={17}
                    color={COLORS.live}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const compoundId = `${it._type}_${String(it.id)}`;
                    const current =
                      priorityMap[compoundId] || priorityMap[String(it.id)];
                    const next = nextPriority(current);
                    void setPriority(compoundId, next);
                    void setPriority(String(it.id), next);
                  }}
                  style={styles.iconBtn}
                >
                  <Ionicons
                    name="funnel-outline"
                    size={17}
                    color={COLORS.accent}
                  />
                </TouchableOpacity>
              </View>
            </SurfaceCard>
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
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  heroHeadline: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 27,
    marginHorizontal: 24,
    marginBottom: 10,
  },
  title: {
    ...TYPOGRAPHY.screenTitle,
    color: COLORS.text,
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 14 },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  priorityText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  rowSub: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 20,
    marginHorizontal: 4,
    opacity: 0.8,
  },
  posterFallback: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.cardElevated,
  },
});
