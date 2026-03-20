import React, { useState, useMemo } from "react";
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
import { apiRequest } from "@/lib/query-client";
import { normalizeApiError } from "@/lib/error-messages";
import { resolveTeamLogoUri, getLeagueLogo } from "@/lib/logo-manager";
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

type TabId = "standings" | "scorers" | "matches" | "teams";

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

function buildStorylines(standings: any[], scorers: any[]): Storyline[] {
  if (!standings.length) return [];
  const stories: Storyline[] = [];
  const sorted = [...standings].sort((a, b) => (a.rank || 99) - (b.rank || 99));

  // Title race / leader
  const leader = sorted[0];
  const second = sorted[1];
  if (leader) {
    const gap = second ? (Number(leader.points || 0) - Number(second.points || 0)) : 0;
    if (gap === 0) {
      stories.push({ icon: "🏆", label: tFn("storyline.titleRace"), text: tFn("storyline.titleRaceText", { team1: leader.team, team2: second?.team }), color: "#FFD700" });
    } else {
      stories.push({ icon: "🏆", label: tFn("storyline.leader"), text: tFn("storyline.leaderText", { team: leader.team, gap: String(gap), plural: gap === 1 ? "point" : "points" }), color: "#FFD700" });
    }
  }

  // Top scorer
  if (scorers.length > 0) {
    const top = scorers[0];
    stories.push({ icon: "⚽", label: tFn("storyline.topScorer"), text: tFn("storyline.topScorerText", { name: top.name || top.player, team: top.team, goals: String(top.goals) }), color: "#4CAF82" });
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


  const { data: standingsData, isLoading: standingsLoading } = useQuery({
    queryKey: ["standings", leagueName],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await apiRequest("GET", `/api/sports/standings/${encodeURIComponent(leagueName)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) { clearTimeout(timeout); throw e; }
    },
    enabled: activeTab === "standings",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: scorersData, isLoading: scorersLoading } = useQuery({
    queryKey: ["topscorers", leagueName],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await apiRequest("GET", `/api/sports/topscorers/${encodeURIComponent(leagueName)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) { clearTimeout(timeout); throw e; }
    },
    enabled: activeTab === "scorers",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: matchesData, isLoading: matchesLoading } = useQuery({
    queryKey: ["competition-matches", leagueName],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await apiRequest("GET", `/api/sports/competition-matches/${encodeURIComponent(leagueName)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) { clearTimeout(timeout); throw e; }
    },
    enabled: activeTab === "matches",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ["competition-teams", leagueName],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await apiRequest("GET", `/api/sports/competition-teams/${encodeURIComponent(leagueName)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) { clearTimeout(timeout); throw e; }
    },
    enabled: activeTab === "teams",
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const standings: any[] = standingsData?.standings || [];
  const scorers: any[] = scorersData?.scorers || [];
  const competitionMatches: any[] = matchesData?.matches || [];
  const competitionTeams: any[] = teamsData?.teams || [];
  const standingsError = normalizeApiError((standingsData as any)?.error || null);
  const scorersError = normalizeApiError((scorersData as any)?.error || null);
  const storylines = useMemo(() => buildStorylines(standings, scorers), [standings, scorers]);

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
            {(standingsData as any)?.error ? <Text style={styles.errorDetail}>{standingsError.userMessage}</Text> : null}
          </View>
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
            {(matchesData as any)?.error ? <Text style={styles.errorDetail}>{(matchesData as any).error}</Text> : null}
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
                  <TeamLogo uri={team.logo} teamName={team.name} size={40} />
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
        <TeamLogo uri={team?.logo || null} teamName={String(team?.team || "")} size={24} />
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

function ScorerRow({ scorer, rank, league, espnLeague }: { scorer: any; rank: number; league: string; espnLeague: string }) {
  const rankColor = rank === 1 ? COLORS.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : COLORS.textMuted;

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
      {scorer.photo ? (
        <Image source={{ uri: scorer.photo }} style={styles.scorerPhoto} />
      ) : (
        <View style={[styles.scorerPhoto, styles.logoPlaceholder]}>
          <Ionicons name="person" size={16} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.scorerInfo}>
        <Text style={styles.scorerName} numberOfLines={1}>{scorer.name}</Text>
        <View style={styles.scorerTeamRow}>
          <TeamLogo uri={scorer?.teamLogo || null} teamName={String(scorer?.team || "")} size={22} />
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
          <Text style={styles.scorerValue}>{scorer.displayValue}</Text>
          <Text style={styles.scorerStat}>{scorer.stat || "Goals"}</Text>
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
    width: 56, height: 56, borderRadius: 28,
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
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  errorDetail: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#ff6b6b", textAlign: "center", paddingHorizontal: 24 },
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
  standingsLogo: { width: 24, height: 24, borderRadius: 12 },
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
  matchTeamLogo: { width: 18, height: 18, borderRadius: 9 },
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
  scorerPhoto: { width: 44, height: 44, borderRadius: 22 },
  scorerInfo: { flex: 1, gap: 3 },
  scorerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, flexShrink: 1 },
  scorerTeamRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scorerTeamLogo: { width: 16, height: 16, borderRadius: 8 },
  scorerTeam: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flex: 1 },
  scorerMarketValue: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  scorerRight: { alignItems: "center" },
  scorerValueBadge: { alignItems: "center", gap: 2 },
  scorerValue: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.accent },
  scorerStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },

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
