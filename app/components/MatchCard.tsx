import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { LiveBadge } from "@/components/LiveBadge";
import { SafeHaptics } from "@/lib/safeHaptics";
import { getInitials, getLeagueLogo, resolveTeamLogoUri } from "@/lib/logo-manager";

export interface Server {
  id: string;
  name: string;
  quality: string;
  url: string;
}

export interface Match {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  homeScore: number;
  awayScore: number;
  status: "live" | "upcoming" | "finished";
  minute?: number;
  startTime?: string;
  servers: Server[];
  sport: string;
  heroGradient: string[];
}

interface Props {
  match: Match;
  onPress: () => void;
}

const SPORT_ICONS: Record<string, string> = {
  football: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  formula1: "car-sports",
};

export function TeamLogo({ uri, teamName, size = 48 }: { uri?: string | null; teamName: string; size?: number }) {
  const [error, setError] = useState(false);
  const safeUri = !error ? resolveTeamLogoUri(teamName, uri) : null;
  const initials = getInitials(teamName, 2);

  if (safeUri) {
    return (
      <View style={[logoStyles.container, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri: safeUri }}
          style={{ width: size - 8, height: size - 8 }}
          resizeMode="contain"
          onError={() => setError(true)}
        />
      </View>
    );
  }
  return (
    <View style={[logoStyles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[logoStyles.initials, { fontSize: size * 0.28 }]}>{initials}</Text>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255,255,255,0.93)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    // @ts-ignore – web uses boxShadow
    boxShadow: "0px 2px 4px rgba(0,0,0,0.2)",
  },
  fallback: {
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  initials: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.text,
  },
});

export function MatchCard({ match, onPress }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const leagueLogo = getLeagueLogo(match.league);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={() => {
          SafeHaptics.impactMedium();
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <LinearGradient
          colors={[...match.heroGradient] as any}
          style={styles.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* League row */}
          <View style={styles.topRow}>
            <View style={styles.leagueRow}>
              {leagueLogo ? (
                <Image source={{ uri: leagueLogo }} style={styles.leagueLogo} resizeMode="contain" />
              ) : (
                <MaterialCommunityIcons
                  name={(SPORT_ICONS[match.sport] || "soccer") as any}
                  size={14}
                  color={COLORS.textMuted}
                />
              )}
              <Text style={styles.league} numberOfLines={1}>{match.league}</Text>
            </View>
            {match.status === "live" && <LiveBadge minute={match.minute} small />}
          </View>

          {/* Score row */}
          <View style={styles.scoreRow}>
            <View style={styles.teamBlock}>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={52} />
              <Text style={styles.team} numberOfLines={2}>{match.homeTeam}</Text>
            </View>

            {match.status === "live" || match.status === "finished" ? (
              <View style={styles.scoreBox}>
                <Text style={styles.score}>{match.homeScore}</Text>
                <Text style={styles.scoreDash}>:</Text>
                <Text style={styles.score}>{match.awayScore}</Text>
              </View>
            ) : (
              <View style={styles.timeBox}>
                <Ionicons name="time-outline" size={12} color={COLORS.accent} />
                <Text style={styles.timeText}>{match.startTime}</Text>
              </View>
            )}

            <View style={styles.teamBlock}>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={52} />
              <Text style={styles.team} numberOfLines={2}>{match.awayTeam}</Text>
            </View>
          </View>

        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function UpcomingMatchRow({ match, onPress }: { match: Match; onPress: () => void }) {
  const SPORT_ICON = SPORT_ICONS[match.sport] || "soccer";
  const leagueLogo = getLeagueLogo(match.league);
  return (
    <TouchableOpacity
      style={styles.upcomingRow}
      onPress={() => {
        SafeHaptics.selection();
        onPress();
      }}
      activeOpacity={0.75}
    >
      <View style={styles.upcomingLeft}>
        <View style={styles.upcomingLogos}>
          <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={32} />
          <View style={styles.vsCircle}><Text style={styles.vsText}>vs</Text></View>
          <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={32} />
        </View>
        <View style={styles.upcomingInfo}>
          <View style={styles.upcomingLeagueRow}>
            {leagueLogo ? (
              <Image source={{ uri: leagueLogo }} style={styles.upcomingLeagueLogo} resizeMode="contain" />
            ) : (
              <MaterialCommunityIcons name={SPORT_ICON as any} size={11} color={COLORS.textMuted} />
            )}
            <Text style={styles.upcomingLeague}>{match.league}</Text>
          </View>
          <Text style={styles.upcomingTeams} numberOfLines={1}>
            {match.homeTeam} · {match.awayTeam}
          </Text>
        </View>
      </View>
      <View style={styles.upcomingRight}>
        <Text style={styles.upcomingTime}>
          {match.status === "finished"
            ? `${match.homeScore} - ${match.awayScore}`
            : match.status === "live"
              ? (match.minute != null ? `${match.minute}'` : "LIVE")
              : match.startTime}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginRight: 14,
  },
  card: {
    width: 300,
    borderRadius: 22,
    padding: 16,
    gap: 14,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  leagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  leagueLogo: {
    width: 18,
    height: 18,
  },
  league: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    flex: 1,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  teamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  team: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 16,
  },
  scoreBox: {
    backgroundColor: COLORS.overlay,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  score: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
    color: COLORS.text,
  },
  scoreDash: {
    fontFamily: "Inter_400Regular",
    fontSize: 20,
    color: COLORS.textMuted,
  },
  timeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
  },
  timeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.accent,
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.cardElevated,
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  upcomingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  upcomingLogos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  vsCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vsText: {
    fontFamily: "Inter_700Bold",
    fontSize: 7,
    color: COLORS.textMuted,
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  upcomingLeagueLogo: {
    width: 12,
    height: 12,
  },
  upcomingLeague: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  upcomingTeams: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },
  upcomingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  upcomingTime: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.accent,
  },
});
