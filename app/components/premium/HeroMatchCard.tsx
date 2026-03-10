/**
 * HERO MATCH CARD - Premium Featured Match Presentation
 *
 * Displays a single match as the visual centerpiece with full-width immersive design.
 * Used on home screen as the primary focal point.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants/colors';
import { TYPOGRAPHY, SPACING, SHADOWS, DESIGN_COLORS, SIZES, ANIMATIONS, CARD_STYLES } from '@/constants/design-system';
import { TeamLogo } from './MatchCard';
import { LiveBadge } from './LiveBadge';

export interface HeroMatchCardProps {
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    homeTeamLogo?: string | null;
    awayTeamLogo?: string | null;
    homeScore: number;
    awayScore: number;
    status: 'live' | 'upcoming' | 'finished';
    minute?: number;
    startTime?: string;
    league: string;
    heroGradient: string[];
  };
  onPress?: () => void;
}

export const HeroMatchCard = React.memo(
  ({ match, onPress }: HeroMatchCardProps) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        speed: 16,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 16,
      }).start();
    };

    const isLive = match.status === 'live';
    const isFinished = match.status === 'finished';

    // Get team abbreviations
    const homeAbbr = match.homeTeam.substring(0, 3).toUpperCase();
    const awayAbbr = match.awayTeam.substring(0, 3).toUpperCase();

    // Format match time
    const getTimeDisplay = () => {
      if (isLive && match.minute) {
        return `LIVE: ${match.minute}'`;
      }
      if (isFinished) {
        return 'Full Time';
      }
      if (match.startTime) {
        return match.startTime;
      }
      return 'VS';
    };

    return (
      <Animated.View
        style={[
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          style={styles.cardWrapper}
        >
          <LinearGradient
            colors={[...match.heroGradient] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.3, y: 1 }}
            style={styles.gradientBase}
          >
            {/* Dark overlay */}
            <LinearGradient
              colors={DESIGN_COLORS.gradients.darkOverlay as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.overlay}
            />

            {/* Border and shadow container */}
            <View
              style={[
                styles.cardContainer,
                isLive && styles.cardLive,
              ]}
            >
              {/* Top row: Competition badge + Live badge */}
              <View style={styles.topBar}>
                <View style={styles.competitionBadge}>
                  <Text style={styles.competitionText}>
                    {match.league}
                  </Text>
                </View>
                {isLive && (
                  <View style={styles.liveBadgeContainer}>
                    <LiveBadge minute={match.minute} />
                  </View>
                )}
                {isFinished && (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>FT</Text>
                  </View>
                )}
              </View>

              {/* Match center: teams + score */}
              <View style={styles.matchCenter}>
                {/* Home team */}
                <View style={styles.teamBlock}>
                  <TeamLogo
                    uri={match.homeTeamLogo}
                    teamName={match.homeTeam}
                    size={48}
                  />
                  <Text style={styles.teamName}>{match.homeTeam}</Text>
                  <Text style={styles.teamAbbr}>{homeAbbr}</Text>
                </View>

                {/* Score section */}
                <View style={styles.scoreSection}>
                  <Text
                    style={[
                      styles.scoreNumber,
                      isLive && styles.scoreNumberLive,
                    ]}
                  >
                    {match.homeScore}
                  </Text>
                  <Text
                    style={[
                      styles.scoreSeparator,
                      isLive && styles.scoreSeparatorLive,
                    ]}
                  >
                    -
                  </Text>
                  <Text
                    style={[
                      styles.scoreNumber,
                      isLive && styles.scoreNumberLive,
                    ]}
                  >
                    {match.awayScore}
                  </Text>
                  <Text style={[styles.matchTime, isLive && { color: COLORS.live }]}>{getTimeDisplay()}</Text>
                </View>

                {/* Away team */}
                <View style={styles.teamBlock}>
                  <TeamLogo
                    uri={match.awayTeamLogo}
                    teamName={match.awayTeam}
                    size={48}
                  />
                  <Text style={styles.teamName}>{match.awayTeam}</Text>
                  <Text style={styles.teamAbbr}>{awayAbbr}</Text>
                </View>
              </View>

              {/* Footer: broadcast info */}
              <View style={styles.footerInfo}>
                <Text style={styles.footerText}>
                  {isLive ? 'Live streaming available' : 'Multiple sources available'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }
);

HeroMatchCard.displayName = 'HeroMatchCard';

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },

  gradientBase: {
    minHeight: SIZES.matchCard.hero.height,
    borderRadius: SIZES.matchCard.hero.borderRadius,
    overflow: 'hidden',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
  },

  cardContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.subtle,
    borderRadius: SIZES.matchCard.hero.borderRadius,
    padding: SPACING.lg,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  cardLive: {
    borderColor: DESIGN_COLORS.liveGlow.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.live,
        shadowOpacity: 0.24,
      },
      android: {
        elevation: 12,
      },
    }),
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  competitionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: DESIGN_COLORS.overlay.interaction,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.light,
  },

  competitionText: {
    ...TYPOGRAPHY.badge,
    color: COLORS.text,
    fontSize: 12,
  },

  liveBadgeContainer: {
    marginRight: SPACING.sm,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: DESIGN_COLORS.overlay.standard,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.standard,
  },

  statusBadgeText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
  },

  matchCenter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },

  teamBlock: {
    alignItems: 'center',
    flex: 1,
  },

  teamName: {
    ...TYPOGRAPHY.matchMetadata,
    color: COLORS.text,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },

  teamAbbr: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },

  scoreSection: {
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
  },

  scoreNumber: {
    ...TYPOGRAPHY.heroScore,
    color: COLORS.text,
    lineHeight: 44,
  },

  scoreNumberLive: {
    ...SHADOWS.textGlowLive,
  },

  scoreSeparator: {
    fontSize: 24,
    fontWeight: '300',
    color: DESIGN_COLORS.border.light,
    marginHorizontal: SPACING.xs,
  },

  scoreSeparatorLive: {
    color: COLORS.live,
  },

  matchTime: {
    ...TYPOGRAPHY.badge,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },

  footerInfo: {
    borderTopWidth: 1,
    borderTopColor: DESIGN_COLORS.border.subtle,
    paddingTop: SPACING.md,
    marginTop: SPACING.md,
  },

  footerText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
