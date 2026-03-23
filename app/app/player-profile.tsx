import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Animated } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { normalizeApiError } from "@/lib/error-messages";
import { useTranslation } from "@/lib/useTranslation";
import { t as tFn, getLanguage } from "@/lib/i18n";
import { TeamLogo } from "@/components/TeamLogo";

const UNKNOWN = "Unknown";

function normalizeText(value: unknown, fallback = UNKNOWN): string {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return fallback;
  return text;
}

function formatUpdatedAt(value: unknown): string {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return UNKNOWN;
  const locale = getLanguage() === "nl" ? "nl-BE" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDisplayDate(value: unknown): string {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return UNKNOWN;
  const locale = getLanguage() === "nl" ? "nl-BE" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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
    birthDate: raw?.birthDate || null,
    nationality: normalizeText(raw?.nationality || params.nationality, ""),
    position: normalizeText(raw?.position || params.position, ""),
    height: normalizeText(raw?.height || params.height),
    weight: normalizeText(raw?.weight || params.weight),
    currentClub: normalizeText(raw?.currentClub || params.team),
    currentClubLogo: raw?.currentClubLogo || null,
    formerClubs: Array.isArray(raw?.formerClubs) ? raw.formerClubs : [],
    marketValue: normalizeText(raw?.marketValue || params.marketValue, tFn("playerProfile.valueUnknown")),
    isRealValue: Boolean(raw?.isRealValue),
    valueMethod: normalizeText(raw?.valueMethod),
    strengths: Array.isArray(raw?.strengths) ? raw.strengths : [],
    weaknesses: Array.isArray(raw?.weaknesses) ? raw.weaknesses : [],
    analysis: normalizeText(raw?.analysis, tFn("playerProfile.analysisTempUnavailable")),
    source: normalizeText(raw?.source, "real-data"),
    updatedAt: raw?.updatedAt || null,
    offlineData: Boolean(raw?.offlineData),
  };
}

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
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

  const { data, isLoading, error, refetch } = useQuery({
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
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const photoCandidates = useMemo(() => {
    const fallbackAvatar = (data?.name || params.name)
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(String(data?.name || params.name || "Player"))}&size=256&background=1a1a2e&color=e0e0e0&bold=true&format=png`
      : null;
    const raw = [data?.photo, data?.theSportsDbPhoto || null, fallbackAvatar].filter(Boolean) as string[];
    return [...new Set(raw)];
  }, [data?.name, data?.photo, data?.theSportsDbPhoto, params.name]);

  const [photoIdx, setPhotoIdx] = useState(0);
  const photoUri = photoCandidates[photoIdx] || null;

  useEffect(() => {
    setPhotoIdx(0);
  }, [photoCandidates.join(",")]);

  const badgeColor = colorFromSeed(`${data?.currentClub || params.team || "nexora"}`);
  const initials = initialsFromName(String(data?.name || params.name || "?"));

  const scrollY = useRef(new Animated.Value(0)).current;
  const heroOpacity = scrollY.interpolate({ inputRange: [0, 120], outputRange: [1, 1], extrapolate: "clamp" });

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.card, COLORS.background]} style={[styles.header, { paddingTop: insets.top + 10, zIndex: 30, elevation: 30 }]}> 
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {/* Player name — always visible */}
        <Text style={styles.name} numberOfLines={2}>{normalizeText(data?.name || params.name, t("playerProfile.player"))}</Text>

        {/* Collapsible hero details — fades on scroll */}
        <Animated.View style={{ opacity: heroOpacity }}>
        <View style={styles.hero}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: COLORS.card }]} resizeMode="contain" onError={() => setPhotoIdx((i) => i + 1)} />
          ) : (
            <View style={[styles.photo, styles.photoFallback, { borderColor: badgeColor }]}> 
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.meta} numberOfLines={2}>{normalizeText(data?.position || params.position)} {normalizeText(data?.nationality || params.nationality, "") ? `· ${normalizeText(data?.nationality || params.nationality)}` : ""}</Text>
          <Text style={[styles.value, data?.isRealValue ? styles.valueReal : null]}>
            {normalizeText(data?.marketValue || params.marketValue, t("playerProfile.valueUnknown"))}
          </Text>
          {data?.offlineData ? (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={12} color={COLORS.gold} />
              <Text style={styles.offlineText}>{t("playerProfile.offlineData")}</Text>
            </View>
          ) : null}
        </View>
        </Animated.View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>{t("playerProfile.loading")}</Text>
        </View>
      ) : error || !data || (data as any)?.error ? (
        <View style={styles.loading}>
          <Ionicons name="alert-circle-outline" size={38} color={COLORS.textMuted} />
          <Text style={styles.loadingText}>{normalizeApiError(error || (data as any)?.error).userMessage}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>{t("teamDetail.retry") || "Opnieuw proberen"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          <Card title={t("playerProfile.overview")}>
            <Row label={t("playerProfile.age")} value={data?.age ? t("playerProfile.years", { age: String(data.age) }) : UNKNOWN} />
            <Row label={t("playerProfile.birthDate")} value={data?.birthDate ? formatDisplayDate(data.birthDate) : UNKNOWN} />
            <Row label={t("playerProfile.nationality")} value={normalizeText(data?.nationality || params.nationality)} />
            <Row label={t("playerProfile.position")} value={normalizeText(data?.position || params.position)} />
            <Row label={t("playerProfile.height")} value={normalizeText(data?.height)} />
            <Row label={t("playerProfile.weight")} value={normalizeText(data?.weight)} />
            <ClubRow label={t("playerProfile.currentClub")} value={normalizeText(data?.currentClub || params.team)} logo={data?.currentClubLogo} />
            <Row label={t("playerProfile.marketValue")} value={normalizeText(data?.marketValue || params.marketValue, t("playerProfile.valueUnknown"))} />
            <Row label={t("playerProfile.lastUpdated")} value={formatUpdatedAt(data?.updatedAt)} />
          </Card>

          <Card title={t("playerProfile.analysis")}>
            <LinearGradient
              colors={["rgba(229,9,20,0.07)", "rgba(17,17,17,0)"]}
              style={{ borderRadius: 10, padding: 12, marginBottom: 4 }}
            >
              <Text style={[styles.analysisText, { color: COLORS.text }]}>{data?.analysis || t("playerProfile.analysisUnavailable")}</Text>
            </LinearGradient>

          </Card>

          <Card title={t("playerProfile.strengths")}>
            <View style={styles.pillWrap}>
              {(Array.isArray(data?.strengths) ? data.strengths : []).slice(0, 6).map((item: string, idx: number) => (
                <Bullet key={`s_${idx}`} text={item} good />
              ))}
              {(Array.isArray(data?.strengths) ? data.strengths : []).length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
            </View>
          </Card>

          <Card title={t("playerProfile.weaknesses")}>
            <View style={styles.pillWrap}>
              {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).slice(0, 6).map((item: string, idx: number) => (
                <Bullet key={`w_${idx}`} text={item} />
              ))}
              {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
            </View>
          </Card>

          <Card title={t("playerProfile.clubHistory")}>
            {(Array.isArray(data?.formerClubs) ? data.formerClubs : []).length === 0 ? (
              <Text style={styles.placeholder}>{t("playerProfile.noTransferHistory")}</Text>
            ) : (
              <View style={styles.timeline}>
                {((data?.formerClubs ?? []) as any[]).map((club, idx, arr) => {
                  const isLast = idx === arr.length - 1;
                  const isJoin = club?.role === "to";
                  return (
                    <View key={`${club?.name || "club"}_${idx}`} style={styles.timelineItem}>
                      {/* Timeline line */}
                      <View style={styles.timelineSide}>
                        <View style={[styles.timelineDot, isJoin ? styles.timelineDotJoin : styles.timelineDotLeave]} />
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>
                      {/* Content */}
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineRow}>
                          <TeamLogo uri={club?.logo} teamName={club?.name || "Unknown"} size={32} />
                          <View style={styles.timelineInfo}>
                            <Text style={styles.timelineClub} numberOfLines={1}>{club?.name || "Unknown"}</Text>
                            <View style={styles.timelineMetaRow}>
                              <Text style={styles.timelineLabel}>{isJoin ? "Joined" : "Left"}</Text>
                              {club?.date ? <Text style={styles.timelineDate}>{club.date}</Text> : null}
                            </View>
                            {club?.fee ? <Text style={styles.timelineFee}>{club.fee}</Text> : null}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </Animated.ScrollView>
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
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function ClubRow({ label, value, logo }: { label: string; value: string; logo?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.clubValueRow}>
        {logo ? <TeamLogo uri={logo} teamName={value} size={24} /> : null}
        <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function Bullet({ text, good = false }: { text: string; good?: boolean }) {
  return (
    <View style={[styles.bulletPill, good ? styles.bulletPillGood : styles.bulletPillBad]}>
      <Ionicons
        name={good ? "checkmark-circle" : "close-circle"}
        size={13}
        color={good ? "#4CAF82" : "#FF5252"}
      />
      <Text style={[styles.bulletText, { color: good ? "#4CAF82" : "#FF5252" }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  hero: { alignItems: "center", gap: 6 },
  photo: { width: 130, height: 130, borderRadius: 18, borderWidth: 0 },
  photoFallback: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)" },
  photoInitials: { fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text },
  name: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text, textAlign: "center", paddingHorizontal: 16, maxWidth: "100%" },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", paddingHorizontal: 24, maxWidth: "100%" },
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
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, backgroundColor: COLORS.accent },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: COLORS.overlayLight, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderLight, padding: 14, gap: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.accent, letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 8 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, flexShrink: 1, textAlign: "right", maxWidth: "60%" },
  clubValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 1, maxWidth: "60%" },
  analysisText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, color: COLORS.textSecondary },
  analysisSource: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.accentDim },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingRight: 4 },
  bulletPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, maxWidth: "100%", flexShrink: 1,
  },
  bulletPillGood: { backgroundColor: "rgba(76,175,130,0.12)", borderColor: "rgba(76,175,130,0.35)" },
  bulletPillBad: { backgroundColor: "rgba(255,82,82,0.12)", borderColor: "rgba(255,82,82,0.35)" },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  bulletDot: { width: 7, height: 7, borderRadius: 4 },
  bulletGood: { backgroundColor: "#00C896" },
  bulletBad: { backgroundColor: COLORS.live },
  bulletText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.text, flexShrink: 1 },
  placeholder: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  clubRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 7 },
  clubName: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text, flex: 1 },
  clubDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  // Timeline styles
  timeline: { gap: 0 },
  timelineItem: { flexDirection: "row", minHeight: 56 },
  timelineSide: { width: 24, alignItems: "center" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 11 },
  timelineDotJoin: { backgroundColor: "#4CAF82" },
  timelineDotLeave: { backgroundColor: COLORS.accent },
  timelineLine: { width: 2, flex: 1, backgroundColor: COLORS.border, marginVertical: 2 },
  timelineContent: { flex: 1, paddingBottom: 12, paddingLeft: 8 },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timelineInfo: { flex: 1, gap: 2 },
  timelineClub: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  timelineMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timelineLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  timelineDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textSecondary },
  timelineFee: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#00C896", marginTop: 2 },
});
