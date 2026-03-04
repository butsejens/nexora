import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    playerId?: string;
    name?: string;
    team?: string;
    league?: string;
    marketValue?: string;
  }>();

  const { data, isLoading } = useQuery({
    queryKey: ["player-profile", params.playerId, params.name, params.team, params.league],
    queryFn: async () => {
      const playerId = encodeURIComponent(String(params.playerId || ""));
      const name = encodeURIComponent(String(params.name || ""));
      const team = encodeURIComponent(String(params.team || ""));
      const league = encodeURIComponent(String(params.league || "eng.1"));
      const res = await apiRequest("GET", `/api/sports/player/${playerId}?name=${name}&team=${team}&league=${league}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const photoCandidates = [
    data?.photo,
    params.playerId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(String(params.playerId))}.png` : null,
    params.playerId ? `https://media.api-sports.io/football/players/${encodeURIComponent(String(params.playerId))}.png` : null,
  ].filter(Boolean) as string[];

  const [photoIdx, setPhotoIdx] = useState(0);
  const photoUri = photoCandidates[photoIdx];

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.card, COLORS.background]} style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.hero}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} onError={() => setPhotoIdx((i) => (i + 1 < photoCandidates.length ? i + 1 : i))} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Ionicons name="person" size={34} color={COLORS.textMuted} />
            </View>
          )}
          <Text style={styles.name}>{data?.name || params.name || "Speler"}</Text>
          <Text style={styles.meta}>{data?.position || "—"} {data?.nationality ? `· ${data.nationality}` : ""}</Text>
          <Text style={[styles.value, data?.isRealValue ? styles.valueReal : null]}>
            {data?.marketValue || params.marketValue || "Waarde niet beschikbaar"}
          </Text>
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Spelerprofiel laden...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card title="Overzicht">
            <Row label="Leeftijd" value={data?.age ? String(data.age) : "—"} />
            <Row label="Lengte" value={data?.height || "—"} />
            <Row label="Gewicht" value={data?.weight || "—"} />
            <Row label="Huidige club" value={data?.currentClub || params.team || "—"} />
            <Row label="Waarde bron" value={data?.valueMethod || "estimated"} />
          </Card>

          <Card title="Analyse">
            <Text style={styles.analysisText}>{data?.analysis || "Analyse niet beschikbaar."}</Text>
            <Text style={styles.analysisSource}>Bron: {data?.source || "real-data"}</Text>
          </Card>

          <Card title="Sterktes">
            {(Array.isArray(data?.strengths) ? data.strengths : []).slice(0, 6).map((item: string, idx: number) => (
              <Bullet key={`s_${idx}`} text={item} good />
            ))}
          </Card>

          <Card title="Zwaktes">
            {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).slice(0, 6).map((item: string, idx: number) => (
              <Bullet key={`w_${idx}`} text={item} />
            ))}
          </Card>

          <Card title="Clubhistoriek">
            {(Array.isArray(data?.formerClubs) ? data.formerClubs : []).length === 0 ? (
              <Text style={styles.placeholder}>Geen transferhistoriek beschikbaar.</Text>
            ) : (
              (data.formerClubs as any[]).map((club, idx) => (
                <View key={`${club?.name || "club"}_${idx}`} style={styles.clubRow}>
                  <MaterialCommunityIcons name={club?.role === "to" ? "arrow-right-bold-circle-outline" : "arrow-left-bold-circle-outline"} size={15} color={COLORS.accent} />
                  <Text style={styles.clubName}>{club?.name || "Onbekend"}</Text>
                  <Text style={styles.clubDate}>{club?.date || ""}</Text>
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Bullet({ text, good = false }: { text: string; good?: boolean }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, good ? styles.bulletGood : styles.bulletBad]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  hero: { alignItems: "center", gap: 6 },
  photo: { width: 86, height: 86, borderRadius: 43 },
  photoFallback: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  value: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.textMuted },
  valueReal: { color: "#00C896" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: COLORS.overlayLight, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderLight, padding: 14, gap: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.accent, letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 8 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, flexShrink: 1, textAlign: "right" },
  analysisText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, color: COLORS.textSecondary },
  analysisSource: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.accentDim },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  bulletDot: { width: 7, height: 7, borderRadius: 4 },
  bulletGood: { backgroundColor: "#00C896" },
  bulletBad: { backgroundColor: COLORS.live },
  bulletText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text },
  placeholder: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  clubRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 7 },
  clubName: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text, flex: 1 },
  clubDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
});
