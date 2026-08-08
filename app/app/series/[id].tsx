import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  FavoriteButton,
  TrailerButton,
  WatchStateSelector,
  WatchlistButton,
} from "@/components/actions/TitleActions";
import { useT } from "@/i18n";
import { Footer } from "@/components/layout/Footer";
import { SeoHead } from "@/components/SeoHead";
import { Carousel } from "@/components/media/Carousel";
import { CastCard } from "@/components/media/CastCard";
import { EpisodeCard } from "@/components/media/EpisodeCard";
import { PosterCard } from "@/components/media/PosterCard";
import { TitleHero } from "@/components/media/TitleHero";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { GenrePill } from "@/components/ui/GenrePill";
import { RatingInput } from "@/components/ui/Rating";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { FONTS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useTrailerPlayer } from "@/hooks/useTrailerPlayer";
import { openPerson, openTitle, parseIdParam } from "@/lib/cinelog/navigation";
import { useSeason, useSeriesDetail } from "@/lib/cinelog/queries";
import { formatRuntime } from "@/lib/format";
import type { MediaSummary } from "@/lib/cinelog/types";
import { toLibraryRef, useLibrary } from "@/store/library-store";

export default function SeriesDetailScreen() {
  const t = useT();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string }>();
  const tmdbId = parseIdParam(params.id);
  const { gutter, railPosterWidth, isMobile, width } = useResponsive();

  const detail = useSeriesDetail(tmdbId);
  const series = detail.data?.title;

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Default to the first real season once the detail payload lands.
  useEffect(() => {
    if (selectedSeason === null && series?.seasons.length) {
      setSelectedSeason(series.seasons[0].seasonNumber);
    }
  }, [series?.seasons, selectedSeason]);

  const season = useSeason(tmdbId, selectedSeason);
  const trailer = useTrailerPlayer(detail.data?.trailers[0] ?? null);
  const openTrailer = trailer.open;

  const ref = useMemo(() => (series ? toLibraryRef(series) : null), [series]);
  const userRating = useLibrary((state) =>
    ref ? state.getRating(ref.id) : null,
  );
  const rate = useLibrary((state) => state.rate);
  const clearRating = useLibrary((state) => state.clearRating);
  const episodeMap = useLibrary((state) =>
    ref ? state.episodes[ref.id] : undefined,
  );
  const toggleEpisodeWatched = useLibrary(
    (state) => state.toggleEpisodeWatched,
  );
  const saveProgress = useLibrary((state) => state.saveProgress);
  const clearProgress = useLibrary((state) => state.clearProgress);

  const episodes = useMemo(
    () => season.data?.episodes ?? [],
    [season.data?.episodes],
  );

  /** First unwatched episode of the selected season gets the "up next" accent. */
  const upNextNumber = useMemo(() => {
    for (const episode of episodes) {
      const key = `s${episode.seasonNumber}e${episode.episodeNumber}`;
      if (!episodeMap?.[key]) return episode.episodeNumber;
    }
    return null;
  }, [episodes, episodeMap]);

  /**
   * Ticking episodes is how CineLog learns where a viewer is in a show, so each
   * toggle recomputes season progress and points Continue Watching at whatever
   * comes next.
   */
  const handleEpisodeToggle = useCallback(
    (episodeNumber: number, seasonNumber: number, episodeTitle: string) => {
      if (!ref) return;
      const nowWatched = toggleEpisodeWatched(
        ref,
        seasonNumber,
        episodeNumber,
        episodeTitle,
      );

      const watchedNumbers = new Set(
        episodes
          .filter((episode) =>
            Boolean(
              episodeMap?.[`s${episode.seasonNumber}e${episode.episodeNumber}`],
            ),
          )
          .map((episode) => episode.episodeNumber),
      );
      if (nowWatched) watchedNumbers.add(episodeNumber);
      else watchedNumbers.delete(episodeNumber);

      if (watchedNumbers.size === 0) {
        clearProgress(ref.id);
        return;
      }

      const next = episodes.find(
        (episode) => !watchedNumbers.has(episode.episodeNumber),
      );
      const percent = Math.round((watchedNumbers.size / episodes.length) * 100);

      saveProgress(ref, {
        // A finished season shouldn't be reported as complete for the whole show
        // when later seasons exist, so cap it just below the "watched" threshold.
        percent: next ? percent : Math.min(percent, 94),
        seasonNumber,
        episodeNumber: next?.episodeNumber ?? episodeNumber,
        episodeTitle: next?.title ?? episodeTitle,
      });
    },
    [
      ref,
      episodes,
      episodeMap,
      toggleEpisodeWatched,
      saveProgress,
      clearProgress,
    ],
  );

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

  if (!tmdbId) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title={t("We couldn't open that show")}
          message={t(
            "The link looks incomplete. Head back and pick a title again.",
          )}
          onRetry={() => router.replace("/(tabs)/series")}
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

  if (!series || !ref) {
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
  const stillWidth = isMobile ? 108 : 168;
  const contentWidth = Math.min(width, 1600) - gutter * 2;

  return (
    <>
      <SeoHead
        title={series.year ? `${series.title} (${series.year})` : series.title}
        description={series.overview}
        image={series.backdrop ?? series.poster}
      />
      <Screen reserveBottomNav>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />

        <TitleHero
          title={series.title}
          tagline={
            series.creators.length
              ? t("Created by {{name}}", { name: series.creators[0] })
              : null
          }
          overview={series.overview}
          poster={series.poster}
          backdrop={series.backdrop}
          rating={series.rating}
          metaParts={[
            series.year || null,
            series.certification,
            series.seasonCount
              ? t(
                  series.seasonCount === 1
                    ? "{{count}} Season"
                    : "{{count}} Seasons",
                  { count: series.seasonCount },
                )
              : null,
            series.episodeCount
              ? t("{{count}} Episodes", { count: series.episodeCount })
              : null,
            formatRuntime(series.episodeRuntime),
            series.networks[0] ?? null,
          ]}
          genres={series.genres}
          actions={
            <>
              <TrailerButton
                size="lg"
                onPress={() =>
                  trailer.open({
                    type: "series",
                    tmdbId: series.tmdbId,
                    title: series.title,
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
              averageRating={series.rating}
              voteCount={series.voteCount}
            />
          </View>

          {series.seasons.length > 0 ? (
            <View style={styles.seasonBlock}>
              <Text
                style={[styles.sectionTitle, { paddingHorizontal: gutter }]}
              >
                {t("Seasons")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.seasonRow,
                  { paddingHorizontal: gutter },
                ]}
                accessibilityRole="tablist"
                accessibilityLabel={t("Select a season")}
              >
                {series.seasons.map((entry) => (
                  <GenrePill
                    key={entry.seasonNumber}
                    label={t("Season {{number}}", {
                      number: entry.seasonNumber,
                    })}
                    selected={entry.seasonNumber === selectedSeason}
                    onPress={() => setSelectedSeason(entry.seasonNumber)}
                  />
                ))}
              </ScrollView>

              <View style={[styles.episodeList, { paddingHorizontal: gutter }]}>
                {season.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      width={contentWidth}
                      height={96}
                      radius={18}
                    />
                  ))
                ) : season.isError ? (
                  <ErrorState
                    compact
                    title={t("Episodes unavailable")}
                    message={t(
                      "We couldn't load this season right now. Please try again.",
                    )}
                    onRetry={() => void season.refetch()}
                  />
                ) : episodes.length === 0 ? (
                  <Text style={styles.noEpisodes}>
                    {t("No episode details published for this season yet.")}
                  </Text>
                ) : (
                  episodes.map((episode) => (
                    <EpisodeCard
                      key={episode.id}
                      episode={episode}
                      stillWidth={stillWidth}
                      watched={Boolean(
                        episodeMap?.[
                          `s${episode.seasonNumber}e${episode.episodeNumber}`
                        ],
                      )}
                      isUpNext={episode.episodeNumber === upNextNumber}
                      onToggleWatched={() =>
                        handleEpisodeToggle(
                          episode.episodeNumber,
                          episode.seasonNumber,
                          episode.title,
                        )
                      }
                    />
                  ))
                )}
              </View>
            </View>
          ) : null}

          {cast.length > 0 ? (
            <Carousel
              title={t("Cast")}
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
              title={t("Similar Series")}
              items={similar}
              isLoading={false}
              itemWidth={railPosterWidth}
              keyExtractor={(item) => item.id}
              renderItem={renderPoster}
            />
          ) : null}

          {recommendations.length > 0 ? (
            <Carousel
              title={t("More Like This")}
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

const useStyles = makeStyles((c, t) => ({
  sections: {
    gap: SPACING.xxl,
    paddingTop: SPACING.xxl,
  },
  trackingBlock: {
    gap: SPACING.lg,
  },
  seasonBlock: {
    gap: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: c.textPrimary,
  },
  seasonRow: {
    gap: SPACING.sm,
  },
  episodeList: {
    gap: SPACING.sm,
  },
  noEpisodes: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: c.textMuted,
  },
  loadingBody: {
    gap: SPACING.md,
    paddingTop: SPACING.xl,
  },
}));
