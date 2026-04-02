import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { NexoraSimpleHeader } from "@/components/NexoraSimpleHeader";
import { normalizeApiError } from "@/lib/error-messages";
import { enrichPlayerProfilePayload } from "@/lib/sports-enrichment";
import { useTranslation } from "@/lib/useTranslation";
import { t as tFn, getLanguage } from "@/lib/i18n";
import { TeamLogo } from "@/components/TeamLogo";
import { SectionHeader, StateBlock, SurfaceCard } from "@/components/ui/PremiumPrimitives";
import { resolveClubHistoryLogoUri, resolveTeamLogoUri } from "@/lib/logo-manager";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { fetchPlayer } from "@/api/playerApi";
import {
  getBestCachedOrSeedPlayerImage,
  getCachedPlayerImage,
  getCachedPlayerProfile,
  getPlayerImage,
  preloadPlayerProfileInBackground,
  resolvePlayerImageUri,
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

function hasMeaningfulText(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return !["-", "n/a", "na", "unknown", "not available", "offline data", "null"].includes(text);
}

function hasNumericValue(value: unknown): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
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

function stripRichText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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
    marketValue: normalizeText(stripRichText(raw?.marketValue || params.marketValue), safeTranslation("common.notAvailable", "Not available")),
    isRealValue: Boolean(raw?.isRealValue),
    valueMethod: normalizeText(raw?.valueMethod),
    jerseyNumber: normalizeText(raw?.jerseyNumber, ""),
    contractUntil: normalizeText(raw?.contractUntil, ""),
    seasonStats: raw?.seasonStats || null,
    recentForm: raw?.recentForm || null,
    profileMeta: raw?.profileMeta || null,
    strengths: Array.isArray(raw?.strengths) ? raw.strengths : [],
    weaknesses: Array.isArray(raw?.weaknesses) ? raw.weaknesses : [],
    analysis: normalizeText(stripRichText(raw?.analysis), safeTranslation("playerProfile.analysisTempUnavailable", "Analysis is temporarily unavailable")),
    source: normalizeText(raw?.source, "live-data"),
    updatedAt: raw?.updatedAt || null,
    offlineData: Boolean(raw?.offlineData),
  };
}

