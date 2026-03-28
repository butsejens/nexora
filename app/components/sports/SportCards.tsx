/**
 * SportCards.tsx
 * ════════════════════════════════════════════════════════════════════════════════
 * Premium card components for sports UI
 * - LiveMatchCard: Real-time match with score & minute
 * - UpcomingMatchCard: Future match with kickoff time
 * - FinishedMatchCard: Completed match with final score
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TeamLogo } from "@/components/TeamLogo";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { calculateMomentum } from "@/lib/ai/momentum-calculator";
import { MomentumBar } from "@/components/sports/MomentumBar";

const DS = {
  bg: "#09090D",
  card: "#12121A",
  elevated: "#1C1C28",
  accent: "#E50914",
  live: "#FF3040",
  text: "#FFFFFF",
  muted: "#9D9DAA",
  border: "rgba(255,255,255,0.08)",
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE MATCH CARD
// ═══════════════════════════════════════════════════════════════════════════════

type LiveMatchCardProps = {
  match: any;
  onPress?: () => void;
};

export function LiveMatchCard({ match, onPress }: LiveMatchCardProps) {
  const brand = resolveCompetitionBrand({
    name: match?.league || "League",
    espnLeague: match?.espnLeague || null,
  });
  const leagueLogo = brand.logo;
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.liveWrap}
    >
      <LinearGradient
        colors={["#1A0A0E", "#0D0D1A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.liveCard}
      >
        {/* Red accent border - left side */}
        <View style={styles.liveAccentBorder} />

        {/* Teams + Score layout */}
        <View style={styles.liveTeamsRow}>
          {/* HOME TEAM */}
          <View style={styles.liveTeamBlock}>
            <Text style={styles.liveTeamName} numberOfLines={1}>
              {match?.homeTeam || "Home"}
            </Text>
            <TeamLogo
              uri={match?.homeTeamLogo}
              teamName={match?.homeTeam || ""}
              size={40}
            />
          </View>

          {/* SCORE + COMPETITION */}
          <View style={styles.liveScoreBlock}>
            {leagueLogo && (
              <Image
                source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
                style={styles.liveLeagueLogo}
                resizeMode="contain"
              />
            )}
            <Text style={styles.liveLiveText}>{minute}</Text>
            <Text style={styles.liveScore}>
              {homeScore} - {awayScore}
            </Text>
          </View>

          {/* AWAY TEAM */}
          <View style={styles.liveTeamBlock}>
            <Text style={styles.liveTeamName} numberOfLines={1}>
              {match?.awayTeam || "Away"}
            </Text>
            <TeamLogo
              uri={match?.awayTeamLogo}
              teamName={match?.awayTeam || ""}
              size={40}
            />
          </View>
        </View>

        {/* Stadium info (optional) */}
        <MomentumBar
          model={momentum}
          compact
          homeLabel={String(match?.homeTeam || "HOME").slice(0, 3).toUpperCase()}
          awayLabel={String(match?.awayTeam || "AWAY").slice(0, 3).toUpperCase()}
        />

        {/* Stadium info (optional) */}
        {match?.stadium && (
          <Text style={styles.liveStadium} numberOfLines={1}>
            📍 {match.stadium}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPCOMING MATCH CARD
// ═══════════════════════════════════════════════════════════════════════════════

type UpcomingMatchCardProps = {
  match: any;
  onPress?: () => void;
};

export function UpcomingMatchCard({ match, onPress }: UpcomingMatchCardProps) {
  const brand = resolveCompetitionBrand({
    name: match?.league || "League",
    espnLeague: match?.espnLeague || null,
  });
  const leagueLogo = brand.logo;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.upcomingWrap}
    >
      <View style={styles.upcomingCard}>
        {/* League header */}
        <View style={styles.upcomingHeader}>
          {leagueLogo && (
            <Image
              source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
              style={styles.upcomingLeagueLogo}
              resizeMode="contain"
            />
          )}
          <Text style={styles.upcomingLeagueText} numberOfLines={1}>
            {brand.name || match?.league}
          </Text>
        </View>

        {/* Teams */}
        <View style={styles.upcomingTeamsRow}>
          {/* Home team */}
          <View style={styles.upcomingTeamBlock}>
            <Text style={styles.upcomingTeamName} numberOfLines={1}>
              {match?.homeTeam}
            </Text>
            <TeamLogo
              uri={match?.homeTeamLogo}
              teamName={match?.homeTeam || ""}
              size={34}
            />
          </View>

          {/* Vs + Kickoff time */}
          <View style={styles.upcomingVsBlock}>
            <Text style={styles.upcomingVsText}>VS</Text>
            <Text style={styles.upcomingTimeText}>
              {match?.startTime || "TBD"}
            </Text>
          </View>

          {/* Away team */}
          <View style={styles.upcomingTeamBlock}>
            <Text style={styles.upcomingTeamName} numberOfLines={1}>
              {match?.awayTeam}
            </Text>
            <TeamLogo
              uri={match?.awayTeamLogo}
              teamName={match?.awayTeam || ""}
              size={34}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINISHED MATCH CARD
// ═══════════════════════════════════════════════════════════════════════════════

type FinishedMatchCardProps = {
  match: any;
  onPress?: () => void;
};

export function FinishedMatchCard({ match, onPress }: FinishedMatchCardProps) {
  const brand = resolveCompetitionBrand({
    name: match?.league || "League",
    espnLeague: match?.espnLeague || null,
  });
  const leagueLogo = brand.logo;
  const homeScore = match?.homeScore ?? "–";
  const awayScore = match?.awayScore ?? "–";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.finishedWrap}
    >
      <View style={styles.finishedCard}>
        {/* League header */}
        <View style={styles.finishedHeader}>
          {leagueLogo && (
            <Image
              source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }}
              style={styles.finishedLeagueLogo}
              resizeMode="contain"
            />
          )}
          <Text style={styles.finishedLeagueText} numberOfLines={1}>
            {brand.name || match?.league}
          </Text>
        </View>

        {/* Teams + Score */}
        <View style={styles.finishedTeamsRow}>
          {/* Home team */}
          <View style={styles.finishedTeamBlock}>
            <Text style={styles.finishedTeamName} numberOfLines={1}>
              {match?.homeTeam}
            </Text>
            <TeamLogo
              uri={match?.homeTeamLogo}
              teamName={match?.homeTeam || ""}
              size={34}
            />
          </View>

          {/* Score */}
          <View style={styles.finishedScoreBlock}>
            <Text style={styles.finishedScore}>
              {homeScore} - {awayScore}
            </Text>
            <Text style={styles.finishedFTText}>FT</Text>
          </View>

          {/* Away team */}
          <View style={styles.finishedTeamBlock}>
            <Text style={styles.finishedTeamName} numberOfLines={1}>
              {match?.awayTeam}
            </Text>
            <TeamLogo
              uri={match?.awayTeamLogo}
              teamName={match?.awayTeam || ""}
              size={34}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // ─────────────────────────────────────────────────────────────────────────────
  // LIVE MATCH CARD
  // ─────────────────────────────────────────────────────────────────────────────

  liveWrap: {
    marginBottom: 8,
  },
  liveCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.34)",
    padding: 14,
    backgroundColor: "#0B0F1A",
    elevation: 7,
  },
  liveAccentBorder: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: DS.accent,
  },
  liveTeamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 4,
    gap: 8,
  },
  liveTeamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  liveTeamName: {
    fontSize: 12,
    fontWeight: "600",
    color: DS.text,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  liveScoreBlock: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  liveLeagueLogo: {
    width: 24,
    height: 24,
    marginBottom: 6,
  },
  liveLiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: DS.live,
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "Inter_700Bold",
  },
  liveScore: {
    fontSize: 26,
    fontWeight: "800",
    color: DS.text,
    letterSpacing: 0.8,
    fontFamily: "Inter_800ExtraBold",
  },
  liveStadium: {
    color: DS.muted,
    fontSize: 9,
    marginTop: 8,
    paddingLeft: 4,
    fontFamily: "Inter_500Medium",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UPCOMING MATCH CARD
  // ─────────────────────────────────────────────────────────────────────────────

  upcomingWrap: {
    marginBottom: 8,
  },
  upcomingCard: {
    backgroundColor: DS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DS.border,
    padding: 12,
    gap: 12,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  upcomingLeagueLogo: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  upcomingLeagueText: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.muted,
    flex: 1,
    fontFamily: "Inter_600SemiBold",
  },
  upcomingTeamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  upcomingTeamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  upcomingTeamName: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.text,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  upcomingVsBlock: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  upcomingVsText: {
    fontSize: 10,
    fontWeight: "700",
    color: DS.muted,
    marginBottom: 4,
    fontFamily: "Inter_700Bold",
  },
  upcomingTimeText: {
    fontSize: 12,
    fontWeight: "700",
    color: DS.text,
    fontFamily: "Inter_700Bold",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // FINISHED MATCH CARD
  // ─────────────────────────────────────────────────────────────────────────────

  finishedWrap: {
    marginBottom: 8,
  },
  finishedCard: {
    backgroundColor: DS.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    gap: 12,
  },
  finishedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  finishedLeagueLogo: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  finishedLeagueText: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.muted,
    flex: 1,
    fontFamily: "Inter_600SemiBold",
  },
  finishedTeamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  finishedTeamBlock: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  finishedTeamName: {
    fontSize: 11,
    fontWeight: "600",
    color: DS.text,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  finishedScoreBlock: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  finishedScore: {
    fontSize: 20,
    fontWeight: "700",
    color: DS.text,
    marginBottom: 4,
    fontFamily: "Inter_700Bold",
  },
  finishedFTText: {
    fontSize: 9,
    fontWeight: "700",
    color: DS.muted,
    letterSpacing: 0.5,
    fontFamily: "Inter_700Bold",
  },
});
