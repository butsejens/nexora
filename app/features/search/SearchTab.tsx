/**
 * Search Tab - Unified search across sports, media, teams, players
 * 
 * Integrates:
 * - Sports: Teams, matches, competitions from live sports data
 * - Media: Movies, series from TMDB data  
 * - IPTV: Live channels
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS } from '@/constants/colors';
import { useOnboardingStore } from '@/store/onboarding-store';
import { apiRequestJson } from '@/lib/query-client';
import { useNexora } from '@/context/NexoraContext';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: 'team' | 'player' | 'match' | 'show' | 'movie' | 'competition' | 'channel';
  image?: string;
  sport?: string;
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

export function SearchTab({ onSelectResult }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const { iptvChannels } = useNexora();

  // Fetch sports data for search
  const sportsQuery = useQuery({
    queryKey: ['sports', 'search-data'],
    queryFn: async () => {
      try {
        const response = await apiRequestJson<any>('/api/sports/today');
        const matches = response?.upcoming || response?.live || [];
        const teams = new Set<string>();
        const competitions = new Set<string>();
        
        // Extract unique teams and competitions from matches
        (matches || []).forEach((m: any) => {
          if (m.homeTeam) teams.add(m.homeTeam);
          if (m.awayTeam) teams.add(m.awayTeam);
          if (m.league) competitions.add(m.league);
        });

        return {
          teams: Array.from(teams),
          competitions: Array.from(competitions),
          matches: matches,
        };
      } catch {
        return { teams: [], competitions: [], matches: [] };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: sportsEnabled,
  });

  // Fetch media data for search
  const mediaQuery = useQuery({
    queryKey: ['media', 'search-data'],
    queryFn: async () => {
      try {
        const movies = await apiRequestJson<any>('/api/movies/trending');
        const series = await apiRequestJson<any>('/api/series/trending');
        return {
          movies: movies?.results || [],
          series: series?.results || [],
        };
      } catch {
        return { movies: [], series: [] };
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: moviesEnabled,
  });

  // Build searchable sports items
  const sportsItems = useMemo(() => {
    const items: SearchResult[] = [];
    const data = sportsQuery.data;
    if (!data) return items;

    // Teams
    (data.teams || []).forEach((team: string) => {
      items.push({
        id: `team-${team}`,
        title: team,
        type: 'team',
        sport: 'Football',
        subtitle: 'Football Team',
      });
    });

    // Competitions
    (data.competitions || []).forEach((comp: string) => {
      items.push({
        id: `comp-${comp}`,
        title: comp,
        type: 'competition',
        sport: 'Football',
        subtitle: 'Competition',
      });
    });

    return items;
  }, [sportsQuery.data]);

  // Build searchable media items
  const mediaItems = useMemo(() => {
    const items: SearchResult[] = [];
    const data = mediaQuery.data;
    if (!data) return items;

    // Movies
    (data.movies || []).slice(0, 20).forEach((movie: any) => {
      items.push({
        id: `movie-${movie.id}`,
        title: movie.title || movie.name || '',
        type: 'movie',
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : undefined,
        rating: movie.vote_average,
        subtitle: String(movie.release_date || '').slice(0, 4),
      });
    });

    // Series
    (data.series || []).slice(0, 20).forEach((show: any) => {
      items.push({
        id: `show-${show.id}`,
        title: show.name || show.title || '',
        type: 'show',
        poster: show.poster_path ? `https://image.tmdb.org/t/p/w200${show.poster_path}` : undefined,
        rating: show.vote_average,
        subtitle: 'TV Series',
      });
    });

    return items;
  }, [mediaQuery.data]);

  // Build searchable IPTV items
  const iptvItems = useMemo(() => {
    if (!iptvChannels || iptvChannels.length === 0) return [];
    return iptvChannels.slice(0, 30).map((channel: any) => ({
      id: `channel-${channel.id}`,
      title: channel.name || channel.title || '',
      type: 'channel' as const,
      subtitle: channel.group,
      image: channel.logo,
    }));
  }, [iptvChannels]);

  // Perform unified search
  const performSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const q = searchQuery.toLowerCase().trim();
    const allItems: SearchResult[] = [];
    
    // Add sports results
    if (sportsEnabled) {
      allItems.push(...sportsItems);
    }

    // Add media results
    if (moviesEnabled) {
      allItems.push(...mediaItems);
    }

    // Add IPTV results
    allItems.push(...iptvItems);

    // Filter by query
    const filtered = allItems.filter((item) => {
      const titleMatch = item.title.toLowerCase().includes(q);
      const subtitleMatch = item.subtitle?.toLowerCase().includes(q);
      const sportMatch = item.sport?.toLowerCase().includes(q);
      return titleMatch || subtitleMatch || sportMatch;
    });

    // Sort by type priority and relevance
    const typeOrder: Record<string, number> = {
      team: 0,
      competition: 1,
      movie: 2,
      show: 3,
      channel: 4,
      player: 5,
      match: 6,
    };

    filtered.sort((a, b) => {
      const typeA = typeOrder[a.type] ?? 99;
      const typeB = typeOrder[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;

      // Exact match first
      const aExact = a.title.toLowerCase() === q;
      const bExact = b.title.toLowerCase() === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // Then starts with
      const aStarts = a.title.toLowerCase().startsWith(q);
      const bStarts = b.title.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return a.title.localeCompare(b.title);
    });

    setResults(filtered.slice(0, 50));
  }, [sportsEnabled, moviesEnabled, sportsItems, mediaItems, iptvItems]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    performSearch(text);
  }, [performSearch]);

  const handleSelectResult = (result: SearchResult) => {
    // Add to recent searches
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r !== result.title);
      return [result.title, ...filtered].slice(0, 10);
    });
    onSelectResult(result);
  };

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
  };

  const isLoading = sportsQuery.isLoading || mediaQuery.isLoading;
  const showResults = query.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with search input */}
      <View style={styles.header}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={P.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search sports, films, shows..."
            placeholderTextColor={P.muted}
            value={query}
            onChangeText={handleSearch}
            editable={!isLoading}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={P.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading && <ActivityIndicator size="large" color={P.accent} style={{ marginTop: 40 }} />}

        {!showResults ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="magnify"
              size={48}
              color={P.muted}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>Search NEXORA</Text>
            <Text style={styles.emptySubtitle}>
              Find sports teams, competitions, or your favorite films and shows
            </Text>
            
            {recentSearches.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.recentTitle}>Recent Searches</Text>
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
            <MaterialCommunityIcons
              name="magnify-close"
              size={48}
              color={P.muted}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>Try different keywords</Text>
          </View>
        ) : (
          <View style={styles.resultsList}>
            {results.map((result) => (
              <SearchResultItem
                key={result.id}
                result={result}
                onPress={() => handleSelectResult(result)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SearchResultItem({
  result,
  onPress,
}: {
  result: SearchResult;
  onPress: () => void;
}) {
  const icon = {
    team: 'soccer',
    competition: 'trophy-outline',
    movie: 'film',
    show: 'television-classic',
    channel: 'antenna',
    player: 'account',
    match: 'soccer',
  }[result.type] || 'search';

  const iconLib = ['team', 'competition', 'match'].includes(result.type)
    ? 'mci'
    : 'ion';

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
          <View style={[styles.resultIconBg]}>
            {iconLib === 'mci' ? (
              <MaterialCommunityIcons name={icon as any} size={20} color={P.accent} />
            ) : (
              <Ionicons name={icon as any} size={20} color={P.accent} />
            )}
          </View>
        )}
      </View>

      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {result.title}
        </Text>
        {result.subtitle && (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {result.subtitle}
          </Text>
        )}
        {result.rating && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color="#FFB300" />
            <Text style={styles.ratingText}>{result.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      <View style={styles.resultType}>
        <Text style={styles.typeLabel}>{result.type}</Text>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: P.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: P.muted,
    textAlign: 'center',
    marginBottom: 32,
  },

  // Recent searches
  recentSection: {
    width: '100%',
    marginTop: 24,
    paddingHorizontal: 16,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: P.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
  },
  resultPoster: {
    width: '100%',
    height: '100%',
  },
  resultIconBg: {
    width: '100%',
    height: '100%',
    backgroundColor: P.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: P.text,
  },
  resultSubtitle: {
    fontSize: 12,
    color: P.muted,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFB300',
  },
  resultType: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: `${P.accent}22`,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: P.accent,
    textTransform: 'capitalize',
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `${P.accent}11`,
  },
  resultChevron: {
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: P.text,
    marginBottom: 8,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 20,
  },
  categorySection: {
    gap: 12,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: P.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  categoryCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.text,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
