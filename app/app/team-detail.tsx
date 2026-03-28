import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Platform, Animated,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { NexoraCollapsingHeader } from "@/components/layout/NexoraCollapsingHeader";
import { normalizeApiError } from "@/lib/error-messages";
import { TeamLogo } from "@/components/TeamLogo";
import { StateBlock } from "@/components/ui/PremiumPrimitives";
import { useFollowState } from "@/context/UserStateContext";
import { useTranslation } from "@/lib/useTranslation";
import { t as tFn } from "@/lib/i18n";
import { getTeamOverview, sportKeys } from "@/lib/services/sports-service";
import {
  getBestCachedOrSeedPlayerImage,
  resolvePlayerImageUri,
} from "@/lib/player-image-system";

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

type TeamDetailData = {
  id: string;
  name: string;
  shortName?: string;
  logo?: string | null;
  color?: string;
  leagueName?: string;
  leagueRank?: number;
  leaguePoints?: number;
  leaguePlayed?: number;
  venue?: string;
  stadiumCapacity?: number | null;
  country?: string;
  founded?: number | null;
  clubColors?: string[];
  coach?: string;
  record?: string;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  cleanSheets?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  form?: string | null;
  recentResults?: { id: string; opponent: string; isHome: boolean; status: string; homeScore?: number; awayScore?: number; date?: string | null }[];
  upcomingMatches?: { id: string; opponent: string; isHome: boolean; status: string; date?: string | null }[];
  squadMarketValue?: string | null;
  players: any[];
  source?: string;
  error?: string;
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
    teamId: string; teamName: string; logo?: string; sport?: string; league?: string; espnLeague?: string; countryCode?: string;
  }>();
  const teamIdParam = asParam(params.teamId, "");
  const teamNameParam = asParam(params.teamName, "Team");
  const logoParam = asParam(params.logo, "");
  const sportParam = asParam(params.sport, "soccer");
  const espnLeagueParam = asParam(params.espnLeague, "");
  const leagueParam = asParam(params.league, "eng.1");
  const countryCodeParam = asParam(params.countryCode, "");
  const insets = useSafeAreaInsets();
  const { isFollowingTeam, followTeamAction, unfollowTeamAction } = useFollowState();
  const { t } = useTranslation();
  const teamFollowId = useMemo(() => {
    const raw = String(teamIdParam || teamNameParam || "").trim().toLowerCase();
    return raw || "team:unknown";
  }, [teamIdParam, teamNameParam]);
  const isFollowing = isFollowingTeam(teamFollowId);
  const [posFilter, setPosFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"value_desc" | "value_asc" | "age_desc" | "age_asc" | "name_asc" | "position_asc">("value_desc");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Scroll-hide animation for filter header
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const filterTranslateY = useRef(new Animated.Value(0)).current;
  const activeSpring = useRef<Animated.CompositeAnimation | null>(null);
  const handleScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const currentY = e.nativeEvent.contentOffset.y;
        const diff = currentY - lastScrollY.current;
        let toValue: number | null = null;
        if (currentY <= 10) {
          toValue = 0;
        } else if (diff > 4) {
          toValue = -120;
        } else if (diff < -4) {
          toValue = 0;
        }
        if (toValue !== null) {
          if (activeSpring.current) activeSpring.current.stop();
          activeSpring.current = Animated.spring(filterTranslateY, { toValue, useNativeDriver: true, tension: 80, friction: 12 });
          activeSpring.current.start(() => { activeSpring.current = null; });
        }
        lastScrollY.current = currentY;
      },
    },
  ), [filterTranslateY, scrollY]);

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

  const { data, isLoading, error, refetch } = useQuery<TeamDetailData>({
    queryKey: sportKeys.team({ teamId: teamIdParam, sport, league, countryCode: countryCodeParam }),
    queryFn: async () => {
      if (!teamIdParam) throw new Error("Team ID ontbreekt");
      return await getTeamOverview({
        teamId: teamIdParam,
        sport,
        league,
        teamName: teamNameParam,
        countryCode: countryCodeParam || undefined,
      }) as TeamDetailData;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const teamName = String(data?.name || teamNameParam || "Team");
  const hasRenderableTeamData = Boolean(
    data && (
      String((data as any)?.name || "").trim() ||
      (Array.isArray((data as any)?.players) && (data as any).players.length > 0) ||
      String((data as any)?.leagueName || "").trim() ||
      String((data as any)?.logo || "").trim()
    )
  );

  const players: any[] = useMemo(() => data?.players || [], [data?.players]);
  const headerSubtitle = useMemo(() => {
    const leagueName = String(data?.leagueName || "").trim();
    const country = String(data?.country || "").trim();
    if (leagueName && country) return `${leagueName} • ${country}`;
    return leagueName || country;
  }, [data?.country, data?.leagueName]);
  const playersWithPhoto = useMemo(
    () => players.filter((p) => Boolean(p?.photo || p?.theSportsDbPhoto)),
    [players]
  );

  const positionGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of playersWithPhoto) {
      const pos = p.position || "?";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    return groups;
  }, [playersWithPhoto]);

  const positions = Object.keys(positionGroups).sort((a, b) => {
    const ia = POSITION_ORDER.indexOf(a);
    const ib = POSITION_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const parseValueToNumber = (value: string): number => {
    const text = String(value || "").trim().toLowerCase().replace(/€/g, "").replace(/\s+/g, "");
    if (!text) return 0;
    const normalized = text.replace(/,/g, ".");
    const numberPart = Number(normalized.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numberPart)) return 0;
    if (normalized.includes("bn") || normalized.includes("b")) return numberPart * 1_000_000_000;
    if (normalized.includes("m")) return numberPart * 1_000_000;
    if (normalized.includes("k")) return numberPart * 1_000;
    return numberPart;
  };

  const filteredPlayers = useMemo(() => {
    const scoped = posFilter === "all" ? [...playersWithPhoto] : playersWithPhoto.filter(p => p.position === posFilter);
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
  }, [playersWithPhoto, posFilter, sortKey]);

  const handleToggleFollow = useCallback(async () => {
    if (isFollowing) {
      await unfollowTeamAction(teamFollowId);
      return;
    }
    await followTeamAction({
      teamId: teamFollowId,
      teamName: teamName,
      logo: data?.logo || logoParam || null,
      competition: data?.leagueName || leagueParam || null,
    });
  }, [data?.leagueName, data?.logo, followTeamAction, isFollowing, leagueParam, logoParam, teamFollowId, teamName, unfollowTeamAction]);

  return (
    <View style={styles.container}>
      <View style={{ zIndex: 30, elevation: 30 }}>
        <NexoraCollapsingHeader
          scrollY={scrollY}
          topInset={topPad}
          title={data?.name || teamNameParam}
          subtitle={headerSubtitle}
          onBack={() => router.back()}
          backgroundColor={COLORS.cardElevated}
          rightActions={
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.infoBtn}
                onPress={() => router.push({
                  pathname: "/team-info",
                  params: {
                    teamId: teamIdParam,
                    teamName: data?.name || teamNameParam,
                    sport: sport,
                    league,
                  },
                })}
                activeOpacity={0.75}
              >
                <Ionicons name="information-circle-outline" size={18} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.followBtn} onPress={() => void handleToggleFollow()} activeOpacity={0.75}>
                <Ionicons name={isFollowing ? "heart" : "heart-outline"} size={16} color={isFollowing ? COLORS.accent : COLORS.text} />
                <Text style={[styles.followBtnText, isFollowing && { color: COLORS.accent }]}>
                  {isFollowing ? t("teamDetail.following") : t("teamDetail.follow")}
                </Text>
              </TouchableOpacity>
            </View>
          }
          heroContent={data ? (
            <View style={styles.teamHeaderContent}>
              <View style={styles.teamPosterWrap}>
                <View style={styles.teamPosterGlow} />
                <TeamLogo
                  uri={data.logo || logoParam || null}
                  teamName={teamName}
                  size={118}
                />
              </View>
              {data.shortName ? <Text style={styles.teamShort}>{data.shortName}</Text> : null}
            </View>
          ) : null}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <StateBlock loading title={t("teamDetail.loadingPlayers")} message={t("common.loading") || "Loading..."} />
        </View>
      ) : error || !data || (!hasRenderableTeamData && (data as any)?.error) ? (
        <View style={styles.emptyState}>
          <StateBlock
            icon="alert-circle-outline"
            title={t("teamDetail.dataUnavailable")}
            message={error ? normalizeApiError(error).userMessage : String((data as any)?.error || t("common.unknownError") || "Unknown error")}
            actionLabel={t("teamDetail.retry") || "Opnieuw proberen"}
            onAction={() => refetch()}
          />
        </View>
      ) : (
        <>
          {/* Player list */}
          <Animated.FlatList
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
                    photo: String(item?.photo || ""),
                    theSportsDbPhoto: String(item?.theSportsDbPhoto || ""),
                  },
                })}
              >
                <PlayerCard player={item} teamName={teamName} league={league} />
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
                      {t("teamDetail.all")} ({playersWithPhoto.length})
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

