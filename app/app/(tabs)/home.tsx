/**
 * NEXORA Home — Premium Central Hub
 * Unified sport + media dashboard with cinematic identity
 */
import React, { useMemo, useState } from "react";
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
import { RealContentCard } from "@/components/RealContentCard";
import { useSportHomeFeed } from "@/features/sports/hooks/useSportHomeFeed";
import { getMatchdayYmd } from "@/lib/date/matchday";
import { buildVodHomeQuery, deriveCuratedHomeMedia } from "@/services/realtime-engine";
import { COLORS } from "@/constants/colors";

// ─── Types ──────────────────────────────────────────────────────────────────
type HomeCard = {
  id: string;
  title: string;
  type: "movie" | "series";
  poster?: string | null;
  backdrop?: string | null;
  imdb?: number;
  year?: number;
  quality?: string;
};

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

function mapVodCards(items: any[]): HomeCard[] {
  const seen = new Set<string>();
  const out: HomeCard[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.tmdbId || item?.id || "").trim();
    const title = String(item?.title || "").trim();
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
      imdb: Number(item?.rating || 0) || undefined,
      year: Number(item?.year || 0) || undefined,
      quality: String(item?.quality || "HD"),
    });
    if (out.length >= 14) break;
  }

  return out;
}

export default function HomeTabScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const sportQuery = useSportHomeFeed(true, getMatchdayYmd());
  const vodQuery = useQuery(buildVodHomeQuery(true));

  const liveMatches = useMemo(
    () => (sportQuery.live || []).map(normalizeSportMatch).filter((m) => resolveMatchVisualState(m) === "live"),
    [sportQuery.live],
  );
  const scheduleMatches = useMemo(
    () => [...(sportQuery.upcoming || []), ...(sportQuery.finished || [])].map(normalizeSportMatch).slice(0, 10),
    [sportQuery.finished, sportQuery.upcoming],
  );

  const heroMatch = liveMatches[0] ?? null;

  const mediaCards = useMemo(() => {
    const media = deriveCuratedHomeMedia(vodQuery.data);
    const merged = [...(media.movies || []), ...(media.series || []), ...(media.newReleases || [])];
    return mapVodCards(merged);
  }, [vodQuery.data]);

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
        {/* Hero — featured live match, only if live data exists */}
        {heroMatch ? (
          <HeroMatchCard match={heroMatch} onPress={() => handleMatchPress(heroMatch)} />
        ) : null}

        {/* Compact metrics strip */}
        <MetricStrip
          live={liveMatches.length}
          total={totalMatches}
          media={mediaCards.length}
        />

        {/* ── SPORT ─────────────────────────────────── */}
        <HomeSection
          title="SPORT"
          action="Alle wedstrijden"
          onAction={() => router.push("/sport")}
        >
          {sportQuery.isLoading ? (
            <HRail>
              {[1, 2, 3].map((k) => <SkeletonMatchCard key={k} />)}
            </HRail>
          ) : liveMatches.length || scheduleMatches.length ? (
            <HRail>
              {/* Skip first live match if already used as hero */}
              {liveMatches.slice(heroMatch ? 1 : 0, 8).map((m) => (
                <LiveMatchCard key={m.id} match={m} onPress={() => handleMatchPress(m)} />
              ))}
              {scheduleMatches.map((m) => (
                <MatchCard key={m.id} match={m} onPress={() => handleMatchPress(m)} />
              ))}
            </HRail>
          ) : (
            <EmptyStrip
              icon="football-outline"
              title="Geen wedstrijden vandaag"
              subtitle="Trek omlaag om te herladen."
            />
          )}
        </HomeSection>

        {/* ── FILMS & SERIES ────────────────────────── */}
        <HomeSection
          title="FILMS & SERIES"
          action="Ontdekken"
          onAction={() => router.push("/films-series")}
        >
          {vodQuery.isLoading ? (
            <HRail>
              {[1, 2, 3, 4].map((k) => (
                <View key={k} style={styles.posterSkeleton} />
              ))}
            </HRail>
          ) : mediaCards.length ? (
            <HRail>
              {mediaCards.map((item) => (
                <RealContentCard
                  key={item.id}
                  width={130}
                  item={{
                    id: item.id,
                    title: item.title,
                    year: item.year || 0,
                    imdb: item.imdb || 0,
                    quality: item.quality || "HD",
                    poster: item.poster,
                    backdrop: item.backdrop,
                  }}
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
              title="Media tijdelijk niet beschikbaar"
              subtitle="Open Films & Series om te bladeren."
              cta="Open hub"
              onPress={() => router.push("/films-series")}
            />
          )}
        </HomeSection>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricStrip({
  live,
  total,
  media,
}: {
  live: number;
  total: number;
  media: number;
}) {
  return (
    <View style={styles.metricStrip}>
      <MetricItem label="Live" value={live} tone="live" />
      <View style={styles.metricDivider} />
      <MetricItem label="Vandaag" value={total} />
      <View style={styles.metricDivider} />
      <MetricItem label="Films/Series" value={media} />
    </View>
  );
}

function MetricItem({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "live";
}) {
  return (
    <View style={styles.metricItem}>
      <Text style={[styles.metricValue, tone === "live" && styles.metricValueLive]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, tone === "live" && styles.metricLabelLive]}>
        {label}
      </Text>
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

// ─── Styles ──────────────────────────────────────────────────────────────────
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

  // ─ Metric strip ─
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
  metricValueLive: {
    color: COLORS.live,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricLabelLive: {
    color: COLORS.live,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.glassBorder,
  },

  // ─ Sections ─
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

  // ─ Rail ─
  hRail: {
    paddingRight: 12,
    gap: 12,
  },

  // ─ Poster skeleton ─
  posterSkeleton: {
    width: 130,
    height: 195,
    borderRadius: 12,
    backgroundColor: COLORS.skeleton,
  },

  // ─ Empty strip ─
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
