import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { TeamLogo } from "@/components/TeamLogo";
import { COLORS } from "@/constants/colors";
import { useFollowState } from "@/context/UserStateContext";
import {
  useH2H,
  useInjuries,
  useKeyPlayers,
  useMatchContext,
  useStandings,
  useTeamForm,
  useTeamStats,
} from "@/features/match/hooks/usePrematchData";
import {
  useExpectedLineups,
  useFormationLayout,
  useLineups,
  useLiveLineupChanges,
  useTimeline,
  useTimelineFilters,
  type TeamLineupState,
  type TimelineEventItem,
  type TimelineFilter,
} from "@/features/match/hooks/useLineupTimelineIntegration";
import { buildAiMatchStory } from "@/lib/ai/ai-summary-service";
import { generateAiMatchStoryCard } from "@/lib/ai/aiMatchStoryGenerator";
import { runAiPredictionModel } from "@/lib/ai/aiPredictionService";
import type { MatchAnalysisInput } from "@/lib/match-analysis-engine";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { getMatchDetailRaw, sportKeys } from "@/lib/services/sports-service";

const TAB_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "prematch", label: "Prematch" },
  { id: "predictions", label: "Predictions" },
  { id: "stats", label: "Stats" },
  { id: "lineups", label: "Lineups" },
  { id: "timeline", label: "Timeline" },
  { id: "h2h", label: "H2H" },
] as const;

type MatchTab = (typeof TAB_ITEMS)[number]["id"];

type MatchParams = {
  matchId?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore?: string;
  awayScore?: string;
  league?: string;
  espnLeague?: string;
  minute?: string;
  status?: string;
  statusDetail?: string;
  sport?: string;
  startDate?: string;
  initialTab?: string;
};

type ScreenState = "live" | "upcoming" | "finished" | "postponed" | "cancelled";

const DS = {
  bg:          COLORS.background,
  panel:       COLORS.card,
  panelRaised: COLORS.cardElevated,
  border:      COLORS.glassBorder,
  text:        COLORS.text,
  muted:       COLORS.textSecondary,
  subtle:      COLORS.textMuted,
  accent:      COLORS.accent,
  accentSoft:  COLORS.accentGlow,
  live:        COLORS.live,
  liveSoft:    COLORS.liveGlow,
  home:        "#60A5FA",   // home-team blue (deliberate, not in COLORS)
  away:        "#F97316",   // away-team orange (deliberate, not in COLORS)
};

function safeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLeague(value: unknown): string {
  return safeText(value).toLowerCase();
}

function hasCountryLogo(uri: unknown): boolean {
  return safeText(uri).toLowerCase().includes("/countries/");
}

function statusToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getScreenState(input: { status?: unknown; detail?: unknown; minute?: unknown }): ScreenState {
  const combined = `${statusToken(input.status)}_${statusToken(input.detail)}`;
  const minute = toNumber(input.minute);
  if (/cancel|abandon/.test(combined)) return "cancelled";
  if (/postpon|delay|suspend/.test(combined)) return "postponed";
  if (/finished|ft|full_time|final/.test(combined)) return "finished";
  if (/live|in_progress|pen|extra|ht|half_time/.test(combined) || (minute != null && minute > 0)) return "live";
  return "upcoming";
}

