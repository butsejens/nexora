import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import WebView from "react-native-webview";

import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { tmdbImg } from "@/lib/tmdb";
import { useNexora } from "@/context/NexoraContext";
import { streamLog } from "@/lib/stream-logger";
import { buildTrailerCandidates } from "@/features/media/services/trailerService";
import { RealContentCard } from "@/components/RealContentCard";
import { useTranslation } from "@/lib/useTranslation";
import { logSelfHealing, validateBeforePlay } from "@/core/self-healing";
import { resolveBestHeaderUri } from "@/core/self-healing/imageFallback";

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

function normalizeTmdbImage(value: unknown, size: "w780" | "w1280" | "original" = "w1280"): string | null {
  const uri = String(value || "").trim();
  if (!uri) return null;
  if (/^https?:\/\//i.test(uri)) {
    const tmdbMatch = uri.match(/\/t\/p\/(?:original|w\d+)(\/.*)$/i);
    if (!tmdbMatch?.[1]) return uri;
    return tmdbImg(tmdbMatch[1], size);
  }
  if (uri.startsWith("/")) return tmdbImg(uri, size);
  return uri;
}

function toPoster(raw: any) {
  return (
    normalizeTmdbImage(raw?.posterUri, "original") ||
    normalizeTmdbImage(raw?.poster, "original") ||
    normalizeTmdbImage(raw?.poster_path, "original") ||
    null
  );
}

