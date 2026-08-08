import React, { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  FavoriteButton,
  TrailerButton,
  WatchStateSelector,
  WatchlistButton,
} from "@/components/actions/TitleActions";
import { Footer } from "@/components/layout/Footer";
import { Carousel } from "@/components/media/Carousel";
import { CastCard } from "@/components/media/CastCard";
import { PosterCard } from "@/components/media/PosterCard";
import { TitleHero } from "@/components/media/TitleHero";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { RatingInput } from "@/components/ui/Rating";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useTrailerPlayer } from "@/hooks/useTrailerPlayer";
import { openPerson, openTitle, parseIdParam } from "@/lib/cinelog/navigation";
import { useMovieDetail } from "@/lib/cinelog/queries";
import { formatRuntime } from "@/lib/format";
import type { MediaSummary } from "@/lib/cinelog/types";
import { toLibraryRef, useLibrary } from "@/store/library-store";

export default function MovieDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const tmdbId = parseIdParam(params.id);
  const { gutter, railPosterWidth, isMobile } = useResponsive();

  const detail = useMovieDetail(tmdbId);
  const movie = detail.data?.title;

  const trailer = useTrailerPlayer(detail.data?.trailers[0] ?? null);

  const ref = useMemo(() => (movie ? toLibraryRef(movie) : null), [movie]);
  const userRating = useLibrary((state) => (ref ? state.getRating(ref.id) : null));
  const rate = useLibrary((state) => state.rate);
  const clearRating = useLibrary((state) => state.clearRating);

  const renderPoster = useCallback(
    (item: MediaSummary) => (
      <PosterCard
        item={item}
        width={railPosterWidth}
        onPress={() => openTitle(item)}
        onPlayTrailer={() =>
          trailer.open({ type: item.type, tmdbId: item.tmdbId, title: item.title })
        }
      />
    ),
    [railPosterWidth, trailer],
  );

  if (!tmdbId) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title="We couldn't open that film"
          message="The link looks incomplete. Head back and pick a title again."
          onRetry={() => router.replace("/(tabs)/movies")}
        />
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen scroll={false}>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />
        <ErrorState onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }

  if (!movie || !ref) {
    return (
      <Screen>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />
        <Skeleton width="100%" height={isMobile ? 260 : 420} radius={0} />
        <View style={[styles.loadingBody, { paddingHorizontal: gutter }]}>
          <Skeleton width="60%" height={30} />
          <Skeleton width="40%" height={14} />
          <Skeleton width="90%" height={14} />
          <Skeleton width="80%" height={14} />
        </View>
      </Screen>
    );
  }

  const cast = detail.data?.cast ?? [];
  const similar = detail.data?.similar ?? [];
  const recommendations = detail.data?.recommendations ?? [];
  const castCardWidth = isMobile ? 92 : 116;

  return (
    <>
      <Screen reserveBottomNav>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />

        <TitleHero
          title={movie.title}
          tagline={movie.tagline}
          overview={movie.overview}
          poster={movie.poster}
          backdrop={movie.backdrop}
          rating={movie.rating}
          metaParts={[
            movie.year || null,
            movie.certification,
            formatRuntime(movie.runtime),
            movie.directors.length ? `Dir. ${movie.directors[0]}` : null,
          ]}
          genres={movie.genres}
          actions={
            <>
              <TrailerButton
                size="lg"
                onPress={() =>
                  trailer.open({
                    type: "movie",
                    tmdbId: movie.tmdbId,
                    title: movie.title,
                  })
                }
              />
              <WatchlistButton item={ref} size="lg" />
              <FavoriteButton item={ref} />
            </>
          }
        />

        <View style={styles.sections}>
          <View style={[styles.trackingBlock, { paddingHorizontal: gutter }]}>
            <WatchStateSelector item={ref} />
            <RatingInput
              value={userRating}
              onChange={(score) => rate(ref, score)}
              onClear={() => clearRating(ref.id)}
              averageRating={movie.rating}
              voteCount={movie.voteCount}
            />
          </View>

          {cast.length > 0 ? (
            <Carousel
              title="Cast"
              items={cast}
              isLoading={false}
              itemWidth={castCardWidth}
              keyExtractor={(member) => String(member.id)}
              renderItem={(member) => (
                <CastCard
                  member={member}
                  width={castCardWidth}
                  onPress={() => openPerson(member.id)}
                />
              )}
            />
          ) : null}

          {similar.length > 0 ? (
            <Carousel
              title="Similar Movies"
              items={similar}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={renderPoster}
            />
          ) : null}

          {recommendations.length > 0 ? (
            <Carousel
              title="More Like This"
              items={recommendations}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={renderPoster}
            />
          ) : null}
        </View>

        <Footer />
      </Screen>
      {trailer.element}
    </>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: SPACING.xxl,
    paddingTop: SPACING.xxl,
  },
  trackingBlock: {
    gap: SPACING.lg,
  },
  loadingBody: {
    gap: SPACING.md,
    paddingTop: SPACING.xl,
  },
});
