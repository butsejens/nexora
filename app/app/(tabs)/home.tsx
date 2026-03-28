import React, { useMemo, useState, useCallback, useEffect } from "react";
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
import { Ionicons } from "@expo/vector-icons";

import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { NexoraHeader } from "@/components/NexoraHeader";
import { RealContentCard } from "@/components/RealContentCard";
import { MatchRowCard } from "@/components/premium";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { useFollowState, useWatchProgress } from "@/context/UserStateContext";
import {
  buildContinueWatchingRows,
  buildHighlightsQuery,
  buildHomeSportsQuery,
  buildVodHomeQuery,
  deriveCuratedHomeMedia,
} from "@/services/realtime-engine";
import { useOnboardingStore } from "@/store/onboarding-store";
import { resolveMatchCompetitionLabel, resolveMatchEspnLeagueCode } from "@/lib/sports-competition";
import {
  loadMatchInteractions,
  rankMatchesForUser,
  recordMatchInteraction,
  selectHighlightsForFeed,
} from "@/lib/ai";

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [matchInteractions, setMatchInteractions] = useState<any>(null);

  const sportsQuery = useQuery(buildHomeSportsQuery(todayUTC(), sportsEnabled));
  const mediaQuery = useQuery(buildVodHomeQuery(moviesEnabled));
  const highlightsQuery = useQuery(buildHighlightsQuery(sportsEnabled));

  const mediaData = deriveCuratedHomeMedia(mediaQuery.data);

  const continueWatching = useMemo(() => {
    return buildContinueWatchingRows(watchHistory as any, syncedContinueWatching as any, 8);
  }, [syncedContinueWatching, watchHistory]);

  useEffect(() => {
    let mounted = true;
    loadMatchInteractions().then((value) => {
      if (mounted) setMatchInteractions(value);
    }).catch(() => {
      if (mounted) setMatchInteractions(null);
    });
    return () => { mounted = false; };
  }, []);

  const liveMatches = useMemo(() => (sportsEnabled ? (sportsQuery.data?.live || []) : []), [sportsEnabled, sportsQuery.data?.live]);
  const upcomingMatches = useMemo(() => (sportsEnabled ? (sportsQuery.data?.upcoming || []) : []), [sportsEnabled, sportsQuery.data?.upcoming]);
  const allSmartCandidates = useMemo(
    () => (sportsEnabled ? [...liveMatches, ...upcomingMatches] : []),
    [liveMatches, sportsEnabled, upcomingMatches],
  );
  const favoriteTeamNames = [
    ...followedTeams.map((team) => String(team?.teamName || "")),
    ...selectedTeams.map((team) => String(team?.name || "")),
  ].filter(Boolean);
  const preferredLeagues = selectedCompetitions.map((competition) => String(competition?.name || competition?.id || "")).filter(Boolean);
  const rankedSmartFeed = useMemo(() => {
    return rankMatchesForUser({
      matches: allSmartCandidates,
      favoriteTeams: favoriteTeamNames,
      preferredLeagues,
      interactions: matchInteractions,
    }).slice(0, 6);
  }, [allSmartCandidates, favoriteTeamNames, preferredLeagues, matchInteractions]);
  const todayMatches = rankedSmartFeed.slice(0, 3).map((entry) => entry.match);

  const [notifiedMatchIds, setNotifiedMatchIds] = useState<Set<string>>(new Set());
  const toggleMatchNotification = useCallback((matchId: string) => {
    setNotifiedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) { next.delete(matchId); } else { next.add(matchId); }
      return next;
    });
  }, []);
  const movieRail = moviesEnabled ? (mediaData?.movies || []).slice(0, 8) : [];
  const seriesRail = moviesEnabled ? (mediaData?.series || []).slice(0, 8) : [];
  const releasesRail = moviesEnabled ? (mediaData?.newReleases || []).slice(0, 8) : [];
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

  const heroSport = sportsEnabled ? (rankedSmartFeed[0]?.match || liveMatches[0] || upcomingMatches[0]) : null;
  const heroMedia = moviesEnabled ? (movieRail[0] || seriesRail[0] || null) : null;
  const heroIsSport = Boolean(heroSport);

  const heroTitle = heroIsSport
    ? `${getTeamName(heroSport?.homeTeam, "Home")} vs ${getTeamName(heroSport?.awayTeam, "Away")}`
    : String(heroMedia?.title || "Welcome to NEXORA");

  const heroMeta = heroIsSport
    ? `AI Matchday Pick · ${resolveMatchCompetitionLabel(heroSport)}`
    : `${heroMedia?.type === "series" ? "Series" : "Film"}${heroMedia?.year ? ` · ${heroMedia.year}` : ""}`;

  const heroImage = heroIsSport ? null : (heroMedia?.backdrop || heroMedia?.poster || null);

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
    void recordMatchInteraction(match).then(() => loadMatchInteractions().then(setMatchInteractions).catch(() => undefined)).catch(() => undefined);
    router.push({ pathname: "/match-detail", params: toMatchParams(match) });
  }, []);

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
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (heroIsSport && heroSport) {
                openMatchDetail(heroSport);
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
              {heroIsSport && heroSport ? (
                <>
                  {getTeamLogo(heroSport, "home") ? (
                    <Image
                      source={{ uri: getTeamLogo(heroSport, "home") }}
                      style={styles.heroTeamLogoLeft}
                      resizeMode="contain"
                    />
                  ) : null}
                  {getTeamLogo(heroSport, "away") ? (
                    <Image
                      source={{ uri: getTeamLogo(heroSport, "away") }}
                      style={styles.heroTeamLogoRight}
                      resizeMode="contain"
                    />
                  ) : null}
                  <LinearGradient
                    colors={["rgba(9,24,18,0.55)", "rgba(9,9,13,0.92)"]}
                    style={StyleSheet.absoluteFill}
                  />
                </>
              ) : (
                <LinearGradient colors={["rgba(9,9,13,0.15)", "rgba(9,9,13,0.9)"]} style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.heroContent}>
                <Text style={styles.heroEyebrow}>{heroIsSport ? "MATCHDAY PICK" : "CURATED PICK"}</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>{heroTitle}</Text>
                <Text style={styles.heroMeta}>{heroMeta}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {sportsEnabled && rankedSmartFeed.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SMART MATCH FEED</Text>
              <TouchableOpacity onPress={() => router.push("/sport")}>
                <Text style={styles.sectionAction}>AI powered</Text>
              </TouchableOpacity>
            </View>
            {rankedSmartFeed.slice(0, 4).map((entry: any) => (
              <View key={`smart_${String(entry?.match?.id || "")}`} style={styles.smartCardWrap}>
                <MatchRowCard
                  match={{
                    id: String(entry?.match?.id || ""),
                    homeTeam: getTeamName(entry?.match?.homeTeam, "Home"),
                    awayTeam: getTeamName(entry?.match?.awayTeam, "Away"),
                    homeTeamLogo: getTeamLogo(entry?.match, "home"),
                    awayTeamLogo: getTeamLogo(entry?.match, "away"),
                    homeScore: getScore(entry?.match, "home"),
                    awayScore: getScore(entry?.match, "away"),
                    status: String(entry?.match?.status || "upcoming") as any,
                    minute: Number(entry?.match?.minute ?? 0),
                    startTime: String(entry?.match?.startDate || entry?.match?.startTime || ""),
                    league: resolveMatchCompetitionLabel(entry?.match),
                    espnLeague: resolveMatchEspnLeagueCode(entry?.match),
                    sport: String(entry?.match?.sport || "football"),
                    possession: entry?.match?.possession,
                    redCards: entry?.match?.redCards,
                  }}
                  onPress={() => openMatchDetail(entry?.match)}
                />
                <View style={styles.smartReasonRow}>
                  {entry?.isTrending ? <Text style={styles.smartReasonTag}>Trending</Text> : null}
                  {entry?.isUpsetPotential ? <Text style={styles.smartReasonTag}>Upset Potential</Text> : null}
                  {(entry?.reasons || []).slice(0, 2).map((reason: string) => (
                    <Text key={`${String(entry?.match?.id || "")}_${reason}`} style={styles.smartReasonTag}>{reason}</Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {sportsEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>SPORT</Text>
              <TouchableOpacity onPress={() => router.push("/sport")}>
                <Text style={styles.sectionAction}>Open match center</Text>
              </TouchableOpacity>
            </View>
            {todayMatches.length > 0 ? todayMatches.map((match: any) => (
              <MatchRowCard
                key={String(match?.id || `${match?.homeTeam}_${match?.awayTeam}`)}
                match={{
                  id: String(match?.id || ""),
                  homeTeam: getTeamName(match?.homeTeam, "Home"),
                  awayTeam: getTeamName(match?.awayTeam, "Away"),
                  homeTeamLogo: getTeamLogo(match, "home"),
                  awayTeamLogo: getTeamLogo(match, "away"),
                  homeScore: getScore(match, "home"),
                  awayScore: getScore(match, "away"),
                  status: String(match?.status || "upcoming") as any,
                  minute: Number(match?.minute ?? 0),
                  startTime: String(match?.startDate || match?.startTime || ""),
                  league: resolveMatchCompetitionLabel(match),
                  espnLeague: resolveMatchEspnLeagueCode(match),
                  sport: String(match?.sport || "football"),
                }}
                onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                onNotificationToggle={() => toggleMatchNotification(String(match?.id || ""))}
                isNotificationOn={notifiedMatchIds.has(String(match?.id || ""))}
              />
            )) : <Text style={styles.emptyText}>No live or upcoming matches available right now.</Text>}
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

        {moviesEnabled && releasesRail.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>NEW RELEASES</Text>
              <TouchableOpacity onPress={() => router.push("/films-series")}>
                <Text style={styles.sectionAction}>Live updated</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {releasesRail.map((item: any) => (
                <RealContentCard
                  key={`release_${item.type}_${item.id}`}
                  width={122}
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
                  onPress={() => router.push({ pathname: "/detail", params: { id: String(item.id), type: item.type, title: item.title } })}
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
  screen: { flex: 1, backgroundColor: COLORS.background },
  heroWrap: { paddingHorizontal: 16, paddingTop: 12, marginBottom: 18 },
  heroCard: {
    minHeight: 214,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: COLORS.card,
    justifyContent: "flex-end",
  },
  heroTeamLogoLeft: {
    position: "absolute",
    left: -24,
    top: "50%",
    width: 180,
    height: 180,
    marginTop: -90,
    opacity: 0.18,
  },
  heroTeamLogoRight: {
    position: "absolute",
    right: -24,
    top: "50%",
    width: 180,
    height: 180,
    marginTop: -90,
    opacity: 0.18,
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
  smartCardWrap: {
    marginBottom: 8,
  },
  smartReasonRow: {
    paddingHorizontal: 18,
    marginTop: -2,
    marginBottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  smartReasonTag: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    backgroundColor: "rgba(229,9,20,0.16)",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  subSectionLabel: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  highlightCard: {
    width: 220,
    height: 126,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#11131B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginRight: 10,
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
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  highlightBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  highlightBadgeText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  highlightTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    lineHeight: 16,
  },
  rail: { paddingHorizontal: 18, paddingBottom: 8 },
});
