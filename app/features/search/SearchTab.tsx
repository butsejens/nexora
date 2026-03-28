/**
 * Search Tab - Unified search across sports, media, teams, players
 * 
 * Integrates:
 * - Sports: Teams, matches, competitions from live sports data
 * - Media: Movies, series from TMDB data  
 * - IPTV: Live channels
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS } from '@/constants/colors';
import { useOnboardingStore } from '@/store/onboarding-store';
import { apiRequestJson } from '@/lib/query-client';
import { useNexora } from '@/context/NexoraContext';
import { resolveMatchCompetitionLabel, resolveMatchEspnLeagueCode } from '@/lib/sports-competition';
import { resolveCompetitionBrand, resolveTeamLogoUri } from '@/lib/logo-manager';
import { detectLocaleSignals, searchCompetitions, searchTeams } from '@/services/onboarding-ai';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: 'team' | 'player' | 'match' | 'series' | 'movie' | 'competition' | 'channel';
  image?: string;
  sport?: string;
  poster?: string;
  rating?: number;
  teamId?: string;
  matchId?: string;
  espnLeague?: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  status?: string;
  minute?: string;
  sportKey?: string;
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

function teamNameFromValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (value && typeof value === 'object') {
    const v = value as any;
    const name = String(v?.name || v?.displayName || '').trim();
    return name || fallback;
  }
  return fallback;
}

function toResolvableTeamId(rawId: unknown, teamName: unknown): string {
  const id = String(rawId || '').trim();
  if (/^name:/i.test(id)) return id;
  if (/^\d+$/.test(id)) return id;
  const name = String(teamName || '').trim();
  if (!name) return id;
  return `name:${encodeURIComponent(name)}`;
}

function guessEspnLeagueCode(rawLeague: unknown): string {
  const league = String(rawLeague || '').trim().toLowerCase();
  if (!league) return '';
  if (league.includes('premier league')) return 'eng.1';
  if (league.includes('championship')) return 'eng.2';
  if (league.includes('la liga')) return 'esp.1';
  if (league.includes('bundesliga')) return 'ger.1';
  if (league.includes('serie a')) return 'ita.1';
  if (league.includes('ligue 1')) return 'fra.1';
  if (league.includes('jupiler pro league')) return 'bel.1';
  if (league.includes('challenger pro league')) return 'bel.2';
  if (league.includes('eredivisie')) return 'ned.1';
  if (league.includes('uefa champions')) return 'uefa.champions';
  if (league.includes('uefa europa league')) return 'uefa.europa';
  if (league.includes('conference league')) return 'uefa.europa.conf';
  if (league.includes('nations league')) return 'uefa.nations';
  if (league.includes('world cup')) return 'fifa.world';
  return '';
}

export function SearchTab({ onSelectResult }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const iptvEnabled = useOnboardingStore((s) => s.iptvEnabled);
  const insets = useSafeAreaInsets();
  const { iptvChannels } = useNexora();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch sports data for search
  const sportsQuery = useQuery({
    queryKey: ['sports', 'search-data'],
    queryFn: async () => {
      try {
        // Fetch matches for yesterday, today, and tomorrow for broader team coverage
        const dateOffsets = [-1, 0, 1];
        const matchArrays = await Promise.all(
          dateOffsets.map(async (offset) => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            const dateStr = d.toISOString().slice(0, 10);
            try {
              const response = await apiRequestJson<any>(`/api/sports/by-date?date=${encodeURIComponent(dateStr)}`);
              return [
                ...(Array.isArray(response?.live) ? response.live : []),
                ...(Array.isArray(response?.upcoming) ? response.upcoming : []),
                ...(Array.isArray(response?.finished) ? response.finished : []),
              ];
            } catch {
              return [];
            }
          }),
        );
        const matches = matchArrays.flat();

        const teamsById = new Map<string, { id: string; name: string; sportKey: string; league?: string; espnLeague?: string; logo?: string }>();
        const competitionsById = new Map<string, { id: string; name: string; espnLeague: string; sportKey: string }>();

        for (const m of matches) {
          const sportKey = String(m?.sport || 'soccer');
          const homeName = teamNameFromValue(m?.homeTeam, '').trim();
          const awayName = teamNameFromValue(m?.awayTeam, '').trim();
          const homeId = toResolvableTeamId(m?.homeTeamId, homeName);
          const awayId = toResolvableTeamId(m?.awayTeamId, awayName);
          const leagueName = resolveMatchCompetitionLabel(m);
          const espnLeague = resolveMatchEspnLeagueCode(m);
          if (homeName && homeId && !teamsById.has(homeId)) {
            teamsById.set(homeId, {
              id: homeId,
              name: homeName,
              sportKey,
              league: leagueName,
              espnLeague,
              logo: String(m?.homeTeamLogo || '').trim() || undefined,
            });
          }
          if (awayName && awayId && !teamsById.has(awayId)) {
            teamsById.set(awayId, {
              id: awayId,
              name: awayName,
              sportKey,
              league: leagueName,
              espnLeague,
              logo: String(m?.awayTeamLogo || '').trim() || undefined,
            });
          }
          if (leagueName && leagueName !== 'Competition') {
            const compId = espnLeague || leagueName;
            if (!competitionsById.has(compId)) {
              competitionsById.set(compId, {
                id: compId,
                name: leagueName,
                espnLeague: espnLeague || 'eng.1',
                sportKey,
              });
            }
          }
        }

        // Fetch top scorers from major leagues to index player names
        const PLAYER_LEAGUES = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'bel.1', 'bel.2', 'ned.1', 'por.1', 'tur.1', 'uefa.champions', 'uefa.europa'];
        const playerResults = await Promise.allSettled(
          PLAYER_LEAGUES.map((league) =>
            apiRequestJson<any>(`/api/sports/topscorers/${encodeURIComponent(league)}`),
          ),
        );
        const players: { id: string; name: string; teamName: string; league: string; espnLeague: string; photo?: string }[] = [];
        const seenPlayerIds = new Set<string>();
        playerResults.forEach((result, i) => {
          if (result.status !== 'fulfilled') return;
          const scorers: any[] = result.value?.scorers || result.value?.players || [];
          const espnLeague = PLAYER_LEAGUES[i];
          scorers.forEach((s: any) => {
            const name = String(s?.name || s?.displayName || s?.shortName || '').trim();
            const playerId = String(s?.id || `player:${name}`).trim();
            if (!name || seenPlayerIds.has(playerId)) return;
            seenPlayerIds.add(playerId);
            players.push({
              id: playerId,
              name,
              teamName: String(s?.teamName || s?.team?.name || '').trim(),
              league: String(s?.league || espnLeague),
              espnLeague,
              photo: String(s?.photo || s?.headshot || s?.image || '').trim() || undefined,
            });
          });
        });

        return {
          teams: Array.from(teamsById.values()),
          competitions: Array.from(competitionsById.values()),
          matches: matches.slice(0, 120),
          players,
        };
      } catch {
        return { teams: [], competitions: [], matches: [], players: [] };
      }
    },
    staleTime: 5 * 60 * 1000,
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

  // Dynamic query-based media search for full catalog coverage.
  const mediaSearchQuery = useQuery({
    queryKey: ['media', 'search-live', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return { movies: [], series: [] };
      return apiRequestJson<any>(`/api/search/multi?query=${encodeURIComponent(debouncedQuery)}`);
    },
    enabled: moviesEnabled && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  // Build searchable sports items
  const sportsItems = useMemo(() => {
    const items: SearchResult[] = [];
    const data = sportsQuery.data;
    if (!data) return items;

    // Teams
    (data.teams || []).forEach((team: any) => {
      items.push({
        id: toResolvableTeamId(team?.id, team?.name),
        title: String(team?.name || ''),
        type: 'team',
        sport: 'Football',
        subtitle: 'Football Team',
        image: (() => {
          const rawLogo = String(team?.logo || '').trim();
          if (rawLogo) return rawLogo;
          const resolved = resolveTeamLogoUri(String(team?.name || ''), null);
          return typeof resolved === 'string' ? resolved : undefined;
        })(),
        teamId: toResolvableTeamId(team?.id, team?.name),
        sportKey: String(team?.sportKey || 'soccer'),
        league: String(team?.league || ''),
        espnLeague: String(team?.espnLeague || guessEspnLeagueCode(team?.league) || ''),
      });
    });

    // Competitions
    (data.competitions || []).forEach((comp: any) => {
      items.push({
        id: String(comp?.id || ''),
        title: String(comp?.name || ''),
        type: 'competition',
        sport: 'Football',
        subtitle: 'Competition',
        image: (() => {
          const brand = resolveCompetitionBrand({
            name: String(comp?.name || ''),
            espnLeague: String(comp?.espnLeague || ''),
          });
          return typeof brand?.logo === 'string' ? brand.logo : undefined;
        })(),
        espnLeague: String(comp?.espnLeague || guessEspnLeagueCode(comp?.name) || 'eng.1'),
        sportKey: String(comp?.sportKey || 'soccer'),
      });
    });

    // Players
    (data.players || []).forEach((player: any) => {
      items.push({
        id: String(player?.id || ''),
        title: String(player?.name || ''),
        type: 'player',
        sport: 'Football',
        subtitle: player?.teamName ? `${player.teamName}` : 'Player',
        image: player?.photo || undefined,
        espnLeague: String(player?.espnLeague || ''),
        league: String(player?.league || ''),
        sportKey: 'soccer',
      });
    });

    // Matches
    (data.matches || []).slice(0, 50).forEach((match: any) => {
      const matchId = String(match?.id || '').trim();
      if (!matchId) return;
      const homeTeam = teamNameFromValue(match?.homeTeam, 'Home');
      const awayTeam = teamNameFromValue(match?.awayTeam, 'Away');
      const league = resolveMatchCompetitionLabel(match);
      const espnLeague = resolveMatchEspnLeagueCode(match);
      items.push({
        id: matchId,
        matchId,
        title: `${homeTeam} vs ${awayTeam}`,
        subtitle: league || 'Match',
        type: 'match',
        sport: 'Football',
        homeTeam,
        awayTeam,
        homeTeamLogo: String(match?.homeTeamLogo || ''),
        awayTeamLogo: String(match?.awayTeamLogo || ''),
        status: String(match?.status || 'upcoming'),
        minute: String(match?.minute || ''),
        espnLeague,
        league,
        sportKey: String(match?.sport || 'soccer'),
      });
    });

    return items;
  }, [sportsQuery.data]);

  // Build searchable media items
  const mediaItems = useMemo(() => {
    const items: SearchResult[] = [];
    const data = (debouncedQuery.length >= 2 ? mediaSearchQuery.data : mediaQuery.data) || { movies: [], series: [] };

    // Movies
    (data.movies || []).slice(0, 80).forEach((movie: any) => {
      items.push({
        id: String(movie.id),
        title: movie.title || movie.name || '',
        type: 'movie',
        poster: movie.poster_path
          ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
          : (movie.backdrop_path ? `https://image.tmdb.org/t/p/w342${movie.backdrop_path}` : undefined),
        rating: movie.vote_average,
        subtitle: String(movie.release_date || '').slice(0, 4),
      });
    });

    // Series
    (data.series || []).slice(0, 80).forEach((show: any) => {
      items.push({
        id: String(show.id),
        title: show.name || show.title || '',
        type: 'series',
        poster: show.poster_path
          ? `https://image.tmdb.org/t/p/w342${show.poster_path}`
          : (show.backdrop_path ? `https://image.tmdb.org/t/p/w342${show.backdrop_path}` : undefined),
        rating: show.vote_average,
        subtitle: String(show.first_air_date || '').slice(0, 4) || 'TV Series',
      });
    });

    return items;
  }, [debouncedQuery.length, mediaQuery.data, mediaSearchQuery.data]);

  const curatedSportsItems = useMemo(() => {
    if (!sportsEnabled || debouncedQuery.length < 2) return [] as SearchResult[];
    const localeSignals = detectLocaleSignals();
    const teams = searchTeams(debouncedQuery, ['football'], localeSignals, 60);
    const competitions = searchCompetitions(debouncedQuery, ['football'], localeSignals, 40);

    const teamItems: SearchResult[] = teams.map((team) => ({
      id: toResolvableTeamId(team.id, team.name),
      title: String(team.name || ''),
      type: 'team',
      sport: String(team.sport || 'soccer'),
      subtitle: String(team.competition || 'Football Team'),
      image: (() => {
        const resolved = resolveTeamLogoUri(String(team.name || ''), null);
        return typeof resolved === 'string' ? resolved : undefined;
      })(),
      teamId: toResolvableTeamId(team.id, team.name),
      sportKey: String(team.sport || 'soccer'),
      league: String(team.competition || ''),
      espnLeague: String((team as any)?.espnLeague || guessEspnLeagueCode(team.competition) || ''),
    }));

    const competitionItems: SearchResult[] = competitions.map((competition) => ({
      id: String(competition.id || ''),
      title: String(competition.name || ''),
      type: 'competition',
      sport: String(competition.sport || 'soccer'),
      subtitle: 'Competition',
      image: (() => {
        const brand = resolveCompetitionBrand({
          name: String(competition.name || ''),
          espnLeague: String(competition.espnLeague || ''),
        });
        return typeof brand?.logo === 'string' ? brand.logo : undefined;
      })(),
      sportKey: String(competition.sport || 'soccer'),
      espnLeague: String(competition.espnLeague || 'eng.1'),
      league: String(competition.name || ''),
    }));

    return [...teamItems, ...competitionItems];
  }, [debouncedQuery, sportsEnabled]);

  // Build searchable IPTV items
  const iptvItems = useMemo(() => {
    if (!iptvEnabled) return [];
    if (!iptvChannels || iptvChannels.length === 0) return [];
    return iptvChannels.map((channel: any) => ({
      id: String(channel.id),
      title: channel.name || channel.title || '',
      type: 'channel' as const,
      subtitle: channel.group,
      image: channel.logo,
    }));
  }, [iptvChannels, iptvEnabled]);

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
      allItems.push(...curatedSportsItems);
    }

    // Add media results
    if (moviesEnabled) {
      allItems.push(...mediaItems);
    }

    // Add IPTV results
    if (iptvEnabled) {
      allItems.push(...iptvItems);
    }

    // Filter by query
    const tokenize = (value: string) => String(value || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const queryTokens = tokenize(q);

    const filtered = allItems.filter((item) => {
      const haystack = [
        item.title,
        item.subtitle || '',
        item.sport || '',
        item.league || '',
        item.espnLeague || '',
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack) return false;
      if (haystack.includes(q)) return true;
      if (!queryTokens.length) return false;
      return queryTokens.every((token) => haystack.includes(token));
    });

    // Sort by type priority and relevance
    const typeOrder: Record<string, number> = {
      team: 0,
      player: 1,
      competition: 2,
      movie: 3,
      series: 4,
      channel: 5,
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

    // De-duplicate cross-source matches by title+type.
    const seen = new Set<string>();
    const deduped = filtered.filter((item) => {
      const key = `${item.type}:${item.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setResults(deduped.slice(0, 80));
  }, [sportsEnabled, moviesEnabled, iptvEnabled, sportsItems, curatedSportsItems, mediaItems, iptvItems]);

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

  const isLoading = sportsQuery.isLoading || mediaQuery.isLoading || mediaSearchQuery.isLoading;
  const showResults = query.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Header with search input */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={P.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players, teams, leagues, films, series..."
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
  const icon = {
    team: 'soccer',
    competition: 'trophy-outline',
    movie: 'film',
    series: 'television-classic',
    channel: 'antenna',
    player: 'account',
    match: 'soccer',
  }[result.type] || 'search';

  const iconLib = ['team', 'competition', 'match'].includes(result.type)
    ? 'mci'
    : 'ion';

  const mediaUri = result.poster || result.image;

  return (
    <TouchableOpacity onPress={onPress} style={styles.resultItem}>
      <View style={styles.resultIconContainer}>
        {mediaUri ? (
          <Image
            source={{ uri: mediaUri }}
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
    paddingBottom: 12,
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
