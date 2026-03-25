import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { TeamLogo } from "@/components/TeamLogo";

function asParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] || fallback);
  return String(value || fallback);
}

function Line({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
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
      return res.json();
    },
    enabled: Boolean(teamId),
  });

  const recent = Array.isArray(data?.recentResults) ? data.recentResults : [];
  const upcoming = Array.isArray(data?.upcomingMatches) ? data.upcomingMatches : [];
  const players = Array.isArray(data?.players) ? data.players : [];
  const topPlayers = [...players]
    .sort((a: any, b: any) => parseMarketValue(b?.marketValue) - parseMarketValue(a?.marketValue))
    .slice(0, 6);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Team Info</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <TeamLogo uri={data?.logo} teamName={data?.name || teamName} size={64} />
          <Text style={styles.teamName}>{data?.name || teamName}</Text>
          <Text style={styles.league}>{data?.leagueName || league}</Text>
        </View>

        <View style={styles.card}>
          <Line label="League" value={String(data?.leagueName || league)} />
          <Line label="Country" value={String(data?.country || "")} />
          <Line label="Founded" value={data?.founded ? String(data.founded) : ""} />
          <Line label="Venue" value={String(data?.venue || "")} />
          <Line label="Stadium capacity" value={data?.stadiumCapacity ? Number(data.stadiumCapacity).toLocaleString() : ""} />
          <Line label="Coach" value={String(data?.coach || "")} />
          <Line label="League rank" value={data?.leagueRank ? `#${data.leagueRank}` : ""} />
          <Line label="Matches played" value={data?.leaguePlayed ? String(data.leaguePlayed) : ""} />
          <Line label="League points" value={data?.leaguePoints ? String(data.leaguePoints) : ""} />
          <Line label="Form" value={String(data?.form || "")} />
          <Line label="Record" value={String(data?.record || "")} />
          <Line label="Club value" value={String(data?.squadMarketValue || "")} />
          <Line label="Goals for / against" value={data?.goalsFor != null && data?.goalsAgainst != null ? `${data.goalsFor} / ${data.goalsAgainst}` : ""} />
          <Line label="Clean sheets" value={data?.cleanSheets != null ? String(data.cleanSheets) : ""} />
          <Line label="Discipline" value={data?.yellowCards != null || data?.redCards != null ? `${data?.yellowCards || 0}Y · ${data?.redCards || 0}R` : ""} />
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
              <View key={`top_player_${String(player?.id || idx)}`} style={styles.playerRow}>
                <Text style={styles.playerName} numberOfLines={1}>{String(player?.name || "Unknown")}</Text>
                <Text style={styles.playerMeta} numberOfLines={1}>{String(player?.positionName || player?.position || "")}</Text>
                <Text style={styles.playerValue}>{String(player?.marketValue || "-")}</Text>
              </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.card },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  hero: { alignItems: "center", gap: 8, paddingVertical: 8 },
  teamName: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text },
  league: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  card: { backgroundColor: COLORS.card, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: COLORS.border },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    paddingVertical: 12,
    gap: 3,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, flex: 1, textAlign: "right" },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  playerName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text },
  playerMeta: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, maxWidth: 80 },
  playerValue: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.accent },
  itemText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary },
});
