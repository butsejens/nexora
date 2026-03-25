import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, Platform, TouchableOpacity, TextInput, Alert,
  Image, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import "@/constants/design-system";
import { NexoraHeader } from "@/components/NexoraHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { MatchRowCard } from "@/components/premium";
import { apiRequest } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getLeagueLogo } from "@/lib/logo-manager";
import { safeStr, toPct, flagFromIso2 } from "@/lib/utils";
import { COUNTRY_COMPETITIONS, CountryCatalog, tierPriority } from "@/lib/country-data";
import { resolveMatchBucket } from "@/lib/match-state";
import { buildGroundedMatchAnalysis } from "@/lib/match-analysis-engine";
import {
  dedupeCanonicalMatches,
  partitionForHomeSections,
  toCanonicalMatch,
  toLegacyMatchCard,
} from "@/lib/canonical-match";
import { useNexora } from "@/context/NexoraContext";
import { useFollowState } from "@/context/UserStateContext";
import { t as tFn, getLanguage } from "@/lib/i18n";
import { useTranslation } from "@/lib/useTranslation";
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
  { id: "all",        labelKey: "sports.allSports",  icon: "apps-outline"                as const },
  { id: "football",   labelKey: "sports.football",    icon: "football-outline"            as const },
  { id: "basketball", labelKey: "sports.basketball",  icon: "basketball-outline"          as const },
  { id: "mma",        labelKey: "sports.mma",         icon: "fitness-outline"             as const },
  { id: "motorsport", labelKey: "sports.motorsport",  icon: "car-sport-outline"           as const },
  { id: "tennis",     labelKey: "sports.tennis",      icon: "tennisball-outline"          as const },
  { id: "baseball",   labelKey: "sports.baseball",    icon: "baseball-outline"            as const },
  { id: "ice_hockey", labelKey: "sports.iceHockey",   icon: "snow-outline"                as const },
  { id: "other",      labelKey: "sports.other",       icon: "ellipsis-horizontal-outline" as const },
];
type SportCategoryId = typeof SPORT_CATEGORIES[number]["id"];

const SPORT_TOOL_CARDS = [
  {
    id: "football-predictions",
    titleKey: "sports.predictions",
    subtitleKey: "sports.predictionsDesc",
    icon: "analytics-outline" as const,
    accent: COLORS.accent,
  },
  {
    id: "daily-acca-picks",
    titleKey: "sports.dailyAcca",
    subtitleKey: "sports.dailyAccaDesc",
    icon: "ticket-outline" as const,
    accent: COLORS.green,
  },
];

type SportToolId = typeof SPORT_TOOL_CARDS[number]["id"];

function buildMenuAnalysis(match: any) {
  const structured = buildGroundedMatchAnalysis({
    homeTeam: String(match?.homeTeam || "Home"),
    awayTeam: String(match?.awayTeam || "Away"),
    isLive: resolveMatchBucket(match) === "live",
    minute: Number(match?.minute ?? null),
    homeScore: Number(match?.homeScore ?? 0),
    awayScore: Number(match?.awayScore ?? 0),
    stats: {
      home: match?.homeStats || match?.stats?.home || undefined,
      away: match?.awayStats || match?.stats?.away || undefined,
    },
    events: Array.isArray(match?.keyEvents) ? match.keyEvents : [],
    home: {
      rank: Number(match?.homeRank ?? null),
      points: Number(match?.homePoints ?? null),
      goalDiff: Number(match?.homeGoalDiff ?? null),
      topScorer: String(match?.homeTopScorer || "") || null,
      topScorerGoals: Number(match?.homeTopScorerGoals ?? null),
      topAssist: String(match?.homeTopAssist || "") || null,
      topAssistCount: Number(match?.homeTopAssistCount ?? null),
    },
    away: {
      rank: Number(match?.awayRank ?? null),
      points: Number(match?.awayPoints ?? null),
      goalDiff: Number(match?.awayGoalDiff ?? null),
      topScorer: String(match?.awayTopScorer || "") || null,
      topScorerGoals: Number(match?.awayTopScorerGoals ?? null),
      topAssist: String(match?.awayTopAssist || "") || null,
      topAssistCount: Number(match?.awayTopAssistCount ?? null),
    },
  });
  return {
    ...structured,
    matchId: String(match?.id || ""),
    homeTeam: String(match?.homeTeam || ""),
    awayTeam: String(match?.awayTeam || ""),
    status: String(match?.status || "upcoming"),
    sport: String(match?.sport || "football"),
    homeScore: Number(match?.homeScore ?? 0),
    awayScore: Number(match?.awayScore ?? 0),
    minute: Number(match?.minute ?? 0),
    homeTeamLogo: match?.homeTeamLogo || "",
    awayTeamLogo: match?.awayTeamLogo || "",
    league: String(match?.league || ""),
  };
}



function buildHomeAwayBadges(homePctRaw: any, awayPctRaw: any, drawPctRaw?: any) {
  const homePct = toPct(homePctRaw);
  const awayPct = toPct(awayPctRaw);
  const drawPct = drawPctRaw == null ? undefined : toPct(drawPctRaw);
  const homeBetter = homePct >= awayPct;
  const awayBetter = awayPct > homePct;
  const badges: { label: string; tone: "positive" | "negative" | "neutral" }[] = [
    { label: tFn("sports.home", { pct: homePct }), tone: homeBetter ? "positive" : "negative" },
    { label: tFn("sports.away", { pct: awayPct }), tone: awayBetter ? "positive" : "negative" },
  ];
  if (drawPct != null) badges.push({ label: tFn("sports.draw", { pct: drawPct }), tone: "neutral" });
  return badges;
}

// Types imported from @/lib/country-data





const normalizeLeagueKey = (value: string): string =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const PRIORITY_COMPETITIONS: Record<string, number> = {
  [normalizeLeagueKey("UEFA Champions League")]: 1,
  [normalizeLeagueKey("Premier League")]: 2,
  [normalizeLeagueKey("La Liga")]: 3,
  [normalizeLeagueKey("Bundesliga")]: 4,
  [normalizeLeagueKey("Serie A")]: 5,
  [normalizeLeagueKey("Ligue 1")]: 6,
  [normalizeLeagueKey("Jupiler Pro League")]: 7,
};

const competitionRankByLeague = COUNTRY_COMPETITIONS
  .flatMap((country) => country.competitions)
  .reduce<Record<string, number>>((acc, competition) => {
    const key = normalizeLeagueKey(competition.league);
    const explicit = PRIORITY_COMPETITIONS[key];
    acc[key] = explicit ?? ((tierPriority[competition.tier] ?? 9) + 20);
    return acc;
  }, { ...PRIORITY_COMPETITIONS });

const espnLeagueByName = COUNTRY_COMPETITIONS
  .flatMap((country) => country.competitions)
  .reduce<Record<string, string>>((acc, competition) => {
    acc[normalizeLeagueKey(competition.league)] = competition.espn;
    return acc;
  }, {
    [normalizeLeagueKey("UEFA Champions League")]: "uefa.champions",
    [normalizeLeagueKey("UEFA Europa League")]: "uefa.europa",
    [normalizeLeagueKey("UEFA Conference League")]: "uefa.europa.conf",
    [normalizeLeagueKey("UEFA Europa Conference League")]: "uefa.europa.conf",
    [normalizeLeagueKey("Premier League")]: "eng.1",
    [normalizeLeagueKey("Scottish Premiership")]: "sco.1",
    [normalizeLeagueKey("Premiership")]: "sco.1",
    [normalizeLeagueKey("Süper Lig")]: "tur.1",
    [normalizeLeagueKey("Super Lig")]: "tur.1",
  });

