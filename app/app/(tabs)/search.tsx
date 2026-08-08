import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { SeoHead } from "@/components/SeoHead";
import { FilterBar, type FilterOption } from "@/components/media/FilterBar";
import { PosterGrid, usePosterMetrics } from "@/components/media/PosterGrid";
import { MobileHeader } from "@/components/navigation/MobileHeader";
import { GenrePill } from "@/components/ui/GenrePill";
import { Screen } from "@/components/ui/Screen";
import { SearchBar } from "@/components/ui/SearchBar";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { COLORS, FONTS, RADIUS, SPACING } from "@/constants/theme";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useResponsive } from "@/hooks/useResponsive";
import { supportsPeopleSearch } from "@/lib/cinelog/api";
import { openPerson, openTitle } from "@/lib/cinelog/navigation";
import { useSearch } from "@/lib/cinelog/queries";
import type { PersonResult } from "@/lib/cinelog/types";
import { useAuth } from "@/store/auth-store";
import { useLibrary } from "@/store/library-store";
import { Pressable } from "@/components/ui/Pressable";

type SearchTab = "all" | "movies" | "series" | "people";

/** Evergreen suggestions shown before a viewer has typed anything. */
const POPULAR_SEARCHES = [
  "Dune",
  "Breaking Bad",
  "Christopher Nolan",
  "Studio Ghibli",
  "The Bear",
  "Blade Runner",
  "Severance",
  "Denis Villeneuve",
];

