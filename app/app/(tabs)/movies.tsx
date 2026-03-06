import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Platform, RefreshControl,
  TouchableOpacity, TextInput, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest } from "@/lib/query-client";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import { SafeHaptics } from "@/lib/safeHaptics";

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
      trending: [], newReleases: [], topRated: [], popular: [], upcoming: [],
      error: String(error?.message || "Movies request failed"),
    };
  }
}

async function fetchMovieGenres(page = 1) {
  try {
    const res = await withTimeout(apiRequest("GET", `/api/movies/genres-catalog?page=${page}`), 20000);
    return await res.json();
  } catch {
    return { genres: [] };
  }
}

async function fetchMovieDecades() {
  try {
    const res = await withTimeout(apiRequest("GET", "/api/movies/decades"), 15000);
    return await res.json();
  } catch {
    return { decades: [] };
  }
}

export default function MoviesScreen() {
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, iptvChannels, isChannelVisible, isLoadingPlaylist } = useNexora();
  const [groupFilter, setGroupFilter] = useState("Alles");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingGuardReached, setLoadingGuardReached] = useState(false);

  // Per-genre extra pages state: genreId -> { page, items[], loading }
  const [genreExtras, setGenreExtras] = useState<Record<number, { page: number; items: any[]; loading: boolean }>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["movies", "trending"],
    queryFn: fetchMovies,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const { data: genresData, refetch: refetchGenres } = useQuery({
    queryKey: ["movies", "genres"],
    queryFn: () => fetchMovieGenres(1),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });

  const { data: decadesData } = useQuery({
    queryKey: ["movies", "decades"],
    queryFn: fetchMovieDecades,
    staleTime: 30 * 60 * 1000,
    retry: 0,
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

  const trending = useMemo(() => data?.trending || [], [data]);
  const newReleases = useMemo(() => data?.newReleases || [], [data]);
  const topRated = useMemo(() => data?.topRated || [], [data]);
  const popular = useMemo(() => data?.popular || [], [data]);
  const upcoming = useMemo(() => data?.upcoming || [], [data]);
  const movieGenres: any[] = useMemo(() => genresData?.genres || [], [genresData]);
  const movieDecades: any[] = useMemo(() => decadesData?.decades || [], [decadesData]);

  const featured = iptvMovies.length > 0
    ? filteredIptv[0]
    : (trending[0] || newReleases[0]);

  const rawCatalogError =
    (data as any)?.error ||
    (isError ? "Movie catalogus niet beschikbaar" : "");
  const normalizedCatalogError = rawCatalogError ? normalizeApiError(rawCatalogError) : null;
  const catalogErrorRef = useMemo(() => (rawCatalogError ? buildErrorReference("NX-MOV") : ""), [rawCatalogError]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const isTabLoading = isLoading || isLoadingPlaylist;

  useEffect(() => {
    if (!isTabLoading) { setLoadingGuardReached(false); return; }
    const timer = setTimeout(() => setLoadingGuardReached(true), 12_000);
    return () => clearTimeout(timer);
  }, [isTabLoading]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goToDetail = (item: any) => {
    if (item.isIptv) {
      router.push({
        pathname: "/detail",
        params: {
          id: item.id, type: "movie", title: item.title,
          isIptv: "true", streamUrl: item.streamUrl,
          ...(item.tmdbId ? { tmdbId: String(item.tmdbId) } : {}),
        },
      });
    } else {
      router.push({ pathname: "/detail", params: { id: item.id, type: "movie", title: item.title } });
    }
  };

  const goToPlayer = (item: any) => {
    SafeHaptics.impactLight();
    const tmdbId = item.tmdbId ? String(item.tmdbId) : (!item.isIptv ? item.id : null);
    if (item.isIptv && item.streamUrl) {
      router.push({
        pathname: "/player",
        params: {
          streamUrl: item.streamUrl, title: item.title,
          type: "movie", contentId: item.id,
          ...(tmdbId ? { tmdbId } : {}),
          season: "1", episode: "1",
        },
      });
    } else if (tmdbId) {
      router.push({
        pathname: "/player",
        params: {
          tmdbId, title: item.title,
          type: "movie", contentId: item.id,
          season: "1", episode: "1",
        },
      });
    } else {
      goToDetail(item);
    }
  };

  // ── Load more per genre ───────────────────────────────────────────────────
  const loadMoreGenre = useCallback(async (genreId: number) => {
    const current = genreExtras[genreId] || { page: 1, items: [], loading: false };
    if (current.loading) return;
    const nextPage = current.page + 1;
    setGenreExtras(prev => ({ ...prev, [genreId]: { ...current, loading: true } }));
    try {
      const data = await fetchMovieGenres(nextPage);
      const genre = (data.genres || []).find((g: any) => g.id === genreId);
      const newItems = genre?.items || [];
      setGenreExtras(prev => ({
        ...prev,
        [genreId]: {
          page: nextPage,
          items: [...(prev[genreId]?.items || []), ...newItems],
          loading: false,
        },
      }));
    } catch {
      setGenreExtras(prev => ({ ...prev, [genreId]: { ...current, loading: false } }));
    }
  }, [genreExtras]);

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

  const renderCard = (item: any) => (
    <RealContentCard
      item={item}
      onPress={() => goToDetail(item)}
      onFavorite={() => toggleFavorite(item.id)}
      isFavorite={isFavorite(item.id)}
    />
  );

  const renderGenreRow = (genre: any) => {
    const extra = genreExtras[genre.id];
    const allItems = extra ? [...genre.items, ...extra.items] : genre.items;
    return (
      <View key={String(genre.id)} style={styles.section}>
        <Text style={styles.sectionTitle}>{genre.name}</Text>
        <FlatList
          horizontal
          data={allItems}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => renderCard(item)}
          contentContainerStyle={styles.carouselPadding}
          showsHorizontalScrollIndicator={false}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => loadMoreGenre(genre.id)}
              disabled={extra?.loading}
            >
              {extra?.loading
                ? <ActivityIndicator size="small" color={COLORS.accent} />
                : <>
                    <Ionicons name="chevron-forward-circle-outline" size={18} color={COLORS.accent} />
                    <Text style={styles.loadMoreText}>Meer</Text>
                  </>
              }
            </TouchableOpacity>
          }
        />
      </View>
    );
  };

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
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            setGenreExtras({});
            await Promise.all([refetch(), refetchGenres()]);
            setRefreshing(false);
          }} tintColor={COLORS.accent} />
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
                  <FlatList horizontal data={filteredIptv} keyExtractor={(item: any) => item.id}
                    renderItem={({ item }: any) => renderCard(item)}
                    contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                )}
                {(filteredTmdb ?? []).length > 0 && (
                  <FlatList horizontal data={filteredTmdb ?? []} keyExtractor={(item: any) => item.id}
                    renderItem={({ item }: any) => renderCard(item)}
                    contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                )}
                {filteredIptv.length === 0 && (filteredTmdb ?? []).length === 0 && (
                  <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
                    <Ionicons name="film-outline" size={40} color={COLORS.textMuted} />
                    <Text style={{ fontFamily: "Inter_400Regular", color: COLORS.textMuted }}>Geen films gevonden voor &quot;{search}&quot;</Text>
                  </View>
                )}
              </View>
            ) : (
              <>
                {/* Hero banner */}
                {featured && (
                  <View style={styles.heroFrame}>
                    <RealHeroBanner
                      item={featured}
                      onPlay={() => goToPlayer(featured)}
                      onInfo={() => goToDetail(featured)}
                    />
                  </View>
                )}

                {/* IPTV Playlist */}
                {iptvMovies.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Jouw Playlist</Text>
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
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {trending.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Trending deze week</Text>
                    <FlatList horizontal data={trending} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {newReleases.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Nieuw in bioscoop</Text>
                    <FlatList horizontal data={newReleases} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {topRated.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Best beoordeeld</Text>
                    <FlatList horizontal data={topRated} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {popular.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Populair nu</Text>
                    <FlatList horizontal data={popular} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {upcoming.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Binnenkort</Text>
                    <FlatList horizontal data={upcoming} keyExtractor={(item: any) => item.id}
                      renderItem={({ item }: any) => renderCard(item)}
                      contentContainerStyle={styles.carouselPadding} showsHorizontalScrollIndicator={false} />
                  </View>
                )}

                {/* Genre rows — 15 genres, each with load-more */}
                {movieGenres.map((genre: any) => genre.items?.length > 0 && renderGenreRow(genre))}

                {/* Decade rows */}
                {movieDecades.map((decade: any) => (
                  decade.items?.length > 0 && (
                    <View key={decade.decade} style={styles.section}>
                      <Text style={styles.sectionTitle}>Beste van de {decade.name}</Text>
                      <FlatList
                        horizontal
                        data={decade.items}
                        keyExtractor={(item: any) => `${decade.decade}-${item.id}`}
                        renderItem={({ item }: any) => renderCard(item)}
                        contentContainerStyle={styles.carouselPadding}
                        showsHorizontalScrollIndicator={false}
                      />
                    </View>
                  )
                ))}

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
  chipRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row" },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.accent },
  loadingBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  watchdogBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent + "55",
  },
  watchdogText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent, flex: 1 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.liveGlow, borderWidth: 1, borderColor: COLORS.live,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  errorCodeText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  section: { marginBottom: 28 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 14, paddingHorizontal: 20 },
  carouselPadding: { paddingHorizontal: 20, paddingRight: 8 },
  loadMoreBtn: {
    width: 64, alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: COLORS.cardElevated, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    marginLeft: 6, marginRight: 20, height: 203,
  },
  loadMoreText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
});
