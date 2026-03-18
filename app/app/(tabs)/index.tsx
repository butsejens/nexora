import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, Platform, TouchableOpacity, TextInput, Alert,
  Image, useWindowDimensions, Animated } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import "@/constants/design-system";
import { NexoraHeader } from "@/components/NexoraHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { LiveBadge } from "@/components/LiveBadge";
import { MatchRowCard } from "@/components/premium";
import { apiRequest } from "@/lib/query-client";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getLeagueLogo } from "@/lib/logo-manager";
import { safeStr, toPct, flagFromIso2 } from "@/lib/utils";
import { useNexora } from "@/context/NexoraContext";
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

/** Safely convert any value to string — prevents [object Object] rendering */
// ── Sport design tokens ───────────────────────────────────────────────────────
const SP_BORDER      = COLORS.border;

// ── Premium palette ───────────────────────────────────────────────────────────
const P = {
  bg:       "#09090D",
  card:     "#12121A",
  elevated: "#1C1C28",
  accent:   "#E50914",
  live:     "#FF3040",
  text:     "#FFFFFF",
  muted:    "#9D9DAA",
  border:   "rgba(255,255,255,0.08)",
  glass:    "rgba(28,28,40,0.92)",
};

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

const SPORT_CATEGORIES = [
  { id: "all",        label: "All Sports",  icon: "apps-outline"                as const },
  { id: "football",   label: "Football",    icon: "football-outline"            as const },
  { id: "basketball", label: "Basketball",  icon: "basketball-outline"          as const },
  { id: "mma",        label: "MMA",         icon: "fitness-outline"             as const },
  { id: "motorsport", label: "Motorsport",  icon: "car-sport-outline"           as const },
  { id: "tennis",     label: "Tennis",      icon: "tennisball-outline"          as const },
  { id: "baseball",   label: "Baseball",    icon: "baseball-outline"            as const },
  { id: "ice_hockey", label: "Ice Hockey",  icon: "snow-outline"                as const },
  { id: "other",      label: "Other",       icon: "ellipsis-horizontal-outline" as const },
];
type SportCategoryId = typeof SPORT_CATEGORIES[number]["id"];

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

