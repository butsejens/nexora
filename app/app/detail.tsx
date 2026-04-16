/**
 * Nexora — Detail Screen
 * Premium movie & series detail page with episodes, cast, and add-to-list.
 */
import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { streamLog } from "@/lib/stream-logger";
import {
  useMovieDetail,
  useTvDetail,
  useTmdbCast,
  useTmdbSeasons,
  useTmdbSeasonEpisodes,
  useTmdbRecommendations,
  useTmdbVideos,
} from "@/lib/use-tmdb";
import type { Movie, Series } from "@/types/streaming";
import type { TmdbCastMember, TmdbEpisode } from "@/lib/tmdb";

/** Parse a Nexora-formatted TMDB id like "tmdb_m_550" or "tmdb_s_1668" */
function parseTmdbId(
  id: string,
): { kind: "movie" | "tv"; numericId: number } | null {
  if (id?.startsWith("tmdb_m_"))
    return { kind: "movie", numericId: parseInt(id.slice(7), 10) };
  if (id?.startsWith("tmdb_s_"))
    return { kind: "tv", numericId: parseInt(id.slice(7), 10) };
  return null;
}

function parseNumericTmdbId(id: string): string {
  const parsed = parseTmdbId(String(id || ""));
  if (parsed?.numericId) return String(parsed.numericId);
  const fallback = String(id || "").trim();
  return /^\d+$/.test(fallback) ? fallback : "";
}

function getEpisodeRuntimeLabel(ep: TmdbEpisode): string {
  const runtime = Number(ep?.runtime || 0);
  if (Number.isFinite(runtime) && runtime > 0) return `${runtime} min`;
  return "Duur onbekend";
}

const { width: W, height: H } = Dimensions.get("window");
const BACKDROP_HEIGHT = Math.min(H * 0.62, 460);
const RELATED_CARD_W = 110;
const RELATED_CARD_H = 163;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// TMDB Episode Card (VTM GO-style horizontal card)
// ---------------------------------------------------------------------------
const EP_CARD_W = W > 820 ? 320 : 270;

