import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";

import { NexoraHeader } from "@/components/NexoraHeader";
import {
  EmptySection,
  FinishedMatchCard,
  LiveMatchCard,
  MatchCard,
  normalizeSportMatch,
  resolveMatchVisualState,
  type PremiumSportMatch,
} from "@/components/sports/SportCards";
import { getMatchdayYmd, shiftYmd } from "@/lib/date/matchday";
import { useExploreMatches, useLiveMatches, useMatchdayMatches } from "@/features/sports/hooks/useSportHomeFeed";
import { COLORS } from "@/constants/colors";

type SportPane = "explore" | "live" | "matchday";

type SportModuleHubProps = {
  initialPane?: SportPane;
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

function formatDateLabel(dateYmd: string) {
  const ts = Date.parse(`${dateYmd}T12:00:00`);
  if (!Number.isFinite(ts)) return dateYmd;
  return new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short" }).format(new Date(ts));
}

function uniqueById(matches: PremiumSportMatch[]) {
  const seen = new Set<string>();
  return matches.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function SportModuleHub({ initialPane = "explore" }: SportModuleHubProps) {
  const [pane, setPane] = useState<SportPane>(initialPane);
  const [dateYmd, setDateYmd] = useState(getMatchdayYmd());
  const [refreshing, setRefreshing] = useState(false);

  const liveQuery = useLiveMatches(true);
  const dayQuery = useMatchdayMatches(dateYmd, true);
  const exploreQuery = useExploreMatches(dateYmd, true);

  const live = useMemo(() => uniqueById((liveQuery.live || []).map(normalizeSportMatch)), [liveQuery.live]);
  const matchday = useMemo(
    () => uniqueById([...(dayQuery.live || []), ...(dayQuery.upcoming || []), ...(dayQuery.finished || [])].map(normalizeSportMatch)),
    [dayQuery.finished, dayQuery.live, dayQuery.upcoming],
  );
  const explore = useMemo(() => uniqueById((exploreQuery.matches || []).map(normalizeSportMatch)), [exploreQuery.matches]);

  const finished = useMemo(
    () => matchday.filter((m) => resolveMatchVisualState(m) === "finished").slice(0, 10),
    [matchday],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([liveQuery.refetch(), dayQuery.refetch(), exploreQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <NexoraHeader
        variant="module"
        title="SPORT"
        titleColor={COLORS.accent}
        showSearch
        showNotification
        showFavorites
        onSearch={() => router.navigate("/(tabs)/search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
      />

      <PaneTabs pane={pane} onChange={setPane} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />}
      >
        <View style={styles.kpiRow}>
          <Metric label="Live now" value={String(live.length)} tone="live" />
          <Metric label="Today" value={String(matchday.length)} />
          <Metric label="Explore" value={String(explore.length)} />
        </View>

        {pane !== "live" ? (
          <DateStrip selectedDate={dateYmd} onChange={setDateYmd} />
        ) : null}

        {pane === "explore" ? (
          <>
            <Section title="Live matches" actionLabel="Open live" onAction={() => setPane("live")}>
              {live.length ? (
                <HorizontalList>
                  {live.slice(0, 12).map((match) => (
                    <LiveMatchCard
                      key={match.id}
                      match={match}
                      onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                    />
                  ))}
                </HorizontalList>
              ) : (
                <EmptySection title="No live matches right now" subtitle="We keep scanning live feeds automatically." />
              )}
            </Section>

            <Section title={`Matchday • ${formatDateLabel(dateYmd)}`}>
              {matchday.length ? (
                <HorizontalList>
                  {matchday.slice(0, 14).map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                    />
                  ))}
                </HorizontalList>
              ) : (
                <EmptySection title="No fixtures on this day" subtitle="Try another date or refresh." />
              )}
            </Section>

            <Section title="Recent results">
              {finished.length ? (
                <HorizontalList>
                  {finished.map((match) => (
                    <FinishedMatchCard
                      key={match.id}
                      match={match}
                      onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                    />
                  ))}
                </HorizontalList>
              ) : (
                <EmptySection title="No finished games yet" subtitle="Results appear automatically after full time." />
              )}
            </Section>
          </>
        ) : null}

        {pane === "live" ? (
          <Section title="Live center">
            {live.length ? (
              <View style={styles.verticalList}>
                {live.map((match) => (
                  <View key={match.id} style={styles.verticalRow}>
                    <LiveMatchCard
                      match={match}
                      onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <EmptySection title="No live matches at the moment" subtitle="This updates continuously every refresh cycle." />
            )}
          </Section>
        ) : null}

        {pane === "matchday" ? (
          <Section title={`All fixtures • ${formatDateLabel(dateYmd)}`}>
            {matchday.length ? (
              <View style={styles.verticalList}>
                {matchday.map((match) => {
                  const state = resolveMatchVisualState(match);
                  const Card = state === "live" ? LiveMatchCard : state === "finished" ? FinishedMatchCard : MatchCard;
                  return (
                    <View key={match.id} style={styles.verticalRow}>
                      <Card
                        match={match}
                        onPress={() => router.push({ pathname: "/match-detail", params: toMatchParams(match) })}
                      />
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptySection title="No fixtures available" subtitle="Try selecting a different date." />
            )}
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PaneTabs({ pane, onChange }: { pane: SportPane; onChange: (next: SportPane) => void }) {
  const items: { key: SportPane; label: string }[] = [
    { key: "explore", label: "Explore" },
    { key: "live", label: "Live" },
    { key: "matchday", label: "Matchday" },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
      {items.map((item) => {
        const active = item.key === pane;
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.tabPill, active && styles.tabPillActive]}
            onPress={() => onChange(item.key)}
            activeOpacity={0.86}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function DateStrip({ selectedDate, onChange }: { selectedDate: string; onChange: (next: string) => void }) {
  const days = useMemo(() => [-2, -1, 0, 1, 2, 3, 4].map((offset) => shiftYmd(getMatchdayYmd(), offset)), []);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
      {days.map((day) => {
        const active = day === selectedDate;
        return (
          <TouchableOpacity
            key={day}
            style={[styles.datePill, active && styles.datePillActive]}
            onPress={() => onChange(day)}
            activeOpacity={0.86}
          >
            <Text style={[styles.dateText, active && styles.dateTextActive]}>{formatDateLabel(day)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "live" }) {
  return (
    <View style={[styles.metric, tone === "live" && styles.metricLive]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={[styles.metricLabel, tone === "live" && styles.metricLabelLive]}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} activeOpacity={0.8}>
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function HorizontalList({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRail}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  tabPill: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  tabPillActive: {
    backgroundColor: "rgba(229,9,20,0.22)",
    borderColor: "rgba(229,9,20,0.40)",
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  tabTextActive: {
    color: COLORS.text,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: 16,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    flex: 1,
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 14,
    justifyContent: "space-between",
  },
  metricLive: {
    backgroundColor: "rgba(5,33,21,0.9)",
    borderColor: "rgba(34,197,94,0.25)",
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 31,
    fontFamily: "Inter_800ExtraBold",
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  metricLabelLive: {
    color: COLORS.live,
  },
  dateRow: {
    gap: 8,
    paddingBottom: 2,
  },
  datePill: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  datePillActive: {
    backgroundColor: "rgba(229,9,20,0.18)",
    borderColor: "rgba(229,9,20,0.35)",
  },
  dateText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  dateTextActive: {
    color: COLORS.text,
  },
  section: {
    gap: 10,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    letterSpacing: 0.2,
    fontFamily: "Inter_800ExtraBold",
  },
  sectionAction: {
    color: COLORS.accent,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  horizontalRail: {
    paddingRight: 12,
  },
  verticalList: {
    gap: 8,
  },
  verticalRow: {
    alignItems: "flex-start",
  },
});
