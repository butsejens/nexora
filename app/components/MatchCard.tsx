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
  onToggleNotification?: () => void;
  notificationsEnabled?: boolean;
}

const SPORT_ICONS: Record<string, string> = {
  football: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  formula1: "car-sports",
};

export function TeamLogo({ uri, teamName, size = 48 }: { uri?: string | null; teamName: string; size?: number }) {
  const [error, setError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const resolved = !error ? resolveTeamLogoUri(teamName, uri) : null;
  const initials = getInitials(teamName, 2);

  // Support both local require (number) and remote URI (string)
  const imageSource = resolved != null
    ? (typeof resolved === "number" ? resolved : { uri: resolved as string })
    : null;

  return (
    <View style={[
      imageSource ? logoStyles.container : logoStyles.fallback,
      { width: size, height: size, borderRadius: size / 2 },
    ]}>
      <Text style={[logoStyles.initials, { fontSize: size * 0.28 }, imageLoaded && { opacity: 0 }]}>{initials}</Text>
      {imageSource ? (
        <Image
          source={imageSource as any}
          style={{ width: size - 8, height: size - 8, position: "absolute" }}
          resizeMode="contain"
          onLoad={() => setImageLoaded(true)}
          onError={() => { setError(true); setImageLoaded(false); }}
        />
      ) : null}
    </View>
  );
}

const logoStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
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

export function MatchCard({ match, onPress, onToggleNotification, notificationsEnabled }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const leagueLogo = getLeagueLogo(match.league);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={() => { SafeHaptics.impactMedium(); onPress(); }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <LinearGradient
          colors={[...match.heroGradient] as any}
          style={styles.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          {/* League header */}
          <View style={styles.leagueHeaderRow}>
            <View style={styles.leagueLeft}>
              {leagueLogo ? (
                <Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }} style={styles.leagueLogo} resizeMode="contain" />
              ) : (
                <MaterialCommunityIcons name={(SPORT_ICONS[match.sport] || "soccer") as any} size={13} color={COLORS.textMuted} />
              )}
              <Text style={styles.league} numberOfLines={1}>{match.league}</Text>
            </View>
            {onToggleNotification ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); SafeHaptics.selection(); onToggleNotification(); }}
                style={[styles.alertBtn, notificationsEnabled && styles.alertBtnActive]}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Ionicons
                  name={notificationsEnabled ? "notifications" : "notifications-outline"}
                  size={13}
                  color={notificationsEnabled ? "#fff" : COLORS.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Home team */}
          <View style={styles.teamSection}>
            <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={50} />
            <Text style={styles.teamName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{match.homeTeam}</Text>
          </View>

          {/* Score / time center */}
          {match.status === "live" || match.status === "finished" ? (
            <View style={styles.scoreCenterBox}>
              <Text style={styles.scoreNum}>{match.homeScore}</Text>
              <Text style={styles.scoreSep}>:</Text>
              <Text style={styles.scoreNum}>{match.awayScore}</Text>
            </View>
          ) : (
            <View style={styles.timeCenterBox}>
              <Ionicons name="time-outline" size={11} color={COLORS.accent} />
              <Text style={styles.timeCenterText} numberOfLines={1}>{match.startTime}</Text>
            </View>
          )}

          {/* Away team */}
          <View style={styles.teamSection}>
            <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={50} />
            <Text style={styles.teamName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{match.awayTeam}</Text>
          </View>

          {/* Live badge */}
          {match.status === "live" && (
            <View style={styles.liveBadgeRow}>
              <LiveBadge minute={match.minute} small />
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function UpcomingMatchRow({
  match,
  onPress,
  onToggleNotification,
  notificationsEnabled,
}: {
  match: Match;
  onPress: () => void;
  onToggleNotification?: () => void;
  notificationsEnabled?: boolean;
}) {
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
              <Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }} style={styles.upcomingLeagueLogo} resizeMode="contain" />
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
        {onToggleNotification ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              SafeHaptics.selection();
              onToggleNotification();
            }}
            style={[styles.upcomingAlertBtn, notificationsEnabled && styles.alertBtnActive]}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons
              name={notificationsEnabled ? "notifications" : "notifications-outline"}
              size={14}
              color={notificationsEnabled ? "#fff" : COLORS.textMuted}
            />
          </TouchableOpacity>
        ) : null}
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
    width: 160,
    height: 300,
    borderRadius: 22,
    padding: 12,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    justifyContent: "space-between",
  },
  leagueHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leagueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  leagueLogo: {
    width: 16,
    height: 16,
  },
  league: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.2,
    flex: 1,
  },
  alertBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  teamSection: {
    alignItems: "center",
    gap: 6,
  },
  teamName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 15,
  },
  scoreCenterBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.overlay,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "center",
  },
  scoreNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
    color: COLORS.text,
  },
  scoreSep: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: COLORS.textMuted,
  },
  timeCenterBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
    alignSelf: "center",
  },
  timeCenterText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: COLORS.accent,
  },
  liveBadgeRow: {
    alignItems: "center",
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
    width: 16,
    height: 16,
  },
  upcomingLeague: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
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
  upcomingAlertBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  upcomingTime: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.accent,
  },
});
