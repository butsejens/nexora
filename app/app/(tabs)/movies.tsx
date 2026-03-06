import React, { useState, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Platform, RefreshControl,
  TouchableOpacity, TextInput, ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";

async function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timeout")), ms)),
  ]);
}

async function fetchMovies() {
  try {
    const res = await withTimeout(apiRequest("GET", "/api/movies/trending"), 8000);
    return await res.json();
  } catch (error: any) {
    return {
      trending: [],
      newReleases: [],
      topRated: [],
      popular: [],
      upcoming: [],
      error: String(error?.message || "Movies request failed"),
    };
  }
}

async function fetchPublicVodMovies() {
  const sources = [
    "https://iptv-org.github.io/iptv/categories/movies.m3u",
    "https://iptv-org.github.io/iptv/categories/series.m3u",
    "https://i.mjh.nz/PlutoTV/all.m3u8",
    "https://i.mjh.nz/SamsungTVPlus/all.m3u8",
    "https://i.mjh.nz/Plex/all.m3u8",
  ];

  const settled = await Promise.allSettled(
    sources.map(async (url) => {
      try {
        const res = await Promise.race([
          apiRequest("POST", "/api/playlist/parse", { url }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000)),
        ]);
        return (res as Response).json();
      } catch (e) {
        console.warn(`[Movies] VOD fetch failed for ${url}:`, e);
        return { movies: [] };
      }
    })
  );

  const movies: any[] = [];
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      movies.push(...(entry.value?.movies || []));
    }
  }

  return movies.slice(0, 600); // Cap at 600 items
}