function TmdbEpisodeCard({
  ep,
  onPress,
  isFree = false,
}: {
  ep: TmdbEpisode;
  onPress: (episode: TmdbEpisode) => void;
  isFree?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.epCard, pressed && { opacity: 0.78 }]}
      onPress={() => onPress(ep)}
    >
      {/* Thumbnail */}
      <View style={styles.epCardThumbWrap}>
        {ep.still_path ? (
          <ExpoImage
            source={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        ) : (
          <View
            style={[StyleSheet.absoluteFillObject, styles.epCardThumbFallback]}
          >
            <Ionicons
              name="play-circle-outline"
              size={30}
              color={COLORS.textFaint}
            />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.epCardNumBadge}>
          <Text style={styles.epCardNumText}>{ep.episode_number}</Text>
        </View>
        {ep.runtime ? (
          <Text style={styles.epCardDurationOverlay}>{ep.runtime} min</Text>
        ) : null}
      </View>
      {/* Info */}
      <View style={styles.epCardBody}>
        <Text style={styles.epCardTitle} numberOfLines={1}>
          {ep.episode_number}. {ep.name}
        </Text>
        <View style={styles.epCardMetaRow}>
          <View style={styles.epCardBadge}>
            <Ionicons
              name={isFree ? "lock-open-outline" : "sparkles"}
              size={11}
              color={isFree ? "#00C864" : COLORS.accent}
            />
            <Text style={[styles.epCardBadgeText, isFree && { color: "#00C864" }]}>
              {isFree ? "Gratis" : "Nexora+"}
            </Text>
          </View>
          <Text style={styles.epCardRuntimeText}>
            {getEpisodeRuntimeLabel(ep)}
          </Text>
        </View>
        <Text style={styles.epCardDesc} numberOfLines={4}>
          {ep.overview || "Geen beschrijving beschikbaar."}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// TMDB Seasons Panel — VTM GO style
// ---------------------------------------------------------------------------
function TmdbSeasonsPanel({
  contentId,
  onEpisodePlay,
}: {
  contentId: string;
  onEpisodePlay: (input: {
    seasonNumber: number;
    episode: TmdbEpisode;
  }) => void;
}) {
  const parsed = contentId?.startsWith("tmdb_s_")
    ? parseInt(contentId.slice(7), 10)
    : null;
  const { data, isLoading: seasonsLoading } = useTmdbSeasons(contentId);
  const [activeSeason, setActiveSeason] = useState(0);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  const seasons = data?.seasons ?? [];
  const activeSeasonNumber = seasons[activeSeason]?.season_number ?? null;
  const activeSeasonLabel =
    seasons[activeSeason]?.name ?? `Seizoen ${activeSeasonNumber ?? 1}`;

  const {
    data: episodesData,
    isLoading: epsLoading,
    isFetching: epsFetching,
    isError: epsError,
  } = useTmdbSeasonEpisodes(parsed, activeSeasonNumber);
  const episodes = episodesData ?? [];
  const firstSeasonNumber = seasons[0]?.season_number ?? null;
  const fallbackFirstSeasonEpisodes =
    activeSeasonNumber === firstSeasonNumber
      ? (data?.firstSeasonEpisodes ?? [])
      : [];
  const episodesToShow =
    episodes.length > 0 ? episodes : fallbackFirstSeasonEpisodes;
  // Show loading when: actively fetching OR query is enabled but hasn't returned data yet
  const showEpsLoading =
    epsLoading ||
    epsFetching ||
    (activeSeasonNumber !== null &&
      parsed !== null &&
      !episodesData &&
      !epsError);

  if (seasonsLoading) {
    return (
      <View style={{ paddingVertical: 20 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
          Laden van afleveringen…
        </Text>
      </View>
    );
  }

  if (!data || seasons.length === 0) {
    return (
      <View style={{ paddingVertical: 12 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
          Geen afleveringen beschikbaar
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.episodesPanel}>
      {/* Season dropdown button */}
      {seasons.length > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.seasonDropdownBtn,
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => setShowSeasonPicker(true)}
        >
          <Text style={styles.seasonDropdownText}>{activeSeasonLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.text} />
        </Pressable>
      )}

      {/* Season picker modal */}
      <Modal
        visible={showSeasonPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeasonPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSeasonPicker(false)}
        >
          <View style={styles.seasonPickerCard}>
            <Text style={styles.seasonPickerTitle}>Kies een seizoen</Text>
            {seasons.map((s, i) => (
              <Pressable
                key={s.season_number}
                style={({ pressed }) => [
                  styles.seasonPickerItem,
                  i === activeSeason && styles.seasonPickerItemActive,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => {
                  streamLog("info", "series", "Season selected", {
                    seriesId: contentId,
                    seasonNumber: s.season_number,
                  });
                  setActiveSeason(i);
                  setShowSeasonPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.seasonPickerItemText,
                    i === activeSeason && { color: COLORS.accent },
                  ]}
                >
                  {s.name ?? `Seizoen ${s.season_number}`}
                </Text>
                {i === activeSeason && (
                  <Ionicons name="checkmark" size={16} color={COLORS.accent} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Episodes horizontal scroll */}
      {showEpsLoading ? (
        <Text
          style={{ color: COLORS.textMuted, fontSize: 13, paddingVertical: 8 }}
        >
          Afleveringen laden…
        </Text>
      ) : episodesToShow.length > 0 ? (
        <FlatList
          data={[...episodesToShow].sort(
            (left, right) =>
              Number(left?.episode_number || 0) -
              Number(right?.episode_number || 0),
          )}
          keyExtractor={(ep) => String(ep.id)}
          renderItem={({ item }) => (
            <TmdbEpisodeCard
              ep={item}
              isFree={activeSeasonNumber === 1 && item.episode_number === 1}
              onPress={(episode) => {
                if (!activeSeasonNumber) return;
                streamLog("info", "series", "Episode selected", {
                  seriesId: contentId,
                  seasonNumber: activeSeasonNumber,
                  episodeNumber: episode.episode_number,
                  episodeTitle: episode.name,
                });
                onEpisodePlay({ seasonNumber: activeSeasonNumber, episode });
              }}
            />
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.episodesListContent}
          style={styles.episodesList}
          ItemSeparatorComponent={() => null}
        />
      ) : (
        <Text
          style={{ color: COLORS.textMuted, fontSize: 13, paddingVertical: 8 }}
        >
          Geen afleveringen gevonden
        </Text>
      )}
    </View>
  );
}
// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function DetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; type: string }>();
  const { isFavorite, toggleFavorite, hasPremium } = useNexora();

  // Parse TMDB id like "tmdb_m_550" or "tmdb_s_1668"
  const tmdbParsed = useMemo(() => parseTmdbId(params.id), [params.id]);
  const movieQuery = useMovieDetail(
    tmdbParsed?.kind === "movie" ? tmdbParsed.numericId : null,
  );
  const tvQuery = useTvDetail(
    tmdbParsed?.kind === "tv" ? tmdbParsed.numericId : null,
  );

  const content: Movie | Series | null =
    movieQuery.data ?? tvQuery.data ?? null;
  const isLoadingTmdb = movieQuery.isLoading || tvQuery.isLoading;

  // All hooks must be called unconditionally (Rules of Hooks)
  const { data: tmdbCast = [] } = useTmdbCast(content?.id ?? null);
  const { data: tmdbRecs = [] } = useTmdbRecommendations(
    content?.id ?? null,
    content?.type ?? "movie",
  );
  const { data: tmdbVideos = [] } = useTmdbVideos(content?.id ?? null);

  const related = tmdbRecs;

  // No-stream modal state must be declared before any conditional returns
  const [showNoStream, setShowNoStream] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  if (isLoadingTmdb) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="film-outline" size={48} color={COLORS.textFaint} />
        <Text style={[styles.notFoundText, { color: COLORS.textMuted }]}>
          Laden…
        </Text>
      </View>
    );
  }

  if (!content) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={COLORS.textMuted}
        />
        <Text style={styles.notFoundText}>Content not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backFab}>
          <Text style={styles.backFabText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const blockedContent = content.rating >= 10 || !content.poster;
  if (blockedContent) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={COLORS.textMuted}
        />
        <Text style={styles.notFoundText}>
          Deze content is niet beschikbaar
        </Text>
        <Pressable onPress={() => router.back()} style={styles.backFab}>
          <Text style={styles.backFabText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const inList = isFavorite(content.id);
  const isMovie = content.type === "movie";
  const movie = isMovie ? (content as Movie) : null;
  const series = !isMovie ? (content as Series) : null;

  // Cast to display: TMDB cast (with photos) takes priority over mock cast string array
  const castToShow: TmdbCastMember[] =
    tmdbCast.length > 0
      ? tmdbCast
      : (movie?.cast ?? []).map((name) => ({
          name,
          character: "",
          photo: null,
        }));

  const handlePlay = () => {
    // Movies always require Nexora+
    if (isMovie && !hasPremium("movies")) {
      router.push("/premium");
      return;
    }
    // Series: handlePlay always launches S1E1 which is free — no gate needed
    const numericTmdbId = parseNumericTmdbId(content.id);
    const firstSeason = series?.seasons?.[0] as any;
    const firstEpisode = firstSeason?.episodes?.[0] as any;
    const startSeason =
      Number(firstSeason?.seasonNumber ?? firstSeason?.season_number ?? 1) ||
      1;
    const startEpisode =
      Number(
        firstEpisode?.episodeNumber ??
          firstEpisode?.episode_number ??
          firstEpisode?.number ??
          1,
      ) || 1;
    streamLog("info", "movie", "Content play clicked", {
      contentId: content.id,
      contentType: content.type,
      title: content.title,
      tmdbId: numericTmdbId,
      season: isMovie ? undefined : startSeason,
      episode: isMovie ? undefined : startEpisode,
    });
    const streamUrl =
      movie?.streamUrl ??
      series?.seasons?.[0]?.episodes?.[0]?.streamUrl ??
      null;

    router.push({
      pathname: "/player",
      params: {
        title: content.title,
        poster: content.backdrop ?? "",
        streamUrl: streamUrl || "",
        tmdbId: numericTmdbId || content.id,
        type: content.type,
        season: String(startSeason),
        episode: String(startEpisode),
        autoFullscreen: "1",
      },
    });
  };

  const handleEpisodePlay = ({
    seasonNumber,
    episode,
  }: {
    seasonNumber: number;
    episode: TmdbEpisode;
  }) => {
    const episodeNumber = Number(episode?.episode_number || 0) || 1;
    // First episode of season 1 is always free; all others require Nexora+
    const isFreeEpisode = seasonNumber === 1 && episodeNumber === 1;
    if (!isFreeEpisode && !hasPremium("series")) {
      router.push("/premium");
      return;
    }
    const numericTmdbId = parseNumericTmdbId(content.id);
    streamLog("info", "series", "Episode play clicked", {
      contentId: content.id,
      tmdbId: numericTmdbId,
      seasonNumber,
      episodeNumber,
      episodeTitle: episode?.name,
    });
    router.push({
      pathname: "/player",
      params: {
        id: content.id,
        type: "series",
        title: `${content.title} • S${seasonNumber}E${episodeNumber}`,
        contentId: content.id,
        poster: content.backdrop ?? content.poster ?? "",
        tmdbId: numericTmdbId || content.id,
        season: String(seasonNumber),
        episode: String(episodeNumber),
        autoFullscreen: "1",
      },
    });
  };

  const trailer =
    tmdbVideos.find((v) => v.type === "Trailer" && v.official) ??
    tmdbVideos.find((v) => v.type === "Trailer") ??
    tmdbVideos[0] ??
    null;

  const handleTrailer = () => {
    if (!trailer) return;
    setShowTrailer(true);
  };

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      {/* Back button */}
      <Pressable
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => router.back()}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </Pressable>

      {/* No-stream modal */}
      <Modal
        visible={showNoStream}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNoStream(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNoStream(false)}
        >
          <View style={styles.modalCard}>
            <Ionicons
              name="film-outline"
              size={36}
              color={COLORS.accent}
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.modalTitle}>{content.title}</Text>
            <Text style={styles.modalBody}>
              Deze content is momenteel niet beschikbaar voor streaming. Probeer
              later opnieuw of abonneer voor premium content.
            </Text>
            <Pressable
              style={styles.modalBtn}
              onPress={() => setShowNoStream(false)}
            >
              <Text style={styles.modalBtnText}>Sluiten</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* In-app trailer modal */}
      {trailer ? (
        <TrailerModal
          videoKey={trailer.key}
          visible={showTrailer}
          onClose={() => setShowTrailer(false)}
        />
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Backdrop */}
        <View style={styles.backdrop}>
          <ExpoImage
            source={content.backdrop ?? content.poster ?? undefined}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={[
              "rgba(6,5,10,0.2)",
              "rgba(6,5,10,0.0)",
              "rgba(6,5,10,0.7)",
              COLORS.background,
            ]}
            locations={[0, 0.3, 0.7, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Content info block */}
        <Animated.View
          entering={FadeInDown.delay(80).springify()}
          style={styles.infoBlock}
        >
          {/* Poster + title stacked */}
          <View style={styles.posterRow}>
            <View style={styles.posterThumb}>
              <ExpoImage
                source={content.poster ?? undefined}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={300}
              />
            </View>
            <View style={styles.titleBlock}>
              {content.isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
              <Text style={styles.contentTitle}>{content.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.yearText}>{content.year}</Text>
                <View style={styles.dot} />
                {isMovie && movie && (
                  <Text style={styles.metaText}>
                    {formatDuration(movie.duration)}
                  </Text>
                )}
                {!isMovie && series && (
                  <Text style={styles.metaText}>
                    {series.totalSeasons}S · {series.totalEpisodes} EP
                  </Text>
                )}
                <View style={styles.dot} />
                <Ionicons name="star" size={12} color={COLORS.gold} />
                <Text style={styles.ratingText}>
                  {content.rating.toFixed(1)}
                </Text>
              </View>
              {/* Genres */}
              <View style={styles.genreRow}>
                {content.genres.slice(0, 3).map((g) => (
                  <View key={g} style={styles.genreChip}>
                    <Text style={styles.genreChipText}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Description */}
          <Text style={styles.description}>{content.description}</Text>

          {isMovie && movie?.director && (
            <Text style={styles.director}>
              <Text style={styles.directorLabel}>Director: </Text>
              {movie.director}
            </Text>
          )}
          {!isMovie && series?.network && (
            <Text style={styles.network}>
              <Text style={styles.networkLabel}>Network: </Text>
              {series.network}
            </Text>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.playBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handlePlay}
            >
              <Ionicons
                name={isMovie && !hasPremium("movies") ? "lock-closed" : "play"}
                size={18}
                color="#000"
              />
              <Text style={styles.playBtnText}>
                {isMovie
                  ? hasPremium("movies")
                    ? "Bekijk film"
                    : "Nexora+"
                  : "Gratis · S1E1"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.listBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => toggleFavorite(content.id, content.type as any)}
            >
              <Ionicons
                name={inList ? "checkmark" : "add"}
                size={20}
                color={COLORS.text}
              />
              <Text style={styles.listBtnText}>
                {inList ? "In lijst" : "Mijn lijst"}
              </Text>
            </Pressable>
            {trailer && (
              <Pressable
                style={({ pressed }) => [
                  styles.trailerBtn,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleTrailer}
              >
                <Ionicons name="play-outline" size={18} color={COLORS.text} />
                <Text style={styles.trailerBtnText}>Trailer</Text>
              </Pressable>
            )}
          </View>

          {/* Cast */}
          {castToShow.length > 0 && (
            <View style={styles.castSection}>
              <Text style={styles.sectionTitle}>Cast</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castRow}
              >
                {castToShow.map((member, i) => (
                  <View key={i} style={styles.castCard}>
                    {member.photo ? (
                      <ExpoImage
                        source={member.photo}
                        style={styles.castAvatarImg}
                        contentFit="cover"
                        transition={300}
                      />
                    ) : (
                      <View style={styles.castAvatar}>
                        <Text style={styles.castInitials}>
                          {member.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.castName} numberOfLines={2}>
                      {member.name}
                    </Text>
                    {member.character ? (
                      <Text style={styles.castCharacter} numberOfLines={1}>
                        {member.character}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Episodes (series only) */}
          {series && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Afleveringen</Text>
              <TmdbSeasonsPanel
                contentId={content.id}
                onEpisodePlay={handleEpisodePlay}
              />
            </View>
          )}

          {/* Related Content */}
          {related.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Meer zoals dit</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedRow}
              >
                {related.map((item, i) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.delay(i * 40).springify()}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.relatedCard,
                        pressed && { opacity: 0.78 },
                      ]}
                      onPress={() =>
                        router.push({
                          pathname: "/detail",
                          params: { id: item.id, type: item.type },
                        })
                      }
                    >
                      <ExpoImage
                        source={item.poster ?? undefined}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        transition={300}
                      />
                      <LinearGradient
                        colors={["transparent", "rgba(6,5,10,0.8)"]}
                        locations={[0.5, 1]}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <View style={styles.relatedFooter}>
                        <Text style={styles.relatedTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  backdrop: { width: "100%", height: BACKDROP_HEIGHT, position: "relative" },
  backBtn: {
    position: "absolute",
    left: 14,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 99,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  backFab: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 99,
    marginTop: 8,
  },
  backFabText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoBlock: { paddingHorizontal: 16, marginTop: -60, gap: 14 },
  posterRow: { flexDirection: "row", gap: 14, alignItems: "flex-end" },
  posterThumb: {
    width: 110,
    height: 163,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
  },
  titleBlock: { flex: 1, gap: 6, paddingBottom: 6 },
  newBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.new,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.8,
  },
  contentTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  yearText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 99,
    backgroundColor: COLORS.textFaint,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  ratingText: {
    color: COLORS.gold,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  genreRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  genreChip: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  genreChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  director: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  directorLabel: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  cast: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  castLabel: { color: COLORS.textSecondary, fontFamily: "Inter_600SemiBold" },
  network: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  networkLabel: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 13,
    borderRadius: 99,
  },
  playBtnText: { color: "#000", fontSize: 15, fontFamily: "Inter_700Bold" },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.cardElevated,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  trailerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.cardElevated,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trailerBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  section: { gap: 12, marginTop: 4 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  episodesPanel: { gap: 12 },
  episodesList: { minHeight: 280 },
  episodesListContent: {
    gap: 12,
    paddingVertical: 4,
    paddingRight: 8,
  },
  // Season dropdown button
  seasonDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  seasonDropdownText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  // Season picker modal card
  seasonPickerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    minWidth: 240,
    maxWidth: 320,
  },
  seasonPickerTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  seasonPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  seasonPickerItemActive: { backgroundColor: "transparent" },
  seasonPickerItemText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  // Episode card (VTM GO-style horizontal card)
  epCard: {
    width: EP_CARD_W,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  epCardThumbWrap: {
    width: EP_CARD_W,
    height: EP_CARD_W * (9 / 16),
    backgroundColor: COLORS.cardElevated,
    overflow: "hidden",
  },
  epCardThumbFallback: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: COLORS.cardElevated,
  },
  epCardNumBadge: {
    position: "absolute",
    top: 8,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  epCardNumText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  epCardDurationOverlay: {
    position: "absolute" as const,
    bottom: 8,
    right: 10,
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  epCardBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 5,
  },
  epCardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  epCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  epCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(255,0,200,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,0,200,0.35)",
  },
  epCardBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  epCardRuntimeText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  epCardDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  // Legacy episode row styles (kept)
  seasonsRow: { gap: 8, marginBottom: 12 },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seasonChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  seasonChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  epRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  epInfo: { flex: 1, flexDirection: "row", gap: 10 },
  epNumber: {
    color: COLORS.textFaint,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    width: 28,
  },
  epTextBlock: { flex: 1, gap: 3 },
  epTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  epDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  epDuration: { flexDirection: "row", alignItems: "center", gap: 6 },
  epDurationText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  // Cast
  castSection: { gap: 12, marginTop: 4 },
  castRow: { gap: 12 },
  castCard: { alignItems: "center", width: 64, gap: 6 },
  castAvatar: {
    width: 56,
    height: 56,
    borderRadius: 99,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  castInitials: {
    color: COLORS.accent,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  castAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 99,
    overflow: "hidden" as const,
    backgroundColor: COLORS.cardElevated,
  },
  castName: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textAlign: "center" as const,
    lineHeight: 13,
  },
  castCharacter: {
    color: COLORS.textFaint,
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 12,
  },
  // Episode thumbs
  epThumb: {
    width: 100,
    height: 60,
    borderRadius: 8,
    overflow: "hidden" as const,
    backgroundColor: COLORS.cardElevated,
  },
  epThumbFallback: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  epTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 28,
    alignItems: "center" as const,
    gap: 12,
    maxWidth: 340,
    width: "100%" as const,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center" as const,
  },
  modalBody: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 20,
  },
  modalBtn: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 99,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  modalBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  // Related
  relatedRow: { gap: 10 },
  relatedCard: {
    width: RELATED_CARD_W,
    height: RELATED_CARD_H,
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: COLORS.cardElevated,
    position: "relative" as const,
  },
  relatedFooter: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  relatedTitle: {
    color: COLORS.text,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 14,
  },
});

// ─── In-app YouTube trailer modal ────────────────────────────────────────────

function TrailerModal({
  videoKey,
  visible,
  onClose,
}: {
  videoKey: string;
  visible: boolean;
  onClose: () => void;
}) {
  const embedUri = `https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  const [WebView, setWebView] = useState<any>(null);
  const iframeRef = useRef<any>(null);

  // Load WebView lazily on native so the bundle stays lightweight on web
  useEffect(() => {
    if (Platform.OS === "web" || !visible) return;
    import("react-native-webview")
      .then((mod) => setWebView(() => mod.WebView ?? mod.default))
      .catch(() => {});
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={trailerStyles.overlay}>
        <View style={trailerStyles.sheet}>
          {/* Close bar */}
          <Pressable style={trailerStyles.closeRow} onPress={onClose}>
            <View style={trailerStyles.handle} />
            <Ionicons
              name="close"
              size={22}
              color={COLORS.textSecondary}
              style={trailerStyles.closeIcon}
            />
          </Pressable>

          {/* Player */}
          <View style={trailerStyles.playerBox}>
            {Platform.OS === "web" ? (
              // @ts-ignore — web-only iframe
              <iframe
                ref={iframeRef}
                src={embedUri}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  backgroundColor: "#000",
                }}
              />
            ) : WebView ? (
              <WebView
                source={{ uri: embedUri }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsInlineMediaPlayback
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                androidLayerType="hardware"
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
              />
            ) : (
              <View style={trailerStyles.loading}>
                <ActivityIndicator size="large" color={COLORS.accent} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width: TRAILER_W } = Dimensions.get("window");
const TRAILER_H = Math.round(TRAILER_W * (9 / 16));

const trailerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    overflow: "hidden",
  },
  closeRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: COLORS.borderLight,
  },
  closeIcon: {
    position: "absolute",
    right: 16,
  },
  playerBox: {
    width: TRAILER_W,
    height: TRAILER_H,
    backgroundColor: "#000",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
