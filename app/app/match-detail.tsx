import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Image, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import WebView from "react-native-webview";
import { useQuery, useMutation } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { LiveBadge } from "@/components/LiveBadge";
import { SafeHaptics } from "@/lib/safeHaptics";
import { apiRequest } from "@/lib/query-client";
import { openInVlc } from "@/lib/vlc";
import { TeamLogo } from "@/components/TeamLogo";
import { PillTabs, StateBlock } from "@/components/ui/PremiumPrimitives";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";
import { fetchSportsLeagueResourceWithFallback, getLeaderboardRows } from "@/lib/sports-data";
import { safeStr } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/logo-manager";
import { SilentResetBoundary } from "@/components/SilentResetBoundary";
import { useNexora } from "@/context/NexoraContext";
import { t as tFn } from "@/lib/i18n";
import { getBestCachedOrSeedPlayerImage, resolvePlayerImageUri } from "@/lib/player-image-system";
import { resolveMatchBucket } from "@/lib/match-state";
import { buildGroundedMatchAnalysis } from "@/lib/match-analysis-engine";
import { toCanonicalMatch } from "@/lib/canonical-match";
import { normalizeTeamName, tokenOverlapScore } from "@/lib/entity-normalization";
import {
  MatchSubscription,
  ensureMatchNotificationPermission,
  loadMatchSubscriptions,
  saveMatchSubscriptions,
} from "@/lib/match-notifications";
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
  { id: "ai",       label: "matchDetail.analysis",     icon: "analytics-outline" },
] as const;

