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

// ── TeamLogo ─────────────────────────────────────────────────────────────────

export const TeamLogo = React.memo(function TeamLogo({
  uri,
  teamName,
  size = 48,
}: {
  uri?: string | null;
  teamName: string;
  size?: number;
}) {
  const [error, setError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const resolved = !error ? resolveTeamLogoUri(teamName, uri) : null;
  const initials = getInitials(teamName, 2);

  const imageSource =
    resolved != null
      ? typeof resolved === "number"
        ? resolved
        : { uri: resolved as string }
      : null;

  return (
    <View
      style={[
        logoStyles.container,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text
        style={[
          logoStyles.initials,
          { fontSize: size * 0.28 },
          imageLoaded && { opacity: 0 },
        ]}
      >
        {initials}
      </Text>
      {imageSource ? (
        <Image
          source={imageSource as any}
          style={{ width: size - 10, height: size - 10, position: "absolute" }}
          resizeMode="contain"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setError(true);
            setImageLoaded(false);
          }}
        />
      ) : null}
    </View>
  );
});

const logoStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  initials: {
    fontFamily: "Inter_800ExtraBold",
    color: COLORS.textMuted,
  },
});

// ── MatchCard (vertical carousel card) ───────────────────────────────────────

export const MatchCard = React.memo(function MatchCard({
  match,
  onPress,
  onToggleNotification,
  notificationsEnabled,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isLive = match.status === "live";

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, pulseAnim]);

  const leagueLogo = getLeagueLogo(match.league);

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}
    >
      {/* Live glow aura */}
      {isLive && (
        <Animated.View
          style={[styles.liveGlowRing, { opacity: pulseAnim }]}
        />
      )}
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
          style={[styles.card, isLive && styles.cardLive]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.3, y: 1 }}
        >
          {/* League header */}
          <View style={styles.leagueHeaderRow}>
            <View style={styles.leagueLeft}>
              {leagueLogo ? (
                <View style={styles.leagueLogoCircle}>
                  <Image
                    source={
                      typeof leagueLogo === "number"
                        ? leagueLogo
                        : { uri: leagueLogo as string }
                    }
                    style={styles.leagueLogo}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={styles.leagueLogoCircle}>
                  <MaterialCommunityIcons
                    name={(SPORT_ICONS[match.sport] || "soccer") as any}
                    size={12}
                    color={COLORS.textMuted}
                  />
                </View>
              )}
              <Text style={styles.league} numberOfLines={1}>
                {match.league}
              </Text>
            </View>
            {onToggleNotification ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  SafeHaptics.selection();
                  onToggleNotification();
                }}
                style={[
                  styles.alertBtn,
                  notificationsEnabled && styles.alertBtnActive,
                ]}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Ionicons
                  name={
                    notificationsEnabled ? "notifications" : "notifications-outline"
                  }
                  size={12}
                  color={notificationsEnabled ? "#fff" : COLORS.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Home team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoWrap}>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={52} />
            </View>
            <Text
              style={styles.teamName}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {match.homeTeam}
            </Text>
          </View>

          {/* Score / time center */}
          {isLive || match.status === "finished" ? (
            <View
              style={[
                styles.scoreCenterBox,
                isLive && styles.scoreCenterBoxLive,
              ]}
            >
              <Text style={[styles.scoreNum, isLive && styles.scoreNumLive]}>
                {match.homeScore}
              </Text>
              <Text style={styles.scoreSep}>—</Text>
              <Text style={[styles.scoreNum, isLive && styles.scoreNumLive]}>
                {match.awayScore}
              </Text>
            </View>
          ) : (
            <View style={styles.timeCenterBox}>
              <Ionicons name="time-outline" size={10} color={COLORS.accent} />
              <Text style={styles.timeCenterText} numberOfLines={1}>
                {match.startTime}
              </Text>
            </View>
          )}

          {/* Away team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoWrap}>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={52} />
            </View>
            <Text
              style={styles.teamName}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {match.awayTeam}
            </Text>
          </View>

          {/* Live badge */}
          {isLive && (
            <View style={styles.liveBadgeRow}>
              <LiveBadge minute={match.minute} small />
            </View>
          )}
          {match.status === "finished" && (
            <View style={styles.liveBadgeRow}>
              <View style={styles.finishedChip}>
                <Text style={styles.finishedChipText}>FT</Text>
              </View>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── UpcomingMatchRow (full-width list card) ───────────────────────────────────

export const UpcomingMatchRow = React.memo(function UpcomingMatchRow({
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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const leagueLogo = getLeagueLogo(match.league);
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  useEffect(() => {
    if (!isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, pulseAnim]);

  return (
    <TouchableOpacity
      onPress={() => {
        SafeHaptics.selection();
        onPress();
      }}
      activeOpacity={0.88}
      style={[
        styles.rowOuter,
        isLive && styles.rowOuterLive,
        isFinished && styles.rowOuterFinished,
      ]}
    >
      <LinearGradient
        colors={
          isLive
            ? (["#1F0A0A", "#160606", "#110505"] as const)
            : isFinished
            ? (["#111115", "#0D0D11", "#0B0B0F"] as const)
            : (["#141420", "#0F0F1A", "#0D0D17"] as const)
        }
        style={styles.rowGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Live left-edge accent stripe */}
        {isLive && <View style={styles.liveEdgeStripe} />}
        {/* Top bar: league + status + notification */}
        <View style={styles.rowTopBar}>
          <View style={styles.rowLeagueLeft}>
            {leagueLogo ? (
              <View style={styles.rowLeagueBadge}>
                <Image
                  source={
                    typeof leagueLogo === "number"
                      ? leagueLogo
                      : { uri: leagueLogo as string }
                  }
                  style={styles.rowLeagueImg}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={[styles.rowLeagueBadge, styles.rowLeagueDotFallback]}>
                <View style={styles.rowLeagueDot} />
              </View>
            )}
            <Text style={styles.rowLeagueName} numberOfLines={1}>
              {match.league.toUpperCase()}
            </Text>
          </View>

          <View style={styles.rowTopRight}>
            {isLive ? (
              <View style={styles.liveChip}>
                <Animated.View
                  style={[styles.liveDotSmall, { opacity: pulseAnim }]}
                />
                <Text style={styles.liveChipText}>
                  LIVE{match.minute != null ? ` ${match.minute}'` : ""}
                </Text>
              </View>
            ) : isFinished ? (
              <View style={styles.finishedChipRow}>
                <Text style={styles.finishedRowText}>AFGELOPEN</Text>
              </View>
            ) : match.startTime ? (
              <View style={styles.timeChip}>
                <Ionicons
                  name="time-outline"
                  size={10}
                  color={COLORS.accent}
                />
                <Text style={styles.timeChipText}>{match.startTime}</Text>
              </View>
            ) : null}
            {onToggleNotification ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  SafeHaptics.selection();
                  onToggleNotification();
                }}
                style={[
                  styles.rowAlertBtn,
                  notificationsEnabled && styles.rowAlertBtnActive,
                ]}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons
                  name={
                    notificationsEnabled
                      ? "notifications"
                      : "notifications-outline"
                  }
                  size={13}
                  color={notificationsEnabled ? "#fff" : COLORS.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Teams + Score row */}
        <View style={styles.rowTeamsSection}>
          {/* Home */}
          <View style={styles.rowTeamBlock}>
            <TeamLogo
              uri={match.homeTeamLogo}
              teamName={match.homeTeam}
              size={64}
            />
            <Text style={styles.rowTeamName} numberOfLines={2}>
              {match.homeTeam}
            </Text>
          </View>

          {/* Center: score or VS */}
          <View style={styles.rowCenterBlock}>
            {isLive || isFinished ? (
              <>
                <View
                  style={[
                    styles.rowScoreBox,
                    isLive && styles.rowScoreBoxLive,
                  ]}
                >
                  <Text
                    style={[
                      styles.rowScore,
                      isLive && styles.rowScoreLive,
                    ]}
                  >
                    {match.homeScore}
                  </Text>
                  <Text style={styles.rowScoreSep}>
                    {isLive ? "·" : "-"}
                  </Text>
                  <Text
                    style={[
                      styles.rowScore,
                      isLive && styles.rowScoreLive,
                    ]}
                  >
                    {match.awayScore}
                  </Text>
                </View>
                {isFinished && (
                  <Text style={styles.fullTimeLabel}>FULL TIME</Text>
                )}
              </>
            ) : (
              <View style={styles.rowVsBox}>
                <Text style={styles.rowVsText}>VS</Text>
              </View>
            )}
          </View>

          {/* Away */}
          <View style={styles.rowTeamBlock}>
            <TeamLogo
              uri={match.awayTeamLogo}
              teamName={match.awayTeam}
              size={64}
            />
            <Text style={styles.rowTeamName} numberOfLines={2}>
              {match.awayTeam}
            </Text>
          </View>
        </View>

      </LinearGradient>
    </TouchableOpacity>
  );
});

// ── StyleSheet ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ─ MatchCard ─────────────────────────────────────────────────────────────
  wrapper: {
    marginRight: 14,
    position: "relative",
  },
  liveGlowRing: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLORS.live,
    zIndex: 0,
    // @ts-ignore
    shadowColor: COLORS.live,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  card: {
    width: 164,
    height: 308,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "space-between",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  cardLive: {
    borderColor: `${COLORS.live}66`,
  },
  leagueHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leagueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  leagueLogoCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  leagueLogo: {
    width: 14,
    height: 14,
  },
  league: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    flex: 1,
  },
  alertBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  alertBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  teamSection: {
    alignItems: "center",
    gap: 8,
  },
  teamLogoWrap: {
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
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
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignSelf: "center",
  },
  scoreCenterBoxLive: {
    backgroundColor: "rgba(255,48,64,0.14)",
    borderColor: `${COLORS.live}55`,
  },
  scoreNum: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 26,
    color: COLORS.text,
  },
  scoreNumLive: {
    color: "#fff",
    // @ts-ignore
    textShadowColor: COLORS.live,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  scoreSep: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
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
  finishedChip: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  finishedChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1,
  },

  // ─ UpcomingMatchRow ─────────────────────────────────────────────────────
  rowOuter: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  rowOuterLive: {
    borderColor: `${COLORS.live}55`,
    // @ts-ignore
    shadowColor: COLORS.live,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  rowOuterFinished: {
    borderColor: "rgba(255,255,255,0.04)",
    opacity: 0.82,
  },
  rowGrad: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 22,
    gap: 16,
  },
  rowTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeagueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  rowLeagueBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  rowLeagueDotFallback: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  rowLeagueImg: {
    width: 16,
    height: 16,
  },
  rowLeagueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  rowLeagueName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    flex: 1,
  },
  rowTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,48,64,0.16)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${COLORS.live}55`,
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.live,
  },
  liveChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.live,
    letterSpacing: 0.6,
  },
  finishedChipRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  finishedRowText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${COLORS.accent}44`,
  },
  timeChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  rowAlertBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowAlertBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  rowTeamsSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTeamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 10,
  },
  rowTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 17,
  },
  rowCenterBlock: {
    width: 108,
    alignItems: "center",
    gap: 4,
  },
  liveEdgeStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS.live,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  rowScoreBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  rowScoreBoxLive: {
    backgroundColor: "rgba(255,48,64,0.22)",
    borderColor: "rgba(255,48,64,0.5)",
  },
  rowScore: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 34,
    color: COLORS.text,
    minWidth: 24,
    textAlign: "center",
  },
  rowScoreLive: {
    color: "#fff",
    // @ts-ignore
    textShadowColor: COLORS.live,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  rowScoreSep: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: "rgba(255,255,255,0.3)",
    marginHorizontal: 2,
  },
  fullTimeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 2,
  },
  rowVsBox: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowVsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 3,
  },
});
