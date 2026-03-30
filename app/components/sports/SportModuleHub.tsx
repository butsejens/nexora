/**
 * SportModuleHub.tsx
 * ════════════════════════════════════════════════════════════════════════════════
 * Premium Sport UI - Netflix-level design system.
 * 
 * Panes: explore | live | matchday | insights
 * No overlaps, no glitching, clean architecture.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Image,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useTranslation } from "@/lib/useTranslation";
import { buildSportLiveQuery, buildSportScheduleQuery } from "@/services/realtime-engine";
import { useFollowState } from "@/context/UserStateContext";
import {
  LiveMatchCard,
  UpcomingMatchCard,
} from "@/components/sports/SportCards";
import { resolveMatchCompetitionLabel, resolveMatchEspnLeagueCode } from "@/lib/sports-competition";
import { loadMatchInteractions, rankMatchesForUser, recordMatchInteraction } from "@/lib/ai";
import { getCompetitionTeams, getCompetitionStandings } from "@/lib/services/sports-service";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

type SportPane = "explore" | "live" | "matchday" | "insights" | "teams" | "standings";

type SportsPayload = {
  date?: string;
  live?: any[];
  upcoming?: any[];
  finished?: any[];
  error?: string;
};

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const DS = {
  bg: "#09090D",
  card: "#12121A",
  elevated: "#1C1C28",
  accent: "#4CAF82",
  live: "#FF3040",
  text: "#FFFFFF",
  muted: "#9D9DAA",
  border: "rgba(255,255,255,0.08)",
  glass: "rgba(28,28,40,0.92)",
};

// ═══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function toSportCardMatch(match: any) {
  // Match is already normalized from normalizeMatchFromServer
  // homeTeam/awayTeam are objects with {id, name, logo, score}
  // No transformation needed if it's already a flat card format
  if (typeof match?.homeTeam === "string") {
    // Already flattened card format - return as-is
    return match;
  }

  // For normalized Match objects, flatten into card format
  if (match?.homeTeam && typeof match.homeTeam === "object") {
    return {
      ...match,
      id: match.id || `match-${Date.now()}`,
      league: resolveMatchCompetitionLabel(match),
      espnLeague: resolveMatchEspnLeagueCode(match),
      // Extract team names from normalized structure
      homeTeam: String(match?.homeTeam?.name || "").trim() || "",
      awayTeam: String(match?.awayTeam?.name || "").trim() || "",
      homeTeamId: match?.homeTeam?.id || "",
      awayTeamId: match?.awayTeam?.id || "",
      homeTeamLogo: match?.homeTeam?.logo || null,
      awayTeamLogo: match?.awayTeam?.logo || null,
      homeScore: match?.score?.home ?? match?.homeScore ?? 0,
      awayScore: match?.score?.away ?? match?.awayScore ?? 0,
      startTime: match?.startTime || null,
      minute: match?.minute ?? null,
      status: match?.status || "unknown",
    };
  }

  // Fallback for unexpected formats - pass through as-is
  return match;
}

function toSportCardPayload(payload: SportsPayload): SportsPayload {
  return {
    ...payload,
    live: Array.isArray(payload?.live) ? payload.live.map(toSportCardMatch) : [],
    upcoming: Array.isArray(payload?.upcoming) ? payload.upcoming.map(toSportCardMatch) : [],
    finished: Array.isArray(payload?.finished) ? payload.finished.map(toSportCardMatch) : [],
  };
}

/**
 * Extract team name from various data formats
 * Prioritizes real team names over fallback text
 * Returns empty string rather than generic "Home"/"Away" to indicate missing data
 */
function getTeamName(team: unknown, fallback: string = ""): string {
  if (typeof team === "string") {
    const trimmed = team.trim();
    // Don't return generic single-word names without more context
    if (trimmed && trimmed !== "Home" && trimmed !== "Away" && trimmed.length > 0) {
      return trimmed;
    }
    return fallback;
  }

  if (team && typeof team === "object") {
    const obj = team as any;
    const name = String(obj?.name ?? obj?.displayName ?? obj?.teamName ?? "").trim();
    if (name && name !== "Home" && name !== "Away" && name.length > 0) {
      return name;
    }
  }

  return fallback;
}

