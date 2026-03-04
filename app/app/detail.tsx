import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Modal, Platform, Animated,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import WebView from "react-native-webview";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";

// ── TMDB fetch ───────────────────────────────────────────────────────────────
async function fetchDetails(id: string, type: string) {
  const path = type === "movie" ? `/api/movies/${id}/full` : `/api/series/${id}/full`;
  const res = await apiRequest("GET", path);
  return res.json();
}

// ── TMDB search by title (for IPTV items without a tmdbId) ───────────────────
async function searchTmdb(title: string, type: string) {
  const q = encodeURIComponent(title);
  const endpoint = type === "series" ? "tv" : "movie";
  const res = await apiRequest("GET", `/api/tmdb/search?query=${q}&type=${endpoint}`);
  if (!res.ok) return null;
  return res.json();
}

function CastCard({ person }: { person: any }) {
  return (
    <View style={styles.castCard}>
      {person.photo ? (
        <Image source={{ uri: person.photo }} style={styles.castPhoto} />
      ) : (
        <View style={[styles.castPhoto, styles.castPhotoPlaceholder]}>
          <Ionicons name="person" size={20} color={COLORS.textMuted} />
        </View>
      )}
      <Text style={styles.castName} numberOfLines={1}>{person.name}</Text>
      <Text style={styles.castCharacter} numberOfLines={1}>{person.character}</Text>
    </View>
  );
}

