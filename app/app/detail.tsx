import React, { useMemo, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Modal, Platform, Alert, ActivityIndicator, Linking,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { useTranslation } from "@/lib/useTranslation";

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

function DownloadModal({
  visible, onClose, title, contentId, type: contentType, streamUrl, poster, year,
}: {
  visible: boolean; onClose: () => void; title: string;
  contentId: string; type: string; streamUrl?: string | null;
  poster?: string | null; year?: number | null;
}) {
  const { addDownload, isDownloaded, removeDownload, getDownload } = useNexora();
  const { t } = useTranslation();
  const [step, setStep] = useState<"select" | "downloading" | "done" | "error">("select");
  const [quality, setQuality] = useState("FHD");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  const alreadyDownloaded = isDownloaded(contentId);
  const existingDl = getDownload(contentId);

  // Determine if we have a direct downloadable URL (not HLS/m3u8)
  const canDownload = streamUrl &&
    !streamUrl.includes(".m3u8") &&
    !streamUrl.includes("m3u") &&
    (streamUrl.startsWith("http://") || streamUrl.startsWith("https://"));

  const resetState = () => {
    setStep("select");
    setProgress(0);
    setErrorMsg("");
    downloadRef.current = null;
  };

  const startDownload = async () => {
    if (!canDownload || !streamUrl) {
      setErrorMsg(t("detail.directDownloadNote"));
      setStep("error");
      return;
    }
    setStep("downloading");
    setProgress(0);
    try {
      const dir = FileSystem.documentDirectory + "nexora_downloads/";
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const ext = streamUrl.split("?")[0].split(".").pop()?.split("/").pop() || "mp4";
      const filename = `nx_${contentId.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.${ext}`;
      const fileUri = dir + filename;

      const dl = FileSystem.createDownloadResumable(
        streamUrl,
        fileUri,
        {},
        (p) => {
          const pct = p.totalBytesExpectedToWrite > 0
            ? p.totalBytesWritten / p.totalBytesExpectedToWrite
            : 0;
          setProgress(Math.min(pct, 0.99));
        }
      );
      downloadRef.current = dl;
      const result = await dl.downloadAsync();
      if (result?.uri) {
        setProgress(1);
        const info = await FileSystem.getInfoAsync(result.uri);
        await addDownload({
          id: `dl_${Date.now()}`,
          contentId,
          title,
          type: contentType as any,
          poster: poster || null,
          filePath: result.uri,
          fileSize: (info as any).size ?? undefined,
          downloadedAt: new Date().toISOString(),
          year: year ?? null,
          quality,
        });
        setStep("done");
      } else {
        throw new Error(t("detail.downloadFailed"));
      }
    } catch (e: any) {
      setErrorMsg(e?.message || t("detail.downloadFailed"));
      setStep("error");
    }
  };

  const handleCancel = async () => {
    try { await downloadRef.current?.cancelAsync(); } catch {}
    resetState();
    onClose();
  };

  const handleRemove = () => {
    if (existingDl) {
      Alert.alert("Remove download", "Do you want to remove this download?", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: async () => {
          await removeDownload(existingDl.id);
          resetState();
          onClose();
        }},
      ]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.downloadModal}>
          <View style={styles.downloadHandle} />
          <Text style={styles.downloadTitle}>
            {alreadyDownloaded ? t("detail.downloaded") : t("detail.downloadOffline")}
          </Text>
          <Text style={styles.downloadSubtitle} numberOfLines={2}>{title}</Text>

          {alreadyDownloaded && step === "select" ? (
            <View style={styles.doneContainer}>
              <View style={styles.doneIcon}><Ionicons name="checkmark-circle" size={36} color={COLORS.accent} /></View>
              <Text style={styles.doneText}>{t("detail.alreadySaved")}</Text>
              <Text style={styles.doneNote}>{t("detail.availableOffline")}</Text>
              <TouchableOpacity style={[styles.downloadBtn, { backgroundColor: COLORS.liveGlow, marginTop: 8 }]} onPress={handleRemove}>
                <Ionicons name="trash-outline" size={16} color={COLORS.live} />
                <Text style={[styles.downloadBtnText, { color: COLORS.live }]}>{t("detail.removeDownload")}</Text>
              </TouchableOpacity>
            </View>
          ) : step === "select" ? (
            <>
              {!canDownload && (
                <View style={styles.noDownloadNote}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.accent} />
                  <Text style={styles.noDownloadText}>
                    {streamUrl?.includes(".m3u8")
                      ? t("detail.hlsExclusion")
                      : t("detail.noStreamUrlNote")}
                  </Text>
                </View>
              )}
              {canDownload && (
                <>
                  <Text style={styles.downloadLabel}>{t("detail.qualityLabel")}</Text>
                  <View style={styles.qualityOptions}>
                    {["HD", "FHD"].map((q) => (
                      <TouchableOpacity
                        key={q}
                        style={[styles.qualityOption, quality === q && styles.qualityOptionActive]}
                        onPress={() => setQuality(q)}
                      >
                        <Text style={[styles.qualityOptionText, quality === q && styles.qualityOptionTextActive]}>{q}</Text>
                        <Text style={styles.qualitySize}>{q === "FHD" ? "~2+ GB" : "~900 MB"}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={styles.downloadBtn} onPress={startDownload}>
                    <Ionicons name="download-outline" size={18} color={COLORS.background} />
                    <Text style={styles.downloadBtnText}>{t("detail.startDownload")}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : step === "downloading" ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator color={COLORS.accent} size="small" />
              <Text style={styles.downloadingText}>{t("detail.downloadProgress", { progress: Math.round(progress * 100) })}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
              </View>
              <Text style={styles.progressNote}>{t("detail.keepAppOpen")}</Text>
            </View>
          ) : step === "done" ? (
            <View style={styles.doneContainer}>
              <View style={styles.doneIcon}><Ionicons name="checkmark" size={32} color={COLORS.accent} /></View>
              <Text style={styles.doneText}>{t("detail.savedOnDevice")}</Text>
              <Text style={styles.doneNote}>{t("detail.availableOffline")}</Text>
            </View>
          ) : (
            <View style={styles.doneContainer}>
              <Ionicons name="warning-outline" size={32} color={COLORS.live} />
              <Text style={[styles.doneText, { color: COLORS.live }]}>{t("detail.downloadFailed")}</Text>
              <Text style={styles.doneNote}>{errorMsg}</Text>
              <TouchableOpacity style={[styles.downloadBtn, { marginTop: 8 }]} onPress={resetState}>
                <Text style={styles.downloadBtnText}>{t("detail.retry")}</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.closeBtnSmall} onPress={step === "downloading" ? handleCancel : () => { resetState(); onClose(); }}>
            <Text style={styles.closeBtnText}>{step === "downloading" ? t("detail.cancel") : t("detail.close")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function DetailScreen() {
  const {
    id, type, title: paramTitle,
    streamUrl, isIptv, tmdbId: paramTmdbId,
    poster: routePoster, backdrop: routeBackdrop,
    year: routeYear, overview: routeOverview,
  } = useLocalSearchParams<{
    id: string; type: string; title: string;
    streamUrl?: string; isIptv?: string; tmdbId?: string;
    poster?: string; backdrop?: string; year?: string; overview?: string;
  }>();

  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isFavorite, toggleFavorite, iptvChannels, isDownloaded, hasPremium } = useNexora();
  const { t } = useTranslation();

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
    : (paramTmdbId ? String(paramTmdbId) : (isIptv !== "true" ? id : null));

  const routeSeedData = useMemo(() => {
    if (!paramTitle && !routePoster && !routeBackdrop && !routeOverview) return null;
    return {
      id: tmdbId || id,
      tmdbId: tmdbId || id,
      title: paramTitle,
      synopsis: routeOverview || "",
      poster: routePoster || null,
      backdrop: routeBackdrop || null,
      year: routeYear ? Number(routeYear) : null,
      imdb: null,
      quality: null,
      genre: [],
      cast: [],
      trailerKey: null,
      seasons: null,
    };
  }, [id, paramTitle, routeBackdrop, routeOverview, routePoster, routeYear, tmdbId]);

  const cachedDetail = tmdbId
    ? queryClient.getQueryData(["detail", type, tmdbId]) as any
    : null;

  const { data: tmdbData, isLoading: tmdbLoading, error: tmdbError, refetch } = useQuery({
    queryKey: ["detail", type, tmdbId],
    queryFn: () => fetchDetails(tmdbId!, type),
    enabled: !!tmdbId,
    staleTime: 10 * 60 * 1000,
    initialData: cachedDetail || routeSeedData || undefined,
    retry: 1,
  });

  // ── Fallback: search TMDB by title if IPTV has no tmdbId ─────────────────
  const searchTitle = iptvChannel?.title || iptvChannel?.name || paramTitle;
  const { data: searchData, isLoading: searchLoading, error: searchError } = useQuery({
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
  const rawDetailError =
    (tmdbData as any)?.error ||
    (searchData as any)?.error ||
    (tmdbError as any)?.message ||
    (searchError as any)?.message ||
    t("detail.detailMissing");
  const normalizedDetailError = normalizeApiError(rawDetailError);
  const detailErrorRef = useMemo(() => buildErrorReference("NX-DTL"), []);
  const isMovie = type === "movie";
  const fav = isFavorite(id);

  const goToPlayer = (season = 1, episode = 1) => {
    SafeHaptics.impactLight();
    // Filter out "undefined" string and non-http values that Expo Router passes for absent params
    const validStreamUrl =
      streamUrl && streamUrl !== "undefined" && streamUrl.startsWith("http")
        ? streamUrl
        : null;
    const validIptvUrl =
      iptvChannel?.url && iptvChannel.url.startsWith("http")
        ? iptvChannel.url
        : null;
    const usableStream = validStreamUrl || validIptvUrl;
    const resolvedTmdbId = String(data?.tmdbId || tmdbId || "");

    // IPTV: use direct stream URL if available
    if (isIptv === "true" && usableStream) {
      router.push({
        pathname: "/player",
        params: {
          streamUrl: usableStream,
          title: data?.title || paramTitle,
          type: type || "movie",
          contentId: id,
          poster: data?.poster || iptvChannel?.poster || "",
          ...(resolvedTmdbId ? { tmdbId: resolvedTmdbId } : {}),
          season: String(season),
          episode: String(episode),
        },
      });
    } else {
      // Public VOD or IPTV without stream URL: use TMDB embed providers
      router.push({
        pathname: "/player",
        params: {
          ...(resolvedTmdbId ? { tmdbId: resolvedTmdbId } : {}),
          ...(usableStream ? { streamUrl: usableStream } : {}),
          title: data?.title || paramTitle,
          type: type || "movie",
          contentId: id,
          poster: data?.poster || "",
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
        <Text style={styles.loadingText}>{t("detail.loadingDetails")}</Text>
        <TouchableOpacity style={styles.backBtnLoading} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textMuted} />
          <Text style={styles.backBtnLoadingText}>{t("detail.back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.live} />
        <Text style={[styles.loadingText, { marginTop: 16, color: COLORS.text }]}>
          {normalizedDetailError.userMessage}
        </Text>
        <Text style={styles.errorRefText}>{t("detail.errorCode", { code: detailErrorRef })}</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            style={[styles.backBtnLoading, { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }]}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh-outline" size={16} color={COLORS.background} />
            <Text style={[styles.backBtnLoadingText, { color: COLORS.background }]}>{t("detail.refresh")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtnLoading} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={16} color={COLORS.textMuted} />
            <Text style={styles.backBtnLoadingText}>{t("detail.back")}</Text>
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
          ) : data.poster ? (
            <Image source={{ uri: data.poster }} style={styles.backdrop} resizeMode="cover" />
          ) : (
            <View style={[styles.backdrop, { backgroundColor: COLORS.card }]} />
          )}
          {/* Top vignette */}
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent"]}
            style={styles.heroTopGradient}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.85)", COLORS.background]}
            style={styles.heroGradient}
            locations={[0, 0.4, 0.7, 1]}
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
          {isIptv === "true" && (
            <View style={styles.iptvBadge}>
              <MaterialCommunityIcons name="play-network" size={11} color={COLORS.accent} />
              <Text style={styles.iptvBadgeText}>IPTV</Text>
            </View>
          )}
          {/* Title overlay on hero */}
          <View style={styles.heroTitleOverlay}>
            <Text style={styles.heroContentTitle} numberOfLines={2}>{data.title}</Text>
            {data.tagline ? <Text style={styles.heroTagline} numberOfLines={1}>{data.tagline}</Text> : null}
            <View style={styles.heroMetaRow}>
              {data.year ? <Text style={styles.heroMetaText}>{data.year}</Text> : null}
              {data.imdb ? (
                <View style={styles.heroRatingPill}>
                  <MaterialCommunityIcons name="star" size={12} color="#F5C518" />
                  <Text style={styles.heroRatingText}>{data.imdb}</Text>
                </View>
              ) : null}
              {data.duration ? <Text style={styles.heroMetaText}>{data.duration}</Text> : null}
              {!isMovie && data.seasons?.length ? <Text style={styles.heroMetaText}>{data.seasons.length > 1 ? t("detail.seasonCountPlural", { count: data.seasons.length }) : t("detail.seasonCount", { count: data.seasons.length })}</Text> : null}
              <View style={styles.qualityBadge}>
                <Text style={styles.qualityText}>{data.quality || "HD"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          {/* Genre pills */}
          <View style={styles.genreRow}>
            {(data.genre || []).slice(0, 4).map((g: string) => (
              <View key={g} style={styles.genrePill}>
                <Text style={styles.genrePillText}>{g}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actionButtons}>
            {hasPremium(isMovie ? "movies" : "series") ? (
              <TouchableOpacity style={styles.playBtn} onPress={() => goToPlayer()} activeOpacity={0.85}>
                <View style={styles.playBtnInner}>
                  <Ionicons name="play" size={22} color="#FFFFFF" />
                  <Text style={styles.playBtnText}>{t("detail.play")}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.playBtn} onPress={() => router.push("/premium")} activeOpacity={0.85}>
                <View style={styles.lockedBtnInner}>
                  <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                  <Text style={styles.playBtnText}>{t("detail.unlockPremium")}</Text>
                </View>
              </TouchableOpacity>
            )}
            {data.trailerKey ? (
              <TouchableOpacity
                style={styles.trailerBtnOutline}
                onPress={() => {
                  SafeHaptics.impactLight();
                  Linking.openURL(`https://www.youtube.com/watch?v=${encodeURIComponent(data.trailerKey)}`);
                }}
              >
                <Ionicons name="videocam-outline" size={20} color={COLORS.accent} />
                <Text style={styles.trailerBtnOutlineText}>{t("detail.trailer")}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.downloadBtnOutline, isDownloaded(id) && { borderColor: "#22c55e" }]}
              onPress={() => { SafeHaptics.impactLight(); setShowDownload(true); }}
            >
              <Ionicons name={isDownloaded(id) ? "checkmark-circle" : "download-outline"} size={20} color={isDownloaded(id) ? "#22c55e" : COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareBtnOutline}
              onPress={() => { SafeHaptics.impactLight(); }}
            >
              <Ionicons name="share-outline" size={20} color={COLORS.text} />
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
                  {tab === "overview" ? t("detail.overview") : tab === "cast" ? t("detail.cast") : t("detail.seasons")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "overview" && (
            <View style={styles.tabContent}>
              <Text style={styles.synopsis}>{data.synopsis || t("detail.noDescription")}</Text>
              {!isMovie && data.networks?.length > 0 && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>{t("detail.network")}</Text>
                  <Text style={styles.networkValue}>{data.networks.join(", ")}</Text>
                </View>
              )}
              {!isMovie && data.creators?.length > 0 && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>{t("detail.createdBy")}</Text>
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
                <Text style={styles.synopsis}>{t("detail.noCast")}</Text>
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
                    onPress={() => hasPremium("series") ? goToPlayer(season.seasonNumber || idx + 1, 1) : router.push("/premium")}
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
                      <Text style={styles.seasonEpisodes}>{season.episodes} {t("detail.episodes")}</Text>
                      {season.airDate && <Text style={styles.seasonDate}>{new Date(season.airDate).getFullYear()}</Text>}
                    </View>
                    <Ionicons name={hasPremium("series") ? "play-circle-outline" : "lock-closed"} size={hasPremium("series") ? 28 : 20} color={hasPremium("series") ? COLORS.accent : COLORS.textMuted} />
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity style={styles.seasonRow} onPress={() => hasPremium("series") ? goToPlayer(1, 1) : router.push("/premium")}>
                  <View style={[styles.seasonPoster, { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name={hasPremium("series") ? "play" : "lock-closed"} size={20} color={hasPremium("series") ? COLORS.accent : COLORS.textMuted} />
                  </View>
                  <View style={styles.seasonInfo}>
                    <Text style={styles.seasonName}>{t("detail.season")} 1</Text>
                    <Text style={styles.seasonEpisodes}>{hasPremium("series") ? t("detail.play") : t("detail.premiumRequired")}</Text>
                  </View>
                  <Ionicons name={hasPremium("series") ? "play-circle-outline" : "lock-closed"} size={hasPremium("series") ? 28 : 20} color={hasPremium("series") ? COLORS.accent : COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 20 }} />
      </ScrollView>

      <DownloadModal
        visible={showDownload}
        onClose={() => setShowDownload(false)}
        title={data.title}
        contentId={id}
        type={type || "movie"}
        streamUrl={
          (streamUrl && streamUrl !== "undefined" && streamUrl.startsWith("http") ? streamUrl : null) ||
          (iptvChannel?.url?.startsWith("http") ? iptvChannel.url : null)
        }
        poster={data.poster}
        year={data.year ? Number(data.year) : null}
      />
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
  errorRefText: { color: COLORS.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 6 },
  hero: { height: 380, position: "relative" },
  backdrop: { width: "100%", height: "100%" },
  heroTopGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 100 },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroTitleOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 4 },
  heroContentTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 28, color: COLORS.text, lineHeight: 32, marginBottom: 4 },
  heroTagline: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", fontStyle: "italic", marginBottom: 8 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  heroMetaText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textSecondary },
  heroRatingPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  heroRatingText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#F5C518" },
  backBtn: { position: "absolute", left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  favBtn: { position: "absolute", right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  iptvBadge: { position: "absolute", bottom: 16, left: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,212,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.accent },
  iptvBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
  infoSection: { paddingHorizontal: 16, paddingTop: 12 },
  genreRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  genrePill: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)" },
  genrePillText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textSecondary },
  actionButtons: { flexDirection: "row", gap: 10, marginBottom: 20, alignItems: "center" },
  playBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  playBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, backgroundColor: COLORS.accent, borderRadius: 12 },
  lockedBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, backgroundColor: "rgba(229,9,20,0.35)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(229,9,20,0.5)" },
  playBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
  downloadBtnOutline: { width: 48, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  shareBtnOutline: { width: 48, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  trailerBtnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.accent + "44", backgroundColor: COLORS.accent + "12" },
  trailerBtnOutlineText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent },
  qualityBadge: { backgroundColor: "rgba(255,45,85,0.15)", borderWidth: 1, borderColor: COLORS.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  qualityText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.accent, letterSpacing: 0.5 },
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
  seasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  seasonPoster: { width: 70, height: 100, borderRadius: 8, backgroundColor: COLORS.card },
  seasonInfo: { flex: 1, gap: 3 },
  seasonName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  seasonEpisodes: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  seasonDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
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
  noDownloadNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.accentGlow, borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent, padding: 12, width: "100%" },
  noDownloadText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 18 },
});
