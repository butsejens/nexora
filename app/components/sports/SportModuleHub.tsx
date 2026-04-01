import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { NexoraHeader } from "@/components/NexoraHeader";
import { useFollowState } from "@/context/UserStateContext";
import { shiftYmd, getMatchdayYmd } from "@/lib/date/matchday";
import { useExploreMatches, useLiveMatches, useMatchdayMatches } from "@/features/sports/hooks/useSportHomeFeed";
import { useOnboardingStore } from "@/store/onboarding-store";
import {
  CompetitionClusterCard,
  CountryClusterCard,
  EmptySection,
  FinishedMatchCard,
  FollowingMatchCard,
  HeroMatchCard,
  LiveMatchCard,
  MatchCard,
  normalizeSportMatch,
  type PremiumSportMatch,
  resolveMatchVisualState,
  SectionHeader,
  SkeletonMatchCard,
  UpcomingMatchCard,
} from "@/components/sports/SportCards";

type SportPane = "explore" | "live" | "matchday" | "competitions" | "countries";

type SportModuleHubProps = {
  initialPane?: SportPane;
};

const DS = {
  bg: "#05070B",
  panel: "#0B0F18",
  border: "rgba(255,255,255,0.08)",
  text: "#F8FAFC",
  muted: "#94A3B8",
  subtle: "#64748B",
  accent: "#E50914",
  live: "#22C55E",
  liveSoft: "rgba(34,197,94,0.14)",
};

function makeMatchParams(match: PremiumSportMatch) {
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeTeamId: String(match.homeTeamId || ""),
    awayTeamId: String(match.awayTeamId || ""),
    homeTeamLogo: match.homeTeamLogo || "",
    awayTeamLogo: match.awayTeamLogo || "",
    homeScore: String(match.homeScore ?? 0),
    awayScore: String(match.awayScore ?? 0),
    league: match.league,
    espnLeague: match.espnLeague || "",
    minute: String(match.minute ?? ""),
    status: match.status,
    statusDetail: match.statusDetail || "",
    sport: match.sport || "soccer",
    startDate: match.startDate || "",
  };
}