// ── Section Title ─────────────────────────────────────────────────────────────
function SectionTitle({ title, accent = false, action, onAction, count }: {
  title: string;
  accent?: boolean;
  action?: string;
  onAction?: () => void;
  count?: number;
}) {
  return (
    <View style={secStyles.row}>
      <View style={secStyles.left}>
        {accent && <View style={secStyles.accentBar} />}
        <Text style={secStyles.title}>{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={secStyles.countBadge}>
            <Text style={secStyles.countText}>{count}</Text>
          </View>
        )}
      </View>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} style={secStyles.actionBtn}>
          <Text style={secStyles.actionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={12} color={P.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const secStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, marginTop: 24, marginBottom: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  accentBar: { width: 3, height: 20, backgroundColor: P.accent, borderRadius: 2 },
  title: { color: P.text, fontSize: 18, fontWeight: "700", letterSpacing: -0.2, fontFamily: "Inter_700Bold" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  actionText: { color: P.accent, fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  countBadge: {
    backgroundColor: "rgba(229,9,20,0.18)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.35)",
  },
  countText: { color: P.accent, fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
});

// ── Live Now Card ─────────────────────────────────────────────────────────────
function LiveNowCardBase({ match, onPress }: { match: any; onPress: () => void }) {
  const homeLogo = getLeagueLogo(match?.league || "");
  const leagueLogo = homeLogo;
  const homeScore = match?.homeScore ?? "–";
  const awayScore = match?.awayScore ?? "–";
  const minute = match?.minute ? `${match.minute}'` : "LIVE";

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={liveCardStyles.wrap}>
      <LinearGradient colors={["#1A0A0E", "#0D0D1A"]} style={liveCardStyles.card}>
        <View style={liveCardStyles.accentBorder} />
        {/* Top row */}
        <View style={liveCardStyles.topRow}>
          {leagueLogo ? (
            <Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }} style={liveCardStyles.leagueLogo} resizeMode="contain" />
          ) : (
            <View style={liveCardStyles.leagueLogoPlaceholder} />
          )}
          <Text style={liveCardStyles.leagueName} numberOfLines={1}>{match?.league || "Live"}</Text>
          <View style={liveCardStyles.livePill}>
            <View style={liveCardStyles.liveDot} />
            <Text style={liveCardStyles.liveText}>LIVE</Text>
          </View>
          <Text style={liveCardStyles.minute}>{minute}</Text>
        </View>
        {/* Teams + score */}
        <View style={liveCardStyles.teamsRow}>
          <View style={liveCardStyles.teamBlock}>
            <Text style={liveCardStyles.teamName} numberOfLines={1}>{match?.homeTeam || "Home"}</Text>
            <TeamLogo uri={match?.homeTeamLogo} teamName={match?.homeTeam || ""} size={44} />
          </View>
          <View style={liveCardStyles.scoreBlock}>
            <Text style={liveCardStyles.score}>{homeScore} - {awayScore}</Text>
          </View>
          <View style={liveCardStyles.teamBlock}>
            <Text style={liveCardStyles.teamName} numberOfLines={1}>{match?.awayTeam || "Away"}</Text>
            <TeamLogo uri={match?.awayTeamLogo} teamName={match?.awayTeam || ""} size={44} />
          </View>
        </View>
        {/* Stadium */}
        {match?.stadium && (
          <Text style={liveCardStyles.stadium} numberOfLines={1}>📍 {match.stadium}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const LiveNowCard = React.memo(LiveNowCardBase);

const liveCardStyles = StyleSheet.create({
  wrap: { marginRight: 12 },
  card: {
    width: 300, height: 180, borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: `${P.accent}44`,
    shadowColor: P.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 8, padding: 14,
  },
  accentBorder: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: P.accent, borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14, paddingLeft: 6 },
  leagueLogo: { width: 20, height: 20 },
  leagueLogoPlaceholder: { width: 20, height: 20, borderRadius: 10, backgroundColor: P.elevated },
  leagueName: { flex: 1, color: P.muted, fontSize: 11, fontWeight: "500" },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: `${P.live}22`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: `${P.live}55`,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: P.live },
  liveText: { color: P.live, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  minute: { color: P.muted, fontSize: 11, fontWeight: "600", marginLeft: 4 },
  teamsRow: { flexDirection: "row", alignItems: "center", paddingLeft: 6, flex: 1 },
  teamBlock: { flex: 1, alignItems: "center", gap: 6 },
  teamName: { color: P.text, fontSize: 11, fontWeight: "600", textAlign: "center", maxWidth: 90 },
  scoreBlock: { paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  score: {
    color: P.text, fontSize: 28, fontWeight: "800", letterSpacing: 1, textAlign: "center",
    // @ts-ignore
    textShadowColor: "rgba(229,9,20,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  stadium: { color: P.muted, fontSize: 10, marginTop: 10, paddingLeft: 6 },
});

// ── Today Match Card ──────────────────────────────────────────────────────────
function TodayMatchCardInner({ match, onPress }: { match: any; onPress: () => void }) {
  const isLive = String(match?.status || "").toLowerCase() === "live";
  const isFinished = String(match?.status || "").toLowerCase() === "finished";
  const leagueLogo = getLeagueLogo(match?.league || "");
  const homeScore = match?.homeScore ?? 0;
  const awayScore = match?.awayScore ?? 0;
  const time = match?.startTime || "--:--";

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={todayCardStyles.wrap}>
      <View style={todayCardStyles.card}>
        {/* League */}
        <View style={todayCardStyles.leagueRow}>
          {leagueLogo ? (
            <Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }} style={todayCardStyles.leagueIcon} resizeMode="contain" />
          ) : null}
          <Text style={todayCardStyles.leagueName} numberOfLines={1}>{match?.league || "Sport"}</Text>
        </View>
        {/* Teams */}
        <View style={todayCardStyles.teamsRow}>
          <View style={todayCardStyles.teamBlock}>
            <Text style={todayCardStyles.teamName} numberOfLines={1}>{match?.homeTeam || "Home"}</Text>
            <TeamLogo uri={match?.homeTeamLogo} teamName={match?.homeTeam || ""} size={36} />
          </View>
          <View style={todayCardStyles.center}>
            {isLive ? (
              <>
                <Text style={todayCardStyles.liveScore}>{homeScore} - {awayScore}</Text>
                <View style={todayCardStyles.liveTag}>
                  <View style={todayCardStyles.liveDot} />
                  <Text style={todayCardStyles.liveTagText}>LIVE</Text>
                </View>
              </>
            ) : isFinished ? (
              <Text style={todayCardStyles.finScore}>{homeScore} - {awayScore}</Text>
            ) : (
              <>
                <Text style={todayCardStyles.time}>{time}</Text>
                <Text style={todayCardStyles.vs}>vs</Text>
              </>
            )}
          </View>
          <View style={todayCardStyles.teamBlock}>
            <Text style={todayCardStyles.teamName} numberOfLines={1}>{match?.awayTeam || "Away"}</Text>
            <TeamLogo uri={match?.awayTeamLogo} teamName={match?.awayTeam || ""} size={36} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const TodayMatchCard = React.memo(TodayMatchCardInner);

const todayCardStyles = StyleSheet.create({
  wrap: { marginRight: 10 },
  card: {
    width: 200, borderRadius: 14, backgroundColor: P.card, padding: 12,
    borderWidth: 1, borderColor: P.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  leagueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10 },
  leagueIcon: { width: 16, height: 16 },
  leagueName: { color: P.muted, fontSize: 10, fontWeight: "500", flex: 1 },
  teamsRow: { flexDirection: "row", alignItems: "center" },
  teamBlock: { flex: 1, alignItems: "center", gap: 5 },
  teamName: { color: P.text, fontSize: 10, fontWeight: "600", textAlign: "center", maxWidth: 70 },
  center: { paddingHorizontal: 8, alignItems: "center" },
  time: { color: P.text, fontSize: 14, fontWeight: "700" },
  vs: { color: P.muted, fontSize: 9, marginTop: 2 },
  liveScore: { color: P.live, fontSize: 16, fontWeight: "800" },
  liveTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: `${P.live}22`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginTop: 3,
  },
  liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: P.live },
  liveTagText: { color: P.live, fontSize: 8, fontWeight: "700" },
  finScore: { color: P.muted, fontSize: 15, fontWeight: "700" },
});

// ── Popular Competition Card ───────────────────────────────────────────────────
const TOP_COMPETITIONS = [
  { id: "en_d1", league: "Premier League", espn: "eng.1", color: "#3d0099", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "ucl", league: "UEFA Champions League", espn: "uefa.champions", color: "#1a56a0", emoji: "⭐" },
  { id: "es_d1", league: "La Liga", espn: "esp.1", color: "#cc0033", emoji: "🇪🇸" },
  { id: "de_d1", league: "Bundesliga", espn: "ger.1", color: "#cc0000", emoji: "🇩🇪" },
  { id: "it_d1", league: "Serie A", espn: "ita.1", color: "#006ab3", emoji: "🇮🇹" },
  { id: "fr_d1", league: "Ligue 1", espn: "fra.1", color: "#ae2028", emoji: "🇫🇷" },
  { id: "be_d1", league: "Jupiler Pro League", espn: "bel.1", color: "#005b99", emoji: "🇧🇪" },
  { id: "uel", league: "UEFA Europa League", espn: "uefa.europa", color: "#f47920", emoji: "🏆" },
];

function PopularCompetitionCard({ comp, onPress, cardWidth }: { comp: typeof TOP_COMPETITIONS[0]; onPress: () => void; cardWidth: number }) {
  const logo = getLeagueLogo(comp.league);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[popCompStyles.card, { width: cardWidth }]}>
      <View style={[popCompStyles.colorTop, { backgroundColor: comp.color }]} />
      <View style={popCompStyles.logoWrap}>
        {logo ? (
          <Image source={typeof logo === "number" ? logo : { uri: logo as string }} style={popCompStyles.logo} resizeMode="contain" />
        ) : (
          <Text style={popCompStyles.emoji}>{comp.emoji}</Text>
        )}
      </View>
      <Text style={popCompStyles.name} numberOfLines={2}>{comp.league}</Text>
    </TouchableOpacity>
  );
}

const popCompStyles = StyleSheet.create({
  card: {
    height: 116, borderRadius: 14, backgroundColor: P.elevated,
    overflow: "hidden", alignItems: "center", paddingBottom: 10,
    borderWidth: 1, borderColor: P.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  colorTop: { width: "100%", height: 5 },
  logoWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6 },
  logo: { width: 52, height: 52 },
  emoji: { fontSize: 34 },
  name: { color: P.text, fontSize: 10, fontWeight: "700", textAlign: "center", paddingHorizontal: 6, lineHeight: 13 },
});