function getTeamLogo(match: any, side: "home" | "away"): string {
  const direct = side === "home" ? match?.homeTeamLogo : match?.awayTeamLogo;
  if (typeof direct === "string" && direct.trim()) return direct;
  const teamObj = side === "home" ? match?.homeTeam : match?.awayTeam;
  if (teamObj && typeof teamObj === "object") {
    const nestedLogo = String((teamObj as any)?.logo || "").trim();
    if (nestedLogo) return nestedLogo;
  }
  return "";
}

function getScore(match: any, side: "home" | "away"): number {
  const direct = side === "home" ? match?.homeScore : match?.awayScore;
  if (Number.isFinite(Number(direct))) return Number(direct);
  const nested = side === "home" ? match?.score?.home : match?.score?.away;
  if (Number.isFinite(Number(nested))) return Number(nested);
  return 0;
}

function toMatchDetailParams(match: any) {
  const normalized = toSportCardMatch(match);
  
  // Ensure we have real team names - use empty string for missing rather than "Home"/"Away"
  const homeTeamName = getTeamName(normalized?.homeTeam, "");
  const awayTeamName = getTeamName(normalized?.awayTeam, "");
  
  return {
    matchId: String(normalized?.id || "").trim(),
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeTeamId: String(normalized?.homeTeamId || normalized?.homeTeam?.id || "").trim(),
    awayTeamId: String(normalized?.awayTeamId || normalized?.awayTeam?.id || "").trim(),
    homeTeamLogo: getTeamLogo(normalized, "home"),
    awayTeamLogo: getTeamLogo(normalized, "away"),
    homeScore: String(getScore(normalized, "home")),
    awayScore: String(getScore(normalized, "away")),
    league: String(normalized?.league || "").trim(),
    espnLeague: String(normalized?.espnLeague || "").trim(),
    competitionId: normalized?.competition?.id || "",
    minute: String(normalized?.minute ?? ""),
    status: String(normalized?.status || "unknown").trim(),
    sport: String(normalized?.sport || "football").trim(),
    startDate: String(normalized?.startTime || normalized?.startDate || "").trim(),
    statusDetail: String(normalized?.statusDetail || normalized?.detail || "").trim(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

type SportModuleHubProps = {
  initialPane?: SportPane;
};

/**
 * SportModuleHub - Main container for Sport tab
 * Manages pane routing: explore | live | matchday | insights
 */
export function SportModuleHub({ initialPane = "explore" }: SportModuleHubProps) {
  useRenderTelemetry("SportModuleHub", { pane: initialPane });

  const { t } = useTranslation();

  // ─ State ─────────────────────────────────────────────────────────────────────
  const [activePane, setActivePane] = useState<SportPane>(initialPane);
  const [selectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [refreshing, setRefreshing] = useState(false);

  // ─ Data Queries ──────────────────────────────────────────────────────────────
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const selectedTeams = useOnboardingStore((s) => s.selectedTeams);
  const selectedCompetitions = useOnboardingStore((s) => s.selectedCompetitions);
  const { followedTeams } = useFollowState();
  const [matchInteractions, setMatchInteractions] = useState<any>(null);

  const liveQuery = useQuery({
    ...buildSportLiveQuery(sportsEnabled),
    select: toSportCardPayload,
  });

  const todayQuery = useQuery({
    ...buildSportScheduleQuery(selectedDate, sportsEnabled),
    select: toSportCardPayload,
  });

  useEffect(() => {
    let mounted = true;
    loadMatchInteractions().then((value) => {
      if (mounted) setMatchInteractions(value);
    }).catch(() => {
      if (mounted) setMatchInteractions(null);
    });
    return () => { mounted = false; };
  }, []);

  const allMatches = useMemo(
    () => [...(liveQuery.data?.live || []), ...(todayQuery.data?.upcoming || [])],
    [liveQuery.data?.live, todayQuery.data?.upcoming],
  );
  const favoriteTeamNames = useMemo(
    () => [
      ...followedTeams.map((team) => String(team?.teamName || "")),
      ...selectedTeams.map((team) => String(team?.name || "")),
    ].filter(Boolean),
    [followedTeams, selectedTeams],
  );
  const preferredLeagues = useMemo(
    () => selectedCompetitions.map((competition) => String(competition?.name || competition?.id || "")).filter(Boolean),
    [selectedCompetitions],
  );
  const rankedFeed = useMemo(() => {
    return rankMatchesForUser({
      matches: allMatches,
      favoriteTeams: favoriteTeamNames,
      preferredLeagues,
      interactions: matchInteractions,
    }).slice(0, 8);
  }, [allMatches, favoriteTeamNames, preferredLeagues, matchInteractions]);

  const openMatch = useCallback((match: any) => {
    void recordMatchInteraction(match).then(() => loadMatchInteractions().then(setMatchInteractions).catch(() => undefined)).catch(() => undefined);
    router.push({ pathname: "/match-detail", params: toMatchDetailParams(match) });
  }, []);

  // ─ Pull to refresh ───────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        liveQuery.refetch(),
        todayQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [liveQuery, todayQuery]);

  if (!sportsEnabled) {
    return (
      <View style={styles.container}>
        <NexoraHeader
          variant="module"
          title="SPORT"
          titleColor={DS.accent}
          compact
          showSearch
          showNotification
          showFavorites
          onSearch={() => router.navigate("/(tabs)/search")}
          onNotification={() => router.push("/follow-center")}
          onFavorites={() => router.push("/favorites")}
        />
        <View style={styles.disabledContainer}>
          <Ionicons name="football-outline" size={56} color={DS.accent} />
          <Text style={styles.disabledTitle}>{t("sportsHome.disabled")}</Text>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={() => router.push("/settings")}
            activeOpacity={0.9}
          >
            <Ionicons name="settings" size={18} color={DS.bg} />
            <Text style={styles.enableButtonText}>{t("common.settings")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background glow effects */}
      <View style={styles.bgGlow} />

      {/* Header - stable, always visible */}
      <View style={styles.headerContainer}>
        <NexoraHeader
          variant="module"
          title="SPORT"
          titleColor={DS.accent}
          compact
          showSearch
          showNotification
          showFavorites
          onSearch={() => router.navigate("/(tabs)/search")}
          onNotification={() => router.push("/follow-center")}
          onFavorites={() => router.push("/favorites")}
        />

        {/* Pane Navigation */}
        <View style={styles.paneNav}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paneNavContent}
          >
            {(["explore", "live", "matchday", "insights", "teams", "standings"] as SportPane[]).map((pane) => {
              const isActive = activePane === pane;
              const label = {
                explore: t("sportsHome.explore"),
                live: t("sportsHome.live"),
                matchday: t("sportsHome.matchday"),
                insights: "Insights",
                teams: "Teams",
                standings: "Standings",
              }[pane];

              return (
                <TouchableOpacity
                  key={pane}
                  style={[styles.paneNavItem, isActive && styles.paneNavItemActive]}
                  onPress={() => setActivePane(pane)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.paneNavText, isActive && styles.paneNavTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Content Panes */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={DS.accent}
          />
        }
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {activePane === "explore" && (
          <ExplorePane
            liveMatches={liveQuery.data?.live || []}
            upcomingMatches={todayQuery.data?.upcoming || []}
            rankedFeed={rankedFeed}
            isLoading={Boolean(liveQuery.isLoading || todayQuery.isLoading)}
            onOpenMatch={openMatch}
          />
        )}
        {activePane === "live" && <LivePane matches={liveQuery.data?.live || []} onOpenMatch={openMatch} />}
        {activePane === "matchday" && <MatchdayPane matches={todayQuery.data?.upcoming || []} onOpenMatch={openMatch} />}
        {activePane === "insights" && <InsightsPane rankedFeed={rankedFeed} onOpenMatch={openMatch} />}
        {activePane === "teams" && <TeamsPane />}
        {activePane === "standings" && <StandingsPane />}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface ExplorePaneProps {
  liveMatches: any[];
  upcomingMatches: any[];
  rankedFeed: { match: any; reasons: string[]; isTrending: boolean; isUpsetPotential: boolean }[];
  isLoading: boolean;
  onOpenMatch: (match: any) => void;
}

function ExplorePane({ liveMatches, upcomingMatches, rankedFeed, isLoading, onOpenMatch }: ExplorePaneProps) {
  const { t } = useTranslation();

  // Group upcoming matches by competition
  const upcomingByLeague: Record<string, any[]> = upcomingMatches.reduce((acc, match) => {
    const rawLeague = String(match?.league || "").trim();
    const league = rawLeague && rawLeague !== "Competition" ? rawLeague : "Other Competitions";
    if (!acc[league]) acc[league] = [];
    (acc[league] as any[]).push(match);
    return acc;
  }, {} as Record<string, any[]>);

  // Sort leagues by number of matches and convert to proper types
  const sortedLeagues: [string, any[]][] = Object.entries(upcomingByLeague)
    .sort((a, b) => {
      const lenA = Array.isArray(a[1]) ? a[1].length : 0;
      const lenB = Array.isArray(b[1]) ? b[1].length : 0;
      return lenB - lenA;
    })
    .slice(0, 3)
    .map(([league, matches]) => [league, Array.isArray(matches) ? matches : []]);

  // Featured match = first live match, or first upcoming
  const featuredMatch = rankedFeed[0]?.match || liveMatches[0] || upcomingMatches[0];

  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.explore")} />

      {/* Summary Cards */}
      <View style={styles.exploreSummary}>
        <View style={styles.exploreSummaryCard}>
          <Text style={styles.exploreSummaryLabel}>Live</Text>
          <Text style={styles.exploreSummaryValue}>{liveMatches.length}</Text>
        </View>
        <View style={styles.exploreSummaryCard}>
          <Text style={styles.exploreSummaryLabel}>Today</Text>
          <Text style={styles.exploreSummaryValue}>{upcomingMatches.length}</Text>
        </View>
      </View>

      {/* Loading State */}
      {isLoading ? (
        <View style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={styles.placeholderText}>Loading football data...</Text>
        </View>
      ) : null}

      {/* Empty State */}
      {!isLoading && liveMatches.length === 0 && upcomingMatches.length === 0 ? (
        <View style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={styles.placeholderText}>{t("sportsHome.exploreSports")}</Text>
        </View>
      ) : null}

      {/* Featured Match - if available */}
      {!isLoading && featuredMatch ? (
        <>
          <SectionTitle title="Featured" />
          <View style={styles.matchList}>
            {liveMatches && liveMatches[0] ? (
              <LiveMatchCard
                match={liveMatches[0]}
                onPress={() => onOpenMatch(liveMatches[0])}
              />
            ) : upcomingMatches && upcomingMatches[0] ? (
              <UpcomingMatchCard
                match={upcomingMatches[0]}
                onPress={() => onOpenMatch(upcomingMatches[0])}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {!isLoading && rankedFeed.length > 0 ? (
        <>
          <SectionTitle title="Smart Match Feed" count={rankedFeed.length} />
          <View style={styles.matchList}>
            {rankedFeed.slice(0, 4).map((entry, idx) => (
              <View key={`${String(entry?.match?.id || idx)}_smart`}>
                <UpcomingMatchCard
                  match={entry.match}
                  onPress={() => onOpenMatch(entry.match)}
                />
                <View style={styles.smartTagsRow}>
                  {entry.isTrending ? <Text style={styles.smartTag}>Trending</Text> : null}
                  {entry.isUpsetPotential ? <Text style={styles.smartTag}>Upset</Text> : null}
                  {(entry.reasons || []).slice(0, 2).map((reason, reasonIdx) => (
                    <Text key={`${reason}_${reasonIdx}`} style={styles.smartTag}>{reason}</Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Matches by League */}
      {!isLoading && sortedLeagues.length > 0 ? (
        <>
          {sortedLeagues.map(([league, leagueMatches]) => (
            <View key={league}>
              <SectionTitle 
                title={league || "Other Competitions"} 
                count={Array.isArray(leagueMatches) ? leagueMatches.length : 0}
              />
              <View style={styles.matchList}>
                {Array.isArray(leagueMatches) && leagueMatches.slice(0, 3).map((match, idx) => (
                  <UpcomingMatchCard
                    key={`${match.id}-${idx}-${league}`}
                    match={match}
                    onPress={() => onOpenMatch(match)}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {/* View All Link */}
      {!isLoading && (upcomingMatches.length > 3 || liveMatches.length > 0) ? (
        <TouchableOpacity 
          style={styles.viewAllButton}
          onPress={() => {
            // Can add navigation to full match list here
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View Full Schedule →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface LivePaneProps {
  matches: any[];
  onOpenMatch: (match: any) => void;
}

function LivePane({ matches, onOpenMatch }: LivePaneProps) {
  const { t } = useTranslation();

  if (!matches || matches.length === 0) {
    return (
      <View style={{ paddingBottom: 40 }}>
        <SectionTitle title={t("sportsHome.live")} />
        <EmptyState icon="football-outline" title={t("sportsHome.noLiveMatches")} />
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.live")} count={matches.length} />
      <View style={styles.matchList}>
        {matches.map((match, idx) => (
          <LiveMatchCard
            key={`${match.id}-${idx}`}
            match={match}
            onPress={() => onOpenMatch(match)}
          />
        ))}
      </View>
    </View>
  );
}

interface MatchdayPaneProps {
  matches: any[];
  onOpenMatch: (match: any) => void;
}

function MatchdayPane({ matches, onOpenMatch }: MatchdayPaneProps) {
  const { t } = useTranslation();

  if (!matches || matches.length === 0) {
    return (
      <View style={{ paddingBottom: 40 }}>
        <SectionTitle title={t("sportsHome.matchday")} />
        <EmptyState icon="calendar-outline" title={t("sportsHome.noUpcomingMatches")} />
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.matchday")} count={matches.length} />
      <View style={styles.matchList}>
        {matches.map((match, idx) => (
          <UpcomingMatchCard
            key={`${match.id}-${idx}`}
            match={match}
            onPress={() => onOpenMatch(match)}
          />
        ))}
      </View>
    </View>
  );
}

function InsightsPane({ rankedFeed, onOpenMatch }: { rankedFeed: { match: any }[]; onOpenMatch: (match: any) => void }) {
  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title="Insights" />
      <View style={{ paddingHorizontal: 18, paddingVertical: 20 }}>
        <Text style={styles.placeholderText}>AI modules live: ranking, momentum, match story and smart notifications.</Text>
        <TouchableOpacity style={styles.highlightsButton} onPress={() => router.push("/highlights")} activeOpacity={0.8}>
          <Ionicons name="flash-outline" size={14} color={DS.bg} />
          <Text style={styles.highlightsButtonText}>Open Auto Highlights Feed</Text>
        </TouchableOpacity>
        {rankedFeed[0]?.match ? (
          <TouchableOpacity style={styles.insightPickCard} onPress={() => onOpenMatch(rankedFeed[0].match)} activeOpacity={0.86}>
            <Text style={styles.insightPickKicker}>AI Matchday Pick</Text>
            <Text style={styles.insightPickTitle}>
              {String(rankedFeed[0].match?.homeTeam || "Home")} vs {String(rankedFeed[0].match?.awayTeam || "Away")}
            </Text>
            <Text style={styles.insightPickMeta}>{String(rankedFeed[0].match?.league || "Competition")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function TeamsPane() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "teams", "ned.1"],
    queryFn: () => getCompetitionTeams({ espnLeague: "ned.1" }),
  });

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: "center", paddingTop: 40 }}>
      <Text style={styles.placeholderText}>Loading teams...</Text>
    </View>
  );
  if (error || !data?.length) return (
    <View style={{ flex: 1, alignItems: "center", paddingTop: 40 }}>
      <Ionicons name="people-outline" size={48} color={DS.muted} />
      <Text style={styles.emptyStateText}>No teams found</Text>
      <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title="Teams" count={data.length} />
      <View style={styles.teamsGrid}>
        {data.map((team: any) => (
          <TouchableOpacity
            key={team.id}
            style={styles.teamCard}
            onPress={() => router.push({ pathname: "/team-detail", params: { teamId: team.id, teamName: team.name, espnLeague: "ned.1", sport: "soccer" } })}
            activeOpacity={0.82}
          >
            {team.logo ? (
              <Image source={{ uri: team.logo }} style={styles.teamLogo} />
            ) : (
              <View style={[styles.teamLogo, styles.teamLogoPlaceholder]}>
                <Ionicons name="shield-outline" size={24} color={DS.muted} />
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={2}>{team.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function StandingsPane() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "standings", "ned.1"],
    queryFn: () => getCompetitionStandings({ espnLeague: "ned.1" }),
  });

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: "center", paddingTop: 40 }}>
      <Text style={styles.placeholderText}>Loading standings...</Text>
    </View>
  );
  if (error || !data?.length) return (
    <View style={{ flex: 1, alignItems: "center", paddingTop: 40 }}>
      <Ionicons name="trophy-outline" size={48} color={DS.muted} />
      <Text style={styles.emptyStateText}>No standings found</Text>
      <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title="Standings" />
      <View style={styles.standingsTable}>
        <View style={styles.standingsHeader}>
          {["#", "Team", "P", "W", "D", "L", "Pts"].map((h) => (
            <Text key={h} style={[styles.standingsCell, h === "Team" ? styles.standingsTeamCell : null, styles.standingsHeaderText]}>{h}</Text>
          ))}
        </View>
        {data.map((row: any) => (
          <View key={row.team?.id ?? row.rank} style={styles.standingsRow}>
            <Text style={styles.standingsCell}>{row.rank}</Text>
            <Text style={[styles.standingsCell, styles.standingsTeamCell]} numberOfLines={1}>{row.team?.name ?? ""}</Text>
            <Text style={styles.standingsCell}>{row.played}</Text>
            <Text style={styles.standingsCell}>{row.won}</Text>
            <Text style={styles.standingsCell}>{row.drawn}</Text>
            <Text style={styles.standingsCell}>{row.lost}</Text>
            <Text style={[styles.standingsCell, styles.standingsPtsCell]}>{row.points}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARD COMPONENTS (DEPRECATED - MOVED TO SportCards.tsx)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface SectionTitleProps {
  title: string;
  count?: number;
}

function SectionTitle({ title, count }: SectionTitleProps) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionTitleLeft}>
        <View style={styles.accentBar} />
        <Text style={styles.sectionTitleText}>{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
}

function EmptyState({ icon, title }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={48} color={DS.muted} />
      <Text style={styles.emptyStateText}>{title}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg,
  },
  bgGlow: {
    position: "absolute",
    top: 0,
    left: "50%",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(76,175,130,0.08)",
    transform: [{ translateX: -200 }],
    zIndex: 1,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // HEADER & NAV
  // ─────────────────────────────────────────────────────────────────────────────

  headerContainer: {
    backgroundColor: DS.bg,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: DS.border,
  },
  paneNav: {
    backgroundColor: DS.card,
    borderBottomWidth: 1,
    borderBottomColor: DS.border,
  },
  paneNavContent: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
  },
  paneNavItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  paneNavItemActive: {
    backgroundColor: DS.elevated,
    borderWidth: 1,
    borderColor: `${DS.accent}60`,
  },
  paneNavText: {
    fontSize: 13,
    fontWeight: "600",
    color: DS.muted,
    fontFamily: "Inter_600SemiBold",
  },
  paneNavTextActive: {
    color: DS.accent,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTENT
  // ─────────────────────────────────────────────────────────────────────────────

  content: {
    flex: 1,
  },
  contentInner: {
    paddingTop: 12,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION TITLE
  // ─────────────────────────────────────────────────────────────────────────────

  sectionTitle: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accentBar: {
    width: 3,
    height: 24,
    backgroundColor: DS.accent,
    borderRadius: 2,
  },
  sectionTitleText: {
    fontSize: 20,
    fontWeight: "800",
    color: DS.text,
    letterSpacing: -0.3,
    fontFamily: "Inter_800ExtraBold",
  },
  countBadge: {
    backgroundColor: "rgba(76,175,130,0.15)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(76,175,130,0.3)",
    marginLeft: 8,
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
    color: DS.accent,
    fontFamily: "Inter_700Bold",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // MATCH LIST
  // ─────────────────────────────────────────────────────────────────────────────

  matchList: {
    paddingHorizontal: 18,
    gap: 12,
  },
  smartTagsRow: {
    marginTop: -2,
    marginBottom: 8,
    paddingLeft: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  smartTag: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    backgroundColor: "rgba(229,9,20,0.16)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  exploreSummary: {
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  exploreSummaryCard: {
    flex: 1,
    backgroundColor: DS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  exploreSummaryLabel: {
    fontSize: 12,
    color: DS.muted,
    fontFamily: "Inter_600SemiBold",
  },
  exploreSummaryValue: {
    marginTop: 6,
    fontSize: 20,
    color: DS.text,
    fontFamily: "Inter_800ExtraBold",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // EMPTY STATE
  // ─────────────────────────────────────────────────────────────────────────────

  emptyState: {
    marginTop: 60,
    alignItems: "center",
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: "500",
    color: DS.muted,
    fontFamily: "Inter_500Medium",
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: "500",
    color: DS.muted,
    fontFamily: "Inter_500Medium",
  },
  highlightsButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: DS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  highlightsButtonText: {
    color: DS.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  insightPickCard: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
    backgroundColor: "rgba(229,9,20,0.12)",
    padding: 12,
    gap: 4,
  },
  insightPickKicker: {
    color: DS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  insightPickTitle: {
    color: DS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  insightPickMeta: {
    color: DS.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DISABLED STATE
  // ─────────────────────────────────────────────────────────────────────────────

  disabledContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 20,
  },
  disabledTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DS.text,
    fontFamily: "Inter_700Bold",
  },
  disabledMessage: {
    fontSize: 13,
    fontWeight: "500",
    color: DS.muted,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  enableButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: DS.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  enableButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: DS.bg,
    fontFamily: "Inter_700Bold",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW ALL BUTTON
  // ─────────────────────────────────────────────────────────────────────────────

  viewAllButton: {
    marginTop: 16,
    marginHorizontal: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: DS.accent,
    fontFamily: "Inter_600SemiBold",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // TEAMS PANE
  // ─────────────────────────────────────────────────────────────────────────────

  teamsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
  },
  teamCard: {
    width: "46%",
    backgroundColor: DS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DS.border,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 8,
  },
  teamLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  teamLogoPlaceholder: {
    backgroundColor: DS.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: {
    color: DS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DS.accent,
  },
  retryBtnText: {
    color: DS.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STANDINGS PANE
  // ─────────────────────────────────────────────────────────────────────────────

  standingsTable: {
    marginHorizontal: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: DS.border,
  },
  standingsHeader: {
    flexDirection: "row",
    backgroundColor: DS.elevated,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  standingsHeaderText: {
    color: DS.muted,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  standingsRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: DS.border,
    backgroundColor: DS.card,
  },
  standingsCell: {
    flex: 1,
    color: DS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textAlign: "center",
  },
  standingsTeamCell: {
    flex: 2.5,
    textAlign: "left",
  },
  standingsPtsCell: {
    fontFamily: "Inter_700Bold",
    color: DS.accent,
  },
});
