import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Platform, ActivityIndicator, FlatList,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { normalizeApiError } from "@/lib/error-messages";
import { resolveTeamLogoUri } from "@/lib/logo-manager";

function formatSeasonLabel(season?: number) {
  if (!season) return "";
  const next = (season + 1) % 100;
  return `${season}/${String(next).padStart(2, "0")}`;
}

function formatMatchDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" });
  } catch { return ""; }
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
  "Bundesliga": ["#cc0000", "#440000"],
  "La Liga": ["#cc0033", "#440011"],
  "Jupiler Pro League": ["#006600", "#002200"],
  "Ligue 1": ["#330066", "#110022"],
  "Serie A": ["#990033", "#330011"],
};

// Cup competitions don't have standings – detect by ESPN league code
function detectCup(espnLeague: string, leagueName: string): boolean {
  return /cup|copa|coupe|pokal|beker|\.fa$|knvb|coppa/i.test(espnLeague) ||
    /cup|beker|pokal|copa|coupe|coppa/i.test(leagueName);
}

export default function CompetitionScreen() {
  const params = useLocalSearchParams<{ league: string; sport?: string; espnLeague?: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const gradColors = (LEAGUE_COLORS[params.league] || ["#1a3a6b", "#0B0F17"]) as [string, string];

  const isCup = detectCup(params.espnLeague || "", params.league || "");
  const [activeTab, setActiveTab] = useState<TabId>(isCup ? "matches" : "standings");

  const { data: standingsData, isLoading: standingsLoading } = useQuery({
    queryKey: ["standings", params.league],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await apiRequest("GET", `/api/sports/standings/${encodeURIComponent(params.league)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) { clearTimeout(timeout); throw e; }
    },
    enabled: activeTab === "standings",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: scorersData, isLoading: scorersLoading } = useQuery({
    queryKey: ["topscorers", params.league],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await apiRequest("GET", `/api/sports/topscorers/${encodeURIComponent(params.league)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) { clearTimeout(timeout); throw e; }
    },
    enabled: activeTab === "scorers",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: matchesData, isLoading: matchesLoading } = useQuery({
    queryKey: ["competition-matches", params.league],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await apiRequest("GET", `/api/sports/competition-matches/${encodeURIComponent(params.league)}`);
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
          <MaterialCommunityIcons name="soccer" size={32} color="rgba(255,255,255,0.3)" />
          <Text style={styles.leagueTitle}>{params.league}</Text>
          <Text style={styles.leagueSub}>
            Voetbal{seasonLabel ? ` • ${seasonLabel}` : ""}
            {isCup ? " • Beker" : ""}
          </Text>
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
              <StandingsRow key={team.teamId || idx} team={team} rank={team.rank || idx + 1} league={params.league} espnLeague={params.espnLeague || ""} />
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
            renderItem={({ item }) => (
              <CompMatchRow
                match={item}
                league={params.league}
                espnLeague={params.espnLeague || item.espnLeague || ""}
              />
            )}
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
                league={params.league}
                espnLeague={params.espnLeague || ""}
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
  const [logoError, setLogoError] = useState(false);
  const teamLogo = !logoError ? resolveTeamLogoUri(String(team?.team || ""), team?.logo || null) : null;
  const rankColor = rank === 1 ? COLORS.gold : rank <= 3 ? COLORS.accent : COLORS.text;

  const handlePress = () => {
    if (!team?.teamId) return;
    router.push({ pathname: "/team-detail", params: { teamId: team.teamId, sport: "soccer", league, teamName: team.team } });
  };

  return (
    <TouchableOpacity
      style={[styles.standingsRow, isTop3 && styles.standingsRowTop]}
      onPress={handlePress}
      activeOpacity={team?.teamId ? 0.7 : 1}
    >
      <View style={[styles.rankIndicator, { backgroundColor: isTopZone ? COLORS.accentGlow : "transparent" }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>{rank}</Text>
      </View>

      <View style={styles.teamCell}>
        {teamLogo ? (
          <Image
            source={typeof teamLogo === "number" ? teamLogo : { uri: teamLogo as string }}
            style={styles.standingsLogo}
            onError={() => setLogoError(true)}
          />
        ) : (
          <View style={[styles.standingsLogo, styles.logoPlaceholder]}>
            <Ionicons name="shield" size={12} color={COLORS.textMuted} />
          </View>
        )}
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

function CompMatchRow({ match, league, espnLeague }: { match: any; league: string; espnLeague: string }) {
  const [homeLogo, setHomeLogo] = useState<boolean>(true);
  const [awayLogo, setAwayLogo] = useState<boolean>(true);
  const homeLogoUri = homeLogo ? resolveTeamLogoUri(match.homeTeam, match.homeTeamLogo) : null;
  const awayLogoUri = awayLogo ? resolveTeamLogoUri(match.awayTeam, match.awayTeamLogo) : null;

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isUpcoming = match.status === "upcoming";

  const handlePress = () => {
    router.push({
      pathname: "/match-detail",
      params: {
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: "soccer",
        league,
        espnLeague: espnLeague || match.espnLeague || "",
      },
    });
  };

  return (
    <TouchableOpacity style={styles.matchRow} onPress={handlePress} activeOpacity={0.75}>
      {/* Status badge */}
      <View style={styles.matchStatusCol}>
        {isLive ? (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>{match.minute ? `${match.minute}'` : "LIVE"}</Text>
          </View>
        ) : isFinished ? (
          <Text style={styles.finishedLabel}>Afgelopen</Text>
        ) : (
          <View style={styles.upcomingTimeCol}>
            <Text style={styles.matchDate}>{formatMatchDate(match.startDate)}</Text>
            <Text style={styles.matchTime}>{formatMatchTime(match.startDate)}</Text>
          </View>
        )}
      </View>

      {/* Teams + score */}
      <View style={styles.matchTeams}>
        <View style={styles.matchTeamRow}>
          {homeLogoUri ? (
            <Image
              source={typeof homeLogoUri === "number" ? homeLogoUri : { uri: homeLogoUri as string }}
              style={styles.matchTeamLogo}
              onError={() => setHomeLogo(false)}
            />
          ) : (
            <View style={[styles.matchTeamLogo, styles.logoPlaceholder]}>
              <Ionicons name="shield" size={10} color={COLORS.textMuted} />
            </View>
          )}
          <Text style={[styles.matchTeamName, isFinished && match.homeScore > match.awayScore && styles.winnerName]} numberOfLines={1}>
            {match.homeTeam}
          </Text>
        </View>
        <View style={styles.matchTeamRow}>
          {awayLogoUri ? (
            <Image
              source={typeof awayLogoUri === "number" ? awayLogoUri : { uri: awayLogoUri as string }}
              style={styles.matchTeamLogo}
              onError={() => setAwayLogo(false)}
            />
          ) : (
            <View style={[styles.matchTeamLogo, styles.logoPlaceholder]}>
              <Ionicons name="shield" size={10} color={COLORS.textMuted} />
            </View>
          )}
          <Text style={[styles.matchTeamName, isFinished && match.awayScore > match.homeScore && styles.winnerName]} numberOfLines={1}>
            {match.awayTeam}
          </Text>
        </View>
      </View>

      {/* Score or vs */}
      <View style={styles.matchScoreCol}>
        {(isLive || isFinished) ? (
          <>
            <Text style={[styles.matchScore, isLive && styles.liveScore]}>{match.homeScore}</Text>
            <Text style={styles.matchScoreDivider}>–</Text>
            <Text style={[styles.matchScore, isLive && styles.liveScore]}>{match.awayScore}</Text>
          </>
        ) : (
          <Text style={styles.matchVs}>vs</Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

function ScorerRow({ scorer, rank, league, espnLeague }: { scorer: any; rank: number; league: string; espnLeague: string }) {
  const rankColor = rank === 1 ? COLORS.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : COLORS.textMuted;
  const [teamLogoError, setTeamLogoError] = useState(false);
  const teamLogo = !teamLogoError ? resolveTeamLogoUri(String(scorer?.team || ""), scorer?.teamLogo || null) : null;

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
          {teamLogo ? <Image source={typeof teamLogo === "number" ? teamLogo : { uri: teamLogo as string }} style={styles.scorerTeamLogo} onError={() => setTeamLogoError(true)} /> : null}
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
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  headerContent: { alignItems: "center", gap: 6 },
  leagueTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text },
  leagueSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.5)" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
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
  standingsLogo: { width: 22, height: 22, borderRadius: 11 },
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
