import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import WebView from "react-native-webview";

import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useNexora } from "@/context/NexoraContext";
import { streamLog } from "@/lib/stream-logger";
import { buildTrailerCandidates } from "@/features/media/services/trailerService";
import { RealContentCard } from "@/components/RealContentCard";
import { useTranslation } from "@/lib/useTranslation";

function toMediaType(value: string | undefined): "movie" | "series" {
  return value === "series" ? "series" : "movie";
}

function toYear(value: unknown): string {
  const raw = String(value || "").trim();
  return raw.slice(0, 4);
}

function parseNumericTmdbId(id: string): string {
  const value = String(id || "").trim();
  if (/^tmdb_[ms]_\d+$/i.test(value)) {
    const parts = value.split("_");
    return parts[2] || "";
  }
  return /^\d+$/.test(value) ? value : "";
}

function toPoster(raw: any) {
  return raw?.poster || raw?.posterUri || raw?.poster_path || null;
}

function toBackdrop(raw: any) {
  return (
    raw?.backdrop ||
    raw?.backdropUri ||
    raw?.backdrop_path ||
    raw?.poster ||
    null
  );
}

function computeRatings(detail: any) {
  const imdb = Number(detail?.imdbRating || 0);
  const rt = Number(
    detail?.rottenTomatoesRating ||
      String(detail?.rottenTomatoes || "").replace(/[^0-9.]/g, "") ||
      0,
  );
  const mc = Number(detail?.metacriticScore || detail?.metacritic || 0);
  const tmdb = Number(
    detail?.tmdbRating || detail?.rating || detail?.imdb || 0,
  );

  const entries = [
    {
      key: "imdb",
      score: imdb > 0 ? imdb * 10 : 0,
      badge: "IMDb",
      badgeBg: "#f5c518",
      badgeText: "#121212",
    },
    {
      key: "rt",
      score: rt > 0 ? rt : 0,
      badge: "RT",
      badgeBg: "#f93208",
      badgeText: "#ffffff",
    },
    {
      key: "mc",
      score: mc > 0 ? mc : 0,
      badge: "MC",
      badgeBg: "#00ce7a",
      badgeText: "#0f172a",
    },
    {
      key: "tmdb",
      score: tmdb > 0 ? tmdb * 10 : 0,
      badge: "TMDB",
      badgeBg: "#01d277",
      badgeText: "#0b1f2a",
    },
  ].filter((entry) => entry.score > 0);

  if (!entries.length) {
    return {
      entries,
      weighted: null,
      consensus: "Not enough ratings yet",
    };
  }

  const weighted =
    entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length;
  const rounded = Math.round(weighted);
  let consensus = "Mixed reception";
  if (rounded >= 85) consensus = "Universal acclaim";
  else if (rounded >= 75) consensus = "Very positive";
  else if (rounded >= 65) consensus = "Mostly positive";
  else if (rounded < 50) consensus = "Needs improvement";

  return { entries, weighted: rounded, consensus };
}

function toTrailerKey(raw: any): string {
  // 1. Direct key from server
  const direct = String(raw?.trailerKey || raw?.youtubeKey || "").trim();
  if (direct && /^[A-Za-z0-9_-]{6,}$/.test(direct)) return direct;

  // 2. trailerCandidates array (objects with .key from server, or URLs)
  if (
    Array.isArray(raw?.trailerCandidates) &&
    raw.trailerCandidates.length > 0
  ) {
    for (const candidate of raw.trailerCandidates) {
      const key = String(candidate?.key || candidate?.id || "").trim();
      if (key && /^[A-Za-z0-9_-]{6,}$/.test(key)) return key;
      // Try extracting from URL-like values
      const fromUrl = buildTrailerCandidates(
        candidate?.key || candidate?.url || candidate?.trailerUrl || "",
      );
      if (fromUrl.length > 0) return fromUrl[0];
    }
  }

  // 3. Videos array (raw TMDB-style video list)
  if (Array.isArray(raw?.videos)) {
    const trailers = raw.videos
      .filter(
        (video: any) => String(video?.site || "").toLowerCase() === "youtube",
      )
      .filter((video: any) => /trailer|teaser/i.test(String(video?.type || "")))
      .map((video: any) => String(video?.key || "").trim())
      .filter((k: string) => k && /^[A-Za-z0-9_-]{6,}$/.test(k));
    if (trailers.length > 0) return trailers[0];
  }

  // 4. Fallback: embedUrl or trailerUrl
  const fromUrl = buildTrailerCandidates(
    raw?.trailerUrl || raw?.embedUrl || "",
  );
  return fromUrl[0] || "";
}