// ── Country Card ──────────────────────────────────────────────────────────────
function CountryCard({ country, active, onPress }: { country: CountryCatalog; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[countryCardStyles.card, active && countryCardStyles.cardActive]}>
      <Text style={countryCardStyles.flag}>{flagFromIso2(country.countryCode)}</Text>
      <Text style={[countryCardStyles.name, active && countryCardStyles.nameActive]} numberOfLines={1}>{country.countryName}</Text>
      {active && <Ionicons name="checkmark-circle" size={14} color={P.accent} />}
    </TouchableOpacity>
  );
}

const countryCardStyles = StyleSheet.create({
  card: {
    width: "48%", height: 62, borderRadius: 12, backgroundColor: P.elevated,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: P.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  cardActive: { borderColor: P.accent, backgroundColor: `${P.accent}14` },
  flag: { fontSize: 22 },
  name: { color: P.muted, fontSize: 13, fontWeight: "600", flex: 1 },
  nameActive: { color: P.text },
});

// ── Highlight Card ────────────────────────────────────────────────────────────
function HighlightCard({ match, onPress }: { match: any; onPress: () => void }) {
  const homeScore = match?.homeScore ?? 0;
  const awayScore = match?.awayScore ?? 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={hlStyles.wrap}>
      <LinearGradient colors={["#151520", "#0B0B14"]} style={hlStyles.card}>
        <View style={hlStyles.playBtn}>
          <Ionicons name="play" size={20} color="#fff" />
        </View>
        <View style={hlStyles.overlay}>
          <Text style={hlStyles.score}>{homeScore} - {awayScore}</Text>
          <Text style={hlStyles.teams} numberOfLines={1}>{match?.homeTeam} · {match?.awayTeam}</Text>
          <Text style={hlStyles.league} numberOfLines={1}>{match?.league || "Sport"}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const hlStyles = StyleSheet.create({
  wrap: { marginRight: 12 },
  card: {
    width: 220, height: 130, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: P.border,
    alignItems: "center", justifyContent: "center",
  },
  playBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)",
  },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 },
  score: { color: P.text, fontSize: 16, fontWeight: "800" },
  teams: { color: P.muted, fontSize: 10, fontWeight: "500" },
  league: { color: P.muted, fontSize: 9, marginTop: 1 },
});

