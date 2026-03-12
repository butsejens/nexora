import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Image, ActivityIndicator, Linking,
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
import { TeamLogo } from "@/components/MatchCard";
import { buildErrorReference, normalizeApiError } from "@/lib/error-messages";

const BLOCK_POPUP_JS = `
  (function() {
    try {
      window.open = function() { return null; };
      document.addEventListener('click', function(e) {
        var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
        if (a) { e.preventDefault(); e.stopPropagation(); }
      }, true);
      window.addEventListener('beforeunload', function(e) { e.stopImmediatePropagation(); }, true);
    } catch(err) {}
  })();
  true;
`;

const TABS = [
  { id: "stream",   label: "Stream",      icon: "play-circle-outline" },
  { id: "stats",    label: "Stats",       icon: "bar-chart-outline" },
  { id: "lineups",  label: "Lineups",     icon: "people-outline" },
  { id: "ai",       label: "Analyse",     icon: "analytics-outline" },
] as const;

type TabId = "stream" | "stats" | "lineups" | "ai";

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

  const lines = formationNums.length >= 3 ? formationNums.slice(0, 3) : [4, 3, 3];
  const defenders = takeFrom([...byRole.def], lines[0]);
  while (defenders.length < lines[0] && pool.length) defenders.push(pool.shift());

  const mids = takeFrom([...byRole.mid], lines[1]);
  while (mids.length < lines[1] && pool.length) mids.push(pool.shift());

  const fwds = takeFrom([...byRole.fwd], lines[2]);
  while (fwds.length < lines[2] && pool.length) fwds.push(pool.shift());

  return [fwds, mids, defenders, gk].filter((row) => row.length > 0);
}

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{
    matchId: string; homeTeam: string; awayTeam: string;
    homeTeamLogo?: string; awayTeamLogo?: string;
    homeScore?: string; awayScore?: string;
    league: string; minute?: string; status: string; sport: string;
  }>();

  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>("stream");
  const [lineupView, setLineupView] = useState<"pitch" | "list">("pitch");
  const [streamKey, setStreamKey] = useState(0);
  const [streamWebError, setStreamWebError] = useState<unknown>(null);
  const [streamErrorRef, setStreamErrorRef] = useState<string>("");
  const [streamFinderActive, setStreamFinderActive] = useState(false);
  const [streamFinderDone, setStreamFinderDone] = useState(false);
  const streamFinderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLive = params.status === "live";
  const isFinished = params.status === "finished" || params.status === "ft" || params.status === "done";
  const hasScore = isLive || isFinished || (Number(params.homeScore ?? -1) >= 0 && Number(params.awayScore ?? -1) >= 0 && (Number(params.homeScore) > 0 || Number(params.awayScore) > 0));
  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamFetchError,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["match-stream", params.matchId, params.league],
    queryFn: async () => {
      const map: Record<string, string> = {
        "Premier League": "eng.1", "UEFA Champions League": "uefa.champions",
        "UEFA Europa League": "uefa.europa", "UEFA Conference League": "uefa.europa.conf",
        "Bundesliga": "ger.1", "La Liga": "esp.1",
        "Jupiler Pro League": "bel.1", "Ligue 1": "fra.1", "Serie A": "ita.1",
      };
      const streamLeague = map[params.league] || "eng.1";
      const res = await apiRequest("GET", `/api/sports/stream/${params.matchId}?league=${encodeURIComponent(streamLeague)}`);
      return res.json();
    },
    enabled: !!params.matchId && isLive,
    staleTime: 60_000,
  });
  const streamUrl = streamData?.url || `https://embedme.top/embed/alpha/${params.matchId}/1`;
  const streamApiError = normalizeApiError(streamFetchError || streamData?.error || null);
  const streamPlayerError = normalizeApiError(streamWebError);
  const hasStreamApiIssue = Boolean(streamFetchError || streamData?.error);
  const hasStreamPlayerIssue = Boolean(streamWebError);

  const espnSport = "soccer";
  const espnLeague = (() => {
    const map: Record<string, string> = {
      "Premier League": "eng.1", "UEFA Champions League": "uefa.champions",
      "UEFA Europa League": "uefa.europa", "UEFA Conference League": "uefa.europa.conf",
      "Bundesliga": "ger.1", "La Liga": "esp.1",
      "Jupiler Pro League": "bel.1", "Ligue 1": "fra.1", "Serie A": "ita.1",
    };
    return map[params.league] || "eng.1";
  })();

  const { data: matchDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["match-detail", params.matchId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/match/${params.matchId}?sport=${espnSport}&league=${espnLeague}`);
      return res.json();
    },
    enabled: true,
    // Live matches: refresh every 10s so score/cards/etc stay up to date.
    refetchInterval: isLive ? 10000 : false,
    refetchIntervalInBackground: true,
    staleTime: isLive ? 4000 : 30000,
  });

  const liveHomeScore = matchDetail?.homeScore ?? Number(params.homeScore ?? 0);
  const liveAwayScore = matchDetail?.awayScore ?? Number(params.awayScore ?? 0);
  const liveMinute = matchDetail?.minute ?? (params.minute ? parseInt(params.minute) : undefined);
  const watchOptions = Array.isArray(matchDetail?.watchOptions) ? matchDetail.watchOptions : [];

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

      const [standingsData, scorersData] = await Promise.all([
        (async () => {
          try {
            const res = await apiRequest("GET", `/api/sports/standings/${encodeURIComponent(params.league)}`);
            return await res.json();
          } catch {
            return null;
          }
        })(),
        (async () => {
          try {
            const res = await apiRequest("GET", `/api/sports/topscorers/${encodeURIComponent(params.league)}`);
            return await res.json();
          } catch {
            return null;
          }
        })(),
      ]);

      const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
      const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

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

      const isLiveMode = mode === "live";

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
        },
      });
      const json = await res.json();
      if (json && typeof json === "object" && "prediction" in json && json.prediction && typeof json.prediction === "object") {
        return json.prediction;
      }
      return json;
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

  const handleOpenWatchUrl = async (url: string) => {
    const target = String(url || "").trim();
    if (!target) return;
    SafeHaptics.impactLight();
    try {
      const canOpen = await Linking.canOpenURL(target);
      if (canOpen) await Linking.openURL(target);
    } catch {}
  };

  // Auto-fetch AI predictions
  const hasFetchedPrematchRef = useRef(false);
  const lastLivePredictionAtRef = useRef(0);

  // Auto-activate AI stream finder on first mount when live match opens on stream tab
  useEffect(() => {
    if (isLive && activeTab === "stream" && !streamFinderDone) {
      setStreamFinderActive(true);
      streamFinderTimerRef.current = setTimeout(() => {
        setStreamFinderActive(false);
        setStreamFinderDone(true);
      }, 3000);
    }
    return () => {
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={[COLORS.cardElevated, COLORS.surface, COLORS.background]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.matchHeader}>
          <Text style={styles.leagueName}>{params.league}</Text>
          <View style={styles.scoreRow}>
            <TeamSide align="left" name={params.homeTeam} logo={matchDetail?.homeTeamLogo || params.homeTeamLogo} onPress={() => {
              const fallbackTeamId = `name:${encodeURIComponent(params.homeTeam || "")}`;
              router.push({
                pathname: "/team-detail",
                params: {
                  teamId: matchDetail?.homeTeamId || fallbackTeamId,
                  teamName: params.homeTeam,
                  logo: matchDetail?.homeTeamLogo || params.homeTeamLogo || "",
                  sport: espnSport,
                  league: espnLeague,
                },
              });
            }} />
            <View style={styles.scoreCenter}>
              {isLive ? (
                <>
                  <Text style={styles.score}>{liveHomeScore} - {liveAwayScore}</Text>
                  <LiveBadge minute={liveMinute} small />
                </>
              ) : isFinished ? (
                <>
                  <Text style={styles.score}>{liveHomeScore} - {liveAwayScore}</Text>
                  <Text style={styles.finishedLabel}>FT</Text>
                </>
              ) : (
                <>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={styles.upcomingTime}>Gepland</Text>
                </>
              )}
            </View>
            <TeamSide align="right" name={params.awayTeam} logo={matchDetail?.awayTeamLogo || params.awayTeamLogo} onPress={() => {
              const fallbackTeamId = `name:${encodeURIComponent(params.awayTeam || "")}`;
              router.push({
                pathname: "/team-detail",
                params: {
                  teamId: matchDetail?.awayTeamId || fallbackTeamId,
                  teamName: params.awayTeam,
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
        </View>
      </LinearGradient>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => handleTabChange(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.id ? "#fff" : COLORS.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
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
                  <Text style={styles.streamFinderTitle}>AI zoekt de beste stream…</Text>
                  <Text style={styles.streamFinderSub}>Even geduld, prioriteit: officiële uitzender → hoogste kwaliteit → laagste latency</Text>
                  <View style={styles.streamFinderSteps}>
                    <View style={styles.streamFinderStep}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.green} />
                      <Text style={styles.streamFinderStepText}>Officiële broadcaster zoeken…</Text>
                    </View>
                    <View style={styles.streamFinderStep}>
                      <Ionicons name="radio-button-on" size={14} color={COLORS.accent} />
                      <Text style={styles.streamFinderStepText}>Beste resolutie bepalen…</Text>
                    </View>
                    <View style={styles.streamFinderStep}>
                      <Ionicons name="radio-button-off" size={14} color={COLORS.textMuted} />
                      <Text style={[styles.streamFinderStepText, { color: COLORS.textMuted }]}>Stream initialiseren…</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : (
              <>
                <View style={styles.videoBox}>
                  <WebView key={streamKey} source={{ uri: streamUrl }}
                    style={{ flex: 1, backgroundColor: "#000" }}
                    allowsFullscreenVideo mediaPlaybackRequiresUserAction={false}
                    javaScriptEnabled domStorageEnabled
                    setSupportMultipleWindows={false}
                    allowsInlineMediaPlayback
                    injectedJavaScript={BLOCK_POPUP_JS}
                    onShouldStartLoadWithRequest={(req) => {
                      const url = (req.url || "").toLowerCase();
                      if (url.includes("google.") || url.includes("bing.com") || url.includes("yahoo.com")) return false;
                      if (url.includes("doubleclick.") || url.includes("googleads.") || url.includes("googlesyndication.")) return false;
                      if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
                      return true;
                    }}
                    onError={(event) => {
                      const err = event?.nativeEvent?.description || "WebView stream fout";
                      setStreamWebError(err);
                      setStreamErrorRef((prev) => prev || buildErrorReference("NX-STR"));
                    }}
                  />
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
                        {streamErrorRef ? <Text style={styles.streamErrorRef}>Foutcode: {streamErrorRef}</Text> : null}
                      </View>
                    </View>
                  ) : null}
                  {hasStreamApiIssue && hasStreamPlayerIssue ? (
                    <View style={styles.streamErrorCard}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.textMuted} />
                      <Text style={styles.streamErrorText}>Geen stream beschikbaar momenteel.</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity style={styles.serverBtn} onPress={handleRetryAutoStream}>
                    <Ionicons name="refresh-outline" size={12} color={COLORS.accent} />
                    <Text style={styles.serverBtnText}>Andere stream laden</Text>
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
              <Text style={styles.notLiveTitle}>Wedstrijd nog niet begonnen</Text>
              <Text style={styles.notLiveText}>De livestream start automatisch zodra de wedstrijd begint.</Text>
            </View>
          )}
        </View>

      {/* Stats Tab — always mounted, hidden when not active */}
      <ScrollView style={[styles.tabContent, activeTab !== "stats" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {detailLoading ? (
            <LoadingState />
          ) : matchDetail ? (
            <>
              <Text style={styles.sectionLabel}>WEDSTRIJD STATISTIEKEN</Text>
              <StatsBars
                homeTeam={params.homeTeam}
                awayTeam={params.awayTeam}
                homeStats={matchDetail.homeStats || {}}
                awayStats={matchDetail.awayStats || {}}
              />
              {matchDetail.keyEvents?.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 20 }]}>WEDSTRIJD TIJDLIJN</Text>
                  <MatchTimeline
                    events={matchDetail.keyEvents}
                    homeTeam={params.homeTeam}
                    awayTeam={params.awayTeam}
                  />
                </>
              )}
              {matchDetail.venue && (
                <InfoBlock title="STADION INFO">
                  <InfoRow label="Stadion" value={matchDetail.venue} />
                  {matchDetail.attendance && <InfoRow label="Toeschouwers" value={matchDetail.attendance.toLocaleString()} />}
                  {matchDetail.referee && <InfoRow label="Scheidsrechter" value={matchDetail.referee} />}
                </InfoBlock>
              )}
            </>
          ) : (
            <EmptyState icon="stats-chart-outline" text="Statistieken niet beschikbaar voor deze wedstrijd" />
          )}
        </ScrollView>

      {/* Lineups/Matchen Tab — always mounted, hidden when not active */}
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
          ) : matchDetail?.starters?.length > 0 ? (
            <>
              {/* Combined team header: [Logo] [Naam] | [Naam] [Logo] */}
              {matchDetail.starters.length >= 2 && (
                <View style={styles.lineupTeamHeader}>
                  <View style={styles.lineupTeamSide}>
                    <TeamLogo uri={matchDetail?.homeTeamLogo || params.homeTeamLogo} teamName={matchDetail.starters[0]?.team} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineupTeamName} numberOfLines={1}>{matchDetail.starters[0]?.team}</Text>
                      {matchDetail.starters[0]?.formation ? <Text style={styles.lineupFormation}>{matchDetail.starters[0].formation}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.lineupTeamDivider}><Text style={styles.lineupVsSmall}>VS</Text></View>
                  <View style={[styles.lineupTeamSide, { flexDirection: "row-reverse" }]}>
                    <TeamLogo uri={matchDetail?.awayTeamLogo || params.awayTeamLogo} teamName={matchDetail.starters[1]?.team} size={36} />
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={styles.lineupTeamName} numberOfLines={1}>{matchDetail.starters[1]?.team}</Text>
                      {matchDetail.starters[1]?.formation ? <Text style={styles.lineupFormation}>{matchDetail.starters[1].formation}</Text> : null}
                    </View>
                  </View>
                </View>
              )}

              {lineupView === "pitch" && matchDetail.starters.length >= 2 ? (
                <CombinedPitchView
                  homeTeamData={matchDetail.starters[0]}
                  awayTeamData={matchDetail.starters[1]}
                />
              ) : (
                matchDetail.starters.map((team: any, ti: number) => (
                  <View key={ti} style={styles.lineupTeamSection}>
                    <View style={styles.lineupHeaderRow}>
                      <Text style={styles.sectionLabel}>{team.team?.toUpperCase()}</Text>
                      <View style={styles.lineupTypeBadge}>
                        <Text style={styles.lineupTypeText}>{team.lineupType === "official" ? "OFFICIEEL" : "VERWACHT"}</Text>
                      </View>
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
                                <PlayerRow player={p} sport={params.sport} compact teamName={team.team} />
                              </View>
                            ))}
                          </View>
                        ))}
                      </LinearGradient>
                    ) : (
                      <View style={styles.lineupListCard}>
                        <Text style={styles.lineupListLabel}>STARTING XI</Text>
                        {(team.players || []).filter((p: any) => p?.starter !== false).map((p: any, i: number) => (
                          <PlayerRow key={`st_${p?.id || p?.name || i}`} player={p} sport={params.sport} teamName={team.team} />
                        ))}
                        {(team.players || []).some((p: any) => p?.starter === false) ? (
                          <>
                            <Text style={[styles.lineupListLabel, { marginTop: 10 }]}>BENCH</Text>
                            {(team.players || []).filter((p: any) => p?.starter === false).map((p: any, i: number) => (
                              <PlayerRow key={`bn_${p?.id || p?.name || i}`} player={p} sport={params.sport} teamName={team.team} />
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
            <EmptyState icon="people-outline" text="Opstelling nog niet beschikbaar" />
          )}
        </ScrollView>

      {/* AI Analysis Tab — always mounted, hidden when not active */}
      <ScrollView style={[styles.tabContent, activeTab !== "ai" ? { display: "none" } : null]} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {preMatchLoading && !preMatchPrediction ? (
            <View style={styles.aiLoading}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.aiLoadingText}>Pre-match AI analyse wordt voorbereid...</Text>
              <Text style={[styles.aiLoadingText, { fontSize: 12, marginTop: 4 }]}>Vaste analyse op basis van vorm en context</Text>
            </View>
          ) : preMatchPrediction && !preMatchPrediction.error ? (
            <>
              <Text style={styles.sectionLabel}>PRE-MATCH ANALYSE (VAST)</Text>
              <AIPredictionView prediction={preMatchPrediction} homeTeam={params.homeTeam} awayTeam={params.awayTeam} />
              <TouchableOpacity style={styles.aiRefreshBtn} onPress={() => fetchPreMatchPrediction()}>
                <Ionicons name="refresh-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.aiRefreshText}>Vaste analyse vernieuwen</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.aiWaitCard}>
              <TouchableOpacity style={styles.aiTrigger} onPress={() => fetchPreMatchPrediction()}>
                <LinearGradient colors={["rgba(229,9,20,0.12)", "rgba(229,9,20,0.04)"]} style={styles.aiTriggerGrad}>
                  <MaterialCommunityIcons name="robot-outline" size={40} color={COLORS.accent} />
                  <Text style={styles.aiTriggerTitle}>Pre-match AI Analyse</Text>
                  <Text style={styles.aiTriggerSub}>Stabiele analyse die niet verandert tijdens de match</Text>
                  <View style={styles.aiTriggerBtn}>
                    <Ionicons name="sparkles-outline" size={14} color="#fff" />
                    <Text style={styles.aiTriggerBtnText}>Start pre-match analyse</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {isLive ? (
            livePredictionLoading && !livePrediction ? (
              <View style={styles.aiLoading}>
                <ActivityIndicator size="small" color={COLORS.live} />
                <Text style={styles.aiLoadingText}>Live AI analyse wordt ververst...</Text>
              </View>
            ) : livePrediction && !livePrediction.error ? (
              <>
                <Text style={styles.sectionLabel}>LIVE ANALYSE (DYNAMISCH)</Text>
                <AIPredictionView prediction={livePrediction} homeTeam={params.homeTeam} awayTeam={params.awayTeam} />
                <TouchableOpacity style={styles.aiRefreshBtn} onPress={() => fetchLivePrediction()}>
                  <Ionicons name="refresh-outline" size={13} color={COLORS.textMuted} />
                  <Text style={styles.aiRefreshText}>Live analyse vernieuwen</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.aiWaitCard}>
                {livePrediction?.error ? (
                  <View style={styles.tipCard}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.live} />
                    <Text style={styles.tipText}>{String(livePrediction.error)}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.aiTrigger} onPress={() => fetchLivePrediction()}>
                  <LinearGradient colors={["rgba(229,9,20,0.12)", "rgba(229,9,20,0.04)"]} style={styles.aiTriggerGrad}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={40} color={COLORS.live} />
                    <Text style={styles.aiTriggerTitle}>Live AI Analyse</Text>
                    <Text style={styles.aiTriggerSub}>Realtime analyse met score, events en momentum</Text>
                    <View style={styles.aiTriggerBtn}>
                      <Ionicons name="pulse-outline" size={14} color="#fff" />
                      <Text style={styles.aiTriggerBtnText}>Start live analyse</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={styles.tipCard}>
              <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.accent} />
              <Text style={styles.tipText}>Live analyse start automatisch zodra de wedstrijd live is.</Text>
            </View>
          )}
        </ScrollView>

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
    prediction.prediction === "Away Win" ? awayShort : "Gelijk";
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

function TeamSide({ name, logo, onPress, align = "left" }: { name: string; logo?: string; onPress?: () => void; align?: "left" | "right" }) {
  const isRight = align === "right";
  return (
    <TouchableOpacity
      style={[styles.teamSide, isRight ? styles.teamSideRight : styles.teamSideLeft]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {!isRight && <TeamLogo uri={logo} teamName={name} size={56} />}
      <View style={[styles.teamNameWrap, isRight && { alignItems: "flex-end" }]}>
        <Text style={[styles.teamName, isRight && { textAlign: "right" }]} numberOfLines={2}>{name}</Text>
      </View>
      {isRight && <TeamLogo uri={logo} teamName={name} size={56} />}
    </TouchableOpacity>
  );
}

function eventIconByType(typeRaw: string) {
  const t = String(typeRaw || "").toLowerCase();
  if (t.includes("goal")) return "football-outline" as const;
  if (t.includes("yellow") || t.includes("red") || t.includes("card")) return "card-outline" as const;
  if (t.includes("sub") || t.includes("wissel")) return "swap-horizontal-outline" as const;
  if (t.includes("pen")) return "radio-button-on-outline" as const;
  return "information-circle-outline" as const;
}

function eventIconByType(typeRaw: string) {
  const t = String(typeRaw || "").toLowerCase();
  if (t.includes("goal")) return "football-outline" as const;
  if (t.includes("yellow") || t.includes("red") || t.includes("card")) return "card-outline" as const;
  if (t.includes("sub") || t.includes("wissel")) return "swap-horizontal-outline" as const;
  if (t.includes("pen")) return "radio-button-on-outline" as const;
  return "information-circle-outline" as const;
}

function MatchTimeline({ events, homeTeam, awayTeam }: { events: any[]; homeTeam: string; awayTeam: string }) {
  if (!events?.length) {
    return <EmptyState icon="timer-outline" text="Geen events beschikbaar" />;
  }

  const getEventConfig = (typeRaw: string) => {
    const t = String(typeRaw || "").toLowerCase();
    if (t.includes("goal") && (t.includes("own") || t.includes("eigen"))) {
      return { icon: "football-outline" as const, color: "#FF6B35", label: "Eigen doelpunt", dot: "#FF6B35" };
    }
    if (t.includes("goal") || t.includes("penalty") && t.includes("scored")) {
      return { icon: "football-outline" as const, color: "#00E676", label: "Doelpunt", dot: "#00E676" };
    }
    if (t.includes("red")) {
      return { icon: "card-outline" as const, color: "#FF3040", label: "Rode kaart", dot: "#FF3040" };
    }
    if (t.includes("yellow")) {
      return { icon: "card-outline" as const, color: "#FFD700", label: "Gele kaart", dot: "#FFD700" };
    }
    if (t.includes("sub") || t.includes("wissel") || t.includes("substitution")) {
      return { icon: "swap-horizontal-outline" as const, color: "#5D9EFF", label: "Wissel", dot: "#5D9EFF" };
    }
    if (t.includes("pen")) {
      return { icon: "radio-button-on-outline" as const, color: "#FF9800", label: "Penalty", dot: "#FF9800" };
    }
    if (t.includes("var")) {
      return { icon: "videocam-outline" as const, color: COLORS.textMuted, label: "VAR", dot: COLORS.textMuted };
    }
    return { icon: "ellipse-outline" as const, color: COLORS.textMuted, label: "Event", dot: COLORS.textMuted };
  };

  const isHomeEvent = (ev: any): boolean => {
    const evTeam = String(ev?.team || ev?.teamName || "").toLowerCase();
    const home = homeTeam.toLowerCase();
    if (!evTeam) return true; // default to home if unknown
    return evTeam.includes(home.split(" ")[0]) || home.includes(evTeam.split(" ")[0]);
  };

  return (
    <View style={styles.timelineWrapper}>
      {events.map((ev: any, i: number) => {
        const cfg = getEventConfig(String(ev?.type || ""));
        const onHome = isHomeEvent(ev);
        const minute = ev?.time ? `${String(ev.time)}'` : "";
        const description = String(ev?.player || ev?.name || ev?.text || ev?.detail || "");

        return (
          <View key={i} style={styles.timelineRow}>
            {/* Home side */}
            <View style={styles.timelineSide}>
              {onHome ? (
                <View style={styles.timelineEventHome}>
                  <Text style={styles.timelinePlayer} numberOfLines={1}>{description}</Text>
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
                  <Text style={[styles.timelinePlayer, { textAlign: "left" }]} numberOfLines={1}>{description}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}


  const STAT_LABELS: Record<string, string> = {
    // Core
    ball_possession: "Balbezit %",
    possession: "Balbezit %",
    // Shots
    total_shots: "Schoten totaal",
    shots: "Schoten totaal",
    shots_on_goal: "Schoten op doel",
    shots_on_target: "Schoten op doel",
    shots_off_goal: "Schoten naast doel",
    shots_off_target: "Schoten naast doel",
    blocked_shots: "Geblokkeerde schoten",
    shots_blocked: "Geblokkeerde schoten",
    shots_insidebox: "Schoten (binnen 16)",
    shots_outsidebox: "Schoten (buiten 16)",
    big_chances: "Grote kansen",
    // xG
    expected_goals: "Verwachte goals (xG)",
    xg: "Verwachte goals (xG)",
    goals_prevented: "Voorkomen goals",
    // Attacking
    corner_kicks: "Hoekschoppen",
    corners: "Hoekschoppen",
    crosses: "Voorzetten",
    successful_dribbles: "Succesvolle dribbels",
    dribbles_completed: "Succesvolle dribbels",
    offsides: "Buitenspel",
    // Passing
    total_passes: "Passes totaal",
    accurate_passes: "Nauwkeurige passes",
    pass_accuracy: "Pasnauwkeurigheid %",
    key_passes: "Sleutelpasses",
    passes_final_third: "Passes in de laatste zone",
    long_balls: "Lange ballen",
    // Defensive
    total_tackles: "Tackles",
    tackles: "Tackles",
    interceptions: "Onderscheppingen",
    clearances: "Afhoudingen",
    aerial_won: "Gewonnen kopduels",
    total_duels: "Duels totaal",
    duels_won: "Duels gewonnen",
    // Goalkeeping
    goalkeeper_saves: "Reddingen",
    saves: "Reddingen",
    // Discipline
    fouls: "Overtredingen",
    yellow_cards: "Gele kaarten",
    red_cards: "Rode kaarten",
  };

  // Stat sections for organized display
  const STAT_SECTIONS: { label: string; keys: string[] }[] = [
    {
      label: "AANVAL",
      keys: ["ball_possession", "possession", "total_shots", "shots", "shots_on_goal", "shots_on_target",
             "shots_off_goal", "shots_off_target", "big_chances", "expected_goals", "xg",
             "shots_insidebox", "shots_outsidebox"],
    },
    {
      label: "AANVALLEN",
      keys: ["corner_kicks", "corners", "crosses", "successful_dribbles", "dribbles_completed", "offsides"],
    },
    {
      label: "PASS",
      keys: ["total_passes", "accurate_passes", "pass_accuracy", "key_passes", "passes_final_third", "long_balls"],
    },
    {
      label: "VERDEDIGING",
      keys: ["total_tackles", "tackles", "interceptions", "clearances", "blocked_shots", "shots_blocked",
             "aerial_won", "total_duels", "duels_won"],
    },
    {
      label: "DOELMAN",
      keys: ["goalkeeper_saves", "saves", "goals_prevented"],
    },
    {
      label: "DISCIPLINE",
      keys: ["fouls", "yellow_cards", "red_cards"],
    },
  ];

  // Dedup: als twee keys dezelfde label hebben, toon er maar één
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
        <Text style={styles.noStatsText}>Live statistieken worden geladen tijdens de wedstrijd</Text>
      </View>
    );
  }

  const renderStatRow = (key: string) => {
    const rawH = String(homeStats?.[key] ?? "0");
    const rawA = String(awayStats?.[key] ?? "0");
    const hVal = parseFloat(rawH.replace("%", "")) || 0;
    const aVal = parseFloat(rawA.replace("%", "")) || 0;
    const total = hVal + aVal || 1;
    const hPct = (hVal / total) * 100;
    return (
      <View key={key} style={styles.statRow}>
        <Text style={styles.statVal}>{homeStats?.[key] ?? "0"}</Text>
        <View style={styles.statBarContainer}>
          <Text style={styles.statName}>{STAT_LABELS[key]}</Text>
          <View style={styles.statBar}>
            <View style={[styles.statBarHome, { flex: hPct }]} />
            <View style={[styles.statBarAway, { flex: 100 - hPct }]} />
          </View>
        </View>
        <Text style={styles.statVal}>{awayStats?.[key] ?? "0"}</Text>
      </View>
    );
  };

  // Check if sections mode is possible
  const sectionedKeys = new Set(STAT_SECTIONS.flatMap(s => s.keys));
  const unsectionedStats = dedupedStats.filter(k => !sectionedKeys.has(k));

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.infoCard}>
        <View style={styles.statsTeamHeader}>
          <Text style={styles.statsTeamName} numberOfLines={1}>{homeTeam}</Text>
          <View style={{ width: 80 }} />
          <Text style={[styles.statsTeamName, { textAlign: "right" }]} numberOfLines={1}>{awayTeam}</Text>
        </View>
      </View>
      {STAT_SECTIONS.map(section => {
        const sectionStats = section.keys.filter(k => dedupedStats.includes(k));
        if (sectionStats.length === 0) return null;
        return (
          <View key={section.label} style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>{section.label}</Text>
            {sectionStats.map(renderStatRow)}
          </View>
        );
      })}
      {unsectionedStats.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>OVERIG</Text>
          {unsectionedStats.map(renderStatRow)}
        </View>
      )}
    </View>
  );
}

