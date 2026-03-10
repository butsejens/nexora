import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, Platform, TouchableOpacity, TextInput, Alert,
  Image, useWindowDimensions, Animated } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { TeamLogo } from "@/components/MatchCard";
import { LiveBadge } from "@/components/LiveBadge";
import { apiRequest } from "@/lib/query-client";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getLeagueLogo } from "@/lib/logo-manager";
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
} from "@/lib/match-notifications";

// ── Sport design tokens ──────────────────────────────────────────────────────
const SP_ACCENT      = "#5D60E8";
const SP_ACCENT_GLOW = "rgba(93,96,232,0.18)";
const SP_BG          = "#0B0D1A";
const SP_CARD        = "#141626";
const SP_ELEVATED    = "#1D2040";
const SP_BORDER      = "rgba(93,96,232,0.16)";

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
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: COLORS.surface,
  },
  arrowBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.cardElevated, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
  },
  dateLabel: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.cardElevated, borderRadius: 20,
    borderWidth: 1, borderColor: `${COLORS.accent}44`,
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
    backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: `${COLORS.accent}44`,
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

  const heroMatch = useMemo(() => {
    if (!showLive && !showUpcoming) return null;
    if (sortedLive.length === 0 && sortedUpcoming.length === 0) return null;
    const isLive = sortedLive.length > 0;
    return { match: isLive ? sortedLive[0] : sortedUpcoming[0], isLive };
  }, [showLive, showUpcoming, sortedLive, sortedUpcoming]);

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

      {/* ── Sticky tab bar ── */}
      <View style={styles.tabBar}>
        {([
          { id: "competitions" as const, label: "EXPLORE",  icon: "apps-outline" as const },
          { id: "live" as const,         label: "STATS",    icon: "bar-chart-outline" as const },
          { id: "upcoming" as const,     label: "LINEUP",   icon: "people-outline" as const },
          { id: "menu" as const,         label: "ANALYSE",  icon: "analytics-outline" as const },
        ]).map((tab) => {
          const active = sportsView === tab.id;
          return (
            <TouchableOpacity key={tab.id} style={[styles.tabItem, active && styles.tabItemActive]} onPress={() => setSportsView(tab.id)}>
              <Ionicons name={tab.icon} size={15} color={active ? "#fff" : COLORS.textMuted} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Collapsible league filter ── */}
      <Animated.View
        pointerEvents={showFiltersRef.current ? "auto" : "none"}
        style={{
          overflow: "hidden",
          opacity: filterAnim,
          maxHeight: filterAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 72] }),
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.leagueBar}
          contentContainerStyle={styles.leagueBarContent}
        >
          {LEAGUES.map(league => {
            const logo = league.name !== "Alle" ? getLeagueLogo(league.name) : null;
            const isActive = leagueFilter === league.name;
            return (
              <TouchableOpacity
                key={league.name}
                style={[styles.leagueChip, isActive && styles.leagueChipActive]}
                onPress={() => { toggleFiltersVisibility(true); setLeagueFilter(league.name); }}
              >
                {logo ? (
                  <Image source={typeof logo === "number" ? logo : { uri: logo as string }} style={styles.leagueChipLogo} resizeMode="contain" />
                ) : (
                  <Ionicons name="apps-outline" size={14} color={isActive ? "#fff" : COLORS.textMuted} />
                )}
                <Text style={[styles.leagueChipText, isActive && styles.leagueChipTextActive]} numberOfLines={1}>{league.displayName}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* ── Main scroll ── */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleFeedScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        contentContainerStyle={{ paddingBottom: bottomPad, width: contentWidth, alignSelf: "center" }}
      >
        {/* Banners */}
        {filterEmpty && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.accent} />
            <Text style={styles.bannerText}>Geen wedstrijden voor &quot;{leagueFilter}&quot; – alle competities getoond.</Text>
          </View>
        )}
        {normalizedApiError && (
          <View style={[styles.banner, styles.bannerError]}>
            <Ionicons name="warning-outline" size={14} color="#ff6b6b" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.bannerText, { color: "#ff6b6b" }]}>{normalizedApiError.userMessage}</Text>
              <Text style={styles.bannerCode}>Foutcode: {apiErrorRef || normalizedApiError.code}</Text>
            </View>
          </View>
        )}
        {noRemoteData && (
          <View style={styles.banner}>
            <Ionicons name="cloud-offline-outline" size={14} color={COLORS.accent} />
            <Text style={styles.bannerText}>Geen live data ontvangen. Resultaten volgen zodra beschikbaar.</Text>
          </View>
        )}

        {/* Date selector — alleen in MATCHES view */}
        {showUpcoming && <DateSelector date={selectedDate} onDateChange={setSelectedDate} />}

        {/* ─────────────────────────────────────
            HERO MATCH CARD
        ───────────────────────────────────── */}
        {heroMatch && (() => {
          const { match: hero, isLive } = heroMatch;
          const leagueLogo = getLeagueLogo(hero.league);
          const gradColors = Array.isArray(hero.heroGradient) && hero.heroGradient.length >= 2
            ? hero.heroGradient
            : ["#0D1837", "#060C1D"];
          return (
            <TouchableOpacity
              style={[styles.heroCard, isLive && styles.heroCardLive]}
              onPress={() => handleMatchPress(hero)}
              activeOpacity={0.92}
            >
              {/* League-branded background gradient */}
              <LinearGradient
                colors={gradColors}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              {/* Darker bottom overlay for text readability */}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0.3 }}
                end={{ x: 0, y: 1 }}
              />

              {/* MATCH DAY header */}
              <View style={styles.heroMatchDayRow}>
                <View style={styles.heroMatchDayBadge}>
                  <Text style={styles.heroMatchDayText}>MATCH</Text>
                  <Text style={[styles.heroMatchDayText, styles.heroMatchDayDayWord]}>DAY</Text>
                </View>
                {isLive && (
                  <View style={styles.heroMatchDayLivePill}>
                    <View style={styles.heroMatchDayDot} />
                    <Text style={styles.heroMatchDayLiveText}>LIVE</Text>
                  </View>
                )}
              </View>

              {/* Top row */}
              <View style={styles.heroTopRow}>
                <View style={styles.heroCompBadge}>
                  {leagueLogo ? (
                    <Image
                      source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
                      style={styles.heroCompLogo}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Text style={styles.heroCompText} numberOfLines={1}>{hero.league}</Text>
                </View>
                {isLive ? (
                  <LiveBadge minute={hero.minute} />
                ) : (
                  <View style={styles.heroTimePill}>
                    <Ionicons name="time-outline" size={10} color={COLORS.accent} />
                    <Text style={styles.heroTimeText}>{hero.startTime}</Text>
                  </View>
                )}
              </View>

              {/* Teams + score */}
              <View style={styles.heroTeamsRow}>
                <View style={styles.heroTeamCol}>
                  <TeamLogo uri={hero.homeTeamLogo} teamName={hero.homeTeam} size={96} />
                  <Text style={styles.heroTeamLabel} numberOfLines={2}>{hero.homeTeam}</Text>
                </View>

                <View style={styles.heroScoreCol}>
                  {isLive ? (
                    <View style={styles.heroScorePill}>
                      <Text style={[styles.heroScoreNum, styles.heroScoreNumLive]}>{hero.homeScore}</Text>
                      <Text style={styles.heroScoreDash}>—</Text>
                      <Text style={[styles.heroScoreNum, styles.heroScoreNumLive]}>{hero.awayScore}</Text>
                    </View>
                  ) : (
                    <View style={styles.heroVsBlock}>
                      <Text style={styles.heroVs}>VS</Text>
                      <Text style={styles.heroKickoff}>{hero.startTime}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.heroTeamCol}>
                  <TeamLogo uri={hero.awayTeamLogo} teamName={hero.awayTeam} size={96} />
                  <Text style={styles.heroTeamLabel} numberOfLines={2}>{hero.awayTeam}</Text>
                </View>
              </View>

              {/* Footer CTA */}
              <View style={styles.heroFooter}>
                <Text style={styles.heroFooterText}>{isLive ? "LIVE VOLGEN" : "WEDSTRIJDDETAILS"}</Text>
                <Ionicons name="arrow-forward" size={13} color="rgba(255,255,255,0.5)" />
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* ─────────────────────────────────────
            LIVE MATCHES
        ───────────────────────────────────── */}
        {showLiveSection && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Live Nu</Text>
              <LiveBadge />
            </View>
            {liveFirstLoad ? (
              [1, 2, 3].map(i => (
                <View key={i} style={styles.matchCardSkeleton}>
                  <View style={styles.skeletonShimmer} />
                </View>
              ))
            ) : sortedLive.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="radio-button-off-outline" size={28} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Geen live wedstrijden</Text>
              </View>
            ) : (
              sortedLive.slice(0, 60).map((match: any) => (
                <TouchableOpacity
                  key={match.id}
                  style={[styles.matchCard, styles.matchCardLiveItem]}
                  onPress={() => handleMatchPress(match)}
                  activeOpacity={0.85}
                >
                  <View style={styles.matchLiveBar} />
                  <View style={styles.matchTeamSide}>
                    <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={40} />
                    <Text style={styles.matchTeamName} numberOfLines={1}>{match.homeTeam}</Text>
                  </View>
                  <View style={styles.matchCenterCol}>
                    <View style={styles.matchScoreWrap}>
                      <Text style={styles.matchScoreValue}>{match.homeScore}</Text>
                      <Text style={styles.matchScoreSep}>-</Text>
                      <Text style={styles.matchScoreValue}>{match.awayScore}</Text>
                    </View>
                    <LiveBadge minute={match.minute} small />
                  </View>
                  <View style={[styles.matchTeamSide, { alignItems: "flex-end" }]}>
                    <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={40} />
                    <Text style={styles.matchTeamName} numberOfLines={1}>{match.awayTeam}</Text>
                  </View>
                  <TouchableOpacity style={styles.matchBellBtn} onPress={() => toggleMatchNotification(match)}>
                    <Ionicons
                      name={matchSubscriptions[String(match?.id || "")] ? "notifications" : "notifications-outline"}
                      size={16}
                      color={matchSubscriptions[String(match?.id || "")] ? COLORS.accent : COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* ─────────────────────────────────────
            MATCHES (Upcoming + Finished)
        ───────────────────────────────────── */}
        {showUpcoming && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {selectedDate === todayUTC() ? "Matchen vandaag" : formatDateDisplay(selectedDate)}
              </Text>
            </View>
            {todayFirstLoad ? (
              [1, 2, 3].map(i => (
                <View key={i} style={styles.matchCardSkeleton}>
                  <View style={styles.skeletonShimmer} />
                </View>
              ))
            ) : sortedUpcoming.length === 0 && sortedFinished.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={28} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Geen wedstrijden op {formatDateDisplay(selectedDate)}</Text>
              </View>
            ) : (
              <>
                {sortedUpcoming.length > 0 && (
                  <>
                    <Text style={styles.subHead}>Binnenkort</Text>
                    {sortedUpcoming.slice(0, 60).map((match: any) => (
                      <TouchableOpacity
                        key={match.id}
                        style={styles.matchCard}
                        onPress={() => handleMatchPress(match)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.matchTeamSide}>
                          <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={40} />
                          <Text style={styles.matchTeamName} numberOfLines={1}>{match.homeTeam}</Text>
                        </View>
                        <View style={styles.matchCenterCol}>
                          <Text style={styles.matchTimeValue}>{match.startTime}</Text>
                          <Text style={styles.matchLeagueLabel} numberOfLines={1}>{match.league}</Text>
                        </View>
                        <View style={[styles.matchTeamSide, { alignItems: "flex-end" }]}>
                          <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={40} />
                          <Text style={styles.matchTeamName} numberOfLines={1}>{match.awayTeam}</Text>
                        </View>
                        <TouchableOpacity style={styles.matchBellBtn} onPress={() => toggleMatchNotification(match)}>
                          <Ionicons
                            name={matchSubscriptions[String(match?.id || "")] ? "notifications" : "notifications-outline"}
                            size={16}
                            color={matchSubscriptions[String(match?.id || "")] ? COLORS.accent : COLORS.textMuted}
                          />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
                {sortedFinished.length > 0 && (
                  <>
                    <Text style={[styles.subHead, { marginTop: 16 }]}>Afgelopen</Text>
                    {sortedFinished.slice(0, 60).map((match: any) => (
                      <TouchableOpacity
                        key={match.id}
                        style={[styles.matchCard, styles.matchCardFinished]}
                        onPress={() => handleMatchPress(match)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.matchTeamSide}>
                          <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={40} />
                          <Text style={styles.matchTeamName} numberOfLines={1}>{match.homeTeam}</Text>
                        </View>
                        <View style={styles.matchCenterCol}>
                          <View style={styles.matchScoreWrap}>
                            <Text style={styles.matchScoreFinished}>{match.homeScore}</Text>
                            <Text style={styles.matchScoreSep}>-</Text>
                            <Text style={styles.matchScoreFinished}>{match.awayScore}</Text>
                          </View>
                          <Text style={styles.matchFinishedLabel}>FT</Text>
                        </View>
                        <View style={[styles.matchTeamSide, { alignItems: "flex-end" }]}>
                          <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={40} />
                          <Text style={styles.matchTeamName} numberOfLines={1}>{match.awayTeam}</Text>
                        </View>
                        <View style={styles.matchBellBtn} />
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* ─────────────────────────────────────
            ANALYSE / TOOLS
        ───────────────────────────────────── */}
        {showMenuSection && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Analyse</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsRow}>
              {SPORT_TOOL_CARDS.map((card) => {
                const isActive = activeSportTool === card.id;
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.toolCard, isActive && { borderColor: card.accent }]}
                    activeOpacity={0.85}
                    onPress={() => setActiveSportTool(card.id)}
                  >
                    <LinearGradient
                      colors={isActive ? [COLORS.cardElevated, COLORS.card] : [COLORS.card, COLORS.background]}
                      style={styles.toolCardInner}
                    >
                      <View style={[styles.toolIconWrap, { backgroundColor: `${card.accent}22`, borderColor: `${card.accent}55` }]}>
                        <Ionicons name={card.icon} size={16} color={card.accent} />
                      </View>
                      <Text style={styles.toolTitle} numberOfLines={1}>{card.title}</Text>
                      <Text style={styles.toolSub} numberOfLines={2}>{card.subtitle}</Text>
                      <View style={styles.toolAction}>
                        <Text style={[styles.toolActionText, { color: card.accent }]}>Open</Text>
                        <Ionicons name="chevron-forward" size={12} color={card.accent} />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <LinearGradient colors={[COLORS.cardElevated, COLORS.background]} style={styles.toolPanel}>
              <View style={styles.toolPanelHead}>
                <Text style={styles.toolPanelTitle}>{activeSportToolCard.title}</Text>
                <Text style={styles.toolPanelCount}>{activeToolRows.length} picks</Text>
              </View>
              {activeToolRows.length > 0 ? activeToolRows.map((row: any) => (
                <TouchableOpacity
                  key={row.key}
                  style={styles.toolRow}
                  onPress={() => row.item ? handleToolMatchPress(row.item) : handleMatchPress(row.match)}
                >
                  <Text style={styles.toolRowTeams} numberOfLines={1}>{row.title}</Text>
                  <Text style={styles.toolRowMeta} numberOfLines={1}>{row.meta}</Text>
                  {Array.isArray(row.badges) && row.badges.length > 0 && (
                    <View style={styles.toolBadgeRow}>
                      {row.badges.slice(0, 3).map((badge: any, idx: number) => (
                        <View
                          key={`${row.key}_b${idx}`}
                          style={[styles.toolBadge, badge.tone === "positive" && styles.toolBadgePos, badge.tone === "negative" && styles.toolBadgeNeg]}
                        >
                          <Text style={styles.toolBadgeText}>{badge.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              )) : (
                <Text style={styles.toolEmpty}>Nog geen data beschikbaar.</Text>
              )}
            </LinearGradient>
          </View>
        )}

        {/* ─────────────────────────────────────
            EXPLORE / COMPETITIONS
        ───────────────────────────────────── */}
        {showCompetitionsSection && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Competities</Text>
            </View>
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
                    <Text style={[styles.countryName, active && styles.countryNameActive]}>{country.countryName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.competitionsPanel}>
              <Text style={styles.competitionsPanelTitle}>{selectedCountry?.countryName} · Competities</Text>
              {(selectedCountry?.competitions || []).map((comp) => (
                <TouchableOpacity
                  key={comp.id}
                  style={[styles.competitionRow, { borderColor: `${comp.color}44` }]}
                  onPress={() => {
                    if (comp.tier === "national" && comp.nationalTeamName) {
                      router.push({
                        pathname: "/team-detail",
                        params: { teamId: `name:${encodeURIComponent(comp.nationalTeamName)}`, teamName: comp.nationalTeamName, sport: "soccer", league: comp.espn },
                      });
                    } else {
                      handleCompetitionPress(comp);
                    }
                  }}
                >
                  <View style={[styles.competitionIcon, { backgroundColor: `${comp.color}22` }]}>
                    <Ionicons name={tierIcon(comp.tier) as any} size={15} color={comp.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.competitionTier}>{tierLabel(comp.tier)}</Text>
                    <Text style={styles.competitionName} numberOfLines={1}>{comp.league}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SP_BG },
  scroll: { flex: 1 },

  /* ── Tab bar ── */
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#0F1123",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabItemActive: {
    backgroundColor: SP_ACCENT,
    borderRadius: 20,
  },
  tabText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.8 },
  tabTextActive: { color: "#fff" },

  /* ── League filter bar ── */
  leagueBar: {
    backgroundColor: SP_BG,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  leagueBarContent: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: "center" },
  leagueChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  leagueChipActive: { backgroundColor: SP_ACCENT, borderColor: SP_ACCENT },
  leagueChipLogo: { width: 18, height: 18 },
  leagueChipText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted },
  leagueChipTextActive: { color: "#fff" },

  /* ── Banners ── */
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
  },
  bannerError: { backgroundColor: "rgba(255,48,64,0.10)", borderColor: "rgba(255,48,64,0.25)" },
  bannerText: { fontFamily: "Inter_400Regular", color: COLORS.accent, fontSize: 12, flex: 1, lineHeight: 17 },
  bannerCode: { fontFamily: "Inter_400Regular", color: COLORS.textMuted, fontSize: 10 },

  /* ── Sections ── */
  section: { marginTop: 28, marginBottom: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 20,
    marginBottom: 16,
    marginLeft: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 18,
    color: COLORS.text,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: SP_ACCENT,
    letterSpacing: -0.3,
  },
  subHead: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 20,
  },

  /* ── Hero card ── */
  heroCard: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 12,
    borderRadius: 28,
    overflow: "hidden",
    minHeight: 300,
    backgroundColor: "#0D1A38",
    borderWidth: 1,
    borderColor: SP_BORDER,
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 16,
    justifyContent: "space-between",
    padding: 24,
    gap: 18,
  },
  heroCardLive: {
    borderColor: `${COLORS.live}44`,
    // @ts-ignore
    shadowColor: COLORS.live,
    shadowOpacity: 0.25,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCompBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroCompLogo: { width: 20, height: 20 },
  heroCompText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: SP_ACCENT_GLOW,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: SP_BORDER,
  },
  heroTimeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: SP_ACCENT },
  heroTeamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flex: 1,
  },
  heroTeamCol: { flex: 1, alignItems: "center", gap: 12 },
  heroTeamLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 19,
  },
  heroScoreCol: { alignItems: "center", justifyContent: "center", minWidth: 110 },
  heroScorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroScoreNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 48,
    color: COLORS.text,
  },
  heroScoreNumLive: {
    textShadowColor: COLORS.live,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  heroScoreDash: { fontFamily: "Inter_400Regular", fontSize: 28, color: COLORS.textMuted },
  heroVsBlock: { alignItems: "center", gap: 6 },
  heroVs: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 4,
  },
  heroKickoff: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  heroFooterText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  /* ── Hero MATCH DAY header ── */
  heroMatchDayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroMatchDayBadge: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
  },
  heroMatchDayText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 26,
    color: COLORS.text,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  heroMatchDayDayWord: {
    color: SP_ACCENT,
  },
  heroMatchDayLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,48,64,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${COLORS.live}44`,
  },
  heroMatchDayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.live,
  },
  heroMatchDayLiveText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.live,
    letterSpacing: 1,
  },


  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: SP_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SP_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 16,
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  matchCardLiveItem: {
    borderColor: `${COLORS.live}33`,
    backgroundColor: SP_ELEVATED,
  },
  matchCardFinished: { opacity: 0.6 },
  matchLiveBar: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 3,
    backgroundColor: COLORS.live,
  },
  matchTeamSide: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  matchTeamName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.text,
    textAlign: "center",
    maxWidth: 85,
  },
  matchCenterCol: {
    alignItems: "center",
    justifyContent: "center",
    width: 85,
    gap: 4,
  },
  matchScoreWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  matchScoreValue: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
    color: COLORS.text,
  },
  matchScoreFinished: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  matchScoreSep: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: COLORS.textMuted,
  },
  matchTimeValue: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 16,
    color: COLORS.text,
  },
  matchLeagueLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  matchFinishedLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  matchBellBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  matchCardSkeleton: {
    marginHorizontal: 16,
    marginBottom: 8,
    height: 76,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  skeletonShimmer: {
    flex: 1,
    backgroundColor: COLORS.cardElevated,
    opacity: 0.6,
  },

  /* ── Analyse tools ── */
  toolsRow: { paddingHorizontal: 16, paddingRight: 8, gap: 12 },
  toolCard: {
    width: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: COLORS.card,
    overflow: "hidden",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  toolCardInner: { padding: 16, gap: 8, minHeight: 136 },
  toolIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  toolTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  toolSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
  toolAction: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 2 },
  toolActionText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  toolPanel: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
    gap: 10,
  },
  toolPanelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  toolPanelTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  toolPanelCount: {
    fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted,
    backgroundColor: COLORS.cardElevated, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  toolRow: {
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: COLORS.cardElevated, paddingHorizontal: 14, paddingVertical: 12, gap: 4,
  },
  toolRowTeams: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  toolRowMeta: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  toolBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  toolBadge: {
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card, paddingHorizontal: 7, paddingVertical: 3,
  },
  toolBadgePos: { borderColor: `${COLORS.green}66`, backgroundColor: "rgba(0,230,118,0.16)" },
  toolBadgeNeg: { borderColor: `${COLORS.live}66`, backgroundColor: "rgba(255,48,64,0.16)" },
  toolBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.text },
  toolEmpty: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },

  /* ── Competitions ── */
  countryRow: { paddingHorizontal: 16, paddingRight: 8, gap: 8 },
  countryChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  countryChipActive: { borderColor: SP_ACCENT, backgroundColor: SP_ACCENT_GLOW },
  countryFlag: { fontSize: 14 },
  countryName: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  countryNameActive: { color: SP_ACCENT },
  competitionsPanel: {
    marginTop: 12, marginHorizontal: 16, borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: COLORS.card, padding: 14, gap: 8,
  },
  competitionsPanelTitle: {
    fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.textMuted,
    marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8,
  },
  competitionRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, borderWidth: 1, backgroundColor: COLORS.cardElevated,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  competitionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  competitionTier: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  competitionName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },

  /* ── Empty / loading states ── */
  emptyState: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, gap: 10 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
});