function formatKickoff(value?: string) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return { date: "Kickoff TBD", time: "--:--" };
  const date = new Date(ts);
  return {
    date: new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short" }).format(date),
    time: new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function metricValue(value: number | null | undefined, suffix = "", decimals = 0) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${Number(value).toFixed(decimals)}${suffix}`;
}

function inferVerdict(homeTeam: string, awayTeam: string, summary: string | null | undefined, favoredSide?: string | null) {
  const cleanSummary = String(summary || "").trim();
  if (cleanSummary) return cleanSummary;
  if (favoredSide === "home") return `${homeTeam} carry the stronger edge.`;
  if (favoredSide === "away") return `${awayTeam} look better placed.`;
  return "The matchup projects as balanced with a live swing factor.";
}

function liveStatRows(homeStats: any, awayStats: any) {
  const rows = [
    { label: "Possession", home: toNumber(homeStats?.ball_possession ?? homeStats?.possession), away: toNumber(awayStats?.ball_possession ?? awayStats?.possession), suffix: "%", decimals: 0 },
    { label: "Shots", home: toNumber(homeStats?.shots_total ?? homeStats?.shots ?? homeStats?.shotsOnGoal), away: toNumber(awayStats?.shots_total ?? awayStats?.shots ?? awayStats?.shotsOnGoal), suffix: "", decimals: 0 },
    { label: "Shots On Target", home: toNumber(homeStats?.shots_on_goal ?? homeStats?.shotsOnGoal), away: toNumber(awayStats?.shots_on_goal ?? awayStats?.shotsOnGoal), suffix: "", decimals: 0 },
    { label: "Corners", home: toNumber(homeStats?.corner_kicks ?? homeStats?.corners), away: toNumber(awayStats?.corner_kicks ?? awayStats?.corners), suffix: "", decimals: 0 },
    { label: "Fouls", home: toNumber(homeStats?.fouls), away: toNumber(awayStats?.fouls), suffix: "", decimals: 0 },
    { label: "Yellow Cards", home: toNumber(homeStats?.yellow_cards ?? homeStats?.yellow), away: toNumber(awayStats?.yellow_cards ?? awayStats?.yellow), suffix: "", decimals: 0 },
  ];
  return rows.filter((row) => row.home != null || row.away != null);
}

function validInitialTab(value: unknown): MatchTab {
  return TAB_ITEMS.some((tab) => tab.id === value) ? (value as MatchTab) : "overview";
}

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<MatchParams>();
  const insets = useSafeAreaInsets();
  const { isFollowingMatch, followMatchAction, unfollowMatchAction } = useFollowState();
  const [activeTab, setActiveTab] = useState<MatchTab>(validInitialTab(params.initialTab));
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");

  const rawLeague = safeText(params.league, "Competition");
  const likelyInternational = useMemo(() => {
    if (/fifa\.|uefa\.nations|international|friendly|friendlies|world cup|euro/i.test(safeText(params.espnLeague))) return true;
    if (/friendly|friendlies|international|fifa|nations|world cup|euro/.test(normalizeLeague(rawLeague))) return true;
    return hasCountryLogo(params.homeTeamLogo) && hasCountryLogo(params.awayTeamLogo);
  }, [params.awayTeamLogo, params.espnLeague, params.homeTeamLogo, rawLeague]);

  const espnLeague = useMemo(() => {
    const direct = safeText(params.espnLeague);
    if (direct) return direct;
    if (likelyInternational) return "fifa.world";
    const map: Record<string, string> = {
      "Premier League": "eng.1",
      "Championship": "eng.2",
      "FA Cup": "eng.fa",
      "UEFA Champions League": "uefa.champions",
      "UEFA Europa League": "uefa.europa",
      "UEFA Conference League": "uefa.europa.conf",
      "La Liga": "esp.1",
      "Copa del Rey": "esp.copa_del_rey",
      "Bundesliga": "ger.1",
      "DFB Pokal": "ger.dfb_pokal",
      "Serie A": "ita.1",
      "Coppa Italia": "ita.coppa_italia",
      "Ligue 1": "fra.1",
      "Eredivisie": "ned.1",
      "Jupiler Pro League": "bel.1",
    };
    return map[rawLeague] || "";
  }, [likelyInternational, params.espnLeague, rawLeague]);

  const detailQuery = useQuery({
    queryKey: sportKeys.matchDetail({ matchId: safeText(params.matchId), espnLeague, sport: safeText(params.sport, "soccer") }),
    queryFn: () => getMatchDetailRaw({ matchId: safeText(params.matchId), league: espnLeague, sport: safeText(params.sport, "soccer") }),
    enabled: Boolean(params.matchId),
    staleTime: 15_000,
    retry: 1,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      const state = getScreenState({ status: data?.status || params.status, detail: data?.statusDetail || params.statusDetail, minute: data?.minute || params.minute });
      return state === "live" ? 10_000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const detail = detailQuery.data as any;
  const match = useMemo(() => ({
    id: safeText(detail?.id || params.matchId),
    homeTeam: safeText(detail?.homeTeam || params.homeTeam, "Home"),
    awayTeam: safeText(detail?.awayTeam || params.awayTeam, "Away"),
    homeTeamLogo: safeText(detail?.homeTeamLogo || params.homeTeamLogo),
    awayTeamLogo: safeText(detail?.awayTeamLogo || params.awayTeamLogo),
    homeTeamId: safeText(detail?.homeTeamId || params.homeTeamId),
    awayTeamId: safeText(detail?.awayTeamId || params.awayTeamId),
    homeScore: toNumber(detail?.homeScore ?? params.homeScore) ?? 0,
    awayScore: toNumber(detail?.awayScore ?? params.awayScore) ?? 0,
    league: safeText(detail?.competition || detail?.league || params.league, likelyInternational ? "International Friendly" : "Competition"),
    startDate: safeText(detail?.startDate || detail?.date || params.startDate),
    status: safeText(detail?.status || params.status, "upcoming"),
    statusDetail: safeText(detail?.statusDetail || params.statusDetail),
    minute: toNumber(detail?.minute ?? params.minute),
    venue: safeText(detail?.venue),
    city: safeText(detail?.city),
    country: safeText(detail?.country),
    referee: safeText(detail?.referee),
    weather: safeText(detail?.weather),
    round: safeText(detail?.round),
    homeStats: detail?.homeStats || {},
    awayStats: detail?.awayStats || {},
    starters: Array.isArray(detail?.starters) ? detail.starters : [],
    timeline: Array.isArray(detail?.timeline) ? detail.timeline : Array.isArray(detail?.keyEvents) ? detail.keyEvents : [],
  }), [detail, likelyInternational, params.awayScore, params.awayTeam, params.awayTeamId, params.awayTeamLogo, params.homeScore, params.homeTeam, params.homeTeamId, params.homeTeamLogo, params.league, params.matchId, params.minute, params.startDate, params.status, params.statusDetail]);

  const state = getScreenState({ status: match.status, detail: match.statusDetail, minute: match.minute });
  const kickoff = formatKickoff(match.startDate);
  const competitionBrand = resolveCompetitionBrand({ name: match.league, espnLeague: espnLeague || null });
  const isMatchFollowed = match.id ? isFollowingMatch(match.id) : false;

  const standings = useStandings({
    leagueName: match.league,
    espnLeague,
    sport: safeText(params.sport, "soccer"),
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
  });

  const teamForm = useTeamForm({
    homeTeamId: match.homeTeamId || null,
    awayTeamId: match.awayTeamId || null,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    espnLeague,
    sport: safeText(params.sport, "soccer"),
  });

  const h2h = useH2H({
    leagueName: match.league,
    espnLeague,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
  });

  const seasonStats = useTeamStats({
    homeStanding: standings.homeStanding,
    awayStanding: standings.awayStanding,
    homeForm: teamForm.homeForm,
    awayForm: teamForm.awayForm,
    homeOverview: teamForm.homeTeamOverview,
    awayOverview: teamForm.awayTeamOverview,
  });

  const keyPlayers = useKeyPlayers({
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    competitionInsights: standings.data,
    homeOverview: teamForm.homeTeamOverview,
    awayOverview: teamForm.awayTeamOverview,
  });

  const injuries = useInjuries({
    homeOverview: teamForm.homeTeamOverview,
    awayOverview: teamForm.awayTeamOverview,
  });

  const matchContext = useMatchContext({
    kickoffRaw: match.startDate,
    venue: match.venue,
    city: match.city,
    country: match.country,
    referee: match.referee,
    weather: match.weather,
    competition: match.league,
    round: match.round,
  });

  const expectedLineups = useExpectedLineups({
    homeOverview: teamForm.homeTeamOverview,
    awayOverview: teamForm.awayTeamOverview,
  });

  const timeline = useTimeline({
    events: match.timeline,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    status: match.statusDetail || match.status,
  });

  const { substitutions } = useLiveLineupChanges({ events: timeline.events });

  const integratedLineups = useLineups({
    confirmedTeams: match.starters,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    expectedHome: expectedLineups.homeExpected,
    expectedAway: expectedLineups.awayExpected,
    substitutions,
  });

  const homeFormation = useFormationLayout(integratedLineups.home);
  const awayFormation = useFormationLayout(integratedLineups.away);

  const timelineFilters = useTimelineFilters({
    events: timeline.events,
    activeFilter: timelineFilter,
  });
  const normalizedAnalysisEvents = useMemo(() => {
    return timeline.events.map((event) => ({
      type: String(event.kind || event.raw?.type || ""),
      team: event.teamName || undefined,
      minute: Number(event.minuteValue ?? 0) || undefined,
      detail: String(event.description || event.raw?.detail || ""),
      player: String(event.raw?.playerName || event.raw?.player || "") || undefined,
      text: String(event.title || event.raw?.text || ""),
    }));
  }, [timeline.events]);

  const liveRows = useMemo(() => liveStatRows(match.homeStats, match.awayStats), [match.awayStats, match.homeStats]);
  const keyMoments = useMemo(() => timeline.events.filter((event) => !event.isPhaseSeparator && event.isKeyMoment).slice(-5).reverse(), [timeline.events]);
  const predictionInput = useMemo<MatchAnalysisInput>(() => ({
    matchId: match.id,
    competition: match.league,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    isLive: state === "live",
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    status: match.statusDetail || match.status,
    stats: {
      home: match.homeStats,
      away: match.awayStats,
    },
    events: normalizedAnalysisEvents,
    home: {
      rank: toNumber(standings.homeStanding?.rank),
      points: toNumber(standings.homeStanding?.points),
      goalDiff: toNumber((standings.homeStanding as any)?.goalDifference ?? (standings.homeStanding as any)?.goalDiff),
      cleanSheets: toNumber(teamForm.homeTeamOverview?.cleanSheets),
      goalsFor: toNumber(standings.homeStanding?.goalsFor ?? teamForm.homeTeamOverview?.goalsFor),
      goalsAgainst: toNumber(standings.homeStanding?.goalsAgainst ?? teamForm.homeTeamOverview?.goalsAgainst),
      recentResults5: teamForm.homeForm.sequence,
      recentForm: teamForm.homeForm.sequence.join(""),
      injuries: injuries.home.length,
      lineupCertainty: integratedLineups.home.lineupState === "confirmed" ? 95 : integratedLineups.home.lineupState === "expected" ? 70 : 0,
      formation: integratedLineups.home.formation || undefined,
    },
    away: {
      rank: toNumber(standings.awayStanding?.rank),
      points: toNumber(standings.awayStanding?.points),
      goalDiff: toNumber((standings.awayStanding as any)?.goalDifference ?? (standings.awayStanding as any)?.goalDiff),
      cleanSheets: toNumber(teamForm.awayTeamOverview?.cleanSheets),
      goalsFor: toNumber(standings.awayStanding?.goalsFor ?? teamForm.awayTeamOverview?.goalsFor),
      goalsAgainst: toNumber(standings.awayStanding?.goalsAgainst ?? teamForm.awayTeamOverview?.goalsAgainst),
      recentResults5: teamForm.awayForm.sequence,
      recentForm: teamForm.awayForm.sequence.join(""),
      injuries: injuries.away.length,
      lineupCertainty: integratedLineups.away.lineupState === "confirmed" ? 95 : integratedLineups.away.lineupState === "expected" ? 70 : 0,
      formation: integratedLineups.away.formation || undefined,
    },
    headToHead: {
      homeWins: h2h.summary.homeWins,
      awayWins: h2h.summary.awayWins,
      draws: h2h.summary.draws,
    },
  }), [
    h2h.summary.awayWins,
    h2h.summary.draws,
    h2h.summary.homeWins,
    injuries.away.length,
    injuries.home.length,
    integratedLineups.away.formation,
    integratedLineups.away.lineupState,
    integratedLineups.home.formation,
    integratedLineups.home.lineupState,
    match.awayScore,
    match.awayStats,
    match.awayTeam,
    match.homeScore,
    match.homeStats,
    match.homeTeam,
    match.id,
    match.league,
    match.minute,
    match.status,
    match.statusDetail,
    standings.awayStanding,
    standings.homeStanding,
    state,
    teamForm.awayForm.sequence,
    teamForm.awayTeamOverview,
    teamForm.homeForm.sequence,
    teamForm.homeTeamOverview,
    normalizedAnalysisEvents,
  ]);
  const prediction = useMemo(
    () => runAiPredictionModel(predictionInput, state === "live" ? "live" : "prematch"),
    [predictionInput, state],
  );
  const liveStory = useMemo(
    () => buildAiMatchStory({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      timeline: timeline.events,
      homeStats: match.homeStats,
      awayStats: match.awayStats,
    }),
    [match.awayScore, match.awayStats, match.awayTeam, match.homeScore, match.homeStats, match.homeTeam, timeline.events],
  );
  const storyCard = useMemo(
    () => generateAiMatchStoryCard({ prediction, liveStory, isLive: state === "live", homeTeam: match.homeTeam, awayTeam: match.awayTeam }),
    [liveStory, match.awayTeam, match.homeTeam, prediction, state],
  );

  const predictionDrivers = useMemo(() => {
    const drivers = [
      standings.homeStanding?.rank && standings.awayStanding?.rank
        ? `Table edge: ${match.homeTeam} #${standings.homeStanding.rank} vs ${match.awayTeam} #${standings.awayStanding.rank}`
        : null,
      `Form index: ${teamForm.homeForm.aiFormScore} vs ${teamForm.awayForm.aiFormScore}`,
      h2h.rows.length ? `Recent H2H: ${h2h.summary.homeWins}-${h2h.summary.draws}-${h2h.summary.awayWins}` : null,
      state === "live" ? `Live state: ${match.homeScore}-${match.awayScore}${match.minute ? ` at ${match.minute}'` : ""}` : null,
      prediction.probabilityEngine.confidence.reason || null,
    ];
    return drivers.filter(Boolean) as string[];
  }, [h2h.rows.length, h2h.summary.awayWins, h2h.summary.draws, h2h.summary.homeWins, match.awayScore, match.awayTeam, match.homeScore, match.homeTeam, match.minute, prediction.probabilityEngine.confidence.reason, standings.awayStanding?.rank, standings.homeStanding?.rank, state, teamForm.awayForm.aiFormScore, teamForm.homeForm.aiFormScore]);

  const loading = detailQuery.isLoading && !detailQuery.data;

  async function handleFollowToggle() {
    if (!match.id) return;
    if (isMatchFollowed) {
      await unfollowMatchAction(match.id);
      return;
    }

    await followMatchAction({
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      competition: match.league,
      espnLeague,
      startTime: match.startDate || null,
      notificationsEnabled: true,
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        refreshControl={<RefreshControl refreshing={detailQuery.isFetching && !loading} onRefresh={detailQuery.refetch} tintColor={DS.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[COLORS.cardBright, COLORS.cardElevated, COLORS.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.topBar}>
            <TouchableOpacity activeOpacity={0.84} onPress={() => router.back()} style={styles.iconButton}>
              <Ionicons name="chevron-back" size={20} color={DS.text} />
            </TouchableOpacity>
            <View style={styles.heroMetaCenter}>
              <Text style={styles.heroMetaLabel}>Match Center</Text>
              <Text style={styles.heroMetaSub}>{state === "live" ? "Live coverage" : state === "finished" ? "Final report" : "Prematch hub"}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.84} onPress={handleFollowToggle} style={[styles.iconButton, isMatchFollowed && styles.iconButtonActive]}>
              <Ionicons name={isMatchFollowed ? "notifications" : "notifications-outline"} size={18} color={isMatchFollowed ? DS.accent : DS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroLeagueRow}>
            {competitionBrand.logo ? <Image source={typeof competitionBrand.logo === "number" ? competitionBrand.logo : { uri: competitionBrand.logo as string }} style={styles.heroLeagueLogo} resizeMode="contain" /> : null}
            <Text numberOfLines={1} style={styles.heroLeague}>{match.league}</Text>
            <View style={[styles.statePill, state === "live" ? styles.statePillLive : state === "upcoming" ? styles.statePillUpcoming : styles.statePillMuted]}>
              <Text style={[styles.statePillText, state === "live" ? styles.statePillTextLive : undefined]}>
                {state === "live" ? (match.minute ? `${match.minute}'` : "LIVE") : state === "finished" ? "FT" : state === "postponed" ? "POSTPONED" : state === "cancelled" ? "CANCELLED" : kickoff.time}
              </Text>
            </View>
          </View>

          <View style={styles.scoreboard}>
            <TouchableOpacity
              style={styles.teamColumn}
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: "/team-detail", params: { teamId: match.homeTeamId, teamName: match.homeTeam, logo: match.homeTeamLogo, sport: safeText(params.sport, "soccer"), espnLeague } })}
            >
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={68} />
              <Text style={styles.teamName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{match.homeTeam}</Text>
            </TouchableOpacity>
            <View style={styles.scoreColumn}>
              {loading ? <ActivityIndicator color={DS.accent} /> : <Text style={styles.scoreText}>{match.homeScore} - {match.awayScore}</Text>}
              <Text style={styles.scoreSub}>{match.statusDetail || (state === "upcoming" ? `${kickoff.date} • ${kickoff.time}` : kickoff.date)}</Text>
              <Text style={styles.scoreMicro}>{match.round || matchContext.venue || "Premium live intelligence"}</Text>
            </View>
            <TouchableOpacity
              style={styles.teamColumn}
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: "/team-detail", params: { teamId: match.awayTeamId, teamName: match.awayTeam, logo: match.awayTeamLogo, sport: safeText(params.sport, "soccer"), espnLeague } })}
            >
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={68} />
              <Text style={styles.teamName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{match.awayTeam}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroStatsRow}>
            <HeroStat label="Kickoff" value={kickoff.date} />
            <HeroStat label="Venue" value={matchContext.venue || "TBA"} />
            <HeroStat label="Referee" value={matchContext.referee || "TBA"} />
          </View>
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabStrip}>
          {TAB_ITEMS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <TouchableOpacity key={tab.id} activeOpacity={0.84} onPress={() => setActiveTab(tab.id)} style={[styles.tabPill, active && styles.tabPillActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeTab === "overview" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Snapshot" subtitle="The fastest read on the fixture right now">
              <View style={styles.quickStatsGrid}>
                <QuickStat label="State" value={state.toUpperCase()} tone={state === "live" ? "live" : "default"} />
                <QuickStat label="Confidence" value={`${prediction.confidence}%`} />
                <QuickStat label="Timeline" value={`${timeline.events.length} events`} />
              </View>
              <Text style={styles.bodyCopy}>{inferVerdict(match.homeTeam, match.awayTeam, storyCard?.summary || prediction.summary, prediction.favored_side)}</Text>
            </SectionCard>

            <SectionCard title="Prediction Split" subtitle="Built from table, form, H2H and live score state">
              <ProbabilityBar homeLabel={match.homeTeam} awayLabel={match.awayTeam} homeValue={prediction.homePct} drawValue={prediction.drawPct} awayValue={prediction.awayPct} />
              <View style={styles.driverList}>
                {predictionDrivers.map((driver) => <BulletRow key={driver} label={driver} />)}
              </View>
            </SectionCard>

            {storyCard ? (
              <SectionCard title={storyCard.title} subtitle="Premium AI narrative from live signals, form and matchup context">
                <Text style={styles.bodyCopy}>{storyCard.summary}</Text>
                <View style={styles.driverList}>
                  {storyCard.keyFactors.map((factor) => <BulletRow key={factor} label={factor} />)}
                </View>
              </SectionCard>
            ) : null}

            <SectionCard title="Key Moments" subtitle="Latest turning points pulled from the event stream">
              {keyMoments.length ? keyMoments.map((event) => <TimelineEventRow key={event.id} event={event} />) : <EmptyBlock title="No major events yet" subtitle="Timeline moments will surface here as the match develops." />}
            </SectionCard>

            <SectionCard title="Season Edge" subtitle="Quick comparison view from current team profiles">
              {seasonStats.hasAnyMetric ? seasonStats.metrics.slice(0, 3).map((metric) => (
                <ComparisonMetricRow key={metric.key} label={metric.label} home={metric.home} away={metric.away} suffix={metric.suffix} decimals={metric.decimals} />
              )) : <EmptyBlock title="Season comparison is still loading" />}
            </SectionCard>
          </View>
        ) : null}

        {activeTab === "prematch" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Table Position" subtitle="Current league standing and points context">
              <View style={styles.dualGrid}>
                <StandingCard team={match.homeTeam} standing={standings.homeStanding} formScore={teamForm.homeForm.aiFormScore} color={DS.home} />
                <StandingCard team={match.awayTeam} standing={standings.awayStanding} formScore={teamForm.awayForm.aiFormScore} color={DS.away} />
              </View>
            </SectionCard>

            <SectionCard title="Recent Form" subtitle="Last five results and scoring direction">
              <View style={styles.dualGrid}>
                <FormCard team={match.homeTeam} summary={teamForm.homeForm} />
                <FormCard team={match.awayTeam} summary={teamForm.awayForm} />
              </View>
            </SectionCard>

            <SectionCard title="Key Players" subtitle="Most relevant contributors from team and competition data">
              <View style={styles.dualGrid}>
                <PlayerCard sideLabel={match.homeTeam} data={keyPlayers.home} accent={DS.home} />
                <PlayerCard sideLabel={match.awayTeam} data={keyPlayers.away} accent={DS.away} />
              </View>
            </SectionCard>

            <SectionCard title="Absences" subtitle="Injuries and suspensions surfaced from team overview data">
              <View style={styles.dualGrid}>
                <AbsenceCard title={match.homeTeam} rows={injuries.home} />
                <AbsenceCard title={match.awayTeam} rows={injuries.away} />
              </View>
            </SectionCard>

            <SectionCard title="Match Context" subtitle="Venue, timing and setup details">
              <View style={styles.contextList}>
                <ContextRow label="Kickoff" value={`${matchContext.kickoffDate || kickoff.date} • ${matchContext.kickoffTime || kickoff.time}`} />
                <ContextRow label="Venue" value={matchContext.venue || "TBA"} />
                <ContextRow label="City" value={matchContext.city || "TBA"} />
                <ContextRow label="Referee" value={matchContext.referee || "TBA"} />
                <ContextRow label="Weather" value={matchContext.weather || "TBA"} />
              </View>
            </SectionCard>
          </View>
        ) : null}

        {activeTab === "predictions" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Outcome Model" subtitle="Structured probability split for win, draw and away win">
              <ProbabilityBar homeLabel={match.homeTeam} awayLabel={match.awayTeam} homeValue={prediction.homePct} drawValue={prediction.drawPct} awayValue={prediction.awayPct} />
              <View style={styles.predictionSummary}>
                <PredictionTile label={match.homeTeam} value={`${prediction.homePct}%`} accent={DS.home} />
                <PredictionTile label="Draw" value={`${prediction.drawPct}%`} accent={DS.muted} />
                <PredictionTile label={match.awayTeam} value={`${prediction.awayPct}%`} accent={DS.away} />
              </View>
            </SectionCard>

            <SectionCard title="Why The Model Leans This Way" subtitle="Real drivers instead of placeholder copy">
              <View style={styles.driverList}>
                {predictionDrivers.map((driver) => <BulletRow key={driver} label={driver} />)}
              </View>
            </SectionCard>

            <SectionCard title="Model Verdict" subtitle="Short read for the premium sports layer">
              <Text style={styles.verdictTitle}>{inferVerdict(match.homeTeam, match.awayTeam, storyCard?.summary || prediction.summary, prediction.favored_side)}</Text>
              <Text style={styles.bodyCopy}>Confidence sits at {prediction.confidence}%. {prediction.tip || prediction.probabilityEngine.confidence.reason}</Text>
            </SectionCard>
          </View>
        ) : null}

        {activeTab === "stats" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Live Match Stats" subtitle="Current match stats when the feed exposes them">
              {liveRows.length ? liveRows.map((row) => (
                <LiveStatRow key={row.label} label={row.label} home={row.home} away={row.away} suffix={row.suffix} decimals={row.decimals} />
              )) : <EmptyBlock title="No live stats available yet" subtitle="The feed has not returned possession, shots or card counts for this fixture." />}
            </SectionCard>

            <SectionCard title="Season Metrics" subtitle="Team profile comparison from standings and overview endpoints">
              {seasonStats.hasAnyMetric ? seasonStats.metrics.map((metric) => (
                <ComparisonMetricRow key={metric.key} label={metric.label} home={metric.home} away={metric.away} suffix={metric.suffix} decimals={metric.decimals} />
              )) : <EmptyBlock title="Season metrics unavailable" />}
            </SectionCard>
          </View>
        ) : null}

        {activeTab === "lineups" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Lineups" subtitle="Confirmed squads when available, otherwise expected structures">
              <View style={styles.dualGrid}>
                <LineupCard team={integratedLineups.home} rows={homeFormation.rows} accent={DS.home} unavailable={expectedLineups.unavailablePlayers.home} />
                <LineupCard team={integratedLineups.away} rows={awayFormation.rows} accent={DS.away} unavailable={expectedLineups.unavailablePlayers.away} />
              </View>
            </SectionCard>
          </View>
        ) : null}

        {activeTab === "timeline" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Timeline" subtitle="Filtered event stream for goals, cards, subs, VAR and key moments">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
                {timelineFilters.availableFilters.map((filter) => {
                  const active = filter.key === timelineFilter;
                  return (
                    <TouchableOpacity key={filter.key} activeOpacity={0.84} onPress={() => setTimelineFilter(filter.key)} style={[styles.filterPill, active && styles.filterPillActive]}>
                      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{filter.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.timelineStack}>
                {timelineFilters.filteredEvents.length ? timelineFilters.filteredEvents.map((event) => <TimelineEventRow key={event.id} event={event} />) : <EmptyBlock title="No timeline entries for this filter" />}
              </View>
            </SectionCard>
          </View>
        ) : null}

        {activeTab === "h2h" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Head To Head" subtitle="Recent completed meetings between both teams">
              <View style={styles.quickStatsGrid}>
                <QuickStat label={match.homeTeam} value={String(h2h.summary.homeWins)} />
                <QuickStat label="Draws" value={String(h2h.summary.draws)} />
                <QuickStat label={match.awayTeam} value={String(h2h.summary.awayWins)} />
              </View>
              <View style={styles.timelineStack}>
                {h2h.rows.length ? h2h.rows.map((row) => (
                  <View key={row.id} style={styles.h2hRow}>
                    <Text style={styles.h2hTeams}>{row.homeTeam} {row.homeScore} - {row.awayScore} {row.awayTeam}</Text>
                    <Text style={styles.h2hMeta}>{formatKickoff(row.date).date}</Text>
                  </View>
                )) : <EmptyBlock title="No completed H2H matches found" subtitle="The competition feed did not return historical meetings." />}
              </View>
            </SectionCard>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.heroStatValue}>{value}</Text>
    </View>
  );
}

function QuickStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "live" }) {
  return (
    <View style={[styles.quickStat, tone === "live" && styles.quickStatLive]}>
      <Text style={styles.quickStatValue}>{value}</Text>
      <Text style={[styles.quickStatLabel, tone === "live" && styles.quickStatLabelLive]}>{label}</Text>
    </View>
  );
}

