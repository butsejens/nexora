import React, { useMemo } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { createContinueWatching } from "@/lib/vod-curation";
import { enrichVodModuleItem } from "@/lib/vod-module";
import { useOnboardingStore } from "@/store/onboarding-store";

type SportsPayload = {
  live?: any[];
  upcoming?: any[];
};

async function fetchJson(path: string) {
  const response = await apiRequest("GET", path);
  return response.json();
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function toMediaItem(item: any, type: "movie" | "series") {
  return enrichVodModuleItem({ ...item, type });
}

function toMatchParams(match: any) {
  return {
    matchId: String(match?.id || ""),
    homeTeam: String(match?.homeTeam || "Home"),
    awayTeam: String(match?.awayTeam || "Away"),
    homeTeamLogo: String(match?.homeTeamLogo || ""),
    awayTeamLogo: String(match?.awayTeamLogo || ""),
    homeScore: String(match?.homeScore ?? 0),
    awayScore: String(match?.awayScore ?? 0),
    league: String(match?.league || ""),
    minute: String(match?.minute ?? ""),
    status: String(match?.status || "upcoming"),
    sport: String(match?.sport || "football"),
  };
}

export default function CuratedHomeScreen() {
  const insets = useSafeAreaInsets();
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const { watchHistory, isFavorite, toggleFavorite } = useNexora();

  const sportsQuery = useQuery({
    queryKey: ["home", "sports-curated", todayUTC()],
    queryFn: async (): Promise<SportsPayload> => {
      const payload = await fetchJson(`/api/sports/live?date=${encodeURIComponent(todayUTC())}`);
      return {
        live: Array.isArray(payload?.live) ? payload.live : [],
        upcoming: Array.isArray(payload?.upcoming) ? payload.upcoming : [],
      };
    },
    enabled: sportsEnabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    retry: 1,
  });

  const mediaQuery = useQuery({
    queryKey: ["home", "media-curated"],
    queryFn: async () => {
      const [movieData, seriesData] = await Promise.all([
        fetchJson("/api/movies/trending"),
        fetchJson("/api/series/trending"),
      ]);
      return {
        movies: [
          ...(Array.isArray(movieData?.trending) ? movieData.trending : []),
          ...(Array.isArray(movieData?.popular) ? movieData.popular : []),
        ].slice(0, 12).map((item: any) => toMediaItem(item, "movie")),
        series: [
          ...(Array.isArray(seriesData?.trending) ? seriesData.trending : []),
          ...(Array.isArray(seriesData?.popular) ? seriesData.popular : []),
        ].slice(0, 12).map((item: any) => toMediaItem(item, "series")),
      };
    },
    enabled: moviesEnabled,
    staleTime: 8 * 60 * 1000,
    retry: 1,
  });

  const continueWatching = useMemo(() => {
    const movieRows = createContinueWatching(watchHistory as any, "movie", 6);
    const seriesRows = createContinueWatching(watchHistory as any, "series", 6);
    return [...movieRows, ...seriesRows]
      .slice(0, 8)
      .map((item: any) => enrichVodModuleItem({ ...item, type: item.season ? "series" : item.type || "movie" }));
  }, [watchHistory]);

  const liveMatches = sportsEnabled ? (sportsQuery.data?.live || []) : [];
  const upcomingMatches = sportsEnabled ? (sportsQuery.data?.upcoming || []) : [];
  const todayMatches = [...liveMatches, ...upcomingMatches].slice(0, 3);
  const movieRail = moviesEnabled ? (mediaQuery.data?.movies || []).slice(0, 8) : [];
  const seriesRail = moviesEnabled ? (mediaQuery.data?.series || []).slice(0, 8) : [];

  const heroSport = sportsEnabled ? (liveMatches[0] || upcomingMatches[0]) : null;
  const heroMedia = moviesEnabled ? (movieRail[0] || seriesRail[0] || null) : null;
  const heroIsSport = Boolean(heroSport);

  const heroTitle = heroIsSport
    ? `${String(heroSport?.homeTeam || "Home")} vs ${String(heroSport?.awayTeam || "Away")}`
    : String(heroMedia?.title || "Welcome to NEXORA");

  const heroMeta = heroIsSport
    ? String(heroSport?.league || "Sport")
    : `${heroMedia?.type === "series" ? "Series" : "Film"}${heroMedia?.year ? ` · ${heroMedia.year}` : ""}`;

  const heroImage = heroIsSport ? null : (heroMedia?.backdrop || heroMedia?.poster || null);
  return (
    <View style={styles.screen}>
      <NexoraHeader
        variant="module"
        title="HOME"
        titleColor={COLORS.accent}
        compact
        showSearch
        showNotification
        showFavorites
        showProfile
        onSearch={() => router.push("/(tabs)/search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={Boolean(sportsQuery.isRefetching || mediaQuery.isRefetching)}
            onRefresh={() => {
              sportsQuery.refetch();
              mediaQuery.refetch();
            }}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      >
        <View style={styles.heroWrap}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (heroIsSport && heroSport) {
                router.push({ pathname: "/match-detail", params: toMatchParams(heroSport) });
                return;
              }
              if (heroMedia) {
                router.push({
                  pathname: "/detail",
                  params: {
                    id: heroMedia.id,
                    type: heroMedia.type,
                    title: heroMedia.title,
                    tmdbId: heroMedia.tmdbId ? String(heroMedia.tmdbId) : undefined,
                  },
                });
              }
            }}
          >
            <View style={styles.heroCard}>
              {heroImage ? <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              <LinearGradient colors={["rgba(9,9,13,0.15)", "rgba(9,9,13,0.9)"]} style={StyleSheet.absoluteFill} />
              <View style={styles.heroContent}>
                <Text style={styles.heroEyebrow}>{heroIsSport ? "SPORT SPOTLIGHT" : "CURATED PICK"}</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>{heroTitle}</Text>
                <Text style={styles.heroMeta}>{heroMeta}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
        {sportsEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SPORT</Text>
              <TouchableOpacity onPress={() => router.push("/sport")}>
                <Text style={styles.sectionAction}>Open sport module</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.todayCard}>
              {todayMatches.length > 0 ? todayMatches.map((match: any) => (
                <TouchableOpacity
                  key={String(match?.id || `${match?.homeTeam}_${match?.awayTeam}`)}
                  style={styles.todayRow}
                  activeOpacity={0.82}
                  onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                >
                  <Text style={styles.todayTeams} numberOfLines={1}>{String(match?.homeTeam || "Home")} vs {String(match?.awayTeam || "Away")}</Text>
                  <Text style={styles.todayMeta} numberOfLines={1}>{String(match?.league || "Sport")}</Text>
                </TouchableOpacity>
              )) : <Text style={styles.emptyText}>No matches scheduled yet.</Text>}
            </View>
          </View>
        )}

        {moviesEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>FILMS</Text>
              <TouchableOpacity onPress={() => router.push("/films-series")}>
                <Text style={styles.sectionAction}>Open Films & Series</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {movieRail.map((item: any) => (
                <RealContentCard
                  key={`movie_${item.id}`}
                  width={122}
                  item={{
                    id: String(item.id),
                    title: item.title,
                    year: Number(item.year || 0),
                    imdb: Number(item.imdb || item.rating || 0),
                    quality: item.quality || "HD",
                    poster: item.poster || null,
                    backdrop: item.backdrop || null,
                    isTrending: item.isTrending,
                  }}
                  isFavorite={isFavorite(String(item.id))}
                  onFavorite={() => toggleFavorite(String(item.id))}
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.id), type: "movie", title: item.title } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {moviesEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SERIES</Text>
              <TouchableOpacity onPress={() => router.push("/films-series")}>
                <Text style={styles.sectionAction}>Browse all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {seriesRail.map((item: any) => (
                <RealContentCard
                  key={`series_${item.id}`}
                  width={122}
                  item={{
                    id: String(item.id),
                    title: item.title,
                    year: Number(item.year || 0),
                    imdb: Number(item.imdb || item.rating || 0),
                    quality: item.quality || "HD",
                    poster: item.poster || null,
                    backdrop: item.backdrop || null,
                    isTrending: item.isTrending,
                  }}
                  isFavorite={isFavorite(String(item.id))}
                  onFavorite={() => toggleFavorite(String(item.id))}
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.id), type: "series", title: item.title } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {continueWatching.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>CONTINUE WATCHING</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {continueWatching.slice(0, 8).map((item: any) => (
                <RealContentCard
                  key={`cw_${item.type}_${item.id}`}
                  width={122}
                  item={{
                    id: String(item.id),
                    title: item.title,
                    year: Number(item.year || 0),
                    imdb: Number(item.imdb || item.rating || 0),
                    quality: item.quality || "HD",
                    poster: item.poster || null,
                    backdrop: item.backdrop || null,
                    progress: item.progress,
                  }}
                  showProgress
                  isFavorite={isFavorite(String(item.id))}
                  onFavorite={() => toggleFavorite(String(item.id))}
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.id), type: item.type, title: item.title } })}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#09090D" },
  heroWrap: { paddingHorizontal: 16, paddingTop: 12, marginBottom: 18 },
  heroCard: {
    minHeight: 214,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#151520",
    justifyContent: "flex-end",
  },
  heroContent: { padding: 18, gap: 6 },
  heroEyebrow: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
    lineHeight: 28,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  section: { marginBottom: 10 },
  sectionHead: {
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.6,
  },
  sectionAction: { color: COLORS.accent, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  todayCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  todayRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 3,
  },
  todayTeams: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  todayMeta: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rail: { paddingHorizontal: 18, paddingBottom: 8 },
});
