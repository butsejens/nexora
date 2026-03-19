import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Platform, ActivityIndicator, FlatList,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { normalizeApiError } from "@/lib/error-messages";
import { TeamLogo } from "@/components/TeamLogo";
import { useNexora } from "@/context/NexoraContext";

function asParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] || fallback);
  return String(value || fallback);
}

const POSITION_ORDER = ["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "CAM", "LW", "RW", "SS", "CF", "ST", "FW", "PG", "SG", "SF", "PF", "C", "G", "F"];

const POSITION_COLORS: Record<string, string> = {
  GK: "#FF9500", CB: "#30B0C7", LB: "#30B0C7", RB: "#30B0C7",
  LWB: "#30B0C7", RWB: "#30B0C7", DM: "#5AC8FA", CM: "#5AC8FA",
  AM: "#34C759", CAM: "#34C759", LW: "#34C759", RW: "#34C759",
  SS: "#FF6B6B", CF: "#FF3B30", ST: "#FF3B30", FW: "#FF3B30",
  PG: "#FF6B6B", SG: "#34C759", SF: "#5AC8FA", PF: "#30B0C7", C: "#FF9500", G: "#FF9500", F: "#FF3B30",
};

const POSITION_LABELS: Record<string, string> = {
  GK: "Doelman", CB: "Centrale Verdediger", LB: "Linksback", RB: "Rechtsback",
  LWB: "Links Wingback", RWB: "Rechts Wingback", DM: "Defensieve Middenvelder",
  CM: "Centrale Middenvelder", AM: "Aanvallende Mid.", CAM: "Aanvallende Mid.",
  LM: "Links Middenvelder", RM: "Rechts Middenvelder",
  LW: "Links Vleugel", RW: "Rechts Vleugel", SS: "Schaduwspits",
  CF: "Centrumaanvaller", ST: "Spits", FW: "Aanvaller",
  DEF: "Verdediger", MID: "Middenvelder", ATT: "Aanvaller",
  // Basketbal / algemeen
  PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward",
  PF: "Power Forward", C: "Center", G: "Guard", F: "Forward",
};

function positionLabel(pos: string, positionName?: string): string {
  if (positionName && positionName.length > 2 && !/^[A-Z]{1,3}$/.test(positionName)) return positionName;
  const key = String(pos || "").toUpperCase().trim();
  return POSITION_LABELS[key] || key || "Unknown";
}

export default function TeamDetailScreen() {
  const params = useLocalSearchParams<{
    teamId: string; teamName: string; logo?: string; sport?: string; league?: string; espnLeague?: string;
  }>();
  const teamIdParam = asParam(params.teamId, "");
  const teamNameParam = asParam(params.teamName, "Team");
  const logoParam = asParam(params.logo, "");
  const sportParam = asParam(params.sport, "soccer");
  const espnLeagueParam = asParam(params.espnLeague, "");
  const leagueParam = asParam(params.league, "eng.1");
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite } = useNexora();
  const favKey = `sport_team:${teamIdParam || teamNameParam}`;
  const isFollowing = isFavorite(favKey);
  const [posFilter, setPosFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"value_desc" | "value_asc" | "age_desc" | "age_asc" | "name_asc" | "position_asc">("value_desc");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const prefsKey = useMemo(
    () => `team_ui_prefs_${encodeURIComponent(String(teamIdParam || teamNameParam || "unknown"))}`,
    [teamIdParam, teamNameParam]
  );

  useEffect(() => {
    let active = true;
    const loadPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(prefsKey);
        if (!raw || !active) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.posFilter === "string") setPosFilter(parsed.posFilter);
        if (typeof parsed?.sortKey === "string") setSortKey(parsed.sortKey);
      } catch {
        // ignore preference load errors
      }
    };
    loadPrefs();
    return () => {
      active = false;
    };
  }, [prefsKey]);

  useEffect(() => {
    AsyncStorage.setItem(prefsKey, JSON.stringify({ posFilter, sortKey })).catch(() => null);
  }, [posFilter, sortKey, prefsKey]);

  const sport = sportParam || "soccer";
  const league = espnLeagueParam || leagueParam || "eng.1";

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-detail", teamIdParam, sport, league],
    queryFn: async () => {
      if (!teamIdParam) throw new Error("Team ID ontbreekt");
      const tn = encodeURIComponent(String(teamNameParam || ""));
      const res = await apiRequest("GET", `/api/sports/team/${encodeURIComponent(teamIdParam)}?sport=${encodeURIComponent(sport)}&league=${encodeURIComponent(league)}&teamName=${tn}`);
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

  const teamName = String(data?.name || teamNameParam || "Team");

  const players: any[] = useMemo(() => data?.players || [], [data?.players]);

  const positionGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of players) {
      const pos = p.position || "?";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    return groups;
  }, [players]);

  const positions = Object.keys(positionGroups).sort((a, b) => {
    return (POSITION_ORDER.indexOf(a) ?? 99) - (POSITION_ORDER.indexOf(b) ?? 99);
  });

  const parseValueToNumber = (value: string): number => {
    const text = String(value || "").trim().toLowerCase().replace(/€/g, "").replace(/\s+/g, "");
    if (!text) return 0;
    const normalized = text.replace(",", ".");
    const numberPart = Number(normalized.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numberPart)) return 0;
    if (normalized.includes("bn") || normalized.includes("b")) return numberPart * 1_000_000_000;
    if (normalized.includes("m")) return numberPart * 1_000_000;
    if (normalized.includes("k")) return numberPart * 1_000;
    return numberPart;
  };

  const filteredPlayers = useMemo(() => {
    const scoped = posFilter === "all" ? [...players] : players.filter(p => p.position === posFilter);
    scoped.sort((a, b) => {
      switch (sortKey) {
        case "value_desc":
          return parseValueToNumber(String(b?.marketValue || "")) - parseValueToNumber(String(a?.marketValue || ""));
        case "value_asc":
          return parseValueToNumber(String(a?.marketValue || "")) - parseValueToNumber(String(b?.marketValue || ""));
        case "age_desc":
          return Number(b?.age || 0) - Number(a?.age || 0);
        case "age_asc":
          return Number(a?.age || 0) - Number(b?.age || 0);
        case "position_asc":
          return String(a?.position || "").localeCompare(String(b?.position || ""));
        case "name_asc":
        default:
          return String(a?.name || "").localeCompare(String(b?.name || ""));
      }
    });
    return scoped;
  }, [players, posFilter, sortKey]);

  const realValueCount = players.filter(p => p.isRealValue).length;
  const topScorerForTeam = ((scorersData?.scorers || []) as any[]).find((s) => {
    const team = String(s?.team || "").toLowerCase();
    const current = String(data?.name || teamNameParam || "").toLowerCase();
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
        <TouchableOpacity style={styles.followBtn} onPress={() => toggleFavorite(favKey)} activeOpacity={0.75}>
          <Ionicons name={isFollowing ? "heart" : "heart-outline"} size={16} color={isFollowing ? COLORS.accent : COLORS.text} />
          <Text style={[styles.followBtnText, isFollowing && { color: COLORS.accent }]}>
            {isFollowing ? "Volgend" : "Volgen"}
          </Text>
        </TouchableOpacity>

        <View style={styles.teamHeaderContent}>
          <TeamLogo
            uri={data?.logo || logoParam || `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(teamIdParam)}.png`}
            teamName={teamName}
            size={72}
          />
          <Text style={styles.teamTitle}>{data?.name || teamNameParam}</Text>
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

          {(realValueCount > 0 || data?.squadMarketValue) ? (
            <View style={styles.tmBadge}>
              <MaterialCommunityIcons name="currency-eur" size={11} color="#00C896" />
              <Text style={styles.tmBadgeText}>
                {data?.squadMarketValue ? `Clubwaarde: ${data.squadMarketValue}` : `${realValueCount} marktwaardes beschikbaar`}
              </Text>
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
          {error ? <Text style={styles.emptyHintText}>{normalizeApiError(error).userMessage}</Text> : null}
        </View>
      ) : (
        <>
          {/* Player list */}
          <FlatList
            data={filteredPlayers}
            keyExtractor={(item, idx) => String(item.id || idx)}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push({
                  pathname: "/player-profile",
                  params: {
                    playerId: String(item?.id || ""),
                    name: String(item?.name || ""),
                    team: String(data?.name || teamNameParam || ""),
                    league: String(league || "eng.1"),
                    marketValue: String(item?.marketValue || ""),
                    age: item?.age ? String(item.age) : "",
                    height: String(item?.height || ""),
                    weight: String(item?.weight || ""),
                    position: String(item?.positionName || item?.position || ""),
                    nationality: String(item?.nationality || ""),
                  },
                })}
              >
                <PlayerCard player={item} />
              </TouchableOpacity>
            )}
            ListHeaderComponent={positions.length > 1 ? (
              <View style={styles.filterHeaderWrap}>
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
                        {positionLabel(pos)} ({positionGroups[pos]?.length || 0})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={styles.filterRow}>
                  <SortChip label="Waarde ↓" active={sortKey === "value_desc"} onPress={() => setSortKey("value_desc")} />
                  <SortChip label="Waarde ↑" active={sortKey === "value_asc"} onPress={() => setSortKey("value_asc")} />
                  <SortChip label="Leeftijd ↓" active={sortKey === "age_desc"} onPress={() => setSortKey("age_desc")} />
                  <SortChip label="Leeftijd ↑" active={sortKey === "age_asc"} onPress={() => setSortKey("age_asc")} />
                  <SortChip label="Naam A-Z" active={sortKey === "name_asc"} onPress={() => setSortKey("name_asc")} />
                  <SortChip label="Positie" active={sortKey === "position_asc"} onPress={() => setSortKey("position_asc")} />
                </ScrollView>
              </View>
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
  ].filter(Boolean) as string[];
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoUri = photoCandidates[photoIndex];
  const posColor = POSITION_COLORS[player.position] || COLORS.accent;
  const rawName = String(player?.name || "").trim();
  const safeName = rawName || "Unknown";
  const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]).join("").toUpperCase() || "?";

  return (
    <View style={styles.playerCard}>
      <View style={styles.playerTopRow}>
        <View style={[styles.jerseyBadge, { borderColor: posColor }]}> 
          <Text style={[styles.jerseyNum, { color: posColor }]}>{player.jersey || "Unknown"}</Text>
        </View>

        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={[styles.playerPhoto, { backgroundColor: COLORS.card }]}
            resizeMode="contain"
            onError={() => {
              setPhotoIndex((idx) => (idx + 1 < photoCandidates.length ? idx + 1 : idx));
            }}
          />
        ) : (
          <View style={[styles.playerPhoto, styles.photoPlaceholder]}>
            <Text style={styles.playerInitials}>{initials}</Text>
          </View>
        )}

        <View style={styles.playerMain}>
          <View style={styles.playerNameRow}>
            <Text style={styles.playerName} numberOfLines={1}>{safeName}</Text>
            {player.marketValue ? (
              <Text style={[styles.playerNameValue, player.isRealValue ? styles.playerNameValueReal : null]} numberOfLines={1}>
                {player.marketValue}
              </Text>
            ) : null}
          </View>
          <View style={styles.playerSubRow}>
            <View style={[styles.posTag, { backgroundColor: `${posColor}22`, borderColor: `${posColor}44` }]}>
              <Text style={[styles.posTagText, { color: posColor }]}>{positionLabel(player.position || "", player.positionName)}</Text>
            </View>
            {player.nationality ? (
              <Text style={styles.playerNat} numberOfLines={1}>{player.nationality}</Text>
            ) : <Text style={styles.playerNat} numberOfLines={1}>Onbekend</Text>}
          </View>
        </View>
      </View>

      <View style={styles.playerStats}>
        <StatPill label="Age" value={player.age ? String(player.age) : "Unknown"} />
        <StatPill label="Height" value={player.height || "Unknown"} />
        <StatPill label="Weight" value={player.weight || "Unknown"} />
      </View>
    </View>
  );
}

function SortChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.sortChip, active ? styles.sortChipActive : null]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.sortChipText, active ? styles.sortChipTextActive : null]}>{label}</Text>
    </TouchableOpacity>
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
  followBtn: {
    position: "absolute", top: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  followBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text },
  teamHeaderContent: { alignItems: "center", gap: 8 },
  teamBigLogo: { width: 72, height: 72, borderRadius: 36 },
  logoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  logoPlaceholderText: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
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
  emptyHintText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: 24 },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
  filterHeaderWrap: { backgroundColor: COLORS.overlayLight },
  filterSticky: { zIndex: 5, elevation: 5 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sortScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  sortChipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  sortChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  sortChipTextActive: { color: COLORS.accent },
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
  playerInitials: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  playerMain: { flex: 1, gap: 4 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  playerNameValue: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.textMuted },
  playerNameValueReal: { color: "#00C896" },
  playerSubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  posTag: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  posTagText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  playerNat: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flexShrink: 1 },
  playerStats: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingLeft: 84 },
  statPill: { alignItems: "center", gap: 1, minWidth: 68, backgroundColor: COLORS.card, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.border },
  statPillVal: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  statPillLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
});
