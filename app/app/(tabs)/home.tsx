import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  FlatList,
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
import { Ionicons } from "@expo/vector-icons";

import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import { MatchStatusCard, resolveMatchVisualState, type PremiumSportMatch } from "@/components/sports/SportCards";
import { COLORS } from "@/constants/colors";
import { ms, s, screenWidth, vs } from "@/lib/responsive";
import { useNexora } from "@/context/NexoraContext";
import { useFollowState, useWatchProgress } from "@/context/UserStateContext";
import {
  buildContinueWatchingRows,
  buildHighlightsQuery,
  buildVodHomeQuery,
  deriveCuratedHomeMedia,
} from "@/services/realtime-engine";
import { useOnboardingStore } from "@/store/onboarding-store";
import { resolveMatchCompetitionLabel, resolveMatchEspnLeagueCode } from "@/lib/sports-competition";
import { useSportHomeFeed } from "@/features/sports/hooks/useSportHomeFeed";
import { getMatchdayYmd } from "@/lib/date/matchday";
import {
  selectHighlightsForFeed,
} from "@/lib/ai";

function splitReplayAndHighlightItems(items: any[]): { replays: any[]; highlights: any[] } {
  const replayTokens = /(replay|full\s*match|full\s*game|extended\s*highlights|highlights\s*\+\s*goals)/i;
  const replays: any[] = [];
  const highlights: any[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const title = String(item?.title || "");
    const competition = String(item?.competition || "");
    const descriptor = `${title} ${competition}`;
    if (replayTokens.test(descriptor)) {
      replays.push(item);
      continue;
    }
    highlights.push(item);
  }

  return { replays, highlights };
}

function getTeamName(team: unknown, fallback: string): string {
  if (typeof team === "string") return team || fallback;
  if (team && typeof team === "object") {
    const name = String((team as any)?.name || (team as any)?.displayName || "").trim();
    return name || fallback;
  }
  return fallback;
}

function getTeamLogo(match: any, side: "home" | "away"): string {
  const direct = side === "home" ? match?.homeTeamLogo : match?.awayTeamLogo;
  if (typeof direct === "string" && direct.trim()) return direct;
  const teamObj = side === "home" ? match?.homeTeam : match?.awayTeam;
  if (teamObj && typeof teamObj === "object") {
    const logo = String((teamObj as any)?.logo || "").trim();
    if (logo) return logo;
  }
  return "";
}

function getScore(match: any, side: "home" | "away"): number {
  const direct = side === "home" ? match?.homeScore : match?.awayScore;
  if (Number.isFinite(Number(direct))) return Number(direct);
  const scoreObj = match?.score;
  if (scoreObj && typeof scoreObj === "object") {
    const nested = side === "home" ? scoreObj?.home : scoreObj?.away;
    if (Number.isFinite(Number(nested))) return Number(nested);
  }
  return 0;
}

function toMatchParams(match: any) {
  const league = resolveMatchCompetitionLabel(match);
  return {
    matchId: String(match?.id || ""),
    homeTeam: getTeamName(match?.homeTeam, "Home"),
    awayTeam: getTeamName(match?.awayTeam, "Away"),
    homeTeamLogo: getTeamLogo(match, "home"),
    awayTeamLogo: getTeamLogo(match, "away"),
    homeScore: String(getScore(match, "home")),
    awayScore: String(getScore(match, "away")),
    league,
    espnLeague: resolveMatchEspnLeagueCode(match),
    minute: String(match?.minute ?? ""),
    status: String(match?.status || "upcoming"),
    sport: String(match?.sport || "football"),
  };
}

function isRenderableMatch(match: any): boolean {
  if (!match) return false;
  const home = getTeamName(match?.homeTeam, "").trim();
  const away = getTeamName(match?.awayTeam, "").trim();
  return Boolean(home && away);
}

