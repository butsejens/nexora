import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  RefreshControl, Platform, TouchableOpacity, TextInput, Alert,
  Image, useWindowDimensions, Animated } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "../../constants/colors";
import { NexoraHeader } from "../../components/NexoraHeader";
import { UpcomingMatchRow, TeamLogo } from "../../components/MatchCard";
import { SkeletonMatchCard } from "../../components/SkeletonCard";
import { LiveBadge } from "../../components/LiveBadge";
import { apiRequest } from "../../lib/query-client";
import { buildErrorReference, normalizeApiError } from "../../lib/error-messages";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getLeagueLogo } from "../../lib/logo-manager";
import {
  MatchSnapshot,
  MatchSubscription,
  ensureMatchNotificationPermission,
  initializeMatchNotifications,
  loadMatchSnapshots,
  loadMatchSubscriptions,
  pushMatchNotification,
  saveMatchSnapshots,
  saveMatchSubscriptions,
  toEventHash,
} from "../../lib/match-notifications";

type SportsPayload = {
  date?: string;
  source?: string;
  timezone?: string;
  live?: any[];
  upcoming?: any[];
  finished?: any[];
  error?: string;
};

type SportsMenuToolsPayload = {
  date?: string;
  league?: string;
  generatedAt?: string;
  source?: string;
  footballPredictions?: any[];
  dailyAccaPicks?: any[];
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

async function fetchSportsMenuTools(path: string): Promise<SportsMenuToolsPayload> {
  const res = await apiRequest("GET", path);
  const json = await res.json();
  return {
    ...json,
    footballPredictions: Array.isArray(json?.footballPredictions) ? json.footballPredictions : [],
    dailyAccaPicks: Array.isArray(json?.dailyAccaPicks) ? json.dailyAccaPicks : [],
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

const SPORT_TOOL_CARDS = [
  {
    id: "football-predictions",
    title: "Football Predictions",
    subtitle: "Top picks met 1X2 en confidence",
    icon: "analytics-outline" as const,
    accent: COLORS.accent,
  },
  {
    id: "daily-acca-picks",
    title: "Daily Acca Picks",
    subtitle: "Combinaties met hoogste value",
    icon: "ticket-outline" as const,
    accent: COLORS.green,
  },
];

type SportToolId = typeof SPORT_TOOL_CARDS[number]["id"];

function predictionSplit(match: any) {
  const base = `${match?.homeTeam || ""}-${match?.awayTeam || ""}-${match?.id || ""}`;
  let seed = 0;
  for (let i = 0; i < base.length; i += 1) seed = (seed + base.charCodeAt(i) * (i + 1)) % 997;
  const homePct = 36 + (seed % 31);
  const drawPct = 18 + (seed % 17);
  const awayPct = Math.max(6, 100 - homePct - drawPct);
  const total = homePct + drawPct + awayPct;
  return {
    home: Math.round((homePct / total) * 100),
    draw: Math.round((drawPct / total) * 100),
    away: 100 - Math.round((homePct / total) * 100) - Math.round((drawPct / total) * 100),
  };
}

function toPct(value: any): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildHomeAwayBadges(homePctRaw: any, awayPctRaw: any, drawPctRaw?: any) {
  const homePct = toPct(homePctRaw);
  const awayPct = toPct(awayPctRaw);
  const drawPct = drawPctRaw == null ? undefined : toPct(drawPctRaw);
  const homeBetter = homePct >= awayPct;
  const awayBetter = awayPct > homePct;
  const badges: { label: string; tone: "positive" | "negative" | "neutral" }[] = [
    { label: `THUIS ${homePct}%`, tone: homeBetter ? "positive" : "negative" },
    { label: `UIT ${awayPct}%`, tone: awayBetter ? "positive" : "negative" },
  ];
  if (drawPct != null) badges.push({ label: `GELIJK ${drawPct}%`, tone: "neutral" });
  return badges;
}

type CompetitionTier = "division1" | "division2" | "cup" | "national";

type CountryCompetition = {
  id: string;
  tier: CompetitionTier;
  title: string;
  league: string;
  espn: string;
  color: string;
  nationalTeamName?: string;
};

type CountryCatalog = {
  countryCode: string;
  countryName: string;
  competitions: CountryCompetition[];
};

function flagFromIso2(code: string): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🏳️";
  return String.fromCodePoint(...normalized.split("").map((ch) => 127397 + ch.charCodeAt(0)));
}

const COUNTRY_COMPETITIONS: CountryCatalog[] = [
  {
    countryCode: "BE",
    countryName: "België",
    competitions: [
      { id: "be_d1", tier: "division1", title: "1e Klasse", league: "Jupiler Pro League", espn: "bel.1", color: "#006600" },
      { id: "be_d2", tier: "division2", title: "2e Klasse", league: "Challenger Pro League", espn: "bel.2", color: "#228b22" },
      { id: "be_cup", tier: "cup", title: "Beker", league: "Belgian Cup", espn: "bel.cup", color: "#4f7d4f" },
      { id: "be_nt", tier: "national", title: "Nationaal Team", league: "Belgium National Team", espn: "fifa.world", color: "#7f9f7f", nationalTeamName: "Belgium" },
    ],
  },
  {
    countryCode: "GB",
    countryName: "Engeland",
    competitions: [
      { id: "en_d1", tier: "division1", title: "1e Klasse", league: "Premier League", espn: "eng.1", color: "#3d0099" },
      { id: "en_d2", tier: "division2", title: "2e Klasse", league: "Championship", espn: "eng.2", color: "#5220a3" },
      { id: "en_cup", tier: "cup", title: "Beker", league: "FA Cup", espn: "eng.fa", color: "#6c3eb6" },
      { id: "en_nt", tier: "national", title: "Nationaal Team", league: "England National Team", espn: "fifa.world", color: "#8460c4", nationalTeamName: "England" },
    ],
  },
  {
    countryCode: "ES",
    countryName: "Spanje",
    competitions: [
      { id: "es_d1", tier: "division1", title: "1e Klasse", league: "La Liga", espn: "esp.1", color: "#cc0033" },
      { id: "es_d2", tier: "division2", title: "2e Klasse", league: "La Liga 2", espn: "esp.2", color: "#d93d63" },
      { id: "es_cup", tier: "cup", title: "Beker", league: "Copa del Rey", espn: "esp.copa_del_rey", color: "#de5d81" },
      { id: "es_nt", tier: "national", title: "Nationaal Team", league: "Spain National Team", espn: "fifa.world", color: "#e1829f", nationalTeamName: "Spain" },
    ],
  },
  {
    countryCode: "DE",
    countryName: "Duitsland",
    competitions: [
      { id: "de_d1", tier: "division1", title: "1e Klasse", league: "Bundesliga", espn: "ger.1", color: "#cc0000" },
      { id: "de_d2", tier: "division2", title: "2e Klasse", league: "2. Bundesliga", espn: "ger.2", color: "#b42a2a" },
      { id: "de_cup", tier: "cup", title: "Beker", league: "DFB Pokal", espn: "ger.dfb_pokal", color: "#a64545" },
      { id: "de_nt", tier: "national", title: "Nationaal Team", league: "Germany National Team", espn: "fifa.world", color: "#956262", nationalTeamName: "Germany" },
    ],
  },
  {
    countryCode: "IT",
    countryName: "Italië",
    competitions: [
      { id: "it_d1", tier: "division1", title: "1e Klasse", league: "Serie A", espn: "ita.1", color: "#990033" },
      { id: "it_d2", tier: "division2", title: "2e Klasse", league: "Serie B", espn: "ita.2", color: "#ab3657" },
      { id: "it_cup", tier: "cup", title: "Beker", league: "Coppa Italia", espn: "ita.coppa_italia", color: "#b9617b" },
      { id: "it_nt", tier: "national", title: "Nationaal Team", league: "Italy National Team", espn: "fifa.world", color: "#c78a9f", nationalTeamName: "Italy" },
    ],
  },
  {
    countryCode: "FR",
    countryName: "Frankrijk",
    competitions: [
      { id: "fr_d1", tier: "division1", title: "1e Klasse", league: "Ligue 1", espn: "fra.1", color: "#330066" },
      { id: "fr_d2", tier: "division2", title: "2e Klasse", league: "Ligue 2", espn: "fra.2", color: "#5d3d82" },
      { id: "fr_cup", tier: "cup", title: "Beker", league: "Coupe de France", espn: "fra.coupe_de_france", color: "#7d63a0" },
      { id: "fr_nt", tier: "national", title: "Nationaal Team", league: "France National Team", espn: "fifa.world", color: "#9f8ac0", nationalTeamName: "France" },
    ],
  },
  {
    countryCode: "NL",
    countryName: "Nederland",
    competitions: [
      { id: "nl_d1", tier: "division1", title: "1e Klasse", league: "Eredivisie", espn: "ned.1", color: "#ff6a00" },
      { id: "nl_d2", tier: "division2", title: "2e Klasse", league: "Eerste Divisie", espn: "ned.2", color: "#ff8b2f" },
      { id: "nl_cup", tier: "cup", title: "Beker", league: "KNVB Beker", espn: "ned.knvb_beker", color: "#ffa866" },
      { id: "nl_nt", tier: "national", title: "Nationaal Team", league: "Netherlands National Team", espn: "fifa.world", color: "#ffc39a", nationalTeamName: "Netherlands" },
    ],
  },
];

const tierPriority: Record<CompetitionTier, number> = {
  division1: 1,
  division2: 2,
  cup: 3,
  national: 4,
};

const normalizeLeagueKey = (value: string): string =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const competitionRankByLeague = COUNTRY_COMPETITIONS
  .flatMap((country) => country.competitions)
  .reduce<Record<string, number>>((acc, competition) => {
    acc[normalizeLeagueKey(competition.league)] = tierPriority[competition.tier] ?? 9;
    return acc;
  }, {
    [normalizeLeagueKey("UEFA Champions League")]: 1,
    [normalizeLeagueKey("UEFA Europa League")]: 2,
    [normalizeLeagueKey("UEFA Conference League")]: 3,
  });

const espnLeagueByName = COUNTRY_COMPETITIONS
  .flatMap((country) => country.competitions)
  .reduce<Record<string, string>>((acc, competition) => {
    acc[normalizeLeagueKey(competition.league)] = competition.espn;
    return acc;
  }, {
    [normalizeLeagueKey("UEFA Champions League")]: "uefa.champions",
    [normalizeLeagueKey("UEFA Europa League")]: "uefa.europa",
    [normalizeLeagueKey("UEFA Conference League")]: "uefa.europa.conf",
    [normalizeLeagueKey("Premier League")]: "eng.1",
  });

const interestingEventRegex = /(goal|kaart|card|halftime|half-time|break|einde|end|full time|kick[- ]?off|start)/i;

function parseMatchTimestamp(match: any, selectedDate: string): number {
  const startDate = match?.startDate ? Date.parse(String(match.startDate)) : Number.NaN;
  if (Number.isFinite(startDate)) return startDate;

  const time = String(match?.startTime || "");
  const m = time.match(/(\d{1,2}):(\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return Number.MAX_SAFE_INTEGER;
  return new Date(`${selectedDate}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`).getTime();
}

function sortMatchesByCompetitionAndTime(matches: any[], selectedDate: string): any[] {
  return [...matches].sort((a, b) => {
    const rankA = competitionRankByLeague[normalizeLeagueKey(a?.league || "")] ?? 9;
    const rankB = competitionRankByLeague[normalizeLeagueKey(b?.league || "")] ?? 9;
    if (rankA !== rankB) return rankA - rankB;

    const timeA = parseMatchTimestamp(a, selectedDate);
    const timeB = parseMatchTimestamp(b, selectedDate);
    if (timeA !== timeB) return timeA - timeB;

    return String(a?.league || "").localeCompare(String(b?.league || ""));
  });
}

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
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(COUNTRY_COMPETITIONS[0]?.countryCode || "BE");
  const [selectedDate, setSelectedDate] = useState<string>(todayUTC());
  const [sportsView, setSportsView] = useState<"competitions" | "live" | "upcoming" | "menu">("competitions");
  const [activeSportTool, setActiveSportTool] = useState<SportToolId>("football-predictions");
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [loadingGuardReached, setLoadingGuardReached] = useState(false);
  const [matchSubscriptions, setMatchSubscriptions] = useState<Record<string, MatchSubscription>>({});
  const subscriptionsRef = useRef<Record<string, MatchSubscription>>({});
  const matchSnapshotsRef = useRef<Record<string, MatchSnapshot>>({});
  const notificationCooldownRef = useRef<Record<string, number>>({});
  const lastScrollYRef = useRef(0);
  const showFiltersRef = useRef(true);
  const lastFilterToggleAtRef = useRef(0);
  const filterAnim = useRef(new Animated.Value(1)).current;

  const toggleFiltersVisibility = useCallback((visible: boolean) => {
    if (showFiltersRef.current === visible) return;
    const now = Date.now();
    if (now - lastFilterToggleAtRef.current < 220) return;
    lastFilterToggleAtRef.current = now;
    showFiltersRef.current = visible;
    setFiltersVisible(visible);
    Animated.timing(filterAnim, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [filterAnim]);

  useEffect(() => {
    let active = true;
    (async () => {
      await initializeMatchNotifications();
      const [storedSubs, storedSnapshots] = await Promise.all([
        loadMatchSubscriptions(),
        loadMatchSnapshots(),
      ]);
      if (!active) return;
      const byId = (storedSubs || []).reduce<Record<string, MatchSubscription>>((acc, sub) => {
        if (sub?.id) acc[sub.id] = sub;
        return acc;
      }, {});
      subscriptionsRef.current = byId;
      setMatchSubscriptions(byId);
      matchSnapshotsRef.current = storedSnapshots || {};
    })();
    return () => {
      active = false;
    };
  }, []);

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

  const toolsQuery = useQuery({
    queryKey: ["sports", "menu-tools", selectedDate, leagueFilter],
    queryFn: () => fetchSportsMenuTools(`/api/sports/menu-tools?date=${encodeURIComponent(selectedDate)}&league=${encodeURIComponent(leagueFilter)}`),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
    refetchOnReconnect: true,
    notifyOnChangeProps: ["data", "error", "isFetching"],
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
  const sortedLive = useMemo(() => sortMatchesByCompetitionAndTime(displayLive, selectedDate), [displayLive, selectedDate]);
  const sortedUpcoming = useMemo(() => sortMatchesByCompetitionAndTime(displayUpcoming, selectedDate), [displayUpcoming, selectedDate]);
  const sortedFinished = useMemo(() => sortMatchesByCompetitionAndTime(displayFinished, selectedDate), [displayFinished, selectedDate]);
  const currentMatchesById = useMemo(() => {
    const map = new Map<string, any>();
    [...sortedUpcoming, ...sortedLive, ...sortedFinished].forEach((match) => {
      const id = String(match?.id || "");
      if (!id) return;
      map.set(id, match);
    });
    return map;
  }, [sortedFinished, sortedLive, sortedUpcoming]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["sports", "live", selectedDate] }),
      qc.invalidateQueries({ queryKey: ["sports", "today", selectedDate] }),
      qc.invalidateQueries({ queryKey: ["sports", "by-date", selectedDate] }),
    ]);
    setRefreshing(false);
  }, [qc, selectedDate]);

  const handleFeedScroll = useCallback((event: any) => {
    const nextY = Number(event?.nativeEvent?.contentOffset?.y || 0);
    const prevY = lastScrollYRef.current;
    const delta = nextY - prevY;
    lastScrollYRef.current = nextY;

    if (nextY <= 16) {
      toggleFiltersVisibility(true);
      return;
    }

    if (delta > 12 && nextY > 120) {
      toggleFiltersVisibility(false);
    } else if (delta < -10) {
      toggleFiltersVisibility(true);
    }
  }, [toggleFiltersVisibility]);

  const sportToolSourceMatches = useMemo(() => {
    if (sortedUpcoming.length > 0) return sortedUpcoming;
    if (sortedLive.length > 0) return sortedLive;
    return sortedFinished;
  }, [sortedFinished, sortedLive, sortedUpcoming]);

  const sportMenuPreview = useMemo(
    () => sportToolSourceMatches.slice(0, 6).map((match) => ({
      match,
      split: predictionSplit(match),
    })),
    [sportToolSourceMatches]
  );

  const backendPredictions = useMemo(() => Array.isArray(toolsQuery.data?.footballPredictions) ? toolsQuery.data.footballPredictions : [], [toolsQuery.data?.footballPredictions]);
  const backendAcca = useMemo(() => Array.isArray(toolsQuery.data?.dailyAccaPicks) ? toolsQuery.data.dailyAccaPicks : [], [toolsQuery.data?.dailyAccaPicks]);

  const activeToolRows = useMemo(() => {
    if (activeSportTool === "football-predictions") {
      const rows = backendPredictions.length > 0
        ? backendPredictions.slice(0, 8).map((item: any) => ({
            key: `pred_${item.matchId}`,
            title: `${item.homeTeam} vs ${item.awayTeam}`,
            meta: `${item.homePct}% · ${item.drawPct}% · ${item.awayPct}% · ${item.confidence}% conf.`,
            badges: buildHomeAwayBadges(item.homePct, item.awayPct, item.drawPct),
            item,
          }))
        : sportMenuPreview.slice(0, 6).map(({ match, split }) => ({
            key: `pred_${match.id}`,
            title: `${match.homeTeam} vs ${match.awayTeam}`,
            meta: `${split.home}% · ${split.draw}% · ${split.away}%`,
            badges: buildHomeAwayBadges(split.home, split.away, split.draw),
            match,
          }));
      return rows;
    }

    if (activeSportTool === "daily-acca-picks") {
      const rows = backendAcca.length > 0
        ? backendAcca.slice(0, 8).map((item: any) => ({
            key: `acca_${item.matchId}`,
            title: `${item.pickLabel} · ${item.homeTeam} - ${item.awayTeam}`,
            meta: `${item.market} · Confidence ${item.confidence}%`,
            badges: buildHomeAwayBadges(item.homePct, item.awayPct, item.drawPct),
            item,
          }))
        : sportMenuPreview.slice(0, 6).map(({ match, split }) => {
            const side = split.home >= split.away ? "1" : "2";
            const confidence = Math.max(split.home, split.away);
            return {
              key: `acca_${match.id}`,
              title: `${side} · ${match.homeTeam} - ${match.awayTeam}`,
              meta: `Confidence ${confidence}%`,
              badges: buildHomeAwayBadges(split.home, split.away, split.draw),
              match,
            };
          });
      return rows;
    }

    return [];
  }, [activeSportTool, backendAcca, backendPredictions, sportMenuPreview]);

  const activeSportToolCard = useMemo(
    () => SPORT_TOOL_CARDS.find((card) => card.id === activeSportTool) || SPORT_TOOL_CARDS[0],
    [activeSportTool]
  );

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

  const handleToolMatchPress = (item: any) => {
    handleMatchPress({
      ...item,
      id: item?.id || item?.matchId,
      sport: item?.sport || "football",
      status: item?.status || "upcoming",
      homeScore: item?.homeScore ?? 0,
      awayScore: item?.awayScore ?? 0,
      homeTeamLogo: item?.homeTeamLogo || "",
      awayTeamLogo: item?.awayTeamLogo || "",
      minute: item?.minute || "",
    });
  };

  const resolveEspnLeague = useCallback((match: any): string => {
    const direct = String(match?.espnLeague || "").trim();
    if (direct) return direct;
    return espnLeagueByName[normalizeLeagueKey(String(match?.league || ""))] || "eng.1";
  }, []);

  const setSubscriptionsAndPersist = useCallback(async (next: Record<string, MatchSubscription>) => {
    subscriptionsRef.current = next;
    setMatchSubscriptions(next);
    await saveMatchSubscriptions(Object.values(next));
  }, []);

  const shouldNotify = useCallback((key: string, cooldownMs = 10_000) => {
    const now = Date.now();
    const lastAt = Number(notificationCooldownRef.current[key] || 0);
    if (now - lastAt < cooldownMs) return false;
    notificationCooldownRef.current[key] = now;
    return true;
  }, []);

  const toggleMatchNotification = useCallback(async (match: any) => {
    const id = String(match?.id || "");
    if (!id) return;

    const currentlyOn = Boolean(subscriptionsRef.current[id]);
    if (currentlyOn) {
      const next = { ...subscriptionsRef.current };
      delete next[id];
      await setSubscriptionsAndPersist(next);
      await pushMatchNotification(
        "Meldingen uitgeschakeld",
        `${match.homeTeam} - ${match.awayTeam}`,
        { matchId: id }
      );
      return;
    }

    const permission = await ensureMatchNotificationPermission();
    if (!permission) {
      Alert.alert("Meldingen geblokkeerd", "Geef notificatie-toestemming om match updates te ontvangen.");
      return;
    }

    const next = {
      ...subscriptionsRef.current,
      [id]: {
        id,
        espnLeague: resolveEspnLeague(match),
        homeTeam: String(match?.homeTeam || "Thuis"),
        awayTeam: String(match?.awayTeam || "Uit"),
      },
    };
    await setSubscriptionsAndPersist(next);
    await pushMatchNotification(
      "Meldingen ingeschakeld",
      `${match.homeTeam} - ${match.awayTeam} wordt gevolgd`,
      { matchId: id }
    );
  }, [resolveEspnLeague, setSubscriptionsAndPersist]);

  useEffect(() => {
    const activeSubs = Object.values(matchSubscriptions);
    if (activeSubs.length === 0) return;

    let alive = true;
    const poll = async () => {
      const nextSnapshots = { ...matchSnapshotsRef.current };
      let changed = false;

      for (const sub of activeSubs.slice(0, 30)) {
        try {
          const feedMatch = currentMatchesById.get(String(sub.id));
          if (feedMatch) {
            const prev = nextSnapshots[sub.id];
            const currentStatus = String(feedMatch?.status || "");
            const currentHomeScore = Number(feedMatch?.homeScore ?? 0);
            const currentAwayScore = Number(feedMatch?.awayScore ?? 0);

            if (prev) {
              if (prev.status !== "live" && currentStatus === "live" && shouldNotify(`${sub.id}:start`, 20_000)) {
                await pushMatchNotification("Wedstrijd gestart", `${sub.homeTeam} - ${sub.awayTeam} is begonnen`, { matchId: sub.id });
              }
              if (prev.status !== "finished" && currentStatus === "finished" && shouldNotify(`${sub.id}:finished`, 20_000)) {
                await pushMatchNotification(
                  "Wedstrijd afgelopen",
                  `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`,
                  { matchId: sub.id }
                );
              }
              if (
                currentStatus === "live"
                && (prev.homeScore !== currentHomeScore || prev.awayScore !== currentAwayScore)
                && shouldNotify(`${sub.id}:score`, 10_000)
              ) {
                await pushMatchNotification(
                  "Doelpunt update",
                  `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`,
                  { matchId: sub.id }
                );
              }
            }

            nextSnapshots[sub.id] = {
              status: currentStatus,
              homeScore: currentHomeScore,
              awayScore: currentAwayScore,
              eventHashes: prev?.eventHashes || [],
            };
            changed = true;
            continue;
          }

          const league = encodeURIComponent(sub.espnLeague || "eng.1");
          const res = await apiRequest("GET", `/api/sports/match/${encodeURIComponent(sub.id)}?league=${league}`);
          const detail = await res.json();
          if (!detail || !detail.id) continue;

          const prev = nextSnapshots[sub.id];
          const currentStatus = String(detail?.status || "");
          const currentHomeScore = Number(detail?.homeScore ?? 0);
          const currentAwayScore = Number(detail?.awayScore ?? 0);

          const keyEvents = Array.isArray(detail?.keyEvents) ? detail.keyEvents : [];
          const eventHashes = keyEvents
            .filter((event: any) => interestingEventRegex.test(`${event?.type || ""} ${event?.detail || ""}`))
            .map((event: any) => toEventHash(event));

          if (prev) {
            if (prev.status !== "live" && currentStatus === "live" && shouldNotify(`${sub.id}:start`, 20_000)) {
              await pushMatchNotification("Wedstrijd gestart", `${sub.homeTeam} - ${sub.awayTeam} is begonnen`, { matchId: sub.id });
            }
            if (prev.status !== "finished" && currentStatus === "finished" && shouldNotify(`${sub.id}:finished`, 20_000)) {
              await pushMatchNotification(
                "Wedstrijd afgelopen",
                `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`,
                { matchId: sub.id }
              );
            }

            if (
              currentStatus === "live"
              && (prev.homeScore !== currentHomeScore || prev.awayScore !== currentAwayScore)
              && shouldNotify(`${sub.id}:score`, 10_000)
            ) {
              await pushMatchNotification(
                "Doelpunt update",
                `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`,
                { matchId: sub.id }
              );
            }

            const seen = new Set(prev.eventHashes || []);
            const newInterestingEvents = keyEvents.filter((event: any) => {
              const hash = toEventHash(event);
              if (seen.has(hash)) return false;
              return interestingEventRegex.test(`${event?.type || ""} ${event?.detail || ""}`);
            });

            if (newInterestingEvents.length > 0 && shouldNotify(`${sub.id}:events`, 10_000)) {
              const latest = newInterestingEvents[newInterestingEvents.length - 1];
              const evTime = latest?.time ? `${latest.time} • ` : "";
              const evType = String(latest?.type || "Event");
              const evDetail = String(latest?.detail || "").trim();
              const countPrefix = newInterestingEvents.length > 1 ? `+${newInterestingEvents.length} updates\n` : "";
              const scoreLine = `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`;
              const body = `${countPrefix}${scoreLine}\n${evTime}${evType}${evDetail ? `: ${evDetail}` : ""}`;
              await pushMatchNotification("Match event", body, { matchId: sub.id });
            }
          }

          nextSnapshots[sub.id] = {
            status: currentStatus,
            homeScore: currentHomeScore,
            awayScore: currentAwayScore,
            eventHashes,
          };
          changed = true;
        } catch {
          // keep polling other subscriptions
        }
      }

      if (changed && alive) {
        matchSnapshotsRef.current = nextSnapshots;
        await saveMatchSnapshots(nextSnapshots);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 20_000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [currentMatchesById, matchSubscriptions, shouldNotify]);

  const handleCompetitionPress = (comp: CountryCompetition) => {
    router.push({
      pathname: "/competition",
      params: { league: comp.league, sport: "soccer", espnLeague: comp.espn },
    });
  };

  const selectedCountry = useMemo(
    () => COUNTRY_COMPETITIONS.find((country) => country.countryCode === selectedCountryCode) || COUNTRY_COMPETITIONS[0],
    [selectedCountryCode]
  );

  const tierLabel = (tier: CompetitionTier) => {
    if (tier === "division1") return "1e Klasse";
    if (tier === "division2") return "2e Klasse";
    if (tier === "cup") return "Beker";
    return "Nationaal Team";
  };

  const tierIcon = (tier: CompetitionTier) => {
    if (tier === "division1") return "trophy-outline";
    if (tier === "division2") return "podium-outline";
    if (tier === "cup") return "medal-outline";
    return "flag-outline";
  };

  const bottomPad = Platform.OS === "web" ? 44 : insets.bottom + 120;
  const showLive = sportsView === "live" && statusFilter !== "upcoming";
  const showUpcoming = sportsView === "upcoming" && statusFilter !== "live";
  const showMenuSection = sportsView === "menu";
  const showCompetitionsSection = sportsView === "competitions";
  const showLiveSection = showLive && (sortedLive.length > 0 || liveFirstLoad);

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

      <Animated.View
        pointerEvents={filtersVisible ? "auto" : "none"}
        style={{
        overflow: "hidden",
        opacity: filterAnim,
        maxHeight: filterAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
        }}>
          {/* Status Filter */}
          <View style={styles.statusFilter}>
            {(["all", "live", "upcoming"] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.statusBtn, statusFilter === f && styles.statusBtnActive]}
                onPress={() => {
                  toggleFiltersVisibility(true);
                  setStatusFilter(f);
                }}
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
                onPress={() => {
                  toggleFiltersVisibility(true);
                  setLeagueFilter(league.name);
                }}
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
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleFeedScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={{ paddingBottom: bottomPad, width: contentWidth, alignSelf: "center" }}
      >
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

        <View style={[styles.statusFilter, { marginTop: 8 }]}> 
          {([
            { id: "competitions", label: "Competities" },
            { id: "live", label: "Live" },
            { id: "upcoming", label: "Volgende" },
            { id: "menu", label: "Sport Menu" },
          ] as const).map((view) => (
            <TouchableOpacity
              key={view.id}
              style={[styles.statusBtn, sportsView === view.id && styles.statusBtnActive]}
              onPress={() => setSportsView(view.id)}
            >
              <Text style={[styles.statusBtnText, sportsView === view.id && styles.statusBtnTextActive]}>{view.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hero match banner — live match first, fall back to first upcoming */}
        {(showLive || showUpcoming) && (sortedLive.length > 0 || sortedUpcoming.length > 0) && (() => {
          const isLive = sortedLive.length > 0;
          const hero = isLive ? sortedLive[0] : sortedUpcoming[0];
          const leagueLogo = getLeagueLogo(hero.league);
          return (
            <TouchableOpacity
              style={[styles.heroMatchWrapper, isLive && styles.heroMatchWrapperLive]}
              onPress={() => handleMatchPress(hero)}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[...(hero.heroGradient || ["#0B2359", "#0d1b3e"])] as any}
                style={styles.heroMatchGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.heroLeagueRow}>
                  {leagueLogo ? (
                    <Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }} style={styles.heroLeagueLogo} resizeMode="contain" />
                  ) : null}
                  <Text style={styles.heroLeagueName} numberOfLines={1}>{hero.league}</Text>
                  {isLive ? <LiveBadge minute={hero.minute} small /> : (
                    <View style={styles.heroUpcomingBadge}>
                      <Ionicons name="time-outline" size={10} color={COLORS.accent} />
                      <Text style={styles.heroUpcomingTime}>{hero.startTime}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.heroTeamRow}>
                  <View style={styles.heroTeamBlock}>
                    <TeamLogo uri={hero.homeTeamLogo} teamName={hero.homeTeam} size={76} />
                    <Text style={styles.heroTeamName} numberOfLines={2}>{hero.homeTeam}</Text>
                  </View>
                  <View style={styles.heroScoreBlock}>
                    {isLive ? (
                      <>
                        <Text style={styles.heroScore}>{hero.homeScore}</Text>
                        <Text style={styles.heroScoreSep}>:</Text>
                        <Text style={styles.heroScore}>{hero.awayScore}</Text>
                      </>
                    ) : (
                      <View style={{ alignItems: "center", gap: 4 }}>
                        <Text style={styles.heroVsText}>vs</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Aanvang</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.heroTeamBlock}>
                    <TeamLogo uri={hero.awayTeamLogo} teamName={hero.awayTeam} size={76} />
                    <Text style={styles.heroTeamName} numberOfLines={2}>{hero.awayTeam}</Text>
                  </View>
                </View>
                <View style={styles.heroActionRow}>
                  <Text style={styles.heroActionText}>{isLive ? "Live · Meer info" : "Bekijk wedstrijd"}</Text>
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })()}

        {showMenuSection && <View style={styles.sportToolsSection}>
          <Text style={styles.sectionTitle}>Sport Menu</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sportMenuRow}
          >
            {SPORT_TOOL_CARDS.map((card) => {
              const isActive = activeSportTool === card.id;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.sportToolCard, isActive && { borderColor: card.accent }]}
                  activeOpacity={0.85}
                  onPress={() => setActiveSportTool(card.id)}
                >
                  <LinearGradient
                    colors={isActive ? [COLORS.cardElevated, COLORS.card] : [COLORS.card, COLORS.background]}
                    style={styles.sportToolCardInner}
                  >
                    <View style={[styles.sportToolIconWrap, { backgroundColor: `${card.accent}22`, borderColor: `${card.accent}55` }]}>
                      <Ionicons name={card.icon} size={16} color={card.accent} />
                    </View>
                    <Text style={styles.sportToolTitle} numberOfLines={1}>{card.title}</Text>
                    <Text style={styles.sportToolSubtitle} numberOfLines={2}>{card.subtitle}</Text>
                    <View style={styles.sportToolActionRow}>
                      <Text style={[styles.sportToolAction, { color: card.accent }]}>Open menu</Text>
                      <Ionicons name="chevron-forward" size={14} color={card.accent} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <LinearGradient colors={[COLORS.cardElevated, COLORS.background]} style={styles.sportToolPanel}>
            <View style={styles.sportToolPanelHeader}>
              <Text style={styles.sportToolPanelTitle}>{activeSportToolCard.title}</Text>
              <Text style={styles.sportToolPanelCount}>{activeToolRows.length} picks</Text>
            </View>
            {activeToolRows.length > 0 ? activeToolRows.map((row: any) => (
              <TouchableOpacity
                key={row.key}
                style={styles.sportToolRow}
                onPress={() => row.item ? handleToolMatchPress(row.item) : handleMatchPress(row.match)}
              >
                <Text style={styles.sportToolRowTeams} numberOfLines={1}>{row.title}</Text>
                <Text style={styles.sportToolRowMeta} numberOfLines={1}>{row.meta}</Text>
                {Array.isArray(row.badges) && row.badges.length > 0 && (
                  <View style={styles.sportToolBadgeRow}>
                    {row.badges.slice(0, 3).map((badge: any, idx: number) => (
                      <View
                        key={`${row.key}_badge_${idx}`}
                        style={[
                          styles.sportToolBadge,
                          badge.tone === "positive" && styles.sportToolBadgePositive,
                          badge.tone === "negative" && styles.sportToolBadgeNegative,
                        ]}
                      >
                        <Text style={styles.sportToolBadgeText}>{badge.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )) : (
              <Text style={styles.sportToolEmpty}>Nog geen data beschikbaar voor dit menu.</Text>
            )}
          </LinearGradient>
        </View>}

        {/* Competitions */}
        {showCompetitionsSection && (
          <View style={styles.competitionsSection}>
            <Text style={styles.sectionTitle}>Competities</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryRow}>
              {COUNTRY_COMPETITIONS.map((country) => {
                const active = selectedCountryCode === country.countryCode;
                return (
                  <TouchableOpacity
                    key={country.countryCode}
                    style={[styles.countryChip, active && styles.countryChipActive]}
                    onPress={() => setSelectedCountryCode(country.countryCode)}
                  >
                    <Text style={styles.countryFlag}>{flagFromIso2(country.countryCode)}</Text>
                    <Text style={[styles.countryChipText, active && styles.countryChipTextActive]}>{country.countryName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.countryCompetitionsPanel}>
              <Text style={styles.countryPanelTitle}>
                {selectedCountry?.countryName} · Competities
              </Text>
              {(selectedCountry?.competitions || []).map((comp) => (
                <TouchableOpacity
                  key={comp.id}
                  style={[styles.countryCompetitionCard, { borderColor: `${comp.color}55` }]}
                  onPress={() => {
                    if (comp.tier === "national" && comp.nationalTeamName) {
                      router.push({
                        pathname: "/team-detail",
                        params: {
                          teamId: `name:${encodeURIComponent(comp.nationalTeamName)}`,
                          teamName: comp.nationalTeamName,
                          sport: "soccer",
                          league: comp.espn,
                        },
                      });
                      return;
                    }
                    handleCompetitionPress(comp);
                  }}
                >
                  <View style={[styles.countryCompetitionIcon, { backgroundColor: `${comp.color}22` }]}> 
                    <Ionicons name={tierIcon(comp.tier) as any} size={16} color={comp.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.countryCompetitionLabel}>{tierLabel(comp.tier)}</Text>
                    <Text style={styles.countryCompetitionName} numberOfLines={1}>{comp.league}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Live Nu */}
        {showLiveSection && (
          <View style={styles.liveSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live Nu</Text>
              {sortedLive.length > 0 && <LiveBadge />}
            </View>
            {liveFirstLoad ? (
              <FlatList horizontal data={[1, 2, 3]} keyExtractor={item => String(item)}
                renderItem={() => <SkeletonMatchCard />}
                contentContainerStyle={styles.carouselPadding}
                showsHorizontalScrollIndicator={false} />
            ) : sortedLive.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>Geen live wedstrijden</Text>
                <Text style={styles.emptySubText}>Bekijk de geplande wedstrijden hieronder</Text>
              </View>
            ) : (
              (() => {
                const groups: { league: string; matches: any[] }[] = [];
                sortedLive.slice(0, 60).forEach((m: any) => {
                  const last = groups[groups.length - 1];
                  if (last && last.league === m.league) { last.matches.push(m); }
                  else { groups.push({ league: m.league, matches: [m] }); }
                });
                return groups.map((group, gi) => (
                  <View key={group.league + gi + "l"}>
                    <View style={styles.competitionGroupHeader}>
                      {getLeagueLogo(group.league) ? (
                        <Image
                          source={typeof getLeagueLogo(group.league) === "number" ? getLeagueLogo(group.league) as any : { uri: getLeagueLogo(group.league) as string }}
                          style={styles.competitionGroupLogo}
                          resizeMode="contain"
                        />
                      ) : (
                        <Ionicons name="football-outline" size={14} color={COLORS.textMuted} />
                      )}
                      <Text style={styles.competitionGroupName} numberOfLines={1}>{group.league}</Text>
                      <View style={styles.competitionGroupLine} />
                      <Text style={styles.competitionGroupCount}>{group.matches.length}</Text>
                    </View>
                    {group.matches.map((match: any) => (
                      <UpcomingMatchRow
                        key={match.id}
                        match={match}
                        onPress={() => handleMatchPress(match)}
                        onToggleNotification={() => toggleMatchNotification(match)}
                        notificationsEnabled={Boolean(matchSubscriptions[String(match?.id || "")])}
                      />
                    ))}
                  </View>
                ));
              })()
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
            ) : sortedUpcoming.length === 0 && sortedFinished.length === 0 ? (
              <View style={styles.emptySection}>
                <Ionicons name="calendar-outline" size={32} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>Geen wedstrijden op {formatDateDisplay(selectedDate)}</Text>
                <Text style={styles.emptySubText}>Probeer een andere datum of filter</Text>
              </View>
            ) : (
              <>
                {sortedUpcoming.length > 0 && <Text style={styles.subSectionTitle}>Binnenkort</Text>}
                {(() => {
                  const groups: { league: string; matches: any[] }[] = [];
                  sortedUpcoming.slice(0, 60).forEach((m: any) => {
                    const last = groups[groups.length - 1];
                    if (last && last.league === m.league) { last.matches.push(m); }
                    else { groups.push({ league: m.league, matches: [m] }); }
                  });
                  return groups.map((group, gi) => (
                    <View key={group.league + gi}>
                      <View style={styles.competitionGroupHeader}>
                        {getLeagueLogo(group.league) ? (
                          <Image
                            source={typeof getLeagueLogo(group.league) === "number" ? getLeagueLogo(group.league) as any : { uri: getLeagueLogo(group.league) as string }}
                            style={styles.competitionGroupLogo}
                            resizeMode="contain"
                          />
                        ) : (
                          <Ionicons name="football-outline" size={14} color={COLORS.textMuted} />
                        )}
                        <Text style={styles.competitionGroupName} numberOfLines={1}>{group.league}</Text>
                        <View style={styles.competitionGroupLine} />
                        <Text style={styles.competitionGroupCount}>{group.matches.length}</Text>
                      </View>
                      {group.matches.map((match: any) => (
                        <UpcomingMatchRow
                          key={match.id}
                          match={match}
                          onPress={() => handleMatchPress(match)}
                          onToggleNotification={() => toggleMatchNotification(match)}
                          notificationsEnabled={Boolean(matchSubscriptions[String(match?.id || "")])}
                        />
                      ))}
                    </View>
                  ));
                })()}

                {sortedFinished.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.subSectionTitle}>Afgelopen</Text>
                    {(() => {
                      const groups: { league: string; matches: any[] }[] = [];
                      sortedFinished.slice(0, 60).forEach((m: any) => {
                        const last = groups[groups.length - 1];
                        if (last && last.league === m.league) { last.matches.push(m); }
                        else { groups.push({ league: m.league, matches: [m] }); }
                      });
                      return groups.map((group, gi) => (
                        <View key={group.league + gi + "f"}>
                          <View style={styles.competitionGroupHeader}>
                            {getLeagueLogo(group.league) ? (
                              <Image
                                source={typeof getLeagueLogo(group.league) === "number" ? getLeagueLogo(group.league) as any : { uri: getLeagueLogo(group.league) as string }}
                                style={styles.competitionGroupLogo}
                                resizeMode="contain"
                              />
                            ) : (
                              <Ionicons name="football-outline" size={14} color={COLORS.textMuted} />
                            )}
                            <Text style={styles.competitionGroupName} numberOfLines={1}>{group.league}</Text>
                            <View style={styles.competitionGroupLine} />
                            <Text style={styles.competitionGroupCount}>{group.matches.length}</Text>
                          </View>
                          {group.matches.map((match: any) => (
                            <UpcomingMatchRow
                              key={match.id}
                              match={match}
                              onPress={() => handleMatchPress(match)}
                              onToggleNotification={() => toggleMatchNotification(match)}
                              notificationsEnabled={Boolean(matchSubscriptions[String(match?.id || "")])}
                            />
                          ))}
                        </View>
                      ));
                    })()}
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
  sportToolsSection: { marginBottom: 20, marginTop: 10 },
  sportMenuRow: { paddingHorizontal: 20, paddingRight: 8, gap: 12 },
  sportMenuChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  sportMenuChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textSecondary },
  sportToolPanel: {
    marginTop: 12,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
    padding: 14,
    gap: 9,
  },
  sportToolPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sportToolPanelTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  sportToolPanelCount: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  sportToolSubTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  sportToolRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlayLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  sportToolRowTeams: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  sportToolRowMeta: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  sportToolBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  sportToolBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sportToolBadgePositive: { borderColor: `${COLORS.green}66`, backgroundColor: "rgba(0,230,118,0.16)" },
  sportToolBadgeNegative: { borderColor: `${COLORS.live}66`, backgroundColor: "rgba(255,48,64,0.16)" },
  sportToolBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.text },
  sportToolEmpty: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  builderPickRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  builderPickChip: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 230,
  },
  builderPickChipActive: { borderColor: COLORS.green, backgroundColor: "rgba(0,230,118,0.14)" },
  builderPickChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  builderPickChipTextActive: { color: COLORS.green },
  sportToolCard: {
    width: 236,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    overflow: "hidden",
  },
  sportToolCardInner: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    minHeight: 142,
  },
  sportToolIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sportToolTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  sportToolSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  sportToolActionRow: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 2 },
  sportToolAction: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  countryRow: { paddingHorizontal: 20, paddingRight: 8, gap: 8 },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countryChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  countryFlag: { fontSize: 14 },
  countryChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  countryChipTextActive: { color: COLORS.accent },
  countryCompetitionsPanel: {
    marginTop: 12,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlayLight,
    padding: 12,
    gap: 8,
  },
  countryPanelTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  countryCompetitionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: COLORS.card,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  countryCompetitionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  countryCompetitionLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  countryCompetitionName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, marginBottom: 12, paddingHorizontal: 20 },
  subSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.textMuted, marginBottom: 10, paddingHorizontal: 20 },
  competitionGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  competitionGroupLogo: { width: 18, height: 18 },
  competitionGroupName: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.text,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  competitionGroupLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  competitionGroupCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textMuted,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
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
  heroMatchWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(174,205,248,0.45)",
  },
  heroMatchWrapperLive: {
    borderColor: `${COLORS.live}66`,
  },
  heroMatchGrad: {
    padding: 16,
    gap: 14,
  },
  heroLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroLeagueLogo: {
    width: 20,
    height: 20,
  },
  heroLeagueName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  heroTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroTeamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  heroTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 17,
  },
  heroScoreBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  heroScore: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 36,
    color: COLORS.text,
  },
  heroScoreSep: {
    fontFamily: "Inter_400Regular",
    fontSize: 26,
    color: COLORS.textMuted,
  },
  heroActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  heroActionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  heroUpcomingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${COLORS.accent}55`,
  },
  heroUpcomingTime: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.accent,
  },
  heroVsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
    color: "rgba(255,255,255,0.6)",
  },
});
