import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Alert, View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Image, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import WebView from "react-native-webview";
import { useQuery, useMutation } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { LiveBadge } from "@/components/LiveBadge";
import { SafeHaptics } from "@/lib/safeHaptics";
import { openInVlc } from "@/lib/vlc";
import { TeamLogo } from "@/components/TeamLogo";
import { PillTabs, StateBlock } from "@/components/ui/PremiumPrimitives";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { safeStr } from "@/lib/utils";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { SilentResetBoundary } from "@/components/SilentResetBoundary";
import { t as tFn } from "@/lib/i18n";
import { getBestCachedOrSeedPlayerImage, resolvePlayerImageUri } from "@/lib/player-image-system";
import { resolveMatchBucket } from "@/lib/match-state";
import { buildGroundedMatchAnalysis } from "@/lib/match-analysis-engine";
import { toCanonicalMatch } from "@/lib/canonical-match";
import { normalizeTeamName, tokenOverlapScore } from "@/lib/entity-normalization";
import { cacheGetStale, cachePeekStale, cacheSet, CacheTTL } from "@/lib/services/cache-service";
import { getCompetitionInsights, getMatchDetailRaw, getMatchStream, sportKeys } from "@/lib/services/sports-service";
import { useNexora } from "@/context/NexoraContext";
import { showRewardedUnlockAd } from "@/lib/rewarded-ads";
const BLOCK_POPUP_JS = `
(function(){
  // Patch removeChild to never throw — prevents DOMException crashes
  try{
    var _origRc = Node.prototype.removeChild;
    Node.prototype.removeChild = function(child){
      try{ return _origRc.call(this, child); }catch(e){ return child; }
    };
  }catch(e){}

  // Swallow removeChild / DOM hierarchy errors silently
  var _isRcErr = function(msg){
    var s = String(msg||'').toLowerCase();
    return s.includes('removechild') || s.includes('notfounderror') || s.includes('not a child') || s.includes('hierarchyrequesterror');
  };
  window.onerror = function(message,source,lineno,colno,error){
    var msg = error ? String(error.message||error.name||message||'') : String(message||'');
    if(_isRcErr(msg)) return true;
    return false;
  };
  window.addEventListener('error', function(ev){
    try{
      var msg = ev.error ? String(ev.error.message||ev.error.name||'') : String(ev.message||'');
      if(_isRcErr(msg)){ ev.preventDefault(); ev.stopImmediatePropagation(); }
    }catch(e){}
  }, true);

  // Block popups / navigation
  window.open = function(){ return null; };
  window.alert = function(){};
  window.confirm = function(){ return true; };
  window.prompt = function(){ return ''; };
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
    if(a){ e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('beforeunload', function(e){ e.stopImmediatePropagation(); }, true);
})();
true;
`;

const TABS = [
  { id: "stream",    label: "matchDetail.stream",      icon: "play-circle-outline" },
  { id: "stats",    label: "matchDetail.stats",       icon: "bar-chart-outline" },
  { id: "lineups",  label: "matchDetail.lineups",     icon: "people-outline" },
  { id: "timeline", label: "matchDetail.timeline",    icon: "git-branch-outline" },
  { id: "highlights", label: "matchDetail.highlights", icon: "star-outline" },
] as const;

const EXPERIENCE_TABS = [
  { id: "prematch", label: "Prematch" },
  { id: "predictions", label: "Predictions ⚡ AI" },
  { id: "stats", label: "Stats" },
  { id: "lineups", label: "Lineups" },
  { id: "timeline", label: "Timeline" },
  { id: "h2h", label: "H2H" },
  { id: "power", label: "Power" },
  { id: "success", label: "Success Rate" },
] as const;

type TabId = "stream" | "stats" | "lineups" | "timeline" | "highlights";
type ExperienceTabId = "prematch" | "predictions" | "stats" | "lineups" | "timeline" | "h2h" | "power" | "success";

function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const msg = String((error as any)?.message || "").toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("netwerk") ||
    msg.includes("failed to fetch") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("abort") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

function buildFormationRows(players: any[], formationRaw?: string) {
  const starters = (Array.isArray(players) ? players : [])
    .filter((p) => p?.starter !== false)
    .slice(0, 11);

  if (!starters.length) return [] as any[][];

  const formationNums = String(formationRaw || "")
    .split("-")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const byRole = {
    gk: starters.filter((p) => /gk|goalkeeper/i.test(`${p?.position || ""} ${p?.positionName || ""}`)),
    def: starters.filter((p) => /cb|lb|rb|wb|def|back/i.test(`${p?.position || ""} ${p?.positionName || ""}`)),
    mid: starters.filter((p) => /dm|cm|am|lm|rm|mid/i.test(`${p?.position || ""} ${p?.positionName || ""}`)),
    fwd: starters.filter((p) => /st|cf|lw|rw|fw|att|wing|forward|striker/i.test(`${p?.position || ""} ${p?.positionName || ""}`)),
  };

  const pool = [...starters];
  const takeFrom = (arr: any[], count: number) => {
    const out: any[] = [];
    while (arr.length && out.length < count) {
      const p = arr.shift();
      const idx = pool.findIndex((x) => x?.id === p?.id);
      if (idx >= 0) {
        out.push(pool[idx]);
        pool.splice(idx, 1);
      }
    }
    return out;
  };

  const gk = takeFrom([...byRole.gk], 1);
  if (!gk.length && pool.length) gk.push(pool.shift());

  const lines = formationNums.length >= 3 ? formationNums : [4, 3, 3];

  // Build rows from back to front: defenders first, then additional lines toward attack
  const rows: any[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const count = lines[i];
    // Pick from the most logical role pool, fallback to remaining pool
    const rolePool = i === 0 ? byRole.def : i === lines.length - 1 ? byRole.fwd : byRole.mid;
    const row = takeFrom([...rolePool], count);
    while (row.length < count && pool.length) row.push(pool.shift());
    rows.push(row);
  }

  // Return from front (attackers) to back (GK) for rendering
  return [...rows.reverse(), gk].filter((row) => row.length > 0);
}

function orderLineupTeams(starters: any[], homeName: string, awayName: string): any[] {
  const teams = Array.isArray(starters) ? [...starters] : [];
  if (teams.length < 2) return teams;

  const homeKey = normalizeTeamName(homeName);
  const awayKey = normalizeTeamName(awayName);

  const matchIndex = (target: string) => teams.findIndex((team) => {
    const teamName = team?.team || team?.name || "";
    const teamKey = normalizeTeamName(teamName);
    if (!teamKey || !target) return false;
    // Use tokenOverlapScore for more sophisticated matching than substring inclusion
    const overlapScore = tokenOverlapScore(teamKey, target);
    return teamKey === target || overlapScore >= 0.5;
  });

  const homeIdx = matchIndex(homeKey);
  const awayIdx = matchIndex(awayKey);
  if (homeIdx >= 0 && awayIdx >= 0 && homeIdx !== awayIdx) {
    return [teams[homeIdx], teams[awayIdx], ...teams.filter((_, idx) => idx !== homeIdx && idx !== awayIdx)];
  }
  if (homeIdx > 0) {
    const homeTeam = teams[homeIdx];
    teams.splice(homeIdx, 1);
    teams.unshift(homeTeam);
  }
  return teams;
}

