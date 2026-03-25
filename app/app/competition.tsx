import React, { useState, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Platform, ActivityIndicator, FlatList,
} from "react-native";
import { MatchRowCard } from "@/components/premium";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { fetchSportsLeagueResourceWithFallback, getLeaderboardRows } from "@/lib/sports-data";
import { dedupeCanonicalMatches, toCanonicalMatch, toLegacyMatchCard } from "@/lib/canonical-match";
import { normalizeApiError } from "@/lib/error-messages";
import { getBestCachedOrSeedPlayerImage, resolvePlayerImageUri } from "@/lib/player-image-system";
import { getLeagueLogo } from "@/lib/logo-manager";
import { TeamLogo } from "@/components/TeamLogo";
import { useTranslation } from "@/lib/useTranslation";
import { t as tFn } from "@/lib/i18n";

function asParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] || fallback);
  return String(value || fallback);
}

function formatSeasonLabel(season?: number) {
  if (!season) return "";
  const next = (season + 1) % 100;
  return `${season}/${String(next).padStart(2, "0")}`;
}



function formatMatchTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

type TabId = "standings" | "scorers" | "assists" | "stats" | "matches" | "teams";

const LEAGUE_COLORS: Record<string, string[]> = {
  "Premier League": ["#3d0099", "#1a0044"],
  "UEFA Champions League": ["#003399", "#001144"],
  "UEFA Europa League": ["#f47920", "#5c2d00"],
  "UEFA Conference League": ["#25a851", "#0e3d1f"],
  "Bundesliga": ["#cc0000", "#440000"],
  "La Liga": ["#cc0033", "#440011"],
  "Jupiler Pro League": ["#006600", "#002200"],
  "Challenger Pro League": ["#004d00", "#001a00"],
  "Ligue 1": ["#330066", "#110022"],
  "Serie A": ["#990033", "#330011"],
  "Eredivisie": ["#ff6600", "#441a00"],
};

// Cup competitions don't have standings – detect by ESPN league code
function detectCup(espnLeague: string, leagueName: string): boolean {
  return /cup|copa|coupe|pokal|beker|\.fa$|knvb|coppa/i.test(espnLeague) ||
    /cup|beker|pokal|copa|coupe|coppa/i.test(leagueName);
}

type Storyline = { icon: string; label: string; text: string; color: string };

function buildStorylines(standings: any[], scorers: any[], assists: any[]): Storyline[] {
  if (!standings.length) return [];
  const stories: Storyline[] = [];
  const sorted = [...standings].sort((a, b) => (a.rank || 99) - (b.rank || 99));

  // Title race / leader
  const leader = sorted[0];
  const second = sorted[1];
  if (leader) {
    const gap = second ? (Number(leader.points || 0) - Number(second.points || 0)) : 0;
    if (gap === 0) {
      stories.push({ icon: "🏆", label: tFn("storyline.titleRace"), text: tFn("storyline.titleRaceText", { team1: leader.team, team2: second?.team }), color: COLORS.gold });
    } else {
      stories.push({ icon: "🏆", label: tFn("storyline.leader"), text: tFn("storyline.leaderText", { team: leader.team, gap: String(gap), plural: gap === 1 ? "point" : "points" }), color: COLORS.gold });
    }
  }

  // Top scorer
  if (scorers.length > 0) {
    const top = scorers[0];
    stories.push({ icon: "⚽", label: tFn("storyline.topScorer"), text: tFn("storyline.topScorerText", { name: top.name || top.player, team: top.team, goals: String(top.goals) }), color: "#4CAF82" });
  }

  // Top assister
  if (assists.length > 0) {
    const topA = assists[0];
    const assistValue = Number(topA?.assists ?? topA?.displayValue ?? 0);
    if (Number.isFinite(assistValue) && assistValue > 0) {
      stories.push({ icon: "🎯", label: tFn("storyline.topAssist"), text: `${topA.name} (${topA.team}) — ${assistValue} assists`, color: COLORS.blue });
    }
  }

  // Relegation zone
  if (sorted.length >= 3) {
    const relZone = sorted.slice(-3);
    const safeTeam = sorted.length >= 4 ? sorted[sorted.length - 4] : null;
    const worstPts = Number(relZone[0]?.points || 0);
    const safePts = Number(safeTeam?.points || 0);
    const relGap = safePts - worstPts;
    stories.push({ icon: "⬇️", label: tFn("storyline.relegation"), text: tFn("storyline.relegationText", { t1: relZone[0].team, t2: relZone[1]?.team, t3: relZone[2]?.team, gapText: relGap > 0 ? tFn("storyline.relegationGap", { gap: String(relGap) }) : "" }), color: "#FF5252" });
  }

  // Form: team with most wins in sorted top 6
  const formTeam = sorted.slice(0, 6).reduce((best: any, curr: any) => {
    return Number(curr.won || 0) > Number(best?.won || 0) ? curr : best;
  }, null);
  if (formTeam && formTeam !== leader) {
    stories.push({ icon: "🔥", label: tFn("storyline.inForm"), text: tFn("storyline.inFormText", { team: formTeam.team }), color: "#FF6B35" });
  }

  // Close top 3 race
  if (sorted.length >= 3) {
    const top3Pts = [Number(sorted[0]?.points || 0), Number(sorted[1]?.points || 0), Number(sorted[2]?.points || 0)];
    if (top3Pts[0] - top3Pts[2] <= 4) {
      stories.push({ icon: "⚡", label: tFn("storyline.thrilling"), text: tFn("storyline.thrillingText", { gap: String(top3Pts[0] - top3Pts[2]) }), color: "#A78BFA" });
    }
  }

  return stories;
}

