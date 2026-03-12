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
            <Text
              style={styles.teamName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              ellipsizeMode="tail"
            >
              {match.homeTeam}
            </Text>
            <View style={styles.teamLogoWrap}>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={52} />
            </View>
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
            <Text
              style={styles.teamName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              ellipsizeMode="tail"
            >
              {match.awayTeam}
            </Text>
            <View style={styles.teamLogoWrap}>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={52} />
            </View>
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
            ? (["#1c0a0a", "#150808", "#100808"] as const)
            : isFinished
            ? (["#0f0f13", "#0c0c10", "#0a0a0e"] as const)
            : (["#131318", "#0f0f14", "#0d0d12"] as const)
        }
        style={styles.rowGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
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
            <Text style={styles.rowTeamName} numberOfLines={2}>
              {match.homeTeam}
            </Text>
            <TeamLogo
              uri={match.homeTeamLogo}
              teamName={match.homeTeam}
              size={56}
            />
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
          <View style={[styles.rowTeamBlock, styles.rowTeamBlockAway]}>
            <Text style={[styles.rowTeamName, styles.rowTeamNameAway]} numberOfLines={2}>
              {match.awayTeam}
            </Text>
            <TeamLogo
              uri={match.awayTeamLogo}
              teamName={match.awayTeam}
              size={56}
            />
          </View>
        </View>

        {/* Bottom action strip */}
        <View style={styles.rowActionStrip}>
          <Text style={styles.rowActionText}>
            {isLive
              ? "Bekijk live wedstrijd"
              : isFinished
              ? "Bekijk samenvatting"
              : "Wedstrijddetails"}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={13}
            color="rgba(255,255,255,0.35)"
          />
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
    shadowRadius: 12,
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
    marginBottom: 10,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    // @ts-ignore
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  rowOuterLive: {
    borderColor: `${COLORS.live}44`,
    // @ts-ignore
    shadowColor: COLORS.live,
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  rowOuterFinished: {
    borderColor: "rgba(255,255,255,0.04)",
    opacity: 0.85,
  },
  rowGrad: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: 20,
    gap: 14,
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
    width: 24,
    height: 24,
    borderRadius: 12,
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
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  rowTeamBlockAway: {
    alignItems: "flex-end",
  },
  rowTeamName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 17,
  },
  rowTeamNameAway: {
    textAlign: "right",
  },
  rowCenterBlock: {
    width: 96,
    alignItems: "center",
    gap: 4,
  },
  rowScoreBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowScoreBoxLive: {
    backgroundColor: "rgba(255,48,64,0.16)",
    borderColor: `${COLORS.live}55`,
  },
  rowScore: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  rowVsText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 3,
  },
  rowActionStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  rowActionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.2,
  },
});
