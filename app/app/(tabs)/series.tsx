import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Footer } from "@/components/layout/Footer";
import { FilterBar, type FilterOption } from "@/components/media/FilterBar";
import { PosterGrid } from "@/components/media/PosterGrid";
import { MobileHeader } from "@/components/navigation/MobileHeader";
import { Screen } from "@/components/ui/Screen";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { COLORS, FONTS, SPACING } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { GENRES, findGenre } from "@/lib/cinelog/genres";
import { openTitle } from "@/lib/cinelog/navigation";
import { useSeriesBrowse } from "@/lib/cinelog/queries";
import type { SeriesListKey } from "@/lib/cinelog/types";
import { useAuth } from "@/store/auth-store";

const LIST_FILTERS: FilterOption<SeriesListKey>[] = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "top_rated", label: "Top Rated" },
  { value: "airing_now", label: "Airing Now" },
  { value: "new_series", label: "New Series" },
];

const ALL_GENRES = "all";

export default function SeriesScreen() {
  const { isMobile, gutter } = useResponsive();
  const user = useAuth((state) => state.user);
  const params = useLocalSearchParams<{ genre?: string }>();

  const [list, setList] = useState<SeriesListKey>("popular");
  const [genreSlug, setGenreSlug] = useState<string>(
    params.genre && findGenre(params.genre)?.seriesId ? params.genre : ALL_GENRES,
  );

  const genreOptions = useMemo<FilterOption<string>[]>(
    () => [
      { value: ALL_GENRES, label: "All genres" },
      // TMDB has no Horror or Romance genre for television, so those slugs are
      // filtered out rather than returning an empty grid.
      ...GENRES.filter((genre) => genre.seriesId).map((genre) => ({
        value: genre.slug,
        label: genre.label,
      })),
    ],
    [],
  );

  const genreId =
    genreSlug === ALL_GENRES ? null : (findGenre(genreSlug)?.seriesId ?? null);

  const browse = useSeriesBrowse(list, genreId);
  const items = browse.items;

  const activeLabel =
    genreId !== null
      ? (findGenre(genreSlug)?.label ?? "")
      : (LIST_FILTERS.find((filter) => filter.value === list)?.label ?? "");

  return (
    <Screen
      reserveBottomNav
      onEndReached={browse.canLoadMore ? browse.loadMore : undefined}
      header={
        isMobile ? (
          <MobileHeader
            title="Series"
            onOpenProfile={() => router.push("/profile")}
            gutter={gutter}
            displayName={user?.displayName ?? "Guest"}
            avatarUrl={user?.avatarUrl ?? null}
          />
        ) : null
      }
    >
      <View style={styles.head}>
        {isMobile ? null : (
          <Text style={[styles.title, { paddingHorizontal: gutter }]} accessibilityRole="header">
            Series
          </Text>
        )}
        <Text style={[styles.subtitle, { paddingHorizontal: gutter }]}>
          {activeLabel ? `${activeLabel} shows` : "Browse every show"}
        </Text>

        <FilterBar
          options={LIST_FILTERS}
          value={list}
          onChange={(next) => {
            setList(next);
            setGenreSlug(ALL_GENRES);
          }}
          gutter={gutter}
          accessibilityLabel="Series collections"
        />

        <FilterBar
          options={genreOptions}
          value={genreSlug}
          onChange={setGenreSlug}
          heading="Genres"
          gutter={gutter}
          accessibilityLabel="Series genres"
        />
      </View>

      {browse.isError && items.length === 0 ? (
        <ErrorState onRetry={browse.refetch} />
      ) : items.length === 0 && !browse.isLoading ? (
        <EmptyState
          icon="tv-outline"
          title="No shows here yet"
          message="Try another collection or genre to keep discovering."
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
  );
}

const styles = StyleSheet.create({
  head: {
    gap: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: -SPACING.sm,
  },
});
