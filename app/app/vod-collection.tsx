import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NexoraHeader } from "@/components/NexoraHeader";
import { COLORS } from "@/constants/colors";
import { apiRequest, DEFAULT_RENDER_API_BASE } from "@/lib/query-client";
import { withTimeout } from "@/lib/utils";
import { useTranslation } from "@/lib/useTranslation";

function sanitizeParam(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "undefined" || raw === "null") return "";
  return raw;
}

async function fetchCollection(id?: string, title?: string) {
  const safeId = sanitizeParam(id);
  const safeTitle = sanitizeParam(title);
  const hasNumericId = /^\d+$/.test(safeId);

  const queryParts: string[] = [];
  if (hasNumericId) queryParts.push(`id=${encodeURIComponent(safeId)}`);
  if (safeTitle) queryParts.push(`title=${encodeURIComponent(safeTitle)}`);
  if (!queryParts.length) queryParts.push(`title=${encodeURIComponent(safeId)}`);
  const primaryQuery = queryParts.join("&");

  const hasItems = (payload: any) => Array.isArray(payload?.items) && payload.items.length > 0;
  const isBrokenPayload = (payload: any) => {
    const errorText = String(payload?.error || "").toLowerCase();
    return errorText.includes("normalizetext is not defined");
  };

  const requestCandidates = [
    `/api/vod/collection?${primaryQuery}&depth=4`,
    ...(safeTitle ? [`/api/vod/collection?title=${encodeURIComponent(safeTitle)}&depth=4`] : []),
  ];

  const primaryResponse = await withTimeout(apiRequest("GET", requestCandidates[0]), 15000);
  const primaryPayload = await primaryResponse.json();
  if (hasItems(primaryPayload)) return primaryPayload;

  if (!isBrokenPayload(primaryPayload) && !safeTitle) return primaryPayload;

  for (const route of requestCandidates.slice(1)) {
    try {
      const res = await withTimeout(apiRequest("GET", route), 15000);
      const payload = await res.json();
      if (hasItems(payload)) return payload;
      if (!isBrokenPayload(payload)) {
        return payload;
      }
    } catch {
      // Try absolute fallbacks below.
    }
  }

  // Build local-first fallback bases: prefer the local API server (port 8080)
  // before Render.com, because Render.com may be an older deploy without normalizeText.
  const absoluteBases = (() => {
    const out: string[] = [];
    if (typeof window !== "undefined") {
      try {
        const u = new URL(window.location.origin);
        const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
        if (isLocal) {
          out.push(`${u.protocol}//${u.hostname}:8080`);
          out.push(`${u.protocol}//${u.hostname}:18081`);
        }
      } catch {
        // no-op
      }
    }
    // Native: also try common simulator/emulator addresses
    out.push("http://localhost:8080");
    out.push("http://10.0.2.2:8080");
    // Render.com as last resort (may be outdated)
    out.push(DEFAULT_RENDER_API_BASE);
    return [...new Set(out)];
  })();

  for (const base of absoluteBases) {
    for (const route of requestCandidates) {
      try {
        const url = `${base}${route}`;
        const res = await withTimeout(fetch(url), 15000);
        const payload = await res.json();
        if (hasItems(payload)) return payload;
        if (!isBrokenPayload(payload) && base === absoluteBases[absoluteBases.length - 1]) {
          return payload;
        }
      } catch {
        // continue to next fallback
      }
    }
  }

  return primaryPayload;
}

