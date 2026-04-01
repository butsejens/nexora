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
  ActivityIndicator, View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Image,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useTranslation } from "@/lib/useTranslation";
import { classifyRelativeDay, getMatchdayYmd, shiftYmd } from "@/lib/date/matchday";
import { useExploreMatches, useLiveMatches, useMatchdayMatches } from "@/features/sports/hooks/useSportHomeFeed";
import { useFollowState } from "@/context/UserStateContext";
import {
  LiveMatchCard,
  UpcomingMatchCard,
  MatchStatusCard,
  resolveMatchVisualState,
  SkeletonMatchCard,
} from "@/components/sports/SportCards";
import { resolveMatchCompetitionLabel, resolveMatchEspnLeagueCode } from "@/lib/sports-competition";
import { loadMatchInteractions, rankMatchesForUser, recordMatchInteraction } from "@/lib/ai";
import { getCompetitionTeams, getCompetitionStandings } from "@/lib/services/sports-service";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

type SportPane = "explore" | "live" | "matchday" | "insights" | "teams" | "standings";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const DS = {
  bg:       "#050505",
  card:     "#0B0F1A",
  elevated: "#12192A",
  accent:   "#E50914",
  live:     "#22C55E",
  text:     "#FFFFFF",
  muted:    "#71717A",
  border:   "#1F2937",
  glass:    "rgba(11,15,26,0.92)",
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

function parseDateLocal(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isRenderableMatch(match: any): boolean {
  if (!match) return false;
  const home = getTeamName(match?.homeTeam, "");
  const away = getTeamName(match?.awayTeam, "");
  return Boolean(home && away);
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
  const [selectedDate, setSelectedDate] = useState(() => getMatchdayYmd());
  const [refreshing, setRefreshing] = useState(false);

  // ─ Data Queries ──────────────────────────────────────────────────────────────
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const selectedTeams = useOnboardingStore((s) => s.selectedTeams);
  const selectedCompetitions = useOnboardingStore((s) => s.selectedCompetitions);
  const { followedTeams } = useFollowState();
  const [matchInteractions, setMatchInteractions] = useState<any>(null);

  const liveQuery = useLiveMatches(sportsEnabled);
  const todayQuery = useMatchdayMatches(selectedDate, sportsEnabled);
  const exploreQuery = useExploreMatches(selectedDate, sportsEnabled);

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
    () => [...(liveQuery.live || []), ...(exploreQuery.matches || [])].map(toSportCardMatch),
    [liveQuery.live, exploreQuery.matches],
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
        exploreQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [exploreQuery, liveQuery, todayQuery]);

  if (!sportsEnabled) {
    return (
      <View style={styles.container}>
        <NexoraHeader
          variant="module"
          title="SPORT"
          titleColor={DS.accent}
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
            liveMatches={(liveQuery.live || []).map(toSportCardMatch)}
            upcomingMatches={(todayQuery.upcoming || []).map(toSportCardMatch)}
            rankedFeed={rankedFeed}
            isLoading={Boolean(liveQuery.isLoading || todayQuery.isLoading)}
            onOpenMatch={openMatch}
            onViewSchedule={() => setActivePane("matchday")}
          />
        )}
        {activePane === "live" && <LivePane matches={(liveQuery.live || []).map(toSportCardMatch)} onOpenMatch={openMatch} />}
        {activePane === "matchday" && (
          <MatchdayPane
            matches={[
              ...(todayQuery.live || []),
              ...(todayQuery.upcoming || []),
              ...(todayQuery.finished || []),
            ].map(toSportCardMatch)}
            onOpenMatch={openMatch}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            isLoading={Boolean(todayQuery.isLoading)}
            isError={Boolean(todayQuery.isError)}
            onRetry={() => {
              void todayQuery.refetch();
            }}
          />
        )}
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
  onViewSchedule: () => void;
}

function ExplorePane({ liveMatches, upcomingMatches, rankedFeed, isLoading, onOpenMatch, onViewSchedule }: ExplorePaneProps) {
  const { t } = useTranslation();

  // Group upcoming matches by competition
  const upcomingByLeague: Record<string, any[]> = upcomingMatches.reduce((acc, match) => {
    const rawLeague = String(match?.league || "").trim();
    const league = rawLeague && rawLeague !== "Competition" ? rawLeague : "Other Competitions";
    if (!acc[league]) acc[league] = [];
    (acc[league] as any[]).push(match);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedLeagues: [string, any[]][] = Object.entries(upcomingByLeague)
    .sort((a, b) => {
      const lenA = Array.isArray(a[1]) ? a[1].length : 0;
      const lenB = Array.isArray(b[1]) ? b[1].length : 0;
      return lenB - lenA;
    })
    .slice(0, 3)
    .map(([league, matches]) => [league, Array.isArray(matches) ? matches : []]);

  const featuredMatch = rankedFeed[0]?.match || liveMatches[0] || upcomingMatches[0];

  if (isLoading) {
    return (
      <View style={{ paddingBottom: 40 }}>
        <SectionTitle title={t("sportsHome.explore")} />
        <View style={styles.matchList}>
          <SkeletonMatchCard />
          <SkeletonMatchCard />
          <SkeletonMatchCard />
        </View>
      </View>
    );
  }

  if (liveMatches.length === 0 && upcomingMatches.length === 0) {
    return (
      <View style={{ paddingBottom: 40 }}>
        <SectionTitle title={t("sportsHome.explore")} />
        <EmptyState icon="football-outline" title={t("sportsHome.exploreSports")} />
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 40 }}>
      {/* Summary stat chips */}
      <View style={styles.exploreSummary}>
        <View style={[styles.exploreSummaryCard, styles.exploreSummaryLive]}>
          <View style={styles.exploreSummaryLiveDot} />
          <Text style={styles.exploreSummaryValue}>{liveMatches.length}</Text>
          <Text style={styles.exploreSummaryLabel}>Live</Text>
        </View>
        <View style={styles.exploreSummaryCard}>
          <Ionicons name="calendar-outline" size={14} color={DS.muted} style={{ marginBottom: 2 }} />
          <Text style={styles.exploreSummaryValue}>{upcomingMatches.length}</Text>
          <Text style={styles.exploreSummaryLabel}>Today</Text>
        </View>
        <View style={styles.exploreSummaryCard}>
          <Ionicons name="trophy-outline" size={14} color={DS.muted} style={{ marginBottom: 2 }} />
          <Text style={styles.exploreSummaryValue}>{sortedLeagues.length}</Text>
          <Text style={styles.exploreSummaryLabel}>Leagues</Text>
        </View>
      </View>

      {/* Featured Match */}
      {featuredMatch ? (
        <>
          <SectionTitle title="Featured" />
          <View style={styles.matchList}>
            {featuredMatch?.status === "live" || featuredMatch?.minute ? (
              <LiveMatchCard match={featuredMatch} onPress={() => onOpenMatch(featuredMatch)} />
            ) : (
              <UpcomingMatchCard match={featuredMatch} onPress={() => onOpenMatch(featuredMatch)} />
            )}
          </View>
        </>
      ) : null}

      {/* Smart Match Feed */}
      {rankedFeed.length > 0 ? (
        <>
          <SectionTitle title="Smart Feed" count={rankedFeed.length} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, gap: 10, paddingBottom: 4 }}
          >
            {rankedFeed.slice(0, 6).map((entry, idx) => (
              <View key={`${String(entry?.match?.id || idx)}_smart`} style={{ width: 270 }}>
                <UpcomingMatchCard
                  match={entry.match}
                  onPress={() => onOpenMatch(entry.match)}
                />
                <View style={styles.smartTagsRow}>
                  {entry.isTrending ? (
                    <View style={[styles.smartBadge, styles.smartBadgeFire]}>
                      <Ionicons name="flame" size={10} color="#FF6B35" />
                    </View>
                  ) : null}
                  {entry.isUpsetPotential ? (
                    <View style={[styles.smartBadge, styles.smartBadgeAlert]}>
                      <Ionicons name="flash" size={10} color="#FFB300" />
                    </View>
                  ) : null}
                  {(entry.reasons || []).slice(0, 2).map((reason, ri) => (
                    <View key={`${reason}_${ri}`} style={styles.smartTagChip}>
                      <Text style={styles.smartTagText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Matches by League */}
      {sortedLeagues.length > 0 ? (
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

      {(upcomingMatches.length > 3 || liveMatches.length > 0) ? (
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={onViewSchedule}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={14} color={DS.accent} />
          <Text style={styles.viewAllText}>Full Schedule</Text>
          <Ionicons name="chevron-forward" size={14} color={DS.accent} />
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
        <EmptyState icon="radio-outline" title={t("sportsHome.noLiveMatches")} />
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
  selectedDate: string;
  onDateChange: (date: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function MatchdayPane({
  matches,
  onOpenMatch,
  selectedDate,
  onDateChange,
  isLoading,
  isError,
  onRetry,
}: MatchdayPaneProps) {
  const { t } = useTranslation();

  const goToPrevDay = () => {
    onDateChange(shiftYmd(selectedDate, -1));
  };

  const goToNextDay = () => {
    onDateChange(shiftYmd(selectedDate, 1));
  };

  const goToToday = () => {
    onDateChange(getMatchdayYmd());
  };

  const renderableMatches = useMemo(
    () => (Array.isArray(matches) ? matches.filter(isRenderableMatch) : []),
    [matches],
  );

  const grouped = useMemo(() => {
    const live: any[] = [];
    const upcoming: any[] = [];
    const finished: any[] = [];
    const postponedCancelled: any[] = [];

    for (const match of renderableMatches) {
      const visual = resolveMatchVisualState(match);
      if (visual === "live") {
        live.push(match);
        continue;
      }
      if (visual === "upcoming") {
        upcoming.push(match);
        continue;
      }
      if (visual === "finished") {
        finished.push(match);
        continue;
      }
      postponedCancelled.push(match);
    }

    return { live, upcoming, finished, postponedCancelled };
  }, [renderableMatches]);

  const formattedDate = (() => {
    const target = parseDateLocal(selectedDate);
    const relative = classifyRelativeDay(selectedDate, getMatchdayYmd());
    if (relative === "today") return "Today";
    if (relative === "tomorrow") return "Tomorrow";
    if (relative === "yesterday") return "Yesterday";
    return new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short" }).format(target);
  })();

  const isToday = selectedDate === getMatchdayYmd();
  const totalMatches = renderableMatches.length;

  return (
    <View style={{ paddingBottom: 40 }}>
      <View style={styles.dateNavRow}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={goToPrevDay} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={DS.text} />
        </TouchableOpacity>
        <View style={styles.dateNavCenter}>
          <Text style={styles.dateNavLabel}>{formattedDate}</Text>
          <Text style={styles.dateNavMeta}>{selectedDate}</Text>
        </View>
        <TouchableOpacity style={styles.dateNavBtn} onPress={goToNextDay} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={20} color={DS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.matchdayTopActions}>
        <TouchableOpacity
          style={[styles.todayBtn, isToday && styles.todayBtnActive]}
          onPress={goToToday}
          activeOpacity={0.8}
        >
          <Text style={[styles.todayBtnText, isToday && styles.todayBtnTextActive]}>Today</Text>
        </TouchableOpacity>
        <View style={styles.matchdayCountPill}>
          <Text style={styles.matchdayCountText}>{totalMatches} matches</Text>
        </View>
      </View>

      <View style={styles.matchdayStatusGrid}>
        <StatusCounter label="Live" value={grouped.live.length} state="live" />
        <StatusCounter label="Upcoming" value={grouped.upcoming.length} state="upcoming" />
        <StatusCounter label="Finished" value={grouped.finished.length} state="finished" />
        <StatusCounter label="Post/Can" value={grouped.postponedCancelled.length} state="postponed" />
      </View>

      {isLoading ? (
        <View style={styles.matchList}>
          <SkeletonMatchCard />
          <SkeletonMatchCard />
          <SkeletonMatchCard />
        </View>
      ) : null}

      {!isLoading && isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Matchday data kon niet geladen worden"
          subtitle="Check je verbinding of kies een andere datum."
          actions={[
            { label: "Retry", onPress: onRetry },
            { label: "Today", onPress: goToToday, secondary: true },
          ]}
        />
      ) : null}

      {!isLoading && !isError && totalMatches === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={t("sportsHome.noUpcomingMatches")}
          subtitle="Geen wedstrijden op deze datum. Probeer een dag eerder of later."
          actions={[
            { label: "Vorige dag", onPress: goToPrevDay, secondary: true },
            { label: "Volgende dag", onPress: goToNextDay, secondary: true },
            { label: "Today", onPress: goToToday },
          ]}
        />
      ) : null}

      {!isLoading && !isError && totalMatches > 0 ? (
        <>
          <SectionTitle title={t("sportsHome.matchday")} count={totalMatches} />

          {grouped.live.length > 0 ? (
            <>
              <SectionTitle title="Live Now" count={grouped.live.length} />
              <View style={styles.matchList}>
                {grouped.live.map((match, idx) => (
                  <MatchStatusCard key={`${match.id}-${idx}-live`} match={match} onPress={() => onOpenMatch(match)} />
                ))}
              </View>
            </>
          ) : null}

          {grouped.upcoming.length > 0 ? (
            <>
              <SectionTitle title="Upcoming" count={grouped.upcoming.length} />
              <View style={styles.matchList}>
                {grouped.upcoming.map((match, idx) => (
                  <MatchStatusCard key={`${match.id}-${idx}-up`} match={match} onPress={() => onOpenMatch(match)} />
                ))}
              </View>
            </>
          ) : null}

          {grouped.finished.length > 0 ? (
            <>
              <SectionTitle title="Finished" count={grouped.finished.length} />
              <View style={styles.matchList}>
                {grouped.finished.map((match, idx) => (
                  <MatchStatusCard key={`${match.id}-${idx}-ft`} match={match} onPress={() => onOpenMatch(match)} />
                ))}
              </View>
            </>
          ) : null}

          {grouped.postponedCancelled.length > 0 ? (
            <>
              <SectionTitle title="Schedule Updates" count={grouped.postponedCancelled.length} />
              <View style={styles.matchList}>
                {grouped.postponedCancelled.map((match, idx) => (
                  <MatchStatusCard key={`${match.id}-${idx}-pc`} match={match} onPress={() => onOpenMatch(match)} />
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.matchList}>
            <TouchableOpacity style={styles.viewAllButton} onPress={onRetry} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={14} color={DS.accent} />
              <Text style={styles.viewAllText}>Refresh Matchday</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

function InsightsPane({ rankedFeed, onOpenMatch }: { rankedFeed: { match: any; reasons: string[]; isTrending: boolean; isUpsetPotential: boolean }[]; onOpenMatch: (match: any) => void }) {
  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title="Insights" />

      {/* Highlights shortcut */}
      <View style={{ paddingHorizontal: 18, paddingBottom: 4 }}>
        <TouchableOpacity style={styles.highlightsButton} onPress={() => router.push("/highlights")} activeOpacity={0.8}>
          <Ionicons name="flash" size={13} color="#050505" />
          <Text style={styles.highlightsButtonText}>Auto Highlights</Text>
        </TouchableOpacity>
      </View>

      {rankedFeed.length > 0 ? (
        <>
          <SectionTitle title="Smart Picks" count={rankedFeed.length} />
          <View style={styles.matchList}>
            {rankedFeed.map((entry, idx) => (
              <View key={`${String(entry?.match?.id || idx)}_insight`}>
                <UpcomingMatchCard
                  match={entry.match}
                  onPress={() => onOpenMatch(entry.match)}
                />
                {(entry.isTrending || entry.isUpsetPotential || entry.reasons?.length > 0) && (
                  <View style={styles.smartTagsRow}>
                    {entry.isTrending ? (
                      <View style={[styles.smartBadge, styles.smartBadgeFire]}>
                        <Ionicons name="flame" size={10} color="#FF6B35" />
                        <Text style={[styles.smartTagText, { color: "#FF6B35" }]}>Trending</Text>
                      </View>
                    ) : null}
                    {entry.isUpsetPotential ? (
                      <View style={[styles.smartBadge, styles.smartBadgeAlert]}>
                        <Ionicons name="flash" size={10} color="#FFB300" />
                        <Text style={[styles.smartTagText, { color: "#FFB300" }]}>Upset Alert</Text>
                      </View>
                    ) : null}
                    {(entry.reasons || []).slice(0, 2).map((reason, reasonIdx) => (
                      <View key={`${reason}_${reasonIdx}`} style={styles.smartBadge}>
                        <Text style={styles.smartTagText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        </>
      ) : (
        <EmptyState icon="bar-chart-outline" title="AI modules active — ranking, momentum, match story" />
      )}
    </View>
  );
}

function TeamsPane() {
  const selectedCompetitions = useOnboardingStore((s) => s.selectedCompetitions);
  const preferred = selectedCompetitions.find((c) => c.espnLeague) ?? null;
  const espnLeague = preferred?.espnLeague ?? "ned.1";
  const sport = preferred?.sport ?? "soccer";
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "teams", espnLeague],
    queryFn: () => getCompetitionTeams({ espnLeague }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  if (isLoading) return (
    <View style={{ minHeight: 250, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
      <ActivityIndicator color={DS.accent} size="large" />
      <Text style={[styles.placeholderText, { marginTop: 12 }]}>Loading teams...</Text>
    </View>
  );
  if (error || !data?.length) return (
    <View style={{ minHeight: 250, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
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
            onPress={() => router.push({ pathname: "/team-detail", params: { teamId: team.id, teamName: team.name, espnLeague, sport } })}
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
  const selectedCompetitions = useOnboardingStore((s) => s.selectedCompetitions);
  const preferred = selectedCompetitions.find((c) => c.espnLeague) ?? null;
  const espnLeague = preferred?.espnLeague ?? "ned.1";
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "standings", espnLeague],
    queryFn: () => getCompetitionStandings({ espnLeague }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  if (isLoading) return (
    <View style={{ minHeight: 250, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
      <ActivityIndicator color={DS.accent} size="large" />
      <Text style={[styles.placeholderText, { marginTop: 12 }]}>Loading standings...</Text>
    </View>
  );
  if (error || !data?.length) return (
    <View style={{ minHeight: 250, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
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
  subtitle?: string;
  actions?: { label: string; onPress: () => void; secondary?: boolean }[];
}

function EmptyState({ icon, title, subtitle, actions = [] }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={48} color={DS.muted} />
      <Text style={styles.emptyStateText}>{title}</Text>
      {subtitle ? <Text style={styles.emptyStateSubtext}>{subtitle}</Text> : null}
      {actions.length > 0 ? (
        <View style={styles.emptyStateActions}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={action.onPress}
              style={[styles.emptyStateBtn, action.secondary && styles.emptyStateBtnSecondary]}
              activeOpacity={0.85}
            >
              <Text style={[styles.emptyStateBtnText, action.secondary && styles.emptyStateBtnTextSecondary]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StatusCounter({ label, value, state }: { label: string; value: number; state: "live" | "upcoming" | "finished" | "postponed" }) {
  const color = state === "live"
    ? "#22C55E"
    : state === "upcoming"
      ? "#93A6BE"
      : state === "finished"
        ? "#9CA3AF"
        : "#C084FC";

  return (
    <View style={[styles.matchdayStatCard, { borderColor: `${color}40` }]}>
      <Text style={[styles.matchdayStatValue, { color }]}>{value}</Text>
      <Text style={styles.matchdayStatLabel}>{label}</Text>
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
    top: -80,
    left: "50%",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(229,9,20,0.06)",
    transform: [{ translateX: -170 }],
    zIndex: 0,
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
    backgroundColor: "rgba(229,9,20,0.12)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
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
    marginTop: -4,
    marginBottom: 6,
    paddingLeft: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  smartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  smartBadgeFire: {
    borderColor: "rgba(255,107,53,0.3)",
    backgroundColor: "rgba(255,107,53,0.10)",
  },
  smartBadgeAlert: {
    borderColor: "rgba(255,179,0,0.3)",
    backgroundColor: "rgba(255,179,0,0.10)",
  },
  smartTagChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
    backgroundColor: "rgba(229,9,20,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  smartTagText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.75)",
  },
  exploreSummary: {
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  exploreSummaryCard: {
    flex: 1,
    backgroundColor: DS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DS.border,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  exploreSummaryLive: {
    borderColor: "rgba(34,197,94,0.25)",
    backgroundColor: "rgba(34,197,94,0.06)",
  },
  exploreSummaryLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
    marginBottom: 2,
  },
  exploreSummaryLabel: {
    fontSize: 10,
    color: DS.muted,
    fontFamily: "Inter_500Medium",
  },
  exploreSummaryValue: {
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
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "700",
    color: DS.text,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: DS.muted,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  emptyStateActions: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  emptyStateBtn: {
    borderRadius: 999,
    backgroundColor: "rgba(229,9,20,0.18)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.35)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyStateBtnSecondary: {
    backgroundColor: DS.elevated,
    borderColor: DS.border,
  },
  emptyStateBtnText: {
    color: DS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  emptyStateBtnTextSecondary: {
    color: DS.text,
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
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.30)",
    backgroundColor: "rgba(229,9,20,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  viewAllText: {
    fontSize: 13,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // DATE NAV
  // ─────────────────────────────────────────────────────────────────────────────

  dateNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DS.border,
    marginBottom: 4,
  },
  dateNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DS.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dateNavLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: DS.text,
    fontFamily: "Inter_700Bold",
  },
  dateNavMeta: {
    fontSize: 11,
    color: DS.muted,
    fontFamily: "Inter_500Medium",
  },
  matchdayTopActions: {
    paddingHorizontal: 18,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  todayBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: DS.elevated,
  },
  todayBtnActive: {
    borderColor: "rgba(229,9,20,0.40)",
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  todayBtnText: {
    fontFamily: "Inter_700Bold",
    color: DS.text,
    fontSize: 12,
  },
  todayBtnTextActive: {
    color: DS.accent,
  },
  matchdayCountPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: DS.card,
  },
  matchdayCountText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: DS.muted,
  },
  matchdayStatusGrid: {
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  matchdayStatCard: {
    flexGrow: 1,
    minWidth: "46%",
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: DS.card,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  matchdayStatValue: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
  },
  matchdayStatLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: DS.muted,
  },
});
