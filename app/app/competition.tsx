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

function formatSeasonLabel(season?: number) {
  if (!season) return "";
  const next = (season + 1) % 100;
  return `${season}/${String(next).padStart(2, "0")}`;
}

type TabId = "standings" | "scorers";

const LEAGUE_COLORS: Record<string, string[]> = {
  "Premier League": ["#3d0099", "#1a0044"],
  "UEFA Champions League": ["#003399", "#001144"],
  "Bundesliga": ["#cc0000", "#440000"],
  "La Liga": ["#cc0033", "#440011"],
  "Jupiler Pro League": ["#006600", "#002200"],
  "Ligue 1": ["#330066", "#110022"],
  "Serie A": ["#990033", "#330011"],
};

export default function CompetitionScreen() {
  const params = useLocalSearchParams<{ league: string; sport?: string; espnLeague?: string }>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>("standings");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const gradColors = (LEAGUE_COLORS[params.league] || ["#1a3a6b", "#0B0F17"]) as [string, string];

  const { data: standingsData, isLoading: standingsLoading } = useQuery({
    queryKey: ["standings", params.league],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await apiRequest("GET", `/api/sports/standings/${encodeURIComponent(params.league)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
    },
    enabled: activeTab === "standings",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: scorersData, isLoading: scorersLoading } = useQuery({
    queryKey: ["topscorers", params.league],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await apiRequest("GET", `/api/sports/topscorers/${encodeURIComponent(params.league)}`);
        clearTimeout(timeout);
        return res.json();
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
    },
    enabled: activeTab === "scorers",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const standings: any[] = standingsData?.standings || [];
  const scorers: any[] = scorersData?.scorers || [];

  // Prefer seasonLabel from API, fall back to computing it
  const seasonLabel: string =
    (standingsData as any)?.seasonLabel ||
    (scorersData as any)?.seasonLabel ||
    formatSeasonLabel((standingsData as any)?.season || (scorersData as any)?.season);

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
          <Text style={styles.leagueSub}>Voetbal • {seasonLabel}</Text>
        </View>
      </LinearGradient>

      <Text style={styles.heroHeadline}>Competition overview, standings and top scorers</Text>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {([
          { id: "standings", label: "Ranglijst", icon: "list-outline" },
          { id: "scorers", label: "Topscorers", icon: "trophy-outline" },
        ] as const).map(tab => (
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
            {(standingsData as any)?.error && (
              <Text style={styles.errorDetail}>{(standingsData as any).error}</Text>
            )}
            <Text style={styles.emptyHint}>Bron: ESPN + API-Sports (geen API-key vereist voor ESPN)</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header row */}
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
              <StandingsRow key={team.teamId || idx} team={team} rank={team.rank || idx + 1} />
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
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
            {(scorersData as any)?.error && (
              <Text style={styles.errorDetail}>{(scorersData as any).error}</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={scorers}
            keyExtractor={(item, idx) => String((item as any).name || idx)}
            renderItem={({ item, index }) => <ScorerRow scorer={item} rank={(item as any).rank || index + 1} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      )}
    </View>
  );
}

function StandingsRow({ team, rank }: { team: any; rank: number }) {
  const isTop3 = rank <= 3;
  const isTopZone = rank <= 4;

  const rankColor = rank === 1 ? COLORS.gold : rank <= 3 ? COLORS.accent : COLORS.text;

  return (
    <View style={[styles.standingsRow, isTop3 && styles.standingsRowTop]}>
      <View style={[styles.rankIndicator, { backgroundColor: isTopZone ? COLORS.accentGlow : "transparent" }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>{rank}</Text>
      </View>

      <View style={styles.teamCell}>
        {team.logo ? (
          <Image source={{ uri: team.logo }} style={styles.standingsLogo} />
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
    </View>
  );
}

function ScorerRow({ scorer, rank }: { scorer: any; rank: number }) {
  const rankColor = rank === 1 ? COLORS.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : COLORS.textMuted;

  return (
    <View style={styles.scorerRow}>
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
          {scorer.teamLogo && <Image source={{ uri: scorer.teamLogo }} style={styles.scorerTeamLogo} />}
          <Text style={styles.scorerTeam}>{scorer.team}</Text>
        </View>
      </View>
      <View style={styles.scorerValueBadge}>
        <Text style={styles.scorerValue}>{scorer.displayValue}</Text>
        <Text style={styles.scorerStat}>{scorer.stat || "Goals"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  heroHeadline: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
    lineHeight: 27,
    color: COLORS.text,
    textAlign: "center",
    marginHorizontal: 24,
    marginTop: 10,
    marginBottom: 10,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  headerContent: { alignItems: "center", gap: 6 },
  leagueTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text },
  leagueSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.5)" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  errorDetail: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#ff6b6b", textAlign: "center", paddingHorizontal: 24 },
  emptyHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center", paddingHorizontal: 24 },
  listContent: { paddingBottom: 40 },
  standingsHeaderRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight,
  },
  standingsHeaderCell: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted,
    width: 32, textAlign: "center",
  },
  standingsRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: COLORS.cardElevated,
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
  scorerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.cardElevated,
  },
  scorerRank: { fontFamily: "Inter_700Bold", fontSize: 16, width: 24, textAlign: "center" },
  scorerPhoto: { width: 44, height: 44, borderRadius: 22 },
  scorerInfo: { flex: 1, gap: 3 },
  scorerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  scorerTeamRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scorerTeamLogo: { width: 16, height: 16, borderRadius: 8 },
  scorerTeam: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  scorerValueBadge: { alignItems: "center", gap: 2 },
  scorerValue: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.accent },
  scorerStat: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
});