function BulletRow({ label }: { label: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{label}</Text>
    </View>
  );
}

function ProbabilityBar({ homeLabel, awayLabel, homeValue, drawValue, awayValue }: { homeLabel: string; awayLabel: string; homeValue: number; drawValue: number; awayValue: number }) {
  return (
    <View style={styles.probabilityWrap}>
      <View style={styles.probabilityBar}>
        <View style={[styles.probabilityHome, { flex: homeValue }]} />
        <View style={[styles.probabilityDraw, { flex: drawValue }]} />
        <View style={[styles.probabilityAway, { flex: awayValue }]} />
      </View>
      <View style={styles.probabilityLegend}>
        <Text style={styles.probabilityText}>{homeLabel} {homeValue}%</Text>
        <Text style={styles.probabilityText}>Draw {drawValue}%</Text>
        <Text style={styles.probabilityText}>{awayLabel} {awayValue}%</Text>
      </View>
    </View>
  );
}

function PredictionTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.predictionTile}>
      <View style={[styles.predictionAccent, { backgroundColor: accent }]} />
      <Text numberOfLines={1} style={styles.predictionLabel}>{label}</Text>
      <Text style={styles.predictionValue}>{value}</Text>
    </View>
  );
}

function StandingCard({ team, standing, formScore, color }: { team: string; standing: any; formScore: number; color: string }) {
  return (
    <View style={styles.infoCard}>
      <View style={[styles.infoAccent, { backgroundColor: color }]} />
      <Text style={styles.infoTitle}>{team}</Text>
      <Text style={styles.infoPrimary}>{standing?.rank ? `#${standing.rank}` : "--"}</Text>
      <Text style={styles.infoMeta}>{standing?.points != null ? `${standing.points} pts` : "No table data"}</Text>
      <Text style={styles.infoMeta}>Form index {formScore}</Text>
    </View>
  );
}

