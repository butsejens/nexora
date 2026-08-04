import React, { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";

import { COLORS } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { RealContentCard } from "@/components/RealContentCard";

type KnownForItem = {
  id: string | number;
  type: "movie" | "series";
  title: string;
  role?: string | null;
  genreIds?: number[] | null;
  popularity?: number | null;
  voteCount?: number | null;
  poster?: string | null;
  backdrop?: string | null;
  year?: string | number | null;
  rating?: number | null;
};

type PersonDetail = {
  id: number;
  name: string;
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  placeOfBirth?: string | null;
  knownForDepartment?: string | null;
  profile?: string | null;
  knownFor?: KnownForItem[];
};

function mapTmdbKnownFor(items: any[]): KnownForItem[] {
  return (items || [])
    .filter((item) => item && item.id)
    .map((item) => ({
      id: item.id,
      type:
        item.media_type === "tv" || item.first_air_date ? "series" : "movie",
      title: item.title || item.name || "Untitled",
      role: item.character || item.job || null,
      genreIds: Array.isArray(item.genre_ids)
        ? item.genre_ids
            .map((value: any) => Number(value))
            .filter((value: number) => Number.isFinite(value))
        : null,
      popularity: Number(item.popularity || 0) || null,
      voteCount: Number(item.vote_count || 0) || null,
      poster: item.poster_path
        ? `https://image.tmdb.org/t/p/w780${item.poster_path}`
        : null,
      backdrop: item.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
        : null,
      year: String(item.release_date || item.first_air_date || "").slice(0, 4),
      rating: Number(item.vote_average || 0) || null,
    }));
}

async function fetchPersonDetail(id: string): Promise<PersonDetail | null> {
  if (!id) return null;
  try {
    const res = await apiRequest("GET", `/api/media/person/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data?.data?.id) return data.data as PersonDetail;
  } catch {}

  // Fallback: fetch directly from TMDB when backend route is unavailable.
  const tmdbKey = String(process.env.EXPO_PUBLIC_TMDB_API_KEY || "").trim();
  if (!tmdbKey) return null;
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/person/${encodeURIComponent(id)}?api_key=${encodeURIComponent(tmdbKey)}&append_to_response=movie_credits,tv_credits`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const knownFor = [
      ...(data?.movie_credits?.cast || []).map((item: any) => ({
        ...item,
        media_type: "movie",
      })),
      ...(data?.tv_credits?.cast || []).map((item: any) => ({
        ...item,
        media_type: "tv",
      })),
    ].sort((left: any, right: any) => (right?.popularity || 0) - (left?.popularity || 0));

    return {
      id: Number(data?.id || 0),
      name: String(data?.name || ""),
      biography: data?.biography || null,
      birthday: data?.birthday || null,
      deathday: data?.deathday || null,
      placeOfBirth: data?.place_of_birth || null,
      knownForDepartment: data?.known_for_department || null,
      profile: data?.profile_path
        ? `https://image.tmdb.org/t/p/w780${data.profile_path}`
        : null,
      knownFor: mapTmdbKnownFor(knownFor),
    };
  } catch {
    return null;
  }
}

export default function CastProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; name?: string; role?: string }>();
  const id = String(params.id || "").trim();

  const personQuery = useQuery({
    queryKey: ["media-person", id],
    queryFn: () => fetchPersonDetail(id),
    enabled: Boolean(id),
    staleTime: 60 * 60_000,
  });

  const person = personQuery.data;
  const title = person?.name || String(params.name || "Cast");
  const subtitle = person?.knownForDepartment || String(params.role || "").trim();
  const biography = String(person?.biography || "").trim();
  const knownFor = useMemo(() => {
    const items = Array.isArray(person?.knownFor) ? person.knownFor : [];
    const seen = new Set<string>();
    return items
      .map((item) => ({
        ...item,
        role: String(
          (item as any)?.role ||
            (item as any)?.character ||
            (item as any)?.credit ||
            (item as any)?.job ||
            "",
        ).trim(),
      }))
      .filter((item) => {
        const title = String(item.title || "").trim();
        if (title.length < 2) return false;
        // Keep only visually useful cards.
        if (!item.poster && !item.backdrop) return false;
        // Remove TV talk-show credits from "Bekend van".
        const genreIds = Array.isArray(item.genreIds) ? item.genreIds : [];
        const hasTalkShowGenre = item.type === "series" && genreIds.includes(10767);
        const lowerTitle = title.toLowerCase();
        const looksLikeTalkShow =
          item.type === "series" &&
          /talk show|late night|late show|tonight show|daily show/.test(
            lowerTitle,
          );
        if (hasTalkShowGenre || looksLikeTalkShow) return false;
        // Hide noisy credit labels that are rarely meaningful in UI.
        const role = String(item.role || "").toLowerCase();
        if (role.includes("uncredited")) return false;
        return true;
      })
      .filter((item) => {
      const typeKey = item.type === "series" ? "series" : "movie";
      const idKey = String(item.id || "").trim();
      const titleKey = String(item.title || "")
        .trim()
        .toLowerCase();
      const yearKey = String(item.year || "").slice(0, 4);
      const key = idKey ? `${typeKey}:${idKey}` : `${typeKey}:${titleKey}:${yearKey}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
      })
      .sort((left, right) => {
        // Rank by confidence: bigger roles + known/popular titles first.
        const leftRole = String(left.role || "").toLowerCase();
        const rightRole = String(right.role || "").toLowerCase();
        const leftHasCharacter =
          leftRole.length > 0 &&
          !leftRole.includes("self") &&
          !leftRole.includes("archive");
        const rightHasCharacter =
          rightRole.length > 0 &&
          !rightRole.includes("self") &&
          !rightRole.includes("archive");
        if (leftHasCharacter !== rightHasCharacter) {
          return leftHasCharacter ? -1 : 1;
        }
        const leftVotes = Number(left.voteCount || 0);
        const rightVotes = Number(right.voteCount || 0);
        if (leftVotes !== rightVotes) return rightVotes - leftVotes;
        const leftPopularity = Number(left.popularity || 0);
        const rightPopularity = Number(right.popularity || 0);
        if (leftPopularity !== rightPopularity) return rightPopularity - leftPopularity;
        const leftYear = Number(String(left.year || "").slice(0, 4) || 0);
        const rightYear = Number(String(right.year || "").slice(0, 4) || 0);
        return rightYear - leftYear;
      })
      .slice(0, 20);
  }, [person?.knownFor]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          {person?.profile ? (
            <ExpoImage
              source={{ uri: person.profile }}
              style={styles.photo}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Ionicons name="person" size={32} color={COLORS.textMuted} />
            </View>
          )}

          <View style={styles.headerMeta}>
            <Text style={styles.name}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {(person?.birthday || person?.placeOfBirth) && (
              <Text style={styles.meta}>
                {[person?.birthday, person?.placeOfBirth].filter(Boolean).join(" · ")}
              </Text>
            )}
          </View>
        </View>

        {!!biography && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Biografie</Text>
            <Text style={styles.body}>{biography}</Text>
          </View>
        )}

        {knownFor.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bekend van</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.knownForRow}
            >
              {knownFor.map((item, index) => {
                const mediaType = item.type === "series" ? "series" : "movie";
                const mediaId = String(item.id || "");
                if (!mediaId) return null;
                return (
                  <View key={`${mediaType}-${mediaId}-${index}`} style={styles.knownForCardWrap}>
                    <RealContentCard
                      width={130}
                      item={{
                        id: mediaId,
                        title: String(item.title || "Untitled"),
                        poster: item.poster || null,
                        backdrop: item.backdrop || null,
                        year: Number(item.year || 0) || 0,
                        imdb: Number(item.rating || 0) || 0,
                        quality: "HD",
                      } as any}
                      onPress={() =>
                        router.push({
                          pathname: "/media/detail",
                          params: { id: mediaId, type: mediaType },
                        })
                      }
                    />
                    {item.role ? (
                      <Text style={styles.knownForRole} numberOfLines={2}>
                        {item.role}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {personQuery.isLoading && (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={COLORS.textSecondary} />
          </View>
        )}
        {personQuery.isError && !person && (
          <View style={styles.loaderWrap}>
            <Text style={styles.errorText}>
              Castprofiel kon niet geladen worden. Probeer opnieuw.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  header: {
    marginTop: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 14,
  },
  photo: {
    width: 110,
    height: 146,
    borderRadius: 14,
    backgroundColor: COLORS.card,
  },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerMeta: { flex: 1, gap: 6, paddingTop: 6 },
  name: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 24,
    lineHeight: 28,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  meta: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },
  section: { marginTop: 22, paddingHorizontal: 16, gap: 10 },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  body: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    fontSize: 14,
  },
  knownForRow: { gap: 10, paddingRight: 12 },
  knownForCardWrap: { width: 130, gap: 6 },
  knownForRole: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    lineHeight: 15,
  },
  loaderWrap: { paddingVertical: 24, alignItems: "center", justifyContent: "center" },
  errorText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