type TabId = "stream" | "stats" | "lineups" | "timeline" | "highlights" | "ai";

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

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{
    matchId: string; homeTeam: string; awayTeam: string;
    homeTeamLogo?: string; awayTeamLogo?: string;
    homeScore?: string; awayScore?: string;
    league: string; espnLeague?: string; minute?: string; status: string; sport: string;
    initialTab?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { hasPremium, toggleFavorite, isFavorite } = useNexora();
  const sportPremium = hasPremium("sport");
  const resolvedInitialTab = (params.initialTab && ["stream", "stats", "lineups", "timeline", "highlights", "ai"].includes(params.initialTab)) ? params.initialTab as TabId : "stream";
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Record<TabId, boolean>>({
    stream: resolvedInitialTab === "stream",
    stats: resolvedInitialTab === "stats",
    lineups: resolvedInitialTab === "lineups",
    timeline: resolvedInitialTab === "timeline",
    highlights: resolvedInitialTab === "highlights",
    ai: resolvedInitialTab === "ai",
  });
  const [lineupView, setLineupView] = useState<"pitch" | "list">("pitch");
  const [streamKey, setStreamKey] = useState(0);
  const [streamWebError, setStreamWebError] = useState<unknown>(null);
  const [streamErrorRef, setStreamErrorRef] = useState<string>("");
  const [streamFinderActive, setStreamFinderActive] = useState(false);
  const [streamFinderDone, setStreamFinderDone] = useState(false);
  const streamFinderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paramCanonical = useMemo(() => toCanonicalMatch({
    id: params.matchId,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    homeTeamLogo: params.homeTeamLogo,
    awayTeamLogo: params.awayTeamLogo,
    homeScore: params.homeScore,
    awayScore: params.awayScore,
    status: params.status,
    minute: params.minute,
    startDate: undefined,
    league: params.league,
    espnLeague: params.espnLeague,
    sport: params.sport,
  }), [params.awayScore, params.awayTeam, params.awayTeamLogo, params.espnLeague, params.homeScore, params.homeTeam, params.homeTeamLogo, params.league, params.matchId, params.minute, params.sport, params.status]);
  const paramBucket = paramCanonical?.status === "live"
    ? "live"
    : paramCanonical?.status === "finished"
      ? "finished"
      : "upcoming";
  const espnSport = "soccer";
  const espnLeague = useMemo(() => {
    const direct = String(params.espnLeague || "").trim();
    if (direct) return direct;
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
  }, [params.espnLeague, params.league]);
  const {
    data: streamData,
    isLoading: _streamLoading,
    error: streamFetchError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["match-stream", params.matchId, espnLeague],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/stream/${params.matchId}?league=${encodeURIComponent(espnLeague)}`);
      return res.json();
    },
    enabled: !!params.matchId && paramBucket === "live",
    staleTime: 60_000,
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
    queryKey: ["match-detail", params.matchId, espnLeague],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/match/${params.matchId}?sport=${espnSport}&league=${espnLeague}`);
      return res.json();
    },
    enabled: true,
    // Poll only while match is effectively live.
    refetchInterval: (query: any) => {
      const payload = query?.state?.data;
      const bucket = resolveMatchBucket({
        status: payload?.status ?? params.status,
        detail: payload?.status,
        minute: payload?.minute ?? params.minute,
        homeScore: payload?.homeScore ?? params.homeScore,
        awayScore: payload?.awayScore ?? params.awayScore,
        startDate: payload?.startDate,
      });
      return bucket === "live" ? 10000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: paramBucket === "live" ? 4000 : 30000,
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
  const matchId = String(params.matchId || "").trim();
  const matchSubscriptionId = useMemo(() => `soccer:${matchId}`, [matchId]);
  const [isMatchFollowed, setIsMatchFollowed] = useState(false);
  const homeTeamFavoriteId = useMemo(() => `team:${String(matchDetail?.homeTeamId || params.homeTeam || "").toLowerCase()}`, [matchDetail?.homeTeamId, params.homeTeam]);
  const awayTeamFavoriteId = useMemo(() => `team:${String(matchDetail?.awayTeamId || params.awayTeam || "").toLowerCase()}`, [matchDetail?.awayTeamId, params.awayTeam]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const subs = await loadMatchSubscriptions();
      if (disposed) return;
      setIsMatchFollowed(subs.some((sub) => sub?.id === matchSubscriptionId));
    })();
    return () => { disposed = true; };
  }, [matchSubscriptionId]);

  const toggleMatchFollow = useCallback(async () => {
    if (!matchId) return;
    const currentSubs = await loadMatchSubscriptions();
    const exists = currentSubs.some((sub) => sub?.id === matchSubscriptionId);

    if (!exists) {
      const permission = await ensureMatchNotificationPermission();
      if (!permission) return;
      const nextSub: MatchSubscription = {
        id: matchSubscriptionId,
        espnLeague,
        homeTeam: String(params.homeTeam || "Home"),
        awayTeam: String(params.awayTeam || "Away"),
      };
      const next = [...currentSubs, nextSub];
      await saveMatchSubscriptions(next);
      setIsMatchFollowed(true);
      SafeHaptics.impactLight();
      return;
    }

    const next = currentSubs.filter((sub) => sub?.id !== matchSubscriptionId);
    await saveMatchSubscriptions(next);
    setIsMatchFollowed(false);
    SafeHaptics.impactLight();
  }, [espnLeague, matchId, matchSubscriptionId, params.awayTeam, params.homeTeam]);

  // AI Prediction
  const requestPrediction = async (mode: "prematch" | "live") => {
      const normalizeTeam = (value: unknown) => String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const homeTag = normalizeTeam(params.homeTeam);
      const awayTag = normalizeTeam(params.awayTeam);

      const [standingsData, scorersData, assistsData] = await Promise.all([
        (async () => {
          try {
            return await fetchSportsLeagueResourceWithFallback("standings", {
              leagueName: params.league,
              espnLeague,
              sequential: true,
            });
          } catch {
            return null;
          }
        })(),
        (async () => {
          try {
            return await fetchSportsLeagueResourceWithFallback("topscorers", {
              leagueName: params.league,
              espnLeague,
              sequential: true,
            });
          } catch {
            return null;
          }
        })(),
        (async () => {
          try {
            return await fetchSportsLeagueResourceWithFallback("topassists", {
              leagueName: params.league,
              espnLeague,
              sequential: true,
            });
          } catch {
            return null;
          }
        })(),
      ]);

      const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
      const scorers = getLeaderboardRows("topscorers", scorersData);
      const assisters = getLeaderboardRows("topassists", assistsData);

      const matchStanding = (teamName?: string) => {
        const teamKey = normalizeTeam(teamName);
        if (!teamKey) return null;
        return standings.find((row: any) => {
          const rowTeam = normalizeTeam(row?.team);
          return rowTeam === teamKey || rowTeam.includes(teamKey) || teamKey.includes(rowTeam);
        }) || null;
      };

      const homeStanding = matchStanding(params.homeTeam);
      const awayStanding = matchStanding(params.awayTeam);

      const topByTeam = (tag: string) => scorers
        .filter((row: any) => {
          const scorerTeam = normalizeTeam(row?.team);
          return scorerTeam === tag || scorerTeam.includes(tag) || tag.includes(scorerTeam);
        })
        .sort((a: any, b: any) => Number(b?.goals || 0) - Number(a?.goals || 0))[0] || null;

      const homeTopScorer = homeTag ? topByTeam(homeTag) : null;
      const awayTopScorer = awayTag ? topByTeam(awayTag) : null;

      const topAssistByTeam = (tag: string) => assisters
        .filter((row: any) => {
          const assistTeam = normalizeTeam(row?.team);
          return assistTeam === tag || assistTeam.includes(tag) || tag.includes(assistTeam);
        })
        .sort((a: any, b: any) => Number(b?.assists || b?.displayValue || 0) - Number(a?.assists || a?.displayValue || 0))[0] || null;

      const homeTopAssist = homeTag ? topAssistByTeam(homeTag) : null;
      const awayTopAssist = awayTag ? topAssistByTeam(awayTag) : null;

      const isLiveMode = mode === "live";

      const groundedFallback = buildGroundedMatchAnalysis({
        homeTeam: String(params.homeTeam || "Home"),
        awayTeam: String(params.awayTeam || "Away"),
        isLive: isLiveMode,
        minute: isLiveMode ? liveMinute ?? null : null,
        homeScore: Number(isLiveMode ? liveHomeScore ?? 0 : params.homeScore ?? 0),
        awayScore: Number(isLiveMode ? liveAwayScore ?? 0 : params.awayScore ?? 0),
        stats: {
          home: isLiveMode ? (matchDetail?.homeStats || {}) : {},
          away: isLiveMode ? (matchDetail?.awayStats || {}) : {},
        },
        events: isLiveMode && Array.isArray(matchDetail?.keyEvents) ? matchDetail.keyEvents.slice(0, 20) : [],
        home: {
          rank: homeStanding?.rank ?? null,
          points: homeStanding?.points ?? null,
          goalDiff: homeStanding?.goalDiff ?? null,
          topScorer: homeTopScorer?.name || null,
          topScorerGoals: homeTopScorer?.goals ?? null,
          topAssist: homeTopAssist?.name || null,
          topAssistCount: (homeTopAssist?.assists ?? Number(homeTopAssist?.displayValue || 0)) || null,
        },
        away: {
          rank: awayStanding?.rank ?? null,
          points: awayStanding?.points ?? null,
          goalDiff: awayStanding?.goalDiff ?? null,
          topScorer: awayTopScorer?.name || null,
          topScorerGoals: awayTopScorer?.goals ?? null,
          topAssist: awayTopAssist?.name || null,
          topAssistCount: (awayTopAssist?.assists ?? Number(awayTopAssist?.displayValue || 0)) || null,
        },
      });

      try {
        const res = await apiRequest("POST", "/api/sports/predict", {
          matchId: params.matchId,
          espnLeague,
          homeTeam: params.homeTeam,
          awayTeam: params.awayTeam,
          league: params.league,
          sport: params.sport,
          status: isLiveMode ? "live" : "upcoming",
          homeScore: isLiveMode ? String(liveHomeScore ?? 0) : "0",
          awayScore: isLiveMode ? String(liveAwayScore ?? 0) : "0",
          isLive: isLiveMode,
          minute: isLiveMode && liveMinute !== undefined ? String(liveMinute) : undefined,
          stats: {
            home: isLiveMode ? (matchDetail?.homeStats || {}) : {},
            away: isLiveMode ? (matchDetail?.awayStats || {}) : {},
          },
          events: isLiveMode && Array.isArray(matchDetail?.keyEvents) ? matchDetail.keyEvents.slice(0, 20) : [],
          venue: matchDetail?.venue || undefined,
          context: {
            homeRank: homeStanding?.rank,
            awayRank: awayStanding?.rank,
            homePoints: homeStanding?.points,
            awayPoints: awayStanding?.points,
            homeGoalDiff: homeStanding?.goalDiff,
            awayGoalDiff: awayStanding?.goalDiff,
            homeTopScorer: homeTopScorer?.name || null,
            awayTopScorer: awayTopScorer?.name || null,
            homeTopScorerGoals: homeTopScorer?.goals ?? null,
            awayTopScorerGoals: awayTopScorer?.goals ?? null,
            homeTopAssist: homeTopAssist?.name || null,
            awayTopAssist: awayTopAssist?.name || null,
            homeTopAssistCount: (homeTopAssist?.assists ?? Number(homeTopAssist?.displayValue || 0)) || null,
            awayTopAssistCount: (awayTopAssist?.assists ?? Number(awayTopAssist?.displayValue || 0)) || null,
          },
        });
        const json = await res.json();
        const provider = (json && typeof json === "object" && "prediction" in json && json.prediction && typeof json.prediction === "object")
          ? json.prediction
          : json;
        if (!provider || typeof provider !== "object") return groundedFallback;

        return {
          ...groundedFallback,
          ...provider,
          favored_side: provider?.favored_side || groundedFallback.favored_side,
          confidence_score: Number(provider?.confidence_score || groundedFallback.confidence_score),
          key_factors: Array.isArray(provider?.key_factors) && provider.key_factors.length ? provider.key_factors : groundedFallback.key_factors,
          likely_pattern: String(provider?.likely_pattern || groundedFallback.likely_pattern),
          live_shift_summary: provider?.live_shift_summary || groundedFallback.live_shift_summary,
          post_match_summary: provider?.post_match_summary || groundedFallback.post_match_summary,
          prediction: provider?.prediction || groundedFallback.prediction,
          confidence: Number(provider?.confidence || groundedFallback.confidence),
          summary: String(provider?.summary || groundedFallback.summary),
          keyFactors: Array.isArray(provider?.keyFactors) && provider.keyFactors.length ? provider.keyFactors : groundedFallback.keyFactors,
          tacticalNotes: Array.isArray(provider?.tacticalNotes) && provider.tacticalNotes.length ? provider.tacticalNotes : groundedFallback.tacticalNotes,
          matchPattern: String(provider?.matchPattern || groundedFallback.matchPattern),
          confidenceReason: String(provider?.confidenceReason || groundedFallback.confidenceReason),
          homePct: Number(provider?.homePct || groundedFallback.homePct),
          drawPct: Number(provider?.drawPct || groundedFallback.drawPct),
          awayPct: Number(provider?.awayPct || groundedFallback.awayPct),
        };
      } catch {
        return {
          ...groundedFallback,
          providerError: true,
        };
      }
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

  const prediction = (isLive ? (livePrediction || preMatchPrediction) : preMatchPrediction) as any;
  const predLoading = isLive
    ? Boolean(livePredictionLoading && !prediction)
    : Boolean(preMatchLoading && !prediction);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((current) => (current[tab] ? current : { ...current, [tab]: true }));
    if (tab === "stream" && isLive && !streamFinderDone) {
      setStreamFinderActive(true);
      if (streamFinderTimerRef.current) clearTimeout(streamFinderTimerRef.current);
      streamFinderTimerRef.current = setTimeout(() => {
        setStreamFinderActive(false);
        setStreamFinderDone(true);
      }, 3000);
    }
    if (tab === "ai") {
      if (!preMatchPrediction && !preMatchLoading) fetchPreMatchPrediction();
      if (isLive && !livePrediction && !livePredictionLoading) fetchLivePrediction();
    }
    SafeHaptics.impactLight();
  };

  const handleRetryAutoStream = async () => {
    SafeHaptics.impactLight();
    setStreamWebError(null);
    setStreamErrorRef("");
    await refetchStream();
    setStreamKey(k => k + 1);
  };

  // Auto-fetch AI predictions
  const hasFetchedPrematchRef = useRef(false);
  const lastLivePredictionAtRef = useRef(0);

  // Auto-activate AI stream finder on first mount when live match opens on stream tab
  useEffect(() => {
    let disposed = false;
    if (isLive && activeTab === "stream" && !streamFinderDone) {
      setStreamFinderActive(true);
      streamFinderTimerRef.current = setTimeout(() => {
        if (!disposed) {
          setStreamFinderActive(false);
          setStreamFinderDone(true);
        }
      }, 3000);
    }
    return () => {
      disposed = true;
      if (streamFinderTimerRef.current) clearTimeout(streamFinderTimerRef.current);
    };
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!detailLoading && !hasFetchedPrematchRef.current && !preMatchLoading) {
      hasFetchedPrematchRef.current = true;
      const t = setTimeout(() => fetchPreMatchPrediction(), 700);
      return () => clearTimeout(t);
    }
  }, [detailLoading, preMatchLoading, fetchPreMatchPrediction]);

  useEffect(() => {
    if (!isLive || detailLoading) return;
    const now = Date.now();
    if (now - lastLivePredictionAtRef.current < 25_000) return;
    lastLivePredictionAtRef.current = now;
    fetchLivePrediction();
  }, [isLive, detailLoading, liveMinute, liveHomeScore, liveAwayScore, fetchLivePrediction]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const scoreFontSize = screenWidth < 350 ? 40 : screenWidth < 385 ? 44 : 48;
  const timelineEvents = Array.isArray(matchDetail?.timeline) ? matchDetail.timeline : [];
  const orderedLineupTeams = useMemo(
    () => orderLineupTeams(matchDetail?.starters || [], String(params.homeTeam || ""), String(params.awayTeam || "")),
    [matchDetail?.starters, params.homeTeam, params.awayTeam]
  );
  const homeLineupTeam = orderedLineupTeams[0] || null;
  const awayLineupTeam = orderedLineupTeams[1] || null;
  const competitionName = safeStr(effectiveCanonical?.league || matchDetail?.competition || matchDetail?.league || params.league);
  const leagueLogoUri = getLeagueLogo(competitionName) as string | null;
  const homeTeamName = safeStr(matchDetail?.homeTeam || params.homeTeam || "Home");
  const awayTeamName = safeStr(matchDetail?.awayTeam || params.awayTeam || "Away");
  const kickoffRaw = safeStr(matchDetail?.startDate || matchDetail?.date || effectiveCanonical?.startDate || "");
  const kickoffDate = (() => {
    const parsed = Date.parse(kickoffRaw);
    if (!Number.isFinite(parsed)) return kickoffRaw;
    try {
      return new Intl.DateTimeFormat("nl-BE", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(parsed));
    } catch {
      return kickoffRaw;
    }
  })();
  const kickoffTime = (() => {
    const parsed = Date.parse(kickoffRaw);
    if (!Number.isFinite(parsed)) {
      const hm = kickoffRaw.match(/(\d{1,2}:\d{2})/);
      return hm?.[1] || tFn("matchDetail.kickoffTBD");
    }
    try {
      return new Intl.DateTimeFormat("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(parsed));
    } catch {
      return tFn("matchDetail.kickoffTBD");
    }
  })();
  const matchStatusLabel = (() => {
    if (isHalfTime) return "HT";
    if (isLive) return liveMinute != null ? `${liveMinute}'` : "LIVE";
    if (isFinished) return "FT";
    if (isPostponed) return "Postponed";
    return "Scheduled";
  })();
  const highlightSummary = matchDetail?.highlights || null;
  const highlightMoments = Array.isArray(highlightSummary?.topMoments) ? highlightSummary.topMoments : [];
  const highlightRecap = Array.isArray(highlightSummary?.recap) ? highlightSummary.recap : [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={[COLORS.cardElevated, COLORS.surface, COLORS.background]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.matchHeader}>
          <View style={styles.competitionRow}>
            <View style={styles.competitionCenter}>
              {leagueLogoUri ? (
                <TeamLogo uri={leagueLogoUri} teamName={competitionName} size={24} />
              ) : (
                <View style={styles.leagueFallbackIcon}>
                  <Ionicons name="trophy-outline" size={14} color={COLORS.textMuted} />
                </View>
              )}
              <Text style={styles.leagueName} numberOfLines={1}>{competitionName}</Text>
            </View>
            <View style={styles.competitionMetaRow}>
              <View
                style={[
                  styles.matchStatusChip,
                  isLive ? styles.matchStatusChipLive : null,
                  isFinished ? styles.matchStatusChipFinished : null,
                  isPostponed ? styles.matchStatusChipPostponed : null,
                ]}
              >
                <Text style={styles.matchStatusText} numberOfLines={1}>{matchStatusLabel}</Text>
              </View>
              {(!isLive && !isFinished && kickoffDate) ? (
                <View style={styles.kickoffDateChip}>
                  <Ionicons name="calendar-outline" size={11} color={COLORS.textMuted} />
                  <Text style={styles.kickoffDateChipText} numberOfLines={1}>{kickoffDate}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.scoreRow}>
            <TeamSide align="left" name={homeTeamName} logo={matchDetail?.homeTeamLogo || params.homeTeamLogo} followed={isFavorite(homeTeamFavoriteId)} onToggleFollow={() => toggleFavorite(homeTeamFavoriteId)} onPress={() => {
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
            }} />
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
                </>
              ) : isPostponed ? (
                <>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={[styles.finishedLabel, { color: COLORS.live }]}>AFGELAST</Text>
                </>
              ) : (
                <>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={styles.upcomingTime} numberOfLines={1}>
                    {kickoffTime}
                  </Text>
                </>
              )}
            </View>
            <TeamSide align="right" name={awayTeamName} logo={matchDetail?.awayTeamLogo || params.awayTeamLogo} followed={isFavorite(awayTeamFavoriteId)} onToggleFollow={() => toggleFavorite(awayTeamFavoriteId)} onPress={() => {
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
            }} />
          </View>

          {/* Stadium info */}
          {matchDetail?.venue && (
            <View style={styles.venueRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.venueText}>{matchDetail.venue}</Text>
            </View>
          )}

          <View style={styles.heroActionRow}>
            <TouchableOpacity style={[styles.followChip, isMatchFollowed ? styles.followChipActive : null]} onPress={toggleMatchFollow} activeOpacity={0.8}>
              <Ionicons name={isMatchFollowed ? "notifications" : "notifications-outline"} size={14} color={isMatchFollowed ? "#fff" : COLORS.textMuted} />
              <Text style={[styles.followChipText, isMatchFollowed ? styles.followChipTextActive : null]}>{isMatchFollowed ? "Following" : "Follow match"}</Text>
            </TouchableOpacity>
          </View>
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

      {/* Mini AI strip — always visible below tab bar */}
      {activeTab !== "ai" && (predLoading || (prediction && !prediction.error)) && (
        <MiniAIPill
          prediction={prediction}
          homeTeam={params.homeTeam}
          awayTeam={params.awayTeam}
          loading={predLoading && !prediction}
          onPress={() => handleTabChange("ai")}
        />
      )}

      {/* Stream Tab — always mounted, hidden when not active */}
      <View style={[styles.streamContainer, activeTab !== "stream" ? { display: "none" } : null]}>
          {isLive ? (
            streamFinderActive ? (
              /* AI Stream Finder loading overlay */
              <View style={styles.streamFinderContainer}>
                <LinearGradient colors={["#0d0d1a", "#120a14", "#0a0a12"]} style={styles.streamFinderBg}>
                  <ActivityIndicator size="large" color={COLORS.accent} />
                  <Text style={styles.streamFinderTitle}>{tFn("matchDetail.streamFinderTitle")}</Text>
                  <Text style={styles.streamFinderSub}>{tFn("matchDetail.streamFinderSub")}</Text>
                  <View style={styles.streamFinderSteps}>
                    <View style={styles.streamFinderStep}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.green} />
                      <Text style={styles.streamFinderStepText}>{tFn("matchDetail.streamStep1")}</Text>
                    </View>
                    <View style={styles.streamFinderStep}>
                      <Ionicons name="radio-button-on" size={14} color={COLORS.accent} />
                      <Text style={styles.streamFinderStepText}>{tFn("matchDetail.streamStep2")}</Text>
                    </View>
                    <View style={styles.streamFinderStep}>
                      <Ionicons name="radio-button-off" size={14} color={COLORS.textMuted} />
                      <Text style={[styles.streamFinderStepText, { color: COLORS.textMuted }]}>{tFn("matchDetail.streamStep3")}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : (
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
            )
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
                <CombinedPitchView
                  homeTeamData={homeLineupTeam}
                  awayTeamData={awayLineupTeam}
                  league={espnLeague}
                />
              ) : (
                orderedLineupTeams.map((team: any, ti: number) => (
                  <View key={ti} style={styles.lineupTeamSection}>
                    <View style={styles.lineupHeaderRow}>
                      <Text style={styles.sectionLabel}>{team.team?.toUpperCase()}</Text>
                    </View>

                    {lineupView === "pitch" ? (
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

      {/* AI Analysis Tab */}
      {visitedTabs.ai ? (
      <ScrollView style={[styles.tabContent, activeTab !== "ai" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
        {!sportPremium ? (
          <View style={{ gap: 16, alignItems: "center" }}>
            <LinearGradient colors={["rgba(229,9,20,0.14)", "rgba(229,9,20,0.04)"]} style={{ borderRadius: 16, padding: 24, alignItems: "center", gap: 12 }}>
              <Ionicons name="lock-closed" size={36} color={COLORS.accent} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, textAlign: "center" }}>{tFn("matchDetail.premiumAIAnalysis")}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary, textAlign: "center", lineHeight: 19 }}>{tFn("matchDetail.premiumAIDesc")}</Text>
              <TouchableOpacity onPress={() => router.push("/premium")} style={{ backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, marginTop: 4 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>{tFn("matchDetail.activatePremium")}</Text>
              </TouchableOpacity>
            </LinearGradient>
            {/* Blurred preview of what they'd get */}
            <View style={{ opacity: 0.3, pointerEvents: "none" }}>
              <View style={styles.aiMainCard}>
                <View style={styles.aiHeader}>
                  <MaterialCommunityIcons name="robot" size={20} color={COLORS.accent} />
                  <Text style={styles.aiTitle}>AI Match Intelligence</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 16 }}>
                  <View style={{ alignItems: "center" }}><Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.accent }}>45%</Text><Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted }}>Home</Text></View>
                  <View style={{ alignItems: "center" }}><Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFD700" }}>25%</Text><Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted }}>Draw</Text></View>
                  <View style={{ alignItems: "center" }}><Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.live }}>30%</Text><Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted }}>Away</Text></View>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <>
          {preMatchLoading && !preMatchPrediction ? (
            <View style={styles.aiLoading}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.aiLoadingText}>{tFn("matchDetail.preMatchLoading")}</Text>
              <Text style={[styles.aiLoadingText, { fontSize: 12, marginTop: 4 }]}>{tFn("matchDetail.preMatchBasis")}</Text>
            </View>
          ) : preMatchPrediction && !preMatchPrediction.error ? (
            <>
              <Text style={styles.sectionLabel}>{tFn("matchDetail.preMatchLabel")}</Text>
              <AIPredictionView prediction={preMatchPrediction} homeTeam={params.homeTeam} awayTeam={params.awayTeam} />
              <TouchableOpacity style={styles.aiRefreshBtn} onPress={() => fetchPreMatchPrediction()}>
                <Ionicons name="refresh-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.aiRefreshText}>{tFn("matchDetail.preMatchRefresh")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.aiWaitCard}>
              <TouchableOpacity style={styles.aiTrigger} onPress={() => fetchPreMatchPrediction()}>
                <LinearGradient colors={["rgba(229,9,20,0.12)", "rgba(229,9,20,0.04)"]} style={styles.aiTriggerGrad}>
                  <MaterialCommunityIcons name="robot-outline" size={40} color={COLORS.accent} />
                  <Text style={styles.aiTriggerTitle}>{tFn("matchDetail.preMatchTitle")}</Text>
                  <Text style={styles.aiTriggerSub}>{tFn("matchDetail.preMatchSubtitle")}</Text>
                  <View style={styles.aiTriggerBtn}>
                    <Ionicons name="sparkles-outline" size={14} color="#fff" />
                    <Text style={styles.aiTriggerBtnText}>{tFn("matchDetail.startPreMatch")}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {isLive ? (
            livePredictionLoading && !livePrediction ? (
              <View style={styles.aiLoading}>
                <ActivityIndicator size="small" color={COLORS.live} />
                <Text style={styles.aiLoadingText}>{tFn("matchDetail.liveLoading")}</Text>
              </View>
            ) : livePrediction && !livePrediction.error ? (
              <>
                <Text style={styles.sectionLabel}>{tFn("matchDetail.liveLabel")}</Text>
                <AIPredictionView prediction={livePrediction} homeTeam={params.homeTeam} awayTeam={params.awayTeam} />
                <TouchableOpacity style={styles.aiRefreshBtn} onPress={() => fetchLivePrediction()}>
                  <Ionicons name="refresh-outline" size={13} color={COLORS.textMuted} />
                  <Text style={styles.aiRefreshText}>{tFn("matchDetail.liveRefresh")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.aiWaitCard}>
                {livePrediction?.error ? (
                  <View style={styles.tipCard}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.live} />
                    <Text style={styles.tipText}>{safeStr(livePrediction.error)}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.aiTrigger} onPress={() => fetchLivePrediction()}>
                  <LinearGradient colors={["rgba(229,9,20,0.12)", "rgba(229,9,20,0.04)"]} style={styles.aiTriggerGrad}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={40} color={COLORS.live} />
                    <Text style={styles.aiTriggerTitle}>{tFn("matchDetail.liveTitle")}</Text>
                    <Text style={styles.aiTriggerSub}>{tFn("matchDetail.liveSubtitle")}</Text>
                    <View style={styles.aiTriggerBtn}>
                      <Ionicons name="pulse-outline" size={14} color="#fff" />
                      <Text style={styles.aiTriggerBtnText}>{tFn("matchDetail.startLive")}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={styles.tipCard}>
              <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.accent} />
              <Text style={styles.tipText}>{tFn("matchDetail.autoStartTip")}</Text>
            </View>
          )}
          </>
        )}
        </ScrollView>
      ) : null}

    </View>
  );
}

