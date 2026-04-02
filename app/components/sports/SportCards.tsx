import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { TeamLogo } from "@/components/TeamLogo";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { COLORS } from "@/constants/colors";

// Unified design tokens — pulled from COLORS so the whole app stays consistent
const DS = {
  card:        COLORS.card,
  cardRaised:  COLORS.cardElevated,
  cardSoft:    COLORS.surface,
  border:      COLORS.glassBorder,
  text:        COLORS.text,
  muted:       COLORS.textSecondary,
  subtle:      COLORS.textMuted,
  accent:      COLORS.accent,
  live:        COLORS.live,
  liveBg:      COLORS.liveGlow,
  upcoming:    COLORS.upcoming,
  upcomingBg:  COLORS.upcomingGlow,
  finished:    COLORS.finished,
  finishedBg:  COLORS.finishedGlow,
  warning:     COLORS.warning,
  warningBg:   COLORS.warningGlow,
};

export type MatchVisualState = "live" | "upcoming" | "finished" | "postponed" | "cancelled";

export type PremiumSportMatch = {
  id: string;
  league: string;
  espnLeague?: string;
  competitionCountry?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  statusDetail?: string | null;
  minute?: number | null;
  startDate?: string | null;
  sport?: string | null;
  round?: string | null;
  venue?: string | null;
  hasStream?: boolean;
  raw?: any;
};

type MatchCardProps = {
  match: PremiumSportMatch;
  onPress?: () => void;
  forceState?: MatchVisualState;
  compact?: boolean;
};

type ClusterCardProps = {
  title: string;
  subtitle: string;
  meta: string;
  tone?: "default" | "accent" | "live";
  onPress?: () => void;
};

type FollowingCardProps = {
  match: PremiumSportMatch;
  contextLabel?: string;
  onPress?: () => void;
};

const LIVE_TOKENS = new Set(["live", "in_progress", "inprogress", "1h", "2h", "ht", "halftime", "et", "extra_time", "pen"]);
const FINISHED_TOKENS = new Set(["finished", "ft", "fulltime", "full_time", "final", "ended", "post"]);
const WARNING_TOKENS = new Set(["postponed", "cancelled", "canceled", "delayed", "suspended", "abandoned"]);

