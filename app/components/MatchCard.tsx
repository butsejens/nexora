import React, { useRef, useState, useEffect } from "react";
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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isLive = match.status === "live";

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, pulseAnim]);

  const leagueLogo = getLeagueLogo(match.league);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      {/* Live glow ring */}
      {isLive && (
        <Animated.View
          style={[
            styles.liveGlowRing,
            { opacity: pulseAnim },
          ]}
        />
      )}
      <TouchableOpacity
        onPress={() => { SafeHaptics.impactMedium(); onPress(); }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <LinearGradient
          colors={[...match.heroGradient] as any}
          style={[styles.card, isLive && styles.cardLive]}
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
          {isLive || match.status === "finished" ? (
            <View style={[styles.scoreCenterBox, isLive && styles.scoreCenterBoxLive]}>
              <Text style={[styles.scoreNum, isLive && styles.scoreNumLive]}>{match.homeScore}</Text>
              <Text style={styles.scoreSep}>:</Text>
              <Text style={[styles.scoreNum, isLive && styles.scoreNumLive]}>{match.awayScore}</Text>
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
          {isLive && (
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
  return (
    <TouchableOpacity
      style={styles.upcomingRow}
      onPress={() => {
        SafeHaptics.selection();
        onPress();
      }}
      activeOpacity={0.75}
    >
      {/* Home team */}
      <View style={styles.upcomingTeamBlock}>
        <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={36} />
        <Text style={styles.upcomingTeamName} numberOfLines={2}>{match.homeTeam}</Text>
      </View>

      {/* Center: score or time */}
      <View style={styles.upcomingCenterBlock}>
        {onToggleNotification ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); SafeHaptics.selection(); onToggleNotification(); }}
            style={[styles.upcomingAlertBtn, notificationsEnabled && styles.alertBtnActive]}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name={notificationsEnabled ? "notifications" : "notifications-outline"} size={12} color={notificationsEnabled ? "#fff" : COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
        {match.status === "live" ? (
          <>
            {match.minute != null && (
              <Text style={styles.upcomingMinute}>{match.minute}{"'"}</Text>
            )}
            <Text style={styles.upcomingScore}>{match.homeScore} - {match.awayScore}</Text>
          </>
        ) : match.status === "finished" ? (
          <>
            <Text style={styles.upcomingFinishedLabel}>EINDE</Text>
            <Text style={styles.upcomingScore}>{match.homeScore} - {match.awayScore}</Text>
          </>
        ) : (
          <View style={styles.upcomingTimeBox}>
            <Ionicons name="time-outline" size={11} color={COLORS.accent} />
            <Text style={styles.upcomingTimeText} numberOfLines={1}>{match.startTime}</Text>
          </View>
        )}
      </View>

      {/* Away team */}
      <View style={styles.upcomingTeamBlock}>
        <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={36} />
        <Text style={styles.upcomingTeamName} numberOfLines={2}>{match.awayTeam}</Text>
      </View>

      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginRight: 14,
    position: "relative",
  },
  liveGlowRing: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: COLORS.live,
    zIndex: 0,
    // @ts-ignore
    shadowColor: COLORS.live,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
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
  cardLive: {
    borderColor: `${COLORS.live}88`,
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
  scoreCenterBoxLive: {
    backgroundColor: "rgba(255,59,48,0.12)",
    borderColor: `${COLORS.live}55`,
  },
  scoreNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
    color: COLORS.text,
  },
  scoreNumLive: {
    color: COLORS.text,
    fontSize: 26,
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
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  upcomingTeamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  upcomingTeamName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 14,
  },
  upcomingCenterBlock: {
    width: 90,
    alignItems: "center",
    gap: 3,
  },
  upcomingScore: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 18,
    color: COLORS.text,
  },
  upcomingMinute: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.live,
  },
  upcomingFinishedLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  upcomingTimeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
  },
  upcomingTimeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: COLORS.accent,
  },
  upcomingAlertBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
});
