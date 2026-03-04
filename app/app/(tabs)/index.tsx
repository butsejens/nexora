import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  RefreshControl, Platform, TouchableOpacity, TextInput,
 useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { MatchCard, UpcomingMatchRow } from "@/components/MatchCard";
import { SkeletonMatchCard } from "@/components/SkeletonCard";
import { LiveBadge } from "@/components/LiveBadge";
import { apiRequest } from "@/lib/query-client";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

type SportsPayload = {
  date?: string;
  source?: string;
  timezone?: string;
  live?: any[];
  upcoming?: any[];
  finished?: any[];
  error?: string;
};

async function fetchSportsPayload(path: string): Promise<SportsPayload> {
  const res = await apiRequest("GET", path);
  const json = await res.json();
  return {
    ...json,
    live: Array.isArray(json?.live) ? json.live : [],
    upcoming: Array.isArray(json?.upcoming) ? json.upcoming : [],
    finished: Array.isArray(json?.finished) ? json.finished : [],
  };
}

async function fetchSportsPayloadWithTimeout(path: string, timeoutMs = 6500): Promise<SportsPayload> {
  return await Promise.race([
    fetchSportsPayload(path),
    new Promise<SportsPayload>((_, reject) => setTimeout(() => reject(new Error("Sports request timeout")), timeoutMs)),
  ]);
}

const LEAGUES = [
  { name: "Alle", icon: "apps-outline", displayName: "Alle" },
  { name: "UEFA Champions League", icon: "star-outline", displayName: "Champions League" },
  { name: "UEFA Europa League", icon: "trophy-outline", displayName: "Europa League" },
  { name: "UEFA Conference League", icon: "trophy-outline", displayName: "Conference League" },
  { name: "Premier League", icon: "football-outline", displayName: "Premier League" },
  { name: "La Liga", icon: "football-outline", displayName: "La Liga" },
  { name: "Bundesliga", icon: "football-outline", displayName: "Bundesliga" },
  { name: "Serie A", icon: "football-outline", displayName: "Serie A" },
  { name: "Ligue 1", icon: "football-outline", displayName: "Ligue 1" },
  { name: "Jupiler Pro League", icon: "football-outline", displayName: "Jupiler Pro" },
];

const COMPETITIONS = [
  { name: "UEFA Champions League", espn: "uefa.champions", color: "#003399", displayName: "Champions League" },
  { name: "UEFA Europa League", espn: "uefa.europa", color: "#6e2b00", displayName: "Europa League" },
  { name: "UEFA Conference League", espn: "uefa.europa.conf", color: "#005a4e", displayName: "Conference League" },
  { name: "Premier League", espn: "eng.1", color: "#3d0099", displayName: "Premier League" },
  { name: "La Liga", espn: "esp.1", color: "#cc0033", displayName: "La Liga" },
  { name: "Bundesliga", espn: "ger.1", color: "#cc0000", displayName: "Bundesliga" },
  { name: "Serie A", espn: "ita.1", color: "#990033", displayName: "Serie A" },
  { name: "Ligue 1", espn: "fra.1", color: "#330066", displayName: "Ligue 1" },
  { name: "Jupiler Pro League", espn: "bel.1", color: "#006600", displayName: "Jupiler Pro League" },
];

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(ymd: string): string {
  const today = todayUTC();
  if (ymd === today) return "Vandaag";
  if (ymd === shiftDate(today, -1)) return "Gisteren";
  if (ymd === shiftDate(today, 1)) return "Morgen";
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      weekday: "short", day: "numeric", month: "short",
    }).format(new Date(ymd + "T12:00:00Z"));
  } catch {
    return ymd;
  }
}

function isFootballMatch(match: any): boolean {
  const sport = String(match?.sport || "").toLowerCase();
  if (sport === "football" || sport === "soccer") return true;
  const league = String(match?.league || "").toLowerCase();
  return league.includes("league") || league.includes("liga") || league.includes("bundesliga") || league.includes("serie a") || league.includes("uefa") || league.includes("jupiler");
}