export default function SearchScreen() {
  const { isMobile, gutter } = useResponsive();
  const { columns, posterWidth } = usePosterMetrics();
  const user = useAuth((state) => state.user);

  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const debounced = useDebouncedValue(term, 350);

  const recentSearches = useLibrary((state) => state.recentSearches);
  const addRecentSearch = useLibrary((state) => state.addRecentSearch);
  const clearRecentSearches = useLibrary((state) => state.clearRecentSearches);

  const search = useSearch(debounced);
  const results = search.data;

  // Only remember a term once it actually returned something.
  useEffect(() => {
    if (debounced.trim().length < 2 || !results) return;
    const total =
      results.movies.length + results.series.length + results.people.length;
    if (total > 0) addRecentSearch(debounced);
  }, [debounced, results, addRecentSearch]);

  const tabs = useMemo<FilterOption<SearchTab>[]>(() => {
    const base: FilterOption<SearchTab>[] = [
      {
        value: "all",
        label: "All",
        count: results
          ? results.movies.length +
            results.series.length +
            results.people.length
          : undefined,
      },
      { value: "movies", label: "Movies", count: results?.movies.length },
      { value: "series", label: "Series", count: results?.series.length },
    ];
    // People search needs TMDB's person index, which only the direct transport
    // reaches — hiding the tab beats showing one that can never fill.
    if (supportsPeopleSearch) {
      base.push({
        value: "people",
        label: "People",
        count: results?.people.length,
      });
    }
    return base;
  }, [results]);

  const runSuggestion = useCallback((value: string) => {
    setTerm(value);
    setTab("all");
  }, []);

  const hasQuery = debounced.trim().length >= 2;
  const isSearching = hasQuery && search.isFetching && !results;
  const totalResults = results
    ? results.movies.length + results.series.length + results.people.length
    : 0;

  return (
    <>
      <SeoHead
        title="Search"
        description="Search thousands of movies and series and jump straight to the details."
      />
      <Screen
        reserveBottomNav
        header={
          isMobile ? (
            <MobileHeader
              title="Search"
              onOpenProfile={() => router.push("/profile")}
              gutter={gutter}
              displayName={user?.displayName ?? "Guest"}
              avatarUrl={user?.avatarUrl ?? null}
            />
          ) : null
        }
      >
        <View style={[styles.searchBlock, { paddingHorizontal: gutter }]}>
          {isMobile ? null : (
            <Text style={styles.title} accessibilityRole="header">
              Search
            </Text>
          )}
          <SearchBar value={term} onChangeText={setTerm} />
        </View>

        {hasQuery ? (
          <View style={styles.tabsBlock}>
            <FilterBar
              options={tabs}
              value={tab}
              onChange={setTab}
              gutter={gutter}
              accessibilityLabel="Search result types"
            />
          </View>
        ) : null}

        {!hasQuery ? (
          <View style={[styles.suggestions, { paddingHorizontal: gutter }]}>
            {recentSearches.length > 0 ? (
              <View style={styles.suggestionGroup}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionTitle}>Recent Searches</Text>
                  <Pressable
                    onPress={clearRecentSearches}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent searches"
                  >
                    <Text style={styles.clear}>Clear</Text>
                  </Pressable>
                </View>
                <View style={styles.pillRow}>
                  {recentSearches.map((entry) => (
                    <GenrePill
                      key={entry}
                      label={entry}
                      onPress={() => runSuggestion(entry)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.suggestionGroup}>
              <Text style={styles.suggestionTitle}>Popular Searches</Text>
              <View style={styles.pillRow}>
                {POPULAR_SEARCHES.map((entry) => (
                  <GenrePill
                    key={entry}
                    label={entry}
                    onPress={() => runSuggestion(entry)}
                  />
                ))}
              </View>
            </View>

            <EmptyState
              icon="search-outline"
              title="Find your next favorite"
              message="Search thousands of movies, series and people."
            />
          </View>
        ) : search.isError ? (
          <ErrorState onRetry={() => void search.refetch()} />
        ) : isSearching ? (
          <View style={{ paddingHorizontal: gutter }}>
            <SkeletonGrid columns={columns} posterWidth={posterWidth} />
          </View>
        ) : totalResults === 0 ? (
          <EmptyState
            icon="search-outline"
            title={`No results for "${debounced.trim()}"`}
            message="Check the spelling, or try a different title, actor or director."
          />
        ) : (
          <View style={styles.results}>
            {(tab === "all" || tab === "movies") &&
            results!.movies.length > 0 ? (
              <ResultSection title="Movies" gutter={gutter}>
                <PosterGrid items={results!.movies} onSelect={openTitle} />
              </ResultSection>
            ) : null}

            {(tab === "all" || tab === "series") &&
            results!.series.length > 0 ? (
              <ResultSection title="Series" gutter={gutter}>
                <PosterGrid items={results!.series} onSelect={openTitle} />
              </ResultSection>
            ) : null}

            {(tab === "all" || tab === "people") &&
            results!.people.length > 0 ? (
              <ResultSection title="People" gutter={gutter}>
                <View
                  style={[styles.peopleGrid, { paddingHorizontal: gutter }]}
                >
                  {results!.people.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      onPress={() => openPerson(person.id)}
                    />
                  ))}
                </View>
              </ResultSection>
            ) : null}

            {tab === "people" && results!.people.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No people found"
                message="Try an actor or director's full name."
              />
            ) : null}
          </View>
        )}
      </Screen>
    </>
  );
}

function ResultSection({
  title,
  gutter,
  children,
}: {
  title: string;
  gutter: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { paddingHorizontal: gutter }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function PersonRow({
  person,
  onPress,
}: {
  person: PersonResult;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${person.name}${
        person.knownForDepartment ? `, ${person.knownForDepartment}` : ""
      }`}
      style={({ hovered }) => [
        styles.personRow,
        hovered ? styles.personRowHovered : null,
      ]}
    >
      {person.photo ? (
        <Image
          source={{ uri: person.photo }}
          style={styles.personPhoto}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.personPhoto, styles.personFallback]}>
          <Ionicons name="person" size={20} color={COLORS.textFaint} />
        </View>
      )}
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.name}
        </Text>
        <Text style={styles.personMeta} numberOfLines={1}>
          {[person.knownForDepartment, person.knownForTitles.join(", ")]
            .filter(Boolean)
            .join(" • ")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBlock: {
    gap: SPACING.md,
    paddingTop: SPACING.lg,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: COLORS.textPrimary,
  },
  tabsBlock: {
    paddingTop: SPACING.lg,
  },
  suggestions: {
    gap: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  suggestionGroup: {
    gap: SPACING.md,
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  suggestionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  clear: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  results: {
    gap: SPACING.xxl,
    paddingTop: SPACING.xl,
  },
  section: {
    gap: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.textPrimary,
  },
  peopleGrid: {
    gap: SPACING.sm,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  personRowHovered: {
    backgroundColor: COLORS.surfaceHover,
    borderColor: COLORS.borderStrong,
  },
  personPhoto: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceElevated,
  },
  personFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  personCopy: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  personMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
