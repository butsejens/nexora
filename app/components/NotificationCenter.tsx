import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { useFollowState } from "@/context/UserStateContext";
import { useOnboardingStore } from "@/store/onboarding-store";
import {
  buildVodHomeQuery,
  deriveCuratedHomeMedia,
} from "@/services/realtime-engine";
import { loadSmartAlerts, runNotificationEngine } from "@/lib/ai";

type NotificationCenterProps = {
  onClose: () => void;
  onNavigate: (screen: string, params?: any) => void;
};

type TabKey = "followed" | "alerts" | "recent";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "followed", label: "Gevolgd", icon: "heart-outline" },
  { key: "alerts", label: "Meldingen", icon: "notifications-outline" },
  { key: "recent", label: "Recent", icon: "time-outline" },
];

export function NotificationCenter({
  onClose,
  onNavigate,
}: NotificationCenterProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const {
    followedTeams,
    followedMatches,
    unfollowTeamAction,
    unfollowMatchAction,
  } = useFollowState();
  const notificationPrefs = useOnboardingStore((state) => state.notifications);
  const moviesEnabled = useOnboardingStore((state) => state.moviesEnabled);
  const [smartAlerts, setSmartAlerts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("followed");
  const releasesQuery = useQuery(buildVodHomeQuery(moviesEnabled));

  const alertsEnabledCount = [
    notificationPrefs.matches,
    notificationPrefs.goals,
    notificationPrefs.lineups,
    notificationPrefs.news,
  ].filter(Boolean).length;

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
      .sort((a, b) =>
        String(b.startTime || "").localeCompare(String(a.startTime || "")),
      )
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
      const releases = deriveCuratedHomeMedia(releasesQuery.data)
        .newReleases.slice(0, 6)
        .map((item: any) => ({
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
        followedTeamNames: [],
        trackedMatches: [],
        rankedMatchPick: null,
        releases,
      });

      if (mounted) setSmartAlerts(generated);
    };

    run().catch(async () => {
      const cached = await loadSmartAlerts();
      if (mounted) setSmartAlerts(cached);
    });

    return () => {
      mounted = false;
    };
  }, [
    notificationPrefs.goals,
    notificationPrefs.matches,
    notificationPrefs.news,
    releasesQuery.data,
  ]);

  const followEmpty =
    followedTeams.length === 0 && followedMatches.length === 0;

  return (
    <View style={s.screen}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <View style={s.headerRow}>
          <Text style={s.headerTitle}>Meldingen</Text>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={19} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={s.tabBar}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, active && s.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={13}
                  color={active ? COLORS.accent : COLORS.textMuted}
                />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Gevolgd ── */}
      {activeTab === "followed" && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {followEmpty ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIcon}>
                <Ionicons name="heart-dislike-outline" size={24} color={COLORS.textMuted} />
              </View>
              <Text style={s.emptyTitle}>Nog niets gevolgd</Text>
              <Text style={s.emptyBody}>
                Volg teams of wedstrijden om hier updates te ontvangen.
              </Text>
            </View>
          ) : (
            <>
              {followedTeams.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>GEVOLGDE TEAMS</Text>
                  <View style={s.card}>
                    {followedTeams.map((team, i) => (
                      <React.Fragment key={String(team.teamId)}>
                        {i > 0 && <View style={s.divider} />}
                        <View style={s.row}>
                          <View style={s.rowIcon}>
                            <Ionicons name="shield-outline" size={16} color={COLORS.accent} />
                          </View>
                          <View style={s.rowText}>
                            <Text style={s.rowTitle}>{team.teamName}</Text>
                            <Text style={s.rowSub}>{team.competition || "Team updates"}</Text>
                          </View>
                          <TouchableOpacity
                            style={s.unfollowBtn}
                            onPress={() => void unfollowTeamAction(team.teamId)}
                          >
                            <Text style={s.unfollowText}>Ontvolgen</Text>
                          </TouchableOpacity>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              )}

              {followedMatches.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>GEVOLGDE WEDSTRIJDEN</Text>
                  <View style={s.card}>
                    {followedMatches.map((match, i) => (
                      <React.Fragment key={String(match.matchId)}>
                        {i > 0 && <View style={s.divider} />}
                        <TouchableOpacity
                          style={s.row}
                          onPress={() =>
                            onNavigate("match-detail", {
                              matchId: String(match.matchId),
                              espnLeague: match.espnLeague || undefined,
                            })
                          }
                        >
                          <View style={s.rowIcon}>
                            <Ionicons name="football-outline" size={16} color={COLORS.accent} />
                          </View>
                          <View style={s.rowText}>
                            <Text style={s.rowTitle}>
                              {match.homeTeam} vs {match.awayTeam}
                            </Text>
                            <Text style={s.rowSub}>{match.competition || "Wedstrijd"}</Text>
                          </View>
                          <TouchableOpacity
                            style={s.unfollowBtn}
                            onPress={() => void unfollowMatchAction(match.matchId)}
                          >
                            <Text style={s.unfollowText}>Ontvolgen</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Meldingen ── */}
      {activeTab === "alerts" && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Alert kanalen */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>MELDINGS­KANALEN</Text>
            <View style={s.card}>
              {[
                { label: "Wedstrijd start", enabled: notificationPrefs.matches, icon: "flag-outline" as const },
                { label: "Doelpunten", enabled: notificationPrefs.goals, icon: "football-outline" as const },
                { label: "Opstellingen", enabled: notificationPrefs.lineups, icon: "list-outline" as const },
                { label: "Nieuws", enabled: notificationPrefs.news, icon: "newspaper-outline" as const },
              ].map((item, i) => (
                <React.Fragment key={item.label}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.row}>
                    <View style={s.rowIcon}>
                      <Ionicons name={item.icon} size={16} color={COLORS.accent} />
                    </View>
                    <Text style={[s.rowText, { flex: 1 }]}>{item.label}</Text>
                    <View style={[s.statusDot, { backgroundColor: item.enabled ? COLORS.green : COLORS.textFaint }]} />
                    <Text style={[s.statusLabel, { color: item.enabled ? COLORS.green : COLORS.textMuted }]}>
                      {item.enabled ? "Aan" : "Uit"}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Text style={s.hint}>{alertsEnabledCount} van 4 kanalen actief</Text>
          </View>

          <TouchableOpacity
            style={s.deviceBtn}
            onPress={() => {
              if (Platform.OS === "ios") {
                void Linking.openURL("app-settings:");
              } else {
                void Linking.openSettings();
              }
            }}
            activeOpacity={0.84}
          >
            <Ionicons name="settings-outline" size={17} color={COLORS.accent} />
            <Text style={s.deviceBtnText}>Apparaatinstellingen openen</Text>
            <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Smart alerts */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>SLIMME ALERTS</Text>
            <View style={s.card}>
              {smartAlerts.length === 0 ? (
                <View style={s.inlineEmpty}>
                  <Ionicons name="sparkles-outline" size={20} color={COLORS.textMuted} />
                  <Text style={s.inlineEmptyText}>
                    Nog geen slimme alerts. Zodra er live-events zijn verschijnen ze hier.
                  </Text>
                </View>
              ) : (
                smartAlerts.slice(0, 6).map((alert, i) => (
                  <React.Fragment key={String(alert.id)}>
                    {i > 0 && <View style={s.divider} />}
                    <TouchableOpacity
                      style={s.row}
                      onPress={() =>
                        alert.route
                          ? onNavigate(String(alert.route), alert.params || undefined)
                          : undefined
                      }
                    >
                      <View style={s.rowIcon}>
                        <Ionicons name="flash-outline" size={16} color={COLORS.accent} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={s.rowTitle}>{String(alert.title || "Alert")}</Text>
                        <Text style={s.rowSub}>{String(alert.body || "")}</Text>
                      </View>
                      {alert.priority === "priority" ? (
                        <View style={s.priorityBadge}>
                          <Text style={s.priorityBadgeText}>Prioriteit</Text>
                        </View>
                      ) : (
                        <View style={s.silentBadge}>
                          <Text style={s.silentBadgeText}>Stil</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </React.Fragment>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Recent ── */}
      {activeTab === "recent" && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {recentItems.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIcon}>
                <Ionicons name="time-outline" size={24} color={COLORS.textMuted} />
              </View>
              <Text style={s.emptyTitle}>Geen recente activiteit</Text>
              <Text style={s.emptyBody}>
                Recente wedstrijd­activiteit verschijnt hier.
              </Text>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.sectionTitle}>RECENTE ITEMS</Text>
              <View style={s.card}>
                {recentItems.map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && <View style={s.divider} />}
                    <TouchableOpacity
                      style={s.row}
                      onPress={() =>
                        (item as any).route
                          ? onNavigate(String((item as any).route), (item as any).params || undefined)
                          : undefined
                      }
                    >
                      <View style={s.rowIcon}>
                        <Ionicons name="notifications-outline" size={16} color={COLORS.accent} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={s.rowTitle}>{item.title}</Text>
                        <Text style={s.rowSub}>{item.subtitle}</Text>
                      </View>
                      {(item as any).priority === "priority" ? (
                        <View style={s.priorityBadge}>
                          <Text style={s.priorityBadgeText}>Prioriteit</Text>
                        </View>
                      ) : (
                        <Ionicons name="ellipse" size={8} color={COLORS.accent} />
                      )}
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
    color: COLORS.text,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glass,
  },
  tabActive: {
    borderColor: COLORS.borderGlow,
    backgroundColor: COLORS.accentGlow,
  },
  tabLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.text,
  },

  // Scroll + sections
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  section: {
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 1.8,
    color: COLORS.textMuted,
    marginLeft: 4,
  },

  // Cards
  card: {
    backgroundColor: COLORS.glass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginLeft: 58,
  },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: COLORS.accentGlow,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
  rowSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Status indicator
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    minWidth: 22,
    textAlign: "right",
  },

  // Hint
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 4,
  },

  // Device button
  deviceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.glass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  deviceBtnText: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },

  // Inline empty
  inlineEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  inlineEmptyText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  // Badges
  priorityBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
  },
  priorityBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.accent,
  },
  silentBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  silentBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Unfollow
  unfollowBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  unfollowText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accentGlow,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.text,
  },
  emptyBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
});