async function fetchMediaDetail(
  id: string,
  type: "movie" | "series",
  title?: string,
) {
  const safeId = encodeURIComponent(id);
  const safeTitle = title ? `?title=${encodeURIComponent(title)}` : "";
  const route =
    type === "movie"
      ? `/api/movies/${safeId}/full${safeTitle}`
      : `/api/series/${safeId}/full${safeTitle}`;
  const res = await apiRequest("GET", route);
  return res.json();
}

async function fetchRecommendations(id: string, type: "movie" | "series") {
  const route = `/api/recommendations/similar/${encodeURIComponent(id)}?type=${type}`;
  const res = await apiRequest("GET", route);
  if (!res.ok) return { items: [] };
  return res.json();
}

async function fetchSeasonEpisodes(id: string, season: number) {
  const route = `/api/series/${encodeURIComponent(id)}/season/${Math.max(1, season)}`;
  const res = await apiRequest("GET", route);
  return res.json();
}

async function fetchTrailerKey(
  tmdbId: string,
  type: "movie" | "series",
): Promise<string> {
  try {
    const route = `/api/trailer/${encodeURIComponent(tmdbId)}?type=${type}`;
    const res = await apiRequest("GET", route);
    const data = await res.json();
    return String(data?.key || "").trim();
  } catch {
    return "";
  }
}

