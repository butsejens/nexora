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
    return d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

type TabId = "standings" | "scorers" | "matches";

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
      stories.push({ icon: "🏆", label: "Titelstrijd", text: `${leader.team} en ${second?.team} staan gelijk aan de leiding!`, color: "#FFD700" });
    } else {
      stories.push({ icon: "🏆", label: "Leider", text: `${leader.team} leidt met ${gap} ${gap === 1 ? "punt" : "punten"} voorsprong.`, color: "#FFD700" });
    }
  }

  // Top scorer
  if (scorers.length > 0) {
    const top = scorers[0];
    stories.push({ icon: "⚽", label: "Topschutter", text: `${top.name || top.player} (${top.team}) staat bovenaan met ${top.goals} goals.`, color: "#4CAF82" });
  }

  // Relegation zone
  if (sorted.length >= 3) {
    const relZone = sorted.slice(-3);
    const safeTeam = sorted.length >= 4 ? sorted[sorted.length - 4] : null;
    const worstPts = Number(relZone[0]?.points || 0);
    const safePts = Number(safeTeam?.points || 0);
    const relGap = safePts - worstPts;
    stories.push({ icon: "⬇️", label: "Degradatiezone", text: `${relZone[0].team}, ${relZone[1]?.team}, ${relZone[2]?.team} strijden om te ontsnappen${relGap > 0 ? ` (${relGap} pts te winnen)` : ""}.`, color: "#FF5252" });
  }

  // Form: team with most wins in sorted top 6
  const formTeam = sorted.slice(0, 6).reduce((best: any, curr: any) => {
    return Number(curr.won || 0) > Number(best?.won || 0) ? curr : best;
  }, null);
  if (formTeam && formTeam !== leader) {
    stories.push({ icon: "🔥", label: "In Form", text: `${formTeam.team} heeft de meeste overwinningen in de top 6.`, color: "#FF6B35" });
  }

  // Close top 3 race
  if (sorted.length >= 3) {
    const top3Pts = [Number(sorted[0]?.points || 0), Number(sorted[1]?.points || 0), Number(sorted[2]?.points || 0)];
    if (top3Pts[0] - top3Pts[2] <= 4) {
      stories.push({ icon: "⚡", label: "Spannend", text: `Top 3 zit op maar ${top3Pts[0] - top3Pts[2]} punten van elkaar!`, color: "#A78BFA" });
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
            <Text style={[storyStyles.label, { color: story.color }]}>{story.label}</Text>
            <Text style={storyStyles.text} numberOfLines={2}>{story.text}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const storyStyles = StyleSheet.create({
  bar: { flexGrow: 0, marginBottom: 4 },
  content: { paddingHorizontal: 12, paddingVertical: 10, gap: 10, flexDirection: "row" },
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "rgba(17,22,42,0.85)", borderRadius: 12,
    borderWidth: 1, padding: 12, width: 240,
  },
  icon: { fontSize: 20, lineHeight: 24 },
  textWrap: { flex: 1, gap: 2 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  text: { fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 16 },
});

export default function CompetitionScreen() {
  const params = useLocalSearchParams<{ league: string; sport?: string; espnLeague?: string }>();
  const leagueName = asParam(params.league, "Onbekende competitie");
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

  const standings: any[] = standingsData?.standings || [];
  const scorers: any[] = scorersData?.scorers || [];
  const competitionMatches: any[] = matchesData?.matches || [];
  const standingsError = normalizeApiError((standingsData as any)?.error || null);
  const scorersError = normalizeApiError((scorersData as any)?.error || null);
  const storylines = useMemo(() => buildStorylines(standings, scorers), [standings, scorers]);

  const seasonLabel: string =
    (standingsData as any)?.seasonLabel ||
    (scorersData as any)?.seasonLabel ||
    formatSeasonLabel((standingsData as any)?.season || (scorersData as any)?.season);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    ...(!isCup ? [{ id: "standings" as TabId, label: "Ranglijst", icon: "list-outline" }] : []),
    { id: "matches" as TabId, label: "Wedstrijden", icon: "football-outline" },
    { id: "scorers" as TabId, label: "Topscorers", icon: "trophy-outline" },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={[...gradColors, COLORS.background] as any}
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
          <Text style={styles.leagueTitle}>{leagueName}</Text>
          <View style={styles.headerBadgeRow}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{isCup ? "Beker" : "Competitie"}</Text>
            </View>
            {seasonLabel ? (
              <View style={[styles.headerBadge, styles.headerBadgeSeason]}>
                <Text style={styles.headerBadgeText}>{seasonLabel}</Text>
              </View>
            ) : null}
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>Voetbal</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.id ? COLORS.accent : COLORS.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* AI Storyline bar */}
      {storylines.length > 0 && <StorylineBar storylines={storylines} />}

      {/* Standings */}
      {activeTab === "standings" && (
        standingsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Ranglijst laden...</Text>
          </View>
        ) : standings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Ranglijst niet beschikbaar</Text>
            {(standingsData as any)?.error ? <Text style={styles.errorDetail}>{standingsError.userMessage}</Text> : null}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.standingsHeaderRow}>
              <Text style={[styles.standingsHeaderCell, { width: 28 }]}>#</Text>
              <Text style={[styles.standingsHeaderCell, { flex: 1 }]}>Club</Text>
              <Text style={styles.standingsHeaderCell}>GS</Text>
              <Text style={styles.standingsHeaderCell}>W</Text>
              <Text style={styles.standingsHeaderCell}>G</Text>
              <Text style={styles.standingsHeaderCell}>V</Text>
              <Text style={styles.standingsHeaderCell}>+/-</Text>
              <Text style={[styles.standingsHeaderCell, { color: COLORS.accent }]}>Pts</Text>
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
            <Text style={styles.loadingText}>Wedstrijden laden...</Text>
          </View>
        ) : competitionMatches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="football-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Geen wedstrijden gevonden</Text>
            {(matchesData as any)?.error ? <Text style={styles.errorDetail}>{(matchesData as any).error}</Text> : null}
          </View>
        ) : (
          <FlatList
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
          />
        )
      )}

      {/* Top Scorers */}
      {activeTab === "scorers" && (
        scorersLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Topscorers laden...</Text>
          </View>
        ) : scorers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Topscorers niet beschikbaar</Text>
            {(scorersData as any)?.error ? <Text style={styles.errorDetail}>{scorersError.userMessage}</Text> : null}
          </View>
        ) : (
          <FlatList
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
          />
        )
      )}
    </View>
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
        <Text style={styles.scorerName}>{scorer.name}</Text>
        <View style={styles.scorerTeamRow}>
          <TeamLogo uri={scorer?.teamLogo || null} teamName={String(scorer?.team || "")} size={22} />
          <Text style={styles.scorerTeam}>{scorer.team}</Text>
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
  header: { paddingHorizontal: 16, paddingBottom: 16 },
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
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight, zIndex: 10 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13 },
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
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight,
  },
  standingsHeaderCell: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted, width: 32, textAlign: "center" },
  standingsRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    marginHorizontal: 12, marginBottom: 6, borderRadius: 12, backgroundColor: COLORS.cardElevated,
  },
  standingsRowTop: { backgroundColor: "rgba(0,212,255,0.03)" },
  rankIndicator: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  teamCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
  standingsLogo: { width: 28, height: 28, borderRadius: 14 },
  logoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  standingsTeamName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, flex: 1 },
  standingsCell: { width: 32, textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary },
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
  scorerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  scorerTeamRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scorerTeamLogo: { width: 16, height: 16, borderRadius: 8 },
  scorerTeam: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  scorerMarketValue: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  scorerRight: { alignItems: "center" },
  scorerValueBadge: { alignItems: "center", gap: 2 },
  scorerValue: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.accent },
  scorerStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
});