// ── Main ────────────────────────────────────────────────────────────────────
export default function SportsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, 1200);
  const compCardWidth = Math.floor((Math.min(screenWidth, 480) - 16 * 2 - 10 * 3) / 4);
  const qc = useQueryClient();
  const { favorites } = useNexora();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter] = useState<"all" | "live" | "upcoming">("all");
  const [sportCategory, setSportCategory] = useState<SportCategoryId>("all");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(COUNTRY_COMPETITIONS[0]?.countryCode || "BE");
  const [selectedDate, setSelectedDate] = useState<string>(todayUTC());
  const [sportsView, setSportsView] = useState<"competitions" | "live" | "upcoming" | "menu">("competitions");
  const [activeSportTool, setActiveSportTool] = useState<SportToolId>("football-predictions");
  const [sportsSearchActive, setSportsSearchActive] = useState(false);
  const [sportsSearchQuery, setSportsSearchQuery] = useState("");
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
    return () => { active = false; };
  }, []);

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

  const todayQuery = useQuery({
    queryKey: ["sports", "today", selectedDate],
    queryFn: async () => {
      const date = encodeURIComponent(selectedDate);
      try {
        const byDate = await fetchSportsPayloadWithTimeout(`/api/sports/by-date?date=${date}`);
        const hasByDateData = (byDate.live?.length || 0) + (byDate.upcoming?.length || 0) + (byDate.finished?.length || 0) > 0;
        if (hasByDateData || byDate.error) return byDate;
      } catch { /* fallback below */ }
      try {
        const today = await fetchSportsPayloadWithTimeout(`/api/sports/today?date=${date}`);
        const hasData = (today.live?.length || 0) + (today.upcoming?.length || 0) + (today.finished?.length || 0) > 0;
        if (hasData || today.error) return today;
      } catch { /* no fallback data */ }
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
    queryKey: ["sports", "menu-tools", selectedDate, sportCategory],
    queryFn: () => fetchSportsMenuTools(`/api/sports/menu-tools?date=${encodeURIComponent(selectedDate)}&league=${encodeURIComponent(sportCategory)}`),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
    refetchOnReconnect: true,
    notifyOnChangeProps: ["data", "error", "isFetching"],
  });

  const liveFirstLoad = liveQuery.isLoading && !liveQuery.data;
  const todayFirstLoad = todayQuery.isLoading && !todayQuery.data;

  const remoteLive: any[] = useMemo(
    () => liveQuery.data?.live || todayQuery.data?.live || [],
    [liveQuery.data?.live, todayQuery.data?.live]
  );
  const remoteUpcoming: any[] = useMemo(() => todayQuery.data?.upcoming || [], [todayQuery.data?.upcoming]);
  const remoteFinished: any[] = useMemo(() => todayQuery.data?.finished || [], [todayQuery.data?.finished]);
  const hasRemoteData = remoteLive.length + remoteUpcoming.length + remoteFinished.length > 0;

  const [stickyLiveMap, setStickyLiveMap] = useState<Record<string, any>>({});

  useEffect(() => { setStickyLiveMap({}); }, [selectedDate]);

  useEffect(() => {
    const now = Date.now();
    setStickyLiveMap((prev) => {
      const next = { ...prev };
      for (const match of remoteLive) {
        if (!match?.id) continue;
        next[match.id] = { ...next[match.id], ...match, __lastSeenLiveAt: now };
      }
      const finishedIds = new Set((remoteFinished || []).map((m: any) => String(m?.id || "")));
      const LIVE_STICKY_TTL_MS = 20 * 60 * 1000;
      for (const [id, match] of Object.entries(next)) {
        const seenAt = Number((match as any)?.__lastSeenLiveAt || 0);
        const expired = now - seenAt > LIVE_STICKY_TTL_MS;
        const isFinished = String((match as any)?.status || "").toLowerCase() === "finished";
        if (finishedIds.has(id) || isFinished || expired) delete next[id];
      }
      return next;
    });
  }, [remoteLive, remoteFinished]);

  const mergedLive = useMemo(() => {
    const byId = new Map<string, any>();
    Object.entries(stickyLiveMap).forEach(([id, m]) => byId.set(id, m));
    remoteLive.forEach((m) => { if (m?.id) byId.set(String(m.id), m); });
    return Array.from(byId.values());
  }, [remoteLive, stickyLiveMap]);

  const allLive: any[] = mergedLive.filter(isFootballMatch);
  const allUpcoming: any[] = remoteUpcoming.filter(isFootballMatch);
  const allFinished: any[] = remoteFinished.filter(isFootballMatch);
  const noRemoteData = !hasRemoteData;
  const rawApiError =
    todayQuery.data?.error || liveQuery.data?.error ||
    (todayQuery.error as any)?.message || (liveQuery.error as any)?.message || "";
  const normalizedApiError = rawApiError ? normalizeApiError(rawApiError) : null;
  const apiErrorRef = useMemo(() => (rawApiError ? buildErrorReference("NX-SPR") : ""), [rawApiError]);

  const filterBySport = (matches: any[]) => {
    if (sportCategory === "all") return matches;
    return matches.filter((m) => {
      const sport = String(m?.sport || "").toLowerCase();
      const league = String(m?.league || "").toLowerCase();
      switch (sportCategory) {
        case "football":   return sport === "football" || sport === "soccer" || league.includes("liga") || league.includes("league") || league.includes("bundesliga") || league.includes("serie") || league.includes("ligue") || league.includes("jupiler") || league.includes("uefa") || league.includes("eredivisie");
        case "basketball": return sport === "basketball" || league.includes("nba") || league.includes("basketball");
        case "mma":        return sport === "mma" || sport === "ufc" || league.includes("ufc") || league.includes("mma");
        case "motorsport": return sport === "motorsport" || sport === "f1" || sport === "motogp" || league.includes("formula") || league.includes("f1") || league.includes("nascar") || league.includes("motogp");
        case "tennis":     return sport === "tennis" || league.includes("tennis") || league.includes("atp") || league.includes("wta");
        case "baseball":   return sport === "baseball" || league.includes("baseball") || league.includes("mlb");
        case "ice_hockey": return sport === "ice_hockey" || sport === "hockey" || league.includes("hockey") || league.includes("nhl");
        case "other":      return !isFootballMatch(m) && sport !== "basketball" && sport !== "mma" && sport !== "motorsport" && sport !== "tennis" && sport !== "baseball" && sport !== "ice_hockey";
        default:           return true;
      }
    });
  };

  const rawLive = filterBySport(allLive);
  const rawUpcoming = filterBySport(allUpcoming);
  const rawFinished = filterBySport(allFinished);
  const filterEmpty = sportCategory !== "all" && rawLive.length === 0 && rawUpcoming.length === 0 && rawFinished.length === 0;

  const displayLive = filterEmpty ? allLive : rawLive;
  const displayUpcoming = filterEmpty ? allUpcoming : rawUpcoming;
  const displayFinished = filterEmpty ? allFinished : rawFinished;
  const sortedLive = useMemo(() => sortMatchesByCompetitionAndTime(displayLive, selectedDate), [displayLive, selectedDate]);
  const sortedUpcoming = useMemo(() => sortMatchesByCompetitionAndTime(displayUpcoming, selectedDate), [displayUpcoming, selectedDate]);
  const sortedFinished = useMemo(() => sortMatchesByCompetitionAndTime(displayFinished, selectedDate), [displayFinished, selectedDate]);

  const myTeamMatches = useMemo(() => {
    const favTeams = new Set(
      favorites
        .filter(f => f.startsWith("sport_team:"))
        .map(f => f.slice("sport_team:".length).toLowerCase())
    );
    if (favTeams.size === 0) return [];
    return [...sortedLive, ...sortedUpcoming].filter(m =>
      favTeams.has(String(m?.homeTeam || "").toLowerCase()) ||
      favTeams.has(String(m?.awayTeam || "").toLowerCase())
    );
  }, [favorites, sortedLive, sortedUpcoming]);

  const sportsSearchResults = useMemo(() => {
    const q = sportsSearchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return [...sortedLive, ...sortedUpcoming, ...sortedFinished].filter(m =>
      String(m?.homeTeam || "").toLowerCase().includes(q) ||
      String(m?.awayTeam || "").toLowerCase().includes(q) ||
      String(m?.league || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [sportsSearchQuery, sortedLive, sortedUpcoming, sortedFinished]);

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
    if (nextY <= 16) { toggleFiltersVisibility(true); return; }
    if (delta > 12 && nextY > 120) toggleFiltersVisibility(false);
    else if (delta < -10) toggleFiltersVisibility(true);
  }, [toggleFiltersVisibility]);

  const sportToolSourceMatches = useMemo(() => {
    if (sortedUpcoming.length > 0) return sortedUpcoming;
    if (sortedLive.length > 0) return sortedLive;
    return sortedFinished;
  }, [sortedFinished, sortedLive, sortedUpcoming]);

  const sportMenuPreview = useMemo(
    () => sportToolSourceMatches.slice(0, 6).map((match) => ({ match, split: predictionSplit(match) })),
    [sportToolSourceMatches]
  );

  const backendPredictions = useMemo(() => Array.isArray(toolsQuery.data?.footballPredictions) ? toolsQuery.data.footballPredictions : [], [toolsQuery.data?.footballPredictions]);
  const backendAcca = useMemo(() => Array.isArray(toolsQuery.data?.dailyAccaPicks) ? toolsQuery.data.dailyAccaPicks : [], [toolsQuery.data?.dailyAccaPicks]);

  const activeToolRows = useMemo(() => {
    if (activeSportTool === "football-predictions") {
      return backendPredictions.length > 0
        ? backendPredictions.slice(0, 8).map((item: any) => ({
            key: `pred_${item.matchId}`,
            title: `${safeStr(item.homeTeam)} vs ${safeStr(item.awayTeam)}`,
            meta: `${safeStr(item.homePct)}% · ${safeStr(item.drawPct)}% · ${safeStr(item.awayPct)}% · ${safeStr(item.confidence)}% conf.`,
            badges: buildHomeAwayBadges(item.homePct, item.awayPct, item.drawPct),
            item,
          }))
        : sportMenuPreview.slice(0, 6).map(({ match, split }) => ({
            key: `pred_${match.id}`,
            title: `${safeStr(match.homeTeam)} vs ${safeStr(match.awayTeam)}`,
            meta: `${split.home}% · ${split.draw}% · ${split.away}%`,
            badges: buildHomeAwayBadges(split.home, split.away, split.draw),
            match,
          }));
    }
    if (activeSportTool === "daily-acca-picks") {
      return backendAcca.length > 0
        ? backendAcca.slice(0, 8).map((item: any) => ({
            key: `acca_${item.matchId}`,
            title: `${safeStr(item.pickLabel)} · ${safeStr(item.homeTeam)} - ${safeStr(item.awayTeam)}`,
            meta: `${safeStr(item.market)} · Confidence ${safeStr(item.confidence)}%`,
            badges: buildHomeAwayBadges(item.homePct, item.awayPct, item.drawPct),
            item,
          }))
        : sportMenuPreview.slice(0, 6).map(({ match, split }) => {
            const side = split.home >= split.away ? "1" : "2";
            const confidence = Math.max(split.home, split.away);
            return {
              key: `acca_${match.id}`,
              title: `${side} · ${safeStr(match.homeTeam)} - ${safeStr(match.awayTeam)}`,
              meta: `Confidence ${confidence}%`,
              badges: buildHomeAwayBadges(split.home, split.away, split.draw),
              match,
            };
          });
    }
    return [];
  }, [activeSportTool, backendAcca, backendPredictions, sportMenuPreview]);

  const activeSportToolCard = useMemo(
    () => SPORT_TOOL_CARDS.find((card) => card.id === activeSportTool) || SPORT_TOOL_CARDS[0],
    [activeSportTool]
  );

  const handleMatchPress = useCallback((match: any) => {
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
  }, []);

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
      await pushMatchNotification("Notifications disabled", `${safeStr(match.homeTeam)} - ${safeStr(match.awayTeam)}`, { matchId: id });
      return;
    }
    const permission = await ensureMatchNotificationPermission();
    if (!permission) {
      Alert.alert("Notifications blocked", "Grant notification permission to receive match updates.");
      return;
    }
    const next = {
      ...subscriptionsRef.current,
      [id]: { id, espnLeague: resolveEspnLeague(match), homeTeam: safeStr(match?.homeTeam) || "Home", awayTeam: safeStr(match?.awayTeam) || "Away" },
    };
    await setSubscriptionsAndPersist(next);
    await pushMatchNotification("Notifications enabled", `${safeStr(match.homeTeam)} - ${safeStr(match.awayTeam)} is being followed`, { matchId: id });
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
              if (prev.status !== "live" && currentStatus === "live" && shouldNotify(`${sub.id}:start`, 20_000))
                await pushMatchNotification("Match started", `${sub.homeTeam} - ${sub.awayTeam} has kicked off`, { matchId: sub.id });
              if (prev.status !== "finished" && currentStatus === "finished" && shouldNotify(`${sub.id}:finished`, 20_000))
                await pushMatchNotification("Match finished", `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`, { matchId: sub.id });
              if (currentStatus === "live" && (prev.homeScore !== currentHomeScore || prev.awayScore !== currentAwayScore) && shouldNotify(`${sub.id}:score`, 10_000))
                await pushMatchNotification("Goal update", `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`, { matchId: sub.id });
            }
            nextSnapshots[sub.id] = { status: currentStatus, homeScore: currentHomeScore, awayScore: currentAwayScore, eventHashes: prev?.eventHashes || [] };
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
          const eventHashes = keyEvents.filter((event: any) => interestingEventRegex.test(`${safeStr(event?.type)} ${safeStr(event?.detail)}`)).map((event: any) => toEventHash(event));
          if (prev) {
            if (prev.status !== "live" && currentStatus === "live" && shouldNotify(`${sub.id}:start`, 20_000))
              await pushMatchNotification("Match started", `${safeStr(sub.homeTeam)} - ${safeStr(sub.awayTeam)} has kicked off`, { matchId: sub.id });
            if (prev.status !== "finished" && currentStatus === "finished" && shouldNotify(`${sub.id}:finished`, 20_000))
              await pushMatchNotification("Match finished", `${safeStr(sub.homeTeam)} ${currentHomeScore}-${currentAwayScore} ${safeStr(sub.awayTeam)}`, { matchId: sub.id });
            if (currentStatus === "live" && (prev.homeScore !== currentHomeScore || prev.awayScore !== currentAwayScore) && shouldNotify(`${sub.id}:score`, 10_000))
              await pushMatchNotification("Goal update", `${safeStr(sub.homeTeam)} ${currentHomeScore}-${currentAwayScore} ${safeStr(sub.awayTeam)}`, { matchId: sub.id });
            const seen = new Set(prev.eventHashes || []);
            const newInterestingEvents = keyEvents.filter((event: any) => {
              const hash = toEventHash(event);
              if (seen.has(hash)) return false;
              return interestingEventRegex.test(`${safeStr(event?.type)} ${safeStr(event?.detail)}`);
            });
            if (newInterestingEvents.length > 0 && shouldNotify(`${sub.id}:events`, 10_000)) {
              const latest = newInterestingEvents[newInterestingEvents.length - 1];
              const evTime = latest?.time ? `${latest.time} • ` : "";
              const evType = safeStr(latest?.type || "Event");
              const evDetail = safeStr(latest?.detail).trim();
              const countPrefix = newInterestingEvents.length > 1 ? `+${newInterestingEvents.length} updates\n` : "";
              const scoreLine = `${safeStr(sub.homeTeam)} ${currentHomeScore}-${currentAwayScore} ${safeStr(sub.awayTeam)}`;
              const body = `${countPrefix}${scoreLine}\n${evTime}${evType}${evDetail ? `: ${evDetail}` : ""}`;
              await pushMatchNotification("Match event", body, { matchId: sub.id });
            }
          }
          nextSnapshots[sub.id] = { status: currentStatus, homeScore: currentHomeScore, awayScore: currentAwayScore, eventHashes };
          changed = true;
        } catch { /* keep polling */ }
      }
      if (changed && alive) {
        matchSnapshotsRef.current = nextSnapshots;
        await saveMatchSnapshots(nextSnapshots);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 20_000);
    return () => { alive = false; clearInterval(timer); };
  }, [currentMatchesById, matchSubscriptions, shouldNotify]);

  const handleCompetitionPress = (comp: CountryCompetition) => {
    router.push({ pathname: "/competition", params: { league: comp.league, sport: "soccer", espnLeague: comp.espn } });
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

  const bottomPad = Platform.OS === "web" ? 44 : insets.bottom + 100;
  const showLive = sportsView === "live" && statusFilter !== "upcoming";
  const showUpcoming = sportsView === "upcoming" && statusFilter !== "live";
  const showMenuSection = sportsView === "menu";
  const showCompetitionsSection = sportsView === "competitions";

  // ── Sports sub-nav tabs ────────────────────────────────────────────────────
  const SPORTS_TABS = [
    { id: "competitions" as const, label: "Explore" },
    { id: "live" as const,         label: "Live" },
    { id: "upcoming" as const,     label: "Matchday" },
    { id: "menu" as const,         label: "Analyse" },
  ];

  // ── Today section matches ─────────────────────────────────────────────────
  const todayCombined = useMemo(() => [
    ...sortedLive.slice(0, 8),
    ...sortedUpcoming.slice(0, 12),
  ], [sortedLive, sortedUpcoming]);

  return (
    <View style={styles.container}>
      <NexoraHeader
        title="SPORT"
        titleColor={P.accent}
        showSearch
        showNotification
        showFavorites
        showProfile
        onSearch={() => { setSportsSearchActive(s => !s); setSportsSearchQuery(""); }}
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      {/* ── Sports Sub-Nav ── */}
      <View style={styles.subNav}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subNavContent}
        >
          {SPORTS_TABS.map((tab) => {
            const isActive = sportsView === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.subNavItem}
                onPress={() => setSportsView(tab.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.subNavText, isActive && styles.subNavTextActive]}>
                  {tab.label}
                  {tab.id === "live" && sortedLive.length > 0 && (
                    <Text style={styles.liveCount}> {sortedLive.length}</Text>
                  )}
                </Text>
                {isActive && <View style={styles.subNavIndicator} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Sport Search ── */}
      {sportsSearchActive && (
        <View style={styles.sportsSearchBar}>
          <Ionicons name="search" size={15} color={P.muted} />
          <TextInput
            style={styles.sportsSearchInput}
            placeholder="Zoek team of competitie..."
            placeholderTextColor={P.muted}
            value={sportsSearchQuery}
            onChangeText={setSportsSearchQuery}
            autoFocus
            returnKeyType="search"
          />
          <TouchableOpacity onPress={() => { setSportsSearchActive(false); setSportsSearchQuery(""); }}>
            <Ionicons name="close-circle" size={16} color={P.muted} />
          </TouchableOpacity>
        </View>
      )}
      {sportsSearchActive && sportsSearchQuery.trim().length >= 2 && (
        <View style={styles.sportsSearchResults}>
          {sportsSearchResults.length === 0 ? (
            <Text style={styles.sportsSearchEmpty}>Geen resultaten voor &quot;{sportsSearchQuery}&quot;</Text>
          ) : sportsSearchResults.map((match: any) => {
            const isLiveMatch = String(match?.status || "").toLowerCase() === "live";
            return (
              <TouchableOpacity
                key={match.id}
                style={styles.sportsSearchResult}
                onPress={() => { setSportsSearchActive(false); setSportsSearchQuery(""); handleMatchPress(match); }}
              >
                <View style={styles.sportsSearchResultInfo}>
                  <Text style={styles.sportsSearchResultTeams} numberOfLines={1}>
                    {match.homeTeam} vs {match.awayTeam}
                  </Text>
                  <Text style={styles.sportsSearchResultMeta} numberOfLines={1}>
                    {match.league} · {isLiveMatch ? "🔴 LIVE" : (match.startTime || "Gepland")}
                  </Text>
                </View>
                {isLiveMatch && (
                  <View style={styles.sportsSearchLivePill}>
                    <Text style={styles.sportsSearchLiveText}>LIVE</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Main scroll ── */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleFeedScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
        contentContainerStyle={{ paddingBottom: bottomPad, width: contentWidth, alignSelf: "center" }}
      >
        {/* ── Banners ── */}
        {filterEmpty && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={14} color={P.accent} />
            <Text style={styles.bannerText}>No matches for &quot;{SPORT_CATEGORIES.find(c => c.id === sportCategory)?.label}&quot; – showing all sports.</Text>
          </View>
        )}
        {normalizedApiError && (
          <View style={[styles.banner, styles.bannerError]}>
            <Ionicons name="warning-outline" size={14} color="#ff6b6b" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.bannerText, { color: "#ff6b6b" }]}>{normalizedApiError.userMessage}</Text>
              <Text style={styles.bannerCode}>Error: {apiErrorRef || normalizedApiError.code}</Text>
            </View>
          </View>
        )}
        {noRemoteData && (
          <View style={styles.banner}>
            <Ionicons name="cloud-offline-outline" size={14} color={P.accent} />
            <Text style={styles.bannerText}>No live data received. Results will follow when available.</Text>
          </View>
        )}

        {/* ══════════════════════════════════════════
            EXPLORE TAB
        ══════════════════════════════════════════ */}
        {showCompetitionsSection && (
          <>
            {/* ── SPORT CATEGORIES FILTER ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: "row" }}
            >
              {SPORT_CATEGORIES.map((cat) => {
                const isActive = sportCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSportCategory(cat.id as SportCategoryId)}
                    activeOpacity={0.75}
                    style={[styles.sportCatPill, isActive && styles.sportCatPillActive]}
                  >
                    <Ionicons name={cat.icon} size={14} color={isActive ? "#fff" : P.muted} />
                    <Text style={[styles.sportCatLabel, isActive && styles.sportCatLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── MIJN TEAMS ── */}
            {myTeamMatches.length > 0 && (
              <>
                <SectionTitle title="⭐ Mijn Teams" accent />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                  {myTeamMatches.slice(0, 8).map((match: any) => (
                    <TodayMatchCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── LIVE NOW ── */}
            <SectionTitle
              title="🔴 Live Nu"
              accent
              count={sortedLive.length}
              action={sortedLive.length > 3 ? `Alle ${sortedLive.length}` : undefined}
              onAction={() => setSportsView("live")}
            />
            {liveFirstLoad ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                {[1, 2].map(i => <View key={i} style={styles.liveSkeleton} />)}
              </ScrollView>
            ) : sortedLive.length === 0 ? (
              <View style={styles.emptyCarousel}>
                <Ionicons name="radio-button-off-outline" size={24} color={P.muted} />
                <Text style={styles.emptyText}>No live matches right now</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
              >
                {sortedLive.slice(0, 10).map((match: any) => (
                  <LiveNowCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                ))}
              </ScrollView>
            )}

            {/* ── VANDAAG ── */}
            <SectionTitle
              title="Today"
              accent
              action={todayCombined.length > 5 ? "All matches" : undefined}
              onAction={() => setSportsView("upcoming")}
            />
            {todayFirstLoad ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                {[1, 2, 3].map(i => <View key={i} style={styles.todaySkeleton} />)}
              </ScrollView>
            ) : todayCombined.length === 0 ? (
              <View style={styles.emptyCarousel}>
                <Ionicons name="calendar-outline" size={24} color={P.muted} />
                <Text style={styles.emptyText}>No matches today</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                {todayCombined.map((match: any) => (
                  <TodayMatchCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                ))}
              </ScrollView>
            )}

            {/* ── POPULAR COMPETITIONS ── */}
            <SectionTitle title="Popular Competitions" accent />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate={0.9}
              snapToInterval={compCardWidth + 10}
              snapToAlignment="start"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}
            >
              {TOP_COMPETITIONS.map((comp) => (
                <PopularCompetitionCard
                  key={comp.id}
                  comp={comp}
                  cardWidth={compCardWidth}
                  onPress={() => router.push({ pathname: "/competition", params: { league: comp.league, sport: "soccer", espnLeague: comp.espn } })}
                />
              ))}
            </ScrollView>

            {/* ── LANDEN ── */}
            <SectionTitle title="Landen" accent />
            <View style={styles.countryGrid}>
              {COUNTRY_COMPETITIONS.map((country) => (
                <CountryCard
                  key={country.countryCode}
                  country={country}
                  active={selectedCountryCode === country.countryCode}
                  onPress={() => setSelectedCountryCode(country.countryCode)}
                />
              ))}
            </View>

            {/* ── HIGHLIGHTS & REPLAYS ── */}
            {sortedFinished.length > 0 && (
              <>
                <SectionTitle title="Highlights & Replays" accent />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                  {sortedFinished.slice(0, 10).map((match: any) => (
                    <HighlightCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── ALLE COMPETITIES (selected country) ── */}
            <SectionTitle title={`${flagFromIso2(selectedCountryCode)} ${selectedCountry?.countryName} · Competities`} accent />
            <View style={styles.compListPanel}>
              {(selectedCountry?.competitions || []).map((comp) => (
                <TouchableOpacity
                  key={comp.id}
                  activeOpacity={0.75}
                  style={styles.compListRow}
                  onPress={() => {
                    if (comp.tier === "national" && comp.nationalTeamName) {
                      router.push({ pathname: "/team-detail", params: { teamId: `name:${encodeURIComponent(comp.nationalTeamName)}`, teamName: comp.nationalTeamName, sport: "soccer", league: comp.espn } });
                    } else {
                      handleCompetitionPress(comp);
                    }
                  }}
                >
                  <View style={[styles.compListAccent, { backgroundColor: comp.color }]} />
                  <View style={[styles.compListIcon, { backgroundColor: `${comp.color}18` }]}>
                    <Ionicons name={tierIcon(comp.tier) as any} size={16} color={comp.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compListName} numberOfLines={1}>{comp.league}</Text>
                    <Text style={[styles.compListTier, { color: comp.color }]}>{tierLabel(comp.tier)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={P.muted} />
                </TouchableOpacity>
              ))}
            </View>

          </>
        )}

        {/* ══════════════════════════════════════════
            LIVE TAB
        ══════════════════════════════════════════ */}
        {showLive && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={styles.livePillInline}>
                <View style={styles.liveDotInline} />
                <Text style={styles.livePillText}>Live Nu</Text>
              </View>
              <LiveBadge />
            </View>
            {liveFirstLoad ? (
              [1, 2, 3].map(i => <View key={i} style={styles.matchCardSkeleton}><View style={styles.skeletonShimmer} /></View>)
            ) : sortedLive.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="radio-button-off-outline" size={28} color={P.muted} />
                <Text style={styles.emptyText}>No live matches</Text>
              </View>
            ) : (
              sortedLive.slice(0, 60).map((match: any) => (
                <MatchRowCard
                  key={match.id}
                  match={match}
                  onPress={() => handleMatchPress(match)}
                  onNotificationToggle={() => toggleMatchNotification(match)}
                />
              ))
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════
            LINEUPS TAB
        ══════════════════════════════════════════ */}
        {showUpcoming && (
          <View style={styles.section}>
            <DateSelector date={selectedDate} onDateChange={setSelectedDate} />
            <View style={styles.sectionHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 3, height: 18, backgroundColor: P.accent, borderRadius: 2 }} />
                <Text style={styles.sectionTitle}>
                  {selectedDate === todayUTC() ? "Matches today" : formatDateDisplay(selectedDate)}
                </Text>
              </View>
            </View>
            {todayFirstLoad ? (
              [1, 2, 3].map(i => <View key={i} style={styles.matchCardSkeleton}><View style={styles.skeletonShimmer} /></View>)
            ) : sortedUpcoming.length === 0 && sortedFinished.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={28} color={P.muted} />
                <Text style={styles.emptyText}>No matches on {formatDateDisplay(selectedDate)}</Text>
              </View>
            ) : (
              <>
                {sortedUpcoming.length > 0 && (
                  <>
                    <Text style={styles.subHead}>Upcoming</Text>
                    {sortedUpcoming.slice(0, 60).map((match: any) => (
                      <MatchRowCard
                        key={match.id}
                        match={match}
                        onPress={() => handleMatchPress(match)}
                        onNotificationToggle={() => toggleMatchNotification(match)}
                      />
                    ))}
                  </>
                )}
                {sortedFinished.length > 0 && (
                  <>
                    <Text style={[styles.subHead, { marginTop: 16 }]}>Afgelopen</Text>
                    {sortedFinished.slice(0, 60).map((match: any) => (
                      <MatchRowCard
                        key={match.id}
                        match={match}
                        onPress={() => handleMatchPress(match)}
                        onNotificationToggle={() => toggleMatchNotification(match)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════
            ANALYSE TAB
        ══════════════════════════════════════════ */}
        {showMenuSection && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 3, height: 18, backgroundColor: P.accent, borderRadius: 2 }} />
                <Text style={styles.sectionTitle}>Analyse</Text>
              </View>
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

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  scroll: { flex: 1 },

  /* ── Sub-nav tabs ── */
  subNav: {
    backgroundColor: P.bg,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  subNavContent: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 4,
  },
  subNavItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    position: "relative",
  },
  subNavText: {
    color: P.muted,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  subNavTextActive: { color: P.text },
  subNavIndicator: {
    position: "absolute",
    bottom: 0,
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: P.accent,
    borderRadius: 1,
  },
  liveCount: { color: P.live, fontSize: 12 },

  /* ── Carousels ── */
  carouselContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },

  /* ── Competition grid ── */
  compGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 11,
    marginBottom: 4,
  },

  /* ── Competition list ── */
  compListPanel: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.elevated,
    marginBottom: 8,
  },
  compListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingRight: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  compListAccent: { width: 3, alignSelf: "stretch", borderRadius: 2, marginLeft: 0 },
  compListIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", marginLeft: 8,
  },
  compListName: { color: P.text, fontSize: 14, fontWeight: "700" },
  compListTier: { fontSize: 11, fontWeight: "500", marginTop: 2 },

  /* ── All countries ── */
  countrySection: { marginHorizontal: 16, marginBottom: 16 },
  countrySectionHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 4,
    marginBottom: 4,
  },
  countrySectionFlag: { fontSize: 22 },
  countrySectionName: { color: P.text, fontSize: 16, fontWeight: "700" },

  /* ── Banners ── */
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, padding: 12,
    borderRadius: 14, backgroundColor: `${P.accent}18`,
    borderWidth: 1, borderColor: `${P.accent}44`,
  },
  bannerError: { backgroundColor: "rgba(255,107,107,0.12)", borderColor: "rgba(255,107,107,0.3)" },
  bannerText: { flex: 1, color: P.muted, fontSize: 12, fontWeight: "500" },
  bannerCode: { color: P.muted, fontSize: 10, marginTop: 2 },

  /* ── Section titles ── */
  section: { marginTop: 8 },
  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sectionTitle: { color: P.text, fontSize: 18, fontWeight: "700", letterSpacing: 0.3 },
  subHead: { color: P.muted, fontSize: 12, fontWeight: "600", paddingHorizontal: 16, paddingTop: 8, letterSpacing: 0.8, textTransform: "uppercase" },

  /* ── Live pill inline ── */
  livePillInline: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: `${P.live}22`, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: `${P.live}44`,
  },
  liveDotInline: { width: 6, height: 6, borderRadius: 3, backgroundColor: P.live },
  livePillText: { color: P.live, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },

  /* ── Skeletons ── */
  liveSkeleton: {
    width: 300, height: 180, borderRadius: 16,
    backgroundColor: P.elevated, marginRight: 12, opacity: 0.6,
  },
  todaySkeleton: {
    width: 190, height: 130, borderRadius: 14,
    backgroundColor: P.elevated, marginRight: 10, opacity: 0.6,
  },
  matchCardSkeleton: {
    marginHorizontal: 16, marginVertical: 5, height: 76, borderRadius: 14,
    backgroundColor: P.elevated, overflow: "hidden",
  },
  skeletonShimmer: { height: "100%", width: "40%", backgroundColor: `${P.text}08` },

  /* ── Empty states ── */
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyCarousel: {
    height: 96, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 12, marginHorizontal: 16,
    borderRadius: 16, backgroundColor: P.card,
    borderWidth: 1, borderColor: P.border,
    borderStyle: "dashed",
  },
  emptyText: { color: P.muted, fontSize: 13, fontWeight: "500", letterSpacing: 0.2 },

  /* ── Analyse tool cards ── */
  toolsRow: { paddingHorizontal: 16, gap: 12, paddingVertical: 8 },
  toolCard: {
    width: 180, borderRadius: 16, overflow: "hidden",
    borderWidth: 1.5, borderColor: SP_BORDER,
  },
  toolCardInner: { padding: 14, gap: 6 },
  toolIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 4 },
  toolTitle: { color: P.text, fontSize: 13, fontWeight: "700" },
  toolSub: { color: P.muted, fontSize: 11, lineHeight: 16 },
  toolAction: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  toolActionText: { fontSize: 12, fontWeight: "600" },
  toolPanel: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: SP_BORDER,
  },
  toolPanelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  toolPanelTitle: { color: P.text, fontSize: 15, fontWeight: "700" },
  toolPanelCount: { color: P.muted, fontSize: 12 },
  toolRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: P.border, gap: 3 },
  toolRowTeams: { color: P.text, fontSize: 13, fontWeight: "600" },
  toolRowMeta: { color: P.muted, fontSize: 11 },
  toolBadgeRow: { flexDirection: "row", gap: 5, marginTop: 5, flexWrap: "wrap" },
  toolBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: `${P.text}12`, borderWidth: 1, borderColor: `${P.text}18`,
  },
  toolBadgePos: { backgroundColor: "rgba(0,230,118,0.12)", borderColor: "rgba(0,230,118,0.28)" },
  toolBadgeNeg: { backgroundColor: "rgba(255,45,85,0.12)", borderColor: "rgba(255,45,85,0.28)" },
  toolBadgeText: { color: P.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  toolEmpty: { color: P.muted, fontSize: 13, textAlign: "center", paddingVertical: 16 },

  /* ── Sport category filter ── */
  sportCatPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: P.elevated, borderWidth: 1, borderColor: P.border,
  },
  sportCatPillActive: { backgroundColor: P.accent, borderColor: P.accent },
  sportCatLabel: { color: P.muted, fontSize: 12, fontWeight: "600" },
  sportCatLabelActive: { color: "#fff" },

  /* ── Country grid ── */
  countryGrid: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between",
    paddingHorizontal: 16, gap: 8,
  },

  /* ── Sport search ── */
  sportsSearchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginVertical: 8,
    backgroundColor: P.elevated, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: P.border,
  },
  sportsSearchInput: {
    flex: 1, color: P.text, fontSize: 14, fontWeight: "500",
    paddingVertical: 0,
  },
  sportsSearchResults: {
    marginHorizontal: 16, borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: P.border,
    backgroundColor: P.card, marginBottom: 8,
  },
  sportsSearchResult: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: P.border,
  },
  sportsSearchResultInfo: { flex: 1, gap: 2 },
  sportsSearchResultTeams: { color: P.text, fontSize: 13, fontWeight: "600" },
  sportsSearchResultMeta: { color: P.muted, fontSize: 11 },
  sportsSearchLivePill: {
    backgroundColor: "rgba(255,48,64,0.15)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, marginLeft: 8,
  },
  sportsSearchLiveText: { color: P.live, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  sportsSearchEmpty: { color: P.muted, fontSize: 13, textAlign: "center", padding: 16 },
});
