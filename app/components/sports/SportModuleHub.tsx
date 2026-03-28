/**
 * SportModuleHub.tsx
 * ════════════════════════════════════════════════════════════════════════════════
 * Premium Sport UI - Netflix-level design system.
 * 
 * Panes: explore | live | matchday | insights
 * No overlaps, no glitching, clean architecture.
 */

import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useTranslation } from "@/lib/useTranslation";
import { buildSportLiveQuery, buildSportScheduleQuery } from "@/services/realtime-engine";
import {
  LiveMatchCard,
  UpcomingMatchCard,
} from "@/components/sports/SportCards";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

type SportPane = "explore" | "live" | "matchday" | "insights";

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
  accent: "#E50914",
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
  if (!match?.homeTeam || typeof match.homeTeam === "string") return match;
  return {
    ...match,
    league: match?.competition?.displayName || match?.league || "League",
    espnLeague: match?.competition?.espnSlug || match?.espnLeague || "",
    homeTeam: match?.homeTeam?.name || "Home",
    awayTeam: match?.awayTeam?.name || "Away",
    homeTeamLogo: match?.homeTeam?.logo || null,
    awayTeamLogo: match?.awayTeam?.logo || null,
    homeScore: match?.score?.home ?? match?.homeScore,
    awayScore: match?.score?.away ?? match?.awayScore,
    startTime: match?.startTime || null,
    minute: match?.minute ?? null,
  };
}

function toSportCardPayload(payload: SportsPayload): SportsPayload {
  return {
    ...payload,
    live: Array.isArray(payload?.live) ? payload.live.map(toSportCardMatch) : [],
    upcoming: Array.isArray(payload?.upcoming) ? payload.upcoming.map(toSportCardMatch) : [],
    finished: Array.isArray(payload?.finished) ? payload.finished.map(toSportCardMatch) : [],
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

  const liveQuery = useQuery({
    ...buildSportLiveQuery(sportsEnabled),
    select: toSportCardPayload,
  });

  const todayQuery = useQuery({
    ...buildSportScheduleQuery(selectedDate, sportsEnabled),
    select: toSportCardPayload,
  });

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
          title="NEXORA SPORT"
          titleColor={DS.accent}
          compact
          showSearch
          showNotification
          showFavorites
          showProfile
          onSearch={() => router.push("/(tabs)/search")}
          onNotification={() => router.push("/follow-center")}
          onFavorites={() => router.push("/favorites")}
          onProfile={() => router.push("/profile")}
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
          title="NEXORA SPORT"
          titleColor={DS.accent}
          compact
          showSearch
          showNotification
          showFavorites
          showProfile
          onSearch={() => router.push("/(tabs)/search")}
          onNotification={() => router.push("/follow-center")}
          onFavorites={() => router.push("/favorites")}
          onProfile={() => router.push("/profile")}
        />

        {/* Pane Navigation */}
        <View style={styles.paneNav}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paneNavContent}
          >
            {(["explore", "live", "matchday", "insights"] as SportPane[]).map((pane) => {
              const isActive = activePane === pane;
              const label = {
                explore: t("sportsHome.explore"),
                live: t("sportsHome.live"),
                matchday: t("sportsHome.matchday"),
                insights: "Insights",
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
        {activePane === "explore" && <ExplorePane />}
        {activePane === "live" && <LivePane matches={liveQuery.data?.live || []} />}
        {activePane === "matchday" && <MatchdayPane matches={todayQuery.data?.upcoming || []} />}
        {activePane === "insights" && <InsightsPane />}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ExplorePane() {
  const { t } = useTranslation();
  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title={t("sportsHome.explore")} />
      <View style={{ paddingHorizontal: 18, paddingVertical: 20 }}>
        <Text style={styles.placeholderText}>{t("sportsHome.exploreSports")}</Text>
      </View>
    </View>
  );
}

interface LivePaneProps {
  matches: any[];
}

function LivePane({ matches }: LivePaneProps) {
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
          <LiveMatchCard key={`${match.id}-${idx}`} match={match} onPress={() => {}} />
        ))}
      </View>
    </View>
  );
}

interface MatchdayPaneProps {
  matches: any[];
}

function MatchdayPane({ matches }: MatchdayPaneProps) {
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
          <UpcomingMatchCard key={`${match.id}-${idx}`} match={match} onPress={() => {}} />
        ))}
      </View>
    </View>
  );
}

function InsightsPane() {
  return (
    <View style={{ paddingBottom: 40 }}>
      <SectionTitle title="Insights" />
      <View style={{ paddingHorizontal: 18, paddingVertical: 20 }}>
        <Text style={styles.placeholderText}>Analysis & predictions coming soon</Text>
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
    backgroundColor: "rgba(229,9,20,0.08)",
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
    backgroundColor: "rgba(229,9,20,0.15)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
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
});