function FormCard({ team, summary }: { team: string; summary: { sequence: ("W" | "D" | "L")[]; goalsScored: number; goalsConceded: number; aiFormScore: number } }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{team}</Text>
      <View style={styles.formDots}>
        {summary.sequence.length ? summary.sequence.map((result, index) => (
          <View key={`${team}_${index}`} style={[styles.formDot, result === "W" ? styles.formDotWin : result === "D" ? styles.formDotDraw : styles.formDotLoss]}>
            <Text style={styles.formDotText}>{result}</Text>
          </View>
        )) : <Text style={styles.infoMeta}>No recent form loaded</Text>}
      </View>
      <Text style={styles.infoMeta}>Goals: {summary.goalsScored} for • {summary.goalsConceded} against</Text>
      <Text style={styles.infoMeta}>Form index {summary.aiFormScore}</Text>
    </View>
  );
}

function PlayerCard({ sideLabel, data, accent }: { sideLabel: string; data: any; accent: string }) {
  const topScorer = data?.topScorer;
  const assistLeader = data?.assistLeader;
  const keyPlayer = data?.keyPlayer?.player || null;
  return (
    <View style={styles.infoCard}>
      <View style={[styles.infoAccent, { backgroundColor: accent }]} />
      <Text style={styles.infoTitle}>{sideLabel}</Text>
      <Text style={styles.playerHeadline}>{safeText(topScorer?.name || keyPlayer?.name, "No scorer data")}</Text>
      <Text style={styles.infoMeta}>Top scorer: {topScorer ? `${safeText(topScorer.name)} (${safeText(topScorer.goals, "0")})` : "--"}</Text>
      <Text style={styles.infoMeta}>Assist leader: {assistLeader ? safeText(assistLeader.name) : "--"}</Text>
      <Text style={styles.infoMeta}>Key player: {keyPlayer ? safeText(keyPlayer.name) : "--"}</Text>
    </View>
  );
}