function StorylineBar({ storylines }: { storylines: Storyline[] }) {
  if (!storylines.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={storyStyles.bar} contentContainerStyle={storyStyles.content}>
      {storylines.map((story, i) => (
        <View key={i} style={[storyStyles.card, { borderColor: `${story.color}40` }]}>
          <Text style={storyStyles.icon}>{story.icon}</Text>
          <View style={storyStyles.textWrap}>
            <Text style={[storyStyles.label, { color: story.color }]} numberOfLines={1}>{story.label}</Text>
            <Text style={storyStyles.text} numberOfLines={3}>{story.text}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const storyStyles = StyleSheet.create({
  bar: { flexGrow: 0, marginBottom: 12 },
  content: { paddingHorizontal: 12, paddingVertical: 10, gap: 10, flexDirection: "row" },
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "rgba(17,17,17,0.85)", borderRadius: 12,
    borderWidth: 1, padding: 14, width: 270, minHeight: 72,
  },
  icon: { fontSize: 20, lineHeight: 24 },
  textWrap: { flex: 1, gap: 3 },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  text: { fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 17, flexWrap: "wrap" },
});

export default function CompetitionScreen() {
  const params = useLocalSearchParams<{ league: string; sport?: string; espnLeague?: string }>();
  const leagueName = asParam(params.league, tFn("competition.unknownCompetition"));
  const espnLeague = asParam(params.espnLeague, "eng.1");
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const gradColors = (LEAGUE_COLORS[leagueName] || ["#1a3a6b", "#0B0F17"]) as [string, string];

  const isCup = detectCup(espnLeague, leagueName);
  const [activeTab, setActiveTab] = useState<TabId>(isCup ? "matches" : "standings");

  const fetchLeaguePayloadWithFallback = async (kind: "standings" | "topscorers" | "topassists" | "competition-stats" | "competition-teams" | "competition-matches") => {
    return fetchSportsLeagueResourceWithFallback(kind, {
      leagueName,
      espnLeague,
      sequential: kind === "topscorers" || kind === "topassists",
    });
  };

  const fetchCompetitionBundle = async () => {
    const safeFetch = async (kind: "standings" | "topscorers" | "topassists" | "competition-stats" | "competition-teams" | "competition-matches") => {
      try {
        return await fetchLeaguePayloadWithFallback(kind);
      } catch (error) {
        const fallbackMessage = `Failed to load ${kind}`;
        const message = normalizeApiError(error).userMessage || fallbackMessage;
        return { error: message };
      }
    };

    const [standings, topscorers, topassists, competitionStats, competitionTeams, competitionMatches] = await Promise.all([
      safeFetch("standings"),
      safeFetch("topscorers"),
      safeFetch("topassists"),
      safeFetch("competition-stats"),
      safeFetch("competition-teams"),
      safeFetch("competition-matches"),
    ]);

    return {
      standings,
      topscorers,
      topassists,
      competitionStats,
      competitionTeams,
      competitionMatches,
    };
  };

  const { data: competitionBundle, isLoading: bundleLoading, error: bundleError } = useQuery({
    queryKey: ["competition-bundle", "v3", leagueName, espnLeague],
    queryFn: fetchCompetitionBundle,
    enabled: Boolean(leagueName && espnLeague),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const standingsData = competitionBundle?.standings;
  const scorersData = competitionBundle?.topscorers;
  const assistsData = competitionBundle?.topassists;
  const compStatsData = competitionBundle?.competitionStats;
  const matchesData = competitionBundle?.competitionMatches;
  const teamsData = competitionBundle?.competitionTeams;

  const standingsLoading = bundleLoading && !standingsData;
  const scorersLoading = bundleLoading && !scorersData;
  const assistsLoading = bundleLoading && !assistsData;
  const compStatsLoading = bundleLoading && !compStatsData;
  const matchesLoading = bundleLoading && !matchesData;
  const teamsLoading = bundleLoading && !teamsData;

  const standings: any[] = useMemo(() => standingsData?.standings || [], [standingsData]);
  const standingsPhases: any[] = useMemo(() => standingsData?.phases || [], [standingsData]);
  const isMultiPhase: boolean = standingsData?.isMultiPhase || false;
  const scorers: any[] = useMemo(() => {
    return getLeaderboardRows("topscorers", scorersData).filter((row) => {
      const goals = Number((row as any)?.goals ?? (row as any)?.displayValue ?? 0);
      return Boolean((row as any)?.name) && Number.isFinite(goals) && goals > 0;
    }).sort((a: any, b: any) => Number(b?.goals ?? b?.displayValue ?? 0) - Number(a?.goals ?? a?.displayValue ?? 0));
  }, [scorersData]);
  const assists: any[] = useMemo(() => {
    const direct = getLeaderboardRows("topassists", assistsData).filter((row) => {
      const assistsValue = Number((row as any)?.assists ?? (row as any)?.displayValue ?? 0);
      return Boolean((row as any)?.name) && Number.isFinite(assistsValue) && assistsValue > 0;
    });
    if (direct.length > 0) {
      return direct.sort((a: any, b: any) => Number(b?.assists ?? b?.displayValue ?? 0) - Number(a?.assists ?? a?.displayValue ?? 0));
    }

    // Some weaker competitions miss a dedicated assists feed; recover from mixed leaderboard rows if available.
    const fromScorerPayload = getLeaderboardRows("topscorers", assistsData)
      .map((row) => {
        const assistsValue = Number((row as any)?.assists ?? (row as any)?.stats?.assists ?? 0);
        if (!Boolean((row as any)?.name) || !Number.isFinite(assistsValue) || assistsValue <= 0) return null;
        return {
          ...row,
          assists: assistsValue,
          displayValue: String(assistsValue),
          stat: "Assists",
        };
      })
      .filter(Boolean) as any[];

    return fromScorerPayload.sort((a: any, b: any) => Number(b?.assists ?? b?.displayValue ?? 0) - Number(a?.assists ?? a?.displayValue ?? 0));
  }, [assistsData]);
  const competitionMatches: any[] = useMemo(() => {
    const rows = Array.isArray(matchesData?.matches) ? matchesData.matches : [];
    const canonicalRows = rows
      .map((m: any) => toCanonicalMatch(m))
      .filter(Boolean) as any[];
    return dedupeCanonicalMatches(canonicalRows)
      .map((m: any) => toLegacyMatchCard(m))
      .sort((a: any, b: any) => {
        const rank = (value: string) => value === "live" ? 0 : value === "upcoming" ? 1 : 2;
        const byState = rank(String(a?.status || "")) - rank(String(b?.status || ""));
        if (byState !== 0) return byState;
        const at = Date.parse(String(a?.startDate || ""));
        const bt = Date.parse(String(b?.startDate || ""));
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
        return String(a?.homeTeam || "").localeCompare(String(b?.homeTeam || ""));
      });
  }, [matchesData?.matches]);
  const competitionTeams: any[] = teamsData?.teams || [];
  const standingsError = normalizeApiError((standingsData as any)?.error || null);
  const scorersError = normalizeApiError((scorersData as any)?.error || null);
  const standingsQueryErrorMsg = bundleError ? normalizeApiError(bundleError).userMessage : "";
  const scorersQueryErrorMsg = bundleError ? normalizeApiError(bundleError).userMessage : "";
  const storylines = useMemo(() => buildStorylines(standings, scorers, assists), [standings, scorers, assists]);

  const seasonLabel: string =
    (standingsData as any)?.seasonLabel ||
    (scorersData as any)?.seasonLabel ||
    formatSeasonLabel((standingsData as any)?.season || (scorersData as any)?.season);

  const { t } = useTranslation();

  const tabs: { id: TabId; label: string; icon: string }[] = [
    ...(!isCup ? [{ id: "standings" as TabId, label: t("competition.standings"), icon: "list-outline" }] : []),
    { id: "matches" as TabId, label: t("competition.matches"), icon: "football-outline" },
    { id: "teams" as TabId, label: t("competition.teams") || "Teams", icon: "people-outline" },
    { id: "scorers" as TabId, label: t("competition.topScorers"), icon: "trophy-outline" },
    { id: "assists" as TabId, label: t("competition.topAssists") || "Assists", icon: "arrow-redo-outline" },
    ...(!isCup ? [{ id: "stats" as TabId, label: t("competition.stats") || "Stats", icon: "stats-chart-outline" }] : []),
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={{ zIndex: 30, elevation: 30 }}>
      <LinearGradient colors={[gradColors[0], `${gradColors[0]}CC`, `${gradColors[1]}99`, COLORS.background] as any}
        locations={[0, 0.3, 0.65, 1]}
        style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          {(() => {
            const leagueLogo = getLeagueLogo(leagueName);
            return leagueLogo ? (
              <View style={styles.headerIconWrap}>
                <Image
                  source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
                  style={{ width: 38, height: 38 }}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons name={isCup ? "trophy-outline" as any : "soccer"} size={26} color="rgba(255,255,255,0.95)" />
              </View>
            );
          })()}
          <Text style={styles.leagueTitle} numberOfLines={1}>{leagueName}</Text>
          <View style={styles.headerBadgeRow}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{isCup ? t("competition.cup") : t("competition.league")}</Text>
            </View>
            {seasonLabel ? (
              <View style={[styles.headerBadge, styles.headerBadgeSeason]}>
                <Text style={styles.headerBadgeText}>{seasonLabel}</Text>
              </View>
            ) : null}
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{t("competition.football")}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarScroll}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={15} color={activeTab === tab.id ? COLORS.accent : COLORS.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]} numberOfLines={1}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
      </View>

      {/* Content area */}
      <View style={{ flex: 1 }}>
      {/* AI Storyline bar */}
      {storylines.length > 0 && <StorylineBar storylines={storylines} />}

      {/* Standings */}
      {activeTab === "standings" && (
        standingsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("competition.loadingStandings")}</Text>
          </View>
        ) : standings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t("competition.standingsUnavailable")}</Text>
            {competitionTeams.length > 0 ? (
              <Text style={styles.errorDetail}>{t("competition.teamsAvailableFallback") || "Team list is available while standings are being refreshed."}</Text>
            ) : null}
            {(standingsData as any)?.error ? <Text style={styles.errorDetail}>{standingsError.userMessage}</Text> : null}
            {standingsQueryErrorMsg ? <Text style={styles.errorDetail}>{standingsQueryErrorMsg}</Text> : null}
            {competitionTeams.length > 0 ? (
              <TouchableOpacity style={styles.retryBtn} onPress={() => setActiveTab("teams")}> 
                <Text style={styles.retryBtnText}>{t("competition.openTeams") || "Open teams"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : isMultiPhase && standingsPhases.length > 1 ? (
          // Multi-phase standings (Belgian play-offs, group stages, etc.)
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {standingsPhases.map((phase: any, phaseIdx: number) => (
              <View key={phaseIdx} style={{ marginBottom: 16 }}>
                <View style={styles.phaseHeader}>
                  <Text style={styles.phaseHeaderText}>{phase.phase}</Text>
                  {phaseIdx === 0 && <Text style={styles.phaseBadge}>Regular Season</Text>}
                  {phaseIdx > 0 && <Text style={[styles.phaseBadge, styles.phaseBadgePlayoff]}>Play-off</Text>}
                </View>
                <View style={styles.standingsHeaderRow}>
                  <Text style={[styles.standingsHeaderCell, { width: 24 }]}>#</Text>
                  <Text style={[styles.standingsHeaderCell, { flex: 1, textAlign: "left" }]}>{t("competition.club")}</Text>
                  <Text style={styles.standingsHeaderCell}>{t("competition.mp")}</Text>
                  <Text style={styles.standingsHeaderCell}>{t("competition.w")}</Text>
                  <Text style={styles.standingsHeaderCell}>{t("competition.d")}</Text>
                  <Text style={styles.standingsHeaderCell}>{t("competition.l")}</Text>
                  <Text style={styles.standingsHeaderCell}>{t("competition.gd")}</Text>
                  <Text style={[styles.standingsHeaderCell, { color: COLORS.accent }]}>{t("competition.pts")}</Text>
                </View>
                {(phase.standings || []).map((team: any, idx: number) => (
                  <StandingsRow key={team.teamId || idx} team={team} rank={team.rank || idx + 1} league={leagueName} espnLeague={espnLeague} />
                ))}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.standingsHeaderRow}>
              <Text style={[styles.standingsHeaderCell, { width: 24 }]}>#</Text>
              <Text style={[styles.standingsHeaderCell, { flex: 1, textAlign: "left" }]}>{t("competition.club")}</Text>
              <Text style={styles.standingsHeaderCell}>{t("competition.mp")}</Text>
              <Text style={styles.standingsHeaderCell}>{t("competition.w")}</Text>
              <Text style={styles.standingsHeaderCell}>{t("competition.d")}</Text>
              <Text style={styles.standingsHeaderCell}>{t("competition.l")}</Text>
              <Text style={styles.standingsHeaderCell}>{t("competition.gd")}</Text>
              <Text style={[styles.standingsHeaderCell, { color: COLORS.accent }]}>{t("competition.pts")}</Text>
            </View>
            {standings.map((team: any, idx: number) => (
              <StandingsRow key={team.teamId || idx} team={team} rank={team.rank || idx + 1} league={leagueName} espnLeague={espnLeague} />
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        )
      )}

      {/* Wedstrijden (Matches) */}
      {activeTab === "matches" && (
        matchesLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("competition.loadingMatches")}</Text>
          </View>
        ) : competitionMatches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="football-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t("competition.noMatches")}</Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={competitionMatches}
            keyExtractor={(item, idx) => String((item as any).id || idx)}
            renderItem={({ item }) => {
              const m = item as any;
              const startTime = m.startDate ? formatMatchTime(m.startDate) : undefined;
              return (
                <MatchRowCard
                  match={{
                    id: String(m.id || ""),
                    homeTeam: m.homeTeam || "",
                    awayTeam: m.awayTeam || "",
                    homeTeamLogo: m.homeTeamLogo,
                    awayTeamLogo: m.awayTeamLogo,
                    homeScore: m.homeScore ?? 0,
                    awayScore: m.awayScore ?? 0,
                    status: m.status || "upcoming",
                    minute: m.minute,
                    startTime,
                    league: leagueName,
                  }}
                  onPress={() => {
                    router.push({
                      pathname: "/match-detail",
                      params: {
                        matchId: m.id,
                        homeTeam: m.homeTeam,
                        awayTeam: m.awayTeam,
                        homeTeamLogo: m.homeTeamLogo || "",
                        awayTeamLogo: m.awayTeamLogo || "",
                        homeScore: String(m.homeScore ?? 0),
                        awayScore: String(m.awayScore ?? 0),
                        minute: m.minute !== undefined ? String(m.minute) : "",
                        startDate: m.startDate ? String(m.startDate) : "",
                        status: m.status || "upcoming",
                        statusDetail: String(m.statusDetail || ""),
                        sport: "soccer",
                        league: leagueName,
                        espnLeague: espnLeague || m.espnLeague || "",
                      },
                    });
                  }}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        )
      )}

      {/* Teams */}
      {activeTab === "teams" && (
        teamsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("competition.loadingTeams") || "Loading teams..."}</Text>
          </View>
        ) : competitionTeams.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t("competition.noTeams") || "No teams found"}</Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={competitionTeams}
            keyExtractor={(item) => String((item as any).id)}
            numColumns={2}
            columnWrapperStyle={styles.teamsColumnWrapper}
            renderItem={({ item }) => {
              const team = item as any;
              return (
                <TouchableOpacity
                  style={styles.teamCard}
                  activeOpacity={0.75}
                  onPress={() => {
                    router.push({
                      pathname: "/team-detail",
                      params: {
                        teamId: team.id,
                        sport: "soccer",
                        league: leagueName,
                        teamName: team.name,
                        espnLeague,
                      },
                    });
                  }}
                >
                  <TeamLogo uri={team.logo} teamName={team.name} size={48} />
                  <Text style={styles.teamCardName} numberOfLines={2}>{team.name}</Text>
                  {team.abbreviation ? <Text style={styles.teamCardAbbr}>{team.abbreviation}</Text> : null}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        )
      )}

      {/* Top Scorers */}
      {activeTab === "scorers" && (
        scorersLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("competition.loadingScorers")}</Text>
          </View>
        ) : scorers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t("competition.scorersUnavailable")}</Text>
            {(scorersData as any)?.error ? <Text style={styles.errorDetail}>{scorersError.userMessage}</Text> : null}
            {scorersQueryErrorMsg ? <Text style={styles.errorDetail}>{scorersQueryErrorMsg}</Text> : null}
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={scorers}
            keyExtractor={(item, idx) => String((item as any).name || idx)}
            renderItem={({ item, index }) => (
              <ScorerRow
                scorer={item}
                rank={(item as any).rank || index + 1}
                league={leagueName}
                espnLeague={espnLeague}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        )
      )}

      {/* Top Assists */}
      {activeTab === "assists" && (
        assistsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("competition.loadingAssists") || "Loading top assists..."}</Text>
          </View>
        ) : assists.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="arrow-redo-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t("competition.assistsUnavailable") || "Top assists not available"}</Text>
            <Text style={[styles.emptyText, { fontSize: 12, color: COLORS.textMuted }]}>{(assistsData as any)?.error || "Assist rankings are still syncing for this competition."}</Text>
            {scorers.length > 0 ? (
              <TouchableOpacity style={styles.retryBtn} onPress={() => setActiveTab("scorers")}> 
                <Text style={styles.retryBtnText}>{t("competition.topScorers") || "Open top scorers"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={assists}
            keyExtractor={(item, idx) => String((item as any).id || (item as any).name || idx)}
            renderItem={({ item, index }) => (
              <ScorerRow
                scorer={item}
                rank={(item as any).rank || index + 1}
                league={leagueName}
                espnLeague={espnLeague}
                statLabel="Assists"
                accentColor="#00BFFF"
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        )
      )}

      {/* Competition Stats */}
      {activeTab === "stats" && (
        compStatsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>{t("competition.loadingStats") || "Loading stats..."}</Text>
          </View>
        ) : (
          <CompetitionStatsView data={compStatsData} league={leagueName} espnLeague={espnLeague} />
        )
      )}      </View>    </View>
  );
}

function StandingsRow({ team, rank, league, espnLeague }: { team: any; rank: number; league: string; espnLeague: string }) {
  const isTop3 = rank <= 3;
  const isTopZone = rank <= 4;
  const rankColor = rank === 1 ? COLORS.gold : rank <= 3 ? COLORS.accent : COLORS.text;

  const handlePress = () => {
    const fallbackTeamName = String(team?.team || "").trim();
    const safeTeamId = String(team?.teamId || (fallbackTeamName ? `name:${encodeURIComponent(fallbackTeamName)}` : "")).trim();
    if (!safeTeamId) return;
    router.push({
      pathname: "/team-detail",
      params: {
        teamId: safeTeamId,
        sport: "soccer",
        league,
        teamName: fallbackTeamName,
        espnLeague,
      },
    });
  };

  return (
    <TouchableOpacity
      style={[styles.standingsRow, isTop3 && styles.standingsRowTop]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.rankIndicator, { backgroundColor: isTopZone ? COLORS.accentGlow : "transparent" }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>{rank}</Text>
      </View>

      <View style={styles.teamCell}>
        <TeamLogo uri={team?.logo || null} teamName={String(team?.team || "")} size={28} />
        <Text style={styles.standingsTeamName} numberOfLines={1}>{team.team}</Text>
      </View>

      <Text style={styles.standingsCell}>{team.played || 0}</Text>
      <Text style={styles.standingsCell}>{team.wins || 0}</Text>
      <Text style={styles.standingsCell}>{team.draws || 0}</Text>
      <Text style={styles.standingsCell}>{team.losses || 0}</Text>
      <Text style={[styles.standingsCell, {
        color: (team.goalDiff || 0) > 0 ? COLORS.green : (team.goalDiff || 0) < 0 ? COLORS.live : COLORS.textMuted
      }]}>
        {(team.goalDiff || 0) > 0 ? "+" : ""}{team.goalDiff || 0}
      </Text>
      <Text style={[styles.standingsCell, styles.standingsPts]}>{team.points || 0}</Text>
    </TouchableOpacity>
  );
}

function CompetitionStatsView({ data, league, espnLeague }: { data: any; league: string; espnLeague: string }) {
  const hasAnyStats = Boolean(
    data && !data.error && (
      data.totalGoals != null ||
      data.totalMatches != null ||
      data.avgGoalsPerMatch != null ||
      (Array.isArray(data.bestAttack) && data.bestAttack.length > 0) ||
      (Array.isArray(data.bestDefense) && data.bestDefense.length > 0) ||
      (Array.isArray(data.mostWins) && data.mostWins.length > 0)
    )
  );
  if (!hasAnyStats) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="stats-chart-outline" size={40} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>{"Competition stats are still syncing"}</Text>
      </View>
    );
  }
  const { totalGoals, totalMatches, avgGoalsPerMatch, bestAttack = [], bestDefense = [], mostWins = [] } = data;
  const pickValue = (item: any, keys: string[]) => {
    for (const key of keys) {
      if (item?.[key] != null) return item[key];
    }
    return "-";
  };
  const renderTeamStat = (item: any, idx: number, valueKeys: string[], accentClr: string) => (
    <View key={item.teamId || idx} style={styles.compStatRow}>
      <Text style={styles.compStatRank}>{idx + 1}</Text>
      <TeamLogo uri={item.logo || null} teamName={String(item.team || "")} size={24} />
      <Text style={styles.compStatTeam} numberOfLines={1}>{item.team}</Text>
      <Text style={[styles.compStatValue, { color: accentClr }]}>{pickValue(item, valueKeys)}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 16 }}>
      {/* Summary row */}
      <View style={styles.compStatSummaryRow}>
        <View style={styles.compStatSummaryCard}>
          <Text style={styles.compStatSummaryValue}>{totalGoals ?? "—"}</Text>
          <Text style={styles.compStatSummaryLabel}>{"Total Goals"}</Text>
        </View>
        <View style={styles.compStatSummaryCard}>
          <Text style={styles.compStatSummaryValue}>{totalMatches ?? "—"}</Text>
          <Text style={styles.compStatSummaryLabel}>{"Matches"}</Text>
        </View>
        <View style={styles.compStatSummaryCard}>
          <Text style={styles.compStatSummaryValue}>{avgGoalsPerMatch != null ? Number(avgGoalsPerMatch).toFixed(2) : "—"}</Text>
          <Text style={styles.compStatSummaryLabel}>{"Goals/Match"}</Text>
        </View>
      </View>
      {/* Best Attack */}
      {bestAttack.length > 0 && (
        <View style={styles.compStatSection}>
          <Text style={styles.compStatSectionTitle}>{"🔥 Best Attack"}</Text>
          {bestAttack.slice(0, 5).map((item: any, idx: number) => renderTeamStat(item, idx, ["goalsFor", "scored"], COLORS.accent))}
        </View>
      )}
      {/* Best Defense */}
      {bestDefense.length > 0 && (
        <View style={styles.compStatSection}>
          <Text style={styles.compStatSectionTitle}>{"🛡️ Best Defense"}</Text>
          {bestDefense.slice(0, 5).map((item: any, idx: number) => renderTeamStat(item, idx, ["goalsAgainst", "conceded"], "#4ade80"))}
        </View>
      )}
      {/* Most Wins */}
      {mostWins.length > 0 && (
        <View style={styles.compStatSection}>
          <Text style={styles.compStatSectionTitle}>{"🏆 Most Wins"}</Text>
          {mostWins.slice(0, 5).map((item: any, idx: number) => renderTeamStat(item, idx, ["wins"], "#fbbf24"))}
        </View>
      )}
    </ScrollView>
  );
}

function ScorerRow({ scorer, rank, league, espnLeague, statLabel, accentColor }: { scorer: any; rank: number; league: string; espnLeague: string; statLabel?: string; accentColor?: string }) {
  const rankColor = rank === 1 ? COLORS.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : COLORS.textMuted;
  const seed = useMemo(() => ({
    id: String(scorer?.id || ""),
    name: String(scorer?.name || ""),
    team: String(scorer?.team || ""),
    league: String(espnLeague || league || "eng.1"),
    sport: "soccer",
    photo: scorer?.photo || null,
    theSportsDbPhoto: scorer?.theSportsDbPhoto || null,
  }), [scorer?.id, scorer?.name, scorer?.team, scorer?.photo, scorer?.theSportsDbPhoto, espnLeague, league]);
  const [photoUri, setPhotoUri] = useState<string | null>(getBestCachedOrSeedPlayerImage(seed));
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoUri(getBestCachedOrSeedPlayerImage(seed));
    setPhotoFailed(false);
  }, [seed]);

  useEffect(() => {
    let disposed = false;
    void resolvePlayerImageUri(seed, { allowNetwork: rank <= 3 }).then((uri) => {
      if (disposed || !uri) return;
      setPhotoUri(uri);
      setPhotoFailed(false);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [seed, rank]);

  const resolvedPhotoUri = !photoFailed ? photoUri || scorer?.photo || null : null;

  const handlePress = () => {
    if (!scorer.id) return;
    router.push({
      pathname: "/player-profile",
      params: {
        playerId: scorer.id,
        name: scorer.name,
        team: scorer.team,
        league,
        espnLeague,
      },
    });
  };

  return (
    <TouchableOpacity style={styles.scorerRow} onPress={handlePress} activeOpacity={scorer.id ? 0.75 : 1}>
      <Text style={[styles.scorerRank, { color: rankColor }]}>{rank}</Text>
      {resolvedPhotoUri ? (
        <Image source={{ uri: resolvedPhotoUri }} style={styles.scorerPhoto} onError={() => setPhotoFailed(true)} />
      ) : (
        <View style={[styles.scorerPhoto, styles.logoPlaceholder]}>
          <Ionicons name="person" size={16} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.scorerInfo}>
        <Text style={styles.scorerName} numberOfLines={1}>{scorer.name}</Text>
        <View style={styles.scorerTeamRow}>
          <TeamLogo uri={scorer?.teamLogo || null} teamName={String(scorer?.team || "")} size={18} />
          <Text style={styles.scorerTeam} numberOfLines={1}>{scorer.team}</Text>
        </View>
        {scorer.marketValue ? (
          <Text style={[styles.scorerMarketValue, { color: scorer.isRealValue ? COLORS.green : COLORS.textMuted }]}>
            {scorer.marketValue}
          </Text>
        ) : null}
      </View>
      <View style={styles.scorerRight}>
        <View style={styles.scorerValueBadge}>
          <Text style={[styles.scorerValue, accentColor ? { color: accentColor } : {}]}>{scorer.displayValue}</Text>
          <Text style={styles.scorerStat}>{statLabel || scorer.stat || "Goals"}</Text>
        </View>
        {scorer.id ? <Ionicons name="chevron-forward" size={13} color={COLORS.textMuted} style={{ marginTop: 4 }} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  headerContent: { alignItems: "center", gap: 6 },
  headerIconWrap: {
    width: 64, height: 64, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  leagueTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 24, color: COLORS.text, textAlign: "center" },
  headerBadgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  headerBadge: {
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10, paddingVertical: 4,
  },
  headerBadgeSeason: {
    borderColor: `${COLORS.accent}66`, backgroundColor: `${COLORS.accent}22`,
  },
  headerBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.75)" },
  tabBar: { borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight, zIndex: 20 },
  tabBarScroll: { flexDirection: "row", paddingHorizontal: 4 },
  tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 13, paddingHorizontal: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 4,
    backgroundColor: `${COLORS.accent}18`,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.accent },
  errorDetail: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, textAlign: "center", paddingHorizontal: 24 },
  listContent: { paddingTop: 8, paddingBottom: 40 },

  // Standings
  standingsHeaderRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight,
  },
  standingsHeaderCell: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted, width: 26, textAlign: "center" },
  standingsRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    marginHorizontal: 10, marginBottom: 6, borderRadius: 12, backgroundColor: COLORS.cardElevated,
  },
  standingsRowTop: { backgroundColor: "rgba(0,212,255,0.03)" },
  rankIndicator: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  teamCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  standingsLogo: { width: 28, height: 28, borderRadius: 6 },
  logoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  standingsTeamName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, flex: 1 },
  standingsCell: { width: 26, textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary },
  standingsPts: { fontFamily: "Inter_700Bold", color: COLORS.accent },

  // Wedstrijden
  matchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, backgroundColor: COLORS.cardElevated,
  },
  matchStatusCol: { width: 64, alignItems: "center" },
  liveBadge: { backgroundColor: COLORS.live, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" },
  finishedLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted, textAlign: "center" },
  upcomingTimeCol: { alignItems: "center", gap: 2 },
  matchDate: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted },
  matchTime: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  matchTeams: { flex: 1, gap: 6 },
  matchTeamRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  matchTeamLogo: { width: 22, height: 22, borderRadius: 4 },
  matchTeamName: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  winnerName: { fontFamily: "Inter_700Bold", color: COLORS.text },
  matchScoreCol: { alignItems: "center", gap: 2, minWidth: 36 },
  matchScore: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, textAlign: "center" },
  liveScore: { color: COLORS.accent },
  matchScoreDivider: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  matchVs: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },

  // Topscorers
  scorerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, backgroundColor: COLORS.cardElevated,
  },
  scorerRank: { fontFamily: "Inter_700Bold", fontSize: 16, width: 24, textAlign: "center" },
  scorerPhoto: { width: 52, height: 52, borderRadius: 10 },
  scorerInfo: { flex: 1, gap: 3 },
  scorerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, flexShrink: 1 },
  scorerTeamRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scorerTeamLogo: { width: 18, height: 18, borderRadius: 4 },
  scorerTeam: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flex: 1 },
  scorerMarketValue: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  scorerRight: { alignItems: "center" },
  scorerValueBadge: { alignItems: "center", gap: 2 },
  scorerValue: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.accent },
  scorerStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },

  // Teams
  // Phase headers (play-offs / multi-phase standings)
  phaseHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8, marginBottom: 4,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10,
  },
  phaseHeaderText: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  phaseBadge: {
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted,
  } as any,
  phaseBadgePlayoff: { backgroundColor: `${COLORS.accent}33`, color: COLORS.accent } as any,

  // Competition stats view
  compStatSummaryRow: { flexDirection: "row", gap: 10 },
  compStatSummaryCard: {
    flex: 1, alignItems: "center", paddingVertical: 14,
    borderRadius: 14, backgroundColor: COLORS.cardElevated,
    borderWidth: 1, borderColor: COLORS.border,
  },
  compStatSummaryValue: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.accent },
  compStatSummaryLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  compStatSection: {
    borderRadius: 14, backgroundColor: COLORS.cardElevated,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  compStatSectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  compStatRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  compStatRank: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.textMuted, width: 18, textAlign: "center" },
  compStatTeam: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  compStatValue: { fontFamily: "Inter_800ExtraBold", fontSize: 20 },

  // Teams
  teamsColumnWrapper: { paddingHorizontal: 12, gap: 10 },
  teamCard: {
    flex: 1, alignItems: "center", gap: 8,
    padding: 14, borderRadius: 14,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1, borderColor: COLORS.border,
  },
  teamCardName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, textAlign: "center" },
  teamCardAbbr: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
});