function toBackdrop(raw: any) {
  const highestQualityBackdrop =
    normalizeTmdbImage(raw?.backdropUri, "original") ||
    normalizeTmdbImage(raw?.backdrop, "original") ||
    normalizeTmdbImage(raw?.backdrop_path, "original") ||
    normalizeTmdbImage(raw?.posterUri, "original") ||
    normalizeTmdbImage(raw?.poster, "original") ||
    null;

  return highestQualityBackdrop ? resolveBestHeaderUri(highestQualityBackdrop) : null;
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
  // #region agent log
  if (__DEV__) {
    fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "165c99",
      },
      body: JSON.stringify({
        sessionId: "165c99",
        runId: "baseline",
        hypothesisId: "H3",
        location: "media/detail:fetchMediaDetail",
        message: "detail-request-start",
        data: {
          id,
          type,
          route,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  try {
    const res = await apiRequest("GET", route);
    const payload = await res.json();
    // #region agent log
    if (__DEV__) {
      fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "165c99",
        },
        body: JSON.stringify({
          sessionId: "165c99",
          runId: "baseline-2",
          hypothesisId: "H5",
          location: "media/detail:fetchMediaDetail",
          message: "detail-request-success",
          data: {
            id,
            type,
            route,
            status: res.status,
            payloadType: typeof payload,
            hasTitle: Boolean(payload?.title || payload?.name),
            hasBackdrop: Boolean(payload?.backdrop || payload?.backdrop_path),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
    return payload;
  } catch (error) {
    // #region agent log
    if (__DEV__) {
      fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "165c99",
        },
        body: JSON.stringify({
          sessionId: "165c99",
          runId: "baseline-2",
          hypothesisId: "H5",
          location: "media/detail:fetchMediaDetail",
          message: "detail-request-failed",
          data: {
            id,
            type,
            route,
            error: String((error as any)?.message || error || "unknown"),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
    throw error;
  }
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
): Promise<{ key: string; candidates: string[] }> {
  try {
    const route = `/api/trailer/${encodeURIComponent(tmdbId)}?type=${type}`;
    const res = await apiRequest("GET", route);
    const data = await res.json();
    const out = new Set<string>();
    const primary = String(data?.key || "").trim();
    if (/^[A-Za-z0-9_-]{6,}$/.test(primary)) out.add(primary);

    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    for (const candidate of candidates) {
      const direct = String(candidate?.key || "").trim();
      if (/^[A-Za-z0-9_-]{6,}$/.test(direct)) out.add(direct);
      const fromUrl = buildTrailerCandidates(
        candidate?.url || candidate?.trailerUrl || "",
      );
      for (const key of fromUrl) out.add(key);
    }

    return {
      key: primary,
      candidates: Array.from(out),
    };
  } catch {
    return { key: "", candidates: [] };
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

  useEffect(() => {
    if (!__DEV__) return;
    // #region agent log
    fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "165c99",
      },
      body: JSON.stringify({
        sessionId: "165c99",
        runId: "baseline",
        hypothesisId: "H3",
        location: "media/detail:params",
        message: "detail-screen-mounted",
        data: {
          rawId: id,
          parsedTmdbId: numericRouteTmdbId || null,
          type,
          hasTitleParam: Boolean(params.title),
          href:
            typeof window !== "undefined" ? window.location.href : "native",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [id, numericRouteTmdbId, params.title, type]);

  const { toggleFavorite, isFavorite } = useNexora();
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [episodesModalOpen, setEpisodesModalOpen] = useState(false);
  const [trailerFailedAll, setTrailerFailedAll] = useState(false);
  const faved = isFavorite(id, type);

  const detailQuery = useQuery({
    queryKey: ["media-detail-v2", type, id],
    queryFn: () =>
      fetchMediaDetail(numericRouteTmdbId || id, type, params.title),
    enabled: Boolean(id),
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (!__DEV__) return;
    // #region agent log
    fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "165c99",
      },
      body: JSON.stringify({
        sessionId: "165c99",
        runId: "baseline-2",
        hypothesisId: "H6",
        location: "media/detail:query-state",
        message: "detail-query-state",
        data: {
          id,
          type,
          isLoading: detailQuery.isLoading,
          isError: detailQuery.isError,
          hasData: Boolean(detailQuery.data),
          error: detailQuery.error
            ? String((detailQuery.error as any)?.message || detailQuery.error)
            : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [
    id,
    type,
    detailQuery.isLoading,
    detailQuery.isError,
    detailQuery.data,
    detailQuery.error,
  ]);

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

  useEffect(() => {
    setEpisodeQuery("");
    setSeasonSheetOpen(false);
  }, [selectedSeason]);

  const detail = detailQuery.data || null;
  const title = String(
    detail?.title || detail?.name || params.title || "Untitled",
  );
  const overview = String(
    detail?.overview || detail?.synopsis || params.overview || "",
  );
  const poster =
    toPoster(detail) || normalizeTmdbImage(params.poster, "original") || null;
  const backdrop =
    toBackdrop(detail) ||
    normalizeTmdbImage(params.backdrop, "original") ||
    poster;
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
  const trailerKeysFromDetail = useMemo(() => {
    const keys = new Set<string>();
    if (trailerKeyFromDetail) keys.add(trailerKeyFromDetail);

    if (Array.isArray(detail?.trailerCandidates)) {
      for (const candidate of detail.trailerCandidates) {
        const direct = String(candidate?.key || "").trim();
        if (/^[A-Za-z0-9_-]{6,}$/.test(direct)) keys.add(direct);
        const extracted = buildTrailerCandidates(
          candidate?.key || candidate?.url || candidate?.trailerUrl || "",
        );
        for (const key of extracted) keys.add(key);
      }
    }

    const fallbackExtracted = buildTrailerCandidates(
      detail?.trailerUrl || detail?.embedUrl || "",
    );
    for (const key of fallbackExtracted) keys.add(key);

    if (Array.isArray(detail?.videos)) {
      for (const video of detail.videos) {
        if (String(video?.site || "").toLowerCase() !== "youtube") continue;
        if (!/trailer|teaser/i.test(String(video?.type || ""))) continue;
        const direct = String(video?.key || "").trim();
        if (/^[A-Za-z0-9_-]{6,}$/.test(direct)) keys.add(direct);
      }
    }

    return Array.from(keys);
  }, [detail, trailerKeyFromDetail]);

  // Fallback: fetch trailer separately if detail didn't include one
  const trailerFallbackQuery = useQuery({
    queryKey: ["media-detail-v2", "trailer", type, id],
    queryFn: () => fetchTrailerKey(resolvedTmdbId || id, type),
    enabled: Boolean(id) && Boolean(detail),
    staleTime: 60 * 60_000,
  });

  const trailerKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const key of trailerKeysFromDetail) keys.add(key);
    const fallbackPrimary = String(trailerFallbackQuery.data?.key || "").trim();
    if (/^[A-Za-z0-9_-]{6,}$/.test(fallbackPrimary)) keys.add(fallbackPrimary);
    const fallbackCandidates = Array.isArray(trailerFallbackQuery.data?.candidates)
      ? trailerFallbackQuery.data.candidates
      : [];
    for (const key of fallbackCandidates) {
      if (/^[A-Za-z0-9_-]{6,}$/.test(String(key || "").trim())) {
        keys.add(String(key || "").trim());
      }
    }
    return Array.from(keys);
  }, [trailerKeysFromDetail, trailerFallbackQuery.data]);

  const [trailerCandidateIndex, setTrailerCandidateIndex] = useState(0);
  const [webTrailerReady, setWebTrailerReady] = useState(false);

  useEffect(() => {
    setTrailerCandidateIndex(0);
    setTrailerFailedAll(false);
  }, [id, type]);

  const activeTrailerKey = trailerKeys[trailerCandidateIndex] || "";
  const trailerWatchUrl = activeTrailerKey
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(activeTrailerKey)}`
    : "";
  const trailerUrl = activeTrailerKey && !trailerFailedAll
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(activeTrailerKey)}?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1`
    : "";
  const hasTrailer = trailerKeys.length > 0;
  const trailerLoading =
    trailerKeys.length === 0 && trailerFallbackQuery.isLoading;

  const handleTrailerWebError = useCallback(() => {
    setTrailerCandidateIndex((current) => {
      if (current >= trailerKeys.length - 1) {
        setTrailerFailedAll(true);
        return current;
      }
      return current + 1;
    });
  }, [trailerKeys.length]);

  const openOriginalTrailer = useCallback(async () => {
    if (!trailerWatchUrl) return;
    try {
      const supported = await Linking.canOpenURL(trailerWatchUrl);
      if (supported) {
        await Linking.openURL(trailerWatchUrl);
      }
    } catch {
      // Ignore launcher errors for fallback action.
    }
  }, [trailerWatchUrl]);

  useEffect(() => {
    setWebTrailerReady(false);
  }, [activeTrailerKey, trailerOpen]);

  useEffect(() => {
    if (!trailerOpen || Platform.OS !== "web" || !trailerUrl) return;

    const watchdog = setTimeout(() => {
      if (!webTrailerReady) {
        handleTrailerWebError();
      }
    }, 12_000);

    return () => clearTimeout(watchdog);
  }, [handleTrailerWebError, trailerOpen, trailerUrl, webTrailerReady]);

  const handlePlayEpisode = useCallback(
    (seasonNum: number, episodeNum: number) => {
      const finalTmdbId = resolvedTmdbId || parseNumericTmdbId(String(params.id || ""));
      const guard = validateBeforePlay({
        id: finalTmdbId || id,
        type: "series",
      });
      if (!guard.ok) {
        void logSelfHealing("warn", "PLAYER", "block-episode-play-invalid-data", {
          id,
          seasonNum,
          episodeNum,
          reason: guard.message,
        });
        return;
      }
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
  const recommendations = useMemo(() => {
    const items = Array.isArray(recommendationsQuery.data?.items)
      ? recommendationsQuery.data.items
      : [];
    const seen = new Set<string>();
    return items.filter((item: any) => {
      const typeKey = String(
        item?.type || item?.mediaType || item?.media_type || "movie",
      ).toLowerCase();
      const idKey = String(item?.tmdbId || item?.id || "").trim();
      const titleKey = String(item?.title || item?.name || "")
        .trim()
        .toLowerCase();
      const yearKey = String(
        item?.year || item?.releaseDate || item?.release_date || "",
      ).slice(0, 4);
      const key = idKey
        ? `${typeKey}:${idKey}`
        : `${typeKey}:${titleKey}:${yearKey}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recommendationsQuery.data?.items]);
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
  const episodeRows = useMemo(() => {
    const rawNumbers = sortedEpisodes.map((episode: any) =>
      Number(
        episode?.episodeNumber || episode?.episode_number || episode?.number || 0,
      ) || 0,
    );
    const maxRaw = rawNumbers.length ? Math.max(...rawNumbers) : 0;
    // Some APIs return global/absolute episode numbers (e.g. S2 starts at 111).
    // When that happens, use ordinal per-season numbering for cleaner UX and playback params.
    const useOrdinal =
      maxRaw > sortedEpisodes.length + 5 || rawNumbers.some((num) => num <= 0);

    return sortedEpisodes.map((episode: any, index: number) => {
      const rawEpisodeNumber =
        Number(
          episode?.episodeNumber || episode?.episode_number || episode?.number || 0,
        ) || 0;
      const displayEpisodeNumber = useOrdinal ? index + 1 : rawEpisodeNumber;
      const playEpisodeNumber = displayEpisodeNumber;
      const durationLabel =
        episode?.duration ||
        (Number(episode?.durationMinutes || episode?.runtime || 0) > 0
          ? `${Number(episode?.durationMinutes || episode?.runtime)} min`
          : "Duur onbekend");
      return {
        key: String(
          episode?.id ||
            `${selectedSeason}-${rawEpisodeNumber || displayEpisodeNumber}-${index}`,
        ),
        title: String(episode?.title || episode?.name || "Episode"),
        displayEpisodeNumber,
        playEpisodeNumber,
        durationLabel,
        searchableBlob: `${displayEpisodeNumber} ${rawEpisodeNumber} ${String(
          episode?.title || episode?.name || "",
        )} ${String(episode?.overview || "")}`.toLowerCase(),
      };
    });
  }, [sortedEpisodes, selectedSeason]);
  const filteredEpisodes = useMemo(() => {
    const query = episodeQuery.trim().toLowerCase();
    if (!query) return episodeRows;
    return episodeRows.filter((episode) => episode.searchableBlob.includes(query));
  }, [episodeRows, episodeQuery]);
  const episodePreview = useMemo(
    () => filteredEpisodes.slice(0, 12),
    [filteredEpisodes],
  );
  const primaryRating = useMemo(() => {
    const value = Number(
      detail?.tmdbRating ||
        detail?.rating ||
        detail?.imdbRating ||
        detail?.imdb ||
        0,
    );
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [detail]);

  const handlePlay = () => {
    const finalTmdbId = resolvedTmdbId || parseNumericTmdbId(String(params.id || ""));
    const guard = validateBeforePlay({
      id: finalTmdbId || id,
      type,
    });
    if (!guard.ok) {
      void logSelfHealing("warn", "PLAYER", "block-play-invalid-data", {
        id,
        type,
        reason: guard.message,
      });
      return;
    }
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
            tintColor={COLORS.textSecondary}
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
          <LinearGradient
            colors={["transparent", "rgba(6,5,10,0.30)", COLORS.background]}
            locations={[0.42, 0.74, 1]}
            style={styles.heroOverlay}
          />
          <LinearGradient
            colors={["rgba(6,5,10,0.38)", "transparent"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0.55, y: 1 }}
            style={styles.heroSideOverlay}
          />

          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topRightBtn, { top: insets.top + 8, right: 14, position: "absolute" }]}
            onPress={() => setInfoOpen(true)}
          >
            <Ionicons name="information-circle-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroMeta}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLine}>{year || t("detail.unknownYear")}</Text>
              {primaryRating ? (
                <>
                  <Text style={styles.metaLine}> · </Text>
                  <Ionicons name="star" size={12} color={COLORS.gold} />
                  <Text style={styles.metaLine}> {primaryRating.toFixed(1)}</Text>
                </>
              ) : null}
              {genres.length ? (
                <Text style={styles.metaLine}>
                  {` · ${genres.slice(0, 3).join(" • ")}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.playBtn} onPress={handlePlay}>
                <Ionicons name="play" size={16} color="#000" />
                <Text style={styles.playBtnText}>{t("detail.play")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.myListBtn}
                onPress={() => toggleFavorite(id, type)}
              >
                <Ionicons
                  name={faved ? "checkmark" : "add"}
                  size={16}
                  color={COLORS.text}
                />
                <Text style={styles.myListBtnText}>Mijn lijst</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.trailerBtn,
                  !hasTrailer && !trailerLoading && styles.trailerBtnDisabled,
                ]}
                onPress={() => {
                  if (!hasTrailer) return;
                  setTrailerFailedAll(false);
                  setTrailerCandidateIndex(0);
                  setTrailerOpen(true);
                }}
                disabled={!hasTrailer && !trailerLoading}
              >
                {trailerLoading ? (
                  <ActivityIndicator size={14} color="#fff" />
                ) : (
                  <Ionicons
                    name="film-outline"
                    size={16}
                    color={hasTrailer ? "#fff" : COLORS.textMuted}
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
          {!!overview && (
            <Section title={t("detail.overview")}>
              <Text style={styles.body}>{overview}</Text>
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
                    <TouchableOpacity
                      key={person.id}
                      style={styles.castCard}
                      activeOpacity={0.82}
                      onPress={() =>
                        router.push({
                          pathname: "/media/cast/[id]",
                          params: {
                            id: String(person.id),
                            name: person.name,
                            role: person.role || "",
                          },
                        })
                      }
                    >
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
                    </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.seasonSelector}
                onPress={() => setSeasonSheetOpen(true)}
                activeOpacity={0.8}
              >
                <View style={styles.seasonSelectorLeft}>
                  <Text style={styles.seasonSelectorLabel}>Geselecteerd seizoen</Text>
                  <Text style={styles.seasonSelectorText}>Seizoen {selectedSeason}</Text>
                </View>
                <View style={styles.seasonSelectorIconWrap}>
                  <Ionicons
                    name="chevron-down"
                    size={15}
                    color={COLORS.text}
                  />
                </View>
              </TouchableOpacity>
              <TextInput
                value={episodeQuery}
                onChangeText={setEpisodeQuery}
                placeholder="Zoek aflevering in dit seizoen"
                placeholderTextColor={COLORS.textMuted}
                style={styles.episodeSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />

              {seasonEpisodesQuery.isLoading ? (
                <ActivityIndicator color={COLORS.textSecondary} />
              ) : (
                <>
                  <FlatList
                    data={episodePreview}
                    keyExtractor={(episode) => episode.key}
                    numColumns={2}
                    scrollEnabled={false}
                    columnWrapperStyle={styles.episodesGridRow}
                    contentContainerStyle={styles.episodesGrid}
                    renderItem={({ item: episode }) => {
                      return (
                        <TouchableOpacity
                          style={styles.episodeGridCard}
                          onPress={() =>
                            handlePlayEpisode(
                              selectedSeason,
                              episode.playEpisodeNumber || 1,
                            )
                          }
                          activeOpacity={0.7}
                        >
                          <Text style={styles.episodeGridNumber}>
                            Aflevering {episode.displayEpisodeNumber || "?"}
                          </Text>
                          <Text style={styles.episodeGridTitle} numberOfLines={2}>
                            {episode.title}
                          </Text>
                          <Text style={styles.episodeGridMeta} numberOfLines={1}>
                            {episode.durationLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  {filteredEpisodes.length > episodePreview.length ? (
                    <TouchableOpacity
                      style={styles.showAllEpisodesBtn}
                      onPress={() => setEpisodesModalOpen(true)}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.showAllEpisodesBtnText}>
                        Bekijk alle afleveringen ({filteredEpisodes.length})
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={COLORS.text}
                      />
                    </TouchableOpacity>
                  ) : null}
                  {!filteredEpisodes.length ? (
                    <Text style={styles.emptyText}>Geen afleveringen gevonden voor je zoekterm.</Text>
                  ) : null}
                </>
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
            <ActivityIndicator color={COLORS.textSecondary} size="large" />
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
        visible={seasonSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSeasonSheetOpen(false)}
      >
        <View style={styles.episodesModalOverlay}>
          <View
            style={[
              styles.episodesModalSheet,
              { paddingBottom: insets.bottom + 14, paddingTop: insets.top + 8 },
            ]}
          >
            <View style={styles.episodesModalHeader}>
              <Text style={styles.episodesModalTitle}>Kies seizoen</Text>
              <TouchableOpacity
                style={styles.episodesModalCloseBtn}
                onPress={() => setSeasonSheetOpen(false)}
              >
                <Ionicons name="close" size={16} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={seasons}
              keyExtractor={(season: any, index) =>
                String(
                  season?.seasonNumber ||
                    season?.season_number ||
                    season?.season ||
                    index,
                )
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.seasonMenuList}
              renderItem={({ item: season }) => {
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
                    style={[
                      styles.seasonMenuItem,
                      active && styles.seasonMenuItemActive,
                    ]}
                    onPress={() => {
                      streamLog("info", "series", "Season selected", {
                        source: "media-detail",
                        contentId: id,
                        season: seasonNumber,
                      });
                      setSelectedSeason(seasonNumber);
                      setSeasonSheetOpen(false);
                    }}
                  >
                    <View style={styles.seasonMenuItemRow}>
                      <Text
                        style={[
                          styles.seasonMenuItemText,
                          active && styles.seasonMenuItemTextActive,
                        ]}
                      >
                        Seizoen {seasonNumber}
                      </Text>
                      {active ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={COLORS.text}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={episodesModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEpisodesModalOpen(false)}
      >
        <View style={styles.episodesModalOverlay}>
          <View
            style={[
              styles.episodesModalSheet,
              { paddingBottom: insets.bottom + 14, paddingTop: insets.top + 8 },
            ]}
          >
            <View style={styles.episodesModalHeader}>
              <Text style={styles.episodesModalTitle}>
                Seizoen {selectedSeason} · {filteredEpisodes.length} afleveringen
              </Text>
              <TouchableOpacity
                style={styles.episodesModalCloseBtn}
                onPress={() => setEpisodesModalOpen(false)}
              >
                <Ionicons name="close" size={16} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={filteredEpisodes}
              keyExtractor={(episode) => `modal-${episode.key}`}
              numColumns={2}
              columnWrapperStyle={styles.episodesGridRow}
              contentContainerStyle={styles.episodesGrid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: episode }) => (
                <TouchableOpacity
                  style={styles.episodeGridCard}
                  onPress={() => {
                    setEpisodesModalOpen(false);
                    handlePlayEpisode(selectedSeason, episode.playEpisodeNumber || 1);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.episodeGridNumber}>
                    Aflevering {episode.displayEpisodeNumber || "?"}
                  </Text>
                  <Text style={styles.episodeGridTitle} numberOfLines={2}>
                    {episode.title}
                  </Text>
                  <Text style={styles.episodeGridMeta} numberOfLines={1}>
                    {episode.durationLabel}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={trailerOpen}
        animationType="slide"
        onRequestClose={() => setTrailerOpen(false)}
      >
        <View style={styles.trailerModal}>
          <View style={[styles.trailerHeader, { paddingTop: insets.top + 6 }]}>
            <Text style={styles.trailerHeaderTitle}>Trailer</Text>
            <View style={styles.trailerHeaderActions}>
              {trailerWatchUrl ? (
                <TouchableOpacity onPress={openOriginalTrailer} style={styles.trailerExternalBtn}>
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text style={styles.trailerExternalText}>YouTube</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setTrailerOpen(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          {trailerUrl ? (
            Platform.OS === "web" ? (
              <View style={styles.trailerWebView}>
                <iframe
                  key={activeTrailerKey}
                  title="Trailer player"
                  src={trailerUrl}
                  style={{ width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onLoad={() => setWebTrailerReady(true)}
                  onError={handleTrailerWebError}
                />
              </View>
            ) : (
              <WebView
                key={activeTrailerKey}
                source={{ uri: trailerUrl }}
                style={styles.trailerWebView}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                javaScriptCanOpenWindowsAutomatically={false}
                setSupportMultipleWindows={false}
                allowsBackForwardNavigationGestures={false}
                onError={handleTrailerWebError}
                onHttpError={handleTrailerWebError}
              />
            )
          ) : (
            <View style={styles.trailerFallback}>
              <Text style={styles.emptyText}>Trailer unavailable.</Text>
              {trailerWatchUrl ? (
                <TouchableOpacity style={styles.trailerFallbackBtn} onPress={openOriginalTrailer}>
                  <Text style={styles.trailerFallbackBtnText}>Open originele trailer</Text>
                </TouchableOpacity>
              ) : null}
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
    color: COLORS.textSecondary,
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
  },
  heroSideOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
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
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  playBtnText: {
    color: "#000",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  trailerBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  trailerBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  trailerBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  myListBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  myListBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
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

  seasonSelector: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seasonSelectorLeft: { gap: 1 },
  seasonSelectorLabel: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  seasonSelectorText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  seasonSelectorIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  seasonMenuList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  seasonMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  seasonMenuItemActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  seasonMenuItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seasonMenuItemText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  seasonMenuItemTextActive: { color: COLORS.text },
  episodeSearchInput: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  episodesGrid: {
    gap: 8,
    marginTop: 8,
  },
  episodesGridRow: {
    gap: 8,
  },
  episodeGridCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    paddingHorizontal: 9,
    paddingVertical: 8,
    minHeight: 76,
    gap: 3,
  },
  episodeGridNumber: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  episodeGridTitle: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    lineHeight: 14,
  },
  episodeGridMeta: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 9,
  },
  showAllEpisodesBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  showAllEpisodesBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  episodesModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.58)",
    justifyContent: "flex-end",
  },
  episodesModalSheet: {
    maxHeight: Dimensions.get("window").height * 0.86,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
  },
  episodesModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  episodesModalTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  episodesModalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  recRow: { gap: 10, paddingRight: 12 },

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
  trailerHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trailerExternalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  trailerExternalText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
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
  trailerFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  trailerFallbackBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  trailerFallbackBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },

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
    backgroundColor: "rgba(255,255,255,0.92)",
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
