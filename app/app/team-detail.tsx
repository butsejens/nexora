import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Platform, ActivityIndicator, FlatList, Animated,
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
import { useTranslation } from "@/lib/useTranslation";
import { t as tFn } from "@/lib/i18n";

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

const POSITION_KEY_MAP: Record<string, string> = {
  GK: "gk", CB: "cb", LB: "lb", RB: "rb",
  LWB: "lwb", RWB: "rwb", DM: "dm",
  CM: "cm", AM: "am", CAM: "am",
  LM: "lm", RM: "rm",
  LW: "lw", RW: "rw", SS: "ss",
  CF: "cf", ST: "st", FW: "fw",
  DEF: "defender", MID: "midfielder", ATT: "attacker",
  PG: "pg", SG: "sg", SF: "sf",
  PF: "pf", C: "c", G: "g", F: "f",
};

const POSITION_LABELS_FALLBACK: Record<string, string> = {
  PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward",
  PF: "Power Forward", C: "Center", G: "Guard", F: "Forward",
};

function positionLabel(pos: string, positionName?: string): string {
  if (positionName && positionName.length > 2 && !/^[A-Z]{1,3}$/.test(positionName)) return positionName;
  const key = String(pos || "").toUpperCase().trim();
  const i18nKey = POSITION_KEY_MAP[key];
  if (i18nKey) return tFn(`teamDetail.positions.${i18nKey}`);
  return POSITION_LABELS_FALLBACK[key] || key || tFn("teamDetail.unknown");
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
  const { t } = useTranslation();
  const favKey = `sport_team:${teamIdParam || teamNameParam}`;
  const isFollowing = isFavorite(favKey);
  const [posFilter, setPosFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"value_desc" | "value_asc" | "age_desc" | "age_asc" | "name_asc" | "position_asc">("value_desc");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Scroll-hide animation for filter header
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const filterTranslateY = useRef(new Animated.Value(0)).current;
  const handleScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e: any) => {
        const currentY = e.nativeEvent.contentOffset.y;
        const diff = currentY - lastScrollY.current;
        if (currentY <= 10) {
          Animated.spring(filterTranslateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        } else if (diff > 4) {
          Animated.spring(filterTranslateY, { toValue: -120, useNativeDriver: true, tension: 80, friction: 12 }).start();
        } else if (diff < -4) {
          Animated.spring(filterTranslateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        }
        lastScrollY.current = currentY;
      },
    },
  ), []);

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

  const isNationalTeam = league.includes("fifa");

  const { data: scorersData } = useQuery({
    queryKey: ["topscorers", league],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/topscorers/${encodeURIComponent(league)}`);
      return res.json();
    },
    enabled: !!league && !isNationalTeam,
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

  const heroOpacity = scrollY.interpolate({ inputRange: [0, 100], outputRange: [1, 0], extrapolate: "clamp" });
  const heroTranslateY = scrollY.interpolate({ inputRange: [0, 100], outputRange: [0, -40], extrapolate: "clamp" });
  const heroScale = scrollY.interpolate({ inputRange: [0, 100], outputRange: [1, 0.92], extrapolate: "clamp" });

  return (
    <View style={styles.container}>
      {/* Header — always visible: back button + team name stay, hero details fade */}
      <View style={{ zIndex: 30, elevation: 30 }}>
      <LinearGradient
        colors={[data?.color || "#1a3a6b", COLORS.background] as any}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={[styles.teamTitle, { flex: 1, marginHorizontal: 8 }]} numberOfLines={1}>{data?.name || teamNameParam}</Text>
          <TouchableOpacity style={styles.followBtn} onPress={() => toggleFavorite(favKey)} activeOpacity={0.75}>
            <Ionicons name={isFollowing ? "heart" : "heart-outline"} size={16} color={isFollowing ? COLORS.accent : COLORS.text} />
            <Text style={[styles.followBtnText, isFollowing && { color: COLORS.accent }]}>
              {isFollowing ? t("teamDetail.following") : t("teamDetail.follow")}
            </Text>
          </TouchableOpacity>
        </View>

        {data ? (
        <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroTranslateY }, { scale: heroScale }] }}>
        <View style={styles.teamHeaderContent}>
          <TeamLogo
            uri={data.logo || logoParam || null}
            teamName={teamName}
            size={72}
          />
          {data.shortName ? <Text style={styles.teamShort}>{data.shortName}</Text> : null}

          {/* League position row */}
          {data.leagueRank ? (
            <View style={styles.rankBadge}>
              <MaterialCommunityIcons name="trophy-outline" size={14} color="#FFD700" />
              <Text style={styles.rankText}>
                #{data.leagueRank} {data.leagueName}
                {data.leaguePoints ? `  ·  ${data.leaguePoints} pts` : ""}
                {data.leaguePlayed ? `  ·  ${t("teamDetail.matchesPlayed", { count: String(data.leaguePlayed) })}` : ""}
              </Text>
            </View>
          ) : null}

          <View style={styles.teamMetaRow}>
            {data.venue ? (
              <View style={styles.metaBadge}>
                <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{data.venue}</Text>
              </View>
            ) : null}
            {data.record ? (
              <View style={styles.metaBadge}>
                <MaterialCommunityIcons name="scoreboard-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{data.record}</Text>
              </View>
            ) : null}
          </View>
          {data.coach ? (
            <View style={styles.coachRow}>
              <Ionicons name="person-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.coachText}>{t("teamDetail.coach", { name: data.coach })}</Text>
            </View>
          ) : null}

          {(realValueCount > 0 || data.squadMarketValue) ? (
            <View style={styles.tmBadge}>
              <MaterialCommunityIcons name="currency-eur" size={11} color="#00C896" />
              <Text style={styles.tmBadgeText}>
                {data.squadMarketValue ? t("teamDetail.clubValue", { value: data.squadMarketValue }) : t("teamDetail.marketValues", { count: String(realValueCount) })}
              </Text>
            </View>
          ) : null}

          {topScorerForTeam ? (
            <View style={styles.topScorerBadge}>
              <MaterialCommunityIcons name="trophy-outline" size={13} color={COLORS.gold} />
              <Text style={styles.topScorerText}>
                {t("teamDetail.topScorerLabel", { name: topScorerForTeam.name, goals: String(topScorerForTeam.displayValue || topScorerForTeam.goals || 0) })}
              </Text>
            </View>
          ) : null}
        </View>
        </Animated.View>
        ) : null}
      </LinearGradient>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>{t("teamDetail.loadingPlayers")}</Text>
        </View>
      ) : error || !data ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>{t("teamDetail.dataUnavailable")}</Text>
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
              <Animated.View style={[styles.filterHeaderWrap, { transform: [{ translateY: filterTranslateY }] }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={[styles.filterScroll, styles.filterSticky]} contentContainerStyle={styles.filterRow}>
                  <TouchableOpacity
                    style={[styles.filterChip, posFilter === "all" && styles.filterChipActive]}
                    onPress={() => setPosFilter("all")}
                  >
                    <Text style={[styles.filterChipText, posFilter === "all" && styles.filterChipTextActive]}>
                      {t("teamDetail.all")} ({players.length})
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
                  <SortChip label={t("teamDetail.valueDesc")} active={sortKey === "value_desc"} onPress={() => setSortKey("value_desc")} />
                  <SortChip label={t("teamDetail.valueAsc")} active={sortKey === "value_asc"} onPress={() => setSortKey("value_asc")} />
                  <SortChip label={t("teamDetail.ageDesc")} active={sortKey === "age_desc"} onPress={() => setSortKey("age_desc")} />
                  <SortChip label={t("teamDetail.ageAsc")} active={sortKey === "age_asc"} onPress={() => setSortKey("age_asc")} />
                  <SortChip label={t("teamDetail.nameAZ")} active={sortKey === "name_asc"} onPress={() => setSortKey("name_asc")} />
                  <SortChip label={t("teamDetail.position")} active={sortKey === "position_asc"} onPress={() => setSortKey("position_asc")} />
                </ScrollView>
              </Animated.View>
            ) : null}
            stickyHeaderIndices={positions.length > 1 ? [0] : undefined}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.playerList}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{t("teamDetail.noPlayersFound")}</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const PlayerCard = React.memo(function PlayerCard({ player }: { player: any }) {
  const photoCandidates = [
    player?.photo,
  ].filter(Boolean) as string[];
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoUri = photoCandidates[photoIndex];
  const posColor = POSITION_COLORS[player.position] || COLORS.accent;
  const rawName = String(player?.name || "").trim();
  const safeName = rawName || tFn("teamDetail.unknown");
  const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]).join("").toUpperCase() || "?";

  return (
    <View style={styles.playerCard}>
      <View style={styles.playerTopRow}>
        <View style={[styles.jerseyBadge, { borderColor: posColor }]}> 
          <Text style={[styles.jerseyNum, { color: posColor }]}>{player.jersey || (player.position || "-")}</Text>
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
              <Text style={[styles.posTagText, { color: posColor }]} numberOfLines={1}>{positionLabel(player.position || "", player.positionName)}</Text>
            </View>
            {player.nationality ? (
              <Text style={styles.playerNat} numberOfLines={1}>{player.nationality}</Text>
            ) : <Text style={styles.playerNat} numberOfLines={1}>{tFn("teamDetail.unknown")}</Text>}
          </View>
        </View>
      </View>

      <View style={styles.playerStats}>
        <StatPill label={tFn("playerProfile.age")} value={player.age ? String(player.age) : tFn("teamDetail.unknown")} />
        <StatPill label={tFn("playerProfile.height")} value={player.height || tFn("teamDetail.unknown")} />
        <StatPill label={tFn("playerProfile.weight")} value={player.weight || tFn("teamDetail.unknown")} />
      </View>
    </View>
  );
});

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
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, flex: 1 },
  playerNameValue: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.textMuted, flexShrink: 0 },
  playerNameValueReal: { color: "#00C896" },
  playerSubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  posTag: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  posTagText: { fontFamily: "Inter_600SemiBold", fontSize: 10, maxWidth: 100 },
  playerNat: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flexShrink: 1 },
  playerStats: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingLeft: 84 },
  statPill: { alignItems: "center", gap: 1, minWidth: 68, backgroundColor: COLORS.card, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.border },
  statPillVal: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  statPillLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
});