// ── DateSelector ────────────────────────────────────────────────────────────
function DateSelector({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(date);

  const commit = (val: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) onDateChange(val);
    setEditing(false);
  };

  return (
    <View style={dsStyles.row}>
      <TouchableOpacity style={dsStyles.arrowBtn} onPress={() => onDateChange(shiftDate(date, -1))}>
        <Ionicons name="chevron-back" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {editing ? (
        <TextInput
          style={dsStyles.input}
          value={inputVal}
          onChangeText={setInputVal}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={COLORS.textMuted}
          autoFocus
          onBlur={() => commit(inputVal)}
          onSubmitEditing={() => commit(inputVal)}
          returnKeyType="done"
        />
      ) : (
        <TouchableOpacity
          style={dsStyles.dateLabel}
          onPress={() => { setInputVal(date); setEditing(true); }}
        >
          <Ionicons name="calendar-outline" size={14} color={COLORS.accent} />
          <Text style={dsStyles.dateLabelText}>{formatDateDisplay(date)}</Text>
          {date !== todayUTC() && <Text style={dsStyles.dateYmd}>{date}</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={dsStyles.arrowBtn} onPress={() => onDateChange(shiftDate(date, 1))}>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {date !== todayUTC() && (
        <TouchableOpacity style={dsStyles.todayBtn} onPress={() => onDateChange(todayUTC())}>
          <Text style={dsStyles.todayBtnText}>Vandaag</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const dsStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.overlayLight,
  },
  arrowBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.cardElevated, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  dateLabel: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.cardElevated, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.accent + "55",
    minWidth: 140, justifyContent: "center",
  },
  dateLabelText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  dateYmd: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  input: {
    backgroundColor: COLORS.cardElevated, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.accent,
    paddingHorizontal: 16, paddingVertical: 8,
    fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text,
    minWidth: 140, textAlign: "center",
  },
  todayBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
    backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent + "44",
  },
  todayBtnText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.accent },
});

// ── Main ────────────────────────────────────────────────────────────────────
export default function SportsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, 1100);
  const qc = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "upcoming">("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("Alle");
  const [selectedDate, setSelectedDate] = useState<string>(todayUTC());
  const [loadingGuardReached, setLoadingGuardReached] = useState(false);

  // Live – poll every 10s. Use notifyOnChangeProps to avoid flicker during background fetch.
  const liveQuery = useQuery({
    queryKey: ["sports", "live", selectedDate],
    queryFn: () => fetchSportsPayload(`/api/sports/live?date=${encodeURIComponent(selectedDate)}`),
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
    staleTime: 4_000,
    retry: 2,
    refetchOnReconnect: true,
    notifyOnChangeProps: ["data", "error"],
  });

  // Today
  const todayQuery = useQuery({
    queryKey: ["sports", "today", selectedDate],
    queryFn: async () => {
      const date = encodeURIComponent(selectedDate);
      try {
        const byDate = await fetchSportsPayloadWithTimeout(`/api/sports/by-date?date=${date}`);
        const hasByDateData = (byDate.live?.length || 0) + (byDate.upcoming?.length || 0) + (byDate.finished?.length || 0) > 0;
        if (hasByDateData || byDate.error) return byDate;
      } catch {
        // fallback below
      }
      try {
        const today = await fetchSportsPayloadWithTimeout(`/api/sports/today?date=${date}`);
        const hasData = (today.live?.length || 0) + (today.upcoming?.length || 0) + (today.finished?.length || 0) > 0;
        if (hasData || today.error) return today;
      } catch {
        // no fallback data
      }
      return { date: selectedDate, source: "espn", timezone: "Europe/Brussels", live: [], upcoming: [], finished: [] };
    },
    refetchInterval: 30_000,
    staleTime: 30_000,
    retry: 2,
    refetchOnReconnect: true,
    refetchOnMount: "always",
    notifyOnChangeProps: ["data", "error", "isLoading"],
  });

  // Only show skeleton on FIRST load (before any data is available)
  const liveFirstLoad = liveQuery.isLoading && !liveQuery.data;
  const todayFirstLoad = todayQuery.isLoading && !todayQuery.data;
  const isSportsLoading = liveFirstLoad || todayFirstLoad;

  useEffect(() => {
    if (!isSportsLoading) {
      setLoadingGuardReached(false);
      return;
    }
    const timer = setTimeout(() => setLoadingGuardReached(true), 12_000);
    return () => clearTimeout(timer);
  }, [isSportsLoading]);

  const remoteLive: any[] = useMemo(
    () => liveQuery.data?.live || todayQuery.data?.live || [],
    [liveQuery.data?.live, todayQuery.data?.live]
  );
  const remoteUpcoming: any[] = useMemo(
    () => todayQuery.data?.upcoming || [],
    [todayQuery.data?.upcoming]
  );
  const remoteFinished: any[] = useMemo(
    () => todayQuery.data?.finished || [],
    [todayQuery.data?.finished]
  );
  const hasRemoteData = remoteLive.length + remoteUpcoming.length + remoteFinished.length > 0;

  // Keep live matches visible during transient API gaps while they are still ongoing.
  const [stickyLiveMap, setStickyLiveMap] = useState<Record<string, any>>({});

  useEffect(() => {
    setStickyLiveMap({});
  }, [selectedDate]);

  useEffect(() => {
    const now = Date.now();
    setStickyLiveMap((prev) => {
      const next = { ...prev };

      for (const match of remoteLive) {
        if (!match?.id) continue;
        next[match.id] = {
          ...next[match.id],
          ...match,
          __lastSeenLiveAt: now,
        };
      }

      const finishedIds = new Set((remoteFinished || []).map((m: any) => String(m?.id || "")));
      const LIVE_STICKY_TTL_MS = 20 * 60 * 1000;
      for (const [id, match] of Object.entries(next)) {
        const seenAt = Number((match as any)?.__lastSeenLiveAt || 0);
        const expired = now - seenAt > LIVE_STICKY_TTL_MS;
        const isFinished = String((match as any)?.status || "").toLowerCase() === "finished";
        if (finishedIds.has(id) || isFinished || expired) {
          delete next[id];
        }
      }

      return next;
    });
  }, [remoteLive, remoteFinished]);

  const mergedLive = useMemo(() => {
    const byId = new Map<string, any>();
    Object.entries(stickyLiveMap).forEach(([id, m]) => byId.set(id, m));
    remoteLive.forEach((m) => {
      if (m?.id) byId.set(String(m.id), m);
    });
    return Array.from(byId.values());
  }, [remoteLive, stickyLiveMap]);

  const allLive: any[] = mergedLive.filter(isFootballMatch);
  const allUpcoming: any[] = remoteUpcoming.filter(isFootballMatch);
  const allFinished: any[] = remoteFinished.filter(isFootballMatch);
  const noRemoteData = !hasRemoteData;
  const rawApiError =
    todayQuery.data?.error ||
    liveQuery.data?.error ||
    (todayQuery.error as any)?.message ||
    (liveQuery.error as any)?.message ||
    "";
  const normalizedApiError = rawApiError ? normalizeApiError(rawApiError) : null;
  const apiErrorRef = useMemo(() => (rawApiError ? buildErrorReference("NX-SPR") : ""), [rawApiError]);

  const dataSource: string | undefined = todayQuery.data?.source || liveQuery.data?.source;
  const dataDate: string | undefined = todayQuery.data?.date;

  // League filtering with fallback: if filter returns nothing but total > 0, show all
  const filterByLeague = (matches: any[]) => {
    if (leagueFilter === "Alle") return matches;
    return matches.filter(m => {
      const ml = String(m.league || "").toLowerCase();
      const fl = leagueFilter.toLowerCase();
      return m.league === leagueFilter || ml.includes(fl) || fl.includes(ml);
    });
  };

  const rawLive = filterByLeague(allLive);
  const rawUpcoming = filterByLeague(allUpcoming);
  const rawFinished = filterByLeague(allFinished);
  const filterEmpty = leagueFilter !== "Alle" && rawLive.length === 0 && rawUpcoming.length === 0 && rawFinished.length === 0;

  const displayLive = filterEmpty ? allLive : rawLive;
  const displayUpcoming = filterEmpty ? allUpcoming : rawUpcoming;
  const displayFinished = filterEmpty ? allFinished : rawFinished;
  const featuredMatch = displayLive[0] || displayUpcoming[0] || displayFinished[0] || null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["sports", "live", selectedDate] }),
      qc.invalidateQueries({ queryKey: ["sports", "today", selectedDate] }),
      qc.invalidateQueries({ queryKey: ["sports", "by-date", selectedDate] }),
    ]);
    setRefreshing(false);
  }, [qc, selectedDate]);

  const handleMatchPress = (match: any) => {
    router.push({
      pathname: "/match-detail",
      params: {
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamLogo: match.homeTeamLogo || "",
        awayTeamLogo: match.awayTeamLogo || "",
        homeScore: String(match.homeScore ?? 0),
        awayScore: String(match.awayScore ?? 0),
        league: match.league,
        minute: match.minute !== undefined ? String(match.minute) : "",
        status: match.status,
        sport: match.sport,
      },
    });
  };

  const handleCompetitionPress = (comp: typeof COMPETITIONS[0]) => {
    router.push({
      pathname: "/competition",
      params: { league: comp.name, sport: "soccer", espnLeague: comp.espn },
    });
  };

  const bottomPad = Platform.OS === "web" ? 44 : insets.bottom + 120;
  const showLive = statusFilter !== "upcoming";
  const showUpcoming = statusFilter !== "live";
  const showLiveSection = showLive && (displayLive.length > 0 || liveFirstLoad);

  return (
    <View style={styles.container}>
      <NexoraHeader
        showSearch
        showNotification
        showFavorites
        showProfile
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      {/* Date selector */}
      <DateSelector date={selectedDate} onDateChange={setSelectedDate} />

      {/* Status Filter */}
      <View style={styles.statusFilter}>
        {(["all", "live", "upcoming"] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.statusBtn, statusFilter === f && styles.statusBtnActive]}
            onPress={() => setStatusFilter(f)}
          >
            {f === "live" && <View style={styles.liveDot} />}
            <Text style={[styles.statusBtnText, statusFilter === f && styles.statusBtnTextActive]}>
              {f === "all" ? "Alle" : f === "live" ? "Live" : "Gepland"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* League Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.leagueFilterScroll} contentContainerStyle={styles.leagueFilterRow}>
        {LEAGUES.map(league => (
          <TouchableOpacity
            key={league.name}
            style={[styles.leagueChip, leagueFilter === league.name && styles.leagueChipActive]}
            onPress={() => setLeagueFilter(league.name)}
          >
            <Ionicons
              name={league.icon as any} size={13}
              color={leagueFilter === league.name ? COLORS.accent : COLORS.textMuted} />
            <Text style={[styles.leagueChipText, leagueFilter === league.name && styles.leagueChipTextActive]}>
              {league.displayName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: bottomPad, width: contentWidth, alignSelf: "center" }}
      >
        {featuredMatch && (
          <TouchableOpacity style={styles.sportHeroFrame} onPress={() => handleMatchPress(featuredMatch)} activeOpacity={0.85}>
            <View style={styles.sportHeroCard}>
              <View style={styles.sportHeroTop}>
                <Text style={styles.sportHeroLeague} numberOfLines={1}>{featuredMatch.league}</Text>
                {featuredMatch.status === "live" ? <LiveBadge minute={featuredMatch.minute} small /> : null}
              </View>
              <View style={styles.sportHeroTeams}>
                <View style={styles.sportHeroTeamPill}>
                  <Text style={styles.sportHeroTeamText} numberOfLines={1}>{featuredMatch.homeTeam}</Text>
                </View>
                <Text style={styles.sportHeroVs}>VS</Text>
                <View style={styles.sportHeroTeamPill}>
                  <Text style={styles.sportHeroTeamText} numberOfLines={1}>{featuredMatch.awayTeam}</Text>
                </View>
              </View>
              <View style={styles.sportHeroAction}>
                <Text style={styles.sportHeroActionText}>
                  {featuredMatch.status === "live" ? "▶ Watch Live" : "▶ Bekijk wedstrijd"}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Filter fallback warning */}
        {filterEmpty && (
          <View style={styles.warnBanner}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.accent} />
            <Text style={styles.warnText}>
              Geen wedstrijden voor &quot;{leagueFilter}&quot; – alle competities getoond.
            </Text>
          </View>
        )}

        {/* API error */}
        {normalizedApiError && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color="#ff6b6b" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.errorText}>{normalizedApiError.userMessage}</Text>
              <Text style={styles.errorCodeText}>Foutcode: {apiErrorRef || normalizedApiError.code}</Text>
            </View>
          </View>
        )}

        {loadingGuardReached && (
          <View style={styles.warnBanner}>
            <Ionicons name="time-outline" size={14} color={COLORS.accent} />
            <Text style={styles.warnText}>
              Data laden duurt langer dan verwacht. Bestaande resultaten blijven zichtbaar en verversen op de achtergrond.
            </Text>
          </View>
        )}

        {noRemoteData && (
          <View style={styles.warnBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={COLORS.accent} />
            <Text style={styles.warnText}>
              Geen live data ontvangen. Alleen echte API-wedstrijden worden getoond zodra beschikbaar.
            </Text>
          </View>
        )}

        {/* Data source badge */}
        {(dataSource || dataDate) && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>
              {dataSource ? `Bron: ${dataSource.toUpperCase()}` : "Bron: -"}
              {dataDate && dataDate !== selectedDate ? ` • Datum: ${dataDate}` : ""}
            </Text>
          </View>
        )}

        {/* Competitions */}
        {leagueFilter === "Alle" && (
          <View style={styles.competitionsSection}>
            <Text style={styles.sectionTitle}>Competities</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.competitionsRow}>
              {COMPETITIONS.map(comp => (
                <TouchableOpacity
                  key={comp.name}
                  style={[styles.compCard, { borderColor: `${comp.color}44` }]}
                  onPress={() => handleCompetitionPress(comp)}
                >
                  <View style={[styles.compIcon, { backgroundColor: `${comp.color}22` }]}>
                    <MaterialCommunityIcons name="soccer" size={20} color={comp.color} />
                  </View>
                  <Text style={styles.compName} numberOfLines={2}>{comp.displayName}</Text>
                  <View style={styles.compArrow}>
                    <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Live Nu */}
        {showLiveSection && (
          <View style={styles.liveSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live Nu</Text>
              {displayLive.length > 0 && <LiveBadge />}
            </View>
            {liveFirstLoad ? (
              <FlatList horizontal data={[1, 2, 3]} keyExtractor={item => String(item)}
                renderItem={() => <SkeletonMatchCard />}
                contentContainerStyle={styles.carouselPadding}
                showsHorizontalScrollIndicator={false} />
            ) : displayLive.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>Geen live wedstrijden</Text>
                <Text style={styles.emptySubText}>Bekijk de geplande wedstrijden hieronder</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                data={displayLive}
                keyExtractor={(item: any) => item.id}
                renderItem={({ item }: { item: any }) => (
                  <MatchCard
                    match={item}
                    onPress={() => handleMatchPress(item)}
                  />
                )}
                contentContainerStyle={styles.carouselPadding}
                showsHorizontalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {/* Matchen van de dag */}
        {showUpcoming && (
          <View style={styles.upcomingSection}>
            <Text style={styles.sectionTitle}>
              {selectedDate === todayUTC() ? "Matchen van de dag" : `Matchen – ${formatDateDisplay(selectedDate)}`}
            </Text>
            {todayFirstLoad ? (
              [1, 2, 3].map(i => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={[styles.skeletonBlock, { width: "70%", height: 14 }]} />
                  <View style={[styles.skeletonBlock, { width: "20%", height: 14 }]} />
                </View>
              ))
            ) : displayUpcoming.length === 0 && displayFinished.length === 0 ? (
              <View style={styles.emptySection}>
                <Ionicons name="calendar-outline" size={32} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>Geen wedstrijden op {formatDateDisplay(selectedDate)}</Text>
                <Text style={styles.emptySubText}>Probeer een andere datum of filter</Text>
              </View>
            ) : (
              <>
                {displayUpcoming.slice(0, 50).map((match: any) => (
                  <UpcomingMatchRow key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                ))}

                {displayFinished.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.subSectionTitle}>Afgelopen</Text>
                    {displayFinished.slice(0, 50).map((match: any) => (
                      <UpcomingMatchRow key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  heroHeadline: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
    lineHeight: 30,
    color: COLORS.text,
    textAlign: "center",
    marginHorizontal: 24,
    marginTop: 14,
    marginBottom: 16,
  },
  sportHeroFrame: {
    marginHorizontal: 14,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    padding: 12,
    backgroundColor: COLORS.overlayLight,
    marginBottom: 12,
  },
  sportHeroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
    gap: 12,
  },
  sportHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sportHeroLeague: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  sportHeroTeams: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sportHeroTeamPill: {
    flex: 1,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  sportHeroTeamText: {
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    fontSize: 14,
    textAlign: "center",
  },
  sportHeroVs: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.textMuted,
    fontSize: 12,
    letterSpacing: 1,
  },
  sportHeroAction: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.overlay,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sportHeroActionText: {
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    fontSize: 14,
  },
  summaryWrap: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: COLORS.overlayLight,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  summaryMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  summaryGrid: { flexDirection: "row", gap: 8 },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  summaryValue: { fontFamily: "Inter_800ExtraBold", fontSize: 18, color: COLORS.accent },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  warnBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10,
    backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent + "44",
  },
  warnText: { color: COLORS.accent, fontSize: 12, flex: 1 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10,
    backgroundColor: "rgba(255,0,0,0.10)", borderWidth: 1, borderColor: "rgba(255,0,0,0.25)",
  },
  errorText: { color: "#ff6b6b", fontSize: 12, flex: 1 },
  errorCodeText: { color: COLORS.textMuted, fontSize: 10 },
  sourceBadge: {
    alignSelf: "flex-end", marginRight: 16, marginTop: 6,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10,
    backgroundColor: COLORS.cardElevated,
  },
  sourceText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  statusFilter: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.overlayLight,
  },
  statusBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardElevated,
  },
  statusBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  statusBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  statusBtnTextActive: { color: COLORS.accent },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.live },
  leagueFilterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.overlayLight },
  leagueFilterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  leagueChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardElevated,
  },
  leagueChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  leagueChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  leagueChipTextActive: { color: COLORS.accent },
  competitionsSection: { marginBottom: 20, marginTop: 16 },
  competitionsRow: { paddingHorizontal: 20, paddingRight: 8, gap: 10 },
  compCard: {
    width: 128, backgroundColor: COLORS.cardElevated, borderRadius: 16, padding: 12,
    alignItems: "center", gap: 8, borderWidth: 1,
  },
  compIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  compName: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.text, textAlign: "center" },
  compArrow: { position: "absolute", top: 8, right: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, marginBottom: 12, paddingHorizontal: 20 },
  subSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.textMuted, marginBottom: 10, paddingHorizontal: 20 },
  carouselPadding: { paddingHorizontal: 20, paddingRight: 8 },
  liveSection: { marginBottom: 28 },
  upcomingSection: { marginBottom: 28 },
  emptySection: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.textMuted },
  emptySubText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  skeletonRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginHorizontal: 20, marginBottom: 12, padding: 14,
    backgroundColor: COLORS.card, borderRadius: 14,
  },
  skeletonBlock: { backgroundColor: COLORS.cardElevated, borderRadius: 6, height: 14 },
});