function PlayerRow({ player, sport, compact = false, teamName = "" }: { player: any; sport: string; compact?: boolean; teamName?: string }) {
  const photoCandidates = [
    player?.photo,
    player?.id ? `https://media.api-sports.io/football/players/${encodeURIComponent(String(player.id))}.png` : null,
    player?.id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(String(player.id))}.png` : null,
  ].filter(Boolean) as string[];
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoUri = photoCandidates[photoIndex];

  const compactStyle = compact ? styles.playerRowCompact : null;
  const handleOpenProfile = () => {
    router.push({
      pathname: "/player-profile",
      params: {
        playerId: String(player?.id || ""),
        name: String(player?.name || ""),
        team: String(teamName || ""),
        league: String(sport || "eng.1"),
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
            setPhotoIndex((idx) => (idx + 1 < photoCandidates.length ? idx + 1 : idx));
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
            <Text style={styles.starterText}>Basis</Text>
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

function PitchDot({ player, color }: { player: any; color: string }) {
  return (
    <View style={styles.pitchDotWrap}>
      <View style={[styles.pitchDotCircle, { borderColor: color }]}>
        <Text style={[styles.pitchDotNum, { color }]}>{player.jersey || "—"}</Text>
      </View>
      <Text style={styles.pitchDotName} numberOfLines={1}>{shortPlayerName(player.name)}</Text>
    </View>
  );
}

function CombinedPitchView({ homeTeamData, awayTeamData }: { homeTeamData: any; awayTeamData: any }) {
  const homeRows = buildFormationRows(homeTeamData?.players || [], homeTeamData?.formation);
  const awayRows = [...buildFormationRows(awayTeamData?.players || [], awayTeamData?.formation)].reverse();

  return (
    <LinearGradient colors={["#0d2e18", "#183c20", "#0d2e18"]} style={styles.combinedPitch}>
      {/* Field markings */}
      <View style={styles.pitchTopArc} />
      <View style={styles.pitchCenterLine} />
      <View style={styles.pitchCenterCircleNew} />
      <View style={styles.pitchBottomArc} />

      {/* Away team label */}
      <View style={styles.pitchTeamLabelRow}>
        <Text style={[styles.pitchTeamLabel, { color: "#5D9EFF" }]}>{awayTeamData?.team?.toUpperCase()}</Text>
        {awayTeamData?.formation ? <Text style={styles.pitchFormLabel}>{awayTeamData.formation}</Text> : null}
      </View>

      {/* Away rows (GK top → FWDs center) */}
      {awayRows.map((row, ri) => (
        <View key={`away_${ri}`} style={styles.combinedPitchRow}>
          {row.map((p: any, pi: number) => (
            <PitchDot key={`a_${p?.id || p?.name || pi}`} player={p} color="#5D9EFF" />
          ))}
        </View>
      ))}

      {/* Center divider */}
      <View style={styles.pitchDivider} />

      {/* Home rows (FWDs center → GK bottom) */}
      {homeRows.map((row, ri) => (
        <View key={`home_${ri}`} style={styles.combinedPitchRow}>
          {row.map((p: any, pi: number) => (
            <PitchDot key={`h_${p?.id || p?.name || pi}`} player={p} color={COLORS.accent} />
          ))}
        </View>
      ))}

      {/* Home team label */}
      <View style={styles.pitchTeamLabelRow}>
        <Text style={[styles.pitchTeamLabel, { color: COLORS.accent }]}>{homeTeamData?.team?.toUpperCase()}</Text>
        {homeTeamData?.formation ? <Text style={styles.pitchFormLabel}>{homeTeamData.formation}</Text> : null}
      </View>
    </LinearGradient>
  );
}

function AIPredictionView({ prediction, homeTeam, awayTeam }: any) {
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

  const homeShortName = homeTeam.split(" ")[0];
  const awayShortName = awayTeam.split(" ")[0];

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

        {prediction?.providerError && prediction?.insufficientData ? (
          <View style={styles.aiWarnCard}>
            <MaterialCommunityIcons name="alert-outline" size={14} color={COLORS.gold} />
            <Text style={styles.aiWarnText}>Onvoldoende data voor volledige AI analyse.</Text>
          </View>
        ) : null}

        <Text style={[styles.aiPrediction, { color: winnerColor }]}>
          {prediction.prediction === "Home Win" ? `${homeTeam} Wint` :
           prediction.prediction === "Away Win" ? `${awayTeam} Wint` : "Gelijkspel"}
        </Text>

        {prediction.predictedScore && (
          <Text style={styles.aiScore}>Verwachte score: {prediction.predictedScore}</Text>
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
            <Text style={styles.aiWarnText}>xG: Onvoldoende data</Text>
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
                <Text style={styles.marketSub}>Beide teams scoren</Text>
              </View>
            ) : null}
            {Number.isFinite(over25Pct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>Over 2.5</Text>
                <Text style={styles.marketValue}>{Math.round(over25Pct)}%</Text>
                <Text style={styles.marketSub}>Totaal goals</Text>
              </View>
            ) : null}
            {Number.isFinite(homeDcPct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>1X</Text>
                <Text style={styles.marketValue}>{Math.round(homeDcPct)}%</Text>
                <Text style={styles.marketSub}>{homeShortName} of gelijk</Text>
              </View>
            ) : null}
            {Number.isFinite(awayDcPct) ? (
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>X2</Text>
                <Text style={styles.marketValue}>{Math.round(awayDcPct)}%</Text>
                <Text style={styles.marketSub}>{awayShortName} of gelijk</Text>
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
        <Text style={styles.infoCardTitle}>AI SIGNALEN</Text>
        <View style={styles.marketGrid}>
          <View style={styles.marketCard}>
            <Text style={styles.marketLabel}>Win Tilt</Text>
            <Text style={styles.marketValue}>{winGapPct}%</Text>
            <Text style={styles.marketSub}>Voorsprong tussen thuis/uit</Text>
          </View>
          <View style={styles.marketCard}>
            <Text style={styles.marketLabel}>Volatiliteit</Text>
            <Text style={styles.marketValue}>{volatilityScore}%</Text>
            <Text style={styles.marketSub}>Hoe onvoorspelbaar de match is</Text>
          </View>
          {totalXg !== null ? (
            <View style={styles.marketCard}>
              <Text style={styles.marketLabel}>Goal Expectancy</Text>
              <Text style={styles.marketValue}>{totalXg.toFixed(2)}</Text>
              <Text style={styles.marketSub}>Verwachte totale xG</Text>
            </View>
          ) : null}
          <View style={styles.marketCard}>
            <Text style={styles.marketLabel}>AI Band</Text>
            <Text style={[styles.marketValue, { color: recommendationColor }]}>{recommendationLabel}</Text>
            <Text style={styles.marketSub}>Waarde-inschatting model</Text>
          </View>
        </View>
      </View>

      {/* Next goal probability */}
      {prediction.nextGoalProbability != null && (
        <View style={styles.nextGoalCard}>
          <View style={styles.nextGoalHeader}>
            <MaterialCommunityIcons name="soccer" size={14} color={COLORS.accent} />
            <Text style={styles.nextGoalTitle}>Kans op doelpunt (15 min)</Text>
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
            <Text style={styles.metaBadgeLabel}>Momentum</Text>
            <Text style={styles.metaBadgeValue}>{prediction.momentum}</Text>
          </View>
        )}
        {prediction.danger && (
          <View style={[styles.metaBadge, { flex: 1 }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.live} />
            <Text style={styles.metaBadgeLabel}>Gevaar</Text>
            <Text style={styles.metaBadgeValue}>{prediction.danger.replace(" Attack", "")}</Text>
          </View>
        )}
        {prediction.riskLevel && (
          <View style={[styles.metaBadge, { flex: 1 }]}>
            <MaterialCommunityIcons name="shield-outline" size={14} color={riskColor} />
            <Text style={styles.metaBadgeLabel}>Risico</Text>
            <Text style={[styles.metaBadgeValue, { color: riskColor }]}>{prediction.riskLevel}</Text>
          </View>
        )}
      </View>

      {/* Summary */}
      {prediction.summary && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>TACTISCHE ANALYSE</Text>
          <Text style={styles.aiSummary}>{prediction.summary}</Text>
        </View>
      )}

      {/* Key factors */}
      {prediction.keyFactors?.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>SLEUTELFACTOREN</Text>
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
          <Text style={styles.infoCardTitle}>TACTISCHE NOTITIES</Text>
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

      {/* Tip */}
      {prediction.tip && (
        <View style={[styles.tipCard, { borderColor: "rgba(255,215,0,0.3)", backgroundColor: "rgba(255,215,0,0.06)" }]}>
          <MaterialCommunityIcons name="lightbulb-outline" size={16} color="#FFD700" />
          <Text style={[styles.tipText, { color: "#FFD700" }]}>{prediction.tip}</Text>
        </View>
      )}

      <Text style={styles.aiDisclaimer}>
        * AI-analyse is indicatief en gebaseerd op historische gegevens. Geen gokadvies.
      </Text>
    </View>
  );
}

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

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={styles.loadingText}>Wedstrijd data laden...</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={40} color={COLORS.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
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
  matchHeader: { alignItems: "center", gap: 10 },
  leagueName: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 2,
    textTransform: "uppercase",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  scoreRow: { flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 4 },
  teamSide: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  teamSideLeft: { justifyContent: "flex-start" },
  teamSideRight: { justifyContent: "flex-end" },
  teamNameWrap: { flex: 1 },
  teamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 17,
  },
  tapHint: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.accentDim },
  scoreCenter: { width: 100, alignItems: "center", gap: 5 },
  score: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 48,
    color: COLORS.text,
    // @ts-ignore
    textShadowColor: "rgba(255,48,64,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  vsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 3,
  },
  upcomingTime: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.accent,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
  },
  finishedLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  venueText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  tabBarScroll: {
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
    borderRadius: 20,
  },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted, letterSpacing: 0.4 },
  tabTextActive: { color: "#fff", fontFamily: "Inter_700Bold" },
  streamContainer: { flex: 1 },
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  serverSection: {
    padding: 18,
    gap: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  serverLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  serverSubLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
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
  watchSection: { marginTop: 8, gap: 10 },
  watchSectionUpcoming: { marginTop: 10, width: "100%", gap: 10 },
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
  tabContentInner: { padding: 16, gap: 0 },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
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
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  infoValueHighlight: { color: COLORS.live },
  statsTeamHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  statsTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.accent,
    flex: 1,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  statVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.text,
    width: 36,
    textAlign: "center",
  },
  statBarContainer: { flex: 1, alignItems: "center", gap: 5 },
  statName: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  statBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    width: "100%",
    backgroundColor: COLORS.cardElevated,
  },
  statBarHome: { backgroundColor: COLORS.accent, borderRadius: 4 },
  statBarAway: { backgroundColor: "#5D60E8", borderRadius: 4 },
  noStatsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  eventBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(229,9,20,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
  },
  eventText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 19 },
  // Timeline
  timelineWrapper: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  timelineSide: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  timelineSideAway: {
    alignItems: "flex-start",
  },
  timelineCenter: {
    width: 56,
    alignItems: "center",
    gap: 3,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  timelineMinute: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: "center",
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
  timelinePlayer: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.text,
    flex: 1,
    textAlign: "right",
  },
  lineupTeamHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
    marginBottom: 14,
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
  lineupViewToggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  lineupViewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
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
  lineupTypeBadge: {
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lineupTypeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 0.5 },
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
  playerPhoto: { width: 36, height: 36, borderRadius: 18 },
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
  predBars: { gap: 8, marginTop: 8 },
  predBarItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  predBarLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, width: 70 },
  predBarTrack: { flex: 1, height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: "hidden" },
  predBarFill: { height: "100%", borderRadius: 4 },
  predBarPct: { fontFamily: "Inter_700Bold", fontSize: 12, width: 38, textAlign: "right" },
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
  formRow: { flexDirection: "row", gap: 10 },
  formCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  formTeamName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  formBubbles: { flexDirection: "row", gap: 6 },
  formBubble: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  formW: { backgroundColor: "rgba(0,230,118,0.2)", borderWidth: 1, borderColor: COLORS.green },
  formD: { backgroundColor: "rgba(138,157,181,0.2)", borderWidth: 1, borderColor: COLORS.textMuted },
  formL: { backgroundColor: "rgba(255,59,48,0.2)", borderWidth: 1, borderColor: COLORS.live },
  formBubbleText: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.text },
  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(255,215,0,0.08)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,215,0,0.25)" },
  tipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  aiDisclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 4, paddingBottom: 20 },
  aiSourceText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.accentDim, textAlign: "center", marginTop: -10, paddingBottom: 20 },
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
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 6,
    overflow: "hidden",
    position: "relative",
  },
  combinedPitchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    gap: 6,
    paddingHorizontal: 8,
  },
  pitchDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginHorizontal: 16,
    marginVertical: 4,
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
    width: 80,
    height: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderTopWidth: 0,
    top: 0,
    left: "50%",
    marginLeft: -40,
    zIndex: 1,
  },
  pitchBottomArc: {
    position: "absolute",
    width: 80,
    height: 40,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderBottomWidth: 0,
    bottom: 0,
    left: "50%",
    marginLeft: -40,
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
  pitchDotWrap: {
    alignItems: "center",
    gap: 2,
    width: 52,
  },
  pitchDotCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  pitchDotNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 11,
  },
  pitchDotName: {
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    color: "rgba(255,255,255,0.75)",
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
  // Timeline tab
  timelineCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    paddingBottom: 2,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 20,
    position: "relative",
  },
  timelineConnector: {
    position: "absolute",
    left: 13,
    top: 28,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.border,
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
    paddingTop: 3,
  },
  timelineMinuteLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  timelineEventText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
});
