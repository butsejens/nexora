/**
 * Nexora – Follow & Notification Center
 *
 * Shows all sports follows in one place:
 *   - Followed teams (with unfollow)
 *   - Followed matches (with notification toggle)
 * Backed by UserStateContext (AsyncStorage-persisted).
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { SPACING } from "@/constants/design-system";
import { useFollowState } from "@/context/UserStateContext";
import { TeamLogo } from "@/components/TeamLogo";
import { getLeagueLogo, resolveTeamLogoUri } from "@/lib/logo-manager";
import type { FollowedTeam, FollowedMatch } from "@/lib/domain/models";

// ── Palette ────────────────────────────────────────────────────────────────────
const P = {
  bg:       "#09090D",
  card:     "#12121A",
  elevated: "#1C1C28",
  accent:   "#E50914",
  live:     "#FF3040",
  text:     "#FFFFFF",
  muted:    "#9D9DAA",
  border:   "rgba(255,255,255,0.08)",
};

// ── Header ─────────────────────────────────────────────────────────────────────
function ScreenHeader({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[hdr.container, { paddingTop: (Platform.OS === "web" ? 0 : insets.top) + 6 }]}>
      <TouchableOpacity onPress={onBack} style={hdr.backBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={22} color={P.text} />
      </TouchableOpacity>
      <View style={hdr.titleWrap}>
        <Ionicons name="notifications" size={18} color={P.accent} />
        <Text style={hdr.title}>Follows & Notifications</Text>
      </View>
      <View style={{ width: 40 }} />
    </View>
  );
}
const hdr = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
    backgroundColor: P.bg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: P.elevated,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: P.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
});

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHead({ icon, title, count }: { icon: string; title: string; count: number }) {
  return (
    <View style={sec.row}>
      <View style={sec.accentBar} />
      <Ionicons name={icon as any} size={15} color={P.accent} />
      <Text style={sec.title}>{title}</Text>
      {count > 0 && (
        <View style={sec.badge}>
          <Text style={sec.badgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}
const sec = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 28,
    marginBottom: 12,
  },
  accentBar: { width: 3, height: 18, backgroundColor: P.accent, borderRadius: 2 },
  title: { color: P.text, fontSize: 17, fontFamily: "Inter_800ExtraBold", flex: 1 },
  badge: {
    backgroundColor: "rgba(229,9,20,0.15)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.30)",
  },
  badgeText: { color: P.accent, fontSize: 11, fontFamily: "Inter_700Bold" },
});

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <LinearGradient
      colors={["rgba(255,255,255,0.04)", "rgba(255,255,255,0.02)"]}
      style={emp.wrap}
    >
      <Ionicons name={icon as any} size={24} color={P.muted} />
      <Text style={emp.text}>{message}</Text>
    </LinearGradient>
  );
}
const emp = StyleSheet.create({
  wrap: {
    marginHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.border,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  text: { color: P.muted, fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 19 },
});

// ── Followed team row ──────────────────────────────────────────────────────────
function FollowedTeamRow({
  team,
  onUnfollow,
  onPress,
}: {
  team: FollowedTeam;
  onUnfollow: (teamId: string) => void;
  onPress: (team: FollowedTeam) => void;
}) {
  const logo = team.logo || resolveTeamLogoUri(team.teamName, team.competition || undefined);
  return (
    <View style={row.wrap}>
      <TouchableOpacity style={row.main} activeOpacity={0.82} onPress={() => onPress(team)}>
        <TeamLogo
          uri={typeof logo === "string" ? logo : undefined}
          resolvedLogo={logo}
          teamName={team.teamName}
          size={40}
        />
        <View style={row.info}>
          <Text style={row.name} numberOfLines={1}>{team.teamName}</Text>
          {team.competition ? (
            <Text style={row.sub} numberOfLines={1}>{team.competition}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={row.unfollowBtn}
        onPress={() => onUnfollow(team.teamId)}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={15} color={P.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ── Followed match row ─────────────────────────────────────────────────────────
function FollowedMatchRow({
  match,
  onUnfollow,
  onPress,
}: {
  match: FollowedMatch;
  onUnfollow: (matchId: string) => void;
  onPress: (match: FollowedMatch) => void;
}) {
  const compLogo = match.competition ? getLeagueLogo(match.competition) : null;
  const startLabel = match.startTime
    ? (() => {
        try {
          const d = new Date(match.startTime);
          if (!Number.isFinite(d.getTime())) return match.startTime;
          return new Intl.DateTimeFormat("nl-BE", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(d);
        } catch {
          return match.startTime;
        }
      })()
    : null;

  return (
    <View style={row.wrap}>
      <TouchableOpacity style={row.main} activeOpacity={0.82} onPress={() => onPress(match)}>
        {compLogo ? (
          <Image
            source={typeof compLogo === "number" ? compLogo : { uri: compLogo as string }}
            style={row.compLogo}
            resizeMode="contain"
          />
        ) : (
          <View style={row.compLogoFallback}>
            <Ionicons name="football-outline" size={18} color={P.muted} />
          </View>
        )}
        <View style={row.info}>
          <Text style={row.name} numberOfLines={1}>
            {match.homeTeam} vs {match.awayTeam}
          </Text>
          <Text style={row.sub} numberOfLines={1}>
            {[match.competition, startLabel].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {match.notificationsEnabled && (
          <View style={row.notifBadge}>
            <Ionicons name="notifications" size={12} color={P.accent} />
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={row.unfollowBtn}
        onPress={() => onUnfollow(match.matchId)}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={15} color={P.muted} />
      </TouchableOpacity>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginBottom: 8,
    backgroundColor: P.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    overflow: "hidden",
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  info: { flex: 1 },
  name: {
    color: P.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  sub: {
    color: P.muted,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    lineHeight: 16,
  },
  unfollowBtn: {
    width: 38,
    height: "100%" as any,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: P.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  compLogo: {
    width: 36,
    height: 36,
  },
  compLogoFallback: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: P.card,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(229,9,20,0.15)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
});

// ── Main screen ────────────────────────────────────────────────────────────────
export default function FollowCenterScreen() {
  const insets = useSafeAreaInsets();
  const {
    followedTeams,
    followedMatches,
    unfollowTeamAction,
    unfollowMatchAction,
  } = useFollowState();

  const handleUnfollowTeam = useCallback(
    (teamId: string) => {
      Alert.alert(
        "Unfollow team",
        "Remove this team from your follows?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unfollow",
            style: "destructive",
            onPress: () => void unfollowTeamAction(teamId),
          },
        ],
      );
    },
    [unfollowTeamAction],
  );

  const handleUnfollowMatch = useCallback(
    (matchId: string) => {
      Alert.alert(
        "Unfollow match",
        "Remove this match from your follows?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unfollow",
            style: "destructive",
            onPress: () => void unfollowMatchAction(matchId),
          },
        ],
      );
    },
    [unfollowMatchAction],
  );

  const handleTeamPress = useCallback((team: FollowedTeam) => {
    router.push({
      pathname: "/team-detail",
      params: { teamName: team.teamName, teamId: team.teamId },
    });
  }, []);

  const handleMatchPress = useCallback((match: FollowedMatch) => {
    router.push({
      pathname: "/match-detail",
      params: {
        matchId: match.matchId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.competition || "",
      },
    });
  }, []);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 80;

  return (
    <View style={styles.container}>
      <ScreenHeader onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Followed Teams ── */}
        <SectionHead
          icon="people"
          title="Followed Teams"
          count={followedTeams.length}
        />
        {followedTeams.length === 0 ? (
          <EmptyState
            icon="people-outline"
            message={"No followed teams yet.\nTap the follow button on a team page to add them here."}
          />
        ) : (
          followedTeams.map((team) => (
            <FollowedTeamRow
              key={team.teamId}
              team={team}
              onUnfollow={handleUnfollowTeam}
              onPress={handleTeamPress}
            />
          ))
        )}

        {/* ── Followed Matches ── */}
        <SectionHead
          icon="football"
          title="Followed Matches"
          count={followedMatches.length}
        />
        {followedMatches.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            message={"No followed matches yet.\nTap the bell on a match to get score notifications."}
          />
        ) : (
          followedMatches.map((match) => (
            <FollowedMatchRow
              key={match.matchId}
              match={match}
              onUnfollow={handleUnfollowMatch}
              onPress={handleMatchPress}
            />
          ))
        )}

        {/* ── Tip ── */}
        {followedTeams.length === 0 && followedMatches.length === 0 && (
          <View style={styles.tip}>
            <Ionicons name="bulb-outline" size={14} color={P.muted} />
            <Text style={styles.tipText}>
              Follow teams from the team page, or tap the bell icon on any match to receive live score updates.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  content: { paddingTop: 4 },
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 18,
    marginTop: 24,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.elevated,
  },
  tipText: {
    flex: 1,
    color: P.muted,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
});