function AbsenceCard({ title, rows }: { title: string; rows: { name: string; reason: string; status: string }[] }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{title}</Text>
      {rows.length ? rows.map((row) => (
        <View key={`${title}_${row.name}_${row.reason}`} style={styles.absenceRow}>
          <Text style={styles.absenceName}>{row.name}</Text>
          <Text style={styles.absenceReason}>{row.reason}</Text>
        </View>
      )) : <Text style={styles.infoMeta}>No verified absences surfaced.</Text>}
    </View>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.contextRow}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={styles.contextValue}>{value}</Text>
    </View>
  );
}

function ComparisonMetricRow({ label, home, away, suffix = "", decimals = 0 }: { label: string; home: number | null; away: number | null; suffix?: string; decimals?: number }) {
  const left = home ?? 0;
  const right = away ?? 0;
  const total = Math.max(1, left + right);
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricValue}>{metricValue(home, suffix, decimals)}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{metricValue(away, suffix, decimals)}</Text>
      </View>
      <View style={styles.metricBar}>
        <View style={[styles.metricBarHome, { flex: left / total }]} />
        <View style={[styles.metricBarAway, { flex: right / total }]} />
      </View>
    </View>
  );
}

function LiveStatRow({ label, home, away, suffix = "", decimals = 0 }: { label: string; home: number | null; away: number | null; suffix?: string; decimals?: number }) {
  return <ComparisonMetricRow label={label} home={home} away={away} suffix={suffix} decimals={decimals} />;
}

