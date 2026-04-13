import React, { useMemo } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import {
  useMoviesByCompany,
  useMoviesByGenreAll,
  useNowPlayingMovies,
  usePopularMovies,
  usePopularSeries,
  useTvByGenreAll,
  useTvByNetwork,
  useTvByNetworkKids,
} from "@/lib/use-tmdb";
import type { Movie, Series } from "@/types/streaming";
import {
  FeaturedCollectionRail,
  GenreButtonRow,
  PosterRail,
  TopTenRail,
  type RailItem,
} from "@/components/streaming/PremiumRails";

const { width: W, height: H } = Dimensions.get("window");
const HERO_H = Math.min(H * 0.72, 580);
const TILE_W = Math.min(Math.max(Math.round(W * 0.38), 148), 240);
const TILE_H = 72;

const KIDS_GENRE_ROWS = [
  { title: "Tekenfilms", id: 16 },
  { title: "Familie", id: 10751 },
  { title: "Avontuur", id: 12 },
  { title: "Komedie", id: 35 },
  { title: "Fantasy", id: 14 },
] as const;

const KIDS_COLLECTIONS: readonly number[] = [
  10194, // Toy Story
  2150, // Shrek
  8354, // Ice Age
  89137, // How to Train Your Dragon
  77816, // Kung Fu Panda
  137697, // Madagascar
  87096, // Cars
  86311, // Minions / Despicable Me
  86027, // Frozen
  131635, // Big Hero 6
];

function getWeeklyPicks<T>(list: readonly T[], count: number): T[] {
  const week = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  const step = Math.max(1, Math.floor(list.length / count));
  const result: T[] = [];
  const used = new Set<number>();
  for (let i = 0; result.length < count && i < list.length * 3; i++) {
    const idx = (week * 3 + i * step) % list.length;
    if (!used.has(idx)) {
      used.add(idx);
      result.push(list[idx]);
    }
  }
  return result;
}

function shuffleByDay<T>(arr: T[]): T[] {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = ((day * 1013904223 + i * 1664525) >>> 0) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type KidsItem = Movie | Series;

function mergeUnique(items: KidsItem[]): KidsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (!item.poster) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toRail(items: KidsItem[], limit = 40): RailItem[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
  }));
}

function openDetail(item: RailItem) {
  const type = String(item.id).startsWith("tmdb_s_") ? "series" : "movie";
  router.push({ pathname: "/detail", params: { id: item.id, type } });
}

type KidsTile = {
  label: string;
  color1: string;
  color2: string;
  id: number;
  source: "network" | "company";
  type: "tv" | "movie";
};

const NETWORK_TILES: KidsTile[] = [
  // ─── TV Networks ───
  { label: "Nickelodeon",    color1: "#FF6600", color2: "#E53E00", id: 13,   source: "network", type: "tv" },
  { label: "Disney Channel", color1: "#1565C0", color2: "#0A3D8F", id: 54,   source: "network", type: "tv" },
  { label: "Cartoon Network",color1: "#004AAD", color2: "#002E80", id: 56,   source: "network", type: "tv" },
  { label: "Disney Junior",  color1: "#F57F17", color2: "#D84315", id: 281,  source: "network", type: "tv" },
  { label: "Boomerang",      color1: "#388E3C", color2: "#1B5E20", id: 523,  source: "network", type: "tv" },
  // ─── Studios (movies) ───
  { label: "Disney",         color1: "#1A237E", color2: "#0D1547", id: 2,    source: "company", type: "movie" },
  { label: "Pixar",          color1: "#0077B6", color2: "#023E8A", id: 3,    source: "company", type: "movie" },
  { label: "DreamWorks",     color1: "#6A1B9A", color2: "#38006B", id: 521,  source: "company", type: "movie" },
  { label: "Illumination",   color1: "#E64A19", color2: "#BF360C", id: 6704, source: "company", type: "movie" },
  { label: "Studio Ghibli",  color1: "#2E7D32", color2: "#1B5E20", id: 10342,source: "company", type: "movie" },
];

function KidsNetworkTiles() {
  return (
    <FlatList
      horizontal
      data={NETWORK_TILES}
      keyExtractor={(item) => item.label}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 4,
      }}
      ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
      renderItem={({ item }) => (
        <Pressable
          style={[tileStyles.tile, { backgroundColor: item.color1 }]}
          onPress={() =>
            router.push({
              pathname: "/media/genre",
              params: {
                genreId: String(item.id),
                genreTitle: item.label,
                type: item.type,
                source: item.source,
              },
            })
          }
        >
          <Text style={tileStyles.tileText}>{item.label}</Text>
        </Pressable>
      )}
    />
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.3,
  },
});

