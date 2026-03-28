import React, { useMemo, useState, useEffect } from "react";
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useFollowState } from "@/context/UserStateContext";
import { useOnboardingStore } from "@/store/onboarding-store";
import { buildHighlightsQuery, buildHomeSportsQuery, buildVodHomeQuery, deriveCuratedHomeMedia } from "@/services/realtime-engine";
import { loadSmartAlerts, runNotificationEngine } from "@/lib/ai";

type NotificationCenterProps = {
  onClose: () => void;
  onNavigate: (screen: string, params?: any) => void;
};

type TabKey = "followed" | "alerts" | "recent";

const P = {
  bg: "#09090D",
  card: "#14141D",
  text: "#FFFFFF",
  muted: "#A2A2AF",
  accent: "#E50914",
  border: "rgba(255,255,255,0.09)",
};

export function NotificationCenter({ onClose, onNavigate }: NotificationCenterProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const { followedTeams, followedMatches, unfollowTeamAction, unfollowMatchAction } = useFollowState();
  const notificationPrefs = useOnboardingStore((state) => state.notifications);
  const sportsEnabled = useOnboardingStore((state) => state.sportsEnabled);
  const moviesEnabled = useOnboardingStore((state) => state.moviesEnabled);
  const [smartAlerts, setSmartAlerts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("followed");
  const sportsQuery = useQuery(buildHomeSportsQuery(new Date().toISOString().slice(0, 10), sportsEnabled));
  const highlightsQuery = useQuery(buildHighlightsQuery(sportsEnabled));
  const releasesQuery = useQuery(buildVodHomeQuery(moviesEnabled));

  const alertsEnabledCount = [notificationPrefs.matches, notificationPrefs.goals, notificationPrefs.lineups, notificationPrefs.news].filter(Boolean).length;

  const recentItems = useMemo(() => {
    if (smartAlerts.length > 0) {
      return smartAlerts.slice(0, 12).map((alert) => ({
        id: String(alert.id),
        title: String(alert.title || "Alert"),
        subtitle: String(alert.body || ""),
        route: alert.route,
        params: alert.params,
        priority: alert.priority,
      }));
    }
    return followedMatches
      .slice()
      .sort((a, b) => String(b.startTime || "").localeCompare(String(a.startTime || "")))
      .slice(0, 8)
      .map((match) => ({
        id: String(match.matchId),
        title: `${match.homeTeam} vs ${match.awayTeam}`,
        subtitle: match.competition || "Match alert",
      }));
  }, [followedMatches, smartAlerts]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const sportsPayload = sportsQuery.data || { live: [], upcoming: [] };
      const trackedMatches = [...(sportsPayload.live || []), ...(sportsPayload.upcoming || [])].map((match: any) => ({
        matchId: String(match?.id || ""),
        homeTeam: String(match?.homeTeam?.name || match?.homeTeam || "Home"),
        awayTeam: String(match?.awayTeam?.name || match?.awayTeam || "Away"),
        status: String(match?.status || ""),
        homeScore: Number(match?.score?.home ?? match?.homeScore ?? 0),
        awayScore: Number(match?.score?.away ?? match?.awayScore ?? 0),
        espnLeague: String(match?.espnLeague || ""),
      }));

      const rankedPick = trackedMatches[0] || null;
      const releases = deriveCuratedHomeMedia(releasesQuery.data).newReleases.slice(0, 6).map((item: any) => ({
        id: item?.id,
        title: item?.title,
        year: item?.year,
      }));

      const generated = await runNotificationEngine({
        notifications: {
          matches: notificationPrefs.matches,
          goals: notificationPrefs.goals,
          news: notificationPrefs.news,
        },
        followedTeamNames: followedTeams.map((team) => team.teamName),
        trackedMatches,
        rankedMatchPick: rankedPick ? {
          matchId: rankedPick.matchId,
          homeTeam: rankedPick.homeTeam,
          awayTeam: rankedPick.awayTeam,
          league: String(rankedPick.espnLeague || ""),
        } : null,
        releases,
      });

      if (mounted) setSmartAlerts(generated);
    };

    run().catch(async () => {
      const cached = await loadSmartAlerts();
      if (mounted) setSmartAlerts(cached);
    });

    return () => { mounted = false; };
  }, [followedTeams, highlightsQuery.data, notificationPrefs.goals, notificationPrefs.matches, notificationPrefs.news, releasesQuery.data, sportsQuery.data]);

  const followEmpty = followedTeams.length === 0 && followedMatches.length === 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={P.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {[
            { key: "followed", label: "Followed" },
            { key: "alerts", label: "Alerts" },
            { key: "recent", label: "Recent" },
          ].map((tab) => {
            const isActive = activeTab === (tab.key as TabKey);
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key as TabKey)}
                style={[styles.tab, isActive && styles.tabActive]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {activeTab === "followed" && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {followEmpty ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off-outline" size={26} color={P.muted} />
              <Text style={styles.emptyTitle}>No follows yet</Text>
              <Text style={styles.emptyBody}>Follow teams or matches to receive updates in your bell center.</Text>
            </View>
          ) : (
            <>
              {followedTeams.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Followed Teams</Text>
                  {followedTeams.map((team) => (
                    <View key={String(team.teamId)} style={styles.row}>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>{team.teamName}</Text>
                        <Text style={styles.rowSub}>{team.competition || "Team updates"}</Text>
                      </View>
                      <TouchableOpacity style={styles.unfollowBtn} onPress={() => void unfollowTeamAction(team.teamId)}>
                        <Text style={styles.unfollowText}>Unfollow</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {followedMatches.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Followed Matches</Text>
                  {followedMatches.map((match) => (
                    <TouchableOpacity
                      key={String(match.matchId)}
                      style={styles.row}
                      onPress={() => onNavigate("match-detail", { matchId: String(match.matchId), espnLeague: match.espnLeague || undefined })}
                    >
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>{match.homeTeam} vs {match.awayTeam}</Text>
                        <Text style={styles.rowSub}>{match.competition || "Match"}</Text>
                      </View>
                      <TouchableOpacity style={styles.unfollowBtn} onPress={() => void unfollowMatchAction(match.matchId)}>
                        <Text style={styles.unfollowText}>Unfollow</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {activeTab === "alerts" && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Alert Channels</Text>
            <Text style={styles.body}>Enabled channels: {alertsEnabledCount}/4</Text>
            <Text style={styles.body}>Match start: {notificationPrefs.matches ? "On" : "Off"}</Text>
            <Text style={styles.body}>Goals: {notificationPrefs.goals ? "On" : "Off"}</Text>
            <Text style={styles.body}>Lineups: {notificationPrefs.lineups ? "On" : "Off"}</Text>
            <Text style={styles.body}>News: {notificationPrefs.news ? "On" : "Off"}</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                if (Platform.OS === "ios") {
                  void Linking.openURL("app-settings:");
                } else {
                  void Linking.openSettings();
                }
              }}
            >
              <Text style={styles.primaryBtnText}>Open Device Notification Settings</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Smart Alerts Engine</Text>
            {smartAlerts.length === 0 ? (
              <Text style={styles.body}>Nog geen AI alerts opgebouwd. Zodra er live-events of releases zijn, verschijnt hier je gefilterde feed.</Text>
            ) : (
              smartAlerts.slice(0, 6).map((alert) => (
                <TouchableOpacity
                  key={String(alert.id)}
                  style={styles.row}
                  onPress={() => alert.route ? onNavigate(String(alert.route), alert.params || undefined) : undefined}
                >
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle}>{String(alert.title || "Alert")}</Text>
                    <Text style={styles.rowSub}>{String(alert.body || "")}</Text>
                  </View>
                  <Text style={[styles.priorityBadge, alert.priority === "priority" ? styles.priorityBadgeHigh : null]}>
                    {alert.priority === "priority" ? "Priority" : "Silent"}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === "recent" && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {recentItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={26} color={P.muted} />
              <Text style={styles.emptyTitle}>No recent alerts</Text>
              <Text style={styles.emptyBody}>Recent match-follow activity will appear here.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Items</Text>
              {recentItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.row}
                  onPress={() => (item as any).route ? onNavigate(String((item as any).route), (item as any).params || undefined) : undefined}
                >
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSub}>{item.subtitle}</Text>
                  </View>
                  {(item as any).priority === "priority" ? (
                    <Text style={[styles.priorityBadge, styles.priorityBadgeHigh]}>Priority</Text>
                  ) : (
                    <Ionicons name="ellipse" size={10} color={P.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    color: P.text,
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tabActive: {
    borderColor: "rgba(229,9,20,0.42)",
    backgroundColor: "rgba(229,9,20,0.16)",
  },
  tabText: {
    color: P.muted,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tabTextActive: {
    color: P.text,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.card,
    padding: 12,
    gap: 6,
  },
  cardTitle: {
    color: P.text,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 10,
    paddingBottom: 4,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: P.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  rowSub: {
    color: P.muted,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  unfollowBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.42)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  unfollowText: {
    color: P.accent,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  priorityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    color: "#D2D6E3",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
  },
  priorityBadgeHigh: {
    borderColor: "rgba(229,9,20,0.45)",
    color: P.accent,
    backgroundColor: "rgba(229,9,20,0.14)",
  },
  body: {
    color: P.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  primaryBtn: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: P.accent,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#09090D",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.card,
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: P.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyBody: {
    color: P.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
});