export default function MoviesScreen() {
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, iptvChannels, isChannelVisible, isLoadingPlaylist } = useNexora();
  const [groupFilter, setGroupFilter] = useState("Alles");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingGuardReached, setLoadingGuardReached] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["movies", "trending"],
    queryFn: fetchMovies,
    staleTime: 5 * 60 * 1000,
    retry: 0,
    retryDelay: 2000,
  });

  const publicVodQuery = useQuery({
    queryKey: ["movies", "public-vod"],
    queryFn: fetchPublicVodMovies,
    staleTime: 60 * 60 * 1000,
    retry: 0,
    retryDelay: 5000,
  });

  const iptvMovies = useMemo(
    () => iptvChannels.filter(c => c.category === "movie" && isChannelVisible(c.id, c.group)),
    [iptvChannels, isChannelVisible]
  );

  const iptvGroups = useMemo(() => {
    const groups = new Set<string>();
    iptvMovies.forEach(c => { if (c.group) groups.add(c.group); });
    return ["Alles", ...Array.from(groups).sort()];
  }, [iptvMovies]);

  const filteredIptv = useMemo(() => {
    let list = groupFilter === "Alles" ? iptvMovies : iptvMovies.filter(c => c.group === groupFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.title || c.name || "").toLowerCase().includes(q));
    }
    return list.map(c => ({
      id: c.id, title: c.title || c.name, poster: c.poster || null,
      backdrop: c.backdrop || null, synopsis: c.synopsis || "",
      year: c.year, imdb: c.rating, genre: [], quality: "HD",
      isIptv: true, streamUrl: c.url, tmdbId: c.tmdbId,
      color: COLORS.card,
    }));
  }, [iptvMovies, groupFilter, search]);

  const publicVodMapped = useMemo(() => {
    const items = (publicVodQuery.data || []).slice(0, 350);
    return items.map((c: any, idx: number) => ({
      id: `public-movie-${idx}-${c.id || c.name || "item"}`,
      title: c.title || c.name || "Onbekend",
      poster: c.poster || c.logo || null,
      backdrop: c.backdrop || null,
      synopsis: c.synopsis || "",
      year: c.year,
      imdb: c.rating,
      genre: [],
      quality: "HD",
      isIptv: true,
      streamUrl: c.url,
      tmdbId: c.tmdbId,
      color: COLORS.card,
      source: "public",
    }));
  }, [publicVodQuery.data]);

  const trending = useMemo(() => data?.trending || [], [data]);
  const newReleases = useMemo(() => data?.newReleases || [], [data]);
  const topRated = useMemo(() => data?.topRated || [], [data]);
  const popular = useMemo(() => data?.popular || [], [data]);
  const upcoming = useMemo(() => data?.upcoming || [], [data]);
  const featured = iptvMovies.length > 0
    ? filteredIptv[0]
    : (trending[0] || newReleases[0]);

  const rawCatalogError =
    (data as any)?.error ||
    (publicVodQuery.error as any)?.message ||
    (isError ? "Movie catalogus niet beschikbaar" : "");
  const normalizedCatalogError = rawCatalogError ? normalizeApiError(rawCatalogError) : null;
  const catalogErrorRef = useMemo(() => (rawCatalogError ? buildErrorReference("NX-MOV") : ""), [rawCatalogError]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const isTabLoading = isLoading || publicVodQuery.isLoading || isLoadingPlaylist;

  useEffect(() => {
    if (!isTabLoading) {
      setLoadingGuardReached(false);
      return;
    }
    const timer = setTimeout(() => setLoadingGuardReached(true), 12_000);
    return () => clearTimeout(timer);
  }, [isTabLoading]);

  // IPTV → detail met isIptv flag → detail haalt TMDB info op via titel/tmdbId
  // TMDB → direct naar detail
  const goToDetail = (item: any) => {
    if (item.isIptv) {
      router.push({
        pathname: "/detail",
        params: {
          id: item.id,
          type: "movie",
          title: item.title,
          isIptv: "true",
          streamUrl: item.streamUrl,
        },
      });
    } else {
      router.push({ pathname: "/detail", params: { id: item.id, type: "movie", title: item.title } });
    }
  };

  const filteredTmdb = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const results = [
      ...trending.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...newReleases.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...topRated.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...popular.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
      ...upcoming.filter((m: any) => (m.title || "").toLowerCase().includes(q)),
    ];
    const seen = new Set<string>();
    return results.filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
  }, [search, trending, newReleases, topRated, popular, upcoming]);

  return (
    <View style={styles.container}>
      <NexoraHeader
        title="Movies"
        showSearch showFavorites showProfile
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      {isLoadingPlaylist && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Playlist laden...</Text>
        </View>
      )}

      {loadingGuardReached && (
        <View style={styles.watchdogBanner}>
          <Ionicons name="time-outline" size={14} color={COLORS.accent} />
          <Text style={styles.watchdogText}>
            Laden duurt langer dan verwacht. We tonen beschikbare resultaten zodra die binnenkomen.
          </Text>
        </View>
      )}

      {normalizedCatalogError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={14} color={COLORS.live} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.errorText}>{normalizedCatalogError.userMessage}</Text>
            <Text style={styles.errorCodeText}>Foutcode: {catalogErrorRef || normalizedCatalogError.code}</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={[]}
        keyExtractor={() => ""}
        renderItem={null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} tintColor={COLORS.accent} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Zoek een film..."
                placeholderTextColor={COLORS.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} style={{ paddingRight: 12 }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {search.trim() ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Zoekresultaten</Text>
                {filteredIptv.length > 0 && (
                  <>
                    <View style={styles.sourceLabel}>
                      <MaterialCommunityIcons name="play-network" size={12} color={COLORS.accent} />
                      <Text style={styles.sourceLabelText}>Jouw Playlist</Text>
                    </View>
                    <FlatList horizontal data={filteredIptv} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </>
                )}
                {publicVodMapped.length > 0 && (
                  <>
                    <View style={styles.sourceLabel}>
                      <MaterialCommunityIcons name="earth" size={12} color="#4AC1FF" />
                      <Text style={[styles.sourceLabelText, { color: "#4AC1FF" }]}>Open M3U</Text>
                    </View>
                    <FlatList horizontal data={publicVodMapped} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </>
                )}
                {(filteredTmdb ?? []).length > 0 && (
                  <>
                    <View style={styles.sourceLabel}>
                      <MaterialCommunityIcons name="database" size={12} color="#E50914" />
                      <Text style={[styles.sourceLabelText, { color: "#E50914" }]}>Catalogus</Text>
                    </View>
                    <FlatList horizontal data={filteredTmdb ?? []} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </>
                )}
                {filteredIptv.length === 0 && publicVodMapped.length === 0 && (filteredTmdb ?? []).length === 0 && (
                  <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
                    <Ionicons name="film-outline" size={40} color={COLORS.textMuted} />
                    <Text style={{ fontFamily: "Inter_400Regular", color: COLORS.textMuted }}>Geen films gevonden voor &quot;{search}&quot;</Text>
                  </View>
                )}
              </View>
            ) : (
              <>
                {/* Hero banner — IPTV eerst als beschikbaar */}
                {featured && (
                  <View style={styles.heroFrame}>
                    <RealHeroBanner item={featured} onPlay={() => goToDetail(featured)} onInfo={() => goToDetail(featured)} />
                  </View>
                )}

                {/* IPTV Playlist sectie */}
                {iptvMovies.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionRow}>
                      <Text style={styles.sectionTitle}>Jouw Playlist</Text>
                      <View style={styles.iptvBadge}>
                        <MaterialCommunityIcons name="play-network" size={11} color={COLORS.accent} />
                        <Text style={styles.iptvBadgeText}>IPTV</Text>
                      </View>
                    </View>
                    {iptvGroups.length > 2 && (
                      <FlatList
                        horizontal data={iptvGroups} keyExtractor={g => g}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={[styles.chip, groupFilter === item && styles.chipActive]}
                            onPress={() => setGroupFilter(item)}>
                            <Text style={[styles.chipText, groupFilter === item && styles.chipTextActive]}>{item}</Text>
                          </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false} />
                    )}
                    <FlatList
                      horizontal data={filteredIptv} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {publicVodMapped.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionRow}>
                      <Text style={styles.sectionTitle}>Open M3U Aanvulling</Text>
                      <View style={styles.iptvBadge}>
                        <MaterialCommunityIcons name="earth" size={11} color={COLORS.accent} />
                        <Text style={styles.iptvBadgeText}>PUBLIC</Text>
                      </View>
                    </View>
                    <FlatList
                      horizontal data={publicVodMapped} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {trending.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Trending deze week</Text>
                    <FlatList horizontal data={trending} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {newReleases.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Nieuw toegevoegd</Text>
                    <FlatList horizontal data={newReleases} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {topRated.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Best beoordeeld</Text>
                    <FlatList horizontal data={topRated} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {popular.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Populair nu</Text>
                    <FlatList horizontal data={popular} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {upcoming.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Binnenkort</Text>
                    <FlatList horizontal data={upcoming} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => (
                        <RealContentCard item={item} onPress={() => goToDetail(item)} onFavorite={() => toggleFavorite(item.id)} isFavorite={isFavorite(item.id)} />
                      )}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {isLoading && (
                  <View style={{ padding: 40, alignItems: "center" }}>
                    <ActivityIndicator color={COLORS.accent} />
                    <Text style={{ color: COLORS.textMuted, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 12 }}>
                      Films laden...
                    </Text>
                  </View>
                )}
                {isError && !iptvMovies.length && (
                  <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
                    <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
                    <Text style={{ fontFamily: "Inter_500Medium", color: COLORS.textMuted, textAlign: "center" }}>
                      {normalizedCatalogError?.userMessage || "Kan films niet laden."}
                    </Text>
                  </View>
                )}
              </>
            )}
            <View style={{ height: bottomPad }} />
          </>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.overlayLight, borderRadius: 14, marginHorizontal: 16, marginTop: 10, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, height: 40, paddingHorizontal: 10, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },
  heroFrame: {
    marginHorizontal: 12,
    borderWidth: 2,
    borderColor: "rgba(174,205,248,0.55)",
    borderRadius: 28,
    paddingTop: 10,
    backgroundColor: "rgba(11,35,89,0.25)",
    marginBottom: 14,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginBottom: 14 },
  chipRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row" },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.accent },
  iptvBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.accentGlow, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.accent },
  iptvBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
  loadingBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  watchdogBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.accent + "55",
  },
  watchdogText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent, flex: 1 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.liveGlow,
    borderWidth: 1,
    borderColor: COLORS.live,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  errorCodeText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  section: { marginBottom: 28 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 14, paddingHorizontal: 20 },
  carouselPadding: { paddingHorizontal: 20, paddingRight: 8 },
  sourceLabel: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },
  sourceLabelText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.accent },
});