function KidsHero({ item }: { item: RailItem }) {
  return (
    <View style={styles.hero}>
      <ExpoImage
        source={item.backdrop ?? item.poster ?? undefined}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        priority="high"
      />
      <LinearGradient
        colors={["rgba(8,7,18,0.08)", "rgba(8,7,18,0.66)", COLORS.background]}
        locations={[0.2, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.heroBody}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>Nexora Kids</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.playBtn} onPress={() => openDetail(item)}>
            <Text style={styles.playBtnText}>▶ Kijk nu</Text>
          </Pressable>
          <Pressable style={styles.listBtn} onPress={() => openDetail(item)}>
            <Text style={styles.listBtnText}>Meer info</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function KidsScreen() {
  const insets = useSafeAreaInsets();

  // AI agent: network-based TV fetching — each network gets its own dedicated rail
  const { data: nickelodeonShows = [] } = useTvByNetwork(13); // Nickelodeon
  const { data: disneyChannelShows = [] } = useTvByNetwork(54); // Disney Channel
  const { data: cartoonNetworkShows = [] } = useTvByNetwork(56); // Cartoon Network
  const { data: nickJrShows = [] } = useTvByNetworkKids(281); // Disney Junior (lower vote threshold)
  const { data: boomerangShows = [] } = useTvByNetworkKids(523); // Boomerang (lower vote threshold)

  // Studio-based movie fetching
  const { data: disneyMovies = [] } = useMoviesByCompany([2, 6125]); // Walt Disney Pictures + WD Animation
  const { data: pixarMovies = [] } = useMoviesByCompany([3]); // Pixar
  const { data: dreamworksMovies = [] } = useMoviesByCompany([521]); // DreamWorks Animation
  const { data: illuminationMovies = [] } = useMoviesByCompany([6704]); // Illumination
  const { data: ghibliMovies = [] } = useMoviesByCompany([10342]); // Studio Ghibli

  // Genre pools for variety & hero/top-10
  const { data: animMovies = [] } = useMoviesByGenreAll([16], true);
  const { data: famMovies = [] } = useMoviesByGenreAll([10751], true);
  const { data: animSeries = [] } = useTvByGenreAll([16], true);
  const { data: kidsSeries = [] } = useTvByGenreAll([10762], true);
  const { data: popularMovies = [] } = usePopularMovies();
  const { data: popularSeries = [] } = usePopularSeries();
  const { data: nowPlaying = [] } = useNowPlayingMovies();

  const weeklyCollections = getWeeklyPicks(KIDS_COLLECTIONS, 3);

  const allKids = useMemo(() => {
    const strict = mergeUnique([
      ...(animMovies as KidsItem[]),
      ...(famMovies as KidsItem[]),
      ...(animSeries as KidsItem[]),
      ...(kidsSeries as KidsItem[]),
    ]);
    if (strict.length >= 24) return strict;
    return mergeUnique([
      ...strict,
      ...(popularMovies.filter(
        (m) => m.genres.includes("Animation") || m.genres.includes("Family"),
      ) as KidsItem[]),
      ...(popularSeries.filter(
        (s) => s.genres.includes("Animation") || s.genres.includes("Family"),
      ) as KidsItem[]),
      ...(nowPlaying.filter(
        (m) => m.genres.includes("Animation") || m.genres.includes("Family"),
      ) as KidsItem[]),
    ]);
  }, [
    animMovies,
    famMovies,
    animSeries,
    kidsSeries,
    popularMovies,
    popularSeries,
    nowPlaying,
  ]);

  const {
    hero,
    topTen,
    nickRail,
    disneyMoviesRail,
    pixarRail,
    dreamworksRail,
    illuminationRail,
    ghibliRail,
    disneyChannelRail,
    cartoonNetworkRail,
    nickJrRail,
    boomerangRail,
    animMoviesRail,
    famMoviesRail,
  } = useMemo(() => {
    const heroItem =
      allKids.find((item) => !!item.backdrop && item.rating >= 6.5) ??
      allKids[0];
    const hero: RailItem | null = heroItem
      ? {
          id: heroItem.id,
          title: heroItem.title,
          poster: heroItem.poster,
          backdrop: heroItem.backdrop,
        }
      : null;

    const topTenUsed = new Set<string>();
    const topTen: RailItem[] = [];
    for (const item of allKids) {
      if (!item.poster) continue;
      const key = `${item.type}:${item.id}`;
      if (topTenUsed.has(key)) continue;
      topTenUsed.add(key);
      topTen.push({
        id: item.id,
        title: item.title,
        poster: item.poster,
        backdrop: item.backdrop,
      });
      if (topTen.length >= 10) break;
    }

    return {
      hero,
      topTen,
      // Each rail uses its own dedup + daily shuffle for variety
      nickRail: toRail(
        mergeUnique(shuffleByDay([...(nickelodeonShows as KidsItem[])])),
      ),
      disneyChannelRail: toRail(
        mergeUnique(shuffleByDay([...(disneyChannelShows as KidsItem[])])),
      ),
      cartoonNetworkRail: toRail(
        mergeUnique(shuffleByDay([...(cartoonNetworkShows as KidsItem[])])),
      ),
      nickJrRail: toRail(
        mergeUnique(shuffleByDay([...(nickJrShows as KidsItem[])])),
      ),
      boomerangRail: toRail(
        mergeUnique(shuffleByDay([...(boomerangShows as KidsItem[])])),
      ),
      disneyMoviesRail: toRail(
        mergeUnique(shuffleByDay([...(disneyMovies as KidsItem[])])),
      ),
      pixarRail: toRail(
        mergeUnique(shuffleByDay([...(pixarMovies as KidsItem[])])),
      ),
      dreamworksRail: toRail(
        mergeUnique(shuffleByDay([...(dreamworksMovies as KidsItem[])])),
      ),
      illuminationRail: toRail(
        mergeUnique(shuffleByDay([...(illuminationMovies as KidsItem[])])),
      ),
      ghibliRail: toRail(
        mergeUnique(shuffleByDay([...(ghibliMovies as KidsItem[])])),
      ),
      animMoviesRail: toRail(
        mergeUnique(shuffleByDay([...(animMovies as KidsItem[])])),
      ),
      famMoviesRail: toRail(
        mergeUnique(shuffleByDay([...(famMovies as KidsItem[])])),
      ),
    };
  }, [
    allKids,
    nickelodeonShows,
    disneyChannelShows,
    cartoonNetworkShows,
    nickJrShows,
    boomerangShows,
    disneyMovies,
    pixarMovies,
    dreamworksMovies,
    illuminationMovies,
    ghibliMovies,
    animMovies,
    famMovies,
  ]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      showsVerticalScrollIndicator={false}
      data={[]}
      keyExtractor={() => "kids-root"}
      renderItem={null}
      contentContainerStyle={{
        paddingTop: 0,
        paddingBottom: insets.bottom + 100,
      }}
      ListHeaderComponent={
        <>
          {hero ? <KidsHero item={hero} /> : null}
          <KidsNetworkTiles />
          <GenreButtonRow genres={KIDS_GENRE_ROWS} />

          <TopTenRail
            title="Top 10 Kids op Nexora"
            data={topTen}
            onPress={openDetail}
            onSeeAll={() => {}}
          />

          {nickRail.length > 0 && (
            <>
              <PosterRail
                title="Nickelodeon"
                data={nickRail}
                onPress={openDetail}
                onSeeAll={() =>
                  router.push({
                    pathname: "/media/genre",
                    params: {
                      genreId: "13",
                      genreTitle: "Nickelodeon",
                      type: "tv",
                    },
                  })
                }
              />
            </>
          )}

          {nickJrRail.length > 0 && (
            <PosterRail
              title="Disney Junior"
              data={nickJrRail}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: "281",
                    genreTitle: "Disney Junior",
                    source: "network",
                    type: "tv",
                  },
                })
              }
            />
          )}

          {boomerangRail.length > 0 && (
            <PosterRail
              title="Boomerang"
              data={boomerangRail}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: "523",
                    genreTitle: "Boomerang",
                    source: "network",
                    type: "tv",
                  },
                })
              }
            />
          )}

          {weeklyCollections[0] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[0]}
              onPress={openDetail}
            />
          )}

          {disneyChannelRail.length > 0 && (
            <>
              <PosterRail
                title="Disney Channel"
                data={disneyChannelRail}
                onPress={openDetail}
                onSeeAll={() =>
                  router.push({
                    pathname: "/media/genre",
                    params: {
                      genreId: "54",
                      genreTitle: "Disney Channel",
                      type: "tv",
                    },
                  })
                }
              />
            </>
          )}

          {disneyMoviesRail.length > 0 && (
            <PosterRail
              title="Disney films"
              data={disneyMoviesRail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}

          {weeklyCollections[1] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[1]}
              onPress={openDetail}
            />
          )}

          {pixarRail.length > 0 && (
            <PosterRail
              title="Pixar"
              data={pixarRail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}

          {cartoonNetworkRail.length > 0 && (
            <>
              <PosterRail
                title="Cartoon Network"
                data={cartoonNetworkRail}
                onPress={openDetail}
                onSeeAll={() =>
                  router.push({
                    pathname: "/media/genre",
                    params: {
                      genreId: "56",
                      genreTitle: "Cartoon Network",
                      type: "tv",
                    },
                  })
                }
              />
            </>
          )}

          {weeklyCollections[2] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[2]}
              onPress={openDetail}
            />
          )}

          {dreamworksRail.length > 0 && (
            <PosterRail
              title="DreamWorks"
              data={dreamworksRail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}

          {illuminationRail.length > 0 && (
            <PosterRail
              title="Illumination"
              data={illuminationRail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}

          {ghibliRail.length > 0 && (
            <PosterRail
              title="Studio Ghibli"
              data={ghibliRail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}

          {animMoviesRail.length > 0 && (
            <PosterRail
              title="Alle tekenfilms"
              data={animMoviesRail}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: "16",
                    genreTitle: "Tekenfilms",
                    type: "movie",
                  },
                })
              }
            />
          )}

          {famMoviesRail.length > 0 && (
            <PosterRail
              title="Familie avond"
              data={famMoviesRail}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: "10751",
                    genreTitle: "Familie",
                    type: "movie",
                  },
                })
              }
            />
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(255,0,200,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,0,200,0.45)",
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
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  playBtnText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  listBtn: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  listBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