function DownloadModal({ visible, onClose, title }: { visible: boolean; onClose: () => void; title: string }) {
  const [progress] = useState(new Animated.Value(0));
  const [step, setStep] = useState<"select" | "downloading" | "done">("select");
  const [quality, setQuality] = useState("FHD");

  const startDownload = () => {
    setStep("downloading");
    Animated.timing(progress, { toValue: 1, duration: 4000, useNativeDriver: false }).start(() => {
      setStep("done");
    });
  };

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.downloadModal}>
          <View style={styles.downloadHandle} />
          <Text style={styles.downloadTitle}>Download for Offline</Text>
          <Text style={styles.downloadSubtitle} numberOfLines={2}>{title}</Text>
          {step === "select" && (
            <>
              <Text style={styles.downloadLabel}>Select Quality</Text>
              <View style={styles.qualityOptions}>
                {["HD", "FHD", "4K"].map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.qualityOption, quality === q && styles.qualityOptionActive]}
                    onPress={() => setQuality(q)}
                  >
                    <Text style={[styles.qualityOptionText, quality === q && styles.qualityOptionTextActive]}>{q}</Text>
                    <Text style={styles.qualitySize}>{q === "4K" ? "~4.2 GB" : q === "FHD" ? "~2.1 GB" : "~900 MB"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.downloadBtn} onPress={startDownload}>
                <Ionicons name="download-outline" size={18} color={COLORS.background} />
                <Text style={styles.downloadBtnText}>Start Download</Text>
              </TouchableOpacity>
            </>
          )}
          {step === "downloading" && (
            <View style={styles.progressContainer}>
              <Text style={styles.downloadingText}>Downloading {quality}...</Text>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
              </View>
              <Text style={styles.progressNote}>Keep the app open to continue downloading</Text>
            </View>
          )}
          {step === "done" && (
            <View style={styles.doneContainer}>
              <View style={styles.doneIcon}><Ionicons name="checkmark" size={32} color={COLORS.accent} /></View>
              <Text style={styles.doneText}>Downloaded Successfully</Text>
              <Text style={styles.doneNote}>Available in My Downloads</Text>
            </View>
          )}
          <TouchableOpacity style={styles.closeBtnSmall} onPress={onClose}>
            <Text style={styles.closeBtnText}>{step === "done" ? "Done" : "Cancel"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function DetailScreen() {
  const {
    id, type, title: paramTitle,
    streamUrl, isIptv,
  } = useLocalSearchParams<{
    id: string; type: string; title: string;
    streamUrl?: string; isIptv?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, iptvChannels } = useNexora();

  const [showTrailer, setShowTrailer] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "cast" | "seasons">("overview");

  // ── For IPTV items: get channel data from context first ───────────────────
  const iptvChannel = isIptv === "true"
    ? iptvChannels.find(c => c.id === id)
    : null;

  // ── Determine what TMDB id to use ─────────────────────────────────────────
  // If the channel already has a tmdbId, use it directly.
  // Otherwise, search by title.
  const tmdbId = iptvChannel?.tmdbId
    ? String(iptvChannel.tmdbId)
    : (isIptv !== "true" ? id : null);

  const { data: tmdbData, isLoading: tmdbLoading, refetch } = useQuery({
    queryKey: ["detail", type, tmdbId],
    queryFn: () => fetchDetails(tmdbId!, type),
    enabled: !!tmdbId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // ── Fallback: search TMDB by title if IPTV has no tmdbId ─────────────────
  const searchTitle = iptvChannel?.title || iptvChannel?.name || paramTitle;
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["tmdb-search", type, searchTitle],
    queryFn: () => searchTmdb(searchTitle!, type),
    enabled: isIptv === "true" && !tmdbId && !!searchTitle,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  // ── Merge: IPTV channel info + TMDB enrichment ────────────────────────────
  const data = (() => {
    // If we have full TMDB detail, use it
    if (tmdbData && !tmdbData.error) return tmdbData;
    // If we have search results, use first result merged with IPTV info
    if (searchData?.id) return searchData;
    // Fallback: show basic info from IPTV channel
    if (iptvChannel) {
      return {
        id: iptvChannel.id,
        title: iptvChannel.title || iptvChannel.name,
        synopsis: iptvChannel.synopsis || "",
        poster: iptvChannel.poster || iptvChannel.logo || null,
        backdrop: iptvChannel.backdrop || null,
        year: iptvChannel.year,
        imdb: iptvChannel.rating ? String(iptvChannel.rating) : null,
        quality: "HD",
        genre: [],
        cast: [],
        trailerKey: null,
        seasons: (iptvChannel as any).seasons || null,
      };
    }
    return null;
  })();

  const isLoading = (!data && (tmdbLoading || searchLoading));
  const isMovie = type === "movie";
  const fav = isFavorite(id);

  const goToPlayer = (season = 1, episode = 1) => {
    SafeHaptics.impactLight();
    // IPTV: use direct stream URL
    if (isIptv === "true" && (streamUrl || iptvChannel?.url)) {
      router.push({
        pathname: "/player",
        params: {
          streamUrl: streamUrl || iptvChannel?.url,
          title: data?.title || paramTitle,
          type: type || "movie",
          contentId: id,
          ...(data?.tmdbId ? { tmdbId: String(data.tmdbId) } : {}),
          season: String(season),
          episode: String(episode),
        },
      });
    } else {
      router.push({
        pathname: "/player",
        params: {
          tmdbId: String(data?.tmdbId || tmdbId || ""),
          title: data?.title || paramTitle,
          type: type || "movie",
          contentId: id,
          season: String(season),
          episode: String(episode),
        },
      });
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.loadingSpinner}>
          <Ionicons name="film-outline" size={40} color={COLORS.accent} />
        </View>
        <Text style={styles.loadingText}>Details laden...</Text>
        <TouchableOpacity style={styles.backBtnLoading} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textMuted} />
          <Text style={styles.backBtnLoadingText}>Terug</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.live} />
        <Text style={[styles.loadingText, { marginTop: 16, color: COLORS.text }]}>
          Kan inhoud niet laden
        </Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            style={[styles.backBtnLoading, { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }]}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh-outline" size={16} color={COLORS.background} />
            <Text style={[styles.backBtnLoadingText, { color: COLORS.background }]}>Opnieuw</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtnLoading} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={16} color={COLORS.textMuted} />
            <Text style={styles.backBtnLoadingText}>Terug</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const tabs = isMovie ? ["overview", "cast"] : ["overview", "cast", "seasons"];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.hero}>
          {data.backdrop ? (
            <Image source={{ uri: data.backdrop }} style={styles.backdrop} resizeMode="cover" />
          ) : (
            <View style={[styles.backdrop, { backgroundColor: COLORS.card }]} />
          )}
          <LinearGradient
            colors={["transparent", "rgba(11,15,23,0.7)", COLORS.background]}
            style={styles.heroGradient}
          />
          <TouchableOpacity
            style={[styles.backBtn, { top: Platform.OS === "web" ? 67 : insets.top + 8 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.favBtn, { top: Platform.OS === "web" ? 67 : insets.top + 8 }]}
            onPress={() => { toggleFavorite(id); SafeHaptics.impactLight(); }}
          >
            <Ionicons name={fav ? "heart" : "heart-outline"} size={22} color={fav ? COLORS.live : COLORS.text} />
          </TouchableOpacity>
          {data.trailerKey && (
            <TouchableOpacity style={styles.trailerPlayBtn} onPress={() => setShowTrailer(true)}>
              <View style={styles.trailerPlay}>
                <Ionicons name="play" size={20} color={COLORS.text} />
              </View>
              <Text style={styles.trailerBtnText}>Trailer bekijken</Text>
            </TouchableOpacity>
          )}
          {isIptv === "true" && (
            <View style={styles.iptvBadge}>
              <MaterialCommunityIcons name="play-network" size={11} color={COLORS.accent} />
              <Text style={styles.iptvBadgeText}>IPTV</Text>
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.posterRow}>
            {data.poster ? (
              <Image source={{ uri: data.poster }} style={styles.poster} resizeMode="cover" />
            ) : (
              <View style={[styles.poster, { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="film-outline" size={32} color={COLORS.textMuted} />
              </View>
            )}
            <View style={styles.mainInfo}>
              <Text style={styles.contentTitle}>{data.title}</Text>
              {data.tagline ? <Text style={styles.tagline}>{data.tagline}</Text> : null}
              <View style={styles.metaRow}>
                {data.year ? <Text style={styles.metaText}>{data.year}</Text> : null}
                {data.year && data.imdb ? <View style={styles.metaDot} /> : null}
                {data.imdb ? <Text style={styles.metaText}>{data.imdb}</Text> : null}
                {data.duration ? <><View style={styles.metaDot} /><Text style={styles.metaText}>{data.duration}</Text></> : null}
                {!isMovie && data.seasons ? <><View style={styles.metaDot} /><Text style={styles.metaText}>{data.seasons} Seizoen{data.seasons > 1 ? "en" : ""}</Text></> : null}
              </View>
              {data.imdb ? (
                <View style={styles.imdbRow}>
                  <MaterialCommunityIcons name="star" size={14} color="#F5C518" />
                  <Text style={styles.imdbText}>{data.imdb}</Text>
                  <Text style={styles.imdbMax}>/10</Text>
                  <View style={styles.qualityBadge}>
                    <Text style={styles.qualityText}>{data.quality || "HD"}</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.genreRow}>
                {(data.genre || []).slice(0, 3).map((g: string) => (
                  <View key={g} style={styles.genrePill}>
                    <Text style={styles.genrePillText}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.playBtn} onPress={() => goToPlayer()} activeOpacity={0.85}>
              <LinearGradient
                colors={[COLORS.accent, "#0099BB"]}
                style={styles.playBtnGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Ionicons name="play" size={20} color={COLORS.background} />
                <Text style={styles.playBtnText}>Afspelen</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.downloadBtnOutline}
              onPress={() => { SafeHaptics.impactLight(); setShowDownload(true); }}
            >
              <Ionicons name="download-outline" size={20} color={COLORS.accent} />
              <Text style={styles.downloadBtnOutlineText}>Download</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabBar}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab as any)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === "overview" ? "Overzicht" : tab === "cast" ? "Cast" : "Seizoenen"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "overview" && (
            <View style={styles.tabContent}>
              <Text style={styles.synopsis}>{data.synopsis || "Geen beschrijving beschikbaar."}</Text>
              {!isMovie && data.networks?.length > 0 && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>Netwerk: </Text>
                  <Text style={styles.networkValue}>{data.networks.join(", ")}</Text>
                </View>
              )}
              {!isMovie && data.creators?.length > 0 && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>Gemaakt door: </Text>
                  <Text style={styles.networkValue}>{data.creators.join(", ")}</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === "cast" && (
            <View style={styles.tabContent}>
              {(data.cast || []).length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.castRow}>
                    {(data.cast || []).map((person: any) => (
                      <CastCard key={person.id} person={person} />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.synopsis}>Geen castinformatie beschikbaar.</Text>
              )}
            </View>
          )}

          {activeTab === "seasons" && !isMovie && (
            <View style={styles.tabContent}>
              {(data.seasons || []).length > 0 ? (
                (data.seasons || []).map((season: any, idx: number) => (
                  <TouchableOpacity
                    key={season.id || idx}
                    style={styles.seasonRow}
                    onPress={() => goToPlayer(season.seasonNumber || idx + 1, 1)}
                  >
                    {season.poster ? (
                      <Image source={{ uri: season.poster }} style={styles.seasonPoster} />
                    ) : (
                      <View style={[styles.seasonPoster, { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="film-outline" size={20} color={COLORS.textMuted} />
                      </View>
                    )}
                    <View style={styles.seasonInfo}>
                      <Text style={styles.seasonName}>{season.name}</Text>
                      <Text style={styles.seasonEpisodes}>{season.episodes} Afleveringen</Text>
                      {season.airDate && <Text style={styles.seasonDate}>{new Date(season.airDate).getFullYear()}</Text>}
                    </View>
                    <Ionicons name="play-circle-outline" size={28} color={COLORS.accent} />
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity style={styles.seasonRow} onPress={() => goToPlayer(1, 1)}>
                  <View style={[styles.seasonPoster, { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="play" size={20} color={COLORS.accent} />
                  </View>
                  <View style={styles.seasonInfo}>
                    <Text style={styles.seasonName}>Seizoen 1</Text>
                    <Text style={styles.seasonEpisodes}>Afspelen</Text>
                  </View>
                  <Ionicons name="play-circle-outline" size={28} color={COLORS.accent} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 20 }} />
      </ScrollView>

      <Modal visible={showTrailer} transparent animationType="fade" onRequestClose={() => setShowTrailer(false)}>
        <View style={styles.trailerModal}>
          <TouchableOpacity style={styles.trailerClose} onPress={() => setShowTrailer(false)}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.trailerTitle} numberOfLines={1}>{data.title} — Trailer</Text>
          <View style={styles.trailerContainer}>
            {Platform.OS === "web" ? (
              <iframe
                src={`https://www.youtube.com/embed/${data.trailerKey}?autoplay=1`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : (
              <WebView
                source={{ uri: `https://www.youtube.com/embed/${data.trailerKey}?autoplay=1` }}
                style={{ flex: 1 }}
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
              />
            )}
          </View>
        </View>
      </Modal>

      <DownloadModal visible={showDownload} onClose={() => setShowDownload(false)} title={data.title} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: "center", justifyContent: "center", gap: 8 },
  loadingSpinner: { marginBottom: 8 },
  loadingText: { color: COLORS.textMuted, fontFamily: "Inter_500Medium" },
  backBtnLoading: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  backBtnLoadingText: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 14 },
  hero: { height: 280, position: "relative" },
  backdrop: { width: "100%", height: "100%" },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  backBtn: { position: "absolute", left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  favBtn: { position: "absolute", right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  iptvBadge: { position: "absolute", bottom: 16, left: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,212,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.accent },
  iptvBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
  trailerPlayBtn: { position: "absolute", bottom: 20, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", paddingHorizontal: 20, paddingVertical: 10 },
  trailerPlay: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" },
  trailerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  infoSection: { paddingHorizontal: 16, paddingTop: 4 },
  posterRow: { flexDirection: "row", gap: 14, marginBottom: 20 },
  poster: { width: 100, height: 150, borderRadius: 12, backgroundColor: COLORS.card },
  mainInfo: { flex: 1, justifyContent: "flex-end", paddingBottom: 4 },
  contentTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 4 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontStyle: "italic" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.textMuted },
  imdbRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  imdbText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#F5C518" },
  imdbMax: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  qualityBadge: { backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  qualityText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.accent },
  genreRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  genrePill: { backgroundColor: COLORS.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  genrePillText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textSecondary },
  actionButtons: { flexDirection: "row", gap: 10, marginBottom: 24 },
  playBtn: { flex: 2, borderRadius: 14, overflow: "hidden" },
  playBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  playBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.background },
  downloadBtnOutline: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.accent, paddingVertical: 14 },
  downloadBtnOutlineText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.accent },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  tabContent: { paddingBottom: 8 },
  synopsis: { fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.textSecondary, lineHeight: 24, marginBottom: 16 },
  networkRow: { flexDirection: "row", marginBottom: 8 },
  networkLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted },
  networkValue: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary },
  castRow: { flexDirection: "row", gap: 12, paddingVertical: 4 },
  castCard: { width: 80, alignItems: "center", gap: 6 },
  castPhoto: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.card },
  castPhotoPlaceholder: { alignItems: "center", justifyContent: "center" },
  castName: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.text, textAlign: "center" },
  castCharacter: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted, textAlign: "center" },
  seasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  seasonPoster: { width: 60, height: 90, borderRadius: 8 },
  seasonInfo: { flex: 1 },
  seasonName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 4 },
  seasonEpisodes: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  seasonDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  trailerModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", paddingTop: Platform.OS === "web" ? 67 : 50, alignItems: "center" },
  trailerClose: { position: "absolute", top: Platform.OS === "web" ? 67 : 50, right: 16, padding: 8, zIndex: 10 },
  trailerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text, marginBottom: 12, paddingHorizontal: 48, textAlign: "center" },
  trailerContainer: { width: "100%", aspectRatio: 16 / 9 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  downloadModal: { backgroundColor: COLORS.cardElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: "center", gap: 12 },
  downloadHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 4 },
  downloadTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  downloadSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  downloadLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted, alignSelf: "flex-start", marginTop: 8 },
  qualityOptions: { flexDirection: "row", gap: 10, width: "100%" },
  qualityOption: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, padding: 12, alignItems: "center", gap: 4, backgroundColor: COLORS.card },
  qualityOptionActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  qualityOptionText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.textMuted },
  qualityOptionTextActive: { color: COLORS.accent },
  qualitySize: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 4, width: "100%", justifyContent: "center" },
  downloadBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.background },
  progressContainer: { width: "100%", gap: 10, alignItems: "center" },
  downloadingText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  progressTrack: { width: "100%", height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.accent, borderRadius: 3 },
  progressNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, textAlign: "center" },
  doneContainer: { alignItems: "center", gap: 8 },
  doneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accentGlow, alignItems: "center", justifyContent: "center" },
  doneText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  doneNote: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  closeBtnSmall: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, width: "100%", alignItems: "center" },
  closeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.textSecondary },
});
