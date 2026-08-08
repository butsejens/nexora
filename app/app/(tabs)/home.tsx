import React, { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { useT } from "@/i18n";
import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { Carousel } from "@/components/media/Carousel";
import { ContinueWatchingCard } from "@/components/media/ContinueWatchingCard";
import { HeroBanner } from "@/components/media/HeroBanner";
import { PosterCard } from "@/components/media/PosterCard";
import { MobileHeader } from "@/components/navigation/MobileHeader";
import { GenrePill } from "@/components/ui/GenrePill";
import { Screen } from "@/components/ui/Screen";
import { ErrorState } from "@/components/ui/States";
import { FONTS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useTrailerPlayer } from "@/hooks/useTrailerPlayer";
import { GENRES } from "@/lib/cinelog/genres";
import { openTitle } from "@/lib/cinelog/navigation";
import {
  useInterleaved,
  useMovieRail,
  useSeriesRail,
  useTrending,
} from "@/lib/cinelog/queries";
import {
  becauseYouWatched,
  buildTasteProfile,
  recommendForYou,
} from "@/lib/cinelog/recommendations";
import type { MediaSummary } from "@/lib/cinelog/types";
import { useAuth } from "@/store/auth-store";
import {
  useContinueWatching,
  useLibrary,
  useTasteSignals,
} from "@/store/library-store";

export default function HomeScreen() {
  const t = useT();
  const styles = useStyles();
  const { isMobile, gutter, railPosterWidth, width } = useResponsive();
  const user = useAuth((state) => state.user);
  const trailer = useTrailerPlayer();
  const openTrailer = trailer.open;

  const trending = useTrending();
  const popularMovies = useMovieRail("popular");
  const popularSeries = useSeriesRail("popular");
  const newReleases = useMovieRail("now_playing");
  const topRatedMovies = useMovieRail("top_rated");
  const topRatedSeries = useSeriesRail("top_rated");

  const continueWatching = useContinueWatching();
  const clearProgress = useLibrary((state) => state.clearProgress);
  const toggleWatchlist = useLibrary((state) => state.toggleWatchlist);
  const tasteSignals = useTasteSignals();

  const hero =
    trending.items.find((item) => item.backdrop) ?? trending.items[0] ?? null;
  const heroInWatchlist = useLibrary((state) =>
    hero ? state.isInWatchlist(hero.id) : false,
  );

  /** Everything currently loaded, used as the recommendation candidate pool. */
  const candidates = useMemo<MediaSummary[]>(() => {
    const pools = [
      trending.items,
      popularMovies.items,
      popularSeries.items,
      newReleases.items,
      topRatedMovies.items,
      topRatedSeries.items,
    ];
    const seen = new Set<string>();
    const merged: MediaSummary[] = [];
    for (const pool of pools) {
      for (const item of pool) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  }, [
    trending.items,
    popularMovies.items,
    popularSeries.items,
    newReleases.items,
    topRatedMovies.items,
    topRatedSeries.items,
  ]);

  const profile = useMemo(
    () => buildTasteProfile(tasteSignals),
    [tasteSignals],
  );

  const recommended = useMemo(
    () => recommendForYou({ candidates, profile }),
    [candidates, profile],
  );

  const becauseRail = useMemo(
    () => becauseYouWatched(candidates, profile),
    [candidates, profile],
  );

  const topRated = useInterleaved(topRatedMovies.items, topRatedSeries.items);

  const renderPoster = useCallback(
    (item: MediaSummary) => (
      <PosterCard
        item={item}
        width={railPosterWidth}
        onPress={() => openTitle(item)}
        onPlayTrailer={() =>
          openTrailer({
            type: item.type,
            tmdbId: item.tmdbId,
            title: item.title,
          })
        }
      />
    ),
    [railPosterWidth, openTrailer],
  );

  const continueCardWidth = isMobile ? Math.min(width - gutter * 2, 300) : 320;

  const heroUnavailable = trending.isError && trending.items.length === 0;

  return (
    <>
      <SeoHead description="Discover what to watch next: trending films and shows, new releases, top rated picks and recommendations tuned to your taste." />
      <Screen
        reserveBottomNav
        header={
          isMobile ? (
            <MobileHeader
              onOpenProfile={() => router.push("/profile")}
              gutter={gutter}
              displayName={user?.displayName ?? t("Guest")}
              avatarUrl={user?.avatarUrl ?? null}
            />
          ) : null
        }
      >
        {heroUnavailable ? (
          <ErrorState onRetry={trending.refetch} />
        ) : (
          <HeroBanner
            item={hero}
            isLoading={trending.isLoading}
            onOpen={() => hero && openTitle(hero)}
            onWatchTrailer={() =>
              hero &&
              trailer.open({
                type: hero.type,
                tmdbId: hero.tmdbId,
                title: hero.title,
              })
            }
            onToggleWatchlist={() => hero && toggleWatchlist(hero)}
            inWatchlist={heroInWatchlist}
          />
        )}

        <View style={styles.rails}>
          <Carousel
            title={t("Trending Now")}
            items={trending.items}
            isLoading={trending.isLoading}
            itemWidth={railPosterWidth}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
          />

          <Carousel
            title={t("Popular Movies")}
            items={popularMovies.items}
            isLoading={popularMovies.isLoading}
            itemWidth={railPosterWidth}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
            onSeeAll={() => router.navigate("/(tabs)/movies")}
          />

          <Carousel
            title={t("Popular Series")}
            items={popularSeries.items}
            isLoading={popularSeries.isLoading}
            itemWidth={railPosterWidth}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
            onSeeAll={() => router.navigate("/(tabs)/series")}
          />

          {continueWatching.length > 0 ? (
            <Carousel
              title={t("Continue Watching")}
              subtitle={t("Pick up where you left off")}
              items={continueWatching}
              isLoading={false}
              itemWidth={continueCardWidth}
              keyExtractor={(item) => item.id}
              renderItem={(item) => (
                <ContinueWatchingCard
                  progress={item}
                  width={continueCardWidth}
                  onPress={() => openTitle(item)}
                  onRemove={() => clearProgress(item.id)}
                />
              )}
            />
          ) : null}

          <Carousel
            title={t("New Releases")}
            subtitle={t("In cinemas now")}
            items={newReleases.items}
            isLoading={newReleases.isLoading}
            itemWidth={railPosterWidth}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
          />

          <Carousel
            title={t("Top Rated")}
            items={topRated}
            isLoading={topRatedMovies.isLoading || topRatedSeries.isLoading}
            itemWidth={railPosterWidth}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
          />

          <Carousel
            title={t("Recommended For You")}
            subtitle={
              profile.hasSignal
                ? t("Based on what you watch, rate and save")
                : t("Rate a few titles and this gets personal")
            }
            items={recommended.map((entry) => entry.item)}
            isLoading={candidates.length === 0}
            itemWidth={railPosterWidth}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
          />

          {becauseRail ? (
            <Carousel
              title={t("Because You Watched {{title}}", {
                title: becauseRail.seed.title,
              })}
              items={becauseRail.items}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={renderPoster}
            />
          ) : null}

          <View style={styles.genreBlock}>
            <Text style={[styles.genreHeading, { paddingHorizontal: gutter }]}>
              {t("Browse by Genre")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.genreRow,
                { paddingHorizontal: gutter },
              ]}
            >
              {GENRES.map((genre) => (
                <GenrePill
                  key={genre.slug}
                  label={genre.label}
                  onPress={() =>
                    router.navigate({
                      pathname: "/(tabs)/movies",
                      params: { genre: genre.slug },
                    } as never)
                  }
                />
              ))}
            </ScrollView>
          </View>
        </View>

        <Footer />
      </Screen>
      {trailer.element}
    </>
  );
}

const useStyles = makeStyles((c, t) => ({
  rails: {
    gap: SPACING.xxl,
    paddingTop: SPACING.xxl,
  },
  genreBlock: {
    gap: SPACING.md,
  },
  genreHeading: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: c.textPrimary,
  },
  genreRow: {
    gap: SPACING.sm,
  },
}));
