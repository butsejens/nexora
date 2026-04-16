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
  useMoviesByGenreAll,
  useMoviesFromYearRange,
  useNowPlayingMovies,
  usePopularMovies,
  useTopRatedMovies,
  useUpcomingMovies,
} from "@/lib/use-tmdb";
import type { Movie } from "@/types/streaming";
import {
  FeaturedCollectionRail,
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
            style={heroStyles.playBtn}
            onPress={() =>
              router.push({
                pathname: "/detail",
                params: { id: item.id, type: item.type ?? "movie" },
              })
            }
          >
            <Text style={heroStyles.playBtnText}>▶ Afspelen</Text>
          </Pressable>
          <Pressable
            style={heroStyles.listBtn}
            onPress={() =>
              router.push({
                pathname: "/detail",
                params: { id: item.id, type: item.type ?? "movie" },
              })
            }
          >
            <Text style={heroStyles.listBtnText}>Meer info</Text>
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
    backgroundColor: "rgba(255,0,200,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,0,200,0.42)",
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
    paddingHorizontal: 18,
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
    paddingHorizontal: 18,
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

const GENRE_ROWS = [
  { title: "Actie", id: 28 },
  { title: "Moord & misdaad", id: 80 },
  { title: "Drama", id: 18 },
  { title: "Horror", id: 27 },
  { title: "Komedie", id: 35 },
  { title: "Thriller", id: 53 },
  { title: "Familie", id: 10751 },
  { title: "Fantasy", id: 14 },
] as const;

// All franchise/themed collections — rotated weekly (5 shown at a time)
// Titles come from the TMDB API directly so they always match the actual films
const ALL_FRANCHISE_COLLECTIONS: readonly number[] = [
  1241, // Harry Potter
  131296, // The Hunger Games
  9485, // Fast & Furious
  119, // The Lord of the Rings
  87359, // Mission: Impossible
  404609, // John Wick
  556, // Spider-Man (Raimi)
  86311, // The Avengers
  328, // Jurassic Park
  748, // X-Men
  295130, // Pirates of the Caribbean
  84, // Indiana Jones
  4321, // Scream
  656, // Saw
  10194, // Toy Story
  2150, // Shrek
  528, // Terminator
  8091, // Alien
  531241, // Spider-Man: Homecoming
] as const;

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

function mergeUnique(items: Movie[]): Movie[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.poster) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function openDetail(item: RailItem) {
  router.push({ pathname: "/detail", params: { id: item.id, type: "movie" } });
}

export default function MoviesScreen() {
  const insets = useSafeAreaInsets();

  const { data: nowPlaying = [] } = useNowPlayingMovies();
  const { data: popular = [] } = usePopularMovies();
  const { data: topRated = [] } = useTopRatedMovies();
  const { data: documentaries = [] } = useMoviesByGenreAll([99], true, 3);
  const { data: genreActie = [] } = useMoviesByGenreAll([28], true, 3);
  const { data: genreMisdaad = [] } = useMoviesByGenreAll([80], true, 3);
  const { data: genreDrama = [] } = useMoviesByGenreAll([18], true, 3);
  const { data: genreHorror = [] } = useMoviesByGenreAll([27], true, 3);
  const { data: genreKomedie = [] } = useMoviesByGenreAll([35], true, 3);
  const { data: genreThriller = [] } = useMoviesByGenreAll([53], true, 3);
  const { data: genreFamilie = [] } = useMoviesByGenreAll([10751], true, 3);
  const { data: genreFantasy = [] } = useMoviesByGenreAll([14], true, 3);

  // Year-range rails: films from 1950 to today + upcoming
  const { data: klassiekers = [] } = useMoviesFromYearRange(1950, 1989);
  const { data: jaren90 = [] } = useMoviesFromYearRange(1990, 1999);
  const { data: jaren2000 = [] } = useMoviesFromYearRange(2000, 2009);
  const { data: upcoming = [] } = useUpcomingMovies();

  const heroMovie = useMemo(
    () =>
      withBackdrop(mergeUnique([...popular, ...topRated, ...nowPlaying]))[0] ??
      null,
    [popular, topRated, nowPlaying],
  );

  const weeklyCollections = useMemo(
    () => getWeeklyPicks(ALL_FRANCHISE_COLLECTIONS, 5),
    [],
  );

  const rails = useMemo(() => {
    // Shared dedup for editorial rails — items appear in exactly one top section
    const used = new Set<string>();
    const pick = (candidates: Movie[], limit: number): RailItem[] => {
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

    // Each genre rail gets its OWN dedup so it always shows its best content
    // regardless of what appeared in the editorial rails above
    const pickGenre = (candidates: Movie[], limit: number): RailItem[] => {
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

    const topTenFilms = pick(
      mergeUnique([...popular, ...topRated, ...nowPlaying]),
      10,
    );
    const trendingNow = pick(
      mergeUnique([...nowPlaying, ...popular, ...topRated]),
      18,
    );
    const newCinema = pick(mergeUnique([...nowPlaying, ...popular]), 16);
    const topTenDocu = pick(mergeUnique(documentaries), 10);
    const bestRated = pick(mergeUnique([...topRated, ...popular]), 16);

    const genreRails: { title: string; id: number; items: RailItem[] }[] = [
      { title: "Actie", id: 28, items: pickGenre(mergeUnique(genreActie), 40) },
      {
        title: "Moord & misdaad",
        id: 80,
        items: pickGenre(mergeUnique(genreMisdaad), 40),
      },
      { title: "Drama", id: 18, items: pickGenre(mergeUnique(genreDrama), 40) },
      {
        title: "Horror",
        id: 27,
        items: pickGenre(mergeUnique(genreHorror), 40),
      },
      {
        title: "Komedie",
        id: 35,
        items: pickGenre(mergeUnique(genreKomedie), 40),
      },
      {
        title: "Thriller",
        id: 53,
        items: pickGenre(mergeUnique(genreThriller), 40),
      },
      {
        title: "Familie",
        id: 10751,
        items: pickGenre(mergeUnique(genreFamilie), 40),
      },
      {
        title: "Fantasy",
        id: 14,
        items: pickGenre(mergeUnique(genreFantasy), 40),
      },
    ];

    // Decade/era rails — each with its own isolated dedup pool
    const pickEra = (candidates: Movie[], limit: number): RailItem[] => {
      const eraUsed = new Set<string>();
      const out: RailItem[] = [];
      for (const item of candidates) {
        if (!item.poster) continue;
        if (eraUsed.has(item.id)) continue;
        eraUsed.add(item.id);
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

    const klassieker = pickEra(mergeUnique(klassiekers), 40);
    const jaren90Rail = pickEra(mergeUnique(jaren90), 40);
    const jaren2000Rail = pickEra(mergeUnique(jaren2000), 40);
    const upcomingRail = pickEra(mergeUnique(upcoming), 20);

    return {
      topTenFilms,
      trendingNow,
      newCinema,
      topTenDocu,
      bestRated,
      genreRails,
      klassieker,
      jaren90Rail,
      jaren2000Rail,
      upcomingRail,
    };
  }, [
    popular,
    topRated,
    nowPlaying,
    documentaries,
    genreActie,
    genreMisdaad,
    genreDrama,
    genreHorror,
    genreKomedie,
    genreThriller,
    genreFamilie,
    genreFantasy,
    klassiekers,
    jaren90,
    jaren2000,
    upcoming,
  ]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.background }}
      showsVerticalScrollIndicator={false}
      data={[]}
      keyExtractor={() => "movies-root"}
      renderItem={null}
      contentContainerStyle={{
        paddingTop: 0,
        paddingBottom: insets.bottom + 100,
      }}
      ListHeaderComponent={
        <>
          {heroMovie ? <TabHero item={heroMovie} badge="Nexora Films" /> : null}
          <GenreButtonRow
            genres={GENRE_ROWS}
            onPress={(genre) =>
              router.push({
                pathname: "/media/genre",
                params: {
                  genreId: String(genre.id),
                  genreTitle: genre.title,
                  type: "movie",
                },
              })
            }
          />
          <TopTenRail
            title="Top 10 films op Nexora"
            data={rails.topTenFilms}
            onPress={openDetail}
            onSeeAll={() => {}}
          />
          <PosterRail
            title="Trending nu"
            data={rails.trendingNow}
            onPress={openDetail}
            onSeeAll={() => {}}
          />
          <PosterRail
            title="Nieuw in de bioscoop"
            data={rails.newCinema}
            onPress={openDetail}
            onSeeAll={() => {}}
          />
          {weeklyCollections[0] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[0]}
              onPress={openDetail}
            />
          )}
          <TopTenRail
            title="Top 10 docu's op Nexora"
            data={rails.topTenDocu}
            onPress={openDetail}
            onSeeAll={() => {}}
          />
          <PosterRail
            title="Hoogst gewaardeerd"
            data={rails.bestRated}
            onPress={openDetail}
            onSeeAll={() => {}}
          />
          {weeklyCollections[1] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[1]}
              onPress={openDetail}
            />
          )}
          {rails.upcomingRail.length > 0 && (
            <PosterRail
              title="🎬 Binnenkort te zien"
              data={rails.upcomingRail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}
          {rails.genreRails.slice(0, 1).map((genre) => (
            <PosterRail
              key={genre.id}
              title={genre.title}
              data={genre.items}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: String(genre.id),
                    genreTitle: genre.title,
                    type: "movie",
                  },
                })
              }
            />
          ))}
          {weeklyCollections[2] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[2]}
              onPress={openDetail}
            />
          )}
          {rails.genreRails.slice(1, 3).map((genre) => (
            <PosterRail
              key={genre.id}
              title={genre.title}
              data={genre.items}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: String(genre.id),
                    genreTitle: genre.title,
                    type: "movie",
                  },
                })
              }
            />
          ))}
          {weeklyCollections[3] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[3]}
              onPress={openDetail}
            />
          )}
          {rails.genreRails.slice(3, 5).map((genre) => (
            <PosterRail
              key={genre.id}
              title={genre.title}
              data={genre.items}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: String(genre.id),
                    genreTitle: genre.title,
                    type: "movie",
                  },
                })
              }
            />
          ))}
          {weeklyCollections[4] != null && (
            <FeaturedCollectionRail
              collectionId={weeklyCollections[4]}
              onPress={openDetail}
            />
          )}
          {rails.genreRails.slice(5).map((genre) => (
            <PosterRail
              key={genre.id}
              title={genre.title}
              data={genre.items}
              onPress={openDetail}
              onSeeAll={() =>
                router.push({
                  pathname: "/media/genre",
                  params: {
                    genreId: String(genre.id),
                    genreTitle: genre.title,
                    type: "movie",
                  },
                })
              }
            />
          ))}
          {rails.jaren2000Rail.length > 0 && (
            <PosterRail
              title="📽️ Jaren 2000 — Populaire films"
              data={rails.jaren2000Rail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}
          {rails.jaren90Rail.length > 0 && (
            <PosterRail
              title="🎞️ Jaren '90 — Klassiekers"
              data={rails.jaren90Rail}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}
          {rails.klassieker.length > 0 && (
            <PosterRail
              title="🎬 Meesterwerken 1950–1989"
              data={rails.klassieker}
              onPress={openDetail}
              onSeeAll={() => {}}
            />
          )}
        </>
      }
    />
  );
}
