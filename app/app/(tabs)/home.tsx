/**
 * NEXORA Home — Premium Central Hub
 * Unified sport + media dashboard with rotating hero recommendations.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import { NexoraHeader } from "@/components/NexoraHeader";
import {
  HeroMatchCard,
  LiveMatchCard,
  MatchCard,
  SkeletonMatchCard,
  normalizeSportMatch,
  resolveMatchVisualState,
  type PremiumSportMatch,
} from "@/components/sports/SportCards";
import { RealContentCard, RealHeroBanner } from "@/components/RealContentCard";
import { useSportHomeFeed } from "@/features/sports/hooks/useSportHomeFeed";
import { getMatchdayYmd } from "@/lib/date/matchday";
import { buildVodHomeQuery } from "@/services/realtime-engine";
import { COLORS } from "@/constants/colors";

type HomeCard = {
  id: string;
  title: string;
  type: "movie" | "series";
  poster?: string | null;
  backdrop?: string | null;
  imdb?: number;
  rottenTomatoes?: string | null;
  year?: number;
  quality?: string;
  synopsis?: string;
  genre?: string[];
};

type HeroSlide =
  | { id: string; kind: "match"; match: PremiumSportMatch }
  | { id: string; kind: "media"; media: HomeCard };

function toMatchParams(match: PremiumSportMatch) {
  return {
    matchId: String(match.id || ""),
    homeTeam: String(match.homeTeam || "Home"),
    awayTeam: String(match.awayTeam || "Away"),
    homeTeamId: String(match.homeTeamId || ""),
    awayTeamId: String(match.awayTeamId || ""),
    homeTeamLogo: String(match.homeTeamLogo || ""),
    awayTeamLogo: String(match.awayTeamLogo || ""),
    homeScore: String(match.homeScore ?? 0),
    awayScore: String(match.awayScore ?? 0),
    league: String(match.league || "Competition"),
    espnLeague: String(match.espnLeague || ""),
    minute: String(match.minute ?? ""),
    status: String(match.status || "upcoming"),
    statusDetail: String(match.statusDetail || ""),
    sport: String(match.sport || "soccer"),
    startDate: String(match.startDate || ""),
  };
}

function mapVodCards(items: any[], limit = 14): HomeCard[] {
  const seen = new Set<string>();
  const out: HomeCard[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.tmdbId || item?.id || "").trim();
    const title = String(item?.title || item?.name || "").trim();
    const type = String(item?.type || "movie") === "series" ? "series" : "movie";
    const key = `${type}:${id || title}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: id || key,
      title,
      type,
      poster: item?.poster || null,
      backdrop: item?.backdrop || null,
      imdb: Number(item?.imdb || item?.rating || 0) || undefined,
      rottenTomatoes: item?.rottenTomatoes || null,
      year: Number(item?.year || 0) || undefined,
      quality: String(item?.quality || "HD"),
      synopsis: String(item?.synopsis || item?.overview || "").trim() || undefined,
      genre: Array.isArray(item?.genre) ? item.genre.filter(Boolean).slice(0, 3) : undefined,
    });
    if (out.length >= limit) break;
  }

  return out;
}

function dedupeHeroSlides(items: HeroSlide[]) {
  const seen = new Set<string>();
  const out: HeroSlide[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function toHeroCardItem(item: HomeCard) {
  return {
    id: item.id,
    title: item.title,
    year: item.year || 0,
    imdb: item.imdb || 0,
    quality: item.quality || "HD",
    poster: item.poster,
    backdrop: item.backdrop,
    synopsis: item.synopsis,
    genre: item.genre,
  };
}

export default function HomeTabScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  const sportQuery = useSportHomeFeed(true, getMatchdayYmd());
  const vodQuery = useQuery(buildVodHomeQuery(true));

  const liveMatches = useMemo(
    () => (sportQuery.live || []).map(normalizeSportMatch).filter((m) => resolveMatchVisualState(m) === "live"),
    [sportQuery.live],
  );
  const upcomingMatches = useMemo(
    () => (sportQuery.upcoming || []).map(normalizeSportMatch).slice(0, 8),
    [sportQuery.upcoming],
  );
  const finishedMatches = useMemo(
    () => (sportQuery.finished || []).map(normalizeSportMatch).slice(0, 8),
    [sportQuery.finished],
  );
  const highlightMatches = useMemo(
    () => [...liveMatches, ...upcomingMatches].slice(0, 12),
    [liveMatches, upcomingMatches],
  );
  const replayMatches = useMemo(
    () => finishedMatches.slice(0, 12),
    [finishedMatches],
  );

  const featuredCard = useMemo(
    () => mapVodCards(vodQuery.data?.featured ? [vodQuery.data.featured] : [], 1)[0] ?? null,
    [vodQuery.data?.featured],
  );
  const topMovieCards = useMemo(
    () => mapVodCards(vodQuery.data?.topRatedMovies || vodQuery.data?.trendingMovies || [], 10),
    [vodQuery.data?.topRatedMovies, vodQuery.data?.trendingMovies],
  );
  const topSeriesCards = useMemo(
    () => mapVodCards(vodQuery.data?.topRatedSeries || vodQuery.data?.trendingSeries || [], 10),
    [vodQuery.data?.topRatedSeries, vodQuery.data?.trendingSeries],
  );
  const recommendedCards = useMemo(
    () => mapVodCards(
      [
        ...(vodQuery.data?.recentMovies || []),
        ...(vodQuery.data?.recentSeries || []),
        ...(vodQuery.data?.trendingMovies || []),
        ...(vodQuery.data?.trendingSeries || []),
      ],
      18,
    ),
    [vodQuery.data?.recentMovies, vodQuery.data?.recentSeries, vodQuery.data?.trendingMovies, vodQuery.data?.trendingSeries],
  );

  const heroSlides = useMemo(() => {
    const slides: HeroSlide[] = [];

    if (liveMatches[0]) {
      slides.push({ id: `match:${liveMatches[0].id}`, kind: "match", match: liveMatches[0] });
    } else if (upcomingMatches[0]) {
      slides.push({ id: `match:${upcomingMatches[0].id}`, kind: "match", match: upcomingMatches[0] });
    }

    for (const mediaItem of [
      featuredCard,
      topMovieCards[0],
      topSeriesCards[0],
      recommendedCards[0],
      recommendedCards[1],
    ]) {
      if (!mediaItem) continue;
      slides.push({ id: `media:${mediaItem.type}:${mediaItem.id}`, kind: "media", media: mediaItem });
    }

    return dedupeHeroSlides(slides);
  }, [featuredCard, liveMatches, recommendedCards, topMovieCards, topSeriesCards, upcomingMatches]);

  useEffect(() => {
    setHeroIndex(0);
  }, [heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const activeHero = heroSlides[heroIndex] || null;
  const totalMatches =
    (sportQuery.live?.length || 0) +
    (sportQuery.upcoming?.length || 0) +
    (sportQuery.finished?.length || 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([sportQuery.refetch(), vodQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMatchPress = (match: PremiumSportMatch) =>
    router.push({ pathname: "/match-detail", params: toMatchParams(match) });

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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 92 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {activeHero ? (
          <View style={styles.heroSection}>
            {activeHero.kind === "match" ? (
              <HeroMatchCard match={activeHero.match} onPress={() => handleMatchPress(activeHero.match)} />
            ) : (
              <RealHeroBanner
                item={toHeroCardItem(activeHero.media)}
                onPlay={() =>
                  router.push({
                    pathname: "/detail",
                    params: { id: activeHero.media.id, type: activeHero.media.type, title: activeHero.media.title },
                  })
                }
                onInfo={() =>
                  router.push({
                    pathname: "/detail",
                    params: { id: activeHero.media.id, type: activeHero.media.type, title: activeHero.media.title },
                  })
                }
              />
            )}

            {heroSlides.length > 1 ? (
              <View style={styles.heroPager}>
                {heroSlides.map((slide, index) => (
                  <View key={slide.id} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <MetricStrip
          items={[
            { label: "Highlights", value: totalMatches },
            { label: "Replays", value: replayMatches.length },
            { label: "Top 10", value: topMovieCards.length + topSeriesCards.length },
          ]}
        />

        <HomeSection
          title="SPORT HIGHLIGHTS"
          action="Alle highlights"
          onAction={() => router.push("/highlights")}
        >
          {sportQuery.isLoading ? (
            <HRail>
              {[1, 2, 3].map((k) => <SkeletonMatchCard key={k} />)}
            </HRail>
          ) : highlightMatches.length ? (
            <HRail>
              {highlightMatches.map((match) => {
                const visualState = resolveMatchVisualState(match);
                if (visualState === "live") {
                  return <LiveMatchCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                }
                return <MatchCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
              })}
            </HRail>
          ) : (
            <EmptyStrip
              icon="football-outline"
              title="Geen sport-highlights beschikbaar"
              subtitle="Nieuwe live en komende momenten verschijnen hier automatisch."
            />
          )}
        </HomeSection>

        <HomeSection
          title="SPORT REPLAYS"
          action="Alle replays"
          onAction={() => router.push("/highlights")}
        >
          {sportQuery.isLoading ? (
            <HRail>
              {[1, 2, 3].map((k) => <SkeletonMatchCard key={`replay-${k}`} />)}
            </HRail>
          ) : replayMatches.length ? (
            <HRail>
              {replayMatches.map((match) => (
                <MatchCard key={`replay-${match.id}`} match={match} onPress={() => handleMatchPress(match)} />
              ))}
            </HRail>
          ) : (
            <EmptyStrip
              icon="play-back-outline"
              title="Geen replays beschikbaar"
              subtitle="Afgelopen wedstrijden komen hier zodra highlights zijn verwerkt."
            />
          )}
        </HomeSection>

        <HomeSection
          title="FILMS TOP 10"
          action="Alle films"
          onAction={() => router.push("/media/movies")}
        >
          {vodQuery.isLoading ? (
            <HRail>
              {[1, 2, 3, 4].map((k) => (
                <View key={k} style={styles.posterSkeleton} />
              ))}
            </HRail>
          ) : topMovieCards.length ? (
            <HRail>
              {topMovieCards.map((item, index) => (
                <RankedRailCard
                  key={`movie:${item.id}`}
                  rank={index + 1}
                  item={item}
                  onPress={() =>
                    router.push({
                      pathname: "/detail",
                      params: { id: item.id, type: item.type, title: item.title },
                    })
                  }
                />
              ))}
            </HRail>
          ) : (
            <EmptyStrip
              icon="film-outline"
              title="Films laden nog"
              subtitle="De top 10 verschijnt zodra de catalogus volledig is gesynchroniseerd."
            />
          )}
        </HomeSection>

        <HomeSection
          title="SERIES TOP 10"
          action="Alle series"
          onAction={() => router.push("/media/series")}
        >
          {vodQuery.isLoading ? (
            <HRail>
              {[1, 2, 3, 4].map((k) => (
                <View key={k} style={styles.posterSkeleton} />
              ))}
            </HRail>
          ) : topSeriesCards.length ? (
            <HRail>
              {topSeriesCards.map((item, index) => (
                <RankedRailCard
                  key={`series:${item.id}`}
                  rank={index + 1}
                  item={item}
                  onPress={() =>
                    router.push({
                      pathname: "/detail",
                      params: { id: item.id, type: item.type, title: item.title },
                    })
                  }
                />
              ))}
            </HRail>
          ) : (
            <EmptyStrip
              icon="tv-outline"
              title="Series laden nog"
              subtitle="De top 10 van series verschijnt zodra metadata klaarstaat."
            />
          )}
        </HomeSection>
      </ScrollView>
    </View>
  );
}

function MetricStrip({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  return (
    <View style={styles.metricStrip}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          <MetricItem label={item.label} value={item.value} />
          {index < items.length - 1 ? <View style={styles.metricDivider} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function MetricItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RankedRailCard({
  rank,
  item,
  onPress,
}: {
  rank: number;
  item: HomeCard;
  onPress: () => void;
}) {
  return (
    <View style={styles.rankCardWrap}>
      <Text style={styles.rankNumber}>{rank}</Text>
      <View style={styles.rankCardInner}>
        <RealContentCard
          width={124}
          item={{
            id: item.id,
            title: item.title,
            year: item.year || 0,
            imdb: item.imdb || 0,
            quality: item.quality || "HD",
            poster: item.poster,
            backdrop: item.backdrop,
          }}
          onPress={onPress}
        />
      </View>
    </View>
  );
}

function HomeSection({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {action && onAction ? (
          <TouchableOpacity onPress={onAction} activeOpacity={0.8} style={styles.sectionActionBtn}>
            <Text style={styles.sectionActionText}>{action}</Text>
            <Ionicons name="chevron-forward" size={13} color={COLORS.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function HRail({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hRail}
    >
      {children}
    </ScrollView>
  );
}

function EmptyStrip({
  icon,
  title,
  subtitle,
  cta,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  cta?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.emptyStrip}>
      <Ionicons name={icon} size={26} color={COLORS.textMuted} />
      <View style={styles.emptyText}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptySubtitle}>{subtitle}</Text>
      </View>
      {cta && onPress ? (
        <TouchableOpacity style={styles.emptyBtn} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.emptyBtnText}>{cta}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 22,
  },
  heroSection: {
    gap: 10,
  },
  heroPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -6,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroDotActive: {
    width: 24,
    backgroundColor: COLORS.accent,
  },
  metricStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 26,
    fontFamily: "Inter_800ExtraBold",
    lineHeight: 30,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.glassBorder,
  },
  section: {
    gap: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.6,
  },
  sectionActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sectionActionText: {
    color: COLORS.accent,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  hRail: {
    paddingRight: 12,
    gap: 12,
  },
  rankCardWrap: {
    position: "relative",
    paddingLeft: 26,
  },
  rankCardInner: {
    minHeight: 220,
    justifyContent: "flex-end",
  },
  rankNumber: {
    position: "absolute",
    left: 0,
    bottom: 8,
    color: COLORS.text,
    fontSize: 62,
    lineHeight: 62,
    fontFamily: "Inter_800ExtraBold",
    opacity: 0.9,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  posterSkeleton: {
    width: 130,
    height: 195,
    borderRadius: 12,
    backgroundColor: COLORS.skeleton,
  },
  emptyStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 16,
  },
  emptyText: {
    flex: 1,
    gap: 3,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },
  emptyBtn: {
    backgroundColor: COLORS.accentGlow,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