export default function CuratedHomeScreen() {
  useRenderTelemetry("CuratedHomeScreen");

  const insets = useSafeAreaInsets();
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const selectedTeams = useOnboardingStore((s) => s.selectedTeams);
  const selectedCompetitions = useOnboardingStore((s) => s.selectedCompetitions);
  const { watchHistory, isFavorite, toggleFavorite } = useNexora();
  const { followedTeams } = useFollowState();
  const { continueWatching: syncedContinueWatching } = useWatchProgress();

  const sportsQuery = useSportHomeFeed(sportsEnabled, getMatchdayYmd());
  const mediaQuery = useQuery(buildVodHomeQuery(moviesEnabled));
  const highlightsQuery = useQuery(buildHighlightsQuery(sportsEnabled));

  const mediaData = deriveCuratedHomeMedia(mediaQuery.data);

  const continueWatching = useMemo(() => {
    return buildContinueWatchingRows(watchHistory as any, syncedContinueWatching as any, 8);
  }, [syncedContinueWatching, watchHistory]);

  const liveMatches = useMemo(() => (sportsEnabled ? (sportsQuery.data?.live || []) : []), [sportsEnabled, sportsQuery.data?.live]);
  const upcomingMatches = useMemo(() => (sportsEnabled ? (sportsQuery.data?.upcoming || []) : []), [sportsEnabled, sportsQuery.data?.upcoming]);
  const finishedMatches = useMemo(() => (sportsEnabled ? (sportsQuery.data?.finished || []) : []), [sportsEnabled, sportsQuery.data?.finished]);
  const curatedSportsPool = useMemo(
    () => (sportsEnabled ? ([...liveMatches, ...upcomingMatches, ...finishedMatches].filter(isRenderableMatch) as unknown as PremiumSportMatch[]) : []),
    [finishedMatches, liveMatches, sportsEnabled, upcomingMatches],
  );
  const featuredMatch = useMemo(() => {
    if (!sportsEnabled) return null;
    return curatedSportsPool.find((match) => resolveMatchVisualState(match) === "live") || curatedSportsPool[0] || null;
  }, [curatedSportsPool, sportsEnabled]);
  const liveNowMatches = useMemo(
    () => curatedSportsPool.filter((match) => resolveMatchVisualState(match) === "live").slice(0, 4),
    [curatedSportsPool],
  );
  const todayScheduleMatches = useMemo(
    () => curatedSportsPool.filter((match) => {
      const state = resolveMatchVisualState(match);
      return state === "upcoming" || state === "finished";
    }).slice(0, 6),
    [curatedSportsPool],
  );
  const favoriteTeamNames = [
    ...followedTeams.map((team) => String(team?.teamName || "")),
    ...selectedTeams.map((team) => String(team?.name || "")),
  ].filter(Boolean);
  const preferredLeagues = selectedCompetitions.map((competition) => String(competition?.name || competition?.id || "")).filter(Boolean);

  const movieRail = useMemo(
    () => (moviesEnabled ? (mediaData?.movies || []).slice(0, 8) : []),
    [moviesEnabled, mediaData?.movies],
  );
  const seriesRail = useMemo(
    () => (moviesEnabled ? (mediaData?.series || []).slice(0, 8) : []),
    [moviesEnabled, mediaData?.series],
  );
  const releasesRail = useMemo(
    () => (moviesEnabled ? (mediaData?.newReleases || []).slice(0, 8) : []),
    [moviesEnabled, mediaData?.newReleases],
  );
  const replayAndHighlight = useMemo(
    () => splitReplayAndHighlightItems(sportsEnabled ? (highlightsQuery.data || []) : []),
    [highlightsQuery.data, sportsEnabled],
  );
  const replayItems = replayAndHighlight.replays.slice(0, 8);
  const highlightItems = useMemo(() => {
    return selectHighlightsForFeed({
      highlights: replayAndHighlight.highlights,
      favoriteTeams: favoriteTeamNames,
      preferredLeagues,
    }).map((entry) => entry.item).slice(0, 8);
  }, [favoriteTeamNames, preferredLeagues, replayAndHighlight.highlights]);

  const railCardWidth = Math.round(Math.max(108, Math.min(156, screenWidth * 0.32)));

  // ── Hero carousel items (sports + media, cycle every 5s) ──────────────────
  type HeroItem =
    | { kind: "sport"; match: any }
    | { kind: "media"; media: any };

  const heroCandidates = useMemo<HeroItem[]>(() => {
    const items: HeroItem[] = [];
    if (sportsEnabled) {
      [...liveMatches, ...upcomingMatches, ...finishedMatches].slice(0, 4).forEach((match) => {
        items.push({ kind: "sport", match });
      });
    }
    if (moviesEnabled) {
      [...movieRail, ...seriesRail].slice(0, 4).forEach((media) => {
        items.push({ kind: "media", media });
      });
    }
    if (items.length === 0) {
      // Fallback placeholder
      items.push({ kind: "media", media: null });
    }
    return items.slice(0, 6);
  }, [liveMatches, upcomingMatches, finishedMatches, movieRail, seriesRail, sportsEnabled, moviesEnabled]);

  const heroFlatListRef = useRef<FlatList<HeroItem>>(null);
  const heroIndexRef = useRef(0);
  const [heroPage, setHeroPage] = useState(0);

  useEffect(() => {
    if (heroCandidates.length <= 1) return;
    const timer = setInterval(() => {
      heroIndexRef.current = (heroIndexRef.current + 1) % heroCandidates.length;
      heroFlatListRef.current?.scrollToIndex({ index: heroIndexRef.current, animated: true });
      setHeroPage(heroIndexRef.current);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroCandidates.length]);

  const openReplay = (item: any, fallbackId: string) => {
    const rawUrl = String(item?.embedUrl || item?.matchUrl || item?.url || "").trim();
    if (!rawUrl) return;
    router.push({
      pathname: "/player",
      params: {
        embedUrl: rawUrl,
        title: String(item?.title || `${getTeamName(item?.homeTeam, "Home")} vs ${getTeamName(item?.awayTeam, "Away")}`),
        type: "sport",
        contentId: `sport_replay_${fallbackId}`,
      },
    });
  };

  const openMatchDetail = useCallback((match: any) => {
    router.push({ pathname: "/match-detail", params: toMatchParams(match) });
  }, []);

  return (
    <View style={styles.screen}>
      <NexoraHeader
        variant="module"
        title="HOME"
        titleColor={COLORS.accent}
        showSearch
        showNotification
        showFavorites
        onSearch={() => router.navigate("/(tabs)/search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={Boolean(sportsQuery.isRefetching || mediaQuery.isRefetching)}
            onRefresh={() => {
              sportsQuery.refetch();
              mediaQuery.refetch();
              highlightsQuery.refetch();
            }}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      >
        <View style={styles.heroWrap}>
          <FlatList<HeroItem>
            ref={heroFlatListRef}
            data={heroCandidates}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={heroCandidates.length > 1}
            getItemLayout={(_, index) => ({ length: screenWidth - s(32), offset: (screenWidth - s(32)) * index, index })}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - s(32)));
              heroIndexRef.current = page;
              setHeroPage(page);
            }}
            keyExtractor={(_, idx) => String(idx)}
            renderItem={({ item }) => {
              const isSport = item.kind === "sport";
              const match = isSport ? item.match : null;
              const media = isSport ? null : (item as any).media;
              const title = isSport
                ? `${getTeamName(match?.homeTeam, "Home")} vs ${getTeamName(match?.awayTeam, "Away")}`
                : String(media?.title || "Welcome to NEXORA");
              const meta = isSport
                ? `Matchday Pick · ${resolveMatchCompetitionLabel(match)}`
                : `${media?.type === "series" ? "Series" : "Film"}${media?.year ? ` · ${media.year}` : ""}`;
              const img = isSport ? null : (media?.backdrop || media?.poster || null);
              return (
                <TouchableOpacity
                  style={{ width: screenWidth - s(32) }}
                  activeOpacity={0.9}
                  onPress={() => {
                    if (isSport && match) { openMatchDetail(match); return; }
                    if (media) {
                      router.push({
                        pathname: "/detail",
                        params: {
                          id: media.id,
                          type: media.type,
                          title: media.title,
                          tmdbId: media.tmdbId ? String(media.tmdbId) : undefined,
                        },
                      });
                    }
                  }}
                >
                  <View style={styles.heroCard}>
                    {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    {isSport && match ? (
                      <>
                        {getTeamLogo(match, "home") ? (
                          <Image source={{ uri: getTeamLogo(match, "home") }} style={styles.heroTeamLogoLeft} resizeMode="contain" />
                        ) : null}
                        {getTeamLogo(match, "away") ? (
                          <Image source={{ uri: getTeamLogo(match, "away") }} style={styles.heroTeamLogoRight} resizeMode="contain" />
                        ) : null}
                        <LinearGradient colors={["rgba(9,24,18,0.55)", "rgba(9,9,13,0.92)"]} style={StyleSheet.absoluteFill} />
                      </>
                    ) : (
                      <LinearGradient colors={["rgba(9,9,13,0.15)", "rgba(9,9,13,0.9)"]} style={StyleSheet.absoluteFill} />
                    )}
                    <View style={styles.heroContent}>
                      <Text style={styles.heroEyebrow}>{isSport ? "MATCHDAY PICK" : "CURATED PICK"}</Text>
                      <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
                      <Text style={styles.heroMeta}>{meta}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          {heroCandidates.length > 1 ? (
            <View style={styles.heroDots}>
              {heroCandidates.map((_, i) => (
                <View key={i} style={[styles.heroDot, i === heroPage && styles.heroDotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        {sportsEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SPORT</Text>
              <TouchableOpacity onPress={() => router.push("/sport")}>
                <Text style={styles.sectionActionLive}>Open match center</Text>
              </TouchableOpacity>
            </View>

            {sportsQuery.isLoading ? (
              <View style={styles.sportPreviewLoading}>
                <Text style={styles.emptyText}>Loading match center preview...</Text>
              </View>
            ) : null}

            {!sportsQuery.isLoading && sportsQuery.isError ? (
              <View style={styles.sportPreviewEmptyState}>
                <Text style={styles.emptyText}>Sport data kon niet geladen worden.</Text>
                <View style={styles.sportPreviewActions}>
                  <TouchableOpacity style={styles.sportActionBtn} onPress={() => sportsQuery.refetch()}>
                    <Text style={styles.sportActionBtnText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sportActionBtn, styles.sportActionBtnSecondary]} onPress={() => router.push("/sport")}>
                    <Text style={[styles.sportActionBtnText, styles.sportActionBtnTextSecondary]}>Open Matchday</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!sportsQuery.isLoading && !sportsQuery.isError && curatedSportsPool.length === 0 ? (
              <View style={styles.sportPreviewEmptyState}>
                <Text style={styles.emptyText}>Geen wedstrijden beschikbaar op dit moment.</Text>
                <View style={styles.sportPreviewActions}>
                  <TouchableOpacity style={styles.sportActionBtn} onPress={() => sportsQuery.refetch()}>
                    <Text style={styles.sportActionBtnText}>Refresh</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sportActionBtn, styles.sportActionBtnSecondary]} onPress={() => router.push("/sport")}>
                    <Text style={[styles.sportActionBtnText, styles.sportActionBtnTextSecondary]}>Pick date</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!sportsQuery.isLoading && !sportsQuery.isError && curatedSportsPool.length > 0 ? (
              <View style={styles.sportPreviewWrap}>
                {featuredMatch ? (
                  <>
                    <Text style={styles.sportSubSectionLabel}>Featured Match</Text>
                    <MatchStatusCard
                      match={featuredMatch}
                      onPress={() => openMatchDetail(featuredMatch)}
                    />
                  </>
                ) : null}

                {liveNowMatches.length > 0 ? (
                  <>
                    <Text style={styles.sportSubSectionLabel}>Live Now</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sportMatchRow}>
                      {liveNowMatches.map((match, idx) => (
                        <View key={`home_live_${String(match?.id || idx)}`} style={styles.sportPreviewCardWrap}>
                          <MatchStatusCard match={match} compact onPress={() => openMatchDetail(match)} />
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}

                {todayScheduleMatches.length > 0 ? (
                  <>
                    <Text style={styles.sportSubSectionLabel}>Today Matches</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sportMatchRow}>
                      {todayScheduleMatches.map((match, idx) => (
                        <View key={`home_today_${String(match?.id || idx)}`} style={styles.sportPreviewCardWrap}>
                          <MatchStatusCard match={match} compact onPress={() => openMatchDetail(match)} />
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        {sportsEnabled && (replayItems.length > 0 || highlightItems.length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>HIGHLIGHTS & REPLAYS</Text>
              <TouchableOpacity onPress={() => router.push("/highlights")}>
                <Text style={styles.sectionAction}>Open full feed</Text>
              </TouchableOpacity>
            </View>

            {replayItems.length > 0 && (
              <>
                <Text style={styles.subSectionLabel}>Replays</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {replayItems.map((item: any, idx: number) => {
                    const thumb = String(item?.thumbnail || "").trim();
                    return (
                      <TouchableOpacity key={`replay_${item?.id || idx}`} style={styles.highlightCard} activeOpacity={0.86} onPress={() => openReplay(item, String(item?.id || idx))}>
                        {thumb ? <Image source={{ uri: thumb }} style={styles.highlightThumb} resizeMode="cover" /> : <View style={styles.highlightThumbFallback} />}
                        <View style={styles.highlightOverlay}>
                          <View style={styles.highlightBadge}>
                            <Ionicons name="play-circle" size={12} color="#fff" />
                            <Text style={styles.highlightBadgeText}>Replay</Text>
                          </View>
                          <Text style={styles.highlightTitle} numberOfLines={2}>{String(item?.title || "Replay")}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {highlightItems.length > 0 && (
              <>
                <Text style={styles.subSectionLabel}>Highlights</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {highlightItems.map((item: any, idx: number) => {
                    const thumb = String(item?.thumbnail || "").trim();
                    return (
                      <TouchableOpacity key={`highlight_${item?.id || idx}`} style={styles.highlightCard} activeOpacity={0.86} onPress={() => openReplay(item, String(item?.id || idx))}>
                        {thumb ? <Image source={{ uri: thumb }} style={styles.highlightThumb} resizeMode="cover" /> : <View style={styles.highlightThumbFallback} />}
                        <View style={styles.highlightOverlay}>
                          <View style={styles.highlightBadge}>
                            <Ionicons name="star" size={11} color="#F9D923" />
                            <Text style={styles.highlightBadgeText}>Highlight</Text>
                          </View>
                          <Text style={styles.highlightTitle} numberOfLines={2}>{String(item?.title || "Highlight")}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>
        )}

        {moviesEnabled && (movieRail.length > 0 || mediaQuery.isLoading) && (
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
                  width={railCardWidth}
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
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.tmdbId || item.id), tmdbId: item.tmdbId ? String(item.tmdbId) : undefined, type: "movie", title: item.title } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {moviesEnabled && (seriesRail.length > 0 || mediaQuery.isLoading) && (
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
                  width={railCardWidth}
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
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.tmdbId || item.id), tmdbId: item.tmdbId ? String(item.tmdbId) : undefined, type: "series", title: item.title } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {moviesEnabled && releasesRail.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>NEW RELEASES</Text>
              <TouchableOpacity onPress={() => router.push("/films-series")}>
                <Text style={styles.sectionActionLive}>Live updated</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {releasesRail.map((item: any) => (
                <RealContentCard
                  key={`release_${item.type}_${item.id}`}
                  width={railCardWidth}
                  item={{
                    id: String(item.id),
                    title: item.title,
                    year: Number(item.year || 0),
                    imdb: Number(item.imdb || item.rating || 0),
                    quality: item.quality || "HD",
                    poster: item.poster || null,
                    backdrop: item.backdrop || null,
                    isTrending: true,
                  }}
                  isFavorite={isFavorite(String(item.id))}
                  onFavorite={() => toggleFavorite(String(item.id))}
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.tmdbId || item.id), tmdbId: item.tmdbId ? String(item.tmdbId) : undefined, type: item.type, title: item.title } })}
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
                  width={railCardWidth}
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
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.tmdbId || item.id), tmdbId: item.tmdbId ? String(item.tmdbId) : undefined, type: item.type, title: item.title } })}
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
  screen: { flex: 1, backgroundColor: COLORS.background },
  heroWrap: { paddingHorizontal: s(16), paddingTop: vs(12), marginBottom: vs(18) },
  heroCard: {
    minHeight: vs(214),
    borderRadius: ms(20),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: COLORS.card,
    justifyContent: "flex-end",
  },
  heroTeamLogoLeft: {
    position: "absolute",
    left: -s(24),
    top: "50%",
    width: s(180),
    height: s(180),
    marginTop: -s(90),
    opacity: 0.18,
  },
  heroTeamLogoRight: {
    position: "absolute",
    right: -s(24),
    top: "50%",
    width: s(180),
    height: s(180),
    marginTop: -s(90),
    opacity: 0.18,
  },
  heroContent: { padding: s(18), gap: ms(6) },
  heroDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  heroDotActive: {
    backgroundColor: COLORS.accent,
    width: 18,
    borderRadius: 3,
  },
  heroEyebrow: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: ms(11),
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
    fontSize: ms(24),
    lineHeight: ms(28),
  },
  heroMeta: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
  },
  section: { marginBottom: vs(10) },
  sectionHead: {
    paddingHorizontal: s(18),
    marginBottom: vs(10),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: ms(16),
    letterSpacing: 0.6,
  },
  sectionAction: { color: COLORS.accent, fontFamily: "Inter_600SemiBold", fontSize: ms(12) },
  sectionActionLive: { color: COLORS.live, fontFamily: "Inter_700Bold", fontSize: ms(12) },
  sportPreviewWrap: {
    gap: vs(8),
  },
  sportSubSectionLabel: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_700Bold",
    fontSize: ms(12),
    paddingHorizontal: s(18),
    marginTop: vs(6),
  },
  sportMatchRow: {
    paddingHorizontal: s(18),
    paddingBottom: vs(6),
  },
  sportPreviewCardWrap: {
    width: s(238),
    marginRight: s(10),
  },
  sportPreviewLoading: {
    paddingHorizontal: s(18),
    paddingVertical: vs(10),
  },
  sportPreviewEmptyState: {
    marginHorizontal: s(18),
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: ms(14),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: s(14),
    gap: vs(10),
  },
  sportPreviewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ms(8),
  },
  sportActionBtn: {
    borderRadius: ms(999),
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.35)",
    backgroundColor: "rgba(229,9,20,0.12)",
    paddingHorizontal: s(12),
    paddingVertical: vs(7),
  },
  sportActionBtnSecondary: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sportActionBtnText: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: ms(12),
  },
  sportActionBtnTextSecondary: {
    color: "#FFFFFF",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: ms(12),
    paddingHorizontal: s(18),
    paddingVertical: vs(12),
  },
  subSectionLabel: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(12),
    paddingHorizontal: s(18),
    marginBottom: vs(8),
  },
  highlightCard: {
    width: s(220),
    height: vs(126),
    borderRadius: ms(14),
    overflow: "hidden",
    backgroundColor: "#11131B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginRight: s(10),
  },
  highlightThumb: {
    ...StyleSheet.absoluteFillObject,
  },
  highlightThumbFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#161A24",
  },
  highlightOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: s(10),
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  highlightBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: ms(5),
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: ms(8),
    paddingHorizontal: s(8),
    paddingVertical: vs(4),
    marginBottom: vs(8),
  },
  highlightBadgeText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: ms(11),
  },
  highlightTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: ms(12),
    lineHeight: ms(16),
  },
  rail: { paddingHorizontal: s(18), paddingBottom: vs(8) },
});