function LineupCard({ team, rows, accent, unavailable }: { team: TeamLineupState; rows: any[]; accent: string; unavailable: string[] }) {
  return (
    <View style={styles.lineupCard}>
      <View style={[styles.infoAccent, { backgroundColor: accent }]} />
      <Text style={styles.infoTitle}>{team.teamName}</Text>
      <Text style={styles.infoMeta}>{team.lineupState === "confirmed" ? `Confirmed • ${team.formation || "formation pending"}` : team.lineupState === "expected" ? `Expected • ${team.formation || "shape pending"}` : "Unavailable"}</Text>
      <View style={styles.lineupPitch}>
        {rows.length ? rows.map((row: any[], index: number) => (
          <View key={`${team.teamName}_row_${index}`} style={styles.lineupRow}>
            {row.map((player: any) => (
              <View key={player.id} style={styles.lineupPlayerChip}>
                <Text numberOfLines={1} style={styles.lineupPlayerName}>{player.name}</Text>
                <Text style={styles.lineupPlayerMeta}>{player.jersey}</Text>
              </View>
            ))}
          </View>
        )) : <Text style={styles.infoMeta}>No lineup rows available.</Text>}
      </View>
      <Text style={styles.benchTitle}>Bench</Text>
      <Text style={styles.benchList}>{team.bench.length ? team.bench.slice(0, 8).map((player) => player.name).join(" • ") : "No bench data"}</Text>
      {!!unavailable.length && <Text style={styles.absenceReason}>Unavailable: {unavailable.join(" • ")}</Text>}
    </View>
  );
}

