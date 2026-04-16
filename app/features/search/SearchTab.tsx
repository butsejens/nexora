/**
 * Search Tab — films en series zoeken
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { TOP_NAV_H } from "@/constants/layout";
import { apiRequestJson } from "@/lib/query-client";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: "series" | "movie";
  poster?: string;
  rating?: number;
}

interface SearchTabProps {
  onSelectResult: (result: SearchResult) => void;
}

const P = {
  bg: COLORS.background,
  surface: COLORS.surface,
  card: COLORS.card,
  text: COLORS.text,
  muted: COLORS.textMuted,
  accent: COLORS.accent,
  border: COLORS.border,
};

function unwrapApiPayload<T = any>(payload: any): T {
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "ok") &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return (payload.data ?? null) as T;
  }
  return (payload ?? null) as T;
}

function splitMediaCollections(payload: any): { movies: any[]; series: any[] } {
  const data = unwrapApiPayload<any>(payload) || {};
  const directMovies = Array.isArray(data.movies) ? data.movies : [];
  const directSeries = Array.isArray(data.series) ? data.series : [];
  const allResults = Array.isArray(data.results) ? data.results : [];

  const moviesFromResults = allResults.filter((item: any) => {
    const type = String(item?.type || item?.media_type || "").toLowerCase();
    return type === "movie";
  });
  const seriesFromResults = allResults.filter((item: any) => {
    const type = String(item?.type || item?.media_type || "").toLowerCase();
    return type === "series" || type === "tv";
  });

  const legacyMovieBuckets = [
    ...(Array.isArray(data.trending) ? data.trending : []),
    ...(Array.isArray(data.popular) ? data.popular : []),
    ...(Array.isArray(data.newReleases) ? data.newReleases : []),
    ...(Array.isArray(data.topRated) ? data.topRated : []),
    ...(Array.isArray(data.upcoming) ? data.upcoming : []),
    ...(Array.isArray(data.hiddenGems) ? data.hiddenGems : []),
    ...(Array.isArray(data.acclaimed) ? data.acclaimed : []),
  ];

  return {
    movies: [...directMovies, ...moviesFromResults, ...legacyMovieBuckets],
    series: [...directSeries, ...seriesFromResults],
  };
}

function dedupeMedia(items: any[], defaultType: "movie" | "series"): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of items || []) {
    const id = String(item?.tmdbId || item?.id || "").trim();
    const title = String(item?.title || item?.name || "")
      .trim()
      .toLowerCase();
    const type = String(item?.type || item?.media_type || defaultType)
      .trim()
      .toLowerCase();
    const year = String(
      item?.release_date || item?.first_air_date || item?.releaseDate || "",
    ).slice(0, 4);
    const key = id ? `${type}:${id}` : `${type}:${title}:${year}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function SearchTab({ onSelectResult }: SearchTabProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch media catalog for search
  const mediaQuery = useQuery({
    queryKey: ["media", "search-data"],
    queryFn: async () => {
      try {
        const moviePages = [1, 2, 3];
        const seriesPages = [1, 2, 3];
        const [movieCatalog, seriesCatalog, moviesTrending, seriesTrending] =
          await Promise.all([
            Promise.all(
              moviePages.map((page) =>
                apiRequestJson<any>(
                  `/api/media/movies?page=${page}&sort=popularity.desc`,
                ).catch(() => null),
              ),
            ),
            Promise.all(
              seriesPages.map((page) =>
                apiRequestJson<any>(
                  `/api/media/series?page=${page}&sort=popularity.desc`,
                ).catch(() => null),
              ),
            ),
            apiRequestJson<any>("/api/movies/trending").catch(() => null),
            apiRequestJson<any>("/api/series/trending").catch(() => null),
          ]);

        const moviesFromCatalog = movieCatalog.flatMap(
          (payload) => splitMediaCollections(payload).movies,
        );
        const seriesFromCatalog = seriesCatalog.flatMap(
          (payload) => splitMediaCollections(payload).series,
        );
        const moviesFromTrending = splitMediaCollections(moviesTrending).movies;
        const seriesFromTrending = splitMediaCollections(seriesTrending).series;

        const allMovies = dedupeMedia(
          [...moviesFromCatalog, ...moviesFromTrending],
          "movie",
        );
        const allSeries = dedupeMedia(
          [...seriesFromCatalog, ...seriesFromTrending],
          "series",
        );

        return {
          movies: allMovies,
          series: allSeries,
        };
      } catch {
        return { movies: [], series: [] };
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: true,
  });

  // Dynamic query-based media search for full catalog coverage.
  const mediaSearchQuery = useQuery({
    queryKey: ["media", "search-live", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return { movies: [], series: [] };
      try {
        const [page1, page2, legacy] = await Promise.all([
          apiRequestJson<any>(
            `/api/media/search?q=${encodeURIComponent(debouncedQuery)}&type=all&page=1`,
          ).catch(() => null),
          apiRequestJson<any>(
            `/api/media/search?q=${encodeURIComponent(debouncedQuery)}&type=all&page=2`,
          ).catch(() => null),
          apiRequestJson<any>(
            `/api/search/multi?query=${encodeURIComponent(debouncedQuery)}`,
          ).catch(() => null),
        ]);

        const page1Split = splitMediaCollections(page1);
        const page2Split = splitMediaCollections(page2);
        const legacySplit = splitMediaCollections(legacy);

        return {
          movies: dedupeMedia(
            [...page1Split.movies, ...page2Split.movies, ...legacySplit.movies],
            "movie",
          ),
          series: dedupeMedia(
            [...page1Split.series, ...page2Split.series, ...legacySplit.series],
            "series",
          ),
        };
      } catch {
        return { movies: [], series: [] };
      }
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  // Build searchable media items
  const mediaItems = useMemo(() => {
    const items: SearchResult[] = [];
    const data = (debouncedQuery.length >= 2
      ? mediaSearchQuery.data
      : mediaQuery.data) || { movies: [], series: [] };

    // Movies — server mapTrendingItem already builds full `poster` URLs; fall back to
    // constructing from poster_path for any items from other sources.
    (data.movies || []).slice(0, 240).forEach((movie: any) => {
      items.push({
        id: String(movie.tmdbId || movie.id),
        title: movie.title || movie.name || "",
        type: "movie",
        poster:
          movie.poster ||
          (movie.poster_path
            ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
            : undefined) ||
          (movie.backdrop_path
            ? `https://image.tmdb.org/t/p/w342${movie.backdrop_path}`
            : undefined) ||
          movie.backdrop ||
          undefined,
        rating: movie.vote_average ?? movie.imdb ?? undefined,
        subtitle: String(
          movie.release_date || movie.releaseDate || movie.year || "",
        ).slice(0, 4),
      });
    });

    // Series — same poster resolution strategy
    (data.series || []).slice(0, 240).forEach((show: any) => {
      items.push({
        id: String(show.tmdbId || show.id),
        title: show.name || show.title || "",
        type: "series",
        poster:
          show.poster ||
          (show.poster_path
            ? `https://image.tmdb.org/t/p/w342${show.poster_path}`
            : undefined) ||
          (show.backdrop_path
            ? `https://image.tmdb.org/t/p/w342${show.backdrop_path}`
            : undefined) ||
          show.backdrop ||
          undefined,
        rating: show.vote_average ?? show.imdb ?? undefined,
        subtitle:
          String(
            show.first_air_date || show.releaseDate || show.year || "",
          ).slice(0, 4) || "TV Series",
      });
    });

    return items.filter((item) => !!item.poster);
  }, [debouncedQuery.length, mediaQuery.data, mediaSearchQuery.data]);

  const performSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      const q = searchQuery.toLowerCase().trim();
      const queryTokens = q.split(/\s+/).filter(Boolean);

      const filtered = mediaItems.filter((item) => {
        const haystack = [item.title, item.subtitle || ""]
          .join(" ")
          .toLowerCase();
        if (!haystack) return false;
        if (haystack.includes(q)) return true;
        if (!queryTokens.length) return false;
        return queryTokens.every((token) => haystack.includes(token));
      });

      filtered.sort((a, b) => {
        const aExact = a.title.toLowerCase() === q;
        const bExact = b.title.toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = a.title.toLowerCase().startsWith(q);
        const bStarts = b.title.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.title.localeCompare(b.title);
      });

      const seen = new Set<string>();
      const deduped = filtered.filter((item) => {
        const key = `${item.type}:${item.title.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setResults(deduped.slice(0, 200));
    },
    [mediaItems],
  );

  useEffect(() => {
    performSearch(query);
  }, [performSearch, query]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const handleSelectResult = (result: SearchResult) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r !== result.title);
      return [result.title, ...filtered].slice(0, 10);
    });
    onSelectResult(result);
  };

  const handleClearSearch = () => {
    setQuery("");
    setResults([]);
  };

  const isLoading =
    (mediaQuery.isLoading && !mediaQuery.data) ||
    (debouncedQuery.length >= 2 && mediaSearchQuery.isFetching);
  const showResults = query.trim().length > 0;

  return (
    <View style={styles.container}>
      <View
        style={[styles.header, { paddingTop: TOP_NAV_H + insets.top + 12 }]}
      >
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={P.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Zoek films, series, documentaires..."
            placeholderTextColor={P.muted}
            value={query}
            onChangeText={handleSearch}
            editable
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={18} color={P.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading && (
          <ActivityIndicator
            size="large"
            color={P.accent}
            style={{ marginTop: 40 }}
          />
        )}

        {!showResults ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="search"
              size={48}
              color={P.muted}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>Zoek op Nexora</Text>
            <Text style={styles.emptySubtitle}>
              Vind jouw favoriete films, series en documentaires
            </Text>

            {recentSearches.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.recentTitle}>Recent</Text>
                {recentSearches.map((search, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleSearch(search)}
                    style={styles.recentItem}
                  >
                    <Ionicons name="time-outline" size={14} color={P.muted} />
                    <Text style={styles.recentText}>{search}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : results.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="search"
              size={48}
              color={P.muted}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>Geen resultaten</Text>
            <Text style={styles.emptySubtitle}>Probeer andere zoektermen</Text>
          </View>
        ) : (
          <View style={styles.resultsList}>
            {results.map((result) => (
              <SearchResultItem
                key={`${result.type}:${result.id || result.title}`}
                result={result}
                onPress={() => handleSelectResult(result)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SearchResultItem({
  result,
  onPress,
}: {
  result: SearchResult;
  onPress: () => void;
}) {
  const numericRating =
    typeof result.rating === "number"
      ? result.rating
      : Number.parseFloat(String(result.rating ?? "").replace(",", "."));
  const hasRating = Number.isFinite(numericRating) && numericRating > 0;
  const typeLabel = result.type === "movie" ? "Film" : "Serie";

  return (
    <TouchableOpacity onPress={onPress} style={styles.resultItem}>
      <View style={styles.resultIconContainer}>
        {result.poster ? (
          <Image
            source={{ uri: result.poster }}
            style={styles.resultPoster}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.resultIconBg}>
            <Ionicons
              name={result.type === "movie" ? "film" : "tv"}
              size={20}
              color={P.accent}
            />
          </View>
        )}
      </View>

      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {result.title}
        </Text>
        {result.subtitle ? (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {result.subtitle}
          </Text>
        ) : null}
        {hasRating && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color="#FFB300" />
            <Text style={styles.ratingText}>{numericRating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      <View style={styles.resultType}>
        <Text style={styles.typeLabel}>{typeLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: P.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: P.text,
  },
  clearButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: P.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: P.muted,
    textAlign: "center",
    marginBottom: 32,
  },

  // Recent searches
  recentSection: {
    width: "100%",
    marginTop: 24,
    paddingHorizontal: 16,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: P.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  recentText: {
    fontSize: 14,
    color: P.text,
  },

  // Results list
  resultsList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: P.card,
    borderWidth: 1,
    borderColor: P.border,
  },
  resultIconContainer: {
    width: 44,
    height: 66,
    borderRadius: 6,
    overflow: "hidden",
  },
  resultPoster: {
    width: "100%",
    height: "100%",
  },
  resultIconBg: {
    width: "100%",
    height: "100%",
    backgroundColor: P.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: P.text,
  },
  resultSubtitle: {
    fontSize: 12,
    color: P.muted,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFB300",
  },
  resultType: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: `${P.accent}22`,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: P.accent,
    textTransform: "capitalize",
  },
});
