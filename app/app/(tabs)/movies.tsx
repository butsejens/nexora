import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useT } from "@/i18n";
import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { FilterBar, type FilterOption } from "@/components/media/FilterBar";
import { PosterGrid } from "@/components/media/PosterGrid";
import { MobileHeader } from "@/components/navigation/MobileHeader";
import { Screen } from "@/components/ui/Screen";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { FONTS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { GENRES, findGenre } from "@/lib/cinelog/genres";
import { openTitle } from "@/lib/cinelog/navigation";
import { useMovieBrowse } from "@/lib/cinelog/queries";
import type { MovieListKey } from "@/lib/cinelog/types";
import { useAuth } from "@/store/auth-store";

const LIST_FILTERS: FilterOption<MovieListKey>[] = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "top_rated", label: "Top Rated" },
  { value: "now_playing", label: "Now Playing" },
  { value: "upcoming", label: "Upcoming" },
];

const ALL_GENRES = "all";

export default function MoviesScreen() {
  const t = useT();
  const styles = useStyles();
  const { isMobile, gutter } = useResponsive();
  const user = useAuth((state) => state.user);
  const params = useLocalSearchParams<{ genre?: string }>();

  const [list, setList] = useState<MovieListKey>("popular");
  const [genreSlug, setGenreSlug] = useState<string>(
    params.genre && findGenre(params.genre) ? params.genre : ALL_GENRES,
  );

  const genreOptions = useMemo<FilterOption<string>[]>(
    () => [
      { value: ALL_GENRES, label: "All genres" },
      ...GENRES.filter((genre) => genre.movieId).map((genre) => ({
        value: genre.slug,
        label: genre.label,
      })),
    ],
    [],
  );

  const genreId =
    genreSlug === ALL_GENRES ? null : (findGenre(genreSlug)?.movieId ?? null);

  const browse = useMovieBrowse(list, genreId);
  const items = browse.items;

  const activeLabel =
    genreId !== null
      ? (findGenre(genreSlug)?.label ?? "")
      : (LIST_FILTERS.find((filter) => filter.value === list)?.label ?? "");

  return (
    <>
      <SeoHead
        title={t("Movies")}
        description="Browse popular, trending, top rated, now playing and upcoming films by genre."
      />
      <Screen
        reserveBottomNav
        onEndReached={browse.canLoadMore ? browse.loadMore : undefined}
        header={
          isMobile ? (
            <MobileHeader
              title={t("Movies")}
              onOpenProfile={() => router.push("/profile")}
              gutter={gutter}
              displayName={user?.displayName ?? t("Guest")}
              avatarUrl={user?.avatarUrl ?? null}
            />
          ) : null
        }
      >
        <View style={styles.head}>
          {isMobile ? null : (
            <Text
              style={[styles.title, { paddingHorizontal: gutter }]}
              accessibilityRole="header"
            >
              {t("Movies")}
            </Text>
          )}
          <Text style={[styles.subtitle, { paddingHorizontal: gutter }]}>
            {activeLabel
              ? t("{{label}} films", { label: t(activeLabel) })
              : t("Browse every film")}
          </Text>

          <FilterBar
            options={LIST_FILTERS}
            value={list}
            onChange={(next) => {
              setList(next);
              // A curated list replaces a genre filter rather than stacking with it.
              setGenreSlug(ALL_GENRES);
            }}
            gutter={gutter}
            accessibilityLabel={t("Movie collections")}
          />

          <FilterBar
            options={genreOptions}
            value={genreSlug}
            onChange={setGenreSlug}
            heading={t("Genres")}
            gutter={gutter}
            accessibilityLabel={t("Movie genres")}
          />
        </View>

        {browse.isError && items.length === 0 ? (
          <ErrorState onRetry={browse.refetch} />
        ) : items.length === 0 && !browse.isLoading ? (
          <EmptyState
            icon="film-outline"
            title={t("No films here yet")}
            message={t("Try another collection or genre to keep discovering.")}
          />
        ) : (
          <PosterGrid
            items={items}
            onSelect={openTitle}
            isLoading={browse.isLoading}
            isLoadingMore={browse.isLoadingMore}
          />
        )}

        <Footer />
      </Screen>
    </>
  );
}

const useStyles = makeStyles((c, t) => ({
  head: {
    gap: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: c.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: c.textSecondary,
    marginTop: -SPACING.sm,
  },
}));
