import React, { useMemo, useState } from "react";
import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFollowState } from "@/context/UserStateContext";
import { useOnboardingStore } from "@/store/onboarding-store";

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
  const { followedTeams, followedMatches, unfollowTeamAction, unfollowMatchAction } = useFollowState();
  const notificationPrefs = useOnboardingStore((state) => state.notifications);
  const [activeTab, setActiveTab] = useState<TabKey>("followed");

  const alertsEnabledCount = [notificationPrefs.matches, notificationPrefs.goals, notificationPrefs.lineups, notificationPrefs.news].filter(Boolean).length;

  const recentItems = useMemo(() => {
    return followedMatches
      .slice()
      .sort((a, b) => String(b.startTime || "").localeCompare(String(a.startTime || "")))
      .slice(0, 8)
      .map((match) => ({
        id: String(match.matchId),
        title: `${match.homeTeam} vs ${match.awayTeam}`,
        subtitle: match.competition || "Match alert",
      }));
  }, [followedMatches]);

  const followEmpty = followedTeams.length === 0 && followedMatches.length === 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
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
            <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate("settings")}> 
              <Text style={styles.primaryBtnText}>Open Notification Settings</Text>
            </TouchableOpacity>
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
                <View key={item.id} style={styles.row}>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSub}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="ellipse" size={10} color={P.accent} />
                </View>
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
    paddingVertical: 12,
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
