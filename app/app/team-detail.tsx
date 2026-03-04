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

const POSITION_ORDER = ["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "CAM", "LW", "RW", "SS", "CF", "ST", "FW", "PG", "SG", "SF", "PF", "C", "G", "F"];

const POSITION_COLORS: Record<string, string> = {
  GK: "#FF9500", CB: "#30B0C7", LB: "#30B0C7", RB: "#30B0C7",
  LWB: "#30B0C7", RWB: "#30B0C7", DM: "#5AC8FA", CM: "#5AC8FA",
  AM: "#34C759", CAM: "#34C759", LW: "#34C759", RW: "#34C759",
  SS: "#FF6B6B", CF: "#FF3B30", ST: "#FF3B30", FW: "#FF3B30",
  PG: "#FF6B6B", SG: "#34C759", SF: "#5AC8FA", PF: "#30B0C7", C: "#FF9500", G: "#FF9500", F: "#FF3B30",
};

const CLUB_BRUGGE_LOGO = "https://logodownload.org/wp-content/uploads/2019/11/club-brugge-logo-escudo.png";

function resolveTeamLogo(teamName: string, logo?: string) {
  const normalized = String(teamName || "").toLowerCase();
  if (normalized.includes("club brugge")) return CLUB_BRUGGE_LOGO;
  return logo || null;
}

export default function TeamDetailScreen() {
  const params = useLocalSearchParams<{
    teamId: string; teamName: string; logo?: string; sport?: string; league?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [posFilter, setPosFilter] = useState<string>("all");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const sport = params.sport || "soccer";
  const league = params.league || "eng.1";

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-detail", params.teamId, sport, league],
    queryFn: async () => {
      const teamName = encodeURIComponent(String(params.teamName || ""));
      const res = await apiRequest("GET", `/api/sports/team/${params.teamId}?sport=${sport}&league=${league}&teamName=${teamName}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: scorersData } = useQuery({
    queryKey: ["topscorers", league],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/topscorers/${encodeURIComponent(league)}`);
      return res.json();
    },
    enabled: !!league,
    staleTime: 5 * 60 * 1000,
  });

  const players: any[] = data?.players || [];

  const positionGroups = (() => {
    const groups: Record<string, any[]> = {};
    for (const p of players) {
      const pos = p.position || "?";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    return groups;
  })();

  const positions = Object.keys(positionGroups).sort((a, b) => {
    return (POSITION_ORDER.indexOf(a) ?? 99) - (POSITION_ORDER.indexOf(b) ?? 99);
  });

  const filteredPlayers = posFilter === "all" ? players :
    players.filter(p => p.position === posFilter);

  const realValueCount = players.filter(p => p.isRealValue).length;
  const topScorerForTeam = ((scorersData?.scorers || []) as any[]).find((s) => {
    const team = String(s?.team || "").toLowerCase();
    const current = String(data?.name || params.teamName || "").toLowerCase();
    return team && current && (team.includes(current) || current.includes(team));
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[data?.color || "#1a3a6b", COLORS.background] as any}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.teamHeaderContent}>
          <Image
            source={{ uri: resolveTeamLogo(String(data?.name || params.teamName || ""), data?.logo || params.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${params.teamId}.png`) || undefined }}
            style={styles.teamBigLogo}
          />
          <Text style={styles.teamTitle}>{data?.name || params.teamName}</Text>
          {data?.shortName ? <Text style={styles.teamShort}>{data.shortName}</Text> : null}

          {/* League position row */}
          {data?.leagueRank ? (
            <View style={styles.rankBadge}>
              <MaterialCommunityIcons name="trophy-outline" size={14} color="#FFD700" />
              <Text style={styles.rankText}>
                #{data.leagueRank} {data.leagueName}
                {data.leaguePoints ? `  ·  ${data.leaguePoints} pts` : ""}
                {data.leaguePlayed ? `  ·  ${data.leaguePlayed} wedstr.` : ""}
              </Text>
            </View>
          ) : null}

          <View style={styles.teamMetaRow}>
            {data?.venue ? (
              <View style={styles.metaBadge}>
                <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{data.venue}</Text>
              </View>
            ) : null}
            {data?.record ? (
              <View style={styles.metaBadge}>
                <MaterialCommunityIcons name="scoreboard-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{data.record}</Text>
              </View>
            ) : null}
          </View>
          {data?.coach ? (
            <View style={styles.coachRow}>
              <Ionicons name="person-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.coachText}>Trainer: {data.coach}</Text>
            </View>
          ) : null}

          {realValueCount > 0 ? (
            <View style={styles.tmBadge}>
              <MaterialCommunityIcons name="currency-eur" size={11} color="#00C896" />
              <Text style={styles.tmBadgeText}>{realValueCount} AI marktwaardes beschikbaar</Text>
            </View>
          ) : null}

          {topScorerForTeam ? (
            <View style={styles.topScorerBadge}>
              <MaterialCommunityIcons name="trophy-outline" size={13} color={COLORS.gold} />
              <Text style={styles.topScorerText}>
                Topscorer: {topScorerForTeam.name} · {topScorerForTeam.displayValue || topScorerForTeam.goals || 0} goals
              </Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Spelersinfo & marktwaardes laden...</Text>
        </View>
      ) : error || !data ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Team data niet beschikbaar</Text>
        </View>
      ) : (
        <>
          {/* Player list */}
          <FlatList
            data={filteredPlayers}
            keyExtractor={(item, idx) => String(item.id || idx)}
            renderItem={({ item }) => <PlayerCard player={item} />}
            ListHeaderComponent={positions.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={[styles.filterScroll, styles.filterSticky]} contentContainerStyle={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterChip, posFilter === "all" && styles.filterChipActive]}
                  onPress={() => setPosFilter("all")}
                >
                  <Text style={[styles.filterChipText, posFilter === "all" && styles.filterChipTextActive]}>
                    Alle ({players.length})
                  </Text>
                </TouchableOpacity>
                {positions.map(pos => (
                  <TouchableOpacity key={pos}
                    style={[styles.filterChip, posFilter === pos && styles.filterChipActive,
                      { borderColor: posFilter === pos ? (POSITION_COLORS[pos] || COLORS.accent) : COLORS.border }]}
                    onPress={() => setPosFilter(pos)}
                  >
                    <Text style={[styles.filterChipText, posFilter === pos && {
                      color: POSITION_COLORS[pos] || COLORS.accent
                    }]}> 
                      {pos} ({positionGroups[pos]?.length || 0})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
            stickyHeaderIndices={positions.length > 1 ? [0] : undefined}
            contentContainerStyle={styles.playerList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Geen spelers gevonden</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

function PlayerCard({ player }: { player: any }) {
  const photoCandidates = [
    player?.photo,
    player?.id ? `https://media.api-sports.io/football/players/${encodeURIComponent(String(player.id))}.png` : null,
    player?.id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(String(player.id))}.png` : null,
  ].filter(Boolean) as string[];
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoUri = photoCandidates[photoIndex];
  const posColor = POSITION_COLORS[player.position] || COLORS.accent;

  return (
    <View style={styles.playerCard}>
      <View style={styles.playerTopRow}>
        <View style={[styles.jerseyBadge, { borderColor: posColor }]}> 
          <Text style={[styles.jerseyNum, { color: posColor }]}>{player.jersey || "—"}</Text>
        </View>

        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.playerPhoto}
            onError={() => {
              setPhotoIndex((idx) => (idx + 1 < photoCandidates.length ? idx + 1 : idx));
            }}
          />
        ) : (
          <View style={[styles.playerPhoto, styles.photoPlaceholder]}>
            <Ionicons name="person" size={18} color={COLORS.textMuted} />
          </View>
        )}

        <View style={styles.playerMain}>
          <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
          <View style={styles.playerSubRow}>
            <View style={[styles.posTag, { backgroundColor: `${posColor}22`, borderColor: `${posColor}44` }]}>
              <Text style={[styles.posTagText, { color: posColor }]}>{player.positionName || player.position}</Text>
            </View>
            {player.nationality ? (
              <Text style={styles.playerNat} numberOfLines={1}>{player.nationality}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.playerStats}>
        {player.age ? (
          <StatPill label="Leeftijd" value={String(player.age)} />
        ) : null}
        {player.height ? (
          <StatPill label="Lengte" value={player.height} />
        ) : null}
        {player.weight ? (
          <StatPill label="Gewicht" value={player.weight} />
        ) : null}
        {player.marketValue ? (
          <StatPill
            label="Waarde (€)"
            value={player.marketValue}
            color={player.isRealValue ? "#00C896" : COLORS.textMuted}
            real={player.isRealValue}
          />
        ) : null}
      </View>
    </View>
  );
}

function StatPill({ label, value, color, real }: { label: string; value: string; color?: string; real?: boolean }) {
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statPillVal, color ? { color } : {}]}>{value}</Text>
      <Text style={[styles.statPillLabel, real ? { color: "#00C896" } : {}]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  teamHeaderContent: { alignItems: "center", gap: 8 },
  teamBigLogo: { width: 72, height: 72, borderRadius: 36 },
  logoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  teamTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  teamShort: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.5)" },
  rankBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,215,0,0.12)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.25)",
  },
  rankText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFD700" },
  teamMetaRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.6)" },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  coachText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.6)" },
  tmBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,200,150,0.1)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(0,200,150,0.25)",
  },
  tmBadgeText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#00C896" },
  topScorerBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,215,0,0.12)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.25)",
  },
  topScorerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.gold },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
  filterSticky: { zIndex: 5, elevation: 5 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardElevated,
  },
  filterChipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  filterChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  filterChipTextActive: { color: COLORS.accent },
  playerList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  playerCard: {
    paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border, gap: 10,
    borderRadius: 14, backgroundColor: COLORS.cardElevated, paddingHorizontal: 10, marginBottom: 8,
  },
  playerTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  jerseyBadge: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  jerseyNum: { fontFamily: "Inter_700Bold", fontSize: 12 },
  playerPhoto: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  photoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  playerMain: { flex: 1, gap: 4 },
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  playerSubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  posTag: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  posTagText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  playerNat: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flexShrink: 1 },
  playerStats: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingLeft: 84 },
  statPill: { alignItems: "center", gap: 1, minWidth: 68, backgroundColor: COLORS.card, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.border },
  statPillVal: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  statPillLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
});