export default function MediaDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    type?: string;
    title?: string;
    poster?: string;
    backdrop?: string;
    year?: string;
    overview?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const id = String(params.id || "").trim();
  const numericRouteTmdbId = parseNumericTmdbId(id);
  const type = toMediaType(params.type);

  const { toggleFavorite, isFavorite } = useNexora();
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const faved = isFavorite(id, type);

  const detailQuery = useQuery({
    queryKey: ["media-detail-v2", type, id],
    queryFn: () =>
      fetchMediaDetail(numericRouteTmdbId || id, type, params.title),
    enabled: Boolean(id),
    staleTime: 10 * 60_000,
  });

  const recommendationsQuery = useQuery({
    queryKey: ["media-detail-v2", "rec", type, id],
    queryFn: () => fetchRecommendations(numericRouteTmdbId || id, type),
    enabled: Boolean(id),
    staleTime: 20 * 60_000,
  });

  const resolvedTmdbId = useMemo(() => {
    const fromDetail = parseNumericTmdbId(String((detailQuery.data as any)?.tmdbId || ""));
    return fromDetail || numericRouteTmdbId || "";
  }, [detailQuery.data, numericRouteTmdbId]);

  const seasons = useMemo(() => {
    const fromDetail = Array.isArray(detailQuery.data?.seasons)
      ? detailQuery.data.seasons
      : [];
    if (fromDetail.length > 0) return fromDetail;
    const total = Number(
      detailQuery.data?.totalSeasons || detailQuery.data?.seasons || 0,
    );
    if (!Number.isFinite(total) || total <= 0) return [];
    return Array.from({ length: total }, (_, idx) => ({
      seasonNumber: idx + 1,
      episodeCount: null,
    }));
  }, [detailQuery.data?.seasons, detailQuery.data?.totalSeasons]);

  const seasonEpisodesQuery = useQuery({
    queryKey: [
      "media-detail-v2",
      "season",
      resolvedTmdbId || id,
      selectedSeason,
    ],
    queryFn: () => fetchSeasonEpisodes(resolvedTmdbId || id, selectedSeason),
    enabled:
      type === "series" && Boolean(resolvedTmdbId || id) && selectedSeason > 0,
    staleTime: 15 * 60_000,
  });

  useEffect(() => {
    if (!seasons.length) return;
    const normalized = seasons
      .map((season: any) =>
        Number(season?.seasonNumber || season?.season_number || season?.season || 0),
      )
      .filter((num: number) => Number.isFinite(num) && num > 0)
      .sort((left: number, right: number) => left - right);
    if (!normalized.length) return;
    if (!normalized.includes(selectedSeason)) {
      setSelectedSeason(normalized[0]);
    }
  }, [seasons, selectedSeason]);

  const detail = detailQuery.data || null;
  const title = String(
    detail?.title || detail?.name || params.title || "Untitled",
  );
  const overview = String(
    detail?.overview || detail?.synopsis || params.overview || "",
  );
  const poster = toPoster(detail) || params.poster || null;
  const backdrop = toBackdrop(detail) || params.backdrop || poster;
  const year = toYear(
    detail?.releaseDate || detail?.firstAirDate || detail?.year || params.year,
  );
  const genres = Array.isArray(detail?.genre)
    ? detail.genre
    : Array.isArray(detail?.genres)
      ? detail.genres.map((g: any) => String(g?.name || "")).filter(Boolean)
      : [];

  const cast = useMemo(() => {
    const rows = Array.isArray(detail?.cast) ? detail.cast : [];
    return rows.slice(0, 24).map((person: any) => ({
      id: String(person?.id || person?.credit_id || Math.random()),
      name: String(person?.name || "Unknown"),
      role: String(person?.character || ""),
      photo: person?.profile_path || person?.photo || person?.profile || null,
    }));
  }, [detail?.cast]);

  const crew = useMemo(() => {
    const rows = Array.isArray(detail?.crew) ? detail.crew : [];
    return rows
      .filter((person: any) =>
        /director|writer|creator|producer/i.test(
          String(person?.job || person?.department || ""),
        ),
      )
      .slice(0, 16)
      .map((person: any) => ({
        id: String(person?.id || person?.credit_id || Math.random()),
        name: String(person?.name || "Unknown"),
        role: String(person?.job || person?.department || "Crew"),
      }));
  }, [detail?.crew]);

  const trailerKeyFromDetail = useMemo(() => toTrailerKey(detail), [detail]);

  // Fallback: fetch trailer separately if detail didn't include one
  const trailerFallbackQuery = useQuery({
    queryKey: ["media-detail-v2", "trailer", type, id],
    queryFn: () => fetchTrailerKey(resolvedTmdbId || id, type),
    enabled: Boolean(id) && Boolean(detail) && !trailerKeyFromDetail,
    staleTime: 60 * 60_000,
  });

  const trailerKey =
    trailerKeyFromDetail || String(trailerFallbackQuery.data || "").trim();
  const trailerUrl = trailerKey
    ? `https://www.youtube.com/embed/${encodeURIComponent(trailerKey)}?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1`
    : "";
  const hasTrailer = Boolean(trailerKey);
  const trailerLoading =
    !trailerKeyFromDetail && trailerFallbackQuery.isLoading;

  const handlePlayEpisode = useCallback(
    (seasonNum: number, episodeNum: number) => {
      const finalTmdbId = resolvedTmdbId || parseNumericTmdbId(String(params.id || ""));
      streamLog("info", "series", "Episode play clicked", {
        source: "media-detail",
        contentId: id,
        tmdbId: finalTmdbId,
        season: seasonNum,
        episode: episodeNum,
      });
      router.push({
        pathname: "/player",
        params: {
          id,
          type: "series",
          title,
          contentId: id,
          ...(poster ? { poster: String(poster) } : {}),
          ...(finalTmdbId ? { tmdbId: finalTmdbId } : {}),
          season: String(seasonNum),
          episode: String(episodeNum),
          autoFullscreen: "1",
        },
      });
    },
    [resolvedTmdbId, id, title, poster, params.id],
  );

  const collection = detail?.collection || null;
  const studios = Array.isArray(detail?.productionCompanies)
    ? detail.productionCompanies
    : [];
  const recommendations = Array.isArray(recommendationsQuery.data?.items)
    ? recommendationsQuery.data.items
    : [];
  const sortedEpisodes = useMemo(
    () => {
      const episodes = Array.isArray(seasonEpisodesQuery.data?.episodes)
        ? seasonEpisodesQuery.data.episodes
        : Array.isArray(seasonEpisodesQuery.data)
          ? seasonEpisodesQuery.data
          : [];
      return [...episodes].sort(
        (left: any, right: any) =>
          Number(left?.episodeNumber || left?.episode_number || left?.number || 0) -
          Number(right?.episodeNumber || right?.episode_number || right?.number || 0),
      );
    },
    [seasonEpisodesQuery.data],
  );
  const ratings = useMemo(() => computeRatings(detail), [detail]);

  const handlePlay = () => {
    const finalTmdbId = resolvedTmdbId || parseNumericTmdbId(String(params.id || ""));
    const firstEpisode = sortedEpisodes[0];
    const startSeason = type === "series" ? selectedSeason || 1 : 1;
    const startEpisode =
      type === "series"
        ? Number(
            firstEpisode?.episodeNumber ||
              firstEpisode?.episode_number ||
              firstEpisode?.number ||
              1,
          ) || 1
        : 1;
    streamLog("info", type === "series" ? "series" : "movie", "Content play clicked", {
      source: "media-detail",
      contentId: id,
      tmdbId: finalTmdbId,
      type,
      season: type === "series" ? startSeason : undefined,
      episode: type === "series" ? startEpisode : undefined,
    });
    router.push({
      pathname: "/player",
      params: {
        id,
        type,
        title,
        contentId: id,
        ...(poster ? { poster: String(poster) } : {}),
        ...(finalTmdbId ? { tmdbId: finalTmdbId } : {}),
        ...(type === "series"
          ? {
              season: String(startSeason),
              episode: String(startEpisode),
            }
          : {}),
        autoFullscreen: "1",
      },
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={detailQuery.isRefetching}
            onRefresh={() => detailQuery.refetch()}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 68 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          {backdrop ? (
            <ExpoImage
              source={{ uri: backdrop }}
              style={styles.heroImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
          <View style={styles.heroOverlay} />

          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8, left: 58 }]}
            onPress={() => router.replace("/(tabs)/home")}
          >
            <Ionicons name="home-outline" size={16} color="#fff" />
          </TouchableOpacity>

          <View style={[styles.topRightActions, { top: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.topRightBtn}
              onPress={() => toggleFavorite(id, type)}
            >
              <Ionicons
                name={faved ? "heart" : "heart-outline"}
                size={18}
                color={faved ? COLORS.accent : "#fff"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topRightBtn}
              onPress={() => setInfoOpen(true)}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.heroMeta}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.metaLine}>
              {year || t("detail.unknownYear")}
              {detail?.rottenTomatoesRating || detail?.rottenTomatoes
                ? ` · ${Math.round(Number(detail?.rottenTomatoesRating || String(detail?.rottenTomatoes || "").replace(/[^0-9.]/g, "") || 0))}%🍅`
                : ""}
              {detail?.imdbRating
                ? ` · ${Number(detail.imdbRating).toFixed(1)} IMDb`
                : ""}
              {detail?.tmdbRating || detail?.rating || detail?.imdb
                ? ` · ${Number(detail?.tmdbRating || detail?.rating || detail?.imdb).toFixed(1)} TMDB`
                : ""}
              {detail?.metacriticScore || detail?.metacritic
                ? ` · ${Math.round(Number(detail?.metacriticScore || detail?.metacritic))} MC`
                : ""}
              {genres.length ? ` · ${genres.slice(0, 3).join(" • ")}` : ""}
            </Text>
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.playBtn} onPress={handlePlay}>
                <Ionicons name="play" size={16} color={COLORS.background} />
                <Text style={styles.playBtnText}>{t("detail.play")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.trailerBtn,
                  !hasTrailer && !trailerLoading && styles.trailerBtnDisabled,
                ]}
                onPress={() => {
                  if (!hasTrailer) return;
                  setTrailerOpen(true);
                }}
                disabled={!hasTrailer && !trailerLoading}
              >
                {trailerLoading ? (
                  <ActivityIndicator size={14} color={COLORS.background} />
                ) : (
                  <Ionicons
                    name="film-outline"
                    size={16}
                    color={hasTrailer ? COLORS.background : COLORS.textMuted}
                  />
                )}
                <Text
                  style={[
                    styles.trailerBtnText,
                    !hasTrailer &&
                      !trailerLoading &&
                      styles.trailerBtnTextDisabled,
                  ]}
                >
                  {trailerLoading
                    ? t("detail.loading")
                    : hasTrailer
                      ? t("detail.trailer")
                      : t("detail.noTrailer")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {ratings.entries.length > 0 && (
            <Section title="Ratings breakdown">
              <View style={styles.ratingPanel}>
                <View style={styles.ratingPanelHeader}>
                  <Text style={styles.ratingConsensus}>
                    {ratings.consensus}
                  </Text>
                  {ratings.weighted != null ? (
                    <Text style={styles.ratingScore}>
                      {ratings.weighted}/100
                    </Text>
                  ) : null}
                </View>
                <View style={styles.ratingTrack}>
                  <View
                    style={[
                      styles.ratingTrackFill,
                      {
                        width:
                          `${Math.max(0, Math.min(100, ratings.weighted || 0))}%` as any,
                      },
                    ]}
                  />
                </View>
                <View style={styles.ratingChipsRow}>
                  {ratings.entries.map((entry) => (
                    <View key={entry.key} style={styles.ratingChip}>
                      <View
                        style={[
                          styles.ratingBadge,
                          { backgroundColor: entry.badgeBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.ratingBadgeText,
                            { color: entry.badgeText },
                          ]}
                        >
                          {entry.badge}
                        </Text>
                      </View>
                      <Text style={styles.ratingChipValue}>
                        {Math.round(entry.score)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Section>
          )}

          {!!overview && (
            <Section title={t("detail.overview")}>
              <Text style={styles.body}>{overview}</Text>
            </Section>
          )}

          {hasTrailer && (
            <Section title="Trailer">
              <TouchableOpacity
                style={styles.trailerCard}
                onPress={() => setTrailerOpen(true)}
                activeOpacity={0.85}
              >
                <ExpoImage
                  source={{
                    uri: `https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg`,
                  }}
                  style={styles.trailerThumb}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.trailerThumbOverlay}>
                  <View style={styles.trailerPlayCircle}>
                    <Ionicons name="play" size={30} color="#fff" />
                  </View>
                  <Text style={styles.trailerThumbLabel}>{title}</Text>
                </View>
              </TouchableOpacity>
            </Section>
          )}

          {cast.length > 0 && (
            <Section title={t("detail.cast")}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castRow}
              >
                {cast.map(
                  (person: {
                    id: string;
                    name: string;
                    role: string;
                    photo: string | null;
                  }) => (
                    <View key={person.id} style={styles.castCard}>
                      {person.photo ? (
                        <ExpoImage
                          source={{ uri: person.photo }}
                          style={styles.castPhoto}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View
                          style={[styles.castPhoto, styles.castPlaceholder]}
                        >
                          <Ionicons
                            name="person"
                            size={18}
                            color={COLORS.textMuted}
                          />
                        </View>
                      )}
                      <Text style={styles.castName} numberOfLines={1}>
                        {person.name}
                      </Text>
                      <Text style={styles.castRole} numberOfLines={1}>
                        {person.role || "Cast"}
                      </Text>
                    </View>
                  ),
                )}
              </ScrollView>
            </Section>
          )}

          {crew.length > 0 && (
            <Section title={t("detail.crew")}>
              <View style={styles.crewGrid}>
                {crew.map(
                  (person: { id: string; name: string; role: string }) => (
                    <View key={person.id} style={styles.crewCard}>
                      <Text style={styles.crewName} numberOfLines={1}>
                        {person.name}
                      </Text>
                      <Text style={styles.crewRole} numberOfLines={1}>
                        {person.role}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </Section>
          )}

          {collection?.name ? (
            <Section title={t("detail.collectionContext")}>
              <TouchableOpacity
                style={styles.collectionCard}
                onPress={() =>
                  router.push({
                    pathname: "/media/collection",
                    params: {
                      id: String(collection?.id || ""),
                      name: String(collection?.name || "Collection"),
                    },
                  })
                }
              >
                {collection.poster || collection.backdrop ? (
                  <ExpoImage
                    source={{ uri: collection.poster || collection.backdrop }}
                    style={styles.collectionPoster}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      styles.collectionPoster,
                      {
                        backgroundColor: COLORS.cardElevated,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Ionicons
                      name="film-outline"
                      size={28}
                      color={COLORS.textMuted}
                    />
                  </View>
                )}
                <View style={styles.collectionRight}>
                  <Text style={styles.collectionTitle}>
                    {String(collection?.name || "Collection")}
                  </Text>
                  <Text style={styles.collectionMeta}>
                    {t("detail.openFranchise")}
                  </Text>
                </View>
              </TouchableOpacity>
            </Section>
          ) : null}

          {studios.length > 0 && (
            <Section title={t("detail.studios")}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.studioRow}
              >
                {studios.slice(0, 12).map((studio: any) => (
                  <TouchableOpacity
                    key={String(studio?.id || studio?.name)}
                    style={styles.studioCard}
                    onPress={() =>
                      router.push({
                        pathname: "/media/studio",
                        params: {
                          id: String(studio?.id || ""),
                          name: String(studio?.name || "Studio"),
                        },
                      })
                    }
                  >
                    <View style={styles.studioLogoWrap}>
                      {studio?.logo ? (
                        <ExpoImage
                          source={{ uri: studio.logo }}
                          style={styles.studioLogo}
                          contentFit="contain"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <Text style={styles.studioLogoFallback}>
                          {String(studio?.name || "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.studioName} numberOfLines={2}>
                      {String(studio?.name || "Studio")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Section>
          )}

          {type === "series" && seasons.length > 0 && (
            <Section title={t("detail.seasonsAndEpisodes")}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {seasons.map((season: any) => {
                  const seasonNumber =
                    Number(
                      season?.seasonNumber ||
                        season?.season_number ||
                        season?.season ||
                        0,
                    ) || 1;
                  const active = selectedSeason === seasonNumber;
                  return (
                    <TouchableOpacity
                      key={String(seasonNumber)}
                      style={[
                        styles.seasonChip,
                        active && styles.seasonChipActive,
                      ]}
                      onPress={() => {
                        streamLog("info", "series", "Season selected", {
                          source: "media-detail",
                          contentId: id,
                          season: seasonNumber,
                        });
                        setSelectedSeason(seasonNumber);
                      }}
                    >
                      <Text
                        style={[
                          styles.seasonChipText,
                          active && styles.seasonChipTextActive,
                        ]}
                      >
                        Season {seasonNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {seasonEpisodesQuery.isLoading ? (
                <ActivityIndicator color={COLORS.accent} />
              ) : (
                <View style={styles.episodesList}>
                  {sortedEpisodes.slice(0, 40).map((episode: any) => {
                    const episodeNumber =
                      Number(
                        episode?.episodeNumber ||
                          episode?.episode_number ||
                          episode?.number ||
                          0,
                      ) || 0;
                    const episodeImage =
                      String(episode?.image || episode?.still || episode?.still_path || "").trim() || null;
                    const episodeDuration =
                      episode?.duration ||
                      (Number(episode?.durationMinutes || episode?.runtime || 0) > 0
                        ? `${Number(episode?.durationMinutes || episode?.runtime)} min`
                        : "Duur onbekend");
                    return (
                    <TouchableOpacity
                      key={String(
                        episode?.id ||
                          `${selectedSeason}-${episode?.episodeNumber || episode?.episode_number || Math.random()}`,
                      )}
                      style={styles.episodeCard}
                      onPress={() =>
                        handlePlayEpisode(
                          selectedSeason,
                          episodeNumber || 1,
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <View style={styles.episodeRow}>
                        {episodeImage ? (
                          <ExpoImage
                            source={{ uri: episodeImage }}
                            style={styles.episodeThumb}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={styles.episodeThumbFallback}>
                            <Ionicons name="image-outline" size={16} color={COLORS.textMuted} />
                          </View>
                        )}
                        <View style={styles.episodeInfo}>
                          <Text style={styles.episodeTitle} numberOfLines={1}>
                            E{episodeNumber || "?"} ·{" "}
                            {String(
                              episode?.title || episode?.name || "Episode",
                            )}
                          </Text>
                          <Text style={styles.episodeDuration} numberOfLines={1}>
                            {episodeDuration}
                          </Text>
                          <Text style={styles.episodeMeta} numberOfLines={2}>
                            {String(episode?.overview || "") ||
                              t("detail.noSynopsis")}
                          </Text>
                        </View>
                        <Ionicons
                          name="play-circle"
                          size={28}
                          color={COLORS.accent}
                        />
                      </View>
                    </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </Section>
          )}

          {recommendations.length > 0 && (
            <Section title={t("detail.recommendations")}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recRow}
              >
                {recommendations
                  .slice(0, 16)
                  .map((item: any, index: number) => {
                    const mediaType =
                      String(
                        item?.type ||
                          item?.mediaType ||
                          item?.media_type ||
                          "movie",
                      ) === "series"
                        ? "series"
                        : "movie";
                    const mediaId = String(item?.tmdbId || item?.id || "");
                    if (!mediaId) return null;
                    return (
                      <RealContentCard
                        key={`${mediaType}-${mediaId}-${index}`}
                        width={130}
                        item={
                          {
                            id: mediaId,
                            title: String(
                              item?.title || item?.name || "Untitled",
                            ),
                            poster: toPoster(item),
                            backdrop: toBackdrop(item),
                            year:
                              Number(item?.year || item?.releaseDate || 0) || 0,
                            imdb: Number(item?.imdb || item?.rating || 0) || 0,
                            quality: item?.quality || "HD",
                          } as any
                        }
                        onPress={() =>
                          router.push({
                            pathname: "/media/detail",
                            params: {
                              id: mediaId,
                              type: mediaType,
                              title: String(
                                item?.title || item?.name || "Untitled",
                              ),
                              ...(toPoster(item)
                                ? { poster: toPoster(item) }
                                : {}),
                              ...(toBackdrop(item)
                                ? { backdrop: toBackdrop(item) }
                                : {}),
                              ...(item?.tmdbId
                                ? { tmdbId: String(item.tmdbId) }
                                : {}),
                            },
                          })
                        }
                      />
                    );
                  })}
              </ScrollView>
            </Section>
          )}

          {!detail && detailQuery.isLoading && (
            <ActivityIndicator color={COLORS.accent} size="large" />
          )}
          {!detail && !detailQuery.isLoading && (
            <Text style={styles.emptyText}>
              No media details found for this item.
            </Text>
          )}
        </View>
      </ScrollView>

      <InfoModal
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        detail={detail}
        title={title}
        year={year}
        genres={genres}
        overview={overview}
        cast={cast}
        crew={crew}
        type={type}
        insets={insets}
      />

      <Modal
        visible={trailerOpen}
        animationType="slide"
        onRequestClose={() => setTrailerOpen(false)}
      >
        <View style={styles.trailerModal}>
          <View style={[styles.trailerHeader, { paddingTop: insets.top + 6 }]}>
            <Text style={styles.trailerHeaderTitle}>Trailer</Text>
            <TouchableOpacity
              onPress={() => setTrailerOpen(false)}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          {trailerUrl ? (
            <WebView
              source={{ uri: trailerUrl }}
              style={styles.trailerWebView}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
            />
          ) : (
            <View style={styles.trailerFallback}>
              <Text style={styles.emptyText}>Trailer unavailable.</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function InfoModal({
  visible,
  onClose,
  detail,
  title,
  year,
  genres,
  overview,
  cast,
  crew,
  type,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  detail: any;
  title: string;
  year: string;
  genres: string[];
  overview: string;
  cast: { id: string; name: string; role: string; photo: string | null }[];
  crew: { id: string; name: string; role: string }[];
  type: "movie" | "series";
  insets: { top: number; bottom: number };
}) {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: unknown) => {
    const v = String(value || "").trim();
    if (v && v !== "null" && v !== "undefined" && v !== "0")
      rows.push({ label, value: v });
  };

  add("Title", title);
  add(
    "Original Title",
    detail?.originalTitle !== title ? detail?.originalTitle : "",
  );
  add("Tagline", detail?.tagline);
  add("Year", year);
  add("Release Date", detail?.releaseDate);
  add("Status", detail?.status);
  add("Type", type === "series" ? "Series" : "Movie");
  add(
    "Votes",
    detail?.voteCount ? Number(detail.voteCount).toLocaleString() : "",
  );
  add(
    "Popularity",
    detail?.popularity ? Number(detail.popularity).toFixed(0) : "",
  );
  add("Genres", genres.join(", "));
  add("Duration", detail?.duration);
  add("Language", detail?.originalLanguage);
  add(
    "Spoken Languages",
    Array.isArray(detail?.spokenLanguages)
      ? detail.spokenLanguages.join(", ")
      : "",
  );
  add(
    "Countries",
    Array.isArray(detail?.countries) ? detail.countries.join(", ") : "",
  );
  add(
    "Studios",
    Array.isArray(detail?.studios) ? detail.studios.join(", ") : "",
  );
  add(
    "Directors",
    Array.isArray(detail?.directors) ? detail.directors.join(", ") : "",
  );
  add(
    "Writers",
    Array.isArray(detail?.writers) ? detail.writers.join(", ") : "",
  );
  add(
    "Creators",
    Array.isArray(detail?.creators) ? detail.creators.join(", ") : "",
  );
  add(
    "Networks",
    Array.isArray(detail?.networks) ? detail.networks.join(", ") : "",
  );
  add(
    "Keywords",
    Array.isArray(detail?.keywords)
      ? detail.keywords.slice(0, 15).join(", ")
      : "",
  );
  if (type === "movie") {
    add(
      "Budget",
      detail?.budget ? `$${Number(detail.budget).toLocaleString()}` : "",
    );
    add(
      "Revenue",
      detail?.revenue ? `$${Number(detail.revenue).toLocaleString()}` : "",
    );
    add("Box Office", detail?.boxOffice);
  }
  if (type === "series") {
    add("Seasons", detail?.totalSeasons);
    add("Episodes", detail?.totalEpisodes);
  }
  add(
    "IMDB Rating",
    detail?.imdbRating ? `${Number(detail.imdbRating).toFixed(1)} / 10` : "",
  );
  add(
    "IMDB Votes",
    detail?.imdbVotes ? Number(detail.imdbVotes).toLocaleString() : "",
  );
  add(
    "Rotten Tomatoes",
    detail?.rottenTomatoesRating ? `${detail.rottenTomatoesRating}%` : "",
  );
  add(
    "Metacritic",
    detail?.metacriticScore ? `${detail.metacriticScore}%` : "",
  );
  add("Rated", detail?.rated);
  add("Awards", detail?.awards);
  add("Collection", detail?.collection?.name);

  if (overview) rows.push({ label: "Overview", value: overview });

  if (cast.length > 0) {
    rows.push({
      label: "Cast",
      value: cast
        .slice(0, 12)
        .map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`)
        .join(", "),
    });
  }
  if (crew.length > 0) {
    rows.push({
      label: "Crew",
      value: crew.map((p) => `${p.name} — ${p.role}`).join(", "),
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={infoStyles.overlay}>
        <View
          style={[
            infoStyles.sheet,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={infoStyles.header}>
            <Text style={infoStyles.headerTitle}>Info</Text>
            <TouchableOpacity onPress={onClose} style={infoStyles.closeBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: row }) => (
              <View style={infoStyles.row}>
                <Text style={infoStyles.label}>{row.label}</Text>
                <Text style={infoStyles.value}>{row.value}</Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={infoStyles.sep} />}
          />
        </View>
      </View>
    </Modal>
  );
}

const infoStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: Dimensions.get("window").height * 0.85,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  row: { paddingVertical: 8 },
  label: {
    color: COLORS.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 2,
  },
  value: {
    color: COLORS.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  sep: { height: 1, backgroundColor: COLORS.glassBorder },
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  heroWrap: { height: 420, backgroundColor: COLORS.card },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  backBtn: {
    position: "absolute",
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  topRightActions: {
    position: "absolute",
    right: 14,
    flexDirection: "row",
    gap: 8,
  },
  topRightBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroMeta: { position: "absolute", left: 16, right: 16, bottom: 20, gap: 8 },
  title: {
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
    fontSize: 30,
    lineHeight: 34,
  },
  metaLine: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  playBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  playBtnText: {
    color: COLORS.background,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  trailerBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  trailerBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  trailerBtnText: {
    color: COLORS.background,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  trailerBtnTextDisabled: { color: COLORS.textMuted },

  content: { paddingHorizontal: 16, paddingTop: 14, gap: 20 },
  section: { gap: 10 },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  body: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    fontSize: 14,
  },

  castRow: { gap: 10, paddingRight: 12 },
  castCard: { width: 96, gap: 4 },
  castPhoto: {
    width: 96,
    height: 124,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  castPlaceholder: { alignItems: "center", justifyContent: "center" },
  castName: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  castRole: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },

  crewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  crewCard: {
    width: "48%" as any,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 4,
  },
  crewName: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  crewRole: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },

  collectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    overflow: "hidden",
    height: 110,
  },
  collectionPoster: { width: 75, height: 110 },
  collectionRight: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
    gap: 4,
  },
  collectionTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  collectionMeta: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },

  studioRow: { gap: 10, paddingRight: 12 },
  studioCard: {
    width: 130,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 12,
    minHeight: 80,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  studioLogoWrap: {
    width: 100,
    height: 42,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  studioLogo: {
    width: 88,
    height: 34,
  },
  studioLogoFallback: {
    color: "#333",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 1,
  },
  studioName: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textAlign: "center",
  },

  filterRow: { gap: 8 },
  seasonChip: {
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  seasonChipActive: {
    backgroundColor: COLORS.accentGlow,
    borderColor: COLORS.accentGlowStrong,
  },
  seasonChipText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  seasonChipTextActive: { color: COLORS.text },

  episodesList: { gap: 8 },
  episodeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 4,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  episodeThumb: {
    width: 84,
    height: 54,
    borderRadius: 8,
    backgroundColor: COLORS.cardElevated,
  },
  episodeThumbFallback: {
    width: 84,
    height: 54,
    borderRadius: 8,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeInfo: {
    flex: 1,
    gap: 4,
  },
  episodeTitle: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  episodeDuration: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  episodeMeta: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },

  recRow: { gap: 10, paddingRight: 12 },

  ratingPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 10,
  },
  ratingPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ratingConsensus: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  ratingScore: {
    color: COLORS.accent,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
  },
  ratingTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  ratingTrackFill: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: 999,
  },
  ratingChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  ratingChipValue: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },

  trailerModal: { flex: 1, backgroundColor: "#000" },
  trailerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.14)",
  },
  trailerHeaderTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  trailerWebView: { flex: 1, backgroundColor: "#000" },
  trailerFallback: { flex: 1, alignItems: "center", justifyContent: "center" },

  trailerCard: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  trailerThumb: { width: "100%", aspectRatio: 16 / 9 },
  trailerThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.32)",
    gap: 10,
  },
  trailerPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,9,20,0.88)",
    paddingLeft: 4,
  },
  trailerThumbLabel: {
    color: "rgba(255,255,255,0.86)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
  },

  emptyText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
});