export default function VodCollectionScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const safeId = String(params.id || "").trim() && params.id !== "undefined" && params.id !== "null" && params.id !== "0" ? String(params.id) : "";
  const safeName = String(params.name || "").trim() && params.name !== "undefined" && params.name !== "null" ? String(params.name) : "";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vod-collection", safeId || safeName || "unknown"],
    queryFn: () => fetchCollection(safeId, safeName),
    staleTime: 0,
    retry: 2,
  });

  const normalize = (value: unknown) => String(value || "").toLowerCase().trim();
  const collection = data?.collection;
  const directItems = Array.isArray(data?.items) ? data.items : [];
  const fallbackFromCurated = (() => {
    const curated = (queryClient.getQueryData(["vod-module-curated-collections"]) as any[] | undefined) || [];
    const needleId = normalize(safeId);
    const needleName = normalize(safeName);
    const found = curated.find((entry: any) => {
      const idMatch = needleId && normalize(entry?.id) === needleId;
      const nameMatch = needleName && normalize(entry?.name).includes(needleName);
      return idMatch || nameMatch;
    });
    return Array.isArray(found?.items) ? found.items : [];
  })();
  const rawItems = directItems.length ? directItems : fallbackFromCurated;
  const items = [...rawItems].sort((left, right) => {
    const leftDate = Date.parse(String(left?.releaseDate || left?.year || "")) || 0;
    const rightDate = Date.parse(String(right?.releaseDate || right?.year || "")) || 0;
    return leftDate - rightDate;
  });
  const stats = data?.stats || { total: items.length };
  const heroBackdrop = collection?.backdrop || items[0]?.backdrop || items[0]?.poster || null;

  return (
    <View style={styles.container}>
      <NexoraHeader variant="module" title={t("vodCollection.title")} titleColor={COLORS.accent} showSearch={false} showBack showProfile={false} />
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            {heroBackdrop ? <Image source={{ uri: heroBackdrop }} style={styles.heroImage} /> : null}
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <Text style={styles.label}>{t("vodCollection.watchInOrder")}</Text>
              <Text style={styles.title}>{collection?.name || safeName || "Collection"}</Text>
              <Text style={styles.subtitle}>
                {items.length} {t("vodCollection.titles")} · {t("vodCollection.oldestToNewest")}
                {stats ? ` · ${stats.movies || 0} movies / ${stats.series || 0} series` : ""}
              </Text>
              {collection?.overview ? <Text style={styles.overview}>{collection.overview}</Text> : null}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.timelineTitle}>{t("vodCollection.chronologicalOrder")}</Text>
            <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{items.length}</Text></View>
          </View>
          <View style={styles.stack}>
            {items.map((item, index) => {
              const poster = item?.poster || item?.backdrop || null;
              const year = String(item?.year || item?.releaseDate || "").slice(0, 4);
              const rtRating = Number(item?.rottenTomatoesRating || 0);
              const imdbRating = Number(item?.imdbRating || item?.imdb || item?.rating || 0);
              return (
                <React.Fragment key={`${item.type || "movie"}-${item.id}`}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <TouchableOpacity
                    style={styles.itemRow}
                    onPress={() => router.push({ pathname: "/media/detail", params: { id: item.id, type: item.type || "movie", title: item.title, tmdbId: item.tmdbId ? String(item.tmdbId) : undefined } })}
                    activeOpacity={0.86}
                  >
                    {poster ? (
                      <Image source={{ uri: poster }} style={styles.itemPoster} />
                    ) : (
                      <View style={[styles.itemPoster, styles.itemPosterFallback]} />
                    )}
                    <View style={styles.itemMetaWrap}>
                      <Text style={styles.itemStep}>#{index + 1}</Text>
                      <Text style={styles.itemTitle} numberOfLines={2}>{String(item?.title || "Untitled")}</Text>
                      <Text style={styles.itemMeta}>
                        {year || "Unknown year"}
                        {Number.isFinite(rtRating) && rtRating > 0
                          ? ` · ${Math.round(rtRating)}%🍅`
                          : Number.isFinite(imdbRating) && imdbRating > 0
                            ? ` · ${imdbRating.toFixed(1)}🎬`
                            : ""}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 64 },
  hero: { height: 340, margin: 16, borderRadius: 22, overflow: "hidden", backgroundColor: COLORS.card },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.52)" },
  heroContent: { position: "absolute", left: 18, right: 18, bottom: 20, gap: 8 },
  label: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase" },
  title: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 28, lineHeight: 32 },
  subtitle: { color: "rgba(255,255,255,0.72)", fontFamily: "Inter_500Medium", fontSize: 13 },
  overview: { color: "rgba(255,255,255,0.68)", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, marginTop: 22, marginBottom: 14 },
  sectionAccentBar: { width: 3, height: 20, backgroundColor: COLORS.accent, borderRadius: 2 },
  timelineTitle: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 20, flex: 1 },
  sectionBadge: {
    backgroundColor: "rgba(229,9,20,0.12)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(229,9,20,0.30)",
  },
  sectionBadgeText: { color: COLORS.accent, fontFamily: "Inter_700Bold", fontSize: 11 },
  stack: { paddingHorizontal: 18, paddingBottom: 6 },
  itemRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  itemPoster: {
    width: 96,
    height: 132,
    backgroundColor: COLORS.card,
  },
  itemPosterFallback: {
    backgroundColor: COLORS.cardElevated,
  },
  itemMetaWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  itemStep: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  itemTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    lineHeight: 24,
  },
  itemMeta: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  rowDivider: { height: 10 },
});