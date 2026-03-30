import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { TeamLogo } from "@/components/TeamLogo";
import { NexoraSimpleHeader } from "@/components/NexoraSimpleHeader";
import { resolveCompetitionBrand } from "@/lib/logo-manager";
import { useTeam } from "@/hooks/useTeam";
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

function guessCountryFromLeagueCode(leagueCode: string): string {
  const code = String(leagueCode || "").toLowerCase();
  if (code.startsWith("bel.")) return "Belgium";
  if (code.startsWith("eng.")) return "England";
  if (code.startsWith("esp.")) return "Spain";
  if (code.startsWith("ita.")) return "Italy";
  if (code.startsWith("ger.")) return "Germany";
  if (code.startsWith("fra.")) return "France";
  if (code.startsWith("ned.")) return "Netherlands";
  if (code.startsWith("por.")) return "Portugal";
  if (code.startsWith("tur.")) return "Turkey";
  if (code.startsWith("fifa") || code.startsWith("uefa")) return "International";
  return "";
}

function parseRecord(record: unknown): { wins: number; draws: number; losses: number } {
  const text = String(record || "").trim();
  if (!text) return { wins: 0, draws: 0, losses: 0 };
  const match = text.match(/(\d+)\s*[-/]\s*(\d+)\s*[-/]\s*(\d+)/);
  if (!match) return { wins: 0, draws: 0, losses: 0 };
  return {
    wins: Number(match[1] || 0),
    draws: Number(match[2] || 0),
    losses: Number(match[3] || 0),
  };
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
          <Ionicons name="person" size={14} color={P.muted} />
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
  const params = useLocalSearchParams<{ teamId?: string; teamName?: string; league?: string; sport?: string }>();
  const teamId = asParam(params.teamId, "");
  const teamName = asParam(params.teamName, "Team");
  const league = asParam(params.league, "eng.1");
  const sport = asParam(params.sport, "soccer");

  const { data } = useTeam({
    teamId,
    teamName,
    league,
    sport,
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
  const competitionBrand = useMemo(
    () => resolveCompetitionBrand({ name: String(data?.leagueName || leagueLabel || league), espnLeague: String(league || "") }),
    [data?.leagueName, league, leagueLabel],
  );
  const seasonStats = useMemo(() => {
    const fromRecord = parseRecord(data?.record);
    const played = toNumber(data?.leaguePlayed ?? data?.played ?? data?.matchesPlayed);
    const wins = toNumber(data?.wins ?? fromRecord.wins);
    const draws = toNumber(data?.draws ?? fromRecord.draws);
    const losses = toNumber(data?.losses ?? fromRecord.losses);
    const points = toNumber(data?.leaguePoints ?? data?.points);
    const goalsFor = toNumber(data?.goalsFor);
    const goalsAgainst = toNumber(data?.goalsAgainst);
    const goalDiff = goalsFor - goalsAgainst;
    const ppg = played > 0 && points > 0 ? (points / played).toFixed(2) : "-";
    const winRate = played > 0 && wins >= 0 ? `${Math.round((wins / played) * 100)}%` : "-";
    return { played, wins, draws, losses, points, goalsFor, goalsAgainst, goalDiff, ppg, winRate };
  }, [data]);
  const resolvedCountry = useMemo(() => {
    const raw = String(data?.country || "").trim();
    const team = String(data?.name || teamName || "").trim().toLowerCase();
    if (raw && raw.toLowerCase() !== team && !isLeagueCode(raw)) return raw;
    return guessCountryFromLeagueCode(league) || "Unknown";
  }, [data?.country, data?.name, league, teamName]);
  const topScorerLabel = String((data?.topScorer as any)?.name || "").trim()
    ? `${(data?.topScorer as any)?.name}${(data?.topScorer as any)?.goals ? ` · ${(data?.topScorer as any)?.goals}G` : ""}`
    : "";
  const topAssistLabel = String((data?.topAssist as any)?.name || "").trim()
    ? `${(data?.topAssist as any)?.name}${(data?.topAssist as any)?.assists ? ` · ${(data?.topAssist as any)?.assists}A` : ""}`
    : "";

  const heroColor = data?.color || "#E50914";

  return (
    <View style={styles.container}>
      <NexoraSimpleHeader title={data?.name || teamName} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { borderColor: `${heroColor}44` }]}>
          <View style={styles.posterLogoWrap}>
            <View style={styles.posterLogoGlow} />
            <TeamLogo uri={data?.logo} teamName={data?.name || teamName} size={118} />
          </View>
          <Text style={styles.teamName}>{data?.name || teamName}</Text>
          {competitionBrand?.name ? <Text style={styles.league} numberOfLines={1}>{competitionBrand.name}</Text> : null}
          {data?.leagueRank && (
            <View style={[styles.rankBadge, { backgroundColor: `${heroColor}22`, borderColor: heroColor }]}>
              <Text style={[styles.rankText, { color: heroColor }]}>#{data.leagueRank}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Club Highlights</Text>
          <Line label="League Position" value={data?.leagueRank ? `#${data.leagueRank}` : ""} icon="trophy-outline" />
          <Line label="Points" value={seasonStats.points > 0 ? String(seasonStats.points) : ""} icon="star-outline" />
          <Line label="Matches" value={seasonStats.played > 0 ? String(seasonStats.played) : ""} icon="soccer" />
          <Line label="Club Value" value={String(data?.squadMarketValue || "")} icon="currency-eur" />
          <Line label="Top Scorer" value={topScorerLabel} icon="trophy" />
          <Line label="Top Assist" value={topAssistLabel} icon="target" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>General Info</Text>
          <View style={styles.line}>
            <View style={styles.lineLeft}>
              <MaterialCommunityIcons name="soccer-field" size={14} color="#9D9DAA" />
              <Text style={styles.label}>League</Text>
            </View>
            <View style={styles.leagueValueRow}>
              <TeamLogo uri={typeof competitionBrand?.logo === "string" ? competitionBrand.logo : null} resolvedLogo={typeof competitionBrand?.logo === "number" ? competitionBrand.logo : undefined} teamName={competitionBrand?.name || leagueLabel} size={18} />
              <Text style={styles.value} numberOfLines={1}>{competitionBrand?.name || leagueLabel}</Text>
            </View>
          </View>
          <Line label="Country" value={resolvedCountry} icon="earth" />
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
              <Text style={styles.statGridValue}>{seasonStats.played || "-"}</Text>
            </View>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Wins</Text>
              <Text style={[styles.statGridValue, { color: "#4CAF82" }]}>{seasonStats.wins || "-"}</Text>
            </View>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Draws</Text>
              <Text style={[styles.statGridValue, { color: "#FFB400" }]}>{seasonStats.draws || "-"}</Text>
            </View>
            <View style={styles.statGridItem}>
              <Text style={styles.statGridLabel}>Losses</Text>
              <Text style={[styles.statGridValue, { color: "#FF5252" }]}>{seasonStats.losses || "-"}</Text>
            </View>
          </View>
          <Line label="Points" value={seasonStats.points > 0 ? String(seasonStats.points) : ""} icon="star-outline" />
          <Line label="Goal Difference" value={Number.isFinite(seasonStats.goalDiff) ? String(seasonStats.goalDiff) : ""} icon="plus-minus" />
          <Line label="Points per match" value={seasonStats.ppg} icon="chart-line" />
          <Line label="Win rate" value={seasonStats.winRate} icon="percent" />
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
          <Line label="Goals For" value={seasonStats.goalsFor > 0 ? String(seasonStats.goalsFor) : ""} icon="soccer" />
          <Line label="Goals Against" value={seasonStats.goalsAgainst > 0 ? String(seasonStats.goalsAgainst) : ""} icon="shield-outline" />
          <Line label="Clean Sheets" value={data?.cleanSheets != null ? String(data.cleanSheets) : ""} icon="check-circle-outline" />
          <Line label="Top Scorer" value={topScorerLabel} icon="trophy-outline" />
          <Line label="Top Assist" value={topAssistLabel} icon="target" />
          <Line label="Discipline" value={data?.yellowCards != null || data?.redCards != null ? `${data?.yellowCards || 0}Y · ${data?.redCards || 0}R` : ""} icon="alert-outline" />
          <Line label="Club Value" value={String(data?.squadMarketValue || "")} icon="currency-eur" />
        </View>

        {(seasonStats.goalsFor != null || seasonStats.goalsAgainst != null || data?.cleanSheets != null) ? (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{seasonStats.goalsFor ?? 0}</Text>
              <Text style={styles.statLabel}>Goals For</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{seasonStats.goalsAgainst ?? 0}</Text>
              <Text style={styles.statLabel}>Goals Against</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{Number(data?.cleanSheets ?? 0)}</Text>
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
  content: { padding: 16, gap: 12, paddingBottom: 44 },
  hero: { alignItems: "center", gap: 10, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 18, backgroundColor: P.card, borderWidth: 1, borderColor: P.border },
  posterLogoWrap: {
    width: 136,
    height: 136,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
  },
  posterLogoGlow: {
    position: "absolute",
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: "rgba(0,126,255,0.10)",
  },
  teamName: { fontFamily: "Inter_700Bold", fontSize: 22, color: P.text },
  league: { fontFamily: "Inter_500Medium", fontSize: 12, color: P.muted },
  rankBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, marginTop: 4 },
  rankText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  card: { backgroundColor: P.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: P.border },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: P.text, marginBottom: 2 },
  lineLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  leagueValueRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end", minWidth: 0 },
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
