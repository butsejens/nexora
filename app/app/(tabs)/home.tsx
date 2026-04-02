import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import { NexoraHeader } from "@/components/NexoraHeader";
import {
  LiveMatchCard,
  MatchCard,
  normalizeSportMatch,
  resolveMatchVisualState,
  type PremiumSportMatch,
} from "@/components/sports/SportCards";
import { RealContentCard } from "@/components/RealContentCard";
import { useSportHomeFeed } from "@/features/sports/hooks/useSportHomeFeed";
import { getMatchdayYmd } from "@/lib/date/matchday";
import { buildVodHomeQuery, deriveCuratedHomeMedia } from "@/services/realtime-engine";
import { COLORS } from "@/constants/colors";

type HomeRailCard = {
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

function mapVodCards(items: any[]): HomeRailCard[] {
  const seen = new Set<string>();
  const out: HomeRailCard[] = [];

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
    () => [...(sportQuery.upcoming || []), ...(sportQuery.finished || [])].map(normalizeSportMatch).slice(0, 8),
    [sportQuery.finished, sportQuery.upcoming],
  );

  const mediaPool = useMemo(() => {
    const media = deriveCuratedHomeMedia(vodQuery.data);
    const merged = [...(media.movies || []), ...(media.series || []), ...(media.newReleases || [])];
    return mapVodCards(merged);
  }, [vodQuery.data]);

  const hasNoData =
    liveMatches.length === 0 &&
    scheduleMatches.length === 0 &&
    mediaPool.length === 0 &&
    !sportQuery.isLoading &&
    !vodQuery.isLoading;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([sportQuery.refetch(), vodQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />}
      >
        <View style={styles.kpiRow}>
          <StatCard label="Live now" value={String(liveMatches.length)} tone="live" />
          <StatCard label="Today" value={String((sportQuery.live || []).length + (sportQuery.upcoming || []).length + (sportQuery.finished || []).length)} />
          <StatCard label="Films/Series" value={String(mediaPool.length)} />
        </View>

        <SectionHeader title="SPORT" action="Open match center" onPress={() => router.push("/sport")} />
        {liveMatches.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {liveMatches.slice(0, 8).map((match) => (
              <LiveMatchCard
                key={match.id}
                match={match}
                onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
              />
            ))}
          </ScrollView>
        ) : (
          <PanelMessage
            title="Geen live wedstrijden nu"
            subtitle="Live kaarten verschijnen automatisch zodra een wedstrijd start."
            cta="Open sport"
            onPress={() => router.push("/sport")}
          />
        )}

        <SectionHeader title="TODAY" />
        {scheduleMatches.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {scheduleMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
              />
            ))}
          </ScrollView>
        ) : (
          <PanelMessage title="Nog geen schema-data" subtitle="Trek naar beneden om opnieuw te laden." />
        )}

        <SectionHeader title="FILMS & SERIES" action="Open hub" onPress={() => router.push("/films-series")} />
        {vodQuery.isLoading ? (
          <PanelMessage title="Media laden…" subtitle="Films en series worden geladen." />
        ) : mediaPool.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {mediaPool.map((item) => (
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
                    params: {
                      id: String(item.id),
                      type: item.type,
                      title: item.title,
                    },
                  })
                }
              />
            ))}
          </ScrollView>
        ) : (
          <PanelMessage title="Geen media beschikbaar" subtitle="Open de Films & Series hub om te bladeren." cta="Open hub" onPress={() => router.push("/films-series")} />
        )}

        {hasNoData ? (
          <PanelMessage
            title="Data tijdelijk niet beschikbaar"
            subtitle="De app blijft bruikbaar. Probeer opnieuw of open de modules direct."
            cta="Herladen"
            onPress={handleRefresh}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "live" }) {
  return (
    <View style={[styles.statCard, tone === "live" && styles.liveStatCard]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statLabel, tone === "live" && styles.liveStatLabel]}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function PanelMessage({
  title,
  subtitle,
  cta,
  onPress,
}: {
  title: string;
  subtitle: string;
  cta?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
      {cta && onPress ? (
        <TouchableOpacity style={styles.panelButton} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.panelButtonText}>{cta}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#040508",
  },
  content: {
    paddingHorizontal: 16,
    gap: 18,
  },
  kpiRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minHeight: 90,
    borderRadius: 16,
    backgroundColor: "#0A1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    justifyContent: "space-between",
  },
  liveStatCard: {
    backgroundColor: "#052115",
    borderColor: "rgba(34,197,94,0.25)",
  },
  statValue: {
    color: "#F8FAFC",
    fontSize: 32,
    fontFamily: "Inter_800ExtraBold",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  liveStatLabel: {
    color: "#4ADE80",
  },
  sectionHeader: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 33,
    letterSpacing: 0.3,
    fontFamily: "Inter_800ExtraBold",
  },
  sectionAction: {
    color: "#E50914",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  rail: {
    paddingRight: 12,
    paddingBottom: 4,
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#090D15",
    padding: 16,
    gap: 6,
  },
  panelTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  panelSubtitle: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_500Medium",
  },
  panelButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(229,9,20,0.16)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.4)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  panelButtonText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
