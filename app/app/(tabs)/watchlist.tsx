import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { useT } from "@/i18n";
import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { FilterBar, type FilterOption } from "@/components/media/FilterBar";
import { PosterCard } from "@/components/media/PosterCard";
import { usePosterMetrics } from "@/components/media/PosterGrid";
import { MobileHeader } from "@/components/navigation/MobileHeader";
import { IconButton } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/States";
import { FONTS, SPACING } from "@/constants/theme";
import { makeStyles } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { openTitle } from "@/lib/cinelog/navigation";
import { useAuth } from "@/store/auth-store";
import {
  sortWatchlist,
  useLibrary,
  type WatchlistSort,
} from "@/store/library-store";

type WatchlistTab = "all" | "movies" | "series";

const TABS: FilterOption<WatchlistTab>[] = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "series", label: "Series" },
];

const SORTS: FilterOption<WatchlistSort>[] = [
  { value: "recently_added", label: "Recently Added" },
  { value: "rating", label: "Rating" },
  { value: "release_date", label: "Release Date" },
  { value: "alphabetical", label: "Alphabetical" },
];

export default function WatchlistScreen() {
  const t = useT();
  const styles = useStyles();
  const { isMobile, gutter } = useResponsive();
  const { posterWidth } = usePosterMetrics();
  const user = useAuth((state) => state.user);

  const watchlist = useLibrary((state) => state.watchlist);
  const removeFromWatchlist = useLibrary((state) => state.removeFromWatchlist);

  const [tab, setTab] = useState<WatchlistTab>("all");
  const [sort, setSort] = useState<WatchlistSort>("recently_added");

  const items = useMemo(() => {
    const filtered = watchlist.filter((entry) =>
      tab === "all"
        ? true
        : tab === "movies"
          ? entry.type === "movie"
          : entry.type === "series",
    );
    return sortWatchlist(filtered, sort);
  }, [watchlist, tab, sort]);

  const counts = useMemo(
    () => ({
      all: watchlist.length,
      movies: watchlist.filter((entry) => entry.type === "movie").length,
      series: watchlist.filter((entry) => entry.type === "series").length,
    }),
    [watchlist],
  );

  const tabsWithCounts = TABS.map((option) => ({
    ...option,
    count: counts[option.value],
  }));

  return (
    <>
      <SeoHead
        title={t("Watchlist")}
        description="Everything you saved to watch later, sorted the way you want it."
      />
      <Screen
        reserveBottomNav
        header={
          isMobile ? (
            <MobileHeader
              title={t("Watchlist")}
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
              {t("Watchlist")}
            </Text>
          )}
          <Text style={[styles.subtitle, { paddingHorizontal: gutter }]}>
            {watchlist.length === 0
              ? t("Everything you save lands here")
              : t(
                  watchlist.length === 1
                    ? "{{count}} title saved"
                    : "{{count}} titles saved",
                  { count: watchlist.length },
                )}
          </Text>

          {watchlist.length > 0 ? (
            <>
              <FilterBar
                options={tabsWithCounts}
                value={tab}
                onChange={setTab}
                gutter={gutter}
                accessibilityLabel={t("Watchlist type")}
              />
              <FilterBar
                options={SORTS}
                value={sort}
                onChange={setSort}
                heading={t("Sort by")}
                gutter={gutter}
                accessibilityLabel={t("Watchlist sorting")}
              />
            </>
          ) : null}
        </View>

        {watchlist.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title={t("Your watchlist is empty")}
            message={t(
              "Start discovering movies and series to build your list.",
            )}
            actionLabel={t("Explore")}
            onAction={() => router.navigate("/(tabs)/home")}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="funnel-outline"
            title={t("Nothing in this filter")}
            message={t(
              tab === "movies"
                ? "You haven't saved any films yet."
                : "You haven't saved any shows yet.",
            )}
            compact
          />
        ) : (
          <View style={[styles.grid, { paddingHorizontal: gutter }]}>
            {items.map((item) => (
              <View key={item.id} style={{ width: posterWidth }}>
                <PosterCard
                  item={item}
                  width={posterWidth}
                  onPress={() => openTitle(item)}
                />
                <View style={styles.removeSlot}>
                  <IconButton
                    icon="trash-outline"
                    label={`Remove ${item.title} from your watchlist`}
                    onPress={() => removeFromWatchlist(item.id)}
                    size={30}
                  />
                </View>
              </View>
            ))}
          </View>
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
  removeSlot: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
  },
}));
