import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { enrichTeamDetailPayload } from "@/lib/sports-enrichment";
import { TeamLogo } from "@/components/TeamLogo";
import {
  getBestCachedOrSeedPlayerImage,
  resolvePlayerImageUri,
} from "@/lib/player-image-system";

function asParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] || fallback);
  return String(value || fallback);
}

function Line({ label, value, icon }: { label: string; value: string; icon?: string }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <View style={styles.lineLeft}>
        {icon && <MaterialCommunityIcons name={icon as any} size={14} color="#9D9DAA" />}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function FormBadges({ form }: { form?: string }) {
  if (!form) return null;
  const results = String(form).split("").slice(0, 5);
  return (
    <View style={styles.formRow}>
      {results.map((result, idx) => (
        <View
          key={`form_${idx}`}
          style={[
            styles.formDot,
            result === "W" ? styles.formWin : result === "D" ? styles.formDraw : styles.formLoss,
          ]}
        >
          <Text style={styles.formDotText}>{result}</Text>
        </View>
      ))}
    </View>
  );
}

function parseMarketValue(value: unknown): number {
  const text = String(value || "").trim().toLowerCase().replace(/€/g, "").replace(/\s+/g, "");
  if (!text) return 0;
  const numeric = Number(text.replace(/,/g, ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  if (text.includes("bn") || text.includes("b")) return numeric * 1_000_000_000;
  if (text.includes("m")) return numeric * 1_000_000;
  if (text.includes("k")) return numeric * 1_000;
  return numeric;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isLeagueCode(value: unknown): boolean {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return /^[a-z]{3,6}\.\d$/i.test(text) || /^[a-z]{3,6}\.[a-z0-9_]+$/i.test(text);
}

function cleanLeagueLabel(primary: unknown, fallback: unknown): string {
  const first = String(primary || "").trim();
  if (first && !isLeagueCode(first)) return first;
  const second = String(fallback || "").trim();
  if (second && !isLeagueCode(second)) return second;
  return second || first || "";
}

function roleForPosition(player: any): "gk" | "def" | "mid" | "att" {
  const pos = String(player?.position || player?.positionName || "").toUpperCase();
  if (pos.includes("GK") || pos.includes("GOAL")) return "gk";
  if (["CB", "LB", "RB", "LWB", "RWB", "DEF"].some((token) => pos.includes(token))) return "def";
  if (["DM", "CM", "AM", "CAM", "LM", "RM", "MID"].some((token) => pos.includes(token))) return "mid";
  return "att";
}

function metric(player: any, key: string): number {
  return toNumber(player?.seasonStats?.[key] ?? player?.[key]);
}

function isEligibleForTopList(player: any): boolean {
  const appearances = metric(player, "appearances");
  const minutes = metric(player, "minutes");
  return appearances >= 3 || minutes >= 180;
}

function playerTopScore(player: any): number {
  const goals = metric(player, "goals");
  const assists = metric(player, "assists");
  const rating = metric(player, "rating");
  const cleanSheets = metric(player, "cleanSheets");
  const saves = metric(player, "saves");
  const minutes = metric(player, "minutes");
  const starts = metric(player, "starts");
  const appearances = metric(player, "appearances");
  const role = roleForPosition(player);

  let score = 0;
  if (role === "att") score = goals * 6 + assists * 3 + rating * 2 + appearances * 0.5 + minutes / 180;
  else if (role === "mid") score = assists * 5 + rating * 3 + goals * 2 + appearances * 0.7 + minutes / 160;
  else if (role === "def") score = cleanSheets * 5 + rating * 3 + appearances * 0.9 + goals * 1.5 + minutes / 150;
  else score = cleanSheets * 6 + saves * 2 + rating * 2.5 + appearances * 0.9 + minutes / 150;

  if (!isEligibleForTopList(player)) score -= 8;
  return score + starts * 0.6;
}

function getUsefulPlayerStat(player: any): { label: string; value: string } | null {
  const role = roleForPosition(player);
  const goals = Number(player?.seasonStats?.goals ?? player?.goals ?? NaN);
  const assists = Number(player?.seasonStats?.assists ?? player?.assists ?? NaN);
  const appearances = Number(player?.seasonStats?.appearances ?? player?.appearances ?? NaN);
  const cleanSheets = Number(player?.seasonStats?.cleanSheets ?? player?.cleanSheets ?? NaN);
  const saves = Number(player?.seasonStats?.saves ?? player?.saves ?? NaN);
  const minutes = Number(player?.seasonStats?.minutes ?? player?.minutes ?? NaN);
  const rating = Number(player?.seasonStats?.rating ?? player?.rating ?? NaN);

  const roleStats: { label: string; value: number; format?: (v: number) => string }[] = role === "att"
    ? [
        { label: "Goals", value: goals },
        { label: "Assists", value: assists },
        { label: "Matches", value: appearances },
      ]
    : role === "mid"
      ? [
          { label: "Assists", value: assists },
          { label: "Rating", value: rating, format: (v) => v.toFixed(1) },
          { label: "Matches", value: appearances },
        ]
      : role === "def"
        ? [
            { label: "Clean sheets", value: cleanSheets },
            { label: "Rating", value: rating, format: (v) => v.toFixed(1) },
            { label: "Matches", value: appearances },
          ]
        : [
            { label: "Saves", value: saves },
            { label: "Clean sheets", value: cleanSheets },
            { label: "Matches", value: appearances },
          ];

  for (const candidate of roleStats) {
    if (Number.isFinite(candidate.value) && candidate.value > 0) {
      return {
        label: candidate.label,
        value: candidate.format ? candidate.format(candidate.value) : String(candidate.value),
      };
    }
  }

  if (Number.isFinite(minutes) && minutes > 0) return { label: "Minutes", value: String(minutes) };

  const age = Number(player?.age ?? NaN);
  if (Number.isFinite(age) && age > 0) return { label: "Age", value: String(age) };

  return null;
}

function TopPlayerRow({ player, teamName, league }: { player: any; teamName: string; league: string }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 365;
  const seed = useMemo(() => ({
    id: String(player?.id || ""),
    name: String(player?.name || ""),
    team: String(teamName || ""),
    league: String(league || "eng.1"),
    sport: "soccer",
    photo: player?.photo || null,
    theSportsDbPhoto: player?.theSportsDbPhoto || null,
    position: String(player?.position || player?.positionName || ""),
  }), [player?.id, player?.name, player?.photo, player?.theSportsDbPhoto, player?.position, player?.positionName, teamName, league]);
  const [uri, setUri] = useState<string | null>(getBestCachedOrSeedPlayerImage(seed));
  const [failed, setFailed] = useState(false);
  const stat = getUsefulPlayerStat(player);

  useEffect(() => {
    setUri(getBestCachedOrSeedPlayerImage(seed));
    setFailed(false);
  }, [seed]);

  useEffect(() => {
    let disposed = false;
    void resolvePlayerImageUri(seed, { allowNetwork: false }).then((imageUri) => {
      if (disposed || !imageUri) return;
      setUri(imageUri);
      setFailed(false);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [seed]);

  if (!stat) return null;

  return (
    <View style={styles.playerRow}>
      {uri && !failed ? (
        <Image source={{ uri }} style={[styles.playerPhoto, isCompact ? styles.playerPhotoCompact : null]} onError={() => setFailed(true)} />
      ) : (
        <View style={[styles.playerPhoto, styles.playerPhotoFallback, isCompact ? styles.playerPhotoCompact : null]}>
          <Text style={styles.playerPhotoInitials}>{String(player?.name || "?").slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.playerInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{String(player?.name || "Unknown")}</Text>
        <Text style={styles.playerMeta} numberOfLines={1}>{String(player?.positionName || player?.position || "Player")}</Text>
      </View>
      <View style={[styles.playerStatWrap, isCompact ? styles.playerStatWrapCompact : null]}>
        {!isCompact ? <Text style={styles.playerStatLabel}>{stat.label}</Text> : null}
        <Text style={styles.playerValue} numberOfLines={1}>{stat.value}</Text>
      </View>
    </View>
  );
}

export default function TeamInfoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ teamId?: string; teamName?: string; league?: string; sport?: string }>();
  const teamId = asParam(params.teamId, "");
  const teamName = asParam(params.teamName, "Team");
  const league = asParam(params.league, "eng.1");
  const sport = asParam(params.sport, "soccer");

  const { data } = useQuery({
    queryKey: ["team-info", teamId, league],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sports/team/${encodeURIComponent(teamId)}?sport=${encodeURIComponent(sport)}&league=${encodeURIComponent(league)}&teamName=${encodeURIComponent(teamName)}`);
      const json = await res.json();
      return enrichTeamDetailPayload(json);
    },
    enabled: Boolean(teamId),
  });

  const recent = Array.isArray(data?.recentResults) ? data.recentResults : [];
  const upcoming = Array.isArray(data?.upcomingMatches) ? data.upcomingMatches : [];
  const players = useMemo((): any[] => {
    return Array.isArray(data?.players) ? data.players : [];
  }, [data?.players]);
  const topPlayers = useMemo(() => {
    const base = [...players]
      .filter((p: any) => Boolean(String(p?.name || "").trim()) && Boolean(getUsefulPlayerStat(p)) && isEligibleForTopList(p))
      .sort((a: any, b: any) => {
        const scoreDiff = playerTopScore(b) - playerTopScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return parseMarketValue(b?.marketValue) - parseMarketValue(a?.marketValue);
      });

    const byRole = {
      gk: base.filter((p: any) => roleForPosition(p) === "gk"),
      def: base.filter((p: any) => roleForPosition(p) === "def"),
      mid: base.filter((p: any) => roleForPosition(p) === "mid"),
      att: base.filter((p: any) => roleForPosition(p) === "att"),
    };

    const selected: any[] = [];
    const pushUnique = (player: any) => {
      if (!player) return;
      if (selected.some((p) => String(p?.id || p?.name) === String(player?.id || player?.name))) return;
      selected.push(player);
    };

    pushUnique(byRole.att[0]);
    pushUnique(byRole.mid[0]);
    pushUnique(byRole.def[0]);
    pushUnique(byRole.gk[0]);

    for (const player of base) {
      if (selected.length >= 6) break;
      pushUnique(player);
    }

    return selected.slice(0, 6);
  }, [players]);

  const leagueLabel = cleanLeagueLabel(data?.leagueName, league);
  const topScorerLabel = String(data?.topScorer?.name || "").trim()
    ? `${data.topScorer.name}${data?.topScorer?.goals ? ` · ${data.topScorer.goals}G` : ""}`
    : "";
  const topAssistLabel = String(data?.topAssist?.name || "").trim()
    ? `${data.topAssist.name}${data?.topAssist?.assists ? ` · ${data.topAssist.assists}A` : ""}`
    : "";

  const heroColor = data?.color || "#E50914";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[`${heroColor}22`, COLORS.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: `${heroColor}33` }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Team Info</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { borderColor: `${heroColor}44` }]}>
          <TeamLogo uri={data?.logo} teamName={data?.name || teamName} size={72} />
          <Text style={styles.teamName}>{data?.name || teamName}</Text>
          {leagueLabel ? <Text style={styles.league} numberOfLines={1}>{leagueLabel}</Text> : null}
          {data?.leagueRank && (
            <View style={[styles.rankBadge, { backgroundColor: `${heroColor}22`, borderColor: heroColor }]}>
              <Text style={[styles.rankText, { color: heroColor }]}>#{data.leagueRank}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>General Info</Text>
          <Line label="League" value={leagueLabel} icon="soccer-field" />
          <Line label="Country" value={String(data?.country || "")} icon="earth" />
          <Line label="Founded" value={data?.founded ? String(data.founded) : ""} icon="calendar-outline" />
          <Line label="Venue" value={String(data?.venue || "")} icon="home-city-outline" />
          <Line label="Stadium capacity" value={data?.stadiumCapacity ? Number(data.stadiumCapacity).toLocaleString() : ""} icon="stadium" />
          <Line label="Coach" value={String(data?.coach || "")} icon="human-male-board" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Season Stats</Text>
          <View style={styles.statGridContainer}>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Played</Text>
              <Text style={styles.statGridValue}>{data?.leaguePlayed ?? "—"}</Text>
            </View>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Wins</Text>
              <Text style={[styles.statGridValue, { color: "#4CAF82" }]}>{data?.wins ?? "—"}</Text>
            </View>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Draws</Text>
              <Text style={[styles.statGridValue, { color: "#FFB400" }]}>{data?.draws ?? "—"}</Text>
            </View>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Losses</Text>
              <Text style={[styles.statGridValue, { color: "#FF5252" }]}>{data?.losses ?? "—"}</Text>
            </View>
          </View>
          <Line label="Points" value={data?.leaguePoints ? String(data.leaguePoints) : ""} icon="star-outline" />
          <Line label="Record" value={String(data?.record || "")} icon="format-list-text" />
        </View>

        {data?.form && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Form</Text>
            <FormBadges form={data.form} />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Performance</Text>
          <Line label="Goals For" value={data?.goalsFor != null ? String(data.goalsFor) : ""} icon="soccer" />
          <Line label="Goals Against" value={data?.goalsAgainst != null ? String(data.goalsAgainst) : ""} icon="shield-outline" />
          <Line label="Clean Sheets" value={data?.cleanSheets != null ? String(data.cleanSheets) : ""} icon="check-circle-outline" />
          <Line label="Top Scorer" value={topScorerLabel} icon="trophy-outline" />
          <Line label="Top Assist" value={topAssistLabel} icon="target" />
          <Line label="Discipline" value={data?.yellowCards != null || data?.redCards != null ? `${data?.yellowCards || 0}Y · ${data?.redCards || 0}R` : ""} icon="alert-outline" />
          <Line label="Club Value" value={String(data?.squadMarketValue || "")} icon="currency-eur" />
        </View>

        {(data?.goalsFor != null || data?.goalsAgainst != null || data?.cleanSheets != null) ? (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data?.goalsFor ?? 0}</Text>
              <Text style={styles.statLabel}>Goals For</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data?.goalsAgainst ?? 0}</Text>
              <Text style={styles.statLabel}>Goals Against</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data?.cleanSheets ?? 0}</Text>
              <Text style={styles.statLabel}>Clean Sheets</Text>
            </View>
          </View>
        ) : null}

        {topPlayers.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Top players</Text>
            {topPlayers.map((player: any, idx: number) => (
              <TopPlayerRow key={`top_player_${String(player?.id || idx)}`} player={player} teamName={String(data?.name || teamName)} league={league} />
            ))}
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent results</Text>
            {recent.map((item: any) => (
              <Text key={`recent_${item.id}`} style={styles.itemText}>
                {item.isHome ? "vs" : "@"} {item.opponent} · {item.homeScore}-{item.awayScore}
              </Text>
            ))}
          </View>
        ) : null}

        {upcoming.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcoming.map((item: any) => (
              <Text key={`next_${item.id}`} style={styles.itemText}>
                {item.isHome ? "vs" : "@"} {item.opponent}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const P = { bg: "#09090D", card: "#12121A", elevated: "#1C1C28", accent: "#E50914", text: "#FFFFFF", muted: "#9D9DAA", border: "rgba(255,255,255,0.08)" };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: P.card },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  content: { padding: 16, gap: 12, paddingBottom: 44 },
  hero: { alignItems: "center", gap: 10, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 18, backgroundColor: P.card, borderWidth: 1, borderColor: P.border },
  teamName: { fontFamily: "Inter_700Bold", fontSize: 22, color: P.text },
  league: { fontFamily: "Inter_500Medium", fontSize: 12, color: P.muted },
  rankBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, marginTop: 4 },
  rankText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  card: { backgroundColor: P.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: P.border },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: P.text, marginBottom: 2 },
  lineLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 7 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: P.muted, flexShrink: 1 },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: P.text, textAlign: "right", flex: 1, minWidth: 0 },
  formRow: { flexDirection: "row", gap: 6, marginVertical: 4 },
  formDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  formWin: { backgroundColor: "rgba(76,175,130,0.25)", borderColor: "#4CAF82" },
  formDraw: { backgroundColor: "rgba(255,180,0,0.25)", borderColor: "#FFB400" },
  formLoss: { backgroundColor: "rgba(255,82,82,0.18)", borderColor: "#FF5252" },
  formDotText: { fontFamily: "Inter_700Bold", fontSize: 10, color: P.text },
  statGridContainer: { flexDirection: "row", gap: 8, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: P.border, paddingBottom: 11 },
  statGridItem: { flex: 1, alignItems: "center" },
  statGridLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: P.muted, marginBottom: 4 },
  statGridValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: P.text },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, backgroundColor: P.card, borderRadius: 12, borderWidth: 1, borderColor: P.border, alignItems: "center", paddingVertical: 12, gap: 3 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: P.text },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: P.muted },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: P.text },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 4 },
  playerPhoto: { width: 38, height: 38, borderRadius: 10, backgroundColor: P.elevated },
  playerPhotoCompact: { width: 34, height: 34, borderRadius: 9 },
  playerPhotoFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: P.border },
  playerPhotoInitials: { fontFamily: "Inter_700Bold", fontSize: 11, color: P.text },
  playerInfo: { flex: 1, minWidth: 0 },
  playerName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: P.text },
  playerMeta: { fontFamily: "Inter_500Medium", fontSize: 10, color: P.muted, marginTop: 2 },
  playerStatWrap: { alignItems: "flex-end", minWidth: 64 },
  playerStatWrapCompact: { minWidth: 52 },
  playerStatLabel: { fontFamily: "Inter_500Medium", fontSize: 9, color: P.muted, textTransform: "uppercase" },
  playerValue: { fontFamily: "Inter_700Bold", fontSize: 11, color: P.accent },
  itemText: { fontFamily: "Inter_500Medium", fontSize: 12, color: P.muted, paddingVertical: 6, paddingHorizontal: 4 },
});