function resolveEspnLeagueForMatch(match: any): string {
  const direct = String(match?.espnLeague || "").trim();
  if (direct) return direct;
  return espnLeagueByName[normalizeLeagueKey(String(match?.league || ""))] || "eng.1";
}

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
  if (ymd === today) return tFn("sportsHome.today");
  if (ymd === shiftDate(today, -1)) return tFn("sportsHome.yesterday");
  if (ymd === shiftDate(today, 1)) return tFn("sportsHome.tomorrow");
  try {
    const locale = getLanguage() === "nl" ? "nl-BE" : "en-GB";
    return new Intl.DateTimeFormat(locale, {
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
          <Text style={dsStyles.todayBtnText}>{tFn("sportsHome.today")}</Text>
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
function SectionTitle({ title, action, onAction, count }: {
  title: string;
  accent?: boolean;
  action?: string;
  onAction?: () => void;
  count?: number;
}) {
  return (
    <View style={secStyles.row}>
      <View style={secStyles.left}>
        <View style={secStyles.accentBar} />
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
          <Ionicons name="chevron-forward" size={11} color={P.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Competition Group Header (for Live tab) ───────────────────────────────────
function CompetitionGroupHeader({ league, count }: { league: string; count: number }) {
  const logo = getLeagueLogo(league);
  return (
    <View style={cgStyles.row}>
      {logo ? (
        <Image source={typeof logo === "number" ? logo : { uri: logo as string }} style={cgStyles.logo} resizeMode="contain" />
      ) : (
        <View style={cgStyles.logoPh} />
      )}
      <Text style={cgStyles.name} numberOfLines={1}>{league}</Text>
      <View style={cgStyles.badge}><Text style={cgStyles.badgeText}>{count}</Text></View>
    </View>
  );
}
const cgStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    marginTop: 8,
  },
  logo: { width: 18, height: 18 },
  logoPh: { width: 18, height: 18, borderRadius: 4, backgroundColor: P.elevated },
  name: { flex: 1, color: P.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  badge: {
    backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { color: P.muted, fontSize: 10, fontWeight: "700" },
});

const secStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginTop: 28, marginBottom: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  accentBar: { width: 3, height: 20, backgroundColor: P.accent, borderRadius: 2 },
  title: { color: P.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.3, fontFamily: "Inter_800ExtraBold" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 4, paddingHorizontal: 2 },
  actionText: { color: P.accent, fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  countBadge: {
    backgroundColor: "rgba(229,9,20,0.15)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.30)",
  },
  countText: { color: P.accent, fontSize: 11, fontWeight: "800", fontFamily: "Inter_700Bold" },
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
  wrap: { marginRight: 10 },
  card: {
    width: 284, height: 166, borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: `${P.accent}44`,
    shadowColor: P.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 8, padding: 12,
  },
  accentBorder: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: P.accent, borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingLeft: 4 },
  leagueLogo: { width: 20, height: 20 },
  leagueLogoPlaceholder: { width: 22, height: 22, borderRadius: 5, backgroundColor: P.elevated },
  leagueName: { flex: 1, color: P.muted, fontSize: 11, fontWeight: "500" },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: `${P.live}22`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: `${P.live}55`,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: P.live },
  liveText: { color: P.live, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  minute: { color: P.muted, fontSize: 10, fontWeight: "600", marginLeft: 3 },
  teamsRow: { flexDirection: "row", alignItems: "center", paddingLeft: 4, flex: 1 },
  teamBlock: { flex: 1, alignItems: "center", gap: 5 },
  teamName: { color: P.text, fontSize: 11, fontWeight: "600", textAlign: "center", maxWidth: 90 },
  scoreBlock: { paddingHorizontal: 8, flexDirection: "row", alignItems: "center" },
  score: {
    color: P.text, fontSize: 24, fontWeight: "800", letterSpacing: 0.8, textAlign: "center",
    // @ts-ignore
    textShadowColor: "rgba(229,9,20,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  stadium: { color: P.muted, fontSize: 9, marginTop: 6, paddingLeft: 4 },
});

// ── Today Match Card ──────────────────────────────────────────────────────────
function TodayMatchCardInner({ match, onPress }: { match: any; onPress: () => void }) {
  const bucket = resolveMatchBucket(match);
  const isLive = bucket === "live";
  const isFinished = bucket === "finished";
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
  wrap: { marginRight: 8 },
  card: {
    width: 184, borderRadius: 14, backgroundColor: P.card, padding: 11,
    borderWidth: 1, borderColor: P.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  leagueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  leagueIcon: { width: 16, height: 16 },
  leagueName: { color: P.muted, fontSize: 10, fontWeight: "500", flex: 1 },
  teamsRow: { flexDirection: "row", alignItems: "center" },
  teamBlock: { flex: 1, alignItems: "center", gap: 4 },
  teamName: { color: P.text, fontSize: 10, fontWeight: "600", textAlign: "center", maxWidth: 68 },
  center: { paddingHorizontal: 6, alignItems: "center" },
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
// Popular competitions sorted by importance (UCL first)
const TOP_COMPETITIONS = [
  { id: "ucl", league: "UEFA Champions League", espn: "uefa.champions", color: "#1a56a0", emoji: "⭐" },
  { id: "en_d1", league: "Premier League", espn: "eng.1", color: "#3d0099", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "es_d1", league: "La Liga", espn: "esp.1", color: "#cc0033", emoji: "🇪🇸" },
  { id: "de_d1", league: "Bundesliga", espn: "ger.1", color: "#cc0000", emoji: "🇩🇪" },
  { id: "it_d1", league: "Serie A", espn: "ita.1", color: "#006ab3", emoji: "🇮🇹" },
  { id: "fr_d1", league: "Ligue 1", espn: "fra.1", color: "#ae2028", emoji: "🇫🇷" },
  { id: "be_d1", league: "Jupiler Pro League", espn: "bel.1", color: "#005b99", emoji: "🇧🇪" },
  { id: "uel", league: "UEFA Europa League", espn: "uefa.europa", color: "#f47920", emoji: "🏆" },
  { id: "uecl", league: "UEFA Conference League", espn: "uefa.europa.conf", color: "#25a851", emoji: "🏆" },
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
    height: 108, borderRadius: 14, backgroundColor: P.elevated,
    overflow: "hidden", alignItems: "center", paddingBottom: 8,
    borderWidth: 1, borderColor: P.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  colorTop: { width: "100%", height: 5 },
  logoWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6 },
  logo: { width: 46, height: 46 },
  emoji: { fontSize: 34 },
  name: { color: P.text, fontSize: 10, fontWeight: "700", textAlign: "center", paddingHorizontal: 6, lineHeight: 12 },
});

// ── Country Card ──────────────────────────────────────────────────────────────
function CountryCard({ country, onPress }: { country: CountryCatalog; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={countryCardStyles.card}>
      <View style={countryCardStyles.colorTop} />
      <View style={countryCardStyles.flagWrap}>
        <Text style={countryCardStyles.flag}>{flagFromIso2(country.countryCode)}</Text>
      </View>
      <Text style={countryCardStyles.name} numberOfLines={1}>{tFn(country.countryName)}</Text>
      <Text style={countryCardStyles.meta}>{country.competitions.length}</Text>
    </TouchableOpacity>
  );
}

const countryCardStyles = StyleSheet.create({
  card: {
    width: 96,
    borderRadius: 14,
    backgroundColor: P.elevated,
    overflow: "hidden",
    alignItems: "center",
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: P.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  colorTop: { width: "100%", height: 4, backgroundColor: "rgba(255,255,255,0.1)" },
  flagWrap: { paddingTop: 10, paddingBottom: 4 },
  flag: { fontSize: 30 },
  name: { color: P.text, fontSize: 10, fontWeight: "700", textAlign: "center", paddingHorizontal: 6, lineHeight: 13 },
  meta: { color: P.muted, fontSize: 9, fontWeight: "500", marginTop: 3 },
});


// ── Highlight Card ────────────────────────────────────────────────────────────
function HighlightCard({ match, onPress }: { match: any; onPress: () => void }) {
  const homeScore = match?.homeScore ?? 0;
  const awayScore = match?.awayScore ?? 0;
  const hasThumbnail = !!match?.thumbnail;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={hlStyles.wrap}>
      <View style={hlStyles.card}>
        {hasThumbnail ? (
          <Image source={{ uri: match.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#0f0f1a"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={[StyleSheet.absoluteFill, { top: "40%" }]} />
        <View style={hlStyles.hlBadge}>
          <Ionicons name="star" size={8} color="#FFD700" />
          <Text style={hlStyles.hlBadgeText}>Highlights</Text>
        </View>
        <LinearGradient
          colors={["rgba(229,9,20,0.9)", "rgba(180,0,10,0.95)"]}
          style={hlStyles.playBtn}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 2 }} />
        </LinearGradient>
        <View style={hlStyles.overlay}>
          {match?.homeTeamLogo || match?.awayTeamLogo ? (
            <View style={hlStyles.teamsLogoRow}>
              <TeamLogo uri={match?.homeTeamLogo} teamName={match?.homeTeam || ""} size={22} />
              <Text style={hlStyles.score}>{homeScore} - {awayScore}</Text>
              <TeamLogo uri={match?.awayTeamLogo} teamName={match?.awayTeam || ""} size={22} />
            </View>
          ) : null}
          <Text style={hlStyles.teams} numberOfLines={1}>{match?.homeTeam || match?.title}{match?.awayTeam ? ` · ${match.awayTeam}` : ""}</Text>
          <Text style={hlStyles.league} numberOfLines={1}>{match?.league || match?.competition || "Sport"}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const hlStyles = StyleSheet.create({
  wrap: { marginRight: 10 },
  card: {
    width: 240, height: 140, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: P.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0f0f1a",
  },
  hlBadge: {
    position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(255,215,0,0.15)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.3)",
  },
  hlBadgeText: { color: "#FFD700", fontSize: 8, fontWeight: "700" },
  playBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    shadowColor: "rgba(229,9,20,0.6)", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8, shadowRadius: 10, elevation: 8,
  },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 9 },
  teamsLogoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  score: { color: P.text, fontSize: 15, fontWeight: "800" },
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
  const { followedTeams } = useFollowState();
  const { t } = useTranslation();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter] = useState<"all" | "live" | "upcoming">("all");
  const [sportCategory, setSportCategory] = useState<SportCategoryId>("all");
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
  const compactHeaderRef = useRef(false);
  const [compactHeader, setCompactHeader] = useState(false);

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
    queryFn: async () => {
      const date = encodeURIComponent(selectedDate);
      const candidates = [
        `/api/sports/live?date=${date}`,
        `/api/sports/by-date?date=${date}`,
        "/api/sports/live",
      ];
      let best: SportsPayload = { live: [], upcoming: [], finished: [] };
      for (const path of candidates) {
        try {
          const payload = await fetchSportsPayloadWithTimeout(path, 6000);
          const liveCount = Array.isArray(payload?.live) ? payload.live.length : 0;
          const total = liveCount + (payload?.upcoming?.length || 0) + (payload?.finished?.length || 0);
          if (liveCount > 0) return payload;
          if (total > ((best?.live?.length || 0) + (best?.upcoming?.length || 0) + (best?.finished?.length || 0))) {
            best = payload;
          }
        } catch {
          // Continue to next fallback endpoint.
        }
      }
      return best;
    },
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

  const highlightsQuery = useQuery({
    queryKey: ["sports", "highlights"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sports/highlights");
      const json = await res.json();
      return Array.isArray(json?.highlights) ? json.highlights : [];
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
  });
  const realHighlights: any[] = highlightsQuery.data || [];

  const liveFirstLoad = liveQuery.isLoading && !liveQuery.data;
  const todayFirstLoad = todayQuery.isLoading && !todayQuery.data;

  const remoteLive: any[] = useMemo(
    () => liveQuery.data?.live || todayQuery.data?.live || [],
    [liveQuery.data?.live, todayQuery.data?.live]
  );
  const remoteUpcoming: any[] = useMemo(() => todayQuery.data?.upcoming || [], [todayQuery.data?.upcoming]);
  const remoteFinished: any[] = useMemo(() => todayQuery.data?.finished || [], [todayQuery.data?.finished]);
  const canonicalRemote = useMemo(() => {
    const rows = [
      ...(Array.isArray(remoteLive) ? remoteLive : []),
      ...(Array.isArray(remoteUpcoming) ? remoteUpcoming : []),
      ...(Array.isArray(remoteFinished) ? remoteFinished : []),
    ]
      .map((row) => toCanonicalMatch(row))
      .filter(Boolean) as any[];
    return partitionForHomeSections(dedupeCanonicalMatches(rows), selectedDate);
  }, [remoteFinished, remoteLive, remoteUpcoming, selectedDate]);
  const hasRemoteData = remoteLive.length + remoteUpcoming.length + remoteFinished.length > 0;

  const [stickyLiveMap, setStickyLiveMap] = useState<Record<string, any>>({});

  useEffect(() => { setStickyLiveMap({}); }, [selectedDate]);

  useEffect(() => {
    const now = Date.now();
    setStickyLiveMap((prev) => {
      const next = { ...prev };
      for (const match of canonicalRemote.liveNow) {
        if (!match?.id) continue;
        next[match.id] = { ...next[match.id], ...match, __lastSeenLiveAt: now };
      }
      const finishedIds = new Set((canonicalRemote.finished || []).map((m: any) => String(m?.id || "")));
      const LIVE_STICKY_TTL_MS = 20 * 60 * 1000;
      for (const [id, match] of Object.entries(next)) {
        const seenAt = Number((match as any)?.__lastSeenLiveAt || 0);
        const expired = now - seenAt > LIVE_STICKY_TTL_MS;
        const isFinished = resolveMatchBucket(match as any) === "finished";
        if (finishedIds.has(id) || isFinished || expired) delete next[id];
      }
      return next;
    });
  }, [canonicalRemote.finished, canonicalRemote.liveNow]);

  const mergedLive = useMemo(() => {
    const byId = new Map<string, any>();
    Object.entries(stickyLiveMap).forEach(([id, m]) => byId.set(id, m));
    canonicalRemote.liveNow.forEach((m) => { if (m?.id) byId.set(String(m.id), m); });
    return Array.from(byId.values());
  }, [canonicalRemote.liveNow, stickyLiveMap]);

  const allLive: any[] = mergedLive.map(toLegacyMatchCard).filter(isFootballMatch);
  const allUpcoming: any[] = canonicalRemote.today.map(toLegacyMatchCard).filter(isFootballMatch);
  const allFinished: any[] = canonicalRemote.finished.map(toLegacyMatchCard).filter(isFootballMatch);
  const noRemoteData = !liveFirstLoad && !todayFirstLoad && !hasRemoteData;

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

  const displayLive = rawLive;
  const displayUpcoming = rawUpcoming;
  const displayFinished = rawFinished;
  const sortedLive = useMemo(() => sortMatchesByCompetitionAndTime(displayLive, selectedDate), [displayLive, selectedDate]);
  const sortedUpcoming = useMemo(() => sortMatchesByCompetitionAndTime(displayUpcoming, selectedDate), [displayUpcoming, selectedDate]);
  const sortedFinished = useMemo(() => sortMatchesByCompetitionAndTime(displayFinished, selectedDate), [displayFinished, selectedDate]);

  const featuredFallbackMatches = useMemo(() => {
    if (sortedUpcoming.length > 0) return sortedUpcoming.slice(0, 8);
    if (sortedFinished.length > 0) return sortedFinished.slice(0, 8);
    return [] as any[];
  }, [sortedFinished, sortedUpcoming]);

  const myTeamMatches = useMemo(() => {
    // Prefer follows from UserStateContext (persistent follow system)
    const followedNames = new Set(
      followedTeams.map(t => t.teamName.toLowerCase()),
    );
    // Fallback: sport_team: entries in NexoraContext favorites
    const favTeams = new Set([
      ...Array.from(followedNames),
      ...favorites
        .filter(f => f.startsWith("sport_team:"))
        .map(f => f.slice("sport_team:".length).toLowerCase()),
    ]);
    if (favTeams.size === 0) return [];
    return [...sortedLive, ...sortedUpcoming].filter(m =>
      favTeams.has(String(m?.homeTeam || "").toLowerCase()) ||
      favTeams.has(String(m?.awayTeam || "").toLowerCase())
    );
  }, [favorites, followedTeams, sortedLive, sortedUpcoming]);

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
      qc.invalidateQueries({ queryKey: ["standings"] }),
      qc.invalidateQueries({ queryKey: ["topscorers"] }),
    ]);
    setRefreshing(false);
  }, [qc, selectedDate]);

  const handleFeedScroll = useCallback((event: any) => {
    const nextY = Number(event?.nativeEvent?.contentOffset?.y || 0);
    lastScrollYRef.current = nextY;
    // Compact header when scrolled past threshold
    const shouldCompact = nextY > 60;
    if (shouldCompact !== compactHeaderRef.current) {
      compactHeaderRef.current = shouldCompact;
      setCompactHeader(shouldCompact);
    }
  }, []);

  const sportToolSourceMatches = useMemo(() => {
    if (sortedUpcoming.length > 0) return sortedUpcoming;
    if (sortedLive.length > 0) return sortedLive;
    return sortedFinished;
  }, [sortedFinished, sortedLive, sortedUpcoming]);

  // Group live matches by competition for the Live tab
  const groupedLive = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const match of sortedLive) {
      const key = match.league || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(match);
    }
    return Object.entries(groups).sort((a, b) => {
      const ra = competitionRankByLeague[normalizeLeagueKey(a[0])] ?? 99;
      const rb = competitionRankByLeague[normalizeLeagueKey(b[0])] ?? 99;
      return ra - rb;
    });
  }, [sortedLive]);

  const sportMenuPreview = useMemo(
    () => sportToolSourceMatches.slice(0, 8).map((match) => ({ match, analysis: buildMenuAnalysis(match) })),
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
        : sportMenuPreview.slice(0, 8).map(({ analysis }) => ({
            key: `pred_${analysis.matchId}`,
            title: `${safeStr(analysis.homeTeam)} vs ${safeStr(analysis.awayTeam)}`,
            meta: `${analysis.homePct}% · ${analysis.drawPct}% · ${analysis.awayPct}% · ${analysis.confidence}% conf.`,
            badges: buildHomeAwayBadges(analysis.homePct, analysis.awayPct, analysis.drawPct),
            item: analysis,
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
        : sportMenuPreview.slice(0, 8).map(({ analysis }) => {
            const side = analysis.homePct >= analysis.awayPct ? "1" : "2";
            const confidence = Math.max(analysis.homePct, analysis.awayPct);
            return {
              key: `acca_${analysis.matchId}`,
              title: `${side} · ${safeStr(analysis.homeTeam)} - ${safeStr(analysis.awayTeam)}`,
              meta: `Confidence ${confidence}%`,
              badges: buildHomeAwayBadges(analysis.homePct, analysis.awayPct, analysis.drawPct),
              item: analysis,
            };
          });
    }
    return [];
  }, [activeSportTool, backendAcca, backendPredictions, sportMenuPreview]);

  const activeSportToolCard = useMemo(
    () => SPORT_TOOL_CARDS.find((card) => card.id === activeSportTool) || SPORT_TOOL_CARDS[0],
    [activeSportTool]
  );

  const nextLevelInsights = useMemo(() => {
    const parseScore = (m: any) => ({
      home: Number(m?.homeScore ?? 0),
      away: Number(m?.awayScore ?? 0),
    });
    const topPred = [...backendPredictions]
      .sort((a: any, b: any) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0];

    const spotlight = topPred
      ? {
          type: "match-of-day",
          title: "Match of the Day",
          subtitle: `${safeStr(topPred.homeTeam)} vs ${safeStr(topPred.awayTeam)}`,
          detail: `${safeStr(topPred.confidence)}% confidence · ${safeStr(topPred.prediction)}`,
          matchId: String(topPred.matchId || ""),
          item: {
            ...topPred,
            id: String(topPred.matchId || ""),
            status: topPred?.status || "upcoming",
            sport: "football",
          },
        }
      : null;

    const predictionPool = backendPredictions.length > 0
      ? backendPredictions
      : sportMenuPreview.map(({ analysis }) => analysis);

    const underdog = [...predictionPool]
      .filter((p: any) => {
        const hp = Number(p?.homePct || 0);
        const ap = Number(p?.awayPct || 0);
        const pick = String(p?.prediction || "");
        if (pick === "Home Win") return hp <= 42;
        if (pick === "Away Win") return ap <= 42;
        return false;
      })
      .sort((a: any, b: any) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0];

    const upset = [...sortedFinished].find((m: any) => {
      const analysis = buildMenuAnalysis(m);
      const fav = analysis.homePct >= analysis.awayPct ? "home" : "away";
      const s = parseScore(m);
      const winner = s.home === s.away ? "draw" : s.home > s.away ? "home" : "away";
      return winner !== "draw" && winner !== fav;
    });

    const formByTeam = new Map<string, { points: number; wins: number; gd: number; played: number }>();
    for (const m of sortedFinished.slice(0, 80)) {
      const home = safeStr(m?.homeTeam);
      const away = safeStr(m?.awayTeam);
      if (!home || !away) continue;
      const hs = Number(m?.homeScore ?? 0);
      const as = Number(m?.awayScore ?? 0);
      const homeState = formByTeam.get(home) || { points: 0, wins: 0, gd: 0, played: 0 };
      const awayState = formByTeam.get(away) || { points: 0, wins: 0, gd: 0, played: 0 };
      homeState.played += 1;
      awayState.played += 1;
      homeState.gd += hs - as;
      awayState.gd += as - hs;
      if (hs > as) {
        homeState.points += 3;
        homeState.wins += 1;
      } else if (as > hs) {
        awayState.points += 3;
        awayState.wins += 1;
      } else {
        homeState.points += 1;
        awayState.points += 1;
      }
      formByTeam.set(home, homeState);
      formByTeam.set(away, awayState);
    }
    const hotStreak = [...formByTeam.entries()]
      .filter(([, v]) => v.played >= 2)
      .sort((a, b) => (b[1].points - a[1].points) || (b[1].wins - a[1].wins) || (b[1].gd - a[1].gd))[0];

    const bigMatches = [...sortedUpcoming]
      .map((m: any) => {
        const league = String(m?.league || "").toLowerCase();
        const teams = `${String(m?.homeTeam || "")} ${String(m?.awayTeam || "")}`.toLowerCase();
        let score = 0;
        if (league.includes("champions") || league.includes("europa")) score += 5;
        if (league.includes("premier") || league.includes("laliga") || league.includes("bundesliga") || league.includes("serie a")) score += 3;
        if (teams.includes("real") || teams.includes("barcelona") || teams.includes("city") || teams.includes("united") || teams.includes("bayern") || teams.includes("juventus") || teams.includes("arsenal") || teams.includes("liverpool")) score += 2;
        return { match: m, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.match);

    return {
      spotlight,
      underdog,
      upset,
      hotStreak,
      bigMatches,
    };
  }, [backendPredictions, sortedFinished, sortedUpcoming, sportMenuPreview]);

  const resolveEspnLeague = useCallback((match: any): string => {
    return resolveEspnLeagueForMatch(match);
  }, []);

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
        espnLeague: resolveEspnLeague(match),
        minute: match.minute !== undefined ? String(match.minute) : "",
        status: match.status,
        sport: match.sport,
      },
    });
  }, [resolveEspnLeague]);

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

  const buildSmartScoreNotification = useCallback((sub: MatchSubscription, prevHome: number, prevAway: number, homeNow: number, awayNow: number) => {
    const home = safeStr(sub.homeTeam) || "Home";
    const away = safeStr(sub.awayTeam) || "Away";
    const scoreLine = `${home} ${homeNow}-${awayNow} ${away}`;

    if (homeNow > prevHome && awayNow === prevAway) {
      const tookLead = homeNow > awayNow && prevHome <= prevAway;
      const equalized = homeNow === awayNow && prevHome < prevAway;
      const title = tookLead ? `${home} takes the lead 🔥` : equalized ? "Equalizer ⚡" : "Goal update";
      return { title, body: scoreLine };
    }
    if (awayNow > prevAway && homeNow === prevHome) {
      const tookLead = awayNow > homeNow && prevAway <= prevHome;
      const equalized = awayNow === homeNow && prevAway < prevHome;
      const title = tookLead ? `${away} takes the lead 🔥` : equalized ? "Equalizer ⚡" : "Goal update";
      return { title, body: scoreLine };
    }

    const margin = Math.abs(homeNow - awayNow);
    if (margin >= 2) {
      const dominant = homeNow > awayNow ? home : away;
      return { title: `${dominant} in control 📈`, body: scoreLine };
    }
    return { title: "Goal update", body: scoreLine };
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
            const currentStatus = resolveMatchBucket({
              status: feedMatch?.status,
              minute: feedMatch?.minute,
              homeScore: feedMatch?.homeScore,
              awayScore: feedMatch?.awayScore,
              startDate: feedMatch?.startDate,
            });
            const currentHomeScore = Number(feedMatch?.homeScore ?? 0);
            const currentAwayScore = Number(feedMatch?.awayScore ?? 0);
            if (prev) {
              if (prev.status !== "live" && currentStatus === "live" && shouldNotify(`${sub.id}:start`, 20_000))
                await pushMatchNotification("Match started", `${sub.homeTeam} - ${sub.awayTeam} has kicked off`, { matchId: sub.id });
              if (prev.status !== "finished" && currentStatus === "finished" && shouldNotify(`${sub.id}:finished`, 20_000))
                await pushMatchNotification("Match finished", `${sub.homeTeam} ${currentHomeScore}-${currentAwayScore} ${sub.awayTeam}`, { matchId: sub.id });
              if (currentStatus === "live" && (prev.homeScore !== currentHomeScore || prev.awayScore !== currentAwayScore) && shouldNotify(`${sub.id}:score`, 10_000)) {
                const msg = buildSmartScoreNotification(sub, Number(prev.homeScore || 0), Number(prev.awayScore || 0), currentHomeScore, currentAwayScore);
                await pushMatchNotification(msg.title, msg.body, { matchId: sub.id });
              }
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
          const currentStatus = resolveMatchBucket({
            status: detail?.status,
            detail: detail?.status,
            minute: detail?.minute,
            homeScore: detail?.homeScore,
            awayScore: detail?.awayScore,
            startDate: detail?.startDate,
          });
          const currentHomeScore = Number(detail?.homeScore ?? 0);
          const currentAwayScore = Number(detail?.awayScore ?? 0);
          const keyEvents = Array.isArray(detail?.keyEvents) ? detail.keyEvents : [];
          const eventHashes = keyEvents.filter((event: any) => interestingEventRegex.test(`${safeStr(event?.type)} ${safeStr(event?.detail)}`)).map((event: any) => toEventHash(event));
          if (prev) {
            if (prev.status !== "live" && currentStatus === "live" && shouldNotify(`${sub.id}:start`, 20_000))
              await pushMatchNotification("Match started", `${safeStr(sub.homeTeam)} - ${safeStr(sub.awayTeam)} has kicked off`, { matchId: sub.id });
            if (prev.status !== "finished" && currentStatus === "finished" && shouldNotify(`${sub.id}:finished`, 20_000))
              await pushMatchNotification("Match finished", `${safeStr(sub.homeTeam)} ${currentHomeScore}-${currentAwayScore} ${safeStr(sub.awayTeam)}`, { matchId: sub.id });
            if (currentStatus === "live" && (prev.homeScore !== currentHomeScore || prev.awayScore !== currentAwayScore) && shouldNotify(`${sub.id}:score`, 10_000)) {
              const msg = buildSmartScoreNotification(sub, Number(prev.homeScore || 0), Number(prev.awayScore || 0), currentHomeScore, currentAwayScore);
              await pushMatchNotification(msg.title, msg.body, { matchId: sub.id });
            }
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
  }, [buildSmartScoreNotification, currentMatchesById, matchSubscriptions, shouldNotify]);


  const bottomPad = Platform.OS === "web" ? 44 : insets.bottom + 100;
  const showLive = sportsView === "live" && statusFilter !== "upcoming";
  const showUpcoming = sportsView === "upcoming" && statusFilter !== "live";
  const showMenuSection = sportsView === "menu";
  const showCompetitionsSection = sportsView === "competitions";

  // ── Sports sub-nav tabs ────────────────────────────────────────────────────
  const SPORTS_TABS = [
    { id: "competitions" as const, label: t("sportsHome.explore") },
    { id: "live" as const,         label: t("sportsHome.live") },
    { id: "upcoming" as const,     label: t("sportsHome.matchday") },
    { id: "menu" as const,         label: t("sportsHome.analyse") },
  ];

  // ── Today section matches ─────────────────────────────────────────────────
  const todayCombined = useMemo(() => [
    ...sortedUpcoming.slice(0, 12),
  ], [sortedUpcoming]);

  // Height of header + sub-nav (+ sport categories when visible) so ScrollView content starts below them
  const sportCatBarHeight = showCompetitionsSection ? 48 : 0;
  // NexoraHeader: padTop(4/8) + contentRow(paddingV8×2 + iconBtn 30/36 or logo ~46) + padBot(4/8) + border(1)
  const nexoraHeaderHeight = compactHeader ? (4 + 46 + 5) : (8 + 64 + 9);
  const subNavHeight = 42;
  const headerAreaHeight = (Platform.OS === "web" ? 0 : insets.top) + nexoraHeaderHeight + subNavHeight + sportCatBarHeight;

  return (
    <View style={styles.container}>
      {/* Header — always visible */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 50 }}>
        <NexoraHeader
          title="SPORT"
          titleColor={P.accent}
          badgeLabel={sortedLive.length > 0 ? `${sortedLive.length} live` : undefined}
          badgeTone={sortedLive.length > 0 ? "live" : "accent"}
          compact={compactHeader}
          showSearch
          showNotification
          showFavorites
          showProfile
          onSearch={() => { setSportsSearchActive(s => !s); setSportsSearchQuery(""); }}
          onNotification={() => router.push("/follow-center")}
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
              const isLiveTab = tab.id === "live";
              const liveCount = sortedLive.length;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.subNavItem, isActive && styles.subNavItemActive]}
                  onPress={() => setSportsView(tab.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subNavText, isActive && styles.subNavTextActive]}>
                    {tab.label}
                  </Text>
                  {isLiveTab && liveCount > 0 && (
                    <View style={[styles.subNavLiveBadge, isActive && styles.subNavLiveBadgeActive]}>
                      <Text style={[styles.subNavLiveBadgeText, isActive && styles.subNavLiveBadgeTextActive]}>
                        {liveCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Sticky Sport Categories ── */}
      {showCompetitionsSection && (
        <View style={{ position: "absolute", top: (Platform.OS === "web" ? 0 : insets.top) + nexoraHeaderHeight + subNavHeight, left: 0, right: 0, zIndex: 40, backgroundColor: COLORS.background }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 12, gap: 10, flexDirection: "row" }}
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
                  <Text style={[styles.sportCatLabel, isActive && styles.sportCatLabelActive]}>{tFn(cat.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Sport Search ── */}
      {sportsSearchActive && (
        <View style={[styles.sportsSearchBar, { marginTop: headerAreaHeight }]}>
          <Ionicons name="search" size={15} color={P.muted} />
          <TextInput
            style={styles.sportsSearchInput}
            placeholder={t("sportsHome.searchPlaceholder")}
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
            <Text style={styles.sportsSearchEmpty}>{t("sportsHome.noResults")} &quot;{sportsSearchQuery}&quot;</Text>
          ) : sportsSearchResults.map((match: any) => {
            const isLiveMatch = resolveMatchBucket(match) === "live";
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
                    {match.league} · {isLiveMatch ? "🔴 LIVE" : (match.startTime || t("sportsHome.scheduled"))}
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
        contentContainerStyle={{ paddingTop: headerAreaHeight, paddingBottom: bottomPad, width: contentWidth, alignSelf: "center" }}
      >
        {/* ── Banners ── */}
        {filterEmpty && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={14} color={P.accent} />
            <Text style={styles.bannerText}>{t("sportsHome.noMatchesFilter", { filter: SPORT_CATEGORIES.find(c => c.id === sportCategory)?.labelKey ? tFn(SPORT_CATEGORIES.find(c => c.id === sportCategory)!.labelKey) : "" })}</Text>
          </View>
        )}
        {noRemoteData && featuredFallbackMatches.length === 0 && (
          <View style={styles.fallbackPanel}>
            <View style={styles.fallbackHead}>
              <Ionicons name="time-outline" size={14} color={P.muted} />
              <Text style={styles.fallbackTitle}>{t("sportsHome.noLiveData")}</Text>
            </View>
            <Text style={styles.fallbackText}>
              {t("sportsHome.noMatchesToday")}
            </Text>
            <View style={styles.fallbackActions}>
              <TouchableOpacity style={styles.fallbackActionBtn} onPress={() => setSportsView("upcoming")}>
                <Ionicons name="calendar-outline" size={12} color={P.muted} />
                <Text style={styles.fallbackActionText}>{t("sportsHome.matchday")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fallbackActionBtn} onPress={onRefresh}>
                <Ionicons name="refresh-outline" size={12} color={P.muted} />
                <Text style={styles.fallbackActionText}>{t("sportsHome.refresh") || "Refresh"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════
            EXPLORE TAB
        ══════════════════════════════════════════ */}
        {showCompetitionsSection && (
          <>
            {/* ── MIJN TEAMS ── */}
            {myTeamMatches.length > 0 && (
              <>
                <SectionTitle title={`⭐ ${t("sportsHome.myTeams")}`} accent />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                  {myTeamMatches.slice(0, 8).map((match: any) => (
                    <TodayMatchCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── LIVE NOW ── */}
            {(liveFirstLoad || sortedLive.length > 0) && (
              <>
                <SectionTitle
                  title={`🔴 ${t("sportsHome.liveNow")}`}
                  accent
                  count={sortedLive.length}
                  action={sortedLive.length > 3 ? t("sportsHome.allCount", { count: sortedLive.length }) : undefined}
                  onAction={() => setSportsView("live")}
                />
                {liveFirstLoad ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                    {[1, 2].map(i => <View key={i} style={styles.liveSkeleton} />)}
                  </ScrollView>
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
              </>
            )}

            {/* ── VANDAAG ── */}
            {(todayFirstLoad || todayCombined.length > 0) && (
              <>
                <SectionTitle
                  title={t("sportsHome.today")}
                  accent
                  action={todayCombined.length > 5 ? t("sportsHome.allMatches") : undefined}
                  onAction={() => setSportsView("upcoming")}
                />
                {todayFirstLoad ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                    {[1, 2, 3].map(i => <View key={i} style={styles.todaySkeleton} />)}
                  </ScrollView>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                    {todayCombined.map((match: any) => (
                      <TodayMatchCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* ── POPULAR COMPETITIONS ── */}
            <SectionTitle title={t("sportsHome.popularCompetitions")} accent />
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
            <SectionTitle title={t("sportsHome.countriesTitle")} accent />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate={0.9}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}
            >
              {COUNTRY_COMPETITIONS.map((country) => (
                <CountryCard
                  key={country.countryCode}
                  country={country}
                  onPress={() => router.push({ pathname: "/country", params: { code: country.countryCode } })}
                />
              ))}
            </ScrollView>

            {/* ── HIGHLIGHTS & REPLAYS ── */}
            {(realHighlights.length > 0 || sortedFinished.length > 0) && (
              <>
                <SectionTitle title={t("sportsHome.highlightsReplays")} accent />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContent}>
                  {realHighlights.length > 0 ? (
                    realHighlights.slice(0, 15).map((hl: any, idx: number) => (
                      <HighlightCard key={hl.id || idx} match={hl} onPress={() => {
                        const url = hl.embedUrl || hl.matchUrl;
                        if (url) {
                          router.push({
                            pathname: "/player",
                            params: {
                              embedUrl: url,
                              title: hl.title || `${hl.homeTeam || ""} vs ${hl.awayTeam || ""}`,
                              type: "sport",
                              contentId: `sport_${hl.id || idx}`,
                            },
                          });
                        }
                      }} />
                    ))
                  ) : (
                    sortedFinished.slice(0, 10).map((match: any) => (
                      <HighlightCard key={match.id} match={match} onPress={() => {
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
                            espnLeague: resolveEspnLeague(match),
                            minute: match.minute !== undefined ? String(match.minute) : "",
                            status: resolveMatchBucket({
                              status: match.status,
                              minute: match.minute,
                              homeScore: match.homeScore,
                              awayScore: match.awayScore,
                              startDate: match.startDate,
                            }),
                            sport: match.sport,
                            initialTab: "highlights",
                          },
                        });
                      }} />
                    ))
                  )}
                </ScrollView>
              </>
            )}

          </>
        )}

        {/* ══════════════════════════════════════════
            LIVE TAB
        ══════════════════════════════════════════ */}
        {showLive && (
          <View style={styles.section}>
            {/* Live header */}
            <View style={styles.liveTabHeader}>
              <View style={styles.livePillInline}>
                <View style={styles.liveDotInline} />
                <Text style={styles.livePillText}>{t("sportsHome.liveNow")}</Text>
              </View>
              {sortedLive.length > 0 && (
                <View style={styles.liveTabCount}>
                  <Text style={styles.liveTabCountText}>{sortedLive.length} {t("sportsHome.matches") || "matches"}</Text>
                </View>
              )}
            </View>
            {liveFirstLoad ? (
              [1, 2, 3].map(i => <View key={i} style={styles.matchCardSkeleton}><View style={styles.skeletonShimmer} /></View>)
            ) : sortedLive.length === 0 ? (
              <View style={styles.liveEmptyStateWrap}>
                <LinearGradient
                  colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.02)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.liveEmptyState}
                >
                  <View style={styles.liveEmptyIconRing}>
                    <Ionicons name="radio-outline" size={22} color={P.muted} />
                  </View>
                  <Text style={styles.liveEmptyTitle}>{t("sportsHome.noLive")}</Text>
                  <Text style={styles.liveEmptyHint}>{t("sportsHome.checkSchedule") || "Check Speeldag for upcoming matches"}</Text>
                  <TouchableOpacity style={styles.liveEmptyAction} onPress={() => setSportsView("upcoming")} activeOpacity={0.85}>
                    <Ionicons name="calendar-outline" size={14} color={P.text} />
                    <Text style={styles.liveEmptyActionText}>{t("sportsHome.matchday")}</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            ) : (
              groupedLive.map(([league, matches]) => (
                <View key={league}>
                  <CompetitionGroupHeader league={league} count={matches.length} />
                  {matches.map((match: any) => (
                    <MatchRowCard
                      key={match.id}
                      match={match}
                      onPress={() => handleMatchPress(match)}
                      onNotificationToggle={() => toggleMatchNotification(match)}
                      isNotificationOn={Boolean(matchSubscriptions[String(match.id || "")])}
                    />
                  ))}
                </View>
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
            {todayFirstLoad ? (
              [1, 2, 3].map(i => <View key={i} style={styles.matchCardSkeleton}><View style={styles.skeletonShimmer} /></View>)
            ) : sortedUpcoming.length === 0 && sortedFinished.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={32} color={P.muted} />
                <Text style={styles.emptyTitle}>{t("sportsHome.noMatchesOn", { date: formatDateDisplay(selectedDate) })}</Text>
                <Text style={styles.emptySubtext}>{t("sportsHome.tryOtherDate") || "Try another date"}</Text>
              </View>
            ) : (
              <>
                {sortedUpcoming.length > 0 && (
                  <>
                    <View style={styles.scheduleSection}>
                      <Text style={styles.scheduleSectionLabel}>{t("sportsHome.upcoming") || "UPCOMING"}</Text>
                      <View style={styles.scheduleSectionBadge}>
                        <Text style={styles.scheduleSectionBadgeText}>{sortedUpcoming.length}</Text>
                      </View>
                    </View>
                    {sortedUpcoming.slice(0, 60).map((match: any) => (
                      <MatchRowCard
                        key={match.id}
                        match={match}
                        onPress={() => handleMatchPress(match)}
                        onNotificationToggle={() => toggleMatchNotification(match)}
                        isNotificationOn={Boolean(matchSubscriptions[String(match.id || "")])}
                      />
                    ))}
                  </>
                )}
                {sortedFinished.length > 0 && (
                  <>
                    <View style={[styles.scheduleSection, { marginTop: 20 }]}>
                      <Text style={styles.scheduleSectionLabel}>{t("sportsHome.finished") || "FINISHED"}</Text>
                      <View style={[styles.scheduleSectionBadge, styles.scheduleSectionBadgeMuted]}>
                        <Text style={[styles.scheduleSectionBadgeText, styles.scheduleSectionBadgeTextMuted]}>{sortedFinished.length}</Text>
                      </View>
                    </View>
                    {sortedFinished.slice(0, 60).map((match: any) => (
                      <MatchRowCard
                        key={match.id}
                        match={match}
                        onPress={() => handleMatchPress(match)}
                        onNotificationToggle={() => toggleMatchNotification(match)}
                        isNotificationOn={Boolean(matchSubscriptions[String(match.id || "")])}
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
            {/* Tool selector pills */}
            <View style={styles.toolSelectorRow}>
              {SPORT_TOOL_CARDS.map((card) => {
                const isActive = activeSportTool === card.id;
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.toolSelectorPill, isActive && { backgroundColor: card.accent, borderColor: card.accent }]}
                    activeOpacity={0.85}
                    onPress={() => setActiveSportTool(card.id)}
                  >
                    <Ionicons name={card.icon} size={14} color={isActive ? "#fff" : card.accent} />
                    <Text style={[styles.toolSelectorLabel, isActive && styles.toolSelectorLabelActive]}>{tFn(card.titleKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Prediction cards */}
            <View style={styles.analysePanel}>
              <View style={styles.analysePanelHead}>
                <View style={styles.analysePanelTitle}>
                  <Ionicons name={activeSportToolCard.icon} size={15} color={activeSportToolCard.accent} />
                  <Text style={styles.analysePanelTitleText}>{tFn(activeSportToolCard.titleKey)}</Text>
                </View>
                <Text style={styles.analysePanelCount}>{activeToolRows.length} {t("sportsHome.picks")}</Text>
              </View>
              {activeToolRows.length > 0 ? activeToolRows.map((row: any) => {
                const homeBadge = row.badges?.[0];
                const drawBadge = row.badges?.[2];
                const awayBadge = row.badges?.[1];
                const homePct = row.item?.homePct ?? row.match?.split?.home ?? 0;
                const awayPct = row.item?.awayPct ?? row.match?.split?.away ?? 0;
                const drawPct = row.item?.drawPct ?? row.match?.split?.draw ?? 0;
                const confidence = row.item?.confidence ?? null;
                const total = homePct + awayPct + drawPct;
                return (
                  <TouchableOpacity
                    key={row.key}
                    style={styles.predCard}
                    onPress={() => row.item ? handleToolMatchPress(row.item) : handleMatchPress(row.match)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.predCardTeamRow}>
                      <Text style={styles.predCardTeams} numberOfLines={1}>{row.title}</Text>
                      <Ionicons name="chevron-forward" size={13} color={P.muted} />
                    </View>
                    {/* Probability bar */}
                    {total > 0 && (
                      <View style={styles.predBarWrap}>
                        <View style={[styles.predBarSegment, { flex: homePct, backgroundColor: "#4CAF82" }]} />
                        {drawPct > 0 && <View style={[styles.predBarSegment, { flex: drawPct, backgroundColor: "#888" }]} />}
                        <View style={[styles.predBarSegment, { flex: awayPct, backgroundColor: P.accent }]} />
                      </View>
                    )}
                    <View style={styles.predBarLabels}>
                      {homeBadge && <Text style={[styles.predBarLabel, { color: "#4CAF82" }]}>{homeBadge.label}</Text>}
                      {drawBadge && <Text style={[styles.predBarLabel, { color: "#888" }]}>{drawBadge.label}</Text>}
                      {awayBadge && <Text style={[styles.predBarLabel, { color: P.accent }]}>{awayBadge.label}</Text>}
                    </View>
                    {confidence != null && (
                      <View style={styles.predConfRow}>
                        <Text style={styles.predConfLabel}>{t("sportsHome.confidence") || "Confidence"}</Text>
                        <View style={styles.predConfBar}>
                          <View style={[styles.predConfFill, { width: `${Math.min(Number(confidence), 100)}%` as any }]} />
                        </View>
                        <Text style={styles.predConfPct}>{confidence}%</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }) : (
                <View style={styles.emptyState}>
                  <Ionicons name="analytics-outline" size={28} color={P.muted} />
                  <Text style={styles.emptyTitle}>{t("sportsHome.noDataYet")}</Text>
                </View>
              )}
            </View>

            {/* Next Level Intelligence panel */}
            <LinearGradient colors={["#0E1626", "#090D18"]} style={styles.nextLevelPanel}>
              <View style={styles.nextLevelHead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="flash" size={16} color="#FFD166" />
                  <Text style={styles.nextLevelTitle}>Next Level Intelligence</Text>
                </View>
                <Text style={styles.nextLevelSub}>Smart picks, momentum and hidden edges</Text>
              </View>

              {nextLevelInsights.spotlight ? (
                <TouchableOpacity
                  style={styles.spotlightCard}
                  onPress={() => {
                    const item = nextLevelInsights.spotlight?.item;
                    if (!item) return;
                    handleToolMatchPress(item);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.spotlightTopRow}>
                    <View style={styles.nextChip}><Text style={styles.nextChipText}>MATCH OF THE DAY</Text></View>
                    <Ionicons name="flash" size={13} color="#FFD166" />
                  </View>
                  <Text style={styles.spotlightMain}>{nextLevelInsights.spotlight.subtitle}</Text>
                  <Text style={styles.spotlightMeta}>{nextLevelInsights.spotlight.detail}</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.nextGrid}>
                {nextLevelInsights.underdog ? (
                  <TouchableOpacity style={styles.nextGridCard} onPress={() => handleToolMatchPress({ ...nextLevelInsights.underdog, id: nextLevelInsights.underdog.matchId })}>
                    <Text style={styles.nextGridLabel}>Underdog Alert 😲</Text>
                    <Text style={styles.nextGridValue} numberOfLines={2}>{safeStr(nextLevelInsights.underdog.homeTeam)} vs {safeStr(nextLevelInsights.underdog.awayTeam)}</Text>
                  </TouchableOpacity>
                ) : null}
                {nextLevelInsights.hotStreak ? (
                  <View style={styles.nextGridCard}>
                    <Text style={styles.nextGridLabel}>Hot Streak 🔥</Text>
                    <Text style={styles.nextGridValue} numberOfLines={2}>{nextLevelInsights.hotStreak[0]} · {nextLevelInsights.hotStreak[1].points} pts</Text>
                  </View>
                ) : null}
                {nextLevelInsights.upset ? (
                  <TouchableOpacity style={styles.nextGridCard} onPress={() => handleMatchPress(nextLevelInsights.upset)}>
                    <Text style={styles.nextGridLabel}>Biggest Upset</Text>
                    <Text style={styles.nextGridValue} numberOfLines={2}>{safeStr(nextLevelInsights.upset.homeTeam)} {Number(nextLevelInsights.upset.homeScore ?? 0)}-{Number(nextLevelInsights.upset.awayScore ?? 0)} {safeStr(nextLevelInsights.upset.awayTeam)}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {nextLevelInsights.bigMatches.length > 0 ? (
                <View style={{ marginTop: 8, gap: 6 }}>
                  <Text style={styles.nextUpcomingTitle}>Upcoming Big Matches</Text>
                  {nextLevelInsights.bigMatches.map((m: any, idx: number) => (
                    <TouchableOpacity key={`${m.id}_${idx}`} style={styles.nextUpcomingRow} onPress={() => handleMatchPress(m)}>
                      <Text style={styles.nextUpcomingText} numberOfLines={1}>{safeStr(m.homeTeam)} vs {safeStr(m.awayTeam)}</Text>
                      <Text style={styles.nextUpcomingComp} numberOfLines={1}>{safeStr(m.league)}</Text>
                      <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
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
    paddingTop: 10,
    paddingBottom: 12,
    gap: 9,
    alignItems: "center",
  },
  subNavItem: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  subNavItemActive: {
    backgroundColor: P.accent,
  },
  subNavText: {
    color: P.muted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  subNavTextActive: { color: "#fff" },
  subNavLiveBadge: {
    backgroundColor: `${P.live}28`,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: `${P.live}44`,
    minWidth: 20,
    alignItems: "center",
  },
  subNavLiveBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderColor: "rgba(255,255,255,0.35)",
  },
  subNavLiveBadgeText: {
    color: P.live,
    fontSize: 10,
    fontWeight: "800",
  },
  subNavLiveBadgeTextActive: {
    color: "#fff",
  },

  /* ── Carousels ── */
  carouselContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 8,
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
    marginBottom: 12,
  },
  compSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  compSectionHeadText: { color: P.text, fontSize: 12, fontWeight: "700", flex: 1, letterSpacing: 0.3, lineHeight: 18 },
  compSectionHeadCount: {
    color: P.muted,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  compListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    paddingRight: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  compListAccent: { width: 3, alignSelf: "stretch", borderRadius: 2, marginLeft: 0, marginRight: 2 },
  compListIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", marginLeft: 8,
  },
  compListName: { color: P.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  compListTier: { fontSize: 11, fontWeight: "500", marginTop: 3, opacity: 0.95 },

  /* ── All countries ── */
  countrySection: { marginHorizontal: 16, marginBottom: 12 },
  countrySectionHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 4,
    marginBottom: 4,
  },
  countrySectionFlag: { fontSize: 22 },
  countrySectionName: { color: P.text, fontSize: 16, fontWeight: "700" },

  /* ── Banners ── */
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 18, marginTop: 12, padding: 13,
    borderRadius: 16, backgroundColor: `${P.accent}18`,
    borderWidth: 1, borderColor: `${P.accent}44`,
  },
  bannerError: { backgroundColor: "rgba(255,107,107,0.12)", borderColor: "rgba(255,107,107,0.3)" },
  bannerText: { flex: 1, color: P.muted, fontSize: 12, fontWeight: "500" },
  bannerCode: { color: P.muted, fontSize: 10, marginTop: 2 },
  fallbackPanel: {
    marginHorizontal: 18,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(28,28,40,0.9)",
    gap: 8,
  },
  fallbackHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  fallbackTitle: { color: P.text, fontSize: 13, fontWeight: "700" },
  fallbackText: { color: P.muted, fontSize: 12, lineHeight: 17 },
  fallbackActions: { flexDirection: "row", gap: 8 },
  fallbackActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: `${P.accent}44`,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  fallbackActionText: { color: P.text, fontSize: 11, fontWeight: "700" },
  fallbackCode: { color: P.muted, fontSize: 10 },

  /* ── Section titles ── */
  section: { marginTop: 10 },
  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 8,
  },
  sectionTitle: { color: P.text, fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  subHead: { color: P.muted, fontSize: 11, fontWeight: "600", paddingHorizontal: 16, paddingTop: 6, letterSpacing: 0.8, textTransform: "uppercase" },
  scheduleSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  scheduleSectionLabel: {
    color: P.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  scheduleSectionBadge: {
    minWidth: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${P.accent}55`,
    backgroundColor: `${P.accent}1F`,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: "center",
  },
  scheduleSectionBadgeMuted: {
    borderColor: P.border,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  scheduleSectionBadgeText: { color: P.accent, fontSize: 11, fontWeight: "700" },
  scheduleSectionBadgeTextMuted: { color: P.muted },

  /* ── Live pill inline ── */
  liveTabHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    flexWrap: "wrap",
  },
  liveTabCount: {
    marginLeft: "auto",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: P.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveTabCountText: { color: P.muted, fontSize: 11, fontWeight: "700" },
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
    width: 284, height: 166, borderRadius: 16,
    backgroundColor: P.elevated, marginRight: 12, opacity: 0.6,
  },
  todaySkeleton: {
    width: 184, height: 122, borderRadius: 14,
    backgroundColor: P.elevated, marginRight: 8, opacity: 0.6,
  },
  matchCardSkeleton: {
    marginHorizontal: 16, marginVertical: 4, height: 72, borderRadius: 14,
    backgroundColor: P.elevated, overflow: "hidden",
  },
  skeletonShimmer: { height: "100%", width: "40%", backgroundColor: `${P.text}08` },

  /* ── Empty states ── */
  emptyState: { alignItems: "center", paddingVertical: 34, gap: 10 },
  emptyCarousel: {
    height: 96, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 12, marginHorizontal: 16,
    borderRadius: 16, backgroundColor: P.card,
    borderWidth: 1, borderColor: P.border,
    borderStyle: "dashed",
  },
  emptyText: { color: P.muted, fontSize: 13, fontWeight: "500", letterSpacing: 0.2 },
  emptyTitle: { color: P.text, fontSize: 16, fontWeight: "700" },
  emptySubtext: { color: P.muted, fontSize: 12, textAlign: "center", paddingHorizontal: 34, lineHeight: 18 },
  liveEmptyStateWrap: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  liveEmptyState: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(20,20,30,0.78)",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 10,
  },
  liveEmptyIconRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  liveEmptyTitle: {
    color: P.text,
    fontSize: 16,
    fontWeight: "700",
  },
  liveEmptyHint: {
    color: P.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 24,
  },
  liveEmptyAction: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  liveEmptyActionText: {
    color: P.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  /* ── Analyse tool cards ── */
  toolsRow: { paddingHorizontal: 16, gap: 10, paddingVertical: 6 },
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
    marginHorizontal: 16, marginTop: 6, borderRadius: 14, padding: 12,
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

  /* ── Analyse redesign ── */
  toolSelectorRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10,
  },
  toolSelectorPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    backgroundColor: P.elevated, borderWidth: 1.5, borderColor: P.border,
    flex: 1, justifyContent: "center",
  },
  toolSelectorLabel: { color: P.muted, fontSize: 13, fontWeight: "700" },
  toolSelectorLabelActive: { color: "#fff" },
  analysePanel: {
    marginHorizontal: 18, marginTop: 10, borderRadius: 16,
    backgroundColor: P.card, borderWidth: 1, borderColor: P.border,
    overflow: "hidden",
  },
  analysePanelHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: P.border,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  analysePanelTitle: { flexDirection: "row", alignItems: "center", gap: 7 },
  analysePanelTitleText: { color: P.text, fontSize: 14, fontWeight: "800" },
  analysePanelCount: { color: P.muted, fontSize: 12, fontWeight: "600" },
  predCard: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: P.border, gap: 8,
  },
  predCardTeamRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  predCardTeams: { color: P.text, fontSize: 13, fontWeight: "700", flex: 1, marginRight: 8 },
  predBarWrap: {
    flexDirection: "row", height: 5, borderRadius: 3, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  predBarSegment: { height: 5 },
  predBarLabels: { flexDirection: "row", justifyContent: "space-between" },
  predBarLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },
  predConfRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingTop: 4,
  },
  predConfLabel: { color: P.muted, fontSize: 10, fontWeight: "600", width: 70 },
  predConfBar: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden",
  },
  predConfFill: {
    height: 4, borderRadius: 2,
    backgroundColor: "#4CAF82",
  },
  predConfPct: { color: "#4CAF82", fontSize: 11, fontWeight: "800", width: 34, textAlign: "right" },

  nextLevelPanel: {
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(130,170,255,0.22)",
    gap: 10,
  },
  nextLevelHead: { gap: 2 },
  nextLevelTitle: { color: "#DCE7FF", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  nextLevelSub: { color: "#9FB0D9", fontSize: 11, fontWeight: "500" },
  spotlightCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 6,
  },
  spotlightTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nextChip: { backgroundColor: "rgba(255,209,102,0.16)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  nextChipText: { color: "#FFD166", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  spotlightMain: { color: P.text, fontSize: 14, fontWeight: "700" },
  spotlightMeta: { color: "#B7C2DF", fontSize: 12, fontWeight: "500" },
  nextGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nextGridCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  nextGridLabel: { color: "#A9B7D8", fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  nextGridValue: { color: P.text, fontSize: 12, fontWeight: "600", lineHeight: 16 },
  nextUpcomingTitle: { color: "#C7D3EF", fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  nextUpcomingComp: { color: P.muted, fontSize: 10, fontWeight: "600", maxWidth: 100, textAlign: "right" },
  nextUpcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  nextUpcomingText: { color: P.text, fontSize: 12, fontWeight: "600", flex: 1, marginRight: 8 },

  /* ── Sport category filter ── */
  sportCatPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    backgroundColor: P.elevated, borderWidth: 1, borderColor: P.border,
  },
  sportCatPillActive: { backgroundColor: P.accent, borderColor: P.accent },
  sportCatLabel: { color: P.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
  sportCatLabelActive: { color: "#fff" },


  /* ── Country scroll (horizontal) ── */
  countryGrid: {
    /* legacy – kept for safety, now unused since ScrollView used inline */
    flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between",
    paddingHorizontal: 16, gap: 10,
  },

  /* ── Sport search ── */
  sportsSearchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 18, marginVertical: 8,
    backgroundColor: P.elevated, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: P.border,
    zIndex: 45, elevation: 45,
  },
  sportsSearchInput: {
    flex: 1, color: P.text, fontSize: 14, fontWeight: "500",
    paddingVertical: 0,
  },
  sportsSearchResults: {
    marginHorizontal: 18, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: P.border,
    backgroundColor: P.card, marginBottom: 10,
    zIndex: 44, elevation: 44,
  },
  sportsSearchResult: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 13,
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