export default function PlayerProfileScreen() {
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

  const tx = useCallback((key: string, fallback: string, params?: Record<string, string | number>) => {
    const translated = ts(key, params, fallback);
    return translated || fallback;
  }, [ts]);

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
      if (seed.id) {
        try {
          const liveProfile = await fetchPlayer({
            playerId: seed.id,
            name: seed.name,
            team: seed.team,
            league: seed.league,
            sport: seed.sport,
          });
          const mergedLiveProfile = enrichPlayerProfilePayload({
            ...liveProfile,
            photo: liveProfile?.photo || params.photo || null,
            theSportsDbPhoto: liveProfile?.theSportsDbPhoto || params.theSportsDbPhoto || null,
          }, seed);
          const normalizedLiveProfile = normalizePlayerDto(mergedLiveProfile, params);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(normalizedLiveProfile));
          return normalizedLiveProfile;
        } catch {
          // fall through to cached and instant fallback sources
        }
      }

      const cachedProfile = getCachedPlayerProfile(seed);
      const cachedImage = getCachedPlayerImage(seed);
      if (cachedProfile) {
        const merged = enrichPlayerProfilePayload({
          ...cachedProfile,
          photo: cachedImage || cachedProfile?.photo || null,
        }, seed);
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
        const merged = enrichPlayerProfilePayload({
          ...refreshedProfile,
          photo: refreshedImage || refreshedProfile?.photo || null,
        }, seed);
        const normalized = normalizePlayerDto(merged, params);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(normalized));
        return normalized;
      }

      // Never block profile navigation on network; load richer data in background.
      preloadPlayerProfileInBackground(seed);

      const instantPayload = enrichPlayerProfilePayload(
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
        seed
      );

      const instant = normalizePlayerDto(instantPayload, params);

      await AsyncStorage.setItem(cacheKey, JSON.stringify(instant));
      return instant;
    },
    staleTime: 24 * 60 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const { data: aiAnalysis } = useAIAnalysis({
    playerId: String(params.playerId || ""),
    name: String(params.name || ""),
    team: String(params.team || ""),
    league: String(params.league || "eng.1"),
    language: "nl",
  });

  const mergedAnalysisText = aiAnalysis?.summary || data?.analysis || tx("playerProfile.analysisUnavailable", "Analysis unavailable");
  const mergedStrengths = (Array.isArray(aiAnalysis?.strengths) && aiAnalysis?.strengths.length > 0)
    ? aiAnalysis.strengths
    : (Array.isArray(data?.strengths) ? data.strengths : []);
  const mergedWeaknesses = (Array.isArray(aiAnalysis?.weaknesses) && aiAnalysis?.weaknesses.length > 0)
    ? aiAnalysis.weaknesses
    : (Array.isArray(data?.weaknesses) ? data.weaknesses : []);

  const playerImageSeed = useMemo(() => ({
    id: String(params.playerId || data?.id || ""),
    name: String(data?.name || params.name || ""),
    team: String(data?.currentClub || params.team || ""),
    league: String(params.league || "eng.1"),
    sport: "soccer",
    photo: data?.photo || (params.photo ? String(params.photo) : null),
    theSportsDbPhoto: data?.theSportsDbPhoto || (params.theSportsDbPhoto ? String(params.theSportsDbPhoto) : null),
    nationality: String(data?.nationality || params.nationality || ""),
    position: String(data?.position || params.position || ""),
    age: data?.age ?? undefined,
  }), [
    params.playerId,
    params.name,
    params.team,
    params.league,
    params.photo,
    params.theSportsDbPhoto,
    params.nationality,
    params.position,
    data?.id,
    data?.name,
    data?.currentClub,
    data?.photo,
    data?.theSportsDbPhoto,
    data?.nationality,
    data?.position,
    data?.age,
  ]);
  const [photoUri, setPhotoUri] = useState<string | null>(getBestCachedOrSeedPlayerImage(playerImageSeed));
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoUri(getBestCachedOrSeedPlayerImage(playerImageSeed));
    setPhotoFailed(false);
  }, [playerImageSeed]);

  useEffect(() => {
    let disposed = false;
    void resolvePlayerImageUri(playerImageSeed, { allowNetwork: true, preloadProfile: true }).then((uri) => {
      if (disposed || !uri) return;
      setPhotoUri(uri);
      setPhotoFailed(false);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [playerImageSeed]);

  const badgeColor = colorFromSeed(`${data?.currentClub || params.team || "nexora"}`);
  const initials = initialsFromName(String(data?.name || params.name || "?"));
  const transferTimeline = useMemo(() => {
    const rows = Array.isArray(data?.formerClubs) ? data.formerClubs : [];
    return rows
      .map((club: any) => ({
        ...club,
        action: String(club?.action || "").trim().toLowerCase() || (String(club?.role || "").toLowerCase() === "to" ? "joined" : "left"),
        actionLabel: String(club?.actionLabel || "").trim() || (String(club?.role || "").toLowerCase() === "to" ? "Joined" : "Left"),
        date: stripRichText(club?.date),
        fee: stripRichText(club?.fee),
        note: stripRichText(club?.note),
        moment: Number(club?.moment) || Date.parse(String(club?.date || "")) || Number.MAX_SAFE_INTEGER,
      }))
      .sort((a: any, b: any) => {
        if (a.moment !== b.moment) return b.moment - a.moment;
        const priority: Record<string, number> = { joined: 0, loan: 1, loan_end: 2, left: 3, transfer_fee: 4 };
        if ((priority[a.action] ?? 9) !== (priority[b.action] ?? 9)) return (priority[a.action] ?? 9) - (priority[b.action] ?? 9);
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      });
  }, [data?.formerClubs]);

  const overviewFacts = useMemo(() => {
    const facts = [
      { icon: "person-outline" as const, label: tx("playerProfile.age", "Age"), value: data?.age ? tx("playerProfile.years", `${String(data.age)} years`, { age: String(data.age) }) : "" },
      { icon: "shirt-outline" as const, label: tx("playerProfile.jerseyNumber", "Jersey number"), value: hasMeaningfulText(data?.jerseyNumber) ? String(data?.jerseyNumber) : "" },
      { icon: "body-outline" as const, label: tx("playerProfile.height", "Height"), value: hasMeaningfulText(data?.height) ? String(data?.height) : "" },
      { icon: "barbell-outline" as const, label: tx("playerProfile.weight", "Weight"), value: hasMeaningfulText(data?.weight) ? String(data?.weight) : "" },
    ];
    return facts.filter((fact) => hasMeaningfulText(fact.value));
  }, [data?.age, data?.jerseyNumber, data?.height, data?.weight, tx]);

  const seasonStatItems = useMemo(() => {
    return [
      { label: tx("playerProfile.appearances", "Matches"), value: data?.seasonStats?.appearances },
      { label: tx("playerProfile.goals", "Goals"), value: data?.seasonStats?.goals },
      { label: tx("playerProfile.assists", "Assists"), value: data?.seasonStats?.assists },
      { label: tx("playerProfile.minutes", "Minutes"), value: data?.seasonStats?.minutes },
      { label: tx("playerProfile.starts", "Starts"), value: data?.seasonStats?.starts },
      { label: tx("playerProfile.rating", "Rating"), value: data?.seasonStats?.rating },
      { label: tx("playerProfile.cleanSheets", "Clean sheets"), value: data?.seasonStats?.cleanSheets },
      { label: tx("playerProfile.saves", "Saves"), value: data?.seasonStats?.saves },
    ];
  }, [
    data?.seasonStats?.appearances,
    data?.seasonStats?.goals,
    data?.seasonStats?.assists,
    data?.seasonStats?.minutes,
    data?.seasonStats?.starts,
    data?.seasonStats?.rating,
    data?.seasonStats?.cleanSheets,
    data?.seasonStats?.saves,
    tx,
  ]);

  const seasonVisibleCount = useMemo(() => {
    return seasonStatItems.filter((item) => hasNumericValue(item.value)).length;
  }, [seasonStatItems]);
  const useCompactSeasonStats = Boolean((data as any)?.seasonStatsMode === "compact") || seasonVisibleCount < 3;
  const hasRenderablePlayerData = Boolean(
    data && (
      hasMeaningfulText((data as any)?.name || params.name) ||
      hasMeaningfulText((data as any)?.currentClub || params.team) ||
      hasMeaningfulText((data as any)?.position || params.position) ||
      hasMeaningfulText((data as any)?.marketValue || params.marketValue) ||
      (Array.isArray((data as any)?.formerClubs) && (data as any).formerClubs.length > 0)
    )
  );

  return (
    <View style={styles.container}>
      <NexoraSimpleHeader
        title={normalizeText(data?.name || params.name, tx("playerProfile.player", "Player"))}
      />

      {isLoading ? (
        <View style={styles.loading}>
          <StateBlock loading title={tx("playerProfile.loading", "Loading player profile") } message={tx("playerProfile.analysisTempUnavailable", "Analysis is temporarily unavailable")} />
        </View>
      ) : error || !data || (!hasRenderablePlayerData && (data as any)?.error) ? (
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
        <>
          <View style={styles.heroCard}>
            <View style={styles.hero}>
              {photoUri && !photoFailed ? (
                <ExpoImage
                  source={{ uri: photoUri }}
                  style={[styles.photo, { backgroundColor: COLORS.card }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  onError={() => {
                    const fallback = getBestCachedOrSeedPlayerImage(playerImageSeed);
                    if (fallback && fallback !== photoUri) {
                      setPhotoUri(fallback);
                      setPhotoFailed(false);
                    } else {
                      setPhotoFailed(true);
                    }
                  }}
                />
              ) : (
                <View style={[styles.photo, styles.photoFallback, { borderColor: badgeColor }]}> 
                  <Text style={styles.photoInitials}>{initials}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={2}>{normalizeText(data?.name || params.name, tx("playerProfile.player", "Player"))}</Text>
              {hasMeaningfulText(data?.currentClub || params.team) ? (
                <Text style={styles.clubLine} numberOfLines={1}>{normalizeText(data?.currentClub || params.team)}</Text>
              ) : null}
              <Text style={styles.meta}>{`${normalizeText(data?.position || params.position)} ${normalizeText(data?.nationality || params.nationality, "") ? `• ${normalizeText(data?.nationality || params.nationality)}` : ""}`.trim()}</Text>
              <Text style={[styles.value, data?.isRealValue ? styles.valueReal : null]}>
                {normalizeText(data?.marketValue || params.marketValue, tx("playerProfile.valueUnknown", "Value unavailable"))}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
          <Card title={tx("playerProfile.overview", "Overview")}>
            {overviewFacts.length > 0 ? (
              <View style={styles.quickFactsGrid}>
                {overviewFacts.map((fact, index) => (
                  <QuickFact key={`${fact.label}_${index}`} icon={fact.icon} label={fact.label} value={fact.value} />
                ))}
              </View>
            ) : (
              <Text style={styles.placeholder}>{tx("playerProfile.limitedData", "Verified profile data is still limited for this player.")}</Text>
            )}
            {(overviewFacts.length > 0) ? <View style={styles.infoDivider} /> : null}
            {data?.birthDate ? <Row icon="calendar-outline" label={tx("playerProfile.birthDate", "Birth date")} value={formatDisplayDate(data.birthDate)} /> : null}
            {hasMeaningfulText(data?.nationality || params.nationality) ? <Row icon="earth" label={tx("playerProfile.nationality", "Nationality")} value={normalizeText(data?.nationality || params.nationality)} /> : null}
            {hasMeaningfulText(data?.position || params.position) ? <Row icon="soccer-field" label={tx("playerProfile.position", "Position")} value={normalizeText(data?.position || params.position)} /> : null}
            {hasMeaningfulText(data?.contractUntil) ? <Row icon="file-document-outline" label={tx("playerProfile.contractUntil", "Contract")} value={normalizeText(data?.contractUntil)} /> : null}
            {hasMeaningfulText(data?.currentClub || params.team) ? <ClubRow label={tx("playerProfile.currentClub", "Current club")} value={normalizeText(data?.currentClub || params.team)} logo={data?.currentClubLogo} league={String(params.league || "")} /> : null}
            {hasMeaningfulText(data?.marketValue || params.marketValue) ? <Row icon="currency-eur" label={tx("playerProfile.marketValue", "Market value")} value={normalizeText(data?.marketValue || params.marketValue)} /> : null}
            {data?.updatedAt ? <Row icon="clock-outline" label={tx("playerProfile.lastUpdated", "Last updated")} value={formatUpdatedAt(data?.updatedAt)} /> : null}
          </Card>

          <Card title={tx("playerProfile.seasonStats", "Season stats")}>
            {useCompactSeasonStats ? (
              <View style={styles.formBadge}>
                <Ionicons name="sparkles-outline" size={12} color="#7EE787" />
                <Text style={styles.formBadgeText}>{tx("playerProfile.compactStatsFallback", "Season data is partial. Core verified metrics are shown.")}</Text>
              </View>
            ) : null}
            <StatsGrid items={seasonStatItems} />
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
              <Text style={[styles.analysisText, { color: COLORS.text }]}>{mergedAnalysisText}</Text>
            </LinearGradient>

          </Card>

          <Card title={tx("playerProfile.strengths", "Strengths")}>
            <View style={styles.pillWrap}>
              {mergedStrengths.slice(0, 6).map((item: string, idx: number) => (
                <Bullet key={`s_${idx}`} text={item} good />
              ))}
              {mergedStrengths.length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
            </View>
          </Card>

          <Card title={tx("playerProfile.weaknesses", "Weaknesses")}>
            <View style={styles.pillWrap}>
              {mergedWeaknesses.slice(0, 6).map((item: string, idx: number) => (
                <Bullet key={`w_${idx}`} text={item} />
              ))}
              {mergedWeaknesses.length === 0 ? <Text style={styles.placeholder}>{UNKNOWN}</Text> : null}
            </View>
          </Card>

          <Card title={tx("playerProfile.clubHistory", "Club history")}>
            {transferTimeline.length === 0 ? (
              <Text style={styles.placeholder}>{tx("playerProfile.noTransferHistory", "No transfer history available")}</Text>
            ) : (
              <View style={styles.timeline}>
                {transferTimeline.map((club: any, idx: number) => {
                  const isLast = idx === transferTimeline.length - 1;
                  const isJoin = club.action === "joined" || club.action === "loan";
                  return (
                    <View key={`${club?.name || "club"}_${idx}`} style={styles.timelineItem}>
                      <View style={styles.timelineSide}>
                        <View style={[styles.timelineDot, isJoin ? styles.timelineDotJoin : styles.timelineDotLeave]} />
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>
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
                              <Text style={[styles.timelineLabel, isJoin ? styles.transferTagJoin : styles.transferTagLeave]}>
                                {club?.actionLabel || (isJoin ? "Joined" : "Left")}
                              </Text>
                              {club?.date ? <Text style={styles.timelineDate}>{club.date}</Text> : null}
                              {club?.note ? <Text style={styles.timelineLabel}>{club.note}</Text> : null}
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
          </ScrollView>
        </>
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

function ClubRow({ label, value, logo, league }: { label: string; value: string; logo?: string | null; league?: string }) {
  const resolvedLogo = resolveTeamLogoUri(value, logo || null, { competition: league || null });
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.clubValueRow}>
        {resolvedLogo ? <TeamLogo uri={typeof resolvedLogo === "string" ? resolvedLogo : null} resolvedLogo={typeof resolvedLogo === "number" ? resolvedLogo : undefined} teamName={value} size={24} /> : null}
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
  const cleaned = items
    .filter((x) => x?.label)
    .map((item) => {
      const raw = item?.value;
      const parsed = Number(raw);
      const hasValue = raw != null && String(raw).trim() !== "" && String(raw).toLowerCase() !== "null";
      const visible = Number.isFinite(parsed) ? parsed > 0 : hasValue;
      return { ...item, __visible: visible };
    })
    .filter((item) => item.__visible);
  const isGoals = (label: string) => label.toLowerCase().includes("goal");
  const isAssists = (label: string) => label.toLowerCase().includes("assist");
  const isAppearances = (label: string) => label.toLowerCase().includes("match") || label.toLowerCase().includes("appear");
  if (cleaned.length === 0) {
    return <Text style={styles.placeholder}>{tFn("common.notAvailable") || "Not available"}</Text>;
  }
  return (
    <View style={styles.statsGrid}>
      {cleaned.map((item, idx) => {
        const isKeyMetric = isGoals(item.label) || isAssists(item.label) || isAppearances(item.label);
        return (
          <View key={`${item.label}_${idx}`} style={[styles.statCard, isKeyMetric && styles.statCardHighlight]}>
            <Text style={styles.statLabel} numberOfLines={1}>{item.label}</Text>
            <Text style={[styles.statValue, isGoals(item.label) && styles.statValueGoals, isAssists(item.label) && styles.statValueAssists]}>
              {String(item.value)}
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
  header: { paddingHorizontal: 18, paddingBottom: 18 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  hero: { alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 4 },
  photo: { width: 140, height: 140, borderRadius: 22, borderWidth: 0, backgroundColor: COLORS.card },
  photoFallback: { backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)" },
  photoInitials: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.text },
  name: { fontFamily: "Inter_800ExtraBold", fontSize: 23, color: COLORS.text, textAlign: "center", paddingHorizontal: 16, maxWidth: "100%", lineHeight: 28 },
  clubLine: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: 24, maxWidth: "100%" },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", paddingHorizontal: 24, maxWidth: "100%", lineHeight: 18 },
  value: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.textMuted, textAlign: "center", maxWidth: "85%" },
  valueReal: { color: "#00C896" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, backgroundColor: COLORS.accent },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  heroCard: {
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: COLORS.cardElevated,
    overflow: "hidden",
  },
  content: { padding: 18, gap: 12, paddingBottom: 46, paddingTop: 12 },
  card: { backgroundColor: COLORS.overlayLight, gap: 9 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 9 },
  rowLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, flexShrink: 1, textAlign: "right", maxWidth: "60%", lineHeight: 18 },
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 10,
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
  quickFactValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text, lineHeight: 17 },
  infoDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 6, marginBottom: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 10,
    paddingVertical: 9,
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
  transferGroup: { marginBottom: 10 },
  transferGroupTitle: { fontFamily: "Inter_700Bold", fontSize: 12, color: COLORS.textMuted, marginBottom: 6, paddingLeft: 8 },
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
  transferTagJoin: { color: "#4CAF82" },
  transferTagLeave: { color: COLORS.accent },
  timelineDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textSecondary },
  timelineFee: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#00C896", marginTop: 2 },
});
