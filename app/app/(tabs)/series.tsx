import React, { useEffect, useMemo } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import {
  useOnAirSeries,
  usePopularSeries,
  useTopRatedSeries,
  useTvByGenreAll,
} from "@/lib/use-tmdb";
import type { Series } from "@/types/streaming";
import {
  CollectionRail,
  GenreButtonRow,
  PosterRail,
  TopTenRail,
  type RailItem,
} from "@/components/streaming/PremiumRails";

const { width: W, height: H } = Dimensions.get("window");
const HERO_H = Math.min(H * 0.72, 580);

function withBackdrop<
  T extends { backdrop?: string | null; poster?: string | null },
>(items: T[]): T[] {
  return items.filter((item) => !!item.backdrop);
}

function TabHero({
  item,
  badge,
}: {
  item: {
    title: string;
    backdrop?: string | null;
    poster?: string | null;
    id: string;
    type?: string;
  };
  badge: string;
}) {
  return (
    <View style={heroStyles.hero}>
      <ExpoImage
        source={item.backdrop ?? item.poster ?? undefined}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
        onLoad={(event) => {
          // #region agent log
          if (__DEV__) {
            fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "165c99",
              },
              body: JSON.stringify({
                sessionId: "165c99",
                runId: "baseline-4",
                hypothesisId: "H9",
                location: "tabs/series:hero-image-onLoad",
                message: "hero-image-loaded",
                data: {
                  id: item.id,
                  src: item.backdrop ?? item.poster ?? null,
                  width: event?.source?.width ?? null,
                  height: event?.source?.height ?? null,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
          }
          // #endregion
        }}
      />
      <LinearGradient
        colors={["transparent", "rgba(6,5,10,0.32)", COLORS.background]}
        locations={[0.38, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["rgba(6,5,10,0.35)", "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.55, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={heroStyles.heroBody}>
        <View style={heroStyles.heroBadge}>
          <Text style={heroStyles.heroBadgeText}>{badge}</Text>
        </View>
        <Text style={heroStyles.heroTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={heroStyles.heroActions}>
          <Pressable
            style={({ pressed }) => [heroStyles.playBtn, pressed && { opacity: 0.82 }]}
            onPress={() =>
              router.push({
                pathname: "/media/detail",
                params: { id: item.id, type: item.type ?? "series" },
              })
            }
          >
            <Ionicons name="play" size={16} color="#000" />
            <Text style={heroStyles.playBtnText}>Kijk nu</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [heroStyles.listBtn, pressed && { opacity: 0.82 }]}
            onPress={() =>
              router.push({
                pathname: "/media/detail",
                params: { id: item.id, type: item.type ?? "series" },
              })
            }
          >
            <Ionicons name="add" size={17} color={COLORS.text} />
            <Text style={heroStyles.listBtnText}>Mijn lijst</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  hero: {
    width: W,
    height: HERO_H,
    backgroundColor: COLORS.cardElevated,
    overflow: "hidden",
  },
  heroBody: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    gap: 10,
  },
  heroBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 34,
    lineHeight: 38,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.8,
    maxWidth: "72%",
  },
  heroActions: { flexDirection: "row", gap: 10 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  playBtnText: {
    color: "#000",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
  },
  listBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

const GENRE_ROWS = [
  { title: "Actie & avontuur", id: 10759 },
  { title: "Misdaad", id: 80 },
  { title: "Drama", id: 18 },
  { title: "Horror", id: 27 },
  { title: "Komedie", id: 35 },
  { title: "Thriller", id: 53 },
  { title: "Familie", id: 10751 },
  { title: "Fantasy", id: 10765 },
] as const;

const COUNTRY_ROWS = [
  { title: "Vlaams", id: 0, code: "nl-BE" },
  { title: "Nederlands", id: 1, code: "nl" },
  { title: "Frans", id: 2, code: "fr" },
  { title: "Engels", id: 3, code: "en" },
  { title: "Spaans", id: 4, code: "es" },
  { title: "Duits", id: 5, code: "de" },
  { title: "Koreaans", id: 6, code: "ko" },
  { title: "Japans", id: 7, code: "ja" },
] as const;
const COUNTRY_CODE_BY_ID: Record<number, string> = Object.fromEntries(
  COUNTRY_ROWS.map((country) => [country.id, country.code]),
) as Record<number, string>;

function mergeUnique(items: Series[]): Series[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.poster) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function openDetail(item: RailItem) {
  router.push({ pathname: "/media/detail", params: { id: item.id, type: "series" } });
}

export default function SeriesScreen() {
  const insets = useSafeAreaInsets();

  const { data: onAir = [] } = useOnAirSeries();
  const { data: popular = [] } = usePopularSeries();
  const { data: topRated = [] } = useTopRatedSeries();
  const { data: documentaries = [] } = useTvByGenreAll([99], true, 1);
  const { data: genreActie = [] } = useTvByGenreAll([10759], true, 1);
  const { data: genreMisdaad = [] } = useTvByGenreAll([80], true, 1);
  const { data: genreDrama = [] } = useTvByGenreAll([18], true, 1);
  const { data: genreHorror = [] } = useTvByGenreAll([27], true, 1);
  const { data: genreKomedie = [] } = useTvByGenreAll([35], true, 1);
  const { data: genreThriller = [] } = useTvByGenreAll([53], true, 1);
  const { data: genreFamilie = [] } = useTvByGenreAll([10751], true, 1);
  const { data: genreFantasy = [] } = useTvByGenreAll([10765], true, 1);
  const { data: genreMysterie = [] } = useTvByGenreAll([9648], true, 1);
  const { data: genreRealiteit = [] } = useTvByGenreAll([10764], true, 1);
  const { data: genreTrueCrime = [] } = useTvByGenreAll([80, 99], true, 1);

  const heroSeries = useMemo(
    () =>
      withBackdrop(mergeUnique([...popular, ...topRated, ...onAir]))[0] ?? null,
    [popular, topRated, onAir],
  );

  useEffect(() => {
    if (!__DEV__) return;
    // #region agent log
    fetch("http://127.0.0.1:7379/ingest/4d747d85-0c03-4a11-8a60-a6d4fd09190a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "165c99",
      },
      body: JSON.stringify({
        sessionId: "165c99",
        runId: "baseline",
        hypothesisId: "H4",
        location: "tabs/series:hero",
        message: "hero-source-selected",
        data: {
          heroId: heroSeries?.id || null,
          hasBackdrop: Boolean(heroSeries?.backdrop),
          backdropUrl: heroSeries?.backdrop || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [heroSeries?.id, heroSeries?.backdrop]);

  const rails = useMemo(() => {
    const used = new Set<string>();
    const pick = (candidates: Series[], limit: number): RailItem[] => {
      const out: RailItem[] = [];
      for (const item of candidates) {
        if (!item.poster) continue;
        if (used.has(item.id)) continue;
        used.add(item.id);
        out.push({
          id: item.id,
          title: item.title,
          poster: item.poster,
          backdrop: item.backdrop,
        });
        if (out.length >= limit) break;
      }
      return out;
    };

    // Documentaries use their own isolated dedup so they’re never starved by mainstream picks
    const docPool = mergeUnique(documentaries);
    const docUsed = new Set<string>();
    const topTenDocu: RailItem[] = [];
    for (const item of docPool) {
      if (!item.poster) continue;
      if (docUsed.has(item.id)) continue;
      docUsed.add(item.id);
      topTenDocu.push({
        id: item.id,
        title: item.title,
        poster: item.poster,
        backdrop: item.backdrop,
      });
      if (topTenDocu.length >= 10) break;
    }

    const topTenSeries = pick(
      mergeUnique([...popular, ...topRated, ...onAir]),
      10,
    );
    const trendingSeries = pick(
      mergeUnique([...popular, ...topRated, ...onAir]),
      18,
    );
    const onAirRail = pick(mergeUnique([...onAir, ...popular]), 16);
    const bestRated = pick(
      mergeUnique([...topRated, ...popular, ...onAir]),
      16,
    );

    // Each genre rail gets its OWN dedup so it always shows its best content
    // regardless of what appeared in the editorial rails above
    const pickGenre = (candidates: Series[], limit: number): RailItem[] => {
      const genreUsed = new Set<string>();
      const out: RailItem[] = [];
      for (const item of candidates) {
        if (!item.poster) continue;
        if (genreUsed.has(item.id)) continue;
        genreUsed.add(item.id);
        out.push({
          id: item.id,
          title: item.title,
          poster: item.poster,
          backdrop: item.backdrop,
        });
        if (out.length >= limit) break;
      }
      return out;
    };

    const actie = pickGenre(mergeUnique(genreActie), 40);
    const misdaad = pickGenre(mergeUnique(genreMisdaad), 40);
    const drama = pickGenre(mergeUnique(genreDrama), 40);
    const horror = pickGenre(mergeUnique(genreHorror), 40);
    const komedie = pickGenre(mergeUnique(genreKomedie), 40);
    const thriller = pickGenre(mergeUnique(genreThriller), 40);
    const familie = pickGenre(mergeUnique(genreFamilie), 40);
    const fantasy = pickGenre(mergeUnique(genreFantasy), 40);
    const mysterie = pickGenre(mergeUnique(genreMysterie), 40);
    const realiteit = pickGenre(mergeUnique(genreRealiteit), 40);
    const trueCrime = pickGenre(mergeUnique(genreTrueCrime), 40);

    return {
      topTenSeries,
      trendingSeries,
      onAirRail,
      topTenDocu,
      bestRated,
      actie,
      misdaad,
      drama,
      horror,
      komedie,
      thriller,
      familie,
      fantasy,
      mysterie,
      realiteit,
      trueCrime,
    };
  }, [
    popular,
    topRated,
    onAir,
    documentaries,
    genreActie,
    genreMisdaad,
    genreDrama,
    genreHorror,
    genreKomedie,
    genreThriller,
    genreFamilie,
    genreFantasy,
    genreMysterie,
    genreRealiteit,
    genreTrueCrime,
  ]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      showsVerticalScrollIndicator={false}
      data={[]}
      keyExtractor={() => "series-root"}
      renderItem={null}
      contentContainerStyle={{
        paddingTop: 0,
        paddingBottom: insets.bottom + 100,
      }}
      ListHeaderComponent={
        <>
          {heroSeries ? (
            <TabHero item={heroSeries} badge="Cinelog Series" />
          ) : null}
          <GenreButtonRow
            genres={GENRE_ROWS}
            onPress={(genre) =>
              router.push({
                pathname: "/media/genre",
                params: {
                  genreId: String(genre.id),
                  genreTitle: genre.title,
                  type: "series",
                },
              })
            }
          />
          <GenreButtonRow
            genres={COUNTRY_ROWS}
            compact
            onPress={(country) =>
              router.push({
                pathname: "/media/country",
                params: {
                  languageCode: COUNTRY_CODE_BY_ID[country.id] || "nl",
                  languageName: country.title,
                  type: "series",
                },
              })
            }
          />

          {/* Big numbered Top 10 */}
          <TopTenRail
            title="Top 10 series op Cinelog"
            data={rails.topTenSeries}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/list",
                params: {
                  listType: "popular",
                  type: "series",
                  title: "Top 10 series op Cinelog",
                },
              })
            }
          />

          {/* CollectionRail: grote lead + kleine rest */}
          <CollectionRail
            title="Misdaad"
            data={rails.misdaad}
            onPress={openDetail}
          />

          {/* Kleine poster rij */}
          <PosterRail
            title="Trending nu"
            data={rails.trendingSeries}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/list",
                params: {
                  listType: "popular",
                  type: "series",
                  title: "Trending nu",
                },
              })
            }
          />

          {/* Top 10 documentaires — 2nd separator before Actie */}
          <TopTenRail
            title="Top 10 docu's op Cinelog"
            data={rails.topTenDocu}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/genre",
                params: {
                  genreId: "99",
                  genreTitle: "Documentaires",
                  type: "series",
                },
              })
            }
          />

          <CollectionRail
            title="Actie & avontuur"
            data={rails.actie}
            onPress={openDetail}
          />

          {/* 2 separators: Nu op tv + Mystery */}
          <PosterRail
            title="Nu op tv"
            data={rails.onAirRail}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/list",
                params: {
                  listType: "on_the_air",
                  type: "series",
                  title: "Nu op tv",
                },
              })
            }
          />

          <PosterRail
            title="Mystery & spanning"
            data={rails.mysterie}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/genre",
                params: {
                  genreId: "9648",
                  genreTitle: "Mystery",
                  type: "series",
                },
              })
            }
          />

          <CollectionRail
            title="Thriller"
            data={rails.thriller}
            onPress={openDetail}
          />

          <PosterRail
            title="Horror"
            data={rails.horror}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/genre",
                params: { genreId: "27", genreTitle: "Horror", type: "series" },
              })
            }
          />

          <CollectionRail
            title="Drama"
            data={rails.drama}
            onPress={openDetail}
          />

          <PosterRail
            title="Komedie"
            data={rails.komedie}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/genre",
                params: {
                  genreId: "35",
                  genreTitle: "Komedie",
                  type: "series",
                },
              })
            }
          />

          <CollectionRail
            title="Waar gebeurd — True Crime"
            data={rails.trueCrime}
            onPress={openDetail}
          />

          <PosterRail
            title="Hoogst gewaardeerd"
            data={rails.bestRated}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/list",
                params: {
                  listType: "top_rated",
                  type: "series",
                  title: "Hoogst gewaardeerd",
                },
              })
            }
          />

          <CollectionRail
            title="Fantasy & Sci-Fi"
            data={rails.fantasy}
            onPress={openDetail}
          />

          <PosterRail
            title="Familie"
            data={rails.familie}
            onPress={openDetail}
            onSeeAll={() =>
              router.push({
                pathname: "/media/genre",
                params: {
                  genreId: "10751",
                  genreTitle: "Familie",
                  type: "series",
                },
              })
            }
          />

          <CollectionRail
            title="Reality"
            data={rails.realiteit}
            onPress={openDetail}
          />
        </>
      }
    />
  );
}