function tokenOf(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractTeamName(team: any, fallback = ""): string {
  if (typeof team === "string") return team.trim() || fallback;
  return String(team?.name || team?.displayName || fallback).trim() || fallback;
}

function extractTeamLogo(team: any, direct: unknown): string | null {
  const directLogo = String(direct || "").trim();
  if (directLogo) return directLogo;
  const nested = String(team?.logo || "").trim();
  return nested || null;
}

export function normalizeSportMatch(raw: any): PremiumSportMatch {
  const homeTeam = extractTeamName(raw?.homeTeam, String(raw?.homeTeamName || ""));
  const awayTeam = extractTeamName(raw?.awayTeam, String(raw?.awayTeamName || ""));
  const competition = raw?.competition || {};

  return {
    id: String(raw?.id || raw?.matchId || `${homeTeam}-${awayTeam}-${raw?.startTime || raw?.startDate || ""}`),
    league: String(raw?.league || raw?.leagueName || competition?.displayName || "Competition").trim() || "Competition",
    espnLeague: String(raw?.espnLeague || competition?.espnSlug || "").trim() || undefined,
    competitionCountry: String(competition?.country || raw?.country || "").trim() || null,
    homeTeam,
    awayTeam,
    homeTeamLogo: extractTeamLogo(raw?.homeTeam, raw?.homeTeamLogo),
    awayTeamLogo: extractTeamLogo(raw?.awayTeam, raw?.awayTeamLogo),
    homeTeamId: String(raw?.homeTeamId || raw?.homeTeam?.id || "").trim() || null,
    awayTeamId: String(raw?.awayTeamId || raw?.awayTeam?.id || "").trim() || null,
    homeScore: toNum(raw?.homeScore ?? raw?.score?.home ?? raw?.homeTeam?.score),
    awayScore: toNum(raw?.awayScore ?? raw?.score?.away ?? raw?.awayTeam?.score),
    status: String(raw?.status || "upcoming").trim() || "upcoming",
    statusDetail: String(raw?.statusDetail || raw?.detail || "").trim() || null,
    minute: toNum(raw?.minute),
    startDate: String(raw?.startDate || raw?.startTime || raw?.date || "").trim() || null,
    sport: String(raw?.sport || competition?.sport || "soccer").trim() || "soccer",
    round: String(raw?.round || "").trim() || null,
    venue: String(raw?.venue || "").trim() || null,
    hasStream: Boolean(raw?.hasStream),
    raw,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return { day: "TBD", time: "--:--" };
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return { day: value, time: "--:--" };
  const date = new Date(parsed);
  return {
    day: new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short" }).format(date),
    time: new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

export function resolveMatchVisualState(match: PremiumSportMatch): MatchVisualState {
  const status = tokenOf(match?.status);
  const detail = tokenOf(match?.statusDetail);
  const minute = toNum(match?.minute);

  if (WARNING_TOKENS.has(status) || WARNING_TOKENS.has(detail)) {
    if (status.includes("cancel") || detail.includes("cancel") || status.includes("abandon") || detail.includes("abandon")) {
      return "cancelled";
    }
    return "postponed";
  }
  if (LIVE_TOKENS.has(status) || LIVE_TOKENS.has(detail) || (minute != null && minute > 0)) return "live";
  if (FINISHED_TOKENS.has(status) || FINISHED_TOKENS.has(detail)) return "finished";
  return "upcoming";
}

function statusMeta(state: MatchVisualState, match: PremiumSportMatch) {
  const minute = toNum(match.minute);
  switch (state) {
    case "live":
      return {
        label: minute != null && minute > 0 ? `${minute}'` : "LIVE",
        toneFg: DS.live,
        toneBg: DS.liveBg,
        footer: match.statusDetail || (match.hasStream ? "Live stream available" : "Live match center"),
      };
    case "finished":
      return {
        label: "FT",
        toneFg: DS.text,
        toneBg: DS.finishedBg,
        footer: match.statusDetail || "Full time",
      };
    case "postponed":
      return {
        label: "POSTPONED",
        toneFg: DS.warning,
        toneBg: DS.warningBg,
        footer: match.statusDetail || "Awaiting new date",
      };
    case "cancelled":
      return {
        label: "CANCELLED",
        toneFg: "#F87171",
        toneBg: "rgba(248,113,113,0.14)",
        footer: match.statusDetail || "Fixture cancelled",
      };
    default:
      return {
        label: "UPCOMING",
        toneFg: DS.upcoming,
        toneBg: DS.upcomingBg,
        footer: match.statusDetail || "Kickoff scheduled",
      };
  }
}

function scoreLabel(match: PremiumSportMatch, state: MatchVisualState) {
  const { day, time } = formatDateTime(match.startDate);
  if (state === "upcoming" || state === "postponed" || state === "cancelled") {
    return { primary: time, secondary: day };
  }
  return {
    primary: `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`,
    secondary: state === "finished" ? "Full time" : match.statusDetail || "In play",
  };
}

function subtleExtra(match: PremiumSportMatch) {
  const bits = [match.round, match.venue, match.competitionCountry].filter(Boolean);
  return bits.slice(0, 2).join(" • ") || "Premium live coverage";
}

function competitionLogo(league: string, espnLeague?: string) {
  const brand = resolveCompetitionBrand({ name: league, espnLeague: espnLeague || null });
  return brand.logo || null;
}

export function SkeletonMatchCard() {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.82, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity: pulse }]}> 
      <View style={styles.skeletonTop} />
      <View style={styles.skeletonBody}>
        <View style={styles.skeletonTeam} />
        <View style={styles.skeletonCenter} />
        <View style={styles.skeletonTeam} />
      </View>
      <View style={styles.skeletonFooter} />
    </Animated.View>
  );
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void; }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.sectionAction} onPress={onAction} activeOpacity={0.82}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={DS.accent} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function HeroMatchCard({ match, onPress }: MatchCardProps) {
  const state = resolveMatchVisualState(match);
  const meta = statusMeta(state, match);
  const score = scoreLabel(match, state);
  const logo = competitionLogo(match.league, match.espnLeague);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.heroWrap}>
      <LinearGradient colors={["#121C32", "#0B101A", "#080B12"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroOverlay} />
        <View style={styles.heroTopRow}>
          <View style={styles.heroLeagueBlock}>
            {logo ? <Image source={typeof logo === "number" ? logo : { uri: logo as string }} style={styles.heroLeagueLogo} resizeMode="contain" /> : null}
            <Text style={styles.heroLeague}>{match.league}</Text>
          </View>
          <View style={[styles.heroBadge, { backgroundColor: meta.toneBg }]}> 
            <Text style={[styles.heroBadgeText, { color: meta.toneFg }]}>{meta.label}</Text>
          </View>
        </View>

        <View style={styles.heroMainRow}>
          <View style={styles.heroTeamCol}>
            <TeamLogo uri={match.homeTeamLogo || ""} teamName={match.homeTeam} size={62} />
            <Text numberOfLines={2} style={styles.heroTeamName}>{match.homeTeam}</Text>
          </View>

          <View style={styles.heroScoreCol}>
            <Text style={styles.heroScorePrimary}>{score.primary}</Text>
            <Text style={styles.heroScoreSecondary}>{score.secondary}</Text>
            <Text style={styles.heroMiniMeta}>{subtleExtra(match)}</Text>
          </View>

          <View style={styles.heroTeamCol}>
            <TeamLogo uri={match.awayTeamLogo || ""} teamName={match.awayTeam} size={62} />
            <Text numberOfLines={2} style={styles.heroTeamName}>{match.awayTeam}</Text>
          </View>
        </View>

        <View style={styles.heroFooter}>
          <Text style={styles.heroFooterText}>{meta.footer}</Text>
          <View style={styles.heroFooterPill}>
            <Ionicons name="pulse" size={13} color={state === "live" ? DS.live : DS.accent} />
            <Text style={styles.heroFooterPillText}>{state === "live" ? "Open live center" : "Open match center"}</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function MatchCard({ match, onPress, forceState, compact = false }: MatchCardProps) {
  const state = forceState || resolveMatchVisualState(match);
  const meta = statusMeta(state, match);
  const score = scoreLabel(match, state);
  const logo = competitionLogo(match.league, match.espnLeague);

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[styles.cardWrap, compact && styles.cardWrapCompact]}>
      <LinearGradient colors={[DS.card, DS.cardSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, compact && styles.cardCompact]}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardLeagueRow}>
            {logo ? <Image source={typeof logo === "number" ? logo : { uri: logo as string }} style={styles.cardLeagueLogo} resizeMode="contain" /> : null}
            <Text numberOfLines={1} style={styles.cardLeagueText}>{match.league}</Text>
          </View>
          <View style={[styles.cardBadge, { backgroundColor: meta.toneBg }]}> 
            <Text style={[styles.cardBadgeText, { color: meta.toneFg }]}>{meta.label}</Text>
          </View>
        </View>

        <View style={styles.cardMiddleRow}>
          <View style={styles.cardTeamCol}>
            <TeamLogo uri={match.homeTeamLogo || ""} teamName={match.homeTeam} size={compact ? 38 : 46} />
            <Text numberOfLines={2} style={styles.cardTeamName}>{match.homeTeam}</Text>
          </View>

          <View style={styles.cardCenterCol}>
            <Text style={styles.cardCenterPrimary}>{score.primary}</Text>
            <Text style={styles.cardCenterSecondary}>{score.secondary}</Text>
          </View>

          <View style={styles.cardTeamCol}>
            <TeamLogo uri={match.awayTeamLogo || ""} teamName={match.awayTeam} size={compact ? 38 : 46} />
            <Text numberOfLines={2} style={styles.cardTeamName}>{match.awayTeam}</Text>
          </View>
        </View>

        <View style={styles.cardFooterRow}>
          <Text numberOfLines={1} style={styles.cardFooterText}>{subtleExtra(match)}</Text>
          {match.hasStream ? (
            <View style={styles.streamChip}>
              <Ionicons name="play-circle" size={12} color={DS.live} />
              <Text style={styles.streamChipText}>Stream</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function LiveMatchCard(props: MatchCardProps) { return <MatchCard {...props} forceState="live" />; }
export function UpcomingMatchCard(props: MatchCardProps) { return <MatchCard {...props} forceState="upcoming" />; }
export function FinishedMatchCard(props: MatchCardProps) { return <MatchCard {...props} forceState="finished" />; }
/** Alias for MatchCard — used by screens that import MatchStatusCard */
export const MatchStatusCard = MatchCard;

export function CompetitionClusterCard({ title, subtitle, meta, tone = "default", onPress }: ClusterCardProps) {
  const toneColors: [string, string] = tone === "accent"
    ? ["rgba(229,9,20,0.18)", "rgba(18,25,41,0.98)"]
    : tone === "live"
      ? ["rgba(34,197,94,0.18)", "rgba(18,25,41,0.98)"]
      : ["rgba(255,255,255,0.05)", "rgba(18,25,41,0.98)"];
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.clusterWrap}>
      <LinearGradient colors={toneColors} style={styles.clusterCard}>
        <Text numberOfLines={2} style={styles.clusterTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.clusterSubtitle}>{subtitle}</Text>
        <Text numberOfLines={1} style={styles.clusterMeta}>{meta}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function CountryClusterCard(props: ClusterCardProps) { return <CompetitionClusterCard {...props} tone="accent" />; }

export function FollowingMatchCard({ match, contextLabel, onPress }: FollowingCardProps) {
  const state = resolveMatchVisualState(match);
  const meta = statusMeta(state, match);
  const score = scoreLabel(match, state);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.followingWrap}>
      <View style={styles.followingCard}>
        <View style={styles.followingTeams}>
          <View style={styles.followingClub}>
            <TeamLogo uri={match.homeTeamLogo || ""} teamName={match.homeTeam} size={28} />
            <Text numberOfLines={1} style={styles.followingClubText}>{match.homeTeam}</Text>
          </View>
          <Text style={styles.followingScore}>{score.primary}</Text>
          <View style={styles.followingClub}>
            <TeamLogo uri={match.awayTeamLogo || ""} teamName={match.awayTeam} size={28} />
            <Text numberOfLines={1} style={styles.followingClubText}>{match.awayTeam}</Text>
          </View>
        </View>
        <View style={styles.followingFooter}>
          <Text style={styles.followingContext}>{contextLabel || match.league}</Text>
          <View style={[styles.followingBadge, { backgroundColor: meta.toneBg }]}> 
            <Text style={[styles.followingBadgeText, { color: meta.toneFg }]}>{meta.label}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function EmptySection({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.emptySection}>
      <Ionicons name="football-outline" size={28} color={DS.subtle} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonCard: { width: 284, borderRadius: 24, backgroundColor: DS.card, borderWidth: 1, borderColor: DS.border, padding: 16, gap: 14 },
  skeletonTop: { height: 14, width: "52%", borderRadius: 8, backgroundColor: DS.cardRaised },
  skeletonBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  skeletonTeam: { width: 72, height: 72, borderRadius: 20, backgroundColor: DS.cardRaised },
  skeletonCenter: { width: 76, height: 42, borderRadius: 12, backgroundColor: DS.cardRaised },
  skeletonFooter: { height: 12, width: "68%", borderRadius: 8, backgroundColor: DS.cardRaised },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  sectionCopy: { flex: 1, gap: 4 },
  sectionTitle: { color: DS.text, fontSize: 24, fontFamily: "Inter_800ExtraBold" },
  sectionSubtitle: { color: DS.muted, fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionActionText: { color: DS.accent, fontSize: 13, fontFamily: "Inter_700Bold" },
  heroWrap: { marginBottom: 28 },
  heroCard: { borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: DS.border, padding: 20, gap: 18 },
  heroOverlay: { position: "absolute", right: -42, top: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(229,9,20,0.09)" },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroLeagueBlock: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  heroLeagueLogo: { width: 20, height: 20 },
  heroLeague: { color: DS.muted, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1, textTransform: "uppercase", flex: 1 },
  heroBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  heroBadgeText: { fontSize: 11, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.8 },
  heroMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroTeamCol: { flex: 1, alignItems: "center", gap: 10, minWidth: 0 },
  heroTeamName: { color: DS.text, fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroScoreCol: { minWidth: 112, alignItems: "center", gap: 6 },
  heroScorePrimary: { color: DS.text, fontSize: 30, fontFamily: "Inter_800ExtraBold" },
  heroScoreSecondary: { color: DS.muted, fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  heroMiniMeta: { color: DS.subtle, fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  heroFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroFooterText: { color: DS.muted, fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  heroFooterPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 12, paddingVertical: 8 },
  heroFooterPillText: { color: DS.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  cardWrap: { width: 286, marginRight: 14 },
  cardWrapCompact: { width: "100%", marginRight: 0 },
  card: { borderRadius: 24, overflow: "hidden", padding: 16, borderWidth: 1, borderColor: DS.border, minHeight: 188 },
  cardCompact: { minHeight: 166, padding: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardLeagueRow: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1, minWidth: 0 },
  cardLeagueLogo: { width: 18, height: 18 },
  cardLeagueText: { color: DS.muted, fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.7, flex: 1 },
  cardBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cardBadgeText: { fontSize: 10, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.8 },
  cardMiddleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flex: 1 },
  cardTeamCol: { flex: 1, alignItems: "center", gap: 8, minWidth: 0 },
  cardTeamName: { color: DS.text, fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  cardCenterCol: { minWidth: 98, alignItems: "center", gap: 6 },
  cardCenterPrimary: { color: DS.text, fontSize: 24, fontFamily: "Inter_800ExtraBold" },
  cardCenterSecondary: { color: DS.muted, fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.7 },
  cardFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardFooterText: { color: DS.subtle, fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },
  streamChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" },
  streamChipText: { color: DS.live, fontSize: 11, fontFamily: "Inter_700Bold" },
  clusterWrap: { width: 178, marginRight: 14 },
  clusterCard: { minHeight: 126, borderRadius: 22, borderWidth: 1, borderColor: DS.border, padding: 16, justifyContent: "space-between" },
  clusterTitle: { color: DS.text, fontSize: 17, fontFamily: "Inter_800ExtraBold" },
  clusterSubtitle: { color: DS.muted, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  clusterMeta: { color: DS.subtle, fontSize: 11, fontFamily: "Inter_500Medium" },
  followingWrap: { marginBottom: 12 },
  followingCard: { borderRadius: 20, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.card, padding: 14, gap: 12 },
  followingTeams: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  followingClub: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  followingClubText: { color: DS.text, fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  followingScore: { color: DS.text, fontSize: 18, fontFamily: "Inter_800ExtraBold", minWidth: 68, textAlign: "center" },
  followingFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  followingContext: { color: DS.muted, fontSize: 11, fontFamily: "Inter_600SemiBold", flex: 1 },
  followingBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  followingBadgeText: { fontSize: 10, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.7 },
  emptySection: { borderRadius: 22, borderWidth: 1, borderColor: DS.border, backgroundColor: DS.card, padding: 22, alignItems: "center", gap: 10 },
  emptyTitle: { color: DS.text, fontSize: 16, fontFamily: "Inter_700Bold" },
  emptySubtitle: { color: DS.muted, fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
});
