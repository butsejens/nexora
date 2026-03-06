import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const UNKNOWN = "Onbekend";

function normalizeText(value: unknown, fallback = UNKNOWN): string {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return fallback;
  return text;
}

function formatUpdatedAt(value: unknown): string {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return UNKNOWN;
  return new Intl.DateTimeFormat("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function initialsFromName(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function colorFromSeed(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 68%, 44%)`;
}

function toAgeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePlayerDto(raw: any, params: {
  name?: string;
  team?: string;
  marketValue?: string;
  age?: string;
  height?: string;
  weight?: string;
  position?: string;
  nationality?: string;
}) {
  const baseName = normalizeText(raw?.name || params.name);
  return {
    id: normalizeText(raw?.id, ""),
    name: baseName,
    photo: raw?.photo || null,
    age: toAgeNumber(raw?.age) ?? toAgeNumber(params.age),
    nationality: normalizeText(raw?.nationality || params.nationality, ""),
    position: normalizeText(raw?.position || params.position, ""),
    height: normalizeText(raw?.height || params.height),
    weight: normalizeText(raw?.weight || params.weight),
    currentClub: normalizeText(raw?.currentClub || params.team),
    formerClubs: Array.isArray(raw?.formerClubs) ? raw.formerClubs : [],
    marketValue: normalizeText(raw?.marketValue || params.marketValue, "Waarde onbekend"),
    isRealValue: Boolean(raw?.isRealValue),
    valueMethod: normalizeText(raw?.valueMethod),
    strengths: Array.isArray(raw?.strengths) ? raw.strengths : [],
    weaknesses: Array.isArray(raw?.weaknesses) ? raw.weaknesses : [],
    analysis: normalizeText(raw?.analysis, "Analyse tijdelijk niet beschikbaar."),
    source: normalizeText(raw?.source, "real-data"),
    updatedAt: raw?.updatedAt || null,
    offlineData: Boolean(raw?.offlineData),
  };
}

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    playerId?: string;
    name?: string;
    team?: string;
    league?: string;
    marketValue?: string;
    age?: string;
    height?: string;
    weight?: string;
    position?: string;
    nationality?: string;
  }>();

  const cacheKey = useMemo(() => {
    const keyRaw = `${params.playerId || ""}_${params.name || ""}_${params.team || ""}_${params.league || ""}`;
    return `player_profile_cache_${encodeURIComponent(keyRaw)}`;
  }, [params.playerId, params.name, params.team, params.league]);

  const { data, isLoading } = useQuery({
    queryKey: ["player-profile", params.playerId, params.name, params.team, params.league],
    queryFn: async () => {
      try {
        const playerId = encodeURIComponent(String(params.playerId || ""));
        const name = encodeURIComponent(String(params.name || ""));
        const team = encodeURIComponent(String(params.team || ""));
        const league = encodeURIComponent(String(params.league || "eng.1"));
        const res = await apiRequest("GET", `/api/sports/player/${playerId}?name=${name}&team=${team}&league=${league}`);
        const json = await res.json();
        const normalized = normalizePlayerDto(json, params);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(normalized));
        return normalized;
      } catch (error) {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return normalizePlayerDto({ ...parsed, offlineData: true }, params);
        }
        throw error;
      }
    },
    staleTime: 60_000,
  });

  const safePlayerId = /^\d+$/.test(String(params.playerId || "").trim()) ? String(params.playerId).trim() : "";
  const photoCandidates = [
    data?.photo,
    safePlayerId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(safePlayerId)}.png` : null,
  ].filter(Boolean) as string[];

  const [photoIdx, setPhotoIdx] = useState(0);
  const photoUri = photoCandidates[photoIdx];

  useEffect(() => {
    setPhotoIdx(0);
  }, [photoCandidates.length]);

  const badgeColor = colorFromSeed(`${data?.currentClub || params.team || "nexora"}`);
  const initials = initialsFromName(String(data?.name || params.name || "?"));

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.card, COLORS.background]} style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.hero}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: COLORS.card }]} resizeMode="contain" onError={() => setPhotoIdx((i) => (i + 1 < photoCandidates.length ? i + 1 : i))} />
          ) : (
            <View style={[styles.photo, styles.photoFallback, { borderColor: badgeColor }]}> 
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{normalizeText(data?.name || params.name, "Speler")}</Text>
          <Text style={styles.meta}>{normalizeText(data?.position || params.position)} {normalizeText(data?.nationality || params.nationality, "") ? `· ${normalizeText(data?.nationality || params.nationality)}` : ""}</Text>
          <Text style={[styles.value, data?.isRealValue ? styles.valueReal : null]}>
            {normalizeText(data?.marketValue || params.marketValue, "Waarde onbekend")}
          </Text>
          {data?.offlineData ? (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={12} color={COLORS.gold} />
              <Text style={styles.offlineText}>Offline data</Text>
            </View>
          ) : null}
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
            <Row label="Leeftijd" value={data?.age ? `${String(data.age)} jaar` : UNKNOWN} />
            <Row label="Lengte" value={normalizeText(data?.height)} />
            <Row label="Gewicht" value={normalizeText(data?.weight)} />
            <Row label="Huidige club" value={normalizeText(data?.currentClub || params.team)} />
            <Row label="Waarde bron" value={normalizeText(data?.valueMethod)} />
            <Row label="Laatste update" value={formatUpdatedAt(data?.updatedAt)} />
          </Card>

          <Card title="Analyse">
            <Text style={styles.analysisText}>{data?.analysis || "Analyse niet beschikbaar."}</Text>
            <Text style={styles.analysisSource}>Bron: {data?.source || "real-data"}</Text>
          </Card>

          <Card title="Sterktes">
            {(Array.isArray(data?.strengths) ? data.strengths : []).slice(0, 6).map((item: string, idx: number) => (
              <Bullet key={`s_${idx}`} text={item} good />
            ))}
            {(Array.isArray(data?.strengths) ? data.strengths : []).length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
          </Card>

          <Card title="Zwaktes">
            {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).slice(0, 6).map((item: string, idx: number) => (
              <Bullet key={`w_${idx}`} text={item} />
            ))}
            {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
          </Card>

          <Card title="Clubhistoriek">
            {(Array.isArray(data?.formerClubs) ? data.formerClubs : []).length === 0 ? (
              <Text style={styles.placeholder}>Geen transferhistoriek beschikbaar.</Text>
            ) : (
              ((data?.formerClubs ?? []) as any[]).map((club, idx) => (
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
  photoFallback: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  photoInitials: { fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text },
  name: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  value: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.textMuted },
  valueReal: { color: "#00C896" },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(250,204,21,0.12)",
    borderColor: "rgba(250,204,21,0.35)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  offlineText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.gold },
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
