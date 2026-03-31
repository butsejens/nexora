/**
 * SportCards.tsx — Premium Match Card Components
 * ════════════════════════════════════════════════════════════════════════════════
 * LiveMatchCard     — Real-time match: logo | glowing score | logo
 * UpcomingMatchCard — Future match: logo | kickoff badge | logo
 * FinishedMatchCard — Completed: logo | FT score | logo (winner highlight)
 * SkeletonMatchCard — Animated loading skeleton
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TeamLogo } from "@/components/TeamLogo";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { calculateMomentum } from "@/lib/ai/momentum-calculator";
import { MomentumBar } from "@/components/sports/MomentumBar";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — aligned with films/series premium theme
// ═══════════════════════════════════════════════════════════════════════════════

const DS = {
  bg:         "#050505",
  card:       "#0B0F1A",
  elevated:   "#12192A",
  cardBright: "#1A2338",
  accent:     "#E50914",
  accentGlow: "rgba(229,9,20,0.18)",
  live:       "#22C55E",
  liveGlow:   "rgba(34,197,94,0.18)",
  text:       "#FFFFFF",
  textSec:    "#A1A1AA",
  muted:      "#71717A",
  faint:      "#3F3F46",
  border:     "#1F2937",
  borderSoft: "rgba(255,255,255,0.06)",
};

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ═══════════════════════════════════════════════════════════════════════════════

export function SkeletonMatchCard() {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.75, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3,  duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.row}>
        <View style={sk.teamBlock}>
          <View style={sk.logo} />
          <View style={sk.name} />
        </View>
        <View style={sk.scoreBlock}>
          <View style={sk.badge} />
          <View style={sk.score} />
          <View style={sk.badgeSmall} />
        </View>
        <View style={sk.teamBlock}>
          <View style={sk.logo} />
          <View style={sk.name} />
        </View>
      </View>
      <View style={sk.bar} />
    </Animated.View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: DS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DS.border,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamBlock: { flex: 1, alignItems: "center", gap: 8 },
  logo: { width: 48, height: 48, borderRadius: 24, backgroundColor: DS.cardBright },
  name: { width: 56, height: 8, borderRadius: 4, backgroundColor: DS.cardBright },
  scoreBlock: { alignItems: "center", gap: 6, minWidth: 90 },
  badge: { width: 52, height: 16, borderRadius: 8, backgroundColor: DS.cardBright },
  badgeSmall: { width: 36, height: 8, borderRadius: 4, backgroundColor: DS.cardBright },
  score: { width: 72, height: 30, borderRadius: 6, backgroundColor: DS.cardBright },
  bar: { height: 5, borderRadius: 3, backgroundColor: DS.cardBright },
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE MATCH CARD
// ═══════════════════════════════════════════════════════════════════════════════

type LiveMatchCardProps = {
  match: any;
  onPress?: () => void;
};

export function LiveMatchCard({ match, onPress }: LiveMatchCardProps) {
  const leagueLogo = resolveCompetitionBrand({
    name: match?.league || "",
    espnLeague: match?.espnLeague || null,
  }).logo;

  const homeScore = match?.homeScore ?? "–";
  const awayScore = match?.awayScore ?? "–";
  const minute = match?.minute ? `${match.minute}'` : "LIVE";

  const momentum = calculateMomentum({
    homeStats: match?.homeStats || {
      possession: match?.possession?.home,
      shotsOnTarget: match?.shotsOnGoal?.home,
      attacks: match?.attacks?.home,
      xg: match?.xg?.home,
    },
    awayStats: match?.awayStats || {
      possession: match?.possession?.away,
      shotsOnTarget: match?.shotsOnGoal?.away,
      attacks: match?.attacks?.away,
      xg: match?.xg?.away,
    },
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.84} style={lc.wrap}>
      <LinearGradient
        colors={["#150A0D", "#0C0F1C", "#090D18"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={lc.card}
      >
        {/* Green live strip across the top */}
        <View style={lc.liveStrip} />

        {/* Header: live pill + minute + league logo */}
        <View style={lc.headerRow}>
          <View style={lc.livePill}>
            <View style={lc.liveDot} />
            <Text style={lc.livePillText}>{minute}</Text>
          </View>
          {leagueLogo ? (
            <Image
              source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
              style={lc.leagueLogo}
              resizeMode="contain"
            />
          ) : null}
        </View>

        {/* Teams + Score */}
        <View style={lc.teamsRow}>
          {/* Home */}
          <View style={lc.teamCol}>
            <View style={lc.logoRing}>
              <TeamLogo uri={match?.homeTeamLogo} teamName={match?.homeTeam || ""} size={50} />
            </View>
            <Text style={lc.teamName} numberOfLines={1}>{match?.homeTeam || ""}</Text>
          </View>

          {/* Score centre with glow */}
          <View style={lc.scoreCol}>
            <View style={lc.scoreGlow} />
            <Text style={lc.scoreText}>
              {homeScore}
              <Text style={lc.scoreSep}> : </Text>
              {awayScore}
            </Text>
          </View>

          {/* Away */}
          <View style={lc.teamCol}>
            <View style={lc.logoRing}>
              <TeamLogo uri={match?.awayTeamLogo} teamName={match?.awayTeam || ""} size={50} />
            </View>
            <Text style={lc.teamName} numberOfLines={1}>{match?.awayTeam || ""}</Text>
          </View>
        </View>

        {/* Momentum bar */}
        <MomentumBar
          model={momentum}
          compact
          homeLabel={String(match?.homeTeam || "HOM").slice(0, 3).toUpperCase()}
          awayLabel={String(match?.awayTeam || "AWY").slice(0, 3).toUpperCase()}
        />

        {match?.stadium ? (
          <Text style={lc.stadiumText} numberOfLines={1}>{match.stadium}</Text>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const lc = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    shadowColor: "#E50914",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.28)",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
    overflow: "hidden",
  },
  liveStrip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: "#22C55E",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34,197,94,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  livePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#22C55E",
    letterSpacing: 1,
    fontFamily: "Inter_800ExtraBold",
  },
  leagueLogo: { width: 22, height: 22, opacity: 0.75 },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamCol: { flex: 1, alignItems: "center", gap: 7 },
  logoRing: {
    padding: 3,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  teamName: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.textSec,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    maxWidth: 80,
  },
  scoreCol: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
    position: "relative",
  },
  scoreGlow: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(229,9,20,0.10)",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -45 }, { translateY: -22 }],
  },
  scoreText: {
    fontSize: 32,
    fontWeight: "900",
    color: DS.text,
    letterSpacing: 0.5,
    fontFamily: "Inter_800ExtraBold",
  },
  scoreSep: { fontSize: 22, fontWeight: "300", color: DS.faint },
  stadiumText: {
    fontSize: 10,
    color: DS.muted,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    opacity: 0.7,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPCOMING MATCH CARD
// ═══════════════════════════════════════════════════════════════════════════════

type UpcomingMatchCardProps = {
  match: any;
  onPress?: () => void;
};

export function UpcomingMatchCard({ match, onPress }: UpcomingMatchCardProps) {
  const leagueLogo = resolveCompetitionBrand({
    name: match?.league || "",
    espnLeague: match?.espnLeague || null,
  }).logo;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.84} style={uc.wrap}>
      <View style={uc.card}>
        {/* Top row: league logo + kickoff time */}
        <View style={uc.topRow}>
          {leagueLogo ? (
            <Image
              source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
              style={uc.leagueLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={uc.leagueLogoPlaceholder} />
          )}
          <View style={uc.kickoffBadge}>
            <Text style={uc.kickoffText}>{match?.startTime || "TBD"}</Text>
          </View>
        </View>

        {/* Teams */}
        <View style={uc.teamsRow}>
          <View style={uc.teamCol}>
            <TeamLogo uri={match?.homeTeamLogo} teamName={match?.homeTeam || ""} size={44} />
            <Text style={uc.teamName} numberOfLines={1}>{match?.homeTeam || ""}</Text>
          </View>
          <View style={uc.vsCol}>
            <Text style={uc.vsText}>VS</Text>
          </View>
          <View style={uc.teamCol}>
            <TeamLogo uri={match?.awayTeamLogo} teamName={match?.awayTeam || ""} size={44} />
            <Text style={uc.teamName} numberOfLines={1}>{match?.awayTeam || ""}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const uc = StyleSheet.create({
  wrap: { marginBottom: 10 },
  card: {
    backgroundColor: DS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DS.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leagueLogo: { width: 18, height: 18, opacity: 0.65, borderRadius: 4 },
  leagueLogoPlaceholder: { width: 18, height: 18 },
  kickoffBadge: {
    backgroundColor: DS.elevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DS.border,
  },
  kickoffText: {
    fontSize: 11,
    fontWeight: "700",
    color: DS.textSec,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamCol: { flex: 1, alignItems: "center", gap: 7 },
  teamName: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.text,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    maxWidth: 80,
  },
  vsCol: { alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  vsText: {
    fontSize: 12,
    fontWeight: "800",
    color: DS.faint,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINISHED MATCH CARD
// ═══════════════════════════════════════════════════════════════════════════════

type FinishedMatchCardProps = {
  match: any;
  onPress?: () => void;
};

export function FinishedMatchCard({ match, onPress }: FinishedMatchCardProps) {
  const leagueLogo = resolveCompetitionBrand({
    name: match?.league || "",
    espnLeague: match?.espnLeague || null,
  }).logo;

  const homeScore = Number(match?.homeScore ?? 0);
  const awayScore = Number(match?.awayScore ?? 0);
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.84} style={fc.wrap}>
      <View style={fc.card}>
        {/* League / FT row */}
        <View style={fc.topRow}>
          {leagueLogo ? (
            <Image
              source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
              style={fc.leagueLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={fc.leagueLogoPlaceholder} />
          )}
          <View style={fc.ftBadge}>
            <Text style={fc.ftText}>FT</Text>
          </View>
        </View>

        {/* Teams + Score */}
        <View style={fc.teamsRow}>
          <View style={fc.teamCol}>
            <View style={[fc.logoWrap, homeWon && fc.logoWrapWin]}>
              <TeamLogo uri={match?.homeTeamLogo} teamName={match?.homeTeam || ""} size={42} />
            </View>
            <Text style={[fc.teamName, homeWon && fc.teamNameWin]} numberOfLines={1}>
              {match?.homeTeam || ""}
            </Text>
          </View>
          <View style={fc.scoreCol}>
            <Text style={[fc.scoreNum, homeWon && fc.scoreNumWin]}>{homeScore}</Text>
            <Text style={fc.scoreDash}> – </Text>
            <Text style={[fc.scoreNum, awayWon && fc.scoreNumWin]}>{awayScore}</Text>
          </View>
          <View style={fc.teamCol}>
            <View style={[fc.logoWrap, awayWon && fc.logoWrapWin]}>
              <TeamLogo uri={match?.awayTeamLogo} teamName={match?.awayTeam || ""} size={42} />
            </View>
            <Text style={[fc.teamName, awayWon && fc.teamNameWin]} numberOfLines={1}>
              {match?.awayTeam || ""}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const fc = StyleSheet.create({
  wrap: { marginBottom: 10 },
  card: {
    backgroundColor: "#080B12",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leagueLogo: { width: 16, height: 16, opacity: 0.45, borderRadius: 3 },
  leagueLogoPlaceholder: { width: 16, height: 16 },
  ftBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ftText: {
    fontSize: 10,
    fontWeight: "700",
    color: DS.muted,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamCol: { flex: 1, alignItems: "center", gap: 6 },
  logoWrap: { opacity: 0.5 },
  logoWrapWin: { opacity: 1 },
  teamName: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.muted,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    maxWidth: 80,
  },
  teamNameWin: {
    color: DS.text,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  scoreCol: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    minWidth: 84,
    justifyContent: "center",
  },
  scoreNum: {
    fontSize: 26,
    fontWeight: "800",
    color: DS.textSec,
    fontFamily: "Inter_800ExtraBold",
  },
  scoreNumWin: { color: DS.text },
  scoreDash: {
    fontSize: 16,
    fontWeight: "400",
    color: DS.faint,
    marginHorizontal: 2,
    fontFamily: "Inter_500Medium",
  },
});