function TimelineEventRow({ event }: { event: TimelineEventItem }) {
  const sideTone = event.side === "home" ? DS.home : event.side === "away" ? DS.away : DS.muted;
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineMinute, { backgroundColor: event.isPhaseSeparator ? DS.accentSoft : "rgba(255,255,255,0.06)" }]}>
        <Text style={styles.timelineMinuteText}>{event.minuteLabel}</Text>
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineTitle}>{event.title}</Text>
        <Text style={styles.timelineDescription}>{event.description || event.teamName || "Match event"}</Text>
      </View>
      <View style={[styles.timelineSideDot, { backgroundColor: sideTone }]} />
    </View>
  );
}

function EmptyBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 18 },
  heroCard: { borderRadius: 28, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  iconButtonActive: { backgroundColor: DS.accentSoft, borderColor: "rgba(229,9,20,0.28)" },
  heroMetaCenter: { alignItems: "center", gap: 2 },
  heroMetaLabel: { color: DS.text, fontSize: 16, fontFamily: "Inter_800ExtraBold" },
  heroMetaSub: { color: DS.muted, fontSize: 12, fontFamily: "Inter_500Medium" },
  heroLeagueRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 22 },
  heroLeagueLogo: { width: 24, height: 24 },
  heroLeague: { flex: 1, color: DS.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  statePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  statePillLive: { backgroundColor: DS.liveSoft },
  statePillUpcoming: { backgroundColor: "rgba(96,165,250,0.16)" },
  statePillMuted: { backgroundColor: "rgba(255,255,255,0.08)" },
  statePillText: { color: DS.text, fontSize: 12, fontFamily: "Inter_800ExtraBold" },
  statePillTextLive: { color: DS.live },
  scoreboard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 22 },
  teamColumn: { flex: 1.2, alignItems: "center", gap: 10 },
  teamName: { color: DS.text, fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 19, width: "100%" },
  scoreColumn: { alignItems: "center", gap: 6, flexShrink: 0, minWidth: 106 },
  scoreText: { color: DS.text, fontSize: 42, fontFamily: "Inter_900Black" },
  scoreSub: { color: DS.muted, fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  scoreMicro: { color: DS.subtle, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  heroStatsRow: { flexDirection: "row", gap: 10 },
  heroStat: { flex: 1, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 12, paddingVertical: 12, gap: 5 },
  heroStatLabel: { color: DS.subtle, fontSize: 11, fontFamily: "Inter_700Bold" },
  heroStatValue: { color: DS.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabStrip: { gap: 10, paddingVertical: 4 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.panel, borderWidth: 1, borderColor: DS.border },
  tabPillActive: { backgroundColor: DS.accentSoft, borderColor: "rgba(229,9,20,0.3)" },
  tabText: { color: DS.muted, fontSize: 13, fontFamily: "Inter_700Bold" },
  tabTextActive: { color: DS.text },
  sectionStack: { gap: 16 },
  sectionCard: { backgroundColor: DS.panel, borderRadius: 24, borderWidth: 1, borderColor: DS.border, padding: 16, gap: 14 },
  sectionHead: { gap: 4 },
  sectionTitle: { color: DS.text, fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionSubtitle: { color: DS.muted, fontSize: 13, fontFamily: "Inter_500Medium" },
  quickStatsGrid: { flexDirection: "row", gap: 10 },
  quickStat: { flex: 1, borderRadius: 18, backgroundColor: DS.panelRaised, paddingHorizontal: 14, paddingVertical: 14, gap: 6 },
  quickStatLive: { backgroundColor: DS.liveSoft },
  quickStatValue: { color: DS.text, fontSize: 24, fontFamily: "Inter_900Black" },
  quickStatLabel: { color: DS.muted, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  quickStatLabelLive: { color: DS.live },
  bodyCopy: { color: DS.muted, fontSize: 14, lineHeight: 21, fontFamily: "Inter_500Medium" },
  driverList: { gap: 10 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DS.accent, marginTop: 6 },
  bulletText: { flex: 1, color: DS.text, fontSize: 14, lineHeight: 20, fontFamily: "Inter_500Medium" },
  probabilityWrap: { gap: 12 },
  probabilityBar: { flexDirection: "row", height: 14, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  probabilityHome: { backgroundColor: DS.home },
  probabilityDraw: { backgroundColor: DS.muted },
  probabilityAway: { backgroundColor: DS.away },
  probabilityLegend: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  probabilityText: { color: DS.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  predictionSummary: { flexDirection: "row", gap: 10 },
  predictionTile: { flex: 1, backgroundColor: DS.panelRaised, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 14, gap: 6 },
  predictionAccent: { width: 28, height: 4, borderRadius: 999 },
  predictionLabel: { color: DS.muted, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  predictionValue: { color: DS.text, fontSize: 24, fontFamily: "Inter_900Black" },
  verdictTitle: { color: DS.text, fontSize: 18, lineHeight: 24, fontFamily: "Inter_800ExtraBold" },
  dualGrid: { gap: 12 },
  infoCard: { backgroundColor: DS.panelRaised, borderRadius: 20, padding: 14, gap: 8 },
  infoAccent: { width: 34, height: 4, borderRadius: 999, marginBottom: 4 },
  infoTitle: { color: DS.text, fontSize: 16, fontFamily: "Inter_800ExtraBold" },
  infoPrimary: { color: DS.text, fontSize: 30, fontFamily: "Inter_900Black" },
  infoMeta: { color: DS.muted, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  formDots: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  formDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  formDotWin: { backgroundColor: "rgba(34,197,94,0.18)" },
  formDotDraw: { backgroundColor: "rgba(148,163,184,0.18)" },
  formDotLoss: { backgroundColor: "rgba(249,115,22,0.18)" },
  formDotText: { color: DS.text, fontSize: 12, fontFamily: "Inter_800ExtraBold" },
  playerHeadline: { color: DS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  absenceRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: DS.border },
  absenceName: { color: DS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  absenceReason: { color: DS.muted, fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  contextList: { gap: 10 },
  contextRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  contextLabel: { color: DS.subtle, fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  contextValue: { flex: 1, color: DS.text, fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "right" },
  metricRow: { gap: 8 },
  metricHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  metricValue: { color: DS.text, fontSize: 13, fontFamily: "Inter_800ExtraBold", minWidth: 54 },
  metricLabel: { flex: 1, color: DS.muted, fontSize: 13, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  metricBar: { flexDirection: "row", height: 10, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  metricBarHome: { backgroundColor: DS.home },
  metricBarAway: { backgroundColor: DS.away },
  lineupCard: { backgroundColor: DS.panelRaised, borderRadius: 20, padding: 14, gap: 10 },
  lineupPitch: { borderRadius: 18, padding: 12, backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.12)", gap: 8 },
  lineupRow: { flexDirection: "row", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  lineupPlayerChip: { minWidth: 82, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(5,7,11,0.52)", alignItems: "center", gap: 3 },
  lineupPlayerName: { color: DS.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  lineupPlayerMeta: { color: DS.muted, fontSize: 11, fontFamily: "Inter_500Medium" },
  benchTitle: { color: DS.text, fontSize: 12, fontFamily: "Inter_800ExtraBold", textTransform: "uppercase" },
  benchList: { color: DS.muted, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  filterStrip: { gap: 10, paddingBottom: 4 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: DS.panelRaised, borderWidth: 1, borderColor: DS.border },
  filterPillActive: { backgroundColor: DS.accentSoft, borderColor: "rgba(229,9,20,0.3)" },
  filterPillText: { color: DS.muted, fontSize: 12, fontFamily: "Inter_700Bold" },
  filterPillTextActive: { color: DS.text },
  timelineStack: { gap: 10 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: DS.border },
  timelineMinute: { minWidth: 54, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  timelineMinuteText: { color: DS.text, fontSize: 12, fontFamily: "Inter_800ExtraBold" },
  timelineContent: { flex: 1, gap: 3 },
  timelineTitle: { color: DS.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  timelineDescription: { color: DS.muted, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  timelineSideDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  h2hRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: DS.border, gap: 4 },
  h2hTeams: { color: DS.text, fontSize: 14, lineHeight: 19, fontFamily: "Inter_700Bold" },
  h2hMeta: { color: DS.muted, fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyBlock: { borderRadius: 18, padding: 16, backgroundColor: DS.panelRaised, gap: 6 },
  emptyTitle: { color: DS.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  emptySubtitle: { color: DS.muted, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
});
