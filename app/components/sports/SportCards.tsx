import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from "react-native";
import { TeamLogo } from "@/components/TeamLogo";
import { resolveCompetitionBrand } from "@/lib/logo-manager";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — aligned with films/series premium theme
// ═══════════════════════════════════════════════════════════════════════════════

const DS = {
  card: "#0B0F1A",
  cardRaised: "#12192A",
  cardBorder: "#1F2937",
  text: "#FFFFFF",
  muted: "#A1A1AA",
  subtle: "#71717A",
  live: "#22C55E",
  liveBg: "rgba(34,197,94,0.14)",
  upcoming: "#9FB2C9",
  upcomingBg: "rgba(159,178,201,0.14)",
  finished: "#9CA3AF",
  finishedBg: "rgba(156,163,175,0.14)",
  postponed: "#C084FC",
  postponedBg: "rgba(192,132,252,0.15)",
  cancelled: "#F87171",
  cancelledBg: "rgba(248,113,113,0.15)",
};

export type MatchVisualState = "live" | "upcoming" | "finished" | "postponed" | "cancelled";

const LIVE_TOKENS = new Set(["live", "in_progress", "inprogress", "1h", "2h", "ht", "halftime", "extra_time", "et", "pen"]);
const FINISHED_TOKENS = new Set(["finished", "ft", "full_time", "final", "post", "ended"]);
const POSTPONED_TOKENS = new Set(["postponed", "postpone", "ppd", "delayed", "suspended"]);
const CANCELLED_TOKENS = new Set(["cancelled", "canceled", "abandoned", "void"]);

function tokenOf(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numericMinute(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").match(/\d{1,3}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamName(match: any, side: "home" | "away"): string {
  const raw = side === "home" ? match?.homeTeam : match?.awayTeam;
  if (typeof raw === "string") return raw.trim();
  return String(raw?.name || raw?.displayName || "").trim();
}

function teamLogo(match: any, side: "home" | "away"): string {
  const direct = side === "home" ? match?.homeTeamLogo : match?.awayTeamLogo;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested = side === "home" ? match?.homeTeam?.logo : match?.awayTeam?.logo;
  return typeof nested === "string" ? nested : "";
}

function scoreOf(match: any, side: "home" | "away"): number | null {
  const direct = side === "home" ? match?.homeScore : match?.awayScore;
  const value = Number(direct);
  if (Number.isFinite(value)) return value;
  const nested = Number(side === "home" ? match?.score?.home : match?.score?.away);
  return Number.isFinite(nested) ? nested : null;
}

function formatKickoff(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "TBD";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    const hhmm = raw.match(/\b\d{1,2}:\d{2}\b/);
    return hhmm ? hhmm[0] : "TBD";
  }
  return new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(parsed));
}

export function resolveMatchVisualState(match: any): MatchVisualState {
  const status = tokenOf(match?.status);
  const detail = tokenOf(match?.statusDetail || match?.detail);
  const minute = numericMinute(match?.minute);

  if (CANCELLED_TOKENS.has(status) || CANCELLED_TOKENS.has(detail)) return "cancelled";
  if (POSTPONED_TOKENS.has(status) || POSTPONED_TOKENS.has(detail)) return "postponed";
  if (LIVE_TOKENS.has(status) || LIVE_TOKENS.has(detail)) return "live";
  if (FINISHED_TOKENS.has(status) || FINISHED_TOKENS.has(detail)) return "finished";

  if (minute != null && minute > 0) return "live";

  const home = scoreOf(match, "home");
  const away = scoreOf(match, "away");
  const kickoffMs = Date.parse(String(match?.startDate || match?.startTime || ""));
  if (home != null && away != null && Number.isFinite(kickoffMs) && kickoffMs < Date.now() - 2 * 60 * 60 * 1000) {
    return "finished";
  }

  return "upcoming";
}

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
    borderColor: DS.cardBorder,
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
  logo: { width: 42, height: 42, borderRadius: 21, backgroundColor: DS.cardRaised },
  name: { width: 56, height: 8, borderRadius: 4, backgroundColor: DS.cardRaised },
  scoreBlock: { alignItems: "center", gap: 6, minWidth: 90 },
  badge: { width: 52, height: 16, borderRadius: 8, backgroundColor: DS.cardRaised },
  badgeSmall: { width: 36, height: 8, borderRadius: 4, backgroundColor: DS.cardRaised },
  score: { width: 72, height: 30, borderRadius: 6, backgroundColor: DS.cardRaised },
  bar: { height: 5, borderRadius: 3, backgroundColor: DS.cardRaised },
});

type MatchStatusCardProps = {
  match: any;
  onPress?: () => void;
  forceState?: MatchVisualState;
  compact?: boolean;
};