function uniqById(matches: PremiumSportMatch[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (!match.id || seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

function formatPaneDateLabel(dateYmd: string) {
  const ts = Date.parse(`${dateYmd}T12:00:00`);
  if (!Number.isFinite(ts)) return dateYmd;
  return new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short" }).format(new Date(ts));
}

function inferCountry(match: PremiumSportMatch) {
  const direct = String(match.competitionCountry || "").trim();
  if (direct) return direct;
  const league = match.league.toLowerCase();
  if (league.includes("eng") || league.includes("premier") || league.includes("fa cup") || league.includes("championship")) return "England";
  if (league.includes("laliga") || league.includes("la liga") || league.includes("copa del rey")) return "Spain";
  if (league.includes("bundesliga") || league.includes("dfb")) return "Germany";
  if (league.includes("serie a") || league.includes("coppa")) return "Italy";
  if (league.includes("ligue")) return "France";
  if (league.includes("jupiler") || league.includes("challenger") || league.includes("belgian")) return "Belgium";
  if (league.includes("eredivisie") || league.includes("knvb")) return "Netherlands";
  if (league.includes("champions") || league.includes("europa") || league.includes("conference")) return "Europe";
  return "Global";
}

function groupByLeague(matches: PremiumSportMatch[]) {
  const map = new Map<string, PremiumSportMatch[]>();
  for (const match of matches) {
    const key = match.league || "Competition";
    const bucket = map.get(key) || [];
    bucket.push(match);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([league, items]) => ({
      league,
      items,
      country: inferCountry(items[0]!),
      liveCount: items.filter((item) => resolveMatchVisualState(item) === "live").length,
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

function groupByCountry(matches: PremiumSportMatch[]) {
  const map = new Map<string, PremiumSportMatch[]>();
  for (const match of matches) {
    const key = inferCountry(match);
    const bucket = map.get(key) || [];
    bucket.push(match);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([country, items]) => ({
      country,
      items,
      leagues: [...new Set(items.map((item) => item.league))],
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

function SectionRail({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
      {children}
    </ScrollView>
  );
}

function DateStrip({ selectedDate, onChange }: { selectedDate: string; onChange: (next: string) => void }) {
  const days = useMemo(() => [-2, -1, 0, 1, 2, 3, 4].map((offset) => shiftYmd(getMatchdayYmd(), offset)), []);
  return (
    <SectionRail>
      {days.map((day) => {
        const active = day === selectedDate;
        return (
          <TouchableOpacity key={day} activeOpacity={0.85} onPress={() => onChange(day)} style={[styles.dateChip, active && styles.dateChipActive]}>
            <Text style={[styles.dateChipLabel, active && styles.dateChipLabelActive]}>{formatPaneDateLabel(day)}</Text>
          </TouchableOpacity>
        );
      })}
    </SectionRail>
  );
}

function Subnav({ activePane, onChange }: { activePane: SportPane; onChange: (pane: SportPane) => void }) {
  const items: { key: SportPane; label: string }[] = [
    { key: "explore", label: "Explore" },
    { key: "live", label: "Live" },
    { key: "matchday", label: "Matchday" },
    { key: "competitions", label: "Competitions" },
    { key: "countries", label: "Countries" },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subnavContent}>
      {items.map((item) => {
        const active = item.key === activePane;
        return (
          <TouchableOpacity key={item.key} activeOpacity={0.86} onPress={() => onChange(item.key)} style={[styles.subnavPill, active && styles.subnavPillActive]}>
            <Text style={[styles.subnavText, active && styles.subnavTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function SportModuleHub({ initialPane = "explore" }: SportModuleHubProps) {
  const [activePane, setActivePane] = useState<SportPane>(initialPane);
  const [selectedDate, setSelectedDate] = useState(getMatchdayYmd());
  const [refreshing, setRefreshing] = useState(false);

  const sportsEnabled = useOnboardingStore((state) => state.sportsEnabled);
  const selectedTeams = useOnboardingStore((state) => state.selectedTeams);
  const { followedTeams } = useFollowState();

  const liveQuery = useLiveMatches(sportsEnabled);
  const matchdayQuery = useMatchdayMatches(selectedDate, sportsEnabled);
  const exploreQuery = useExploreMatches(selectedDate, sportsEnabled);

  const liveMatches = useMemo(() => uniqById((liveQuery.live || []).map(normalizeSportMatch)), [liveQuery.live]);
  const todayLive = useMemo(() => (matchdayQuery.live || []).map(normalizeSportMatch), [matchdayQuery.live]);
  const todayUpcoming = useMemo(() => (matchdayQuery.upcoming || []).map(normalizeSportMatch), [matchdayQuery.upcoming]);
  const todayFinished = useMemo(() => (matchdayQuery.finished || []).map(normalizeSportMatch), [matchdayQuery.finished]);
  const allMatchdayMatches = useMemo(() => uniqById([...todayLive, ...todayUpcoming, ...todayFinished]), [todayFinished, todayLive, todayUpcoming]);
  const exploreMatches = useMemo(() => uniqById((exploreQuery.matches || []).map(normalizeSportMatch)), [exploreQuery.matches]);

  const featuredMatch = liveMatches[0] || todayLive[0] || todayUpcoming[0] || exploreMatches[0] || null;
  const highlights = useMemo(() => uniqById([...todayFinished, ...exploreMatches.filter((match) => resolveMatchVisualState(match) === "finished")]).slice(0, 8), [exploreMatches, todayFinished]);
  const competitionGroups = useMemo(() => groupByLeague(allMatchdayMatches.length ? allMatchdayMatches : exploreMatches), [allMatchdayMatches, exploreMatches]);
  const countryGroups = useMemo(() => groupByCountry(allMatchdayMatches.length ? allMatchdayMatches : exploreMatches), [allMatchdayMatches, exploreMatches]);

  const favoriteTeamNames = useMemo(() => {
    return [
      ...followedTeams.map((row) => String(row?.teamName || "")),
      ...selectedTeams.map((row) => String(row?.name || "")),
    ].filter(Boolean);
  }, [followedTeams, selectedTeams]);

  const followingMatches = useMemo(() => {
    if (!favoriteTeamNames.length) return [] as PremiumSportMatch[];
    const names = favoriteTeamNames.map((value) => value.toLowerCase());
    return allMatchdayMatches.filter((match) => {
      const home = match.homeTeam.toLowerCase();
      const away = match.awayTeam.toLowerCase();
      return names.some((name) => home.includes(name) || away.includes(name) || name.includes(home) || name.includes(away));
    }).slice(0, 8);
  }, [allMatchdayMatches, favoriteTeamNames]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([liveQuery.refetch(), matchdayQuery.refetch(), exploreQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [exploreQuery, liveQuery, matchdayQuery]);

  const openMatch = useCallback((match: PremiumSportMatch) => {
    router.push({ pathname: "/match-detail", params: makeMatchParams(match) });
  }, []);

  if (!sportsEnabled) {
    return (
      <View style={styles.container}>
        <NexoraHeader
          variant="module"
          title="SPORT"
          titleColor={DS.accent}
          showSearch
          showNotification
          showFavorites
          onSearch={() => router.navigate("/(tabs)/search")}
          onNotification={() => router.push("/follow-center")}
          onFavorites={() => router.push("/favorites")}
        />
        <View style={styles.disabledWrap}>
          <Ionicons name="football-outline" size={52} color={DS.accent} />
          <Text style={styles.disabledTitle}>Sports module is disabled</Text>
          <Text style={styles.disabledCopy}>Enable sports in settings to unlock live matches, competitions and match center.</Text>
        </View>
      </View>
    );
  }

  const isLoading = (liveQuery.isLoading || matchdayQuery.isLoading || exploreQuery.isLoading) && !featuredMatch;

  return (
    <View style={styles.container}>
      <NexoraHeader
        variant="module"
        title="SPORT"
        titleColor={DS.accent}
        showSearch
        showNotification
        showFavorites
        onSearch={() => router.navigate("/(tabs)/search")}
        onNotification={() => router.push("/follow-center")}
        onFavorites={() => router.push("/favorites")}
      />

      <Subnav activePane={activePane} onChange={setActivePane} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={DS.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={DS.accent} size="large" />
            <Text style={styles.loadingText}>Building premium sports feed...</Text>
            <SectionRail>
              <SkeletonMatchCard />
              <SkeletonMatchCard />
            </SectionRail>
          </View>
        ) : null}

        {!isLoading && featuredMatch ? <HeroMatchCard match={featuredMatch} onPress={() => openMatch(featuredMatch)} /> : null}

        {activePane === "explore" ? (
          <>
            <View style={styles.statStrip}>
              <StatPill label="Live now" value={String(liveMatches.length)} tone="live" />
              <StatPill label="Today" value={String(allMatchdayMatches.length)} />
              <StatPill label="Competitions" value={String(competitionGroups.length)} />
            </View>

            <SectionBlock title="Live Now" subtitle="Fast reads on every live fixture" actionLabel="Open live" onAction={() => setActivePane("live")}>
              {liveMatches.length ? (
                <SectionRail>
                  {liveMatches.map((match) => <LiveMatchCard key={match.id} match={match} onPress={() => openMatch(match)} />)}
                </SectionRail>
              ) : <EmptySection title="No live matches right now" subtitle="Match center stays ready when the next game kicks off." />}
            </SectionBlock>

            <SectionBlock title="Today" subtitle={`Matchday snapshot for ${formatPaneDateLabel(selectedDate)}`} actionLabel="Open matchday" onAction={() => setActivePane("matchday")}>
              {allMatchdayMatches.length ? (
                <SectionRail>
                  {allMatchdayMatches.slice(0, 10).map((match) => {
                    const state = resolveMatchVisualState(match);
                    const Card = state === "live" ? LiveMatchCard : state === "finished" ? FinishedMatchCard : UpcomingMatchCard;
                    return <Card key={match.id} match={match} onPress={() => openMatch(match)} />;
                  })}
                </SectionRail>
              ) : <EmptySection title="No fixtures on this date" subtitle="Pick another day to explore the schedule." />}
            </SectionBlock>

            <SectionBlock title="Highlights" subtitle="Finished games and replay-ready stories">
              {highlights.length ? (
                <SectionRail>
                  {highlights.map((match) => <FinishedMatchCard key={match.id} match={match} onPress={() => openMatch(match)} />)}
                </SectionRail>
              ) : <EmptySection title="No highlights yet" subtitle="Finished matches land here automatically." />}
            </SectionBlock>

            <SectionBlock title="Competitions" subtitle="Standout leagues grouped for quick scanning" actionLabel="Browse" onAction={() => setActivePane("competitions")}>
              {competitionGroups.length ? (
                <SectionRail>
                  {competitionGroups.slice(0, 10).map((group) => (
                    <CompetitionClusterCard
                      key={group.league}
                      title={group.league}
                      subtitle={group.country}
                      meta={`${group.items.length} matches${group.liveCount ? ` • ${group.liveCount} live` : ""}`}
                      tone={group.liveCount ? "live" : "default"}
                      onPress={() => setActivePane("competitions")}
                    />
                  ))}
                </SectionRail>
              ) : <EmptySection title="Competitions load from current matchday" />}
            </SectionBlock>

            <SectionBlock title="Countries" subtitle="National entry points built from the same live dataset" actionLabel="Browse" onAction={() => setActivePane("countries")}>
              {countryGroups.length ? (
                <SectionRail>
                  {countryGroups.slice(0, 10).map((group) => (
                    <CountryClusterCard
                      key={group.country}
                      title={group.country}
                      subtitle={group.leagues.slice(0, 2).join(" • ") || "League coverage"}
                      meta={`${group.items.length} matches • ${group.leagues.length} leagues`}
                      onPress={() => setActivePane("countries")}
                    />
                  ))}
                </SectionRail>
              ) : <EmptySection title="Country hubs populate from fixture metadata" />}
            </SectionBlock>

            <SectionBlock title="Favorites / Following" subtitle="Matches involving teams you care about most">
              {followingMatches.length ? (
                <View>
                  {followingMatches.map((match) => (
                    <FollowingMatchCard
                      key={match.id}
                      match={match}
                      contextLabel={`${match.league} • ${match.competitionCountry || inferCountry(match)}`}
                      onPress={() => openMatch(match)}
                    />
                  ))}
                </View>
              ) : <EmptySection title="Follow teams to pin them here" subtitle="Your onboarding and follow choices drive this block." />}
            </SectionBlock>
          </>
        ) : null}

        {activePane === "live" ? (
          <SectionBlock title="Live" subtitle="Every active fixture in one premium list">
            {liveMatches.length ? (
              <View style={styles.stack}>
                {liveMatches.map((match) => <MatchCard key={match.id} match={match} compact onPress={() => openMatch(match)} />)}
              </View>
            ) : <EmptySection title="No live fixtures" subtitle="Switch back to Explore or Matchday for upcoming matches." />}
          </SectionBlock>
        ) : null}

        {activePane === "matchday" ? (
          <>
            <SectionBlock title="Matchday" subtitle="Live, upcoming and finished in one scroll">
              <DateStrip selectedDate={selectedDate} onChange={setSelectedDate} />
            </SectionBlock>
            <View style={styles.stack}>
              {allMatchdayMatches.length ? allMatchdayMatches.map((match) => <MatchCard key={match.id} match={match} compact onPress={() => openMatch(match)} />) : <EmptySection title="No matches on this date" subtitle="Try another day in the strip above." />}
            </View>
          </>
        ) : null}

        {activePane === "competitions" ? (
          <SectionBlock title="Competitions" subtitle="Clear grouped views with live priority at the top">
            {competitionGroups.length ? (
              <View style={styles.groupStack}>
                {competitionGroups.map((group) => (
                  <View key={group.league} style={styles.groupBlock}>
                    <SectionHeader title={group.league} subtitle={`${group.country} • ${group.items.length} matches`} />
                    <View style={styles.stack}>
                      {group.items.slice(0, 4).map((match) => <MatchCard key={match.id} match={match} compact onPress={() => openMatch(match)} />)}
                    </View>
                  </View>
                ))}
              </View>
            ) : <EmptySection title="No competitions available" />}
          </SectionBlock>
        ) : null}

        {activePane === "countries" ? (
          <SectionBlock title="Countries" subtitle="Country-first browse flow built on current fixture coverage">
            {countryGroups.length ? (
              <View style={styles.groupStack}>
                {countryGroups.map((group) => (
                  <View key={group.country} style={styles.groupBlock}>
                    <SectionHeader title={group.country} subtitle={group.leagues.slice(0, 3).join(" • ") || "League coverage"} />
                    <View style={styles.stack}>
                      {group.items.slice(0, 4).map((match) => <MatchCard key={match.id} match={match} compact onPress={() => openMatch(match)} />)}
                    </View>
                  </View>
                ))}
              </View>
            ) : <EmptySection title="No country rails available" />}
          </SectionBlock>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionBlock({ title, subtitle, actionLabel, onAction, children }: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode; }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} actionLabel={actionLabel} onAction={onAction} />
      {children}
    </View>
  );
}

function StatPill({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "live" }) {
  const live = tone === "live";
  return (
    <View style={[styles.statPill, live && styles.statPillLive]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statLabel, live && styles.statLabelLive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 8 },
  subnavContent: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  subnavPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.panel, borderWidth: 1, borderColor: DS.border },
  subnavPillActive: { backgroundColor: "rgba(229,9,20,0.16)", borderColor: "rgba(229,9,20,0.32)" },
  subnavText: { color: DS.muted, fontSize: 13, fontFamily: "Inter_700Bold" },
  subnavTextActive: { color: DS.text },
  section: { marginBottom: 30 },
  railContent: { paddingRight: 8 },
  statStrip: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statPill: { flex: 1, borderRadius: 18, backgroundColor: DS.panel, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 14, paddingVertical: 14, gap: 6 },
  statPillLive: { backgroundColor: DS.liveSoft, borderColor: "rgba(34,197,94,0.28)" },
  statValue: { color: DS.text, fontSize: 24, fontFamily: "Inter_800ExtraBold" },
  statLabel: { color: DS.muted, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statLabelLive: { color: DS.live },
  loadingBlock: { gap: 16, paddingVertical: 18 },
  loadingText: { color: DS.muted, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stack: { gap: 12 },
  groupStack: { gap: 24 },
  groupBlock: { gap: 10 },
  dateChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.panel, marginRight: 10 },
  dateChipActive: { backgroundColor: "rgba(229,9,20,0.16)", borderColor: "rgba(229,9,20,0.28)" },
  dateChipLabel: { color: DS.muted, fontSize: 12, fontFamily: "Inter_700Bold" },
  dateChipLabelActive: { color: DS.text },
  disabledWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 10 },
  disabledTitle: { color: DS.text, fontSize: 22, fontFamily: "Inter_800ExtraBold", textAlign: "center" },
  disabledCopy: { color: DS.muted, fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
});