const PlayerCard = React.memo(function PlayerCard({ player, teamName, league }: { player: any; teamName: string; league: string }) {
  const seed = useMemo(() => ({
    id: String(player?.id || ""),
    name: String(player?.name || ""),
    team: String(player?.currentClub || player?.team || teamName || ""),
    league: String(league || "eng.1"),
    sport: "soccer",
    photo: player?.photo || null,
    theSportsDbPhoto: player?.theSportsDbPhoto || null,
    nationality: player?.nationality || undefined,
    age: Number(player?.age || 0) || undefined,
    position: String(player?.position || player?.positionName || ""),
  }), [player?.id, player?.name, player?.currentClub, player?.team, player?.photo, player?.theSportsDbPhoto, player?.nationality, player?.age, player?.position, player?.positionName, teamName, league]);
  const [resolvedPhoto, setResolvedPhoto] = useState<string | null>(getBestCachedOrSeedPlayerImage(seed));
  const [imageFailed, setImageFailed] = useState(false);
  const playerKey = String(player?.id || player?.name || "");

  useEffect(() => {
    setResolvedPhoto(getBestCachedOrSeedPlayerImage(seed));
    setImageFailed(false);
  }, [playerKey, seed]);

  useEffect(() => {
    let cancelled = false;
    void resolvePlayerImageUri(seed, { allowNetwork: true }).then((uri) => {
      if (cancelled || !uri) return;
      setResolvedPhoto(uri);
      setImageFailed(false);
    }).catch(() => undefined);

    return () => { cancelled = true; };
  }, [seed]);

  const photoUri = !imageFailed ? resolvedPhoto : null;
  const posColor = POSITION_COLORS[player.position] || COLORS.accent;
  const rawName = String(player?.name || "").trim();
  const safeName = rawName || tFn("teamDetail.unknown");
  const jerseyValue = String(player?.jersey || "-").trim() || "-";

  return (
    <View style={styles.playerCard}>
      <View style={styles.playerTopRow}>
        <View style={[styles.jerseyBadge, { borderColor: posColor }]}> 
          <Text style={[styles.jerseyNum, { color: posColor }]}>{jerseyValue}</Text>
        </View>

        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={[styles.playerPhoto, { backgroundColor: COLORS.card }]}
            resizeMode="cover"
            onError={() => {
              setImageFailed(true);
            }}
          />
        ) : (
          <View style={[styles.playerPhoto, styles.photoPlaceholder]}>
            <Ionicons name="person" size={16} color={COLORS.textMuted} />
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
  header: { paddingHorizontal: 18, paddingBottom: 22 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  followBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8,
    minHeight: 38,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  followBtnText: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text, letterSpacing: 0.2 },
  teamHeaderContent: { alignItems: "center", gap: 10, paddingTop: 2 },
  teamPosterWrap: {
    width: 138,
    height: 138,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,16,26,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  teamPosterGlow: {
    position: "absolute",
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: "rgba(0,126,255,0.12)",
  },
  teamBigLogo: { width: 84, height: 84, borderRadius: 16 },
  logoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  logoPlaceholderText: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  teamTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  teamShort: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.5)" },
  rankBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,215,0,0.12)", borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.25)",
  },
  rankText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFD700" },
  tmBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,200,150,0.1)", borderRadius: 12,
    paddingHorizontal: 11, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(0,200,150,0.25)",
  },
  tmBadgeText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#00C896", lineHeight: 14 },
  topScorerBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,215,0,0.12)", borderRadius: 12,
    paddingHorizontal: 11, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.25)",
  },
  topScorerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.gold, lineHeight: 14 },
  topAssistBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(79,195,247,0.12)", borderRadius: 12,
    paddingHorizontal: 11, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(79,195,247,0.28)",
  },
  topAssistText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#7DD3FC", lineHeight: 14 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  emptyHintText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: 24 },
  filterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
  filterHeaderWrap: { backgroundColor: COLORS.overlayLight },
  filterSticky: { zIndex: 5, elevation: 5 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingVertical: 10 },
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
  playerList: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 44 },
  playerCard: {
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 13,
    borderRadius: 18,
    backgroundColor: COLORS.cardElevated,
    paddingHorizontal: 13,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  playerTopRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  jerseyBadge: {
    width: 32, height: 32, borderRadius: 9, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  jerseyNum: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.2 },
  playerPhoto: { width: 52, height: 52, borderRadius: 12, flexShrink: 0 },
  photoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  playerInitials: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  playerMain: { flex: 1, gap: 5 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, flex: 1 },
  playerNameValue: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.textMuted, flexShrink: 0 },
  playerNameValueReal: { color: "#00C896" },
  playerSubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  posTag: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  posTagText: { fontFamily: "Inter_600SemiBold", fontSize: 10, maxWidth: 100 },
  playerNat: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flexShrink: 1 },
  playerStats: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingLeft: 90 },
  statPill: {
    alignItems: "center",
    gap: 2,
    minWidth: 68,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  statPillVal: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  statPillLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
});