const STATUS_THEME: Record<MatchVisualState, { label: string; fg: string; bg: string }> = {
  live: { label: "LIVE", fg: DS.live, bg: DS.liveBg },
  upcoming: { label: "UPCOMING", fg: DS.upcoming, bg: DS.upcomingBg },
  finished: { label: "FT", fg: DS.finished, bg: DS.finishedBg },
  postponed: { label: "POSTPONED", fg: DS.postponed, bg: DS.postponedBg },
  cancelled: { label: "CANCELLED", fg: DS.cancelled, bg: DS.cancelledBg },
};

export function MatchStatusCard({ match, onPress, forceState, compact = false }: MatchStatusCardProps) {
  const status = forceState || resolveMatchVisualState(match);
  const statusTheme = STATUS_THEME[status];
  const homeName = teamName(match, "home") || "Home";
  const awayName = teamName(match, "away") || "Away";
  const homeScore = scoreOf(match, "home");
  const awayScore = scoreOf(match, "away");
  const kickoff = formatKickoff(match?.startDate || match?.startTime);
  const minute = numericMinute(match?.minute);
  const league = String(match?.league || match?.competition?.name || "Competition").trim();
  const leagueLogo = resolveCompetitionBrand({ name: league, espnLeague: match?.espnLeague || null }).logo;

  const centerLabel = useMemo(() => {
    if (status === "live") return minute != null && minute > 0 ? `${minute}'` : "LIVE";
    if (status === "upcoming") return kickoff;
    if (status === "postponed") return "Date pending";
    if (status === "cancelled") return "No kickoff";
    return "Full time";
  }, [kickoff, minute, status]);

  const centerValue = useMemo(() => {
    if (status === "upcoming") return "vs";
    if (status === "postponed" || status === "cancelled") return "-";
    return `${homeScore ?? 0} : ${awayScore ?? 0}`;
  }, [awayScore, homeScore, status]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.86} style={mc.wrap}>
      <View style={[mc.card, compact && mc.cardCompact]}>
        <View style={mc.topRow}>
          <View style={mc.leagueRow}>
            {leagueLogo ? (
              <Image source={typeof leagueLogo === "number" ? leagueLogo : { uri: leagueLogo as string }} style={mc.leagueLogo} resizeMode="contain" />
            ) : null}
            <Text style={mc.leagueText} numberOfLines={1}>{league}</Text>
          </View>
          <View style={[mc.statusPill, { backgroundColor: statusTheme.bg }]}>
            <Text style={[mc.statusText, { color: statusTheme.fg }]}>{statusTheme.label}</Text>
          </View>
        </View>

        <View style={mc.mainRow}>
          <View style={mc.teamCol}>
            <TeamLogo uri={teamLogo(match, "home")} teamName={homeName} size={compact ? 36 : 44} />
            <Text style={mc.teamName} numberOfLines={1}>{homeName}</Text>
          </View>

          <View style={mc.centerCol}>
            <Text style={mc.centerLabel}>{centerLabel}</Text>
            <Text style={mc.centerValue}>{centerValue}</Text>
          </View>

          <View style={mc.teamCol}>
            <TeamLogo uri={teamLogo(match, "away")} teamName={awayName} size={compact ? 36 : 44} />
            <Text style={mc.teamName} numberOfLines={1}>{awayName}</Text>
          </View>
        </View>

        <Text style={mc.metaText} numberOfLines={1}>
          {String(match?.statusDetail || match?.detail || "").trim() || "Reliable live data sync enabled"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const mc = StyleSheet.create({
  wrap: { marginBottom: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DS.cardBorder,
    backgroundColor: DS.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  cardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  leagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  leagueLogo: { width: 16, height: 16, opacity: 0.72 },
  leagueText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: DS.muted,
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statusText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  teamName: {
    color: DS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    maxWidth: 96,
  },
  centerCol: {
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 6,
  },
  centerLabel: {
    color: DS.subtle,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  centerValue: {
    color: DS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
  },
  metaText: {
    color: DS.subtle,
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    textAlign: "center",
  },
});

type LegacyCardProps = {
  match: any;
  onPress?: () => void;
};

export function LiveMatchCard({ match, onPress }: LegacyCardProps) {
  return <MatchStatusCard match={match} onPress={onPress} forceState="live" />;
}

export function UpcomingMatchCard({ match, onPress }: LegacyCardProps) {
  return <MatchStatusCard match={match} onPress={onPress} forceState="upcoming" />;
}

export function FinishedMatchCard({ match, onPress }: LegacyCardProps) {
  return <MatchStatusCard match={match} onPress={onPress} forceState="finished" />;
}
