import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Image, ActivityIndicator,
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
import { TeamLogo } from "@/components/MatchCard";

const TABS = [
  { id: "stream", label: "Stream", icon: "play-circle-outline" },
  { id: "stats", label: "Stats", icon: "bar-chart-outline" },
  { id: "lineups", label: "Opstelling", icon: "people-outline" },
  { id: "ai", label: "AI Analyse", icon: "sparkles" },
] as const;

type TabId = "stream" | "stats" | "lineups" | "ai";

export default function MatchDetailScreen() {
  const params = useLocalSearchParams<{
    matchId: string; homeTeam: string; awayTeam: string;
    homeTeamLogo?: string; awayTeamLogo?: string;
    homeScore?: string; awayScore?: string;
    league: string; minute?: string; status: string; sport: string;
  }>();

  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>("stream");
  const [streamKey, setStreamKey] = useState(0);
  const isLive = params.status === "live";
  const {
    data: streamData,
    isLoading: streamLoading,
    refetch: refetchStream,
  } = useQuery({
    queryKey: ["match-stream", params.matchId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/stream/${params.matchId}`);
      return res.json();
    },
    enabled: !!params.matchId && isLive,
    staleTime: 60_000,
  });
  const streamUrl = streamData?.url || `https://embedme.top/embed/alpha/${params.matchId}/1`;

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

  // AI Prediction
  const { data: prediction, isPending: predLoading, mutate: fetchPrediction } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sports/predict", {
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        league: params.league,
        sport: params.sport,
        homeScore: String(liveHomeScore ?? 0),
        awayScore: String(liveAwayScore ?? 0),
        isLive,
        minute: liveMinute !== undefined ? String(liveMinute) : undefined,
        stats: {
          home: matchDetail?.homeStats || {},
          away: matchDetail?.awayStats || {},
        },
        events: Array.isArray(matchDetail?.keyEvents) ? matchDetail.keyEvents.slice(0, 20) : [],
        venue: matchDetail?.venue || undefined,
      });
      const json = await res.json();
      if (json && typeof json === "object" && "prediction" in json && json.prediction && typeof json.prediction === "object") {
        return json.prediction;
      }
      return json;
    },
  });

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === "ai" && !prediction && !predLoading) {
      fetchPrediction();
    }
    SafeHaptics.impactLight();
  };

  const handleRetryAutoStream = async () => {
    SafeHaptics.impactLight();
    await refetchStream();
    setStreamKey(k => k + 1);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={[COLORS.card, COLORS.background]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.matchHeader}>
          <Text style={styles.leagueName}>{params.league}</Text>
          <View style={styles.scoreRow}>
            <TeamSide name={params.homeTeam} logo={matchDetail?.homeTeamLogo || params.homeTeamLogo} onPress={() => {
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
              ) : (
                <>
                  <Text style={styles.vsText}>VS</Text>
                  <Text style={styles.upcomingTime}>Gepland</Text>
                </>
              )}
            </View>
            <TeamSide name={params.awayTeam} logo={matchDetail?.awayTeamLogo || params.awayTeamLogo} onPress={() => {
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
            <Ionicons name={tab.icon as any} size={15} color={activeTab === tab.id ? COLORS.accent : COLORS.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stream Tab */}
      {activeTab === "stream" && (
        <View style={styles.streamContainer}>
          {isLive ? (
            <>
              <View style={styles.videoBox}>
                <WebView key={streamKey} source={{ uri: streamUrl }}
                  style={{ flex: 1, backgroundColor: "#000" }}
                  allowsFullscreenVideo mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled domStorageEnabled />
              </View>
              <View style={styles.serverSection}>
                <Text style={styles.serverLabel}>AUTOMATISCH BESTE STREAM</Text>
                <Text style={styles.serverSubLabel}>
                  {streamLoading ? "Beste bron zoeken..." : "Link automatisch gekozen en gestart"}
                </Text>
                <TouchableOpacity style={styles.serverBtn} onPress={handleRetryAutoStream}>
                  <Ionicons name="refresh-outline" size={12} color={COLORS.accent} />
                  <Text style={styles.serverBtnText}>Nieuwe beste link zoeken</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.notLiveContainer}>
              <Ionicons name="time-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.notLiveTitle}>Wedstrijd nog niet begonnen</Text>
              <Text style={styles.notLiveText}>De livestream is beschikbaar zodra de wedstrijd start.</Text>
            </View>
          )}
        </View>
      )}

      {/* Stats Tab */}
      {activeTab === "stats" && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
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
                  <Text style={[styles.sectionLabel, { marginTop: 20 }]}>DOELPUNTEN & EVENTS</Text>
                  {matchDetail.keyEvents.map((ev: any, i: number) => (
                    <View key={i} style={styles.eventRow}>
                      <View style={styles.eventBadge}>
                        <MaterialCommunityIcons name="soccer" size={14} color={COLORS.live} />
                      </View>
                      <Text style={styles.eventText}>{ev.time}&apos; — {ev.text}</Text>
                    </View>
                  ))}
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
      )}

      {/* Lineups Tab */}
      {activeTab === "lineups" && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {detailLoading ? (
            <LoadingState />
          ) : matchDetail?.starters?.length > 0 ? (
            matchDetail.starters.map((team: any, ti: number) => (
              <View key={ti} style={styles.lineupTeamSection}>
                <Text style={styles.sectionLabel}>{team.team?.toUpperCase()} — OPSTELLING</Text>
                {team.players?.map((p: any, pi: number) => (
                  <PlayerRow key={pi} player={p} sport={params.sport} />
                ))}
              </View>
            ))
          ) : (
            <EmptyState icon="people-outline" text="Opstelling nog niet beschikbaar" />
          )}
        </ScrollView>
      )}

      {/* AI Analysis Tab */}
      {activeTab === "ai" && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {predLoading ? (
            <View style={styles.aiLoading}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.aiLoadingText}>AI analyseert de wedstrijd...</Text>
              <Text style={[styles.aiLoadingText, { fontSize: 12, marginTop: 4 }]}>Tactiek · xG · Vorm · Voorspelling</Text>
            </View>
          ) : prediction && !prediction.error ? (
            <AIPredictionView prediction={prediction} homeTeam={params.homeTeam} awayTeam={params.awayTeam} />
          ) : (
            <View style={{ gap: 10 }}>
              {prediction?.error ? (
                <View style={styles.tipCard}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.live} />
                  <Text style={styles.tipText}>{String(prediction.error)}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={styles.aiTrigger} onPress={() => fetchPrediction()}>
                <LinearGradient colors={["rgba(0,212,255,0.15)", "rgba(0,212,255,0.05)"]} style={styles.aiTriggerGrad}>
                  <MaterialCommunityIcons name="robot-outline" size={40} color={COLORS.accent} />
                  <Text style={styles.aiTriggerTitle}>AI Wedstrijd Analyse</Text>
                  <Text style={styles.aiTriggerSub}>Voorspelling · xG · Tactiek · Vormlijn · Wedtip</Text>
                  <View style={styles.aiTriggerBtn}>
                    <Ionicons name="sparkles" size={14} color="#000" />
                    <Text style={styles.aiTriggerBtnText}>Analyseer nu</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TeamSide({ name, logo, onPress }: { name: string; logo?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.teamSide} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <TeamLogo uri={logo} teamName={name} size={60} />
      <Text style={styles.teamName} numberOfLines={2}>{name}</Text>
      {onPress && <Text style={styles.tapHint}>Tik voor info</Text>}
    </TouchableOpacity>
  );
}

function StatsBars({ homeTeam, awayTeam, homeStats, awayStats }: any) {
  const STAT_LABELS: Record<string, string> = {
    possessionPct: "Balbezit %",
    totalShots: "Totaal schoten",
    shotsOnTarget: "Schoten op doel",
    totalPasses: "Totaal passes",
    fouls: "Overtredingen",
    yellowCards: "Gele kaarten",
    redCards: "Rode kaarten",
    corners: "Hoekschoppen",
    offsides: "Buitenspel",
  };

  const statsToShow = Object.keys(STAT_LABELS).filter(k => homeStats[k] || awayStats[k]);

  if (statsToShow.length === 0) {
    return (
      <View style={styles.infoCard}>
        <Text style={styles.noStatsText}>Live statistieken worden geladen tijdens de wedstrijd</Text>
      </View>
    );
  }

  return (
    <View style={styles.infoCard}>
      <View style={styles.statsTeamHeader}>
        <Text style={styles.statsTeamName} numberOfLines={1}>{homeTeam}</Text>
        <Text style={styles.statsTeamName} numberOfLines={1}>{awayTeam}</Text>
      </View>
      {statsToShow.map(key => {
        const hVal = parseFloat(homeStats[key] || "0");
        const aVal = parseFloat(awayStats[key] || "0");
        const total = hVal + aVal || 1;
        const hPct = (hVal / total) * 100;
        return (
          <View key={key} style={styles.statRow}>
            <Text style={styles.statVal}>{homeStats[key] || "0"}</Text>
            <View style={styles.statBarContainer}>
              <Text style={styles.statName}>{STAT_LABELS[key]}</Text>
              <View style={styles.statBar}>
                <View style={[styles.statBarHome, { flex: hPct }]} />
                <View style={[styles.statBarAway, { flex: 100 - hPct }]} />
              </View>
            </View>
            <Text style={styles.statVal}>{awayStats[key] || "0"}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PlayerRow({ player, sport }: { player: any; sport: string }) {
  const [photoError, setPhotoError] = useState(false);
  return (
    <View style={styles.playerRow}>
      <View style={styles.playerJersey}>
        <Text style={styles.playerJerseyNum}>{player.jersey || "—"}</Text>
      </View>
      {player.photo && !photoError ? (
        <Image
          source={{ uri: player.photo }}
          style={styles.playerPhoto}
          onError={() => setPhotoError(true)}
        />
      ) : (
        <View style={[styles.playerPhoto, styles.playerPhotoPlaceholder]}>
          <Ionicons name="person" size={16} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{player.name}</Text>
        <Text style={styles.playerPos}>{player.positionName || player.position}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
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
      </View>
    </View>
  );
}

function AIPredictionView({ prediction, homeTeam, awayTeam }: any) {
  const winnerColor = prediction.prediction === "Home Win" ? COLORS.accent :
    prediction.prediction === "Away Win" ? COLORS.live : "#FFD700";
  const riskColor = prediction.riskLevel === "Low" ? "#4CAF50" : prediction.riskLevel === "High" ? COLORS.live : "#FF9800";

  return (
    <View style={{ gap: 14 }}>
      {/* Main prediction card */}
      <LinearGradient colors={["rgba(0,212,255,0.12)", "rgba(0,212,255,0.04)"]} style={styles.aiMainCard}>
        <View style={styles.aiHeader}>
          <MaterialCommunityIcons name="robot" size={20} color={COLORS.accent} />
          <Text style={styles.aiTitle}>AI Voorspelling</Text>
          <View style={styles.aiConfidenceBadge}>
            <Text style={styles.aiConfidenceText}>{prediction.confidence}% zekerheid</Text>
          </View>
        </View>

        <Text style={[styles.aiPrediction, { color: winnerColor }]}>
          {prediction.prediction === "Home Win" ? `${homeTeam} Wint` :
           prediction.prediction === "Away Win" ? `${awayTeam} Wint` : "Gelijkspel"}
        </Text>

        {prediction.predictedScore && (
          <Text style={styles.aiScore}>Verwachte score: {prediction.predictedScore}</Text>
        )}

        {/* xG row */}
        {(prediction.xgHome !== undefined || prediction.xgAway !== undefined) && (
          <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 18, color: COLORS.accent }}>{prediction.xgHome ?? "—"}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted }}>xG {homeTeam.split(" ")[0]}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted }}>Expected Goals</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 18, color: COLORS.live }}>{prediction.xgAway ?? "—"}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted }}>xG {awayTeam.split(" ")[0]}</Text>
            </View>
          </View>
        )}

        {/* Win/Draw/Loss bars */}
        <View style={[styles.predBars, { marginTop: 10 }]}>
          <PredBar label={homeTeam.split(" ")[0]} pct={prediction.homePct || 0} color={COLORS.accent} />
          <PredBar label="Gelijk" pct={prediction.drawPct || 0} color={COLORS.textMuted} />
          <PredBar label={awayTeam.split(" ")[0]} pct={prediction.awayPct || 0} color={COLORS.live} />
        </View>
      </LinearGradient>

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

      {/* H2H */}
      {prediction.h2hSummary && (
        <View style={styles.tipCard}>
          <MaterialCommunityIcons name="history" size={15} color={COLORS.accent} />
          <Text style={styles.tipText}>{prediction.h2hSummary}</Text>
        </View>
      )}

      {/* Form bubbles */}
      <View style={styles.formRow}>
        {prediction.formHome && (
          <View style={[styles.formCard, { flex: 1 }]}>
            <Text style={styles.formTeamName}>{homeTeam.split(" ")[0]}</Text>
            <FormBubbles form={prediction.formHome} />
          </View>
        )}
        {prediction.formAway && (
          <View style={[styles.formCard, { flex: 1 }]}>
            <Text style={styles.formTeamName}>{awayTeam.split(" ")[0]}</Text>
            <FormBubbles form={prediction.formAway} />
          </View>
        )}
      </View>

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

function PredBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={styles.predBarItem}>
      <Text style={styles.predBarLabel}>{label}</Text>
      <View style={styles.predBarTrack}>
        <View style={[styles.predBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.predBarPct, { color }]}>{pct}%</Text>
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
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { marginBottom: 10, width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  matchHeader: { alignItems: "center", gap: 6 },
  leagueName: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase" },
  scoreRow: { flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 8 },
  teamSide: { flex: 1, alignItems: "center", gap: 6 },
  teamLogo: { width: 52, height: 52, borderRadius: 26 },
  teamLogoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  teamName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, textAlign: "center" },
  tapHint: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.accentDim },
  scoreCenter: { width: 90, alignItems: "center", gap: 4 },
  score: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.text },
  vsText: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.textMuted },
  upcomingTime: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  venueText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  tabBarScroll: { borderBottomWidth: 1, borderBottomColor: COLORS.border, flexGrow: 0, backgroundColor: COLORS.overlayLight },
  tabBar: { flexDirection: "row", paddingHorizontal: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 11 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  streamContainer: { flex: 1 },
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  serverSection: { padding: 16, gap: 10, backgroundColor: COLORS.overlayLight, borderTopWidth: 1, borderTopColor: COLORS.border },
  serverLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textMuted, letterSpacing: 1.5 },
  serverSubLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary },
  serverBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: COLORS.card,
  },
  serverBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent },
  notLiveContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  notLiveTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  notLiveText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
  tabContent: { flex: 1 },
  tabContentInner: { padding: 16, gap: 0 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textMuted, letterSpacing: 1.5, marginBottom: 10 },
  infoCard: {
    backgroundColor: COLORS.overlayLight, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 4,
  },
  infoCardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textMuted, letterSpacing: 1.5, marginBottom: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  infoValueHighlight: { color: COLORS.live },
  statsTeamHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  statsTeamName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.accent, flex: 1, textAlign: "center" },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text, width: 32, textAlign: "center" },
  statBarContainer: { flex: 1, alignItems: "center", gap: 4 },
  statName: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center" },
  statBar: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", width: "100%" },
  statBarHome: { backgroundColor: COLORS.accent, borderRadius: 3 },
  statBarAway: { backgroundColor: COLORS.live, borderRadius: 3 },
  noStatsText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  eventBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,59,48,0.15)", alignItems: "center", justifyContent: "center" },
  eventText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, flex: 1 },
  lineupTeamSection: { marginBottom: 20 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  playerJersey: { width: 28, height: 28, borderRadius: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  playerJerseyNum: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.accent },
  playerPhoto: { width: 36, height: 36, borderRadius: 18 },
  playerPhotoPlaceholder: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  playerInfo: { flex: 1 },
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  playerPos: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  starterBadge: { backgroundColor: COLORS.accentGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.accent },
  starterText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.accent },
  marketValueBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,200,150,0.12)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(0,200,150,0.3)" },
  marketValueText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#00C896" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  aiLoading: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 16 },
  aiLoadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  aiTrigger: { marginTop: 20, borderRadius: 20, overflow: "hidden" },
  aiTriggerGrad: { padding: 32, alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderLight },
  aiTriggerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  aiTriggerSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  aiTriggerBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.accent, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  aiTriggerBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#000" },
  aiMainCard: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "rgba(0,212,255,0.2)", gap: 10, marginBottom: 2 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text, flex: 1 },
  aiConfidenceBadge: { backgroundColor: "rgba(0,212,255,0.12)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(0,212,255,0.3)" },
  aiConfidenceText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
  aiPrediction: { fontFamily: "Inter_800ExtraBold", fontSize: 22, textAlign: "center", marginVertical: 4 },
  aiScore: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  predBars: { gap: 8, marginTop: 8 },
  predBarItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  predBarLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, width: 70 },
  predBarTrack: { flex: 1, height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: "hidden" },
  predBarFill: { height: "100%", borderRadius: 4 },
  predBarPct: { fontFamily: "Inter_700Bold", fontSize: 12, width: 38, textAlign: "right" },
  aiSummary: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
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
  metaBadge: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 10, borderWidth: 1,
    borderColor: COLORS.border, alignItems: "center", gap: 4,
  },
  metaBadgeLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  metaBadgeValue: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.text },
});