function MiniAIPill({ prediction, homeTeam, awayTeam, loading, onPress }: any) {
  if (loading) {
    return (
      <TouchableOpacity style={styles.miniAIPill} onPress={onPress} activeOpacity={0.8}>
        <MaterialCommunityIcons name="robot-outline" size={13} color={COLORS.accent} />
        <ActivityIndicator size="small" color={COLORS.accent} style={{ marginLeft: 4, marginRight: 4 }} />
        <Text style={styles.miniAIPillLoadingText}>AI analyseert...</Text>
        <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }
  if (!prediction || prediction.error) return null;
  const homeShort = (homeTeam || "").split(" ")[0];
  const awayShort = (awayTeam || "").split(" ")[0];
  const winner = prediction.prediction === "Home Win" ? homeShort :
    prediction.prediction === "Away Win" ? awayShort : tFn("matchDetail.drawChance");
  const winnerColor = prediction.prediction === "Home Win" ? COLORS.accent :
    prediction.prediction === "Away Win" ? COLORS.live : "#FFD700";
  return (
    <TouchableOpacity style={styles.miniAIPill} onPress={onPress} activeOpacity={0.8}>
      <MaterialCommunityIcons name="robot" size={13} color={COLORS.accent} />
      <View style={styles.miniAIPillChances}>
        <Text style={[styles.miniAIPillPct, { color: COLORS.accent }]}>{prediction.homePct}%</Text>
        <Text style={styles.miniAIPillSep}>{homeShort}</Text>
      </View>
      <Text style={styles.miniAIPillDivider}>·</Text>
      <View style={styles.miniAIPillChances}>
        <Text style={[styles.miniAIPillPct, { color: "#FFD700" }]}>{prediction.drawPct}%</Text>
        <Text style={styles.miniAIPillSep}>Gelijk</Text>
      </View>
      <Text style={styles.miniAIPillDivider}>·</Text>
      <View style={styles.miniAIPillChances}>
        <Text style={[styles.miniAIPillPct, { color: COLORS.live }]}>{prediction.awayPct}%</Text>
        <Text style={styles.miniAIPillSep}>{awayShort}</Text>
      </View>
      <View style={styles.miniAIPillWinnerTag}>
        <Text style={[styles.miniAIPillWinnerText, { color: winnerColor }]}>{winner}</Text>
      </View>
      <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function TeamSide({ name, logo, onPress, followed, onToggleFollow, align = "left" }: { name: string; logo?: string; onPress?: () => void; followed?: boolean; onToggleFollow?: () => void; align?: "left" | "right" }) {
  const { width } = useWindowDimensions();
  const logoSize = width < 360 ? 40 : width < 400 ? 46 : 52;
  return (
    <View style={styles.teamSideWrap}>
      <TouchableOpacity
        style={styles.teamSide}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <TeamLogo uri={logo} teamName={name} size={logoSize} />
        <Text style={[styles.teamName, width < 360 && { fontSize: 10, maxWidth: 80 }]} numberOfLines={2}>{name}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.teamFollowBtn, followed ? styles.teamFollowBtnActive : null]} onPress={onToggleFollow}>
        <Ionicons name={followed ? "heart" : "heart-outline"} size={14} color={followed ? "#fff" : COLORS.textMuted} />
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

  const hAttackIntensity = Math.min(1, ((hInsideBox || hOnTarget) / Math.max(maxShots, 1)) * 1.5 + 0.15);
  const hMidIntensity = Math.min(1, (hPoss / 100) * 1.2);
  const hDefIntensity = Math.min(1, (aPoss / 100) * 0.5 + (aCorners / Math.max(maxCorners, 1)) * 0.3);

  const aAttackIntensity = Math.min(1, ((aInsideBox || aOnTarget) / Math.max(maxShots, 1)) * 1.5 + 0.15);
  const aMidIntensity = Math.min(1, (aPoss / 100) * 1.2);
  const aDefIntensity = Math.min(1, (hPoss / 100) * 0.5 + (hCorners / Math.max(maxCorners, 1)) * 0.3);

  const zoneColor = (intensity: number, teamColor: string) => {
    const alpha = Math.max(0.08, Math.min(0.55, intensity * 0.6));
    return teamColor === "home"
      ? `rgba(232,93,47,${alpha.toFixed(2)})`
      : `rgba(91,141,239,${alpha.toFixed(2)})`;
  };

  const shotDots: { x: number; y: number; color: string; onTarget: boolean }[] = [];
  const seedRng = (s: number) => { let v = s; return () => { v = (v * 16807 + 0) % 2147483647; return (v & 0x7fffffff) / 0x7fffffff; }; };
  const rng = seedRng(hShots * 100 + aShots * 7 + hOnTarget * 33);

  for (let i = 0; i < Math.min(hShots, 12); i++) {
    const onTarget = i < hOnTarget;
    shotDots.push({ x: 15 + rng() * 70, y: 15 + rng() * 29, color: COLORS.accent, onTarget });
  }
  for (let i = 0; i < Math.min(aShots, 12); i++) {
    const onTarget = i < aOnTarget;
    shotDots.push({ x: 15 + rng() * 70, y: 56 + rng() * 29, color: "#5B8DEF", onTarget });
  }

  const LINE = "rgba(255,255,255,0.4)";

  return (
    <View style={heatmapStyles.card}>
      <View style={heatmapStyles.header}>
        <View style={heatmapStyles.headerAccent} />
        <Text style={heatmapStyles.headerIcon}>🔥</Text>
        <View style={{ flex: 1 }}>
          <Text style={heatmapStyles.headerTitle}>ZONE CONTROL & SHOTS</Text>
          <Text style={heatmapStyles.headerSub}>Higher opacity means stronger control</Text>
        </View>
      </View>

      <View style={heatmapStyles.pitch}>
        <LinearGradient colors={["#0a2613", "#154025", "#1a4a2a", "#1a4a2a", "#154025", "#0a2613"]} style={heatmapStyles.pitchGradient}>
          {/* Away team zones (top half) */}
          <View style={heatmapStyles.halfRow}>
            <View style={[heatmapStyles.zone, { backgroundColor: zoneColor(aDefIntensity, "away") }]} />
            <View style={[heatmapStyles.zone, { backgroundColor: zoneColor(aMidIntensity, "away") }]} />
            <View style={[heatmapStyles.zone, { backgroundColor: zoneColor(aAttackIntensity, "away") }]} />
          </View>

          {/* Home team zones (bottom half) */}
          <View style={heatmapStyles.halfRow}>
            <View style={[heatmapStyles.zone, { backgroundColor: zoneColor(hAttackIntensity, "home") }]} />
            <View style={[heatmapStyles.zone, { backgroundColor: zoneColor(hMidIntensity, "home") }]} />
            <View style={[heatmapStyles.zone, { backgroundColor: zoneColor(hDefIntensity, "home") }]} />
          </View>

          {/* ── Pitch markings overlay ─────────────────── */}
          {/* Center line */}
          <View style={{ position: "absolute", top: "50%", left: 6, right: 6, height: 1, backgroundColor: LINE }} />
          {/* Center circle */}
          <View style={{ position: "absolute", top: "50%", left: "50%", width: 60, height: 60, marginLeft: -30, marginTop: -30, borderRadius: 30, borderWidth: 1, borderColor: LINE }} />
          {/* Center spot */}
          <View style={{ position: "absolute", top: "50%", left: "50%", width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 3, backgroundColor: LINE }} />

          {/* Top penalty area */}
          <View style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "16%", borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE }} />
          {/* Top goal area */}
          <View style={{ position: "absolute", top: 0, left: "33%", right: "33%", height: "7%", borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE }} />
          {/* Top penalty spot */}
          <View style={{ position: "absolute", top: "11%", left: "50%", width: 4, height: 4, marginLeft: -2, borderRadius: 2, backgroundColor: LINE }} />
          {/* Top goal line center */}
          <View style={{ position: "absolute", top: 0, left: "41%", right: "41%", height: 3, backgroundColor: "rgba(255,255,255,0.15)", borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />

          {/* Bottom penalty area */}
          <View style={{ position: "absolute", bottom: 0, left: "20%", right: "20%", height: "16%", borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1, borderColor: LINE }} />
          {/* Bottom goal area */}
          <View style={{ position: "absolute", bottom: 0, left: "33%", right: "33%", height: "7%", borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1, borderColor: LINE }} />
          {/* Bottom penalty spot */}
          <View style={{ position: "absolute", bottom: "11%", left: "50%", width: 4, height: 4, marginLeft: -2, borderRadius: 2, backgroundColor: LINE }} />
          {/* Bottom goal line center */}
          <View style={{ position: "absolute", bottom: 0, left: "41%", right: "41%", height: 3, backgroundColor: "rgba(255,255,255,0.15)", borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />

          {/* Outer border */}
          <View style={{ position: "absolute", top: 0, left: 6, right: 6, bottom: 0, borderWidth: 1, borderColor: LINE }} />

          {/* Zone labels */}
          <View style={{ position: "absolute", top: "4%", left: 0, right: 0, alignItems: "center" }}>
            <Text style={heatmapStyles.zoneLabel}>DEF</Text>
          </View>
          <View style={{ position: "absolute", top: "21%", left: 0, right: 0, alignItems: "center" }}>
            <Text style={heatmapStyles.zoneLabel}>MID</Text>
          </View>
          <View style={{ position: "absolute", top: "38%", left: 0, right: 0, alignItems: "center" }}>
            <Text style={heatmapStyles.zoneLabel}>ATT</Text>
          </View>
          <View style={{ position: "absolute", bottom: "37%", left: 0, right: 0, alignItems: "center" }}>
            <Text style={heatmapStyles.zoneLabel}>ATT</Text>
          </View>
          <View style={{ position: "absolute", bottom: "21%", left: 0, right: 0, alignItems: "center" }}>
            <Text style={heatmapStyles.zoneLabel}>MID</Text>
          </View>
          <View style={{ position: "absolute", bottom: "4%", left: 0, right: 0, alignItems: "center" }}>
            <Text style={heatmapStyles.zoneLabel}>DEF</Text>
          </View>

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

          {/* Team labels */}
          <View style={heatmapStyles.teamLabelTop}>
            <Text style={[heatmapStyles.teamLabel, { color: "#5B8DEF" }]}>{safeStr(awayTeam).toUpperCase()}</Text>
          </View>
          <View style={heatmapStyles.teamLabelBottom}>
            <Text style={[heatmapStyles.teamLabel, { color: COLORS.accent }]}>{safeStr(homeTeam).toUpperCase()}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Shot stats mini cards */}
      <View style={heatmapStyles.shotStatsRow}>
        <View style={heatmapStyles.shotStatCard}>
          <Text style={[heatmapStyles.shotStatValue, { color: COLORS.accent }]}>{hShots}</Text>
          <Text style={heatmapStyles.shotStatLabel}>Shots</Text>
          <Text style={[heatmapStyles.shotStatValue, { color: "#5B8DEF" }]}>{aShots}</Text>
        </View>
        <View style={heatmapStyles.shotStatCard}>
          <Text style={[heatmapStyles.shotStatValue, { color: COLORS.accent }]}>{hOnTarget}</Text>
          <Text style={heatmapStyles.shotStatLabel}>On Target</Text>
          <Text style={[heatmapStyles.shotStatValue, { color: "#5B8DEF" }]}>{aOnTarget}</Text>
        </View>
        <View style={heatmapStyles.shotStatCard}>
          <Text style={[heatmapStyles.shotStatValue, { color: COLORS.accent }]}>{hCorners}</Text>
          <Text style={heatmapStyles.shotStatLabel}>Corners</Text>
          <Text style={[heatmapStyles.shotStatValue, { color: "#5B8DEF" }]}>{aCorners}</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={heatmapStyles.legend}>
        <View style={heatmapStyles.legendItem}>
          <View style={[heatmapStyles.legendDot, { backgroundColor: COLORS.accent }]} />
          <Text style={heatmapStyles.legendText}>On target</Text>
        </View>
        <View style={heatmapStyles.legendItem}>
          <View style={[heatmapStyles.legendDotOutline, { borderColor: COLORS.accent }]} />
          <Text style={heatmapStyles.legendText}>Off target</Text>
        </View>
        <View style={heatmapStyles.legendItem}>
          <View style={[heatmapStyles.legendZone, { backgroundColor: "rgba(232,93,47,0.3)" }]} />
          <Text style={heatmapStyles.legendText}>Home</Text>
        </View>
        <View style={heatmapStyles.legendItem}>
          <View style={[heatmapStyles.legendZone, { backgroundColor: "rgba(91,141,239,0.3)" }]} />
          <Text style={heatmapStyles.legendText}>Away</Text>
        </View>
      </View>

      {/* Possession bar */}
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
    borderRadius: 16,
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
  headerIcon: { fontSize: 14 },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSub: {
    marginTop: 2,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  pitch: {
    marginHorizontal: 12,
    marginVertical: 12,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pitchGradient: {
    aspectRatio: 0.68,
    position: "relative",
  },
  halfRow: {
    flex: 1,
    flexDirection: "column",
  },
  zone: {
    flex: 1,
  },
  zoneLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "rgba(255,255,255,0.2)",
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
  teamLabelTop: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  teamLabelBottom: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  teamLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    opacity: 0.7,
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  shotStatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    minWidth: 18,
    textAlign: "center",
  },
  shotStatLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    textAlign: "center",
  },
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
      icon: "⚽",
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
      icon: "🎯",
      keys: ["corner_kicks", "corners", "cornerKicks", "crosses", "crossesTotal", "crosses_successful",
             "successful_dribbles", "dribbles_completed", "dribblesCompleted", "dribbles_attempted", "offsides"],
    },
    {
      label: "PASSING",
      icon: "↗️",
      keys: ["total_passes", "totalPasses", "passes", "accurate_passes", "accuratePasses",
             "pass_accuracy", "passAccuracy", "key_passes", "keyPasses",
             "passes_final_third", "passesFinalThird", "long_balls", "longBalls", "long_balls_accurate"],
    },
    {
      label: "DEFENDING",
      icon: "🛡️",
      keys: ["total_tackles", "tackles", "tacklesWon", "interceptions", "clearances", "blocks",
             "aerial_won", "aerialWon", "total_duels", "totalDuels", "duels_won", "duelsWon", "ground_duels_won"],
    },
    {
      label: "GOALKEEPING",
      icon: "🧤",
      keys: ["goalkeeper_saves", "saves", "goalkeeperSaves", "goals_prevented", "goalsPrevented", "punches"],
    },
    {
      label: "DISCIPLINE",
      icon: "🟨",
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
          <Text style={[styles.statVal, hVal > aVal && styles.statValWinner]}>{hDisplay}</Text>
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
          <Text style={[styles.statVal, styles.statValRight, aVal > hVal && styles.statValWinner]}>{aDisplay}</Text>
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
              <Text style={styles.statSectionIcon}>{section.icon}</Text>
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
    void resolvePlayerImageUri(seed, { allowNetwork: false }).then((uri) => {
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
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.textMuted }}>{initialsFrom(player.name)}</Text>
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

function initialsFrom(name: string): string {
  return (name || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

function PitchDot({ player, color, teamName, league }: { player: any; color: string; teamName?: string; league?: string }) {
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

  useEffect(() => {
    setResolvedPhoto(getBestCachedOrSeedPlayerImage(seed));
    setImageFailed(false);
  }, [seed]);

  useEffect(() => {
    let disposed = false;
    void resolvePlayerImageUri(seed, { allowNetwork: false }).then((uri) => {
      if (disposed || !uri) return;
      setResolvedPhoto(uri);
      setImageFailed(false);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [seed]);

  return (
    <View style={styles.pitchDotWrap}>
      <View style={[styles.pitchDotCircle, { borderColor: color }]}>
        {showPhoto ? (
          <Image
            source={{ uri: currentPhoto! }}
            style={styles.pitchDotPhoto}
            onError={() => {
              setImageFailed(true);
            }}
          />
        ) : null}
        {!showPhoto ? (
          <Text style={[styles.pitchDotNum, { color }]}>{player.jersey || "—"}</Text>
        ) : null}
      </View>
      <Text style={styles.pitchDotName} numberOfLines={1}>{shortPlayerName(player.name)}</Text>
    </View>
  );
}

function CombinedPitchViewInner({ homeTeamData, awayTeamData, league }: { homeTeamData: any; awayTeamData: any; league?: string }) {
  // Home at top: GK first, attackers last (toward center line)
  const homeRows = [...buildFormationRows(homeTeamData?.players || [], homeTeamData?.formation)].reverse();
  // Away at bottom: attackers first (near center line), GK last
  const awayRows = buildFormationRows(awayTeamData?.players || [], awayTeamData?.formation);

  return (
    <LinearGradient colors={["#0d2e18", "#1a4428", "#1a4428", "#0d2e18"]} style={styles.combinedPitch}>
      {/* Field markings */}
      <View style={styles.pitchPenaltyBoxTop} />
      <View style={styles.pitchGoalBoxTop} />
      <View style={styles.pitchTopArc} />
      <View style={styles.pitchCenterLine} />
      <View style={styles.pitchCenterCircleNew} />
      <View style={styles.pitchPenaltyBoxBottom} />
      <View style={styles.pitchGoalBoxBottom} />
      <View style={styles.pitchBottomArc} />

      {/* Away team label */}
      {/* Home team label (top) */}
      <View style={styles.pitchTeamLabelRow}>
        <Text style={[styles.pitchTeamLabel, { color: COLORS.accent }]}>{homeTeamData?.team?.toUpperCase()}</Text>
        {homeTeamData?.formation ? <Text style={styles.pitchFormLabel}>{homeTeamData.formation}</Text> : null}
      </View>

      {/* Home rows (GK top → FWDs center) */}
      {homeRows.map((row, ri) => (
        <View key={`home_${ri}`} style={styles.combinedPitchRow}>
          {row.map((p: any, pi: number) => (
            <PitchDot key={`h_${p?.id || p?.name || pi}`} player={p} color={COLORS.accent} teamName={homeTeamData?.team} league={league} />
          ))}
        </View>
      ))}

      {/* Center divider */}
      <View style={styles.pitchDivider} />

      {/* Away rows (FWDs center → GK bottom) */}
      {awayRows.map((row, ri) => (
        <View key={`away_${ri}`} style={styles.combinedPitchRow}>
          {row.map((p: any, pi: number) => (
            <PitchDot key={`a_${p?.id || p?.name || pi}`} player={p} color="#5D9EFF" teamName={awayTeamData?.team} league={league} />
          ))}
        </View>
      ))}

      {/* Away team label (bottom) */}
      <View style={styles.pitchTeamLabelRow}>
        <Text style={[styles.pitchTeamLabel, { color: "#5D9EFF" }]}>{awayTeamData?.team?.toUpperCase()}</Text>
        {awayTeamData?.formation ? <Text style={styles.pitchFormLabel}>{awayTeamData.formation}</Text> : null}
      </View>
    </LinearGradient>
  );
}

const CombinedPitchView = React.memo(CombinedPitchViewInner);

function AIPredictionViewInner({ prediction, homeTeam, awayTeam }: any) {
  const normPcts = (() => {
    let homePct = Number(prediction?.homePct || 0);
    let drawPct = Number(prediction?.drawPct || 0);
    let awayPct = Number(prediction?.awayPct || 0);
    if (!Number.isFinite(homePct)) homePct = 0;
    if (!Number.isFinite(drawPct)) drawPct = 0;
    if (!Number.isFinite(awayPct)) awayPct = 0;
    const sum = homePct + drawPct + awayPct;
    if (sum <= 0) return { homePct: 34, drawPct: 33, awayPct: 33 };
    homePct = Math.round((homePct / sum) * 100);
    drawPct = Math.round((drawPct / sum) * 100);
    awayPct = 100 - homePct - drawPct;
    return { homePct, drawPct, awayPct };
  })();

  const hasXgData = prediction?.xgHome !== null && prediction?.xgHome !== undefined && prediction?.xgAway !== null && prediction?.xgAway !== undefined;
  const winnerColor = prediction.prediction === "Home Win" ? COLORS.accent :
    prediction.prediction === "Away Win" ? COLORS.live : "#FFD700";
  const riskColor = prediction.riskLevel === "Low" ? "#4CAF50" : prediction.riskLevel === "High" ? COLORS.live : "#FF9800";
  const bttsPct = Number(prediction?.bothTeamsToScorePct);
  const over25Pct = Number(prediction?.over25Pct);
  const homeDcPct = Number(prediction?.doubleChanceHomePct);
  const awayDcPct = Number(prediction?.doubleChanceAwayPct);
  const edgeScore = Number(prediction?.edgeScore);
  const hasMarketMetrics = [bttsPct, over25Pct, homeDcPct, awayDcPct].some((v) => Number.isFinite(v));
  const hasEdgeScore = Number.isFinite(edgeScore);
  const winGapPct = Math.abs(normPcts.homePct - normPcts.awayPct);
  const totalXg = hasXgData
    ? Math.max(0, Number(prediction?.xgHome || 0)) + Math.max(0, Number(prediction?.xgAway || 0))
    : null;
  const volatilityScore = Math.max(0, Math.min(100, Math.round((normPcts.drawPct * 1.2) + ((100 - winGapPct) * 0.45))));
  const recommendationLabel = (() => {
    if (hasEdgeScore && edgeScore >= 78 && prediction?.confidence >= 70) return "High Edge";
    if (hasEdgeScore && edgeScore >= 62) return "Balanced Value";
    return "Watchlist";
  })();
  const recommendationColor = recommendationLabel === "High Edge"
    ? COLORS.green
    : recommendationLabel === "Balanced Value"
      ? COLORS.accent
      : COLORS.textMuted;

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

const AIPredictionView = React.memo(AIPredictionViewInner);

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
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  backBtn: {
    marginBottom: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignSelf: "flex-start",
  },
  matchHeader: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
  },
  competitionRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  competitionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
    flexShrink: 0,
  },
  matchStatusChip: {
    minWidth: 78,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  matchStatusChipLive: {
    backgroundColor: `${COLORS.accent}22`,
    borderColor: `${COLORS.accent}66`,
  },
  matchStatusChipFinished: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  matchStatusChipPostponed: {
    backgroundColor: "rgba(255,82,82,0.18)",
    borderColor: "rgba(255,82,82,0.35)",
  },
  matchStatusText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.text,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  competitionCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  leagueFallbackIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  leagueName: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxWidth: "90%",
  },
  kickoffDateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 140,
  },
  kickoffDateChipText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    textTransform: "capitalize",
  },
  scoreRow: { flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 4, justifyContent: "center" },
  teamSideWrap: { flex: 1, alignItems: "center", gap: 8 },
  teamSide: { alignItems: "center", gap: 8 },
  teamFollowBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    color: COLORS.text,
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 112,
  },
  scoreCenter: { minWidth: 92, alignItems: "center", gap: 5 },
  score: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 44,
    color: COLORS.text,
    flexDirection: "row",
    // @ts-ignore
    textShadowColor: "rgba(255,48,64,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    textAlign: "center",
  },
  vsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 3,
  },
  upcomingTime: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    letterSpacing: 0.3,
  },
  finishedLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  followChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    minHeight: 36,
  },
  followChipActive: {
    backgroundColor: `${COLORS.accent}cc`,
    borderColor: `${COLORS.accent}55`,
  },
  followChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 0.2,
  },
  followChipTextActive: {
    color: "#fff",
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    opacity: 0.9,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  venueText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  tabBarScroll: {
    flexGrow: 0,
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
  streamFinderContainer: { flex: 1 },
  streamFinderBg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
    gap: 16,
  },
  streamFinderTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
    color: COLORS.text,
    textAlign: "center",
  },
  streamFinderSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  streamFinderSteps: { gap: 10, marginTop: 8, width: "100%" },
  streamFinderStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  streamFinderStepText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
  },
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
  statSectionIcon: {
    fontSize: 13,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 2 },
  statVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.textSecondary,
    width: 42,
    textAlign: "center",
  },
  statValRight: {
    textAlign: "center",
  },
  statValWinner: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 15,
  },
  statBarContainer: { flex: 1, alignItems: "center", gap: 4 },
  statName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: "center",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statBarsWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 5,
  },
  statBarHalf: {
    flex: 1,
    flexDirection: "row",
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statBarHomeFill: {
    height: 5,
    backgroundColor: COLORS.accent,
    borderRadius: 2.5,
  },
  statBarCenterGap: {
    width: 2,
  },
  statBarAwayFill: {
    height: 5,
    backgroundColor: "#5B8DEF",
    borderRadius: 2.5,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 13,
    marginBottom: 16,
    gap: 8,
  },
  lineupTeamSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lineupTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.text,
  },
  lineupFormation: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
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
    justifyContent: "space-evenly",
    alignItems: "center",
    gap: 8,
    zIndex: 2,
  },
  pitchPlayerWrap: { minWidth: 72, flex: 1, maxWidth: 120 },
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 6,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 460,
    minHeight: 560,
  },
  combinedPitchRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    alignSelf: "stretch",
    zIndex: 2,
    paddingHorizontal: 2,
    minHeight: 58,
    gap: 6,
  },
  pitchDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.34)",
    marginHorizontal: 18,
    marginVertical: 8,
    zIndex: 2,
  },
  pitchTeamLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    zIndex: 2,
    paddingVertical: 2,
  },
  pitchTeamLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  pitchFormLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: "rgba(255,255,255,0.5)",
  },
  pitchTopArc: {
    position: "absolute",
    width: 88,
    height: 44,
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderTopWidth: 0,
    top: 0,
    left: "50%",
    marginLeft: -44,
    zIndex: 1,
  },
  pitchBottomArc: {
    position: "absolute",
    width: 88,
    height: 44,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderBottomWidth: 0,
    bottom: 0,
    left: "50%",
    marginLeft: -44,
    zIndex: 1,
  },
  pitchCenterLine: {
    position: "absolute",
    left: 8,
    right: 8,
    top: "50%",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    zIndex: 1,
  },
  pitchCenterCircleNew: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    left: "50%",
    marginLeft: -30,
    top: "50%",
    marginTop: -30,
    zIndex: 1,
  },
  pitchPenaltyBoxTop: {
    position: "absolute",
    width: "54%",
    height: 58,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderTopWidth: 0,
    top: 0,
    left: "23%",
    zIndex: 1,
  },
  pitchGoalBoxTop: {
    position: "absolute",
    width: "28%",
    height: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderTopWidth: 0,
    top: 0,
    left: "36%",
    zIndex: 1,
  },
  pitchPenaltyBoxBottom: {
    position: "absolute",
    width: "54%",
    height: 58,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderBottomWidth: 0,
    bottom: 0,
    left: "23%",
    zIndex: 1,
  },
  pitchGoalBoxBottom: {
    position: "absolute",
    width: "28%",
    height: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderBottomWidth: 0,
    bottom: 0,
    left: "36%",
    zIndex: 1,
  },
  pitchDotWrap: {
    alignItems: "center",
    gap: 2,
    width: 62,
    maxWidth: 62,
    flexShrink: 0,
    paddingVertical: 2,
  },
  pitchDotCircle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pitchDotPhoto: {
    width: 35,
    height: 35,
    borderRadius: 6,
    position: "absolute",
  },
  pitchDotNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 12,
  },
  pitchDotName: {
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
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
  // MiniAIPill styles
  miniAIPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexWrap: "nowrap",
  },
  miniAIPillChances: {
    alignItems: "center",
    gap: 1,
  },
  miniAIPillPct: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 13,
  },
  miniAIPillSep: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: COLORS.textMuted,
  },
  miniAIPillDivider: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.border,
  },
  miniAIPillWinnerTag: {
    flex: 1,
    alignItems: "flex-end",
  },
  miniAIPillWinnerText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  miniAIPillLoadingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
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