function normalizeLeague(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function looksDomesticCompetition(label: string): boolean {
  return /premier|laliga|la liga|bundesliga|serie a|ligue 1|championship|eredivisie|pro league|super lig|primeira/.test(label);
}

function hasCountryLogo(uri: unknown): boolean {
  return String(uri || "").toLowerCase().includes("/countries/");
}

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{
    matchId: string; homeTeam: string; awayTeam: string;
    homeTeamLogo?: string; awayTeamLogo?: string;
    homeScore?: string; awayScore?: string;
    league: string; espnLeague?: string; minute?: string; status: string; sport: string;
    startDate?: string; statusDetail?: string;
    initialTab?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { hasPremium, dailyPredictionUnlocksRemaining, isPredictionUnlocked, unlockPredictionWithRewardedAd } = useNexora();
  const resolvedInitialTab = (params.initialTab && ["stream", "stats", "lineups", "timeline", "highlights"].includes(params.initialTab)) ? params.initialTab as TabId : "stream";
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Record<TabId, boolean>>({
    stream: resolvedInitialTab === "stream",
    stats: resolvedInitialTab === "stats",
    lineups: resolvedInitialTab === "lineups",
    timeline: resolvedInitialTab === "timeline",
    highlights: resolvedInitialTab === "highlights",
  });
  const [lineupView, setLineupView] = useState<"pitch" | "list">("pitch");
  const [streamKey, setStreamKey] = useState(0);
  const [streamWebError, setStreamWebError] = useState<unknown>(null);
  const [streamErrorRef, setStreamErrorRef] = useState<string>("");
  const [activeExperienceTab, setActiveExperienceTab] = useState<ExperienceTabId>("prematch");
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [rewardedAdRunning, setRewardedAdRunning] = useState(false);
  const paramCanonical = useMemo(() => toCanonicalMatch({
    id: params.matchId,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    homeTeamLogo: params.homeTeamLogo,
    awayTeamLogo: params.awayTeamLogo,
    homeScore: params.homeScore,
    awayScore: params.awayScore,
    status: params.status,
    detail: params.statusDetail,
    minute: params.minute,
    startDate: params.startDate,
    league: params.league,
    espnLeague: params.espnLeague,
    sport: params.sport,
  }), [params.awayScore, params.awayTeam, params.awayTeamLogo, params.espnLeague, params.homeScore, params.homeTeam, params.homeTeamLogo, params.league, params.matchId, params.minute, params.sport, params.startDate, params.status, params.statusDetail]);
  const paramBucket = paramCanonical?.status === "live"
    ? "live"
    : paramCanonical?.status === "finished"
      ? "finished"
      : "upcoming";
  const espnSport = "soccer";
  const likelyInternationalFromParams = useMemo(() => {
    const rawLeague = normalizeLeague(params.league);
    if (/friendly|friendlies|international|fifa|nations|world cup|euro/.test(rawLeague)) return true;
    return hasCountryLogo(params.homeTeamLogo) && hasCountryLogo(params.awayTeamLogo);
  }, [params.awayTeamLogo, params.homeTeamLogo, params.league]);

  const espnLeague = useMemo(() => {
    const direct = String(params.espnLeague || "").trim();
    if (direct) return direct;
    if (likelyInternationalFromParams) return "fifa.world";
    const map: Record<string, string> = {
      "Premier League": "eng.1",
      "Championship": "eng.2",
      "FA Cup": "eng.fa",
      "UEFA Champions League": "uefa.champions",
      "UEFA Europa League": "uefa.europa",
      "UEFA Conference League": "uefa.europa.conf",
      "La Liga": "esp.1",
      "La Liga 2": "esp.2",
      "Copa del Rey": "esp.copa_del_rey",
      "Bundesliga": "ger.1",
      "2. Bundesliga": "ger.2",
      "DFB Pokal": "ger.dfb_pokal",
      "Jupiler Pro League": "bel.1",
      "Challenger Pro League": "bel.2",
      "Belgian Cup": "bel.cup",
      "Ligue 1": "fra.1",
      "Ligue 2": "fra.2",
      "Coupe de France": "fra.coupe_de_france",
      "Serie A": "ita.1",
      "Serie B": "ita.2",
      "Coppa Italia": "ita.coppa_italia",
      "Eredivisie": "ned.1",
      "Eerste Divisie": "ned.2",
      "KNVB Beker": "ned.knvb_beker",
    };
    return map[params.league] || "eng.1";
  }, [likelyInternationalFromParams, params.espnLeague, params.league]);
  const {
    data: streamData,
    isLoading: _streamLoading,
    error: streamFetchError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: sportKeys.matchStream({ matchId: params.matchId, espnLeague }),
    placeholderData: () => cachePeekStale<any>(`sports:match-stream:${params.matchId}:${espnLeague}`) || undefined,
    queryFn: async () => {
      const key = `sports:match-stream:${params.matchId}:${espnLeague}`;
      const stale = await cacheGetStale<any>(key);
      try {
        const payload = await getMatchStream({ matchId: params.matchId, league: espnLeague });
        cacheSet(key, payload, 60_000);
        return payload;
      } catch {
        return stale || {};
      }
    },
    enabled: !!params.matchId && paramBucket === "live",
    staleTime: 60_000,
    retry: shouldRetryRequest,
    refetchOnMount: false,
  });
  const _rawStreamUrl = streamData?.url || ""; void _streamLoading;
  const streamUrl = (() => {
    if (!_rawStreamUrl) return `https://embedme.top/embed/alpha/${params.matchId}/1`;
    const u = _rawStreamUrl.toLowerCase();
    if (
      u.includes("google.") || u.includes("bing.com") || u.includes("yahoo.com") ||
      u.includes("search?q=") || u.includes("/search?") || u.includes("duckduckgo.")
    ) return `https://embedme.top/embed/alpha/${params.matchId}/1`;
    if (!u.startsWith("http://") && !u.startsWith("https://")) return `https://embedme.top/embed/alpha/${params.matchId}/1`;
    return _rawStreamUrl;
  })();
  const streamApiError = normalizeApiError(streamFetchError || streamData?.error || null);
  const streamPlayerError = normalizeApiError(streamWebError);
  const hasStreamApiIssue = Boolean(streamFetchError || streamData?.error);
  const hasStreamPlayerIssue = Boolean(streamWebError);

  const { data: matchDetail, isLoading: detailLoading } = useQuery({
    queryKey: sportKeys.matchDetail({ matchId: params.matchId, espnLeague, sport: espnSport }),
    placeholderData: () => cachePeekStale<any>(`sports:match-detail:${params.matchId}:${espnLeague}`) || undefined,
    queryFn: async () => {
      const key = `sports:match-detail:${params.matchId}:${espnLeague}`;
      const stale = await cacheGetStale<any>(key);
      try {
        const payload = await getMatchDetailRaw({ matchId: params.matchId, sport: espnSport, league: espnLeague });
        cacheSet(key, payload, CacheTTL.MATCH_DETAIL);
        return payload;
      } catch (error) {
        if (stale) return stale;
        throw error;
      }
    },
    enabled: true,
    // Poll only while match is effectively live.
    refetchInterval: (query: any) => {
      const payload = query?.state?.data;
      const bucket = resolveMatchBucket({
        status: payload?.status ?? params.status,
        detail: payload?.statusDetail ?? payload?.status ?? params.statusDetail,
        minute: payload?.minute ?? params.minute,
        homeScore: payload?.homeScore ?? params.homeScore,
        awayScore: payload?.awayScore ?? params.awayScore,
        startDate: payload?.startDate ?? params.startDate,
      });
      return bucket === "live" ? 10000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: paramBucket === "live" ? 4000 : 30000,
    retry: shouldRetryRequest,
    refetchOnMount: false,
  });

  const detailCanonical = useMemo(() => toCanonicalMatch(matchDetail), [matchDetail]);
  const effectiveCanonical = detailCanonical || paramCanonical;

  const isLive = effectiveCanonical?.status === "live";
  const isFinished = effectiveCanonical?.status === "finished";
  const isPostponed = effectiveCanonical?.status === "postponed" || effectiveCanonical?.status === "cancelled";
  const statusText = String(effectiveCanonical?.statusDetail || matchDetail?.status || params.status || "").toLowerCase();
  const isHalfTime = isLive && (statusText.includes("ht") || statusText.includes("half"));

  const liveHomeScore = effectiveCanonical?.homeScore ?? Number(params.homeScore ?? 0);
  const liveAwayScore = effectiveCanonical?.awayScore ?? Number(params.awayScore ?? 0);
  const liveMinute = effectiveCanonical?.minute ?? (params.minute ? parseInt(params.minute) : undefined);
  const competitionInsightsQuery = useQuery({
    queryKey: sportKeys.competitionInsights({ leagueName: params.league, espnLeague, sport: espnSport }),
    queryFn: () => getCompetitionInsights({ leagueName: params.league, espnLeague, sport: espnSport }),
    enabled: Boolean(espnLeague || params.league),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  // AI Prediction
  const requestPrediction = async (mode: "prematch" | "live") => {
    const homeTag = normalizeTeamName(params.homeTeam);
    const awayTag = normalizeTeamName(params.awayTeam);

    const insightPayload = competitionInsightsQuery.data || await getCompetitionInsights({
      leagueName: params.league,
      espnLeague,
      sport: espnSport,
    });

    const standings: any[] = Array.isArray(insightPayload?.standings) ? insightPayload.standings : [];
    const scorers: any[] = Array.isArray(insightPayload?.topScorers) ? insightPayload.topScorers : [];
    const assisters: any[] = Array.isArray(insightPayload?.topAssists) ? insightPayload.topAssists : [];

    const matchStanding = (teamName?: string) => {
      const teamKey = normalizeTeamName(teamName);
      if (!teamKey) return null;
      return standings.find((row: any) => {
        const rowTeam = normalizeTeamName(row?.team);
        return rowTeam === teamKey || rowTeam.includes(teamKey) || teamKey.includes(rowTeam);
      }) || null;
    };

    const homeStanding = matchStanding(params.homeTeam);
    const awayStanding = matchStanding(params.awayTeam);

    const topByTeam = (tag: string, rows: any[], scoreKey: "goals" | "assists") => rows
      .filter((row: any) => {
        const team = normalizeTeamName(row?.team);
        return team === tag || team.includes(tag) || tag.includes(team);
      })
      .sort((a: any, b: any) => Number(b?.[scoreKey] || b?.displayValue || 0) - Number(a?.[scoreKey] || a?.displayValue || 0))[0] || null;

    const homeTopScorer = homeTag ? topByTeam(homeTag, scorers, "goals") : null;
    const awayTopScorer = awayTag ? topByTeam(awayTag, scorers, "goals") : null;
    const homeTopAssist = homeTag ? topByTeam(homeTag, assisters, "assists") : null;
    const awayTopAssist = awayTag ? topByTeam(awayTag, assisters, "assists") : null;

    const isLiveMode = mode === "live";
    const isInternationalContext = /fifa|nations|international|friendly|euro|world cup|wereldkampioenschap/i.test(`${espnLeague} ${params.league || ""}`);
    const homeLineupPlayers = Array.isArray(homeLineupTeam?.players) ? homeLineupTeam.players.length : 0;
    const awayLineupPlayers = Array.isArray(awayLineupTeam?.players) ? awayLineupTeam.players.length : 0;
    const homeLineupCertainty = homeLineupTeam?.lineupType === "official" ? 0.95 : (homeLineupPlayers >= 11 ? 0.72 : 0.5);
    const awayLineupCertainty = awayLineupTeam?.lineupType === "official" ? 0.95 : (awayLineupPlayers >= 11 ? 0.72 : 0.5);

    return buildGroundedMatchAnalysis({
      matchId: String(params.matchId || ""),
      homeTeam: String(params.homeTeam || "Home"),
      awayTeam: String(params.awayTeam || "Away"),
      competition: String(params.league || espnLeague || ""),
      competitionContext: String(params.league || espnLeague || ""),
      isInternational: isInternationalContext,
      isLive: isLiveMode,
      status: effectiveCanonical?.status || params.status || null,
      minute: isLiveMode ? liveMinute ?? null : null,
      homeScore: Number(isLiveMode ? liveHomeScore ?? 0 : params.homeScore ?? 0),
      awayScore: Number(isLiveMode ? liveAwayScore ?? 0 : params.awayScore ?? 0),
      stats: {
        home: isLiveMode ? (matchDetail?.homeStats || {}) : {},
        away: isLiveMode ? (matchDetail?.awayStats || {}) : {},
      },
      events: isLiveMode && Array.isArray(matchDetail?.keyEvents) ? matchDetail.keyEvents.slice(0, 25) : [],
      home: {
        rank: homeStanding?.rank ?? null,
        points: homeStanding?.points ?? null,
        goalDiff: homeStanding?.goalDiff ?? null,
        recentForm: homeStanding?.form ?? homeStanding?.recentForm ?? null,
        goalsFor: homeStanding?.goalsFor ?? homeStanding?.gf ?? null,
        goalsAgainst: homeStanding?.goalsAgainst ?? homeStanding?.ga ?? null,
        cleanSheets: homeStanding?.cleanSheets ?? null,
        gamesPlayed: homeStanding?.played ?? homeStanding?.gamesPlayed ?? null,
        homeFormPts: homeStanding?.homePoints ?? homeStanding?.homeFormPts ?? null,
        awayFormPts: homeStanding?.awayPoints ?? homeStanding?.awayFormPts ?? null,
        topScorer: homeTopScorer?.name || null,
        topScorerGoals: homeTopScorer?.goals ?? null,
        topAssist: homeTopAssist?.name || null,
        topAssistCount: (homeTopAssist?.assists ?? Number(homeTopAssist?.displayValue || 0)) || null,
        formation: homeLineupTeam?.formation || null,
        lineupStrength: Math.min(1, homeLineupPlayers / 11),
        lineupCertainty: homeLineupCertainty,
      },
      away: {
        rank: awayStanding?.rank ?? null,
        points: awayStanding?.points ?? null,
        goalDiff: awayStanding?.goalDiff ?? null,
        recentForm: awayStanding?.form ?? awayStanding?.recentForm ?? null,
        goalsFor: awayStanding?.goalsFor ?? awayStanding?.gf ?? null,
        goalsAgainst: awayStanding?.goalsAgainst ?? awayStanding?.ga ?? null,
        cleanSheets: awayStanding?.cleanSheets ?? null,
        gamesPlayed: awayStanding?.played ?? awayStanding?.gamesPlayed ?? null,
        homeFormPts: awayStanding?.homePoints ?? awayStanding?.homeFormPts ?? null,
        awayFormPts: awayStanding?.awayPoints ?? awayStanding?.awayFormPts ?? null,
        topScorer: awayTopScorer?.name || null,
        topScorerGoals: awayTopScorer?.goals ?? null,
        topAssist: awayTopAssist?.name || null,
        topAssistCount: (awayTopAssist?.assists ?? Number(awayTopAssist?.displayValue || 0)) || null,
        formation: awayLineupTeam?.formation || null,
        lineupStrength: Math.min(1, awayLineupPlayers / 11),
        lineupCertainty: awayLineupCertainty,
      },
    });
  };

  const {
    data: preMatchPrediction,
    isPending: preMatchLoading,
    mutate: fetchPreMatchPrediction,
  } = useMutation({
    mutationFn: () => requestPrediction("prematch"),
  });

  const {
    data: livePrediction,
    isPending: livePredictionLoading,
    mutate: fetchLivePrediction,
  } = useMutation({
    mutationFn: () => requestPrediction("live"),
  });

  const prematchInsightEnabled = !isLive && !isFinished;
  const liveInsightEnabled = isLive || isHalfTime;
  const prediction = liveInsightEnabled ? livePrediction : prematchInsightEnabled ? preMatchPrediction : null;
  const predLoading = liveInsightEnabled
    ? Boolean(livePredictionLoading && !livePrediction)
    : prematchInsightEnabled
      ? Boolean(preMatchLoading && !preMatchPrediction)
      : false;

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((current) => (current[tab] ? current : { ...current, [tab]: true }));
    SafeHaptics.impactLight();
  };

  const handleRetryAutoStream = async () => {
    SafeHaptics.impactLight();
    setStreamWebError(null);
    setStreamErrorRef("");
    await refetchStream();
    setStreamKey(k => k + 1);
  };

  const handleExperienceScroll = useMemo(() => {
    return (event: any) => {
      const y = Number(event?.nativeEvent?.contentOffset?.y || 0);
      const next = y > 44;
      setIsHeaderCollapsed((prev) => (prev === next ? prev : next));
    };
  }, []);

  const hasFetchedPrematchRef = useRef(false);
  const lastLivePredictionSignatureRef = useRef("");

  useEffect(() => {
    if (!prematchInsightEnabled) return;
    if (!detailLoading && !hasFetchedPrematchRef.current && !preMatchLoading) {
      hasFetchedPrematchRef.current = true;
      const t = setTimeout(() => fetchPreMatchPrediction(), 700);
      return () => clearTimeout(t);
    }
  }, [detailLoading, fetchPreMatchPrediction, preMatchLoading, prematchInsightEnabled]);

  useEffect(() => {
    if (!liveInsightEnabled || detailLoading) return;

    fetchLivePrediction();
    const id = setInterval(() => {
      fetchLivePrediction();
    }, 12_000);

    return () => clearInterval(id);
  }, [detailLoading, fetchLivePrediction, liveInsightEnabled, matchDetail?.homeScore, matchDetail?.awayScore, matchDetail?.minute, matchDetail?.statusDetail]);

  useEffect(() => {
    if (!liveInsightEnabled) return;
    if (detailLoading || livePredictionLoading) return;
    const signature = [
      String(params.matchId || ""),
      String(liveMinute ?? ""),
      String(liveHomeScore ?? ""),
      String(liveAwayScore ?? ""),
      String(Array.isArray(matchDetail?.keyEvents) ? matchDetail.keyEvents.length : 0),
    ].join(":");
    if (signature === lastLivePredictionSignatureRef.current) return;
    lastLivePredictionSignatureRef.current = signature;
    const t = setTimeout(() => fetchLivePrediction(), livePrediction ? 250 : 700);
    return () => clearTimeout(t);
  }, [
    detailLoading,
    fetchLivePrediction,
    isHalfTime,
    isLive,
    liveAwayScore,
    liveHomeScore,
    liveInsightEnabled,
    liveMinute,
    livePrediction,
    livePredictionLoading,
    matchDetail?.keyEvents,
    params.matchId,
  ]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const scoreFontSize = screenWidth < 350 ? 40 : screenWidth < 385 ? 44 : 48;
  const timelineEvents = useMemo(
    () => (Array.isArray(matchDetail?.timeline) ? matchDetail.timeline : []),
    [matchDetail?.timeline],
  );
  const orderedLineupTeams = useMemo(
    () => orderLineupTeams(matchDetail?.starters || [], String(params.homeTeam || ""), String(params.awayTeam || "")),
    [matchDetail?.starters, params.homeTeam, params.awayTeam]
  );
  const homeLineupTeam = orderedLineupTeams[0] || null;
  const awayLineupTeam = orderedLineupTeams[1] || null;
  const rawCompetitionName = safeStr(effectiveCanonical?.league || matchDetail?.competition || matchDetail?.league || params.league);
  const likelyInternational = useMemo(() => {
    if (/fifa\.|uefa\.nations|international|friendly|friendlies|world cup|euro/i.test(espnLeague)) return true;
    const normalized = normalizeLeague(rawCompetitionName);
    if (/friendly|friendlies|international|fifa|nations|world cup|euro/.test(normalized)) return true;
    return (hasCountryLogo(matchDetail?.homeTeamLogo || params.homeTeamLogo) && hasCountryLogo(matchDetail?.awayTeamLogo || params.awayTeamLogo));
  }, [espnLeague, matchDetail?.awayTeamLogo, matchDetail?.homeTeamLogo, params.awayTeamLogo, params.homeTeamLogo, rawCompetitionName]);
  const competitionName = useMemo(() => {
    const normalized = normalizeLeague(rawCompetitionName);
    if (likelyInternational && (!rawCompetitionName || looksDomesticCompetition(normalized))) {
      return "International Friendly";
    }
    return rawCompetitionName || (likelyInternational ? "International Friendly" : "Competition");
  }, [likelyInternational, rawCompetitionName]);
  const competitionBrand = useMemo(
    () => resolveCompetitionBrand({ name: competitionName, espnLeague }),
    [competitionName, espnLeague],
  );
  const leagueLogoUri = competitionBrand.logo as string | null;
  const homeTeamName = safeStr(matchDetail?.homeTeam || params.homeTeam || "Home");
  const awayTeamName = safeStr(matchDetail?.awayTeam || params.awayTeam || "Away");
  const kickoffRaw = safeStr(matchDetail?.startDate || matchDetail?.date || effectiveCanonical?.startDate || "");
  const kickoffTs = Date.parse(kickoffRaw);
  const hasKickoffDate = Number.isFinite(kickoffTs);
  const kickoffDate = (() => {
    if (!hasKickoffDate) return "";
    try {
      return new Intl.DateTimeFormat("nl-BE", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(kickoffTs));
    } catch {
      return "";
    }
  })();
  const kickoffTime = (() => {
    if (!hasKickoffDate) {
      const hm = kickoffRaw.match(/(\d{1,2}:\d{2})/);
      return hm?.[1] || "";
    }
    try {
      return new Intl.DateTimeFormat("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(kickoffTs));
    } catch {
      return "";
    }
  })();
  const kickoffConfirmed = kickoffTime.length > 0;
  const highlightSummary = matchDetail?.highlights || null;
  const highlightMoments = Array.isArray(highlightSummary?.topMoments) ? highlightSummary.topMoments : [];
  const highlightRecap = Array.isArray(highlightSummary?.recap) ? highlightSummary.recap : [];
  const redesignEnabled = String(params.initialTab || "") !== "legacy";
  const orderedTimelineEvents = useMemo(() => sortTimelineForRender(timelineEvents), [timelineEvents]);
  const timelineProgressMinute = Math.max(0, Math.min(120, Number(liveMinute || 0)));
  const timelineProgressPct = Math.max(0, Math.min(100, Math.round((timelineProgressMinute / 90) * 100)));
  const timelineEventCounts = useMemo(() => {
    return orderedTimelineEvents.reduce((acc, event: any) => {
      const kind = String(event?.kind || event?.type || "").toLowerCase();
      if (kind.includes("goal")) acc.goals += 1;
      if (kind.includes("yellow")) acc.yellow += 1;
      if (kind.includes("red")) acc.red += 1;
      if (kind.includes("sub") || kind.includes("substitut")) acc.subs += 1;
      if (kind.includes("pen") || kind.includes("penalty")) acc.penalties += 1;
      return acc;
    }, { goals: 0, yellow: 0, red: 0, subs: 0, penalties: 0 });
  }, [orderedTimelineEvents]);
  const predictionError = Boolean((prediction as any)?.error);
  const safePrediction = prediction && !predictionError ? prediction : null;
  const predictionMatchId = String(params.matchId || effectiveCanonical?.id || `${params.homeTeam}-${params.awayTeam}-${params.startDate || ""}`);
  const predictionUnlocked = hasPremium || isPredictionUnlocked(predictionMatchId);
  const handleUnlockPrediction = async () => {
    if (hasPremium || predictionUnlocked) return;
    if (!predictionMatchId) return;
    if (dailyPredictionUnlocksRemaining <= 0) {
      Alert.alert(
        "Premium vereist",
        "Je gratis dagelijkse unlock is opgebruikt. Upgrade naar Premium om alle Match Intelligence direct te openen.",
        [
          { text: "Annuleren", style: "cancel" },
          { text: "Bekijk Premium", onPress: () => router.push("/premium") },
        ]
      );
      return;
    }

    try {
      setRewardedAdRunning(true);
      const rewarded = await showRewardedUnlockAd();
      if (!rewarded) return;
      await unlockPredictionWithRewardedAd(predictionMatchId);
      Alert.alert("Unlocked", "Nexora Match Intelligence is voor deze wedstrijd ontgrendeld.");
    } catch {
      Alert.alert("Unlock mislukt", "De rewarded unlock kon niet worden voltooid. Probeer opnieuw.");
    } finally {
      setRewardedAdRunning(false);
    }
  };
  const formCards = [
    { key: "home-form", label: `${homeTeamName} form`, value: safePrediction?.formHome || "- - - - -" },
    { key: "away-form", label: `${awayTeamName} form`, value: safePrediction?.formAway || "- - - - -" },
  ];
  const homePct = Math.max(0, Math.min(100, Number(safePrediction?.homePct || 0)));
  const drawPct = Math.max(0, Math.min(100, Number(safePrediction?.drawPct || 0)));
  const awayPct = Math.max(0, Math.min(100, Number(safePrediction?.awayPct || 0)));
  const normalizedTotal = homePct + drawPct + awayPct;
  const normHomePct = normalizedTotal > 0 ? Math.round((homePct / normalizedTotal) * 100) : 34;
  const normDrawPct = normalizedTotal > 0 ? Math.round((drawPct / normalizedTotal) * 100) : 33;
  const normAwayPct = 100 - normHomePct - normDrawPct;

  const homeDcPct = Number.isFinite(Number(safePrediction?.doubleChanceHomePct))
    ? Math.round(Number(safePrediction?.doubleChanceHomePct))
    : Math.max(normHomePct, Math.round(normHomePct + normDrawPct * 0.6));
  const awayDcPct = Number.isFinite(Number(safePrediction?.doubleChanceAwayPct))
    ? Math.round(Number(safePrediction?.doubleChanceAwayPct))
    : Math.max(normAwayPct, Math.round(normAwayPct + normDrawPct * 0.6));
  const bttsPct = Number.isFinite(Number(safePrediction?.bothTeamsToScorePct))
    ? Math.round(Number(safePrediction?.bothTeamsToScorePct))
    : 50;
  const over25Pct = Number.isFinite(Number(safePrediction?.over25Pct))
    ? Math.round(Number(safePrediction?.over25Pct))
    : 50;
  const under25Pct = 100 - over25Pct;
  const over15Pct = Math.max(35, Math.min(92, over25Pct + 16));
  const under35Pct = Math.max(22, Math.min(86, under25Pct + 18));
  const confidencePct = Math.max(0, Math.min(100, Number(safePrediction?.confidence || 0)));
  const edgeScorePct = Math.max(0, Math.min(100, Number(safePrediction?.edgeScore || 0)));

  const predictionSummaryCards = [
    { key: "optimal", label: "Optimal", value: safePrediction?.tip || safePrediction?.prediction || "No pick yet", accent: "#E50914", locked: false },
    { key: "winner", label: "Match winner", value: safePrediction?.prediction || "Pending", accent: "#FF5A5F", locked: false },
    { key: "double", label: "Double chance", value: `${homeDcPct}% 1X · ${awayDcPct}% X2`, accent: "#F04B3A", locked: false },
    { key: "btts", label: "Both teams score", value: `${bttsPct}%`, accent: "#D9462A", locked: false },
    { key: "ou", label: "Over/Under", value: `Over 2.5: ${over25Pct}%`, accent: "#B83C2A", locked: false },
  ];

  const detailedInfoRows = [
    { key: "one", label: "1", value: `${normHomePct}%` },
    { key: "draw", label: "X", value: `${normDrawPct}%` },
    { key: "two", label: "2", value: `${normAwayPct}%` },
    { key: "oneX", label: "1X", value: `${homeDcPct}%` },
    { key: "xTwo", label: "X2", value: `${awayDcPct}%` },
    { key: "goals", label: "Goals", value: `O2.5 ${over25Pct}%` },
  ];

  const successDataCoverage = Math.round(
    [safePrediction?.homePct, safePrediction?.drawPct, safePrediction?.awayPct, safePrediction?.confidence, safePrediction?.over25Pct, safePrediction?.bothTeamsToScorePct]
      .filter((value) => value !== null && value !== undefined).length / 6 * 100
  );
  const successSignalStrength = Math.max(40, Math.round((confidencePct * 0.65) + (edgeScorePct * 0.35)));

  if (redesignEnabled) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={["#111521", "#0B0F1A", "#080B12"]}
          style={[styles.header, styles.nxHeader, { paddingTop: topPad + 8 }, isHeaderCollapsed ? styles.nxHeaderCollapsed : null]}
        >
          <View style={styles.heroTopRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            {(isLive || isHalfTime) ? (
              <View style={styles.nxLiveGlowPill}>
                <View style={styles.nxLiveDot} />
                <Text style={styles.nxLiveText}>{isHalfTime ? "HALF TIME" : `LIVE ${liveMinute ? `${liveMinute}'` : ""}`}</Text>
              </View>
            ) : (
              <View style={styles.nxUpcomingPill}>
                <Text style={styles.nxUpcomingText}>{isFinished ? "FINISHED" : "UPCOMING"}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.heroActionBtn}
              onPress={() => {
                SafeHaptics.impactLight();
                router.push("/follow-center");
              }}
            >
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={[styles.matchHeader, isHeaderCollapsed ? styles.nxMatchHeaderCollapsed : null]}>
            <View style={styles.competitionRowCenterOnly}>
              <View style={styles.competitionCenter}>
                {leagueLogoUri ? (
                  <TeamLogo uri={leagueLogoUri} teamName={competitionName} size={isHeaderCollapsed ? 20 : 24} />
                ) : (
                  <View style={styles.leagueFallbackIcon}>
                    <Ionicons name="trophy-outline" size={14} color={COLORS.textMuted} />
                  </View>
                )}
                <Text style={styles.leagueName} numberOfLines={1}>{competitionBrand.name || competitionName}</Text>
              </View>
            </View>

            <View style={styles.scoreRow}>
              <TeamSide
                name={homeTeamName}
                logo={matchDetail?.homeTeamLogo || params.homeTeamLogo}
                onPress={() => {
                  const fallbackTeamId = `name:${encodeURIComponent(homeTeamName || "")}`;
                  router.push({
                    pathname: "/team-detail",
                    params: {
                      teamId: matchDetail?.homeTeamId || fallbackTeamId,
                      teamName: homeTeamName,
                      logo: matchDetail?.homeTeamLogo || params.homeTeamLogo || "",
                      sport: espnSport,
                      league: espnLeague,
                    },
                  });
                }}
              />
              <View style={styles.scoreCenter}>
                {(isLive || isHalfTime || isFinished) ? (
                  <Text style={[styles.score, { fontSize: isHeaderCollapsed ? Math.max(34, scoreFontSize - 10) : scoreFontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {liveHomeScore} - {liveAwayScore}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.scheduledDate} numberOfLines={1}>{kickoffDate || "Datum volgt"}</Text>
                    <Text style={styles.vsText}>VS</Text>
                    <Text style={styles.scheduledTime} numberOfLines={1}>{kickoffTime || "--:--"}</Text>
                  </>
                )}
              </View>
              <TeamSide
                name={awayTeamName}
                logo={matchDetail?.awayTeamLogo || params.awayTeamLogo}
                onPress={() => {
                  const fallbackTeamId = `name:${encodeURIComponent(awayTeamName || "")}`;
                  router.push({
                    pathname: "/team-detail",
                    params: {
                      teamId: matchDetail?.awayTeamId || fallbackTeamId,
                      teamName: awayTeamName,
                      logo: matchDetail?.awayTeamLogo || params.awayTeamLogo || "",
                      sport: espnSport,
                      league: espnLeague,
                    },
                  });
                }}
              />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.nxTabBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nxTabBarInner}>
            {EXPERIENCE_TABS.map((tab) => {
              const active = activeExperienceTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    setActiveExperienceTab(tab.id);
                    SafeHaptics.impactLight();
                  }}
                  style={styles.nxTabItem}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.nxTabLabel, active ? styles.nxTabLabelActive : null]}>{tab.label}</Text>
                  <View style={[styles.nxTabUnderline, active ? styles.nxTabUnderlineActive : null]} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {activeExperienceTab === "prematch" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.nxCard}>
              <Text style={styles.nxCardKicker}>Prematch</Text>
              <Text style={styles.nxCardTitle}>Match Context</Text>
              <View style={styles.nxMetaRow}>
                <Ionicons name="calendar-outline" size={14} color="#8F98AE" />
                <Text style={styles.nxMetaText}>{kickoffDate || "Datum volgt"} · {kickoffTime || "--:--"}</Text>
              </View>
              {!!matchDetail?.venue && (
                <View style={styles.nxMetaRow}>
                  <Ionicons name="location-outline" size={14} color="#8F98AE" />
                  <Text style={styles.nxMetaText}>{matchDetail.venue}</Text>
                </View>
              )}
            </View>

            {safePrediction ? (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>AI Match Summary</Text>
                <Text style={styles.nxCardTitle}>{safePrediction.prediction || "No prediction yet"}</Text>
                <Text style={styles.nxBodyText}>{safePrediction.summary || tFn("matchDetail.preMatchLoading")}</Text>
                {!predictionUnlocked ? <Text style={[styles.nxMetaText, { marginTop: 12 }]}>Unlock resterend vandaag: {dailyPredictionUnlocksRemaining}</Text> : null}
              </View>
            ) : (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>AI Read</Text>
                {predLoading ? (
                  <View style={styles.prematchInsightLoading}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={styles.aiLoadingText}>{tFn("matchDetail.preMatchLoading")}</Text>
                  </View>
                ) : (
                  <Text style={styles.nxBodyText}>Prediction wordt opgebouwd op basis van recente vorm, context en teamdata.</Text>
                )}
              </View>
            )}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "predictions" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.nxSectionHeadRow}>
              <Text style={styles.nxSectionTitle}>AI Predictions</Text>
              <TouchableOpacity style={styles.aiRefreshBtn} onPress={() => liveInsightEnabled ? fetchLivePrediction() : fetchPreMatchPrediction()}>
                <Ionicons name="refresh-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.aiRefreshText}>{liveInsightEnabled ? "Live refresh" : tFn("matchDetail.preMatchRefresh")}</Text>
              </TouchableOpacity>
            </View>

            {!safePrediction ? (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>Nexora Match Intelligence</Text>
                {predLoading ? (
                  <View style={styles.prematchInsightLoading}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={styles.aiLoadingText}>{tFn("matchDetail.preMatchLoading")}</Text>
                  </View>
                ) : (
                  <Text style={styles.nxBodyText}>Het model verwerkt vorm, live context, line-up zekerheid en league signalen.</Text>
                )}
              </View>
            ) : null}

            {safePrediction ? (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>{liveInsightEnabled ? "Live AI coach" : "AI Match Summary"}</Text>
                <Text style={styles.nxCardTitle}>{safePrediction.prediction || "Model updating"}</Text>
                <Text style={styles.nxBodyText}>{safePrediction.live_shift_summary || safePrediction.summary || "AI is analyzing the match context."}</Text>
                <View style={[styles.nxMetaRow, { marginTop: 12 }]}> 
                  <Ionicons name="sparkles-outline" size={14} color="#8F98AE" />
                  <Text style={styles.nxMetaText}>{safePrediction.tip || "No primary angle yet"}</Text>
                </View>
              </View>
            ) : null}

            {safePrediction && !predictionUnlocked ? (
              <View style={styles.nxLockedCard}>
                <Text style={styles.nxGridLabel}>Unlock Match Intelligence</Text>
                <Text style={styles.nxBodyText}>Open winnaar-kansen, BTTS, O/U-lijnen, clean sheets, upset-risk en live momentum voor deze match.</Text>
                <View style={[styles.nxGridWrap, { marginTop: 14 }]}> 
                  <View style={styles.nxGridCard}>
                    <Text style={styles.nxGridLabel}>Winner lean</Text>
                    <Text style={styles.nxGridValue}>{safePrediction.prediction}</Text>
                  </View>
                  <View style={styles.nxGridCard}>
                    <Text style={styles.nxGridLabel}>Confidence</Text>
                    <Text style={styles.nxGridValue}>{confidencePct}%</Text>
                  </View>
                </View>
                <BlurView intensity={45} tint="dark" style={styles.nxLockOverlay}>
                  <Ionicons name="lock-closed" size={18} color="#E50914" />
                  <Text style={styles.nxLockText}>Premium intelligence locked</Text>
                </BlurView>
                <TouchableOpacity
                  style={[styles.aiRefreshBtn, { alignSelf: "flex-start", marginTop: 16, borderColor: "#E50914" }]}
                  onPress={handleUnlockPrediction}
                  disabled={rewardedAdRunning}
                >
                  <Ionicons name={rewardedAdRunning ? "hourglass-outline" : "play-circle-outline"} size={14} color="#FFFFFF" />
                  <Text style={[styles.aiRefreshText, { color: "#FFFFFF" }]}>
                    {rewardedAdRunning ? "Unlocking..." : `Unlock via ad (${dailyPredictionUnlocksRemaining} left)`}
                  </Text>
                </TouchableOpacity>
                {!hasPremium ? (
                  <TouchableOpacity
                    style={[styles.aiRefreshBtn, { alignSelf: "flex-start", marginTop: 12 }]}
                    onPress={() => router.push("/premium")}
                  >
                    <Ionicons name="diamond-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.aiRefreshText}>Bekijk Premium</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {safePrediction && predictionUnlocked ? (
              <>
                <Text style={styles.nxSectionTitle}>Outcome Probabilities</Text>
                <View style={styles.nxGridWrap}>
                  {predictionSummaryCards.map((card) => (
                    <View key={card.key} style={[styles.nxGridCard, { borderColor: `${card.accent}44` }]}> 
                      <Text style={styles.nxGridLabel}>{card.label}</Text>
                      <Text style={[styles.nxGridValue, { color: card.accent }]} numberOfLines={2}>{card.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.nxGridWrap}>
                  {detailedInfoRows.map((row) => (
                    <View key={row.key} style={styles.nxGridCard}>
                      <Text style={styles.nxGridLabel}>{row.label}</Text>
                      <Text style={styles.nxGridValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.nxSectionTitle}>Smart Markets</Text>
                <View style={styles.nxGoalsCard}>
                  <Text style={styles.nxCardKicker}>Goals grid</Text>
                  <View style={styles.nxGoalsGrid}>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>Over 1.5 · {over15Pct}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>Over 2.5 · {over25Pct}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>Under 2.5 · {under25Pct}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>Under 3.5 · {under35Pct}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>BTTS · {bttsPct}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>Clean sheet {homeTeamName} · {Math.round(Number(safePrediction.cleanSheetHomePct || 0))}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>Clean sheet {awayTeamName} · {Math.round(Number(safePrediction.cleanSheetAwayPct || 0))}%</Text></View>
                    <View style={styles.nxGoalPill}><Text style={styles.nxGoalPillText}>First to score · {safePrediction.firstTeamToScore} {Math.round(Number(safePrediction.firstTeamToScorePct || 0))}%</Text></View>
                  </View>
                </View>

                <Text style={styles.nxSectionTitle}>Risk Factors</Text>
                <View style={styles.nxGridWrap}>
                  {(safePrediction.riskFactors || []).slice(0, 4).map((risk: any, index: number) => (
                    <View key={`${risk?.label || "risk"}-${index}`} style={styles.nxGridCard}>
                      <Text style={styles.nxGridLabel}>{risk?.label || "Risk"}</Text>
                      <Text style={styles.nxGridValue}>{Math.round(Number(risk?.impact || 0))}/100</Text>
                      <Text style={styles.nxMetaText}>{risk?.tone || "warning"}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.nxSectionTitle}>Confidence Meter</Text>
                <View style={styles.nxCard}>
                  <Text style={styles.nxCardKicker}>Model confidence</Text>
                  <Text style={styles.nxCardTitle}>{confidencePct}% · {safePrediction.confidence_label || safePrediction.riskLevel}</Text>
                  <View style={styles.nxTimelineTrack}>
                    <View style={[styles.nxTimelineFill, { width: `${confidencePct}%` }]} />
                  </View>
                  <View style={[styles.nxGridWrap, { marginTop: 16 }]}> 
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Edge</Text><Text style={styles.nxGridValue}>{edgeScorePct}/100</Text></View>
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Draw risk</Text><Text style={styles.nxGridValue}>{Math.round(Number(safePrediction.scoreDrawRiskPct || 0))}%</Text></View>
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Upset risk</Text><Text style={styles.nxGridValue}>{Math.round(Number(safePrediction.upsetProbabilityPct || 0))}%</Text></View>
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Pressure</Text><Text style={styles.nxGridValue}>{Math.round(Number(safePrediction.pressureIndex || 0))}/100</Text></View>
                  </View>
                </View>

                <Text style={styles.nxSectionTitle}>Live Momentum</Text>
                <View style={styles.nxCard}>
                  <Text style={styles.nxCardKicker}>Flow state</Text>
                  <Text style={styles.nxCardTitle}>{safePrediction.momentum || "Balanced"} · {safePrediction.danger || "Balanced"}</Text>
                  <Text style={styles.nxBodyText}>{safePrediction.live_shift_summary || safePrediction.matchPattern || "Momentum updates zodra live events binnenkomen."}</Text>
                  <View style={[styles.nxGridWrap, { marginTop: 16 }]}> 
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>xG</Text><Text style={styles.nxGridValue}>{Number(safePrediction.xgHome || 0).toFixed(1)} - {Number(safePrediction.xgAway || 0).toFixed(1)}</Text></View>
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Momentum</Text><Text style={styles.nxGridValue}>{Math.round(Number(safePrediction.momentumScore || 0))}/100</Text></View>
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Attacking strength</Text><Text style={styles.nxGridValue}>{Math.round(Number(safePrediction.attackingStrength?.home || 0))} - {Math.round(Number(safePrediction.attackingStrength?.away || 0))}</Text></View>
                    <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>Forms</Text><Text style={styles.nxGridValue}>{formCards[0]?.value} / {formCards[1]?.value}</Text></View>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "stats" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.nxSectionTitle}>Stats</Text>
            {detailLoading ? (
              <LoadingState />
            ) : matchDetail ? (
              <>
                <StatsBars
                  homeTeam={params.homeTeam}
                  awayTeam={params.awayTeam}
                  homeStats={matchDetail.homeStats || {}}
                  awayStats={matchDetail.awayStats || {}}
                />
                <MatchHeatmap
                  homeTeam={params.homeTeam}
                  awayTeam={params.awayTeam}
                  homeStats={matchDetail.homeStats || {}}
                  awayStats={matchDetail.awayStats || {}}
                />
              </>
            ) : (
              <EmptyState icon="stats-chart-outline" text={tFn("matchDetail.statsUnavailable")} />
            )}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "lineups" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.nxSectionTitle}>Lineups</Text>
            <View style={styles.lineupViewToggleRow}>
              <TouchableOpacity
                style={[styles.lineupViewBtn, lineupView === "pitch" ? styles.lineupViewBtnActive : null]}
                onPress={() => setLineupView("pitch")}
              >
                <Ionicons name="football-outline" size={14} color={lineupView === "pitch" ? COLORS.accent : COLORS.textMuted} />
                <Text style={[styles.lineupViewBtnText, lineupView === "pitch" ? styles.lineupViewBtnTextActive : null]}>Pitch</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.lineupViewBtn, lineupView === "list" ? styles.lineupViewBtnActive : null]}
                onPress={() => setLineupView("list")}
              >
                <Ionicons name="list-outline" size={14} color={lineupView === "list" ? COLORS.accent : COLORS.textMuted} />
                <Text style={[styles.lineupViewBtnText, lineupView === "list" ? styles.lineupViewBtnTextActive : null]}>List</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <LoadingState />
            ) : orderedLineupTeams.length > 0 ? (
              <>
                {homeLineupTeam && awayLineupTeam ? (
                  lineupView === "pitch" ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lineupPitchScroller}>
                      <CombinedPitchView
                        homeTeamData={homeLineupTeam}
                        awayTeamData={awayLineupTeam}
                        league={espnLeague}
                      />
                    </ScrollView>
                  ) : (
                    orderedLineupTeams.map((team: any, ti: number) => (
                      <View key={ti} style={styles.lineupTeamSection}>
                        <View style={styles.lineupHeaderRow}>
                          <Text style={styles.sectionLabel}>{team.team?.toUpperCase()}</Text>
                        </View>
                        <View style={styles.lineupListCard}>
                          <Text style={styles.lineupListLabel}>STARTING XI</Text>
                          {(team.players || []).filter((p: any) => p?.starter !== false).map((p: any, i: number) => (
                            <PlayerRow key={`st_${p?.id || p?.name || i}`} player={p} sport={params.sport} teamName={team.team} league={espnLeague} />
                          ))}
                        </View>
                      </View>
                    ))
                  )
                ) : null}
              </>
            ) : (
              <EmptyState icon="people-outline" text={tFn("matchDetail.lineupsUnavailable")} />
            )}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "timeline" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.nxCard}>
              <View style={styles.nxSectionHeadRow}>
                <Text style={styles.nxCardTitle}>Real-time timeline</Text>
                <Text style={styles.nxTimelineMinute}>{isFinished ? "FT" : `${timelineProgressMinute || 0}'`}</Text>
              </View>
              <View style={styles.nxTimelineTrack}>
                <View style={[styles.nxTimelineFill, { width: `${timelineProgressPct}%` }]} />
              </View>
              <View style={styles.nxTimelineRangeRow}>
                <Text style={styles.nxTimelineRangeText}>0&#39;</Text>
                <Text style={styles.nxTimelineRangeText}>45&#39;</Text>
                <Text style={styles.nxTimelineRangeText}>90+&#39;</Text>
              </View>
            </View>

            <View style={styles.nxGridWrap}>
              <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>⚽ Goals</Text><Text style={styles.nxGridValue}>{timelineEventCounts.goals}</Text></View>
              <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>🟨 Yellow</Text><Text style={styles.nxGridValue}>{timelineEventCounts.yellow}</Text></View>
              <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>🟥 Red</Text><Text style={styles.nxGridValue}>{timelineEventCounts.red}</Text></View>
              <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>🔁 Subs</Text><Text style={styles.nxGridValue}>{timelineEventCounts.subs}</Text></View>
              <View style={styles.nxGridCard}><Text style={styles.nxGridLabel}>⚡ Penalty</Text><Text style={styles.nxGridValue}>{timelineEventCounts.penalties}</Text></View>
            </View>

            {orderedTimelineEvents.length > 0 ? (
              <MatchTimeline
                events={orderedTimelineEvents}
                homeTeam={params.homeTeam}
                awayTeam={params.awayTeam}
              />
            ) : (
              <EmptyState icon="git-branch-outline" text={tFn("matchDetail.timelineUnavailable")} />
            )}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "h2h" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.nxSectionTitle}>H2H</Text>
            {predictionUnlocked && safePrediction?.h2hSummary ? (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>Head to head</Text>
                <Text style={styles.nxBodyText}>{safePrediction.h2hSummary}</Text>
              </View>
            ) : (
              <View style={styles.nxLockedCard}>
                <Text style={styles.nxGridLabel}>Head to head data</Text>
                <Text style={styles.nxBodyText}>Vergelijkbare ontmoetingen, trendlines en contextuele edge.</Text>
                <BlurView intensity={45} tint="dark" style={styles.nxLockOverlay}>
                  <Ionicons name="lock-closed" size={18} color="#E50914" />
                  <Text style={styles.nxLockText}>Unlock required</Text>
                </BlurView>
              </View>
            )}

            {predictionUnlocked && (safePrediction?.formGuide?.homeForm || safePrediction?.formGuide?.awayForm) ? (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>Form analysis</Text>
                {safePrediction?.formGuide?.homeForm ? <Text style={styles.nxBodyText}>{homeTeamName}: {safePrediction.formGuide.homeForm}</Text> : null}
                {safePrediction?.formGuide?.awayForm ? <Text style={[styles.nxBodyText, { marginTop: 10 }]}>{awayTeamName}: {safePrediction.formGuide.awayForm}</Text> : null}
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "power" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.nxSectionTitle}>Power</Text>
            <View style={styles.nxGridWrap}>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Model edge</Text>
                <Text style={styles.nxGridValue}>{edgeScorePct}/100</Text>
              </View>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Confidence</Text>
                <Text style={styles.nxGridValue}>{confidencePct}%</Text>
              </View>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Win tilt</Text>
                <Text style={styles.nxGridValue}>{Math.abs(normHomePct - normAwayPct)}%</Text>
              </View>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Goals pressure</Text>
                <Text style={styles.nxGridValue}>{Math.round((over25Pct + bttsPct) / 2)}%</Text>
              </View>
            </View>

            {matchDetail ? (
              <>
                <StatsBars
                  homeTeam={params.homeTeam}
                  awayTeam={params.awayTeam}
                  homeStats={matchDetail.homeStats || {}}
                  awayStats={matchDetail.awayStats || {}}
                />
                <MatchHeatmap
                  homeTeam={params.homeTeam}
                  awayTeam={params.awayTeam}
                  homeStats={matchDetail.homeStats || {}}
                  awayStats={matchDetail.awayStats || {}}
                />
              </>
            ) : (
              <EmptyState icon="stats-chart-outline" text={tFn("matchDetail.statsUnavailable")} />
            )}
          </ScrollView>
        ) : null}

        {activeExperienceTab === "success" ? (
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.nxContentWrap}
            showsVerticalScrollIndicator={false}
            onScroll={handleExperienceScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.nxSectionTitle}>Success Rate</Text>
            <View style={styles.nxGridWrap}>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>AI confidence</Text>
                <Text style={styles.nxGridValue}>{confidencePct}%</Text>
              </View>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Data coverage</Text>
                <Text style={styles.nxGridValue}>{successDataCoverage}%</Text>
              </View>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Signal strength</Text>
                <Text style={styles.nxGridValue}>{successSignalStrength}%</Text>
              </View>
              <View style={styles.nxGridCard}>
                <Text style={styles.nxGridLabel}>Risk band</Text>
                <Text style={styles.nxGridValue}>{safePrediction?.riskLevel || "Balanced"}</Text>
              </View>
            </View>

            {predictionUnlocked ? (
              <View style={styles.nxCard}>
                <Text style={styles.nxCardKicker}>Model calibration</Text>
                <Text style={styles.nxBodyText}>Deze confidence combineert signaalsterkte, datadekking, live-context en market-risk binnen hetzelfde model.</Text>
              </View>
            ) : (
              <View style={styles.nxLockedCard}>
                <Text style={styles.nxGridLabel}>Historical hit-rate</Text>
                <Text style={styles.nxBodyText}>Team-specifieke accuratesse over vergelijkbare matchprofielen.</Text>
                <BlurView intensity={45} tint="dark" style={styles.nxLockOverlay}>
                  <Ionicons name="lock-closed" size={18} color="#E50914" />
                  <Text style={styles.nxLockText}>Unlock required</Text>
                </BlurView>
              </View>
            )}
          </ScrollView>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={[COLORS.cardElevated, COLORS.surface, COLORS.background]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={() => {
              SafeHaptics.impactLight();
              router.push("/follow-center");
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.matchHeader}>
          <View style={styles.competitionRowCenterOnly}>
            <View style={styles.competitionCenter}>
              {leagueLogoUri ? (
                <TeamLogo uri={leagueLogoUri} teamName={competitionName} size={24} />
              ) : (
                <View style={styles.leagueFallbackIcon}>
                  <Ionicons name="trophy-outline" size={14} color={COLORS.textMuted} />
                </View>
              )}
              <Text style={styles.leagueName} numberOfLines={1}>{competitionBrand.name || competitionName}</Text>
            </View>
          </View>
          <View style={styles.scoreRow}>
            <TeamSide
              name={homeTeamName}
              logo={matchDetail?.homeTeamLogo || params.homeTeamLogo}
              onPress={() => {
              const fallbackTeamId = `name:${encodeURIComponent(homeTeamName || "")}`;
              router.push({
                pathname: "/team-detail",
                params: {
                  teamId: matchDetail?.homeTeamId || fallbackTeamId,
                  teamName: homeTeamName,
                  logo: matchDetail?.homeTeamLogo || params.homeTeamLogo || "",
                  sport: espnSport,
                  league: espnLeague,
                },
              });
            }}
            />
            <View style={styles.scoreCenter}>
              {(isLive || isHalfTime) ? (
                <>
                  <Text style={[styles.score, { fontSize: scoreFontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{liveHomeScore} - {liveAwayScore}</Text>
                  {isHalfTime
                    ? <Text style={[styles.finishedLabel, { color: "#FFD700" }]}>HT</Text>
                    : <LiveBadge minute={liveMinute} small />}
                </>
              ) : isFinished ? (
                <>
                  <Text style={[styles.score, { fontSize: scoreFontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{liveHomeScore} - {liveAwayScore}</Text>
                  <Text style={[styles.finishedLabel, { color: "#FFD34D" }]}>FT</Text>
                </>
              ) : isPostponed ? (
                <>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={[styles.finishedLabel, { color: COLORS.live }]}>AFGELAST</Text>
                </>
              ) : (
                <>
                  <Text style={styles.scheduledDate} numberOfLines={1}>{kickoffDate || "Datum volgt"}</Text>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={styles.scheduledTime} numberOfLines={1}>
                    {kickoffTime || "--:--"}
                  </Text>
                  {!kickoffConfirmed ? <Text style={styles.kickoffPendingNote}>{tFn("matchDetail.kickoffTBD")}</Text> : null}
                </>
              )}
            </View>
            <TeamSide
              name={awayTeamName}
              logo={matchDetail?.awayTeamLogo || params.awayTeamLogo}
              onPress={() => {
              const fallbackTeamId = `name:${encodeURIComponent(awayTeamName || "")}`;
              router.push({
                pathname: "/team-detail",
                params: {
                  teamId: matchDetail?.awayTeamId || fallbackTeamId,
                  teamName: awayTeamName,
                  logo: matchDetail?.awayTeamLogo || params.awayTeamLogo || "",
                  sport: espnSport,
                  league: espnLeague,
                },
              });
            }}
            />
          </View>

          {/* Stadium info */}
          {matchDetail?.venue && (
            <View style={styles.venueRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.venueText}>{matchDetail.venue}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBar}>
        <PillTabs
          tabs={TABS.map((tab) => ({ id: tab.id, label: tFn(tab.label), icon: tab.icon as any }))}
          active={activeTab}
          onChange={handleTabChange}
        />
      </ScrollView>

      {/* Stream Tab — always mounted, hidden when not active */}
      <View style={[styles.streamContainer, activeTab !== "stream" ? { display: "none" } : null]}>
          {isLive ? (
            <>
                <View style={styles.videoBox}>
                  <SilentResetBoundary>
                    <WebView key={streamKey} source={{ uri: streamUrl }}
                      style={{ flex: 1, backgroundColor: "#000" }}
                      allowsFullscreenVideo mediaPlaybackRequiresUserAction={false}
                      javaScriptEnabled domStorageEnabled
                      setSupportMultipleWindows={false}
                      allowsInlineMediaPlayback
                      injectedJavaScriptBeforeContentLoaded={BLOCK_POPUP_JS}
                      injectedJavaScript={BLOCK_POPUP_JS}
                      onShouldStartLoadWithRequest={(req) => {
                        const url = (req.url || "").toLowerCase();
                        if (url.includes("google.") || url.includes("bing.com") || url.includes("yahoo.com")) return false;
                        if (url.includes("doubleclick.") || url.includes("googleads.") || url.includes("googlesyndication.")) return false;
                        if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
                        return true;
                      }}
                      onError={(event) => {
                        const err = event?.nativeEvent?.description || tFn("matchDetail.webviewError");
                        setStreamWebError(err);
                        setStreamErrorRef((prev) => prev || buildErrorReference("NX-STR"));
                      }}
                    />
                  </SilentResetBoundary>
                </View>
                <View style={styles.serverSection}>
                  {hasStreamApiIssue ? (
                    <View style={styles.streamErrorCard}>
                      <MaterialCommunityIcons name="wifi-alert" size={14} color={COLORS.live} />
                      <Text style={styles.streamErrorText}>{streamApiError.userMessage}</Text>
                    </View>
                  ) : null}
                  {hasStreamPlayerIssue ? (
                    <View style={styles.streamErrorCard}>
                      <MaterialCommunityIcons name="alert-octagon-outline" size={14} color={COLORS.live} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.streamErrorText}>{streamPlayerError.userMessage}</Text>
                        {streamErrorRef ? <Text style={styles.streamErrorRef}>{tFn("matchDetail.errorCode", { code: streamErrorRef })}</Text> : null}
                      </View>
                    </View>
                  ) : null}
                  {hasStreamApiIssue && hasStreamPlayerIssue ? (
                    <View style={styles.streamErrorCard}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.textMuted} />
                      <Text style={styles.streamErrorText}>{tFn("matchDetail.noStreamAvailable")}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity style={styles.serverBtn} onPress={handleRetryAutoStream}>
                    <Ionicons name="refresh-outline" size={12} color={COLORS.accent} />
                    <Text style={styles.serverBtnText}>{tFn("matchDetail.loadOtherStream")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.serverBtn}
                    onPress={async () => {
                      SafeHaptics.impactLight();
                      await openInVlc(streamUrl, `${params.homeTeam || ""} - ${params.awayTeam || ""}`.trim() || "Live sport");
                    }}
                  >
                    <Ionicons name="open-outline" size={12} color={COLORS.accent} />
                    <Text style={styles.serverBtnText}>Open in VLC</Text>
                  </TouchableOpacity>
                </View>
              </>
          ) : (
            <View style={styles.notLiveContainer}>
              <Ionicons name="time-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.notLiveTitle}>{tFn("matchDetail.matchNotStarted")}</Text>
              <Text style={styles.notLiveText}>{tFn("matchDetail.streamAutoStart")}</Text>
            </View>
          )}
        </View>

      {/* Stats Tab */}
      {visitedTabs.stats ? (
      <ScrollView style={[styles.tabContent, activeTab !== "stats" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {detailLoading ? (
            <LoadingState />
          ) : matchDetail ? (
            <>
              <Text style={styles.sectionLabel}>MATCH STATISTICS</Text>
              <StatsBars
                homeTeam={params.homeTeam}
                awayTeam={params.awayTeam}
                homeStats={matchDetail.homeStats || {}}
                awayStats={matchDetail.awayStats || {}}
              />

              <MatchHeatmap
                homeTeam={params.homeTeam}
                awayTeam={params.awayTeam}
                homeStats={matchDetail.homeStats || {}}
                awayStats={matchDetail.awayStats || {}}
              />

              <InfoBlock title="MATCH INFO">
                <InfoRow icon="trophy-outline" label="Competition" value={safeStr(params.league)} />
                {matchDetail.round ? <InfoRow icon="layers-outline" label="Round" value={safeStr(matchDetail.round)} /> : null}
                {matchDetail.season ? <InfoRow icon="calendar-outline" label="Season" value={safeStr(matchDetail.season)} /> : null}
                {matchDetail.date ? <InfoRow icon="time-outline" label="Date / Kickoff" value={safeStr(matchDetail.date)} /> : null}
                {matchDetail.venue ? <InfoRow icon="location-outline" label="Venue" value={safeStr(matchDetail.venue)} /> : null}
                {matchDetail.city ? <InfoRow icon="business-outline" label="City" value={safeStr(matchDetail.city)} /> : null}
                {matchDetail.attendance ? <InfoRow icon="people-outline" label="Attendance" value={Number(matchDetail.attendance).toLocaleString()} /> : null}
                {matchDetail.referee ? <InfoRow icon="person-outline" label="Referee" value={safeStr(matchDetail.referee)} /> : null}
                {matchDetail.country ? <InfoRow icon="flag-outline" label="Country" value={safeStr(matchDetail.country)} /> : null}
              </InfoBlock>
            </>
          ) : (
            <EmptyState icon="stats-chart-outline" text={tFn("matchDetail.statsUnavailable")} />
          )}
        </ScrollView>
      ) : null}

      {/* Lineups/Matchen Tab */}
      {visitedTabs.lineups ? (
      <ScrollView style={[styles.tabContent, activeTab !== "lineups" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          <View style={styles.lineupViewToggleRow}>
            <TouchableOpacity
              style={[styles.lineupViewBtn, lineupView === "pitch" ? styles.lineupViewBtnActive : null]}
              onPress={() => setLineupView("pitch")}
            >
              <Ionicons name="football-outline" size={14} color={lineupView === "pitch" ? COLORS.accent : COLORS.textMuted} />
              <Text style={[styles.lineupViewBtnText, lineupView === "pitch" ? styles.lineupViewBtnTextActive : null]}>Pitch</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.lineupViewBtn, lineupView === "list" ? styles.lineupViewBtnActive : null]}
              onPress={() => setLineupView("list")}
            >
              <Ionicons name="list-outline" size={14} color={lineupView === "list" ? COLORS.accent : COLORS.textMuted} />
              <Text style={[styles.lineupViewBtnText, lineupView === "list" ? styles.lineupViewBtnTextActive : null]}>List</Text>
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <LoadingState />
          ) : orderedLineupTeams.length > 0 ? (
            <>
              {homeLineupTeam && awayLineupTeam && (
                <View style={styles.lineupTeamHeader}>
                  <View style={styles.lineupTeamSide}>
                    <TeamLogo uri={matchDetail?.homeTeamLogo || params.homeTeamLogo} teamName={homeLineupTeam?.team} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineupTeamName} numberOfLines={1}>{homeLineupTeam?.team}</Text>
                      {homeLineupTeam?.formation ? <Text style={styles.lineupFormation}>{homeLineupTeam.formation}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.lineupTeamDivider}><Text style={styles.lineupVsSmall}>VS</Text></View>
                  <View style={[styles.lineupTeamSide, { flexDirection: "row-reverse" }]}>
                    <TeamLogo uri={matchDetail?.awayTeamLogo || params.awayTeamLogo} teamName={awayLineupTeam?.team} size={36} />
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={styles.lineupTeamName} numberOfLines={1}>{awayLineupTeam?.team}</Text>
                      {awayLineupTeam?.formation ? <Text style={styles.lineupFormation}>{awayLineupTeam.formation}</Text> : null}
                    </View>
                  </View>
                </View>
              )}

              {lineupView === "pitch" && homeLineupTeam && awayLineupTeam ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lineupPitchScroller}>
                  <CombinedPitchView
                    homeTeamData={homeLineupTeam}
                    awayTeamData={awayLineupTeam}
                    league={espnLeague}
                  />
                </ScrollView>
              ) : (
                orderedLineupTeams.map((team: any, ti: number) => (
                  <View key={ti} style={styles.lineupTeamSection}>
                    <View style={styles.lineupHeaderRow}>
                      <Text style={styles.sectionLabel}>{team.team?.toUpperCase()}</Text>
                    </View>

                    {lineupView === "pitch" ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lineupPitchScroller}>
                        <LinearGradient
                          colors={["#183c20", "#0f2f19", "#0b2413"]}
                          style={styles.pitchCard}
                        >
                          <View style={styles.pitchCenterCircle} />
                          <View style={styles.pitchHalfLine} />
                          {buildFormationRows(team.players || [], team.formation).map((row, rowIndex) => (
                            <View key={rowIndex} style={styles.pitchRow}>
                              {row.map((p: any, pi: number) => (
                                <View key={`${p.id || p.name}-${pi}`} style={styles.pitchPlayerWrap}>
                                  <PlayerRow player={p} sport={params.sport} compact teamName={team.team} league={espnLeague} />
                                </View>
                              ))}
                            </View>
                          ))}
                        </LinearGradient>
                      </ScrollView>
                    ) : (
                      <View style={styles.lineupListCard}>
                        <Text style={styles.lineupListLabel}>STARTING XI</Text>
                        {(team.players || []).filter((p: any) => p?.starter !== false).map((p: any, i: number) => (
                          <PlayerRow key={`st_${p?.id || p?.name || i}`} player={p} sport={params.sport} teamName={team.team} league={espnLeague} />
                        ))}
                        {(team.players || []).some((p: any) => p?.starter === false) ? (
                          <>
                            <Text style={[styles.lineupListLabel, { marginTop: 10 }]}>BENCH</Text>
                            {(team.players || []).filter((p: any) => p?.starter === false).map((p: any, i: number) => (
                              <PlayerRow key={`bn_${p?.id || p?.name || i}`} player={p} sport={params.sport} teamName={team.team} league={espnLeague} />
                            ))}
                          </>
                        ) : null}
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          ) : (
            <EmptyState icon="people-outline" text={tFn("matchDetail.lineupsUnavailable")} />
          )}
        </ScrollView>
      ) : null}

      {/* Timeline Tab */}
      {visitedTabs.timeline ? (
      <ScrollView style={[styles.tabContent, activeTab !== "timeline" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
        {detailLoading ? (
          <LoadingState />
        ) : timelineEvents.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>MATCH TIMELINE</Text>
            <MatchTimeline
              events={timelineEvents}
              homeTeam={params.homeTeam}
              awayTeam={params.awayTeam}
            />
          </>
        ) : (
          <EmptyState icon="git-branch-outline" text={tFn("matchDetail.timelineUnavailable")} />
        )}
      </ScrollView>
      ) : null}

      {/* Highlights Tab */}
      {visitedTabs.highlights ? (
      <ScrollView style={[styles.tabContent, activeTab !== "highlights" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
        {detailLoading ? (
          <LoadingState />
        ) : (() => {
          const fallbackMoments = timelineEvents.filter((event: any) => !["kickoff", "halftime", "fulltime", "info"].includes(String(event?.kind || "")));
          const usableMoments = highlightMoments.length > 0 ? highlightMoments : fallbackMoments;
          const hasHighlights = usableMoments.length > 0 || highlightRecap.length > 0 || highlightSummary?.summary;
          if (!hasHighlights) return <EmptyState icon="star-outline" text={tFn("matchDetail.highlightsUnavailable")} />;
          // Compute match excitement rating (1-5 stars)
          const goalEvents = usableMoments.filter((e: any) => /goal/i.test(String(e?.kind || e?.type || "")));
          const cardEvents = usableMoments.filter((e: any) => /red|yellow_red/i.test(String(e?.kind || e?.type || "")));
          const excitementScore = Math.min(5, Math.max(1, Math.round(
            1.5 + goalEvents.length * 0.7 + cardEvents.length * 0.4 + (usableMoments.length > 8 ? 0.5 : 0)
          )));
          return (
            <>
              {/* Match Rating */}
              <View style={styles.highlightRatingCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="fire" size={16} color="#FF9800" />
                  <Text style={styles.highlightRatingTitle}>{tFn("matchDetail.matchRating")}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {[1,2,3,4,5].map(s => (
                    <Ionicons key={s} name={s <= excitementScore ? "star" : "star-outline"} size={16} color={s <= excitementScore ? "#FFD700" : "rgba(255,255,255,0.2)"} />
                  ))}
                </View>
                <Text style={styles.highlightRatingSub}>
                  {goalEvents.length} {tFn("matchDetail.goals")} · {usableMoments.length} {tFn("matchDetail.moments")}
                </Text>
              </View>

              {highlightSummary?.summary ? (
                <LinearGradient colors={["rgba(229,9,20,0.12)", "rgba(229,9,20,0.04)"]} style={styles.highlightsHeroCard}>
                  <View style={styles.highlightsHeroHeader}>
                    <Ionicons name="sparkles-outline" size={15} color={COLORS.accent} />
                    <Text style={styles.highlightsHeroTitle}>Match Recap</Text>
                  </View>
                  <Text style={styles.highlightsHeroText}>{highlightSummary.summary}</Text>
                </LinearGradient>
              ) : null}

              {highlightRecap.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>KEY MOMENTS</Text>
                  <View style={styles.highlightRecapGrid}>
                    {highlightRecap.map((line: string, index: number) => (
                      <View key={`${line}-${index}`} style={styles.highlightRecapCard}>
                        <Text style={styles.highlightRecapIndex}>{String(index + 1).padStart(2, "0")}</Text>
                        <Text style={styles.highlightRecapText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {usableMoments.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>TIJDLIJN</Text>
                  <MatchTimeline events={usableMoments} homeTeam={params.homeTeam} awayTeam={params.awayTeam} />
                </>
              ) : null}
            </>
          );
        })()}
      </ScrollView>
      ) : null}

    </View>
  );
}

function TeamSide({ name, logo, onPress }: { name: string; logo?: string; onPress?: () => void }) {
  const { width } = useWindowDimensions();
  const logoSize = width < 360 ? 40 : width < 400 ? 46 : 52;
  return (
    <View style={styles.teamSideWrap}>
      <TouchableOpacity
        style={styles.teamSideCard}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <TeamLogo uri={logo} teamName={name} size={logoSize} />
        <Text style={[styles.teamName, width < 360 && { fontSize: 10, maxWidth: 84 }]} numberOfLines={2}>{name}</Text>
      </TouchableOpacity>
    </View>
  );
}

function timelineMinuteValue(event: any, index: number): number {
  const kind = String(event?.kind || event?.type || "").toLowerCase();
  if (kind === "kickoff") return 0;
  if (kind === "halftime") return 45.99;
  if (kind === "second_half" || kind === "secondhalf") return 46;
  if (kind === "fulltime") return 90.99;
  if (kind === "extra_time") return 105;
  if (kind === "penalties") return 120;

  const provided = Number(event?.minuteValue);
  if (Number.isFinite(provided) && provided >= 0) return provided;
  const text = String(event?.minute || event?.time || "");
  const match = text.match(/(\d+)(?:\+(\d+))?/);
  if (!match) return index;
  const base = Number(match[1] || 0);
  const extra = Number(match[2] || 0);
  return base + (extra > 0 ? extra / 100 : 0);
}

function timelinePhaseWeight(kind: string): number {
  if (kind === "kickoff") return 0;
  if (kind === "halftime") return 1;
  if (kind === "second_half" || kind === "secondhalf") return 2;
  if (kind === "fulltime") return 3;
  if (kind === "extra_time") return 4;
  if (kind === "penalties") return 5;
  return 10;
}

function sortTimelineForRender(events: any[]): any[] {
  const unique = new Set<string>();
  const cleaned = (Array.isArray(events) ? events : []).filter((event) => {
    const key = `${String(event?.kind || event?.type || "")}|${String(event?.minute || event?.time || "")}|${String(event?.title || "")}|${String(event?.description || event?.detail || "")}|${String(event?.team || event?.teamName || "")}`;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });

  return [...cleaned].sort((a, b) => {
    const kindA = String(a?.kind || a?.type || "").toLowerCase();
    const kindB = String(b?.kind || b?.type || "").toLowerCase();
    const minA = timelineMinuteValue(a, 0);
    const minB = timelineMinuteValue(b, 0);
    if (minA !== minB) return minA - minB;

    const phaseA = timelinePhaseWeight(kindA);
    const phaseB = timelinePhaseWeight(kindB);
    if (phaseA !== phaseB) return phaseA - phaseB;

    const isBoundaryA = ["kickoff", "halftime", "second_half", "secondhalf", "fulltime", "extra_time", "penalties"].includes(kindA);
    const isBoundaryB = ["kickoff", "halftime", "second_half", "secondhalf", "fulltime", "extra_time", "penalties"].includes(kindB);
    if (isBoundaryA !== isBoundaryB) return isBoundaryA ? -1 : 1;

    const orderA = Number(a?.sequence || a?.order || Number.MAX_SAFE_INTEGER);
    const orderB = Number(b?.sequence || b?.order || Number.MAX_SAFE_INTEGER);
    if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
      return orderA - orderB;
    }

    return String(a?.title || "").localeCompare(String(b?.title || ""));
  });
}

function MatchTimelineInner({ events, homeTeam, awayTeam }: { events: any[]; homeTeam: string; awayTeam: string }) {
  const orderedEvents = useMemo(() => sortTimelineForRender(events), [events]);

  if (!orderedEvents?.length) {
    return <EmptyState icon="timer-outline" text="No timeline events available" />;
  }

  const getEventConfig = (event: any) => {
    const t = String(event?.kind || event?.type || "").toLowerCase();
    if (t.includes("kickoff")) {
      return { icon: "play-outline" as const, color: COLORS.accent, label: "Kick-off", dot: COLORS.accent };
    }
    if (t.includes("halftime")) {
      return { icon: "pause-outline" as const, color: "#FFD166", label: "Half-time", dot: "#FFD166" };
    }
    if (t.includes("fulltime")) {
      return { icon: "stop-outline" as const, color: COLORS.textMuted, label: "Full Time", dot: COLORS.textMuted };
    }
    if (t.includes("own") || t.includes("eigen")) {
      return { icon: "football-outline" as const, color: "#FF6B35", label: "Own Goal", dot: "#FF6B35" };
    }
    if (t.includes("goal")) {
      return { icon: "football-outline" as const, color: "#00E676", label: "Goal", dot: "#00E676" };
    }
    if (t.includes("missed_penalty")) {
      return { icon: "close-circle-outline" as const, color: "#FF9F1C", label: "Missed Penalty", dot: "#FF9F1C" };
    }
    if (t.includes("chance")) {
      return { icon: "flash-outline" as const, color: "#7BDFF2", label: "Big Chance", dot: "#7BDFF2" };
    }
    if (t.includes("red")) {
      return { icon: "card-outline" as const, color: "#FF3040", label: "Red Card", dot: "#FF3040" };
    }
    if (t.includes("yellow_red") || t.includes("second yellow")) {
      return { icon: "card-outline" as const, color: "#FF8C00", label: "2nd Yellow", dot: "#FF8C00" };
    }
    if (t.includes("yellow")) {
      return { icon: "card-outline" as const, color: "#FFD700", label: "Yellow Card", dot: "#FFD700" };
    }
    if (t.includes("sub") || t.includes("substitut")) {
      return { icon: "swap-horizontal-outline" as const, color: "#5D9EFF", label: "Substitution", dot: "#5D9EFF" };
    }
    if (t.includes("pen") || t.includes("penalty")) {
      return { icon: "radio-button-on-outline" as const, color: "#FF9800", label: "Penalty", dot: "#FF9800" };
    }
    if (t.includes("var")) {
      return { icon: "videocam-outline" as const, color: "#A78BFA", label: "VAR", dot: "#A78BFA" };
    }
    if (t.includes("miss") || t.includes("saved")) {
      return { icon: "close-circle-outline" as const, color: COLORS.textMuted, label: "Missed", dot: COLORS.textMuted };
    }
    return { icon: "ellipse-outline" as const, color: COLORS.textMuted, label: "Event", dot: COLORS.textMuted };
  };

  const isHomeEvent = (ev: any): boolean => {
    if (ev?.side === "home") return true;
    if (ev?.side === "away" || ev?.side === "center") return false;
    const evTeam = safeStr(ev?.team || ev?.teamName || "").toLowerCase();
    const home = homeTeam.toLowerCase();
    const away = awayTeam.toLowerCase();
    if (!evTeam) return false; // unknown team → render as center
    if (evTeam.includes(home.split(" ")[0]) || home.includes(evTeam.split(" ")[0])) return true;
    if (evTeam.includes(away.split(" ")[0]) || away.includes(evTeam.split(" ")[0])) return false;
    return false;
  };

  return (
    <View style={styles.timelineWrapper}>
      <View style={[styles.timelineConnector, { left: "50%", marginLeft: -1 }]} />
      {orderedEvents.map((ev: any, i: number) => {
        const cfg = getEventConfig(ev);
        const onHome = isHomeEvent(ev);
        const rawMinute = safeStr(ev?.minute || (ev?.time ? `${String(ev.time)}'` : ""));
        // Safety clamp: if minute looks like raw seconds (>150), convert
        const minute = rawMinute.replace(/(\d+)/, (_, n) => {
          const num = Number(n);
          return num > 150 ? String(Math.floor(num / 60)) : n;
        });
        const title = safeStr(ev?.title || cfg.label);
        const description = safeStr(ev?.description || ev?.player || ev?.name || ev?.text || ev?.detail || "");
        const secondary = safeStr(ev?.secondary || ev?.assist || "");
        const isCenterEvent = ev?.side === "center" || ["kickoff", "halftime", "fulltime"].includes(String(ev?.kind || ""))
          || (!ev?.side && !safeStr(ev?.team || ev?.teamName || ""));

        return (
          <View key={i} style={styles.timelineRow}>
            {isCenterEvent ? (
              <>
                <View style={styles.timelineSide} />
                <View style={styles.timelineCenterCardWrap}>
                  <View style={styles.timelineCenter}>
                    <View style={[styles.timelineDot, { backgroundColor: cfg.dot, borderColor: `${cfg.dot}88` }]} />
                    {minute ? <Text style={styles.timelineMinute}>{minute}</Text> : null}
                  </View>
                  <View style={styles.timelineCenterCard}>
                    <View style={[styles.timelineEventBadge, { backgroundColor: `${cfg.dot}22`, borderColor: `${cfg.dot}55` }]}>
                      <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineTitle}>{title}</Text>
                      {description ? <Text style={styles.timelineDescription}>{description}</Text> : null}
                    </View>
                  </View>
                </View>
                <View style={styles.timelineSide} />
              </>
            ) : (
              <>
            {/* Home side */}
            <View style={styles.timelineSide}>
              {onHome ? (
                <View style={styles.timelineEventHome}>
                  <View style={styles.timelineTextBlockHome}>
                    <Text style={styles.timelineTitleHome} numberOfLines={1}>{title}</Text>
                    <Text style={styles.timelinePlayer} numberOfLines={2}>{description}</Text>
                    {secondary ? <Text style={styles.timelineSecondaryHome} numberOfLines={1}>{secondary}</Text> : null}
                  </View>
                  <View style={[styles.timelineEventBadge, { backgroundColor: `${cfg.dot}22`, borderColor: `${cfg.dot}55` }]}>
                    <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                  </View>
                </View>
              ) : null}
            </View>

            {/* Center: minute + line */}
            <View style={styles.timelineCenter}>
              <View style={[styles.timelineDot, { backgroundColor: cfg.dot, borderColor: `${cfg.dot}88` }]} />
              {minute ? <Text style={styles.timelineMinute}>{minute}</Text> : null}
            </View>

            {/* Away side */}
            <View style={[styles.timelineSide, styles.timelineSideAway]}>
              {!onHome ? (
                <View style={styles.timelineEventAway}>
                  <View style={[styles.timelineEventBadge, { backgroundColor: `${cfg.dot}22`, borderColor: `${cfg.dot}55` }]}>
                    <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                  </View>
                  <View style={styles.timelineTextBlockAway}>
                    <Text style={styles.timelineTitle} numberOfLines={1}>{title}</Text>
                    <Text style={[styles.timelinePlayer, { textAlign: "left" }]} numberOfLines={2}>{description}</Text>
                    {secondary ? <Text style={styles.timelineSecondary} numberOfLines={1}>{secondary}</Text> : null}
                  </View>
                </View>
              ) : null}
            </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const MatchTimeline = React.memo(MatchTimelineInner);

// ── Match Heatmap – zone-based pitch visualization ──────────────────────────
function MatchHeatmapInner({ homeTeam, awayTeam, homeStats, awayStats }: { homeTeam: string; awayTeam: string; homeStats: any; awayStats: any }) {
  const toNum = (v: any) => { const n = parseFloat(String(v ?? "0").replace("%", "")); return Number.isFinite(n) ? n : 0; };

  const hPoss = toNum(homeStats?.ball_possession ?? homeStats?.possession ?? homeStats?.possessionPct);
  const aPoss = toNum(awayStats?.ball_possession ?? awayStats?.possession ?? awayStats?.possessionPct);
  const hShots = toNum(homeStats?.total_shots ?? homeStats?.shots ?? homeStats?.totalShots);
  const aShots = toNum(awayStats?.total_shots ?? awayStats?.shots ?? awayStats?.totalShots);
  const hOnTarget = toNum(homeStats?.shots_on_goal ?? homeStats?.shots_on_target ?? homeStats?.shotsOnTarget);
  const aOnTarget = toNum(awayStats?.shots_on_goal ?? awayStats?.shots_on_target ?? awayStats?.shotsOnTarget);
  const hCorners = toNum(homeStats?.corner_kicks ?? homeStats?.corners ?? homeStats?.cornerKicks);
  const aCorners = toNum(awayStats?.corner_kicks ?? awayStats?.corners ?? awayStats?.cornerKicks);
  const hInsideBox = toNum(homeStats?.shots_insidebox ?? homeStats?.shotsInsideBox);
  const aInsideBox = toNum(awayStats?.shots_insidebox ?? awayStats?.shotsInsideBox);

  const hasData = hPoss > 0 || aPoss > 0 || hShots > 0 || aShots > 0;
  if (!hasData) return null;

  const maxShots = Math.max(hShots, aShots, 1);
  const maxCorners = Math.max(hCorners, aCorners, 1);

  const hDefIntensity = Math.min(1, ((aShots - aOnTarget) / Math.max(maxShots, 1)) * 0.65 + (hPoss / 100) * 0.2 + 0.08);
  const hMidIntensity = Math.min(1, (hPoss / 100) * 0.95 + ((hShots + hCorners) / Math.max(maxShots + maxCorners, 1)) * 0.25 + 0.08);
  const hAttackIntensity = Math.min(1, ((hInsideBox || hOnTarget) / Math.max(maxShots, 1)) * 1.35 + (hCorners / Math.max(maxCorners, 1)) * 0.18 + 0.1);

  const aDefIntensity = Math.min(1, ((hShots - hOnTarget) / Math.max(maxShots, 1)) * 0.65 + (aPoss / 100) * 0.2 + 0.08);
  const aMidIntensity = Math.min(1, (aPoss / 100) * 0.95 + ((aShots + aCorners) / Math.max(maxShots + maxCorners, 1)) * 0.25 + 0.08);
  const aAttackIntensity = Math.min(1, ((aInsideBox || aOnTarget) / Math.max(maxShots, 1)) * 1.35 + (aCorners / Math.max(maxCorners, 1)) * 0.18 + 0.1);

  const homeControl = (hPoss * 1.15) + (hShots * 2.1) + (hOnTarget * 2.8) + (hCorners * 1.25);
  const awayControl = (aPoss * 1.15) + (aShots * 2.1) + (aOnTarget * 2.8) + (aCorners * 1.25);
  const controlTotal = Math.max(1, homeControl + awayControl);
  const controlDiff = (homeControl - awayControl) / controlTotal;
  const splitShift = Math.max(-14, Math.min(14, Math.round(controlDiff * 100 * 0.38)));
  const splitPct = 50 + splitShift;
  const homeZoneWidth = splitPct / 3;
  const awayZoneWidth = (100 - splitPct) / 3;

  const homeStarts = [0, homeZoneWidth, homeZoneWidth * 2];
  const awayStarts = [splitPct, splitPct + awayZoneWidth, splitPct + awayZoneWidth * 2];
  const homeSpreadBoost = Math.max(0, controlDiff) * 0.22;
  const awaySpreadBoost = Math.max(0, -controlDiff) * 0.22;

  const shotDots: { x: number; y: number; color: string; onTarget: boolean }[] = [];
  const seedRng = (s: number) => { let v = s; return () => { v = (v * 16807 + 0) % 2147483647; return (v & 0x7fffffff) / 0x7fffffff; }; };
  const rng = seedRng(hShots * 100 + aShots * 7 + hOnTarget * 33);

  for (let i = 0; i < Math.min(hShots, 12); i++) {
    const onTarget = i < hOnTarget;
    shotDots.push({ x: 8 + rng() * 33, y: 16 + rng() * 66, color: COLORS.accent, onTarget });
  }
  for (let i = 0; i < Math.min(aShots, 12); i++) {
    const onTarget = i < aOnTarget;
    shotDots.push({ x: 59 + rng() * 33, y: 16 + rng() * 66, color: "#5B8DEF", onTarget });
  }

  const intensityToColor = (intensity: number, side: "home" | "away", dominanceBoost = 0) => {
    const alpha = Math.max(0.08, Math.min(0.56, (intensity + dominanceBoost) * 0.56));
    return side === "home"
      ? `rgba(229,9,20,${alpha.toFixed(2)})`
      : `rgba(70,130,255,${alpha.toFixed(2)})`;
  };

  const dynamicZones = [
    { left: homeStarts[0], width: homeZoneWidth, color: intensityToColor(hDefIntensity, "home", homeSpreadBoost * 0.35), label: "DEF" },
    { left: homeStarts[1], width: homeZoneWidth, color: intensityToColor(hMidIntensity, "home", homeSpreadBoost * 0.55), label: "MID" },
    { left: homeStarts[2], width: homeZoneWidth, color: intensityToColor(hAttackIntensity, "home", homeSpreadBoost), label: "ATT" },
    { left: awayStarts[0], width: awayZoneWidth, color: intensityToColor(aAttackIntensity, "away", awaySpreadBoost), label: "ATT" },
    { left: awayStarts[1], width: awayZoneWidth, color: intensityToColor(aMidIntensity, "away", awaySpreadBoost * 0.55), label: "MID" },
    { left: awayStarts[2], width: awayZoneWidth, color: intensityToColor(aDefIntensity, "away", awaySpreadBoost * 0.35), label: "DEF" },
  ];
  const laneCards = [
    { label: "Defense", home: hDefIntensity, away: aDefIntensity },
    { label: "Midfield", home: hMidIntensity, away: aMidIntensity },
    { label: "Attack", home: hAttackIntensity, away: aAttackIntensity },
  ];

  return (
    <View style={heatmapStyles.card}>
      <View style={heatmapStyles.header}>
        <View style={heatmapStyles.headerAccent} />
        <View style={heatmapStyles.headerIconWrap}>
          <MaterialCommunityIcons name="soccer-field" size={16} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={heatmapStyles.headerTitle}>FIELD CONTROL</Text>
          <Text style={heatmapStyles.headerSub}>Dominant team pushes control deeper into the opposite half</Text>
        </View>
      </View>

      <View style={heatmapStyles.teamScaleRow}>
        <View style={heatmapStyles.teamScaleSide}>
          <View style={[heatmapStyles.teamScaleDot, { backgroundColor: COLORS.accent }]} />
          <Text style={heatmapStyles.teamScaleText} numberOfLines={1}>{safeStr(homeTeam)}</Text>
        </View>
        <Text style={heatmapStyles.teamScaleCenter}>ZONE MODEL</Text>
        <View style={[heatmapStyles.teamScaleSide, { justifyContent: "flex-end" }]}>
          <Text style={[heatmapStyles.teamScaleText, { textAlign: "right" }]} numberOfLines={1}>{safeStr(awayTeam)}</Text>
          <View style={[heatmapStyles.teamScaleDot, { backgroundColor: "#5B8DEF" }]} />
        </View>
      </View>

      <View style={heatmapStyles.pitch}>
        <LinearGradient colors={["#081711", "#0c2519", "#113225", "#113225", "#0c2519", "#081711"]} style={heatmapStyles.pitchGradient}>
          {dynamicZones.map((zone, idx) => (
            <View
              key={`zone_${idx}`}
              style={[
                heatmapStyles.horizontalZone,
                {
                  left: `${zone.left}%`,
                  width: `${zone.width}%`,
                  backgroundColor: zone.color,
                },
              ]}
            />
          ))}

          <View style={heatmapStyles.fieldBorder} />
          <View style={heatmapStyles.fieldMidline} />
          <View style={heatmapStyles.fieldCenterCircle} />
          <View style={heatmapStyles.fieldCenterSpot} />
          <View style={heatmapStyles.leftPenaltyArea} />
          <View style={heatmapStyles.leftGoalArea} />
          <View style={heatmapStyles.rightPenaltyArea} />
          <View style={heatmapStyles.rightGoalArea} />
          <View style={heatmapStyles.leftGoalSlot} />
          <View style={heatmapStyles.rightGoalSlot} />
          <View style={heatmapStyles.leftPenaltySpot} />
          <View style={heatmapStyles.rightPenaltySpot} />
          <View style={heatmapStyles.leftArc} />
          <View style={heatmapStyles.rightArc} />

          {dynamicZones.map((zone, idx) => (
            <View key={`zone_label_${idx}`} style={[heatmapStyles.zoneLabelChip, { left: `${zone.left + (zone.width / 2) - 4}%` }]}>
              <Text style={heatmapStyles.zoneLabel}>{zone.label}</Text>
            </View>
          ))}

          {/* Shot dots overlay */}
          {shotDots.map((dot, i) => (
            <View
              key={`shot_${i}`}
              style={[
                heatmapStyles.shotDot,
                {
                  left: `${dot.x}%` as any,
                  top: `${dot.y}%` as any,
                  backgroundColor: dot.onTarget ? dot.color : "transparent",
                  borderColor: dot.color,
                },
              ]}
            />
          ))}
        </LinearGradient>
      </View>

      <View style={heatmapStyles.shotStatsRow}>
        {[
          { label: "Shots", home: hShots, away: aShots },
          { label: "On Target", home: hOnTarget, away: aOnTarget },
          { label: "Corners", home: hCorners, away: aCorners },
        ].map((stat) => (
          <View key={stat.label} style={heatmapStyles.shotStatCard}>
            <Text style={[heatmapStyles.shotStatValue, { color: COLORS.accent }]}>{stat.home}</Text>
            <Text style={heatmapStyles.shotStatLabel}>{stat.label}</Text>
            <Text style={[heatmapStyles.shotStatValue, { color: "#5B8DEF" }]}>{stat.away}</Text>
          </View>
        ))}
      </View>

      <View style={heatmapStyles.laneSummaryRow}>
        {laneCards.map((lane) => (
          <View key={lane.label} style={heatmapStyles.laneCard}>
            <Text style={heatmapStyles.laneTitle}>{lane.label}</Text>
            <View style={heatmapStyles.laneTrack}>
              <View style={[heatmapStyles.laneFillHome, { flex: Math.max(8, Math.round(lane.home * 100)) }]} />
              <View style={[heatmapStyles.laneFillAway, { flex: Math.max(8, Math.round(lane.away * 100)) }]} />
            </View>
            <View style={heatmapStyles.laneFooter}>
              <Text style={heatmapStyles.laneHomeText}>{Math.round(lane.home * 100)}</Text>
              <Text style={heatmapStyles.laneAwayText}>{Math.round(lane.away * 100)}</Text>
            </View>
          </View>
        ))}
      </View>

      {(hPoss > 0 || aPoss > 0) && (
        <View style={heatmapStyles.possessionBar}>
          <Text style={[heatmapStyles.possessionLabel, { color: COLORS.accent }]}>{hPoss}%</Text>
          <View style={heatmapStyles.possessionTrack}>
            <View style={[heatmapStyles.possessionHome, { flex: Math.max(1, hPoss) }]} />
            <View style={[heatmapStyles.possessionAway, { flex: Math.max(1, aPoss || (100 - hPoss)) }]} />
          </View>
          <Text style={[heatmapStyles.possessionLabel, { color: "#5B8DEF" }]}>{aPoss || (100 - hPoss)}%</Text>
        </View>
      )}
    </View>
  );
}

const MatchHeatmap = React.memo(MatchHeatmapInner);

const heatmapStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.24)",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.text,
    letterSpacing: 1.2,
  },
  headerSub: {
    marginTop: 2,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  teamScaleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  teamScaleSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teamScaleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamScaleText: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  teamScaleCenter: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  pitch: {
    marginHorizontal: 12,
    marginVertical: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pitchGradient: {
    aspectRatio: 1.62,
    position: "relative",
  },
  horizontalZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  homeZoneDefense: { left: 0, width: "16.66%" },
  homeZoneMidfield: { left: "16.66%", width: "16.66%" },
  homeZoneAttack: { left: "33.32%", width: "16.68%" },
  awayZoneAttack: { left: "50%", width: "16.68%" },
  awayZoneMidfield: { left: "66.68%", width: "16.66%" },
  awayZoneDefense: { right: 0, width: "16.66%" },
  fieldBorder: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  fieldMidline: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: "50%",
    width: 1,
    marginLeft: -0.5,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  fieldCenterCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 64,
    height: 64,
    borderRadius: 32,
    marginLeft: -32,
    marginTop: -32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  fieldCenterSpot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginTop: -3,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  leftPenaltyArea: {
    position: "absolute",
    left: 8,
    top: "22%",
    width: "16%",
    height: "56%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    borderLeftWidth: 0,
  },
  leftGoalArea: {
    position: "absolute",
    left: 8,
    top: "35%",
    width: "7.5%",
    height: "30%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    borderLeftWidth: 0,
  },
  rightPenaltyArea: {
    position: "absolute",
    right: 8,
    top: "22%",
    width: "16%",
    height: "56%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    borderRightWidth: 0,
  },
  rightGoalArea: {
    position: "absolute",
    right: 8,
    top: "35%",
    width: "7.5%",
    height: "30%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    borderRightWidth: 0,
  },
  leftGoalSlot: {
    position: "absolute",
    left: 3,
    top: "43%",
    width: 5,
    height: "14%",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  rightGoalSlot: {
    position: "absolute",
    right: 3,
    top: "43%",
    width: 5,
    height: "14%",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  leftPenaltySpot: {
    position: "absolute",
    left: "11.5%",
    top: "50%",
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: -2,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  rightPenaltySpot: {
    position: "absolute",
    right: "11.5%",
    top: "50%",
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: -2,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  leftArc: {
    position: "absolute",
    left: "16.7%",
    top: "39%",
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderLeftWidth: 0,
    backgroundColor: "transparent",
  },
  rightArc: {
    position: "absolute",
    right: "16.7%",
    top: "39%",
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRightWidth: 0,
    backgroundColor: "transparent",
  },
  zoneLabelChip: {
    position: "absolute",
    top: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  zoneLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    color: "rgba(255,255,255,0.58)",
    letterSpacing: 1.5,
  },
  shotDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    marginLeft: -4,
    marginTop: -4,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDotOutline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  legendZone: {
    width: 14,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  shotStatsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  shotStatCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  shotStatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    minWidth: 18,
    textAlign: "center",
  },
  shotStatLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  laneSummaryRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  laneCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  laneTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  laneTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  laneFillHome: { backgroundColor: COLORS.accent },
  laneFillAway: { backgroundColor: "#5B8DEF" },
  laneFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  laneHomeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.accent },
  laneAwayText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#5B8DEF" },
  possessionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  possessionTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
  },
  possessionHome: {
    backgroundColor: COLORS.accent,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  possessionAway: {
    backgroundColor: "#5B8DEF",
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  possessionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    minWidth: 32,
    textAlign: "center",
  },
});

function StatsBarsInner({ homeTeam, awayTeam, homeStats, awayStats }: { homeTeam: string; awayTeam: string; homeStats: any; awayStats: any }) {
  const STAT_LABELS: Record<string, string> = {
    // Core / Possession
    ball_possession:       "Possession %",
    possession:            "Possession %",
    possessionPct:         "Possession %",
    // Shots
    total_shots:           "Total Shots",
    shots:                 "Total Shots",
    totalShots:            "Total Shots",
    shots_on_goal:         "Shots on Target",
    shots_on_target:       "Shots on Target",
    shotsOnTarget:         "Shots on Target",
    shotsOnGoal:           "Shots on Target",
    shots_off_goal:        "Shots off Target",
    shots_off_target:      "Shots off Target",
    shotsOffTarget:        "Shots off Target",
    blocked_shots:         "Shots Blocked",
    shots_blocked:         "Shots Blocked",
    blockedShots:          "Shots Blocked",
    shots_insidebox:       "Shots Inside Box",
    shotsInsideBox:        "Shots Inside Box",
    shots_outsidebox:      "Shots Outside Box",
    shotsOutsideBox:       "Shots Outside Box",
    big_chances:           "Big Chances",
    bigChances:            "Big Chances",
    big_chances_missed:    "Big Chances Missed",
    bigChancesMissed:      "Big Chances Missed",
    expected_goals:        "Expected Goals (xG)",
    xg:                    "Expected Goals (xG)",
    expectedGoals:         "Expected Goals (xG)",
    goals_prevented:       "Goals Prevented",
    goalsPrevented:        "Goals Prevented",
    hit_woodwork:          "Hit Woodwork",
    hitWoodwork:           "Hit Woodwork",
    // Attacking
    corner_kicks:          "Corners",
    corners:               "Corners",
    cornerKicks:           "Corners",
    crosses:               "Crosses",
    crossesTotal:          "Crosses",
    crosses_successful:    "Successful Crosses",
    successful_dribbles:   "Successful Dribbles",
    dribbles_completed:    "Successful Dribbles",
    dribblesCompleted:     "Successful Dribbles",
    dribbles_attempted:    "Dribbles Attempted",
    offsides:              "Offsides",
    // Passing
    total_passes:          "Total Passes",
    totalPasses:           "Total Passes",
    passes:                "Total Passes",
    accurate_passes:       "Accurate Passes",
    accuratePasses:        "Accurate Passes",
    pass_accuracy:         "Pass Accuracy %",
    passAccuracy:          "Pass Accuracy %",
    key_passes:            "Key Passes",
    keyPasses:             "Key Passes",
    passes_final_third:    "Passes in Final Third",
    passesFinalThird:      "Passes in Final Third",
    touches_in_box:        "Touches In Box",
    touchesInBox:          "Touches In Box",
    progressive_passes:    "Progressive Passes",
    progressivePasses:     "Progressive Passes",
    through_balls:         "Through Balls",
    throughBalls:          "Through Balls",
    long_balls:            "Long Balls",
    longBalls:             "Long Balls",
    long_balls_accurate:   "Accurate Long Balls",
    // Defending
    total_tackles:         "Tackles",
    tackles:               "Tackles",
    tacklesWon:            "Tackles",
    interceptions:         "Interceptions",
    clearances:            "Clearances",
    blocks:                "Blocks",
    aerial_won:            "Aerial Duels Won",
    aerialWon:             "Aerial Duels Won",
    total_duels:           "Total Duels",
    totalDuels:            "Total Duels",
    duels_won:             "Duels Won",
    duelsWon:              "Duels Won",
    ground_duels_won:      "Ground Duels Won",
    // Goalkeeping
    goalkeeper_saves:      "Saves",
    saves:                 "Saves",
    goalkeeperSaves:       "Saves",
    punches:               "Punches",
    // Discipline
    fouls:                 "Fouls Committed",
    foulsCommitted:        "Fouls Committed",
    yellow_cards:          "Yellow Cards",
    yellowCards:           "Yellow Cards",
    red_cards:             "Red Cards",
    redCards:              "Red Cards",
    // Other
    throw_ins:             "Throw-ins",
    throwIns:              "Throw-ins",
    free_kicks:            "Free Kicks",
    freeKicks:             "Free Kicks",
    goal_kicks:            "Goal Kicks",
    goalKicks:             "Goal Kicks",
  };

  const STAT_SECTIONS: { label: string; icon: string; keys: string[] }[] = [
    {
      label: "CORE",
      icon: "chart-box-outline",
      keys: ["ball_possession", "possession", "possessionPct", "total_shots", "shots", "totalShots",
             "shots_on_goal", "shots_on_target", "shotsOnTarget", "shotsOnGoal",
             "shots_off_goal", "shots_off_target", "shotsOffTarget",
             "blocked_shots", "shots_blocked", "blockedShots",
             "shots_insidebox", "shotsInsideBox", "shots_outsidebox", "shotsOutsideBox",
             "big_chances", "bigChances", "big_chances_missed", "bigChancesMissed",
             "expected_goals", "xg", "expectedGoals", "hit_woodwork", "hitWoodwork"],
    },
    {
      label: "ATTACKING",
      icon: "target",
      keys: ["corner_kicks", "corners", "cornerKicks", "crosses", "crossesTotal", "crosses_successful",
             "successful_dribbles", "dribbles_completed", "dribblesCompleted", "dribbles_attempted", "offsides"],
    },
    {
      label: "PASSING",
      icon: "vector-polyline",
      keys: ["total_passes", "totalPasses", "passes", "accurate_passes", "accuratePasses",
             "pass_accuracy", "passAccuracy", "key_passes", "keyPasses",
             "passes_final_third", "passesFinalThird", "long_balls", "longBalls", "long_balls_accurate"],
    },
    {
      label: "DEFENDING",
      icon: "shield-outline",
      keys: ["total_tackles", "tackles", "tacklesWon", "interceptions", "clearances", "blocks",
             "aerial_won", "aerialWon", "total_duels", "totalDuels", "duels_won", "duelsWon", "ground_duels_won"],
    },
    {
      label: "GOALKEEPING",
      icon: "hand-back-right-outline",
      keys: ["goalkeeper_saves", "saves", "goalkeeperSaves", "goals_prevented", "goalsPrevented", "punches"],
    },
    {
      label: "DISCIPLINE",
      icon: "clipboard-alert-outline",
      keys: ["fouls", "foulsCommitted", "yellow_cards", "yellowCards", "red_cards", "redCards"],
    },
  ];

  const seenLabels = new Set<string>();
  const dedupedStats = Object.keys(STAT_LABELS).filter((k) => {
    const label = STAT_LABELS[k];
    const hasData = (homeStats?.[k] != null && String(homeStats[k]).trim() !== "") ||
                    (awayStats?.[k] != null && String(awayStats[k]).trim() !== "");
    if (!hasData) return false;
    if (seenLabels.has(label)) return false;
    seenLabels.add(label);
    return true;
  });

  if (dedupedStats.length === 0) {
    return (
      <View style={styles.infoCard}>
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
          <Ionicons name="stats-chart-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.noStatsText}>{tFn("matchDetail.statsLoadingDuringMatch")}</Text>
        </View>
      </View>
    );
  }

  const renderStatRow = (key: string, idx: number, arr: string[]) => {
    const rawH = String(homeStats?.[key] ?? "0");
    const rawA = String(awayStats?.[key] ?? "0");
    const hVal = parseFloat(rawH.replace("%", "")) || 0;
    const aVal = parseFloat(rawA.replace("%", "")) || 0;
    const bothZero = hVal === 0 && aVal === 0;
    const total = bothZero ? 1 : (hVal + aVal || 1);
    const hPct = bothZero ? 0 : (hVal / total) * 100;
    const aPct = bothZero ? 0 : 100 - hPct;
    const isPossession = key === "ball_possession" || key === "possession" || key === "pass_accuracy";
    const isLast = idx === arr.length - 1;
    const hDisplay = `${homeStats?.[key] ?? "0"}${isPossession && typeof homeStats?.[key] === "number" ? "%" : ""}`;
    const aDisplay = `${awayStats?.[key] ?? "0"}${isPossession && typeof awayStats?.[key] === "number" ? "%" : ""}`;
    return (
      <View key={key}>
        <View style={styles.statRow}>
          <View style={styles.statValueCol}>
            <Text style={styles.statSideLabel}>HOME</Text>
            <Text style={[styles.statVal, hVal > aVal && styles.statValWinner, styles.statValHome]}>{hDisplay}</Text>
          </View>
          <View style={styles.statBarContainer}>
            <Text style={styles.statName} numberOfLines={1}>{STAT_LABELS[key]}</Text>
            <View style={styles.statBarsWrapper}>
              {/* Home bar — grows right-to-left from center */}
              <View style={styles.statBarHalf}>
                {hPct < 100 ? <View style={{ flex: 100 - hPct }} /> : null}
                {hPct > 0 ? <View style={[styles.statBarHomeFill, { flex: hPct }]} /> : null}
              </View>
              <View style={styles.statBarCenterGap} />
              {/* Away bar — grows left-to-right from center */}
              <View style={styles.statBarHalf}>
                {aPct > 0 ? <View style={[styles.statBarAwayFill, { flex: aPct }]} /> : null}
                {aPct < 100 ? <View style={{ flex: 100 - aPct }} /> : null}
              </View>
            </View>
          </View>
          <View style={[styles.statValueCol, styles.statValueColRight]}>
            <Text style={[styles.statSideLabel, styles.statSideLabelRight]}>AWAY</Text>
            <Text style={[styles.statVal, styles.statValRight, aVal > hVal && styles.statValWinner, styles.statValAway]}>{aDisplay}</Text>
          </View>
        </View>
        {!isLast && <View style={styles.statDivider} />}
      </View>
    );
  };

  const sectionedKeys = new Set(STAT_SECTIONS.flatMap(s => s.keys));
  const unsectionedStats = dedupedStats.filter(k => !sectionedKeys.has(k));

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.statsHeaderCard}>
        <View style={styles.statsTeamHeader}>
          <View style={styles.statsTeamSide}>
            <View style={[styles.statsLegendDot, { backgroundColor: COLORS.accent }]} />
            <Text style={[styles.statsTeamName, { textAlign: "left" }]} numberOfLines={1}>{safeStr(homeTeam)}</Text>
          </View>
          <Text style={styles.statsVsLabel}>VS</Text>
          <View style={[styles.statsTeamSide, { justifyContent: "flex-end" }]}>
            <Text style={[styles.statsTeamName, { textAlign: "right" }]} numberOfLines={1}>{safeStr(awayTeam)}</Text>
            <View style={[styles.statsLegendDot, { backgroundColor: "#5B8DEF" }]} />
          </View>
        </View>
        {dedupedStats.length > 0 && (() => {
          let homeWins = 0, awayWins = 0;
          dedupedStats.forEach(k => {
            const hV = parseFloat(String(homeStats?.[k] ?? "0").replace("%", "")) || 0;
            const aV = parseFloat(String(awayStats?.[k] ?? "0").replace("%", "")) || 0;
            if (hV > aV) homeWins++;
            else if (aV > hV) awayWins++;
          });
          const total = homeWins + awayWins;
          const homePct = total === 0 ? 50 : Math.round((homeWins / total) * 100);
          return (
            <View style={styles.momentumContainer}>
              <Text style={styles.momentumLabel}>DOMINANTIE</Text>
              <View style={styles.momentumTrack}>
                <View style={[styles.momentumHome, { flex: Math.max(1, homePct) }]} />
                <View style={[styles.momentumAway, { flex: Math.max(1, 100 - homePct) }]} />
              </View>
              <View style={styles.momentumFooter}>
                <Text style={styles.momentumHomeLabel}>{homeWins} stat{homeWins !== 1 ? "s" : ""}</Text>
                <Text style={styles.momentumAwayLabel}>{awayWins} stat{awayWins !== 1 ? "s" : ""}</Text>
              </View>
            </View>
          );
        })()}
      </View>
      {STAT_SECTIONS.map(section => {
        const sectionStats = section.keys.filter(k => dedupedStats.includes(k));
        if (sectionStats.length === 0) return null;
        return (
          <View key={section.label} style={styles.statSectionCard}>
            <View style={styles.statSectionHeader}>
              <View style={styles.statSectionAccent} />
              <MaterialCommunityIcons name={section.icon as any} size={15} color={COLORS.accent} />
              <Text style={styles.statSectionTitle}>{section.label}</Text>
            </View>
            {sectionStats.map((k, i, a) => renderStatRow(k, i, a))}
          </View>
        );
      })}
      {unsectionedStats.length > 0 && (
        <View style={styles.statSectionCard}>
          <View style={styles.statSectionHeader}>
            <View style={styles.statSectionAccent} />
            <Text style={styles.statSectionTitle}>OTHER</Text>
          </View>
          {unsectionedStats.map((k, i, a) => renderStatRow(k, i, a))}
        </View>
      )}
    </View>
  );
}

const StatsBars = React.memo(StatsBarsInner);

function PlayerRow({ player, sport, compact = false, teamName = "", league = "eng.1" }: { player: any; sport: string; compact?: boolean; teamName?: string; league?: string }) {
  const seed = useMemo(() => ({
    id: String(player?.id || ""),
    name: String(player?.name || ""),
    team: String(teamName || player?.team || ""),
    league: String(league || "eng.1"),
    sport: String(sport || "soccer"),
    nationality: String(player?.nationality || ""),
    position: String(player?.position || player?.positionName || ""),
    age: Number(player?.age || 0) || undefined,
    photo: player?.photo || null,
    theSportsDbPhoto: player?.theSportsDbPhoto || null,
  }), [player?.id, player?.name, player?.team, player?.nationality, player?.position, player?.positionName, player?.age, player?.photo, player?.theSportsDbPhoto, teamName, league, sport]);

  const [resolvedPhoto, setResolvedPhoto] = useState<string | null>(getBestCachedOrSeedPlayerImage(seed));
  const [imageFailed, setImageFailed] = useState(false);
  const photoUri = !imageFailed ? resolvedPhoto : null;

  useEffect(() => {
    setResolvedPhoto(getBestCachedOrSeedPlayerImage(seed));
    setImageFailed(false);
  }, [seed]);

  useEffect(() => {
    let disposed = false;
    void resolvePlayerImageUri(seed, { allowNetwork: true }).then((uri) => {
      if (disposed || !uri) return;
      setResolvedPhoto(uri);
      setImageFailed(false);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [seed]);

  const compactStyle = compact ? styles.playerRowCompact : null;
  const handleOpenProfile = () => {
    router.push({
      pathname: "/player-profile",
      params: {
        playerId: String(player?.id || ""),
        name: String(player?.name || ""),
        team: String(teamName || ""),
        league: String(league || "eng.1"),
        marketValue: String(player?.marketValue || ""),
        age: player?.age ? String(player.age) : "",
        height: String(player?.height || ""),
        weight: String(player?.weight || ""),
        position: String(player?.positionName || player?.position || ""),
        nationality: String(player?.nationality || ""),
      },
    });
  };

  return (
    <TouchableOpacity style={[styles.playerRow, compactStyle]} activeOpacity={0.82} onPress={handleOpenProfile}>
      <View style={styles.playerJersey}>
        <Text style={styles.playerJerseyNum}>{player.jersey || "—"}</Text>
      </View>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={styles.playerPhoto}
          onError={() => {
            setImageFailed(true);
          }}
        />
      ) : (
        <View style={[styles.playerPhoto, styles.playerPhotoPlaceholder]}>
          <Ionicons name="person" size={16} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.playerInfo}>
        <View style={styles.playerNameRow}>
          <Text style={[styles.playerName, compact ? styles.playerNameCompact : null]} numberOfLines={1}>{player.name}</Text>
          {!compact && player.marketValue ? (
            <Text style={styles.playerInlineValue} numberOfLines={1}>{player.marketValue}</Text>
          ) : null}
        </View>
        <Text style={[styles.playerPos, compact ? styles.playerPosCompact : null]} numberOfLines={1}>{player.positionName || player.position}</Text>
      </View>
      {!compact && <View style={{ alignItems: "flex-end", gap: 4 }}>
        {player.marketValue && (
          <View style={styles.marketValueBadge}>
            <MaterialCommunityIcons name="trending-up" size={10} color="#00C896" />
            <Text style={styles.marketValueText}>{player.marketValue}</Text>
          </View>
        )}
        {player.starter && (
          <View style={styles.starterBadge}>
            <Text style={styles.starterText}>{tFn("matchDetail.starter")}</Text>
          </View>
        )}
      </View>}
    </TouchableOpacity>
  );
}

function shortPlayerName(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length <= 1) return (parts[0] || "").slice(0, 9);
  return `${parts[0][0]}. ${parts[parts.length - 1]}`.slice(0, 12);
}

function PitchDot({ player, color, teamName, league, rowSize = 4 }: { player: any; color: string; teamName?: string; league?: string; rowSize?: number }) {
  const seed = useMemo(() => ({
    id: String(player?.id || ""),
    name: String(player?.name || ""),
    team: String(teamName || player?.team || ""),
    league: String(league || "eng.1"),
    sport: "soccer",
    nationality: String(player?.nationality || ""),
    position: String(player?.position || player?.positionName || ""),
    age: Number(player?.age || 0) || undefined,
    photo: player?.photo || null,
    theSportsDbPhoto: player?.theSportsDbPhoto || null,
  }), [player?.id, player?.name, player?.team, player?.nationality, player?.position, player?.positionName, player?.age, player?.photo, player?.theSportsDbPhoto, teamName, league]);

  const [resolvedPhoto, setResolvedPhoto] = React.useState<string | null>(getBestCachedOrSeedPlayerImage(seed));
  const [imageFailed, setImageFailed] = React.useState(false);
  const currentPhoto = !imageFailed ? resolvedPhoto : null;
  const showPhoto = Boolean(currentPhoto);
  const tightRow = rowSize >= 4;
  const circleSize = tightRow ? 34 : 40;
  const wrapSize = tightRow ? 58 : 68;
  const showName = rowSize <= 3;

  useEffect(() => {
    setResolvedPhoto(getBestCachedOrSeedPlayerImage(seed));
    setImageFailed(false);
  }, [seed]);

  useEffect(() => {
    let disposed = false;
    void resolvePlayerImageUri(seed, { allowNetwork: true }).then((uri) => {
      if (disposed || !uri) return;
      setResolvedPhoto(uri);
      setImageFailed(false);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [seed]);

  return (
    <View style={[styles.pitchDotWrap, { width: wrapSize, maxWidth: wrapSize }]}>
      <View style={[styles.pitchDotCircle, { borderColor: color, width: circleSize, height: circleSize, borderRadius: tightRow ? 7 : 8 }]}>
        {showPhoto ? (
          <Image
            source={{ uri: currentPhoto! }}
            style={[styles.pitchDotPhoto, { width: circleSize - 3, height: circleSize - 3, borderRadius: tightRow ? 6 : 7 }]}
            onError={() => {
              setImageFailed(true);
            }}
          />
        ) : null}
        {!showPhoto ? <Ionicons name="person" size={tightRow ? 13 : 15} color={COLORS.textMuted} /> : null}
      </View>
      {showName ? <Text style={styles.pitchDotName} numberOfLines={1}>{shortPlayerName(player.name)}</Text> : null}
    </View>
  );
}

function CombinedPitchViewInner({ homeTeamData, awayTeamData, league }: { homeTeamData: any; awayTeamData: any; league?: string }) {
  const homeColumns = [...buildFormationRows(homeTeamData?.players || [], homeTeamData?.formation)].reverse();
  const awayColumns = buildFormationRows(awayTeamData?.players || [], awayTeamData?.formation);

  return (
    <LinearGradient colors={["#07150f", "#0b2418", "#123423", "#123423", "#0b2418", "#07150f"]} style={styles.combinedPitch}>
      <View style={styles.pitchFieldBorder} />
      <View style={styles.pitchVerticalCenterLine} />
      <View style={styles.pitchHorizontalCenterLine} />
      <View style={styles.pitchCenterCircleWide} />
      <View style={styles.pitchCenterSpotWide} />
      <View style={styles.pitchPenaltyBoxLeft} />
      <View style={styles.pitchGoalBoxLeft} />
      <View style={styles.pitchPenaltyBoxRight} />
      <View style={styles.pitchGoalBoxRight} />
      <View style={styles.pitchArcLeft} />
      <View style={styles.pitchArcRight} />

      <View style={styles.pitchTopTeamsRow}>
        <View style={styles.pitchTopTeamCard}>
          <TeamLogo uri={homeTeamData?.logo || null} teamName={homeTeamData?.team || "Home"} size={28} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pitchTopTeamName, { color: COLORS.accent }]} numberOfLines={1}>{homeTeamData?.team}</Text>
            {homeTeamData?.formation ? <Text style={styles.pitchTopTeamMeta}>{homeTeamData.formation}</Text> : null}
          </View>
        </View>
        <View style={styles.pitchTopBadge}><Text style={styles.pitchTopBadgeText}>LINEUP</Text></View>
        <View style={[styles.pitchTopTeamCard, { justifyContent: "flex-end" }]}>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[styles.pitchTopTeamName, { color: "#5D9EFF", textAlign: "right" }]} numberOfLines={1}>{awayTeamData?.team}</Text>
            {awayTeamData?.formation ? <Text style={styles.pitchTopTeamMeta}>{awayTeamData.formation}</Text> : null}
          </View>
          <TeamLogo uri={awayTeamData?.logo || null} teamName={awayTeamData?.team || "Away"} size={28} />
        </View>
      </View>

      <View style={styles.pitchHorizontalFormationRow}>
        <View style={styles.pitchHalfSide}>
          {homeColumns.map((column, columnIndex) => (
            <View key={`home_col_${columnIndex}`} style={styles.pitchVerticalColumn}>
              {column.map((player: any, playerIndex: number) => (
                <PitchDot
                  key={`home_${player?.id || player?.name || playerIndex}`}
                  player={player}
                  color={COLORS.accent}
                  teamName={homeTeamData?.team}
                  league={league}
                  rowSize={column.length}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.pitchMiddleDividerCol}>
          <View style={styles.pitchMidBadge}><Text style={styles.pitchMidBadgeText}>MIDFIELD</Text></View>
        </View>

        <View style={styles.pitchHalfSide}>
          {awayColumns.map((column, columnIndex) => (
            <View key={`away_col_${columnIndex}`} style={styles.pitchVerticalColumn}>
              {column.map((player: any, playerIndex: number) => (
                <PitchDot
                  key={`away_${player?.id || player?.name || playerIndex}`}
                  player={player}
                  color="#5D9EFF"
                  teamName={awayTeamData?.team}
                  league={league}
                  rowSize={column.length}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const CombinedPitchView = React.memo(CombinedPitchViewInner);


function FormBubbles({ form }: { form: string }) {

  const homeShortName = homeTeam;
  const awayShortName = awayTeam;

  return (
    <View style={{ gap: 12 }}>
      {/* Main prediction card */}
      <LinearGradient colors={["rgba(0,212,255,0.12)", "rgba(0,212,255,0.04)"]} style={styles.aiMainCard}>
        <View style={styles.aiHeader}>
          <MaterialCommunityIcons name="robot" size={20} color={COLORS.accent} />
          <Text style={styles.aiTitle}>AI Match Intelligence</Text>
          <View style={styles.aiConfidenceBadge}>
            <Text style={styles.aiConfidenceText}>{prediction.confidence}% zekerheid</Text>
          </View>
        </View>

        {/* Confidence meter bar */}
        {prediction.confidence != null && (
          <View style={{ marginBottom: 12, gap: 4 }}>
            <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <View style={{
                height: "100%",
                width: `${Math.min(100, Number(prediction.confidence) || 0)}%`,
                borderRadius: 2,
                backgroundColor: Number(prediction.confidence) >= 70 ? "#4CAF82" :
                                 Number(prediction.confidence) >= 50 ? "#FFB833" : "#FF5252",
              }} />
            </View>
          </View>
        )}

        {prediction?.providerError && prediction?.insufficientData ? (
          <View style={styles.aiWarnCard}>
            <MaterialCommunityIcons name="alert-outline" size={14} color={COLORS.gold} />
            <Text style={styles.aiWarnText}>{tFn("matchDetail.insufficientData")}</Text>
          </View>
        ) : null}

        <Text style={[styles.aiPrediction, { color: winnerColor }]}>
          {prediction.prediction === "Home Win" ? tFn("matchDetail.wins", { team: homeTeam }) :
           prediction.prediction === "Away Win" ? tFn("matchDetail.wins", { team: awayTeam }) : tFn("matchDetail.draw")}
        </Text>

        {prediction.predictedScore && (
          <Text style={styles.aiScore}>{tFn("matchDetail.expectedScore")} {prediction.predictedScore}</Text>
        )}

        {prediction.confidenceReason ? (
          <View style={styles.aiWarnCard}>
            <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.accent} />
            <Text style={styles.aiWarnText}>{prediction.confidenceReason}</Text>
          </View>
        ) : null}

        {/* 3-column Win / Draw / Loss chances */}
        <View style={styles.chanceRow}>
          <View style={[styles.chanceBlock, { borderColor: `${COLORS.accent}44` }]}>
            <Text style={[styles.chancePct, { color: COLORS.accent }]}>{normPcts.homePct}%</Text>
            <Text style={styles.chanceLabel} numberOfLines={1}>{homeShortName}</Text>
            <Text style={styles.chanceSubLabel}>Wint</Text>
          </View>
          <View style={[styles.chanceBlock, { borderColor: "rgba(255,215,0,0.3)" }]}>
            <Text style={[styles.chancePct, { color: "#FFD700" }]}>{normPcts.drawPct}%</Text>
            <Text style={styles.chanceLabel}>Gelijk</Text>
            <Text style={styles.chanceSubLabel}>Kans</Text>
          </View>
          <View style={[styles.chanceBlock, { borderColor: `${COLORS.live}44` }]}>
            <Text style={[styles.chancePct, { color: COLORS.live }]}>{normPcts.awayPct}%</Text>
            <Text style={styles.chanceLabel} numberOfLines={1}>{awayShortName}</Text>
            <Text style={styles.chanceSubLabel}>Wint</Text>
          </View>
        </View>

        {/* xG row */}
        {hasXgData ? (
          <View style={styles.xgRow}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={styles.xgValue}>{prediction.xgHome}</Text>
              <Text style={styles.xgLabel}>xG {homeShortName}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted }}>Expected Goals</Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={[styles.xgValue, { color: COLORS.live }]}>{prediction.xgAway}</Text>
              <Text style={styles.xgLabel}>xG {awayShortName}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.aiWarnCard}>
            <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.aiWarnText}>xG: {tFn("matchDetail.insufficientDataShort")}</Text>
          </View>
        )}
      </LinearGradient>

      {(hasMarketMetrics || hasEdgeScore) ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>SMART MARKETS</Text>
          <View style={styles.marketGrid}>
            {Number.isFinite(bttsPct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>BTTS</Text>
                <Text style={styles.marketValue}>{Math.round(bttsPct)}%</Text>
                <Text style={styles.marketSub}>{tFn("matchDetail.btts")}</Text>
              </View>
            ) : null}
            {Number.isFinite(over25Pct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>Over 2.5</Text>
                <Text style={styles.marketValue}>{Math.round(over25Pct)}%</Text>
                <Text style={styles.marketSub}>{tFn("matchDetail.totalGoals")}</Text>
              </View>
            ) : null}
            {Number.isFinite(homeDcPct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>1X</Text>
                <Text style={styles.marketValue}>{Math.round(homeDcPct)}%</Text>
                <Text style={styles.marketSub}>{homeShortName} {tFn("matchDetail.orDraw")}</Text>
              </View>
            ) : null}
            {Number.isFinite(awayDcPct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>X2</Text>
                <Text style={styles.marketValue}>{Math.round(awayDcPct)}%</Text>
                <Text style={styles.marketSub}>{awayShortName} {tFn("matchDetail.orDraw")}</Text>
              </View>
            ) : null}
          </View>
          {hasEdgeScore ? (
            <View style={styles.edgeRow}>
              <Text style={styles.edgeLabel}>Model edge</Text>
              <Text style={styles.edgeValue}>{Math.round(edgeScore)}/100</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>{tFn("matchDetail.aiSignals")}</Text>
        <View style={styles.marketGrid}>
          <View style={styles.marketCard}>
            <Text style={styles.marketLabel}>{tFn("matchDetail.winTilt")}</Text>
            <Text style={styles.marketValue}>{winGapPct}%</Text>
            <Text style={styles.marketSub}>{tFn("matchDetail.winTiltSub")}</Text>
          </View>
          <View style={styles.marketCard}>
            <Text style={styles.marketLabel}>{tFn("matchDetail.volatility")}</Text>
            <Text style={styles.marketValue}>{volatilityScore}%</Text>
            <Text style={styles.marketSub}>{tFn("matchDetail.volatilityDesc")}</Text>
          </View>
          {totalXg !== null ? (
            <View style={styles.marketCard}>
              <Text style={styles.marketLabel}>{tFn("matchDetail.goalExpectancy")}</Text>
              <Text style={styles.marketValue}>{totalXg.toFixed(2)}</Text>
              <Text style={styles.marketSub}>{tFn("matchDetail.expectedTotalXg")}</Text>
            </View>
          ) : null}
          <View style={styles.marketCard}>
            <Text style={styles.marketLabel}>{tFn("matchDetail.aiBand")}</Text>
            <Text style={[styles.marketValue, { color: recommendationColor }]}>{recommendationLabel}</Text>
            <Text style={styles.marketSub}>{tFn("matchDetail.modelEstimate")}</Text>
          </View>
        </View>
      </View>

      {/* Next goal probability */}
      {prediction.nextGoalProbability != null && (
        <View style={styles.nextGoalCard}>
          <View style={styles.nextGoalHeader}>
            <MaterialCommunityIcons name="soccer" size={14} color={COLORS.accent} />
            <Text style={styles.nextGoalTitle}>{tFn("matchDetail.nextGoalChance")}</Text>
            <Text style={styles.nextGoalPct}>{prediction.nextGoalProbability}%</Text>
          </View>
          <View style={styles.nextGoalBar}>
            <View style={[styles.nextGoalFill, { width: `${Math.min(100, prediction.nextGoalProbability)}%` as any }]} />
          </View>
        </View>
      )}

      {/* Meta row: momentum, danger, risk */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {prediction.momentum && (
          <View style={[styles.metaBadge, { flex: 1 }]}>
            <MaterialCommunityIcons name="trending-up" size={14} color={COLORS.accent} />
            <Text style={styles.metaBadgeLabel}>{tFn("matchDetail.momentum")}</Text>
            <Text style={styles.metaBadgeValue}>{prediction.momentum}</Text>
          </View>
        )}
        {prediction.danger && (
          <View style={[styles.metaBadge, { flex: 1 }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.live} />
            <Text style={styles.metaBadgeLabel}>{tFn("matchDetail.danger")}</Text>
            <Text style={styles.metaBadgeValue}>{prediction.danger.replace(" Attack", "")}</Text>
          </View>
        )}
        {prediction.riskLevel && (
          <View style={[styles.metaBadge, { flex: 1 }]}>
            <MaterialCommunityIcons name="shield-outline" size={14} color={riskColor} />
            <Text style={styles.metaBadgeLabel}>{tFn("matchDetail.risk")}</Text>
            <Text style={[styles.metaBadgeValue, { color: riskColor }]}>{prediction.riskLevel}</Text>
          </View>
        )}
      </View>

      {/* Summary */}
      {prediction.summary && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>{tFn("matchDetail.tacticalAnalysis")}</Text>
          <Text style={styles.aiSummary}>{prediction.summary}</Text>
        </View>
      )}

      {/* Key factors */}
      {prediction.keyFactors?.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>{tFn("matchDetail.keyFactors")}</Text>
          {prediction.keyFactors.map((f: string, i: number) => (
            <View key={i} style={styles.factorRow}>
              <View style={styles.factorDot} />
              <Text style={styles.factorText}>{f}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tactical notes */}
      {prediction.tacticalNotes?.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>{tFn("matchDetail.tacticalNotes")}</Text>
          {prediction.tacticalNotes.map((n: string, i: number) => (
            <View key={i} style={styles.factorRow}>
              <MaterialCommunityIcons name="chess-rook" size={12} color={COLORS.accent} />
              <Text style={[styles.factorText, { marginLeft: 4 }]}>{n}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Formation + Pressure index */}
      {(prediction.formation || prediction.pressureIndex != null) && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>FORMATIE & PRESSING</Text>
          {prediction.formation && (
            <View style={styles.factorRow}>
              <MaterialCommunityIcons name="soccer-field" size={13} color={COLORS.accent} />
              <Text style={[styles.factorText, { marginLeft: 4 }]}>{prediction.formation}</Text>
            </View>
          )}
          {prediction.pressureIndex != null && (
            <View style={[styles.factorRow, { marginTop: 6 }]}>
              <Text style={[styles.infoCardTitle, { fontSize: 10, marginBottom: 0 }]}>PRESSING THUISPLOEG</Text>
              <View style={{ flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, marginLeft: 8, overflow: "hidden" }}>
                <View style={{ width: `${Math.min(100, Number(prediction.pressureIndex) || 0)}%`, height: "100%", backgroundColor: COLORS.accent, borderRadius: 3 }} />
              </View>
              <Text style={[styles.factorText, { marginLeft: 6, minWidth: 28, textAlign: "right" }]}>{Number(prediction.pressureIndex) || 0}</Text>
            </View>
          )}
        </View>
      )}

      {/* Form bubbles */}
      {(prediction.formHome || prediction.formAway) && (
        <View style={styles.formRow}>
          {prediction.formHome && (
            <View style={[styles.formCard, { flex: 1 }]}>
              <Text style={styles.formTeamName}>{homeShortName}</Text>
              <FormBubbles form={prediction.formHome} />
            </View>
          )}
          {prediction.formAway && (
            <View style={[styles.formCard, { flex: 1 }]}>
              <Text style={styles.formTeamName}>{awayShortName}</Text>
              <FormBubbles form={prediction.formAway} />
            </View>
          )}
        </View>
      )}

      {/* H2H */}
      {prediction.h2hSummary && (
        <View style={styles.tipCard}>
          <MaterialCommunityIcons name="history" size={15} color={COLORS.accent} />
          <Text style={styles.tipText}>{prediction.h2hSummary}</Text>
        </View>
      )}

      {/* Match Insight */}
      {prediction.matchInsight && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>MATCH INSIGHT</Text>
          <Text style={styles.aiSummary}>{prediction.matchInsight}</Text>
        </View>
      )}

      {/* Form Guide — detailed descriptions */}
      {prediction.formGuide && (prediction.formGuide.homeForm || prediction.formGuide.awayForm) && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>FORM GUIDE</Text>
          {prediction.formGuide.homeForm && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.factorText, { color: COLORS.accent, fontFamily: "Inter_600SemiBold", marginBottom: 4 }]}>{homeShortName}</Text>
              <Text style={styles.aiSummary}>{prediction.formGuide.homeForm}</Text>
            </View>
          )}
          {prediction.formGuide.awayForm && (
            <View>
              <Text style={[styles.factorText, { color: COLORS.live, fontFamily: "Inter_600SemiBold", marginBottom: 4 }]}>{awayShortName}</Text>
              <Text style={styles.aiSummary}>{prediction.formGuide.awayForm}</Text>
            </View>
          )}
        </View>
      )}

      {/* Tactical Edge — strengths vs weaknesses */}
      {prediction.tacticalEdge && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>TACTICAL EDGE</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.factorText, { color: COLORS.accent, fontFamily: "Inter_600SemiBold", marginBottom: 6, textAlign: "center" }]}>{homeShortName}</Text>
              {(prediction.tacticalEdge.homeStrengths || []).map((s: string, i: number) => (
                <View key={`hs-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <MaterialCommunityIcons name="arrow-up-bold" size={11} color="#4CAF50" />
                  <Text style={[styles.factorText, { fontSize: 12 }]}>{s}</Text>
                </View>
              ))}
              {(prediction.tacticalEdge.homeWeaknesses || []).map((w: string, i: number) => (
                <View key={`hw-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <MaterialCommunityIcons name="arrow-down-bold" size={11} color={COLORS.live} />
                  <Text style={[styles.factorText, { fontSize: 12 }]}>{w}</Text>
                </View>
              ))}
            </View>
            <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.factorText, { color: COLORS.live, fontFamily: "Inter_600SemiBold", marginBottom: 6, textAlign: "center" }]}>{awayShortName}</Text>
              {(prediction.tacticalEdge.awayStrengths || []).map((s: string, i: number) => (
                <View key={`as-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <MaterialCommunityIcons name="arrow-up-bold" size={11} color="#4CAF50" />
                  <Text style={[styles.factorText, { fontSize: 12 }]}>{s}</Text>
                </View>
              ))}
              {(prediction.tacticalEdge.awayWeaknesses || []).map((w: string, i: number) => (
                <View key={`aw-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <MaterialCommunityIcons name="arrow-down-bold" size={11} color={COLORS.live} />
                  <Text style={[styles.factorText, { fontSize: 12 }]}>{w}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Attacking & Defensive Strength Bars */}
      {prediction.attackingStrength && prediction.defensiveStrength && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>KRACHT VERGELIJKING</Text>
          <View style={{ gap: 12 }}>
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={[styles.factorText, { fontSize: 12 }]}>Aanvalskracht</Text>
                <Text style={[styles.factorText, { fontSize: 12 }]}>{homeShortName} {prediction.attackingStrength.home} — {prediction.attackingStrength.away} {awayShortName}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 4, height: 8 }}>
                <View style={{ flex: prediction.attackingStrength.home, backgroundColor: COLORS.accent, borderRadius: 4 }} />
                <View style={{ flex: prediction.attackingStrength.away, backgroundColor: "#5B8DEF", borderRadius: 4 }} />
              </View>
            </View>
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={[styles.factorText, { fontSize: 12 }]}>Defensieve sterkte</Text>
                <Text style={[styles.factorText, { fontSize: 12 }]}>{homeShortName} {prediction.defensiveStrength.home} — {prediction.defensiveStrength.away} {awayShortName}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 4, height: 8 }}>
                <View style={{ flex: prediction.defensiveStrength.home, backgroundColor: COLORS.accent, borderRadius: 4 }} />
                <View style={{ flex: prediction.defensiveStrength.away, backgroundColor: "#5B8DEF", borderRadius: 4 }} />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Player Impact */}
      {prediction.playerImpact && prediction.playerImpact.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>SPELER IMPACT</Text>
          {prediction.playerImpact.map((p: any, i: number) => (
            <View key={`pi-${i}`} style={[styles.factorRow, { marginBottom: 6 }]}>
              <MaterialCommunityIcons name="account-star" size={13} color={p.team === "home" ? COLORS.accent : "#5B8DEF"} />
              <Text style={[styles.factorText, { marginLeft: 4 }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: p.team === "home" ? COLORS.accent : "#5B8DEF" }}>{p.name}</Text>
                {" — "}{p.impact}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Match Pattern */}
      {prediction.matchPattern && (
        <View style={styles.tipCard}>
          <MaterialCommunityIcons name="chart-timeline-variant" size={15} color={COLORS.accent} />
          <Text style={styles.tipText}>{prediction.matchPattern}</Text>
        </View>
      )}

      {/* AI Prediction Explanation */}
      {prediction.predictionExplanation && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>AI VOORSPELLING ONDERBOUWING</Text>
          <Text style={styles.aiSummary}>{prediction.predictionExplanation}</Text>
        </View>
      )}

      {/* Tip */}
      {prediction.tip && (
        <View style={[styles.tipCard, { borderColor: "rgba(255,215,0,0.3)", backgroundColor: "rgba(255,215,0,0.06)" }]}>
          <MaterialCommunityIcons name="lightbulb-outline" size={16} color="#FFD700" />
          <Text style={[styles.tipText, { color: "#FFD700" }]}>{prediction.tip}</Text>
        </View>
      )}

      <Text style={styles.aiDisclaimer}>
        {tFn("matchDetail.aiDisclaimer")}
      </Text>
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
function FormBubbles({ form }: { form: string }) {
  return (
    <View style={styles.formBubbles}>
      {form.split("").slice(0, 5).map((r, i) => (
        <View key={i} style={[styles.formBubble,
          r === "W" ? styles.formW : r === "D" ? styles.formD : styles.formL]}>
          <Text style={styles.formBubbleText}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.infoCard, { marginTop: 14 }]}>
      <Text style={styles.infoCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, highlight, icon }: { label: string; value: string; highlight?: boolean; icon?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelRow}>
        {icon && <Ionicons name={icon as any} size={14} color={COLORS.textMuted} style={{ marginRight: 8 }} />}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <StateBlock loading title={tFn("matchDetail.matchDataLoading")} message={tFn("common.loading") || "Loading..."} />
    </View>
  );
}

function EmptyState({ icon, text }: { icon: any; text: string }) {
  return (
    <StateBlock icon={icon} title={text} />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  nxHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  nxHeaderCollapsed: {
    paddingBottom: 4,
  },
  nxMatchHeaderCollapsed: {
    gap: 8,
    paddingBottom: 4,
  },
  nxLiveGlowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.65)",
    backgroundColor: "rgba(229,9,20,0.18)",
    // @ts-ignore
    shadowColor: "#E50914",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 9,
    elevation: 6,
  },
  nxLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF3040",
  },
  nxLiveText: {
    color: "#FF6B71",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  nxUpcomingPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  nxUpcomingText: {
    color: "#A5AEC4",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  nxTabBarWrap: {
    backgroundColor: "#0B0F1A",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  nxTabBarInner: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 18,
  },
  nxTabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  nxTabLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#93A0BA",
  },
  nxTabLabelActive: {
    color: "#FFFFFF",
  },
  nxTabUnderline: {
    marginTop: 7,
    width: "100%",
    minWidth: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  nxTabUnderlineActive: {
    backgroundColor: "#E50914",
  },
  nxContentWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 12,
  },
  nxSectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  nxSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#E8EDF9",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
    marginBottom: 4,
  },
  nxCard: {
    backgroundColor: "#0B0F1A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  nxCardKicker: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#9AA5BF",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  nxCardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  nxBodyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#A8B1C8",
    lineHeight: 20,
  },
  nxMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  nxMetaText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#B9C2D7",
  },
  nxTimelineMinute: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FF5E66",
  },
  nxTimelineTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginTop: 6,
  },
  nxTimelineFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#E50914",
  },
  nxTimelineRangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  nxTimelineRangeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#8F9AAF",
  },
  nxGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  nxGridCard: {
    width: "48.5%",
    minHeight: 82,
    backgroundColor: "#0B0F1A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: "space-between",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 4,
  },
  nxGridLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#94A0BB",
    letterSpacing: 0.4,
  },
  nxGridValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
    marginTop: 8,
  },
  nxGoalsCard: {
    backgroundColor: "#0B0F1A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  nxGoalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  nxGoalPill: {
    backgroundColor: "rgba(229,9,20,0.12)",
    borderColor: "rgba(229,9,20,0.32)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nxGoalPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#F0B0B5",
  },
  nxLockedCard: {
    position: "relative",
    minHeight: 106,
    backgroundColor: "#0B0F1A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: "hidden",
  },
  nxLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.45)",
    borderRadius: 18,
    backgroundColor: "rgba(9,12,20,0.25)",
  },
  nxLockText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#F3636D",
    letterSpacing: 0.3,
  },
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  heroTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroActionBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  matchHeader: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 10,
  },
  competitionRowCenterOnly: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 0,
  },
  competitionCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    maxWidth: "100%",
  },
  leagueFallbackIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  leagueName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    maxWidth: "88%",
    textAlign: "center",
  },
  scoreRow: { flexDirection: "row", alignItems: "flex-start", width: "100%", paddingHorizontal: 0, justifyContent: "space-between", gap: 10 },
  teamSideWrap: { flex: 1, alignItems: "center", justifyContent: "flex-start", position: "relative", minWidth: 86 },
  teamSideCard: {
    width: "100%",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 96,
    justifyContent: "center",
  },
  teamFollowBtnFloating: {
    position: "absolute",
    top: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  teamFollowBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: `${COLORS.accent}77`,
  },
  heroActionRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 2,
  },
  teamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 118,
  },
  scoreCenter: { minWidth: 106, alignItems: "center", gap: 6, justifyContent: "center", paddingTop: 2 },
  score: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 48,
    color: "#FFFFFF",
    flexDirection: "row",
    // @ts-ignore
    textShadowColor: "rgba(255,48,64,0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    textAlign: "center",
    fontWeight: "900",
  },
  vsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 23,
    color: "rgba(255,255,255,0.48)",
    letterSpacing: 2.6,
  },
  scheduledDate: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "capitalize",
    letterSpacing: 0.3,
  },
  scheduledTime: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: "#FFFFFF",
    lineHeight: 24,
    letterSpacing: 0.4,
  },
  kickoffPendingNote: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  finishedLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    opacity: 0.95,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  venueText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, textAlign: "center", maxWidth: 280 },
  tabBarScroll: {
    flexGrow: 0,
    marginTop: 6,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 6,
  },
  streamContainer: { flex: 1 },
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  serverSection: {
    padding: 18,
    gap: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  streamErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,48,64,0.1)",
    borderColor: `${COLORS.live}88`,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  streamErrorText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary, flex: 1, lineHeight: 17 },
  streamErrorRef: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted },
  serverBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
    backgroundColor: COLORS.accentGlow,
  },
  serverBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent },
  notLiveContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 36 },
  notLiveTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: COLORS.text,
    textAlign: "center",
  },
  notLiveText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  tabContent: { flex: 1 },
  tabContentInner: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20, gap: 0 },
  prematchInsightSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  prematchInsightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  prematchInsightLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.accent,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 8,
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  infoCardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  infoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, maxWidth: "55%", textAlign: "right" },
  infoValueHighlight: { color: COLORS.live },
  statsTeamHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  statsTeamSide: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  statsTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statsHeaderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  momentumContainer: { marginTop: 12, gap: 5 },
  momentumLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: "center",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  momentumTrack: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  momentumHome: { height: 5, backgroundColor: COLORS.accent, borderRadius: 3 },
  momentumAway: { height: 5, backgroundColor: "#5B8DEF", borderRadius: 3 },
  momentumFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  momentumHomeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.accent },
  momentumAwayLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#5B8DEF" },
  statsVsLabel: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 2,
    textAlign: "center",
    marginHorizontal: 10,
  },
  statsLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statSectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  statSectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
    backgroundColor: COLORS.accent,
  },
  statSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.accent,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 2 },
  statValueCol: {
    width: 56,
    alignItems: "flex-start",
    gap: 2,
  },
  statValueColRight: {
    alignItems: "flex-end",
  },
  statSideLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statSideLabelRight: { textAlign: "right" },
  statVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.textSecondary,
    width: 56,
    textAlign: "left",
  },
  statValRight: {
    textAlign: "right",
  },
  statValHome: { color: COLORS.accent },
  statValAway: { color: "#5B8DEF" },
  statValWinner: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 17,
  },
  statBarContainer: { flex: 1, alignItems: "center", gap: 6 },
  statName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.text,
    textAlign: "center",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statBarsWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 7,
  },
  statBarHalf: {
    flex: 1,
    flexDirection: "row",
    height: 7,
    borderRadius: 3.5,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statBarHomeFill: {
    height: 7,
    backgroundColor: COLORS.accent,
    borderRadius: 3.5,
  },
  statBarCenterGap: {
    width: 4,
  },
  statBarAwayFill: {
    height: 7,
    backgroundColor: "#5B8DEF",
    borderRadius: 3.5,
  },
  statDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 4,
  },
  noStatsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  // Timeline
  timelineWrapper: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 12,
    gap: 2,
    position: "relative",
    overflow: "hidden",
  },
  timelineConnector: {
    position: "absolute",
    width: 2,
    backgroundColor: "rgba(255,255,255,0.09)",
    top: 14,
    bottom: 14,
    zIndex: 0,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    zIndex: 1,
  },
  timelineSide: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  timelineSideAway: {
    alignItems: "flex-start",
  },
  timelineCenter: {
    width: 60,
    alignItems: "center",
    gap: 4,
  },
  timelineDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  timelineMinute: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  timelineCenterCardWrap: {
    width: 196,
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  timelineCenterCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  timelineEventHome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  timelineEventAway: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timelineEventBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  timelineTextBlockHome: {
    flex: 1,
    alignItems: "flex-end",
    gap: 1,
  },
  timelineTextBlockAway: {
    flex: 1,
    alignItems: "flex-start",
    gap: 1,
  },
  timelineTitleHome: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.text,
    textAlign: "right",
  },
  timelineTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.text,
  },
  timelinePlayer: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  timelineDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  timelineSecondaryHome: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.accentDim,
    textAlign: "right",
  },
  timelineSecondary: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.accentDim,
  },
  highlightsHeroCard: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: `${COLORS.accent}33`,
    backgroundColor: "rgba(229,9,20,0.1)",
    marginBottom: 10,
    gap: 8,
  },
  highlightsHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  highlightsHeroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  highlightsHeroText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },
  highlightRecapGrid: {
    gap: 8,
    marginBottom: 10,
  },
  highlightRecapCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  highlightRecapIndex: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 11,
    color: COLORS.accent,
    minWidth: 20,
  },
  highlightRecapText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  highlightRatingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,152,0,0.2)",
    marginBottom: 10,
  },
  highlightRatingTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.text,
    flex: 1,
  },
  highlightRatingSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
  },
  lineupTeamHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 15,
    marginBottom: 16,
    gap: 10,
  },
  lineupTeamSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lineupTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.text,
  },
  lineupFormation: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.accent,
    marginTop: 1,
  },
  lineupTeamDivider: {
    width: 28,
    alignItems: "center",
  },
  lineupVsSmall: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  lineupTeamSection: { marginBottom: 22 },
  lineupPitchScroller: {
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  lineupViewToggleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  lineupViewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  lineupViewBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  lineupViewBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted },
  lineupViewBtnTextActive: { color: COLORS.accent },
  lineupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  pitchCard: {
    width: 720,
    minHeight: 368,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 10,
    position: "relative",
    overflow: "hidden",
  },
  pitchCenterCircle: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    left: "50%",
    marginLeft: -44,
    top: "50%",
    marginTop: -44,
  },
  pitchHalfLine: {
    position: "absolute",
    left: 8,
    right: 8,
    top: "50%",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  pitchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    zIndex: 2,
  },
  pitchPlayerWrap: { minWidth: 92, maxWidth: 120 },
  lineupListCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  lineupListLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  playerRowCompact: {
    borderBottomWidth: 0,
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 5,
  },
  playerJersey: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
    alignItems: "center",
    justifyContent: "center",
  },
  playerJerseyNum: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.accent },
  playerPhoto: { width: 42, height: 42, borderRadius: 10 },
  playerPhotoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  playerNameCompact: { fontSize: 11 },
  playerInlineValue: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#00C896" },
  playerPos: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  playerPosCompact: { fontSize: 9, marginTop: 0 },
  starterBadge: {
    backgroundColor: COLORS.accentGlow,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${COLORS.accent}55`,
  },
  starterText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.accent },
  marketValueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,200,150,0.12)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(0,200,150,0.3)",
  },
  marketValueText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#00C896" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 14 },
  loadingText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 14 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  aiLoading: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 16 },
  aiLoadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  aiTrigger: { marginTop: 20, borderRadius: 20, overflow: "hidden" },
  aiTriggerGrad: { padding: 32, alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderLight },
  aiTriggerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  aiTriggerSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  aiTriggerBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.accent, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  aiTriggerBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
  aiMainCard: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 10, marginBottom: 2 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text, flex: 1 },
  aiConfidenceBadge: { backgroundColor: COLORS.accentGlow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: `${COLORS.accent}44` },
  aiConfidenceText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
  aiWarnCard: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  aiWarnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  aiPrediction: { fontFamily: "Inter_800ExtraBold", fontSize: 22, textAlign: "center", marginVertical: 4 },
  aiScore: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  aiSummary: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  marketGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  marketCard: {
    width: "48%",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardElevated,
    gap: 2,
  },
  marketLabel: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.textSecondary },
  marketValue: { fontFamily: "Inter_800ExtraBold", fontSize: 20, color: COLORS.text },
  marketSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  edgeRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  edgeLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  edgeValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.accent },
  factorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  factorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent, marginTop: 6 },
  factorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, flex: 1 },
  formRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  formCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 8, flex: 1, overflow: "hidden" },
  formTeamName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  formBubbles: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  formBubble: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  formW: { backgroundColor: "rgba(0,230,118,0.2)", borderWidth: 1, borderColor: COLORS.green },
  formD: { backgroundColor: "rgba(138,157,181,0.2)", borderWidth: 1, borderColor: COLORS.textMuted },
  formL: { backgroundColor: "rgba(255,59,48,0.2)", borderWidth: 1, borderColor: COLORS.live },
  formBubbleText: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.text },
  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(255,215,0,0.08)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,215,0,0.25)" },
  tipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  aiDisclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 4, paddingBottom: 20 },
  metaBadge: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 10, borderWidth: 1,
    borderColor: COLORS.border, alignItems: "center", gap: 4,
  },
  metaBadgeLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  metaBadgeValue: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
  combinedPitch: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 10,
    overflow: "hidden",
    position: "relative",
    alignItems: "stretch",
    alignSelf: "center",
    width: 760,
    minHeight: 420,
  },
  pitchFieldBorder: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    borderRadius: 18,
  },
  pitchVerticalCenterLine: {
    position: "absolute",
    top: 10,
    bottom: 10,
    left: "50%",
    width: 1,
    marginLeft: -0.5,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  pitchHorizontalCenterLine: {
    position: "absolute",
    left: 10,
    right: 10,
    top: "50%",
    height: 1,
    marginTop: -0.5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  pitchCenterCircleWide: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    left: "50%",
    top: "50%",
    marginLeft: -42,
    marginTop: -42,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  pitchCenterSpotWide: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginTop: -3,
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  pitchPenaltyBoxLeft: {
    position: "absolute",
    left: 10,
    top: "22%",
    width: "14%",
    height: "56%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderLeftWidth: 0,
  },
  pitchGoalBoxLeft: {
    position: "absolute",
    left: 10,
    top: "35%",
    width: "6.5%",
    height: "30%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderLeftWidth: 0,
  },
  pitchPenaltyBoxRight: {
    position: "absolute",
    right: 10,
    top: "22%",
    width: "14%",
    height: "56%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRightWidth: 0,
  },
  pitchGoalBoxRight: {
    position: "absolute",
    right: 10,
    top: "35%",
    width: "6.5%",
    height: "30%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRightWidth: 0,
  },
  pitchArcLeft: {
    position: "absolute",
    left: "14%",
    top: "41%",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderLeftWidth: 0,
  },
  pitchArcRight: {
    position: "absolute",
    right: "14%",
    top: "41%",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRightWidth: 0,
  },
  pitchTopTeamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    zIndex: 2,
    marginBottom: 2,
  },
  pitchTopTeamCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pitchTopTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pitchTopTeamMeta: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "rgba(255,255,255,0.56)",
    marginTop: 2,
  },
  pitchTopBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pitchTopBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  pitchHorizontalFormationRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    zIndex: 2,
    gap: 6,
  },
  pitchHalfSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-evenly",
    gap: 4,
  },
  pitchVerticalColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-around",
    gap: 3,
    minHeight: 280,
  },
  pitchMiddleDividerCol: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  pitchMidBadge: {
    transform: [{ rotate: "-90deg" }],
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pitchMidBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  pitchDotWrap: {
    alignItems: "center",
    gap: 4,
    width: 56,
    maxWidth: 56,
    flexShrink: 0,
    paddingVertical: 2,
  },
  pitchDotCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  pitchDotPhoto: {
    width: 30,
    height: 30,
    borderRadius: 6,
    position: "absolute",
  },
  pitchDotNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 11,
  },
  pitchDotName: {
    fontFamily: "Inter_500Medium",
    fontSize: 7,
    lineHeight: 9,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
    maxWidth: 56,
  },
  // AI redesign styles
  chanceRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  chanceBlock: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  chancePct: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
  },
  chanceLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.text,
    textAlign: "center",
  },
  chanceSubLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: COLORS.textMuted,
  },
  xgRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  xgValue: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
    color: COLORS.accent,
  },
  xgLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  nextGoalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: `${COLORS.accent}33`,
    gap: 10,
  },
  nextGoalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nextGoalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  nextGoalPct: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 16,
    color: COLORS.accent,
  },
  nextGoalBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  nextGoalFill: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  // AI tab refresh button
  aiRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  aiRefreshText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  aiWaitCard: {
    gap: 10,
  },
});
