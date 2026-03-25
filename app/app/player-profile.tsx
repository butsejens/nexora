import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { normalizeApiError } from "@/lib/error-messages";
import { useTranslation } from "@/lib/useTranslation";
import { t as tFn, getLanguage } from "@/lib/i18n";
import { TeamLogo } from "@/components/TeamLogo";
import { SectionHeader, StateBlock, SurfaceCard } from "@/components/ui/PremiumPrimitives";
import { resolveClubHistoryLogoUri } from "@/lib/logo-manager";
import {
  getCachedPlayerImage,
  getCachedPlayerProfile,
  getPlayerImage,
  preloadPlayerProfileInBackground,
} from "@/lib/player-image-system";

const UNKNOWN = "N/A";

function looksLikeTranslationKey(value: string): boolean {
  return value.includes(".") && !value.includes(" ") && /^[a-z0-9._-]+$/i.test(value);
}

function safeTranslation(key: string, fallback: string): string {
  const translated = tFn(key);
  if (!translated || translated === key || looksLikeTranslationKey(translated)) return fallback;
  return translated;
}

function normalizeText(value: unknown, fallback = UNKNOWN): string {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text.toLowerCase() === "offline data" || looksLikeTranslationKey(text)) return fallback;
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
    theSportsDbPhoto: raw?.theSportsDbPhoto || null,
    age: toAgeNumber(raw?.age) ?? toAgeNumber(params.age),
    birthDate: raw?.birthDate || null,
    nationality: normalizeText(raw?.nationality || params.nationality, ""),
    position: normalizeText(raw?.position || params.position, ""),
    height: normalizeText(raw?.height || params.height),
    weight: normalizeText(raw?.weight || params.weight),
    currentClub: normalizeText(raw?.currentClub || params.team),
    currentClubLogo: raw?.currentClubLogo || null,
    formerClubs: Array.isArray(raw?.formerClubs) ? raw.formerClubs : [],
    marketValue: normalizeText(raw?.marketValue || params.marketValue, safeTranslation("common.notAvailable", "Not available")),
    isRealValue: Boolean(raw?.isRealValue),
    valueMethod: normalizeText(raw?.valueMethod),
    jerseyNumber: normalizeText(raw?.jerseyNumber, ""),
    contractUntil: normalizeText(raw?.contractUntil, ""),
    seasonStats: raw?.seasonStats || null,
    recentForm: raw?.recentForm || null,
    profileMeta: raw?.profileMeta || null,
    strengths: Array.isArray(raw?.strengths) ? raw.strengths : [],
    weaknesses: Array.isArray(raw?.weaknesses) ? raw.weaknesses : [],
    analysis: normalizeText(raw?.analysis, safeTranslation("playerProfile.analysisTempUnavailable", "Analysis is temporarily unavailable")),
    source: normalizeText(raw?.source, "live-data"),
    updatedAt: raw?.updatedAt || null,
    offlineData: Boolean(raw?.offlineData),
  };
}

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { ts } = useTranslation();
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
    photo?: string;
    theSportsDbPhoto?: string;
  }>();

  const tx = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const translated = ts(key, params, fallback);
    return translated || fallback;
  };

  const cacheKey = useMemo(() => {
    const keyRaw = `${params.playerId || ""}_${params.name || ""}_${params.team || ""}_${params.league || ""}`;
    return `player_profile_cache_${encodeURIComponent(keyRaw)}`;
  }, [params.playerId, params.name, params.team, params.league]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["player-profile", params.playerId, params.name, params.team, params.league],
    queryFn: async () => {
      const seed = {
        id: String(params.playerId || ""),
        name: String(params.name || ""),
        team: String(params.team || ""),
        league: String(params.league || "eng.1"),
        sport: "soccer",
      };
      const cachedProfile = getCachedPlayerProfile(seed);
      const cachedImage = getCachedPlayerImage(seed);
      if (cachedProfile) {
        const merged = {
          ...cachedProfile,
          photo: cachedImage || cachedProfile?.photo || null,
        };
        const normalized = normalizePlayerDto(merged, params);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(normalized));
        return normalized;
      }

      // Try to resolve a validated image/profile once before falling back to instant skeleton data.
      try {
        await Promise.race([
          getPlayerImage(seed, { allowNetwork: true, preloadProfile: true }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
        ]);
      } catch {
        // continue with safe fallback
      }

      const refreshedProfile = getCachedPlayerProfile(seed);
      const refreshedImage = getCachedPlayerImage(seed);
      if (refreshedProfile) {
        const merged = {
          ...refreshedProfile,
          photo: refreshedImage || refreshedProfile?.photo || null,
        };
        const normalized = normalizePlayerDto(merged, params);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(normalized));
        return normalized;
      }

      // Never block profile navigation on network; load richer data in background.
      preloadPlayerProfileInBackground(seed);

      const instant = normalizePlayerDto(
        {
          id: seed.id,
          name: seed.name,
          currentClub: seed.team,
          photo: cachedImage || null,
          marketValue: params.marketValue || null,
          age: params.age ? Number(params.age) : undefined,
          position: params.position || null,
          nationality: params.nationality || null,
          height: params.height || null,
          weight: params.weight || null,
          source: "startup-preload",
          offlineData: false,
          updatedAt: new Date().toISOString(),
        },
        params
      );

      await AsyncStorage.setItem(cacheKey, JSON.stringify(instant));
      return instant;
    },
    staleTime: 24 * 60 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const photoCandidates = useMemo(() => {
    const paramPhoto = params.photo ? String(params.photo) : null;
    const paramSportsDb = params.theSportsDbPhoto ? String(params.theSportsDbPhoto) : null;
    const fallbackAvatar = (data?.name || params.name)
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(String(data?.name || params.name || "Player"))}&size=256&background=1a1a2e&color=e0e0e0&bold=true&format=png`
      : null;
    const raw = [data?.photo, data?.theSportsDbPhoto || null, paramPhoto, paramSportsDb, fallbackAvatar].filter(Boolean) as string[];
    return [...new Set(raw)];
  }, [data?.name, data?.photo, data?.theSportsDbPhoto, params.name, params.photo, params.theSportsDbPhoto]);

  const [photoIdx, setPhotoIdx] = useState(0);
  const photoUri = photoCandidates[photoIdx] || null;
  const photoCandidatesKey = photoCandidates.join(",");

  useEffect(() => {
    setPhotoIdx(0);
  }, [photoCandidatesKey]);

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
        <Text style={styles.name} numberOfLines={2}>{normalizeText(data?.name || params.name, tx("playerProfile.player", "Player"))}</Text>

        {/* Collapsible hero details — fades on scroll */}
        <Animated.View style={{ opacity: heroOpacity }}>
        <View style={styles.hero}>
          {photoUri ? (
            <TouchableOpacity onPress={() => setPhotoIdx((i) => (i + 1) % photoCandidates.length)}>
              <Image source={{ uri: photoUri }} style={[styles.photo, { backgroundColor: COLORS.card }]} resizeMode="contain" onError={() => setPhotoIdx((i) => i + 1)} />
              {photoCandidates.length > 1 && (
                <View style={styles.photoDots}>
                  {photoCandidates.map((_, idx) => (
                    <View key={`dot_${idx}`} style={[styles.photoDot, idx === photoIdx && styles.photoDotActive]} />
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.photo, styles.photoFallback, { borderColor: badgeColor }]}> 
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.meta} numberOfLines={2}>{normalizeText(data?.position || params.position)} {normalizeText(data?.nationality || params.nationality, "") ? `· ${normalizeText(data?.nationality || params.nationality)}` : ""}</Text>
          <Text style={[styles.value, data?.isRealValue ? styles.valueReal : null]}>
            {normalizeText(data?.marketValue || params.marketValue, tx("playerProfile.valueUnknown", "Value unavailable"))}
          </Text>
        </View>
        </Animated.View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loading}>
          <StateBlock loading title={tx("playerProfile.loading", "Loading player profile") } message={tx("playerProfile.analysisTempUnavailable", "Analysis is temporarily unavailable")} />
        </View>
      ) : error || !data || (data as any)?.error ? (
        <View style={styles.loading}>
          <StateBlock
            icon="alert-circle-outline"
            title={tx("playerProfile.analysisUnavailable", "Player profile unavailable")}
            message={normalizeApiError(error || (data as any)?.error).userMessage}
            actionLabel={tx("teamDetail.retry", "Retry")}
            onAction={() => refetch()}
          />
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          <Card title={tx("playerProfile.overview", "Overview")}>
            <View style={styles.quickFactsGrid}>
              <QuickFact icon="person-outline" label={tx("playerProfile.age", "Age")} value={data?.age ? tx("playerProfile.years", `${String(data.age)} years`, { age: String(data.age) }) : UNKNOWN} />
              <QuickFact icon="shirt-outline" label={tx("playerProfile.jerseyNumber", "Jersey number")} value={normalizeText(data?.jerseyNumber, tx("common.notAvailable", "Not available"))} />
              <QuickFact icon="body-outline" label={tx("playerProfile.height", "Height")} value={normalizeText(data?.height)} />
              <QuickFact icon="barbell-outline" label={tx("playerProfile.weight", "Weight")} value={normalizeText(data?.weight)} />
            </View>
            <View style={styles.infoDivider} />
            <Row icon="calendar-outline" label={tx("playerProfile.birthDate", "Birth date")} value={data?.birthDate ? formatDisplayDate(data.birthDate) : UNKNOWN} />
            <Row icon="earth" label={tx("playerProfile.nationality", "Nationality")} value={normalizeText(data?.nationality || params.nationality)} />
            <Row icon="soccer-field" label={tx("playerProfile.position", "Position")} value={normalizeText(data?.position || params.position)} />
            <Row icon="file-document-outline" label={tx("playerProfile.contractUntil", "Contract")} value={normalizeText(data?.contractUntil, tx("common.notAvailable", "Not available"))} />
            <ClubRow label={tx("playerProfile.currentClub", "Current club")} value={normalizeText(data?.currentClub || params.team)} logo={data?.currentClubLogo} />
            <Row icon="currency-eur" label={tx("playerProfile.marketValue", "Market value")} value={normalizeText(data?.marketValue || params.marketValue, tx("playerProfile.valueUnknown", "Value unavailable"))} />
            <Row icon="clock-outline" label={tx("playerProfile.lastUpdated", "Last updated")} value={formatUpdatedAt(data?.updatedAt)} />
          </Card>

          <Card title={tx("playerProfile.seasonStats", "Season stats")}>
            <StatsGrid
              items={[
                { label: tx("playerProfile.appearances", "Matches"), value: data?.seasonStats?.appearances },
                { label: tx("playerProfile.goals", "Goals"), value: data?.seasonStats?.goals },
                { label: tx("playerProfile.assists", "Assists"), value: data?.seasonStats?.assists },
                { label: tx("playerProfile.minutes", "Minutes"), value: data?.seasonStats?.minutes },
                { label: tx("playerProfile.starts", "Starts"), value: data?.seasonStats?.starts },
                { label: tx("playerProfile.rating", "Rating"), value: data?.seasonStats?.rating },
              ]}
            />
            {data?.recentForm?.contributionLabel ? (
              <View style={styles.formBadge}>
                <Ionicons name="trending-up-outline" size={12} color="#7EE787" />
                <Text style={styles.formBadgeText}>{data.recentForm.contributionLabel}</Text>
              </View>
            ) : null}
          </Card>

          <Card title={tx("playerProfile.analysis", "Analysis")}>
            <LinearGradient
              colors={["rgba(229,9,20,0.07)", "rgba(17,17,17,0)"]}
              style={{ borderRadius: 10, padding: 12, marginBottom: 4 }}
            >
              <Text style={[styles.analysisText, { color: COLORS.text }]}>{data?.analysis || tx("playerProfile.analysisUnavailable", "Analysis unavailable")}</Text>
            </LinearGradient>

          </Card>

          <Card title={tx("playerProfile.strengths", "Strengths")}>
            <View style={styles.pillWrap}>
              {(Array.isArray(data?.strengths) ? data.strengths : []).slice(0, 6).map((item: string, idx: number) => (
                <Bullet key={`s_${idx}`} text={item} good />
              ))}
              {(Array.isArray(data?.strengths) ? data.strengths : []).length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
            </View>
          </Card>

          <Card title={tx("playerProfile.weaknesses", "Weaknesses")}>
            <View style={styles.pillWrap}>
              {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).slice(0, 6).map((item: string, idx: number) => (
                <Bullet key={`w_${idx}`} text={item} />
              ))}
              {(Array.isArray(data?.weaknesses) ? data.weaknesses : []).length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
            </View>
          </Card>

          <Card title={tx("playerProfile.clubHistory", "Club history")}>
            {(Array.isArray(data?.formerClubs) ? data.formerClubs : []).length === 0 ? (
              <Text style={styles.placeholder}>{tx("playerProfile.noTransferHistory", "No transfer history available")}</Text>
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
                          <TeamLogo
                            uri={club?.logo}
                            resolvedLogo={resolveClubHistoryLogoUri(club?.name || "", club?.logo || null)}
                            teamName={club?.name || "Unknown"}
                            size={32}
                          />
                          <View style={styles.timelineInfo}>
                            <Text style={styles.timelineClub} numberOfLines={1}>{club?.name || tx("common.notAvailable", "Not available")}</Text>
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
    <SurfaceCard style={styles.card} elevated>
      <SectionHeader title={title} />
      {children}
    </SurfaceCard>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelWrap}>
        {icon && <MaterialCommunityIcons name={icon} size={14} color={COLORS.textMuted} />}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
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

function StatsGrid({ items }: { items: { label: string; value: any }[] }) {
  const cleaned = items.filter((x) => x?.label);
  const isGoals = (label: string) => label.toLowerCase().includes("goal");
  const isAssists = (label: string) => label.toLowerCase().includes("assist");
  const isAppearances = (label: string) => label.toLowerCase().includes("match") || label.toLowerCase().includes("appear");
  return (
    <View style={styles.statsGrid}>
      {cleaned.map((item, idx) => {
        const hasValue = item?.value != null && String(item.value).trim() !== "" && String(item.value) !== "0";
        const isKeyMetric = isGoals(item.label) || isAssists(item.label) || isAppearances(item.label);
        return (
          <View key={`${item.label}_${idx}`} style={[styles.statCard, isKeyMetric && styles.statCardHighlight]}>
            <Text style={styles.statLabel} numberOfLines={1}>{item.label}</Text>
            <Text style={[styles.statValue, isGoals(item.label) && styles.statValueGoals, isAssists(item.label) && styles.statValueAssists]}>
              {hasValue ? String(item.value) : (tFn("common.notAvailable") || "Niet beschikbaar")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function QuickFact({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.quickFactCard}>
      <View style={styles.quickFactIconWrap}>
        <Ionicons name={icon} size={14} color={COLORS.accent} />
      </View>
      <Text style={styles.quickFactLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.quickFactValue} numberOfLines={1}>{value}</Text>
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
  photoDots: { flexDirection: "row", justifyContent: "center", gap: 4, marginTop: 8 },
  photoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  photoDotActive: { backgroundColor: COLORS.accent, width: 8 },
  name: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text, textAlign: "center", paddingHorizontal: 16, maxWidth: "100%" },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", paddingHorizontal: 24, maxWidth: "100%" },
  value: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.textMuted },
  valueReal: { color: "#00C896" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, backgroundColor: COLORS.accent },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: COLORS.overlayLight, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 8 },
  rowLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
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
  quickFactsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickFactCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  quickFactIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(229,9,20,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickFactLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted },
  quickFactValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  infoDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 6, marginBottom: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    width: "48%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  statCardHighlight: { borderColor: "rgba(229,9,20,0.4)", backgroundColor: "rgba(229,9,20,0.08)" },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text },
  statValueGoals: { color: "#FF5252" },
  statValueAssists: { color: "#4CAF82" },
  formBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(126,231,135,0.12)",
    borderWidth: 1,
    borderColor: "rgba(126,231,135,0.34)",
  },
  formBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#7EE787" },
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
