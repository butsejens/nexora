/**
 * MATCH CENTER PANEL - Premium Match Detail Header
 *
 * Large focal point at the top of match detail screen showing live/final state.
 * Displays teams, score, status with premium styling and depth.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants/colors';
import { TYPOGRAPHY, SPACING, SHADOWS, DESIGN_COLORS, SIZES, LAYOUT } from '@/constants/design-system';
import { TeamLogo } from '@/components/TeamLogo';
import { LiveBadge } from '@/components/LiveBadge';

export interface MatchCenterPanelProps {
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
    league?: string;
  };
  heroGradient?: string[];
}

export const MatchCenterPanel = React.memo(
  ({ match, heroGradient }: MatchCenterPanelProps) => {
    const isLive = match.status === 'live';
    const isFinished = match.status === 'finished';

    // Get team abbreviations
    const homeAbbr = match.homeTeam.substring(0, 3).toUpperCase();
    const awayAbbr = match.awayTeam.substring(0, 3).toUpperCase();

    // Format status
    const getStatusDisplay = () => {
      if (isLive && match.minute) {
        return `LIVE: ${match.minute}'`;
      }
      if (isFinished) {
        return 'Full Time';
      }
      return match.league || 'Match';
    };

    const gradients = heroGradient || ['#1A1A23', '#242432'];

    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[...gradients] as any}
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

          <View
            style={[
              styles.panelContainer,
              isLive && styles.panelLive,
            ]}
          >
            {/* Top bar: Competition + Status */}
            <View style={styles.topBar}>
              <View style={styles.leagueBadge}>
                <Text style={styles.leagueText}>{match.league || 'Match'}</Text>
              </View>
              {isLive && (
                <View style={styles.liveIndicator}>
                  <LiveBadge minute={match.minute} small />
                </View>
              )}
              {isFinished && (
                <View style={styles.ftBadge}>
                  <Text style={styles.ftText}>FT</Text>
                </View>
              )}
            </View>

            {/* Match state: Teams + Score */}
            <View style={styles.matchState}>
              {/* Home team */}
              <View style={styles.teamColumn}>
                <TeamLogo
                  uri={match.homeTeamLogo}
                  teamName={match.homeTeam}
                  size={44}
                />
                <Text style={styles.teamName}>{match.homeTeam}</Text>
                <Text style={styles.teamAbbr}>{homeAbbr}</Text>
              </View>

              {/* Score */}
              <View style={styles.scoreColumn}>
                <View style={styles.scoreRow}>
                  <Text
                    style={[
                      styles.scoreDisplay,
                      isLive && styles.scoreDisplayLive,
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
                      styles.scoreDisplay,
                      isLive && styles.scoreDisplayLive,
                    ]}
                  >
                    {match.awayScore}
                  </Text>
                </View>
                <Text style={styles.statusText}>{getStatusDisplay()}</Text>
              </View>

              {/* Away team */}
              <View style={styles.teamColumn}>
                <TeamLogo
                  uri={match.awayTeamLogo}
                  teamName={match.awayTeam}
                  size={44}
                />
                <Text style={styles.teamName}>{match.awayTeam}</Text>
                <Text style={styles.teamAbbr}>{awayAbbr}</Text>
              </View>
            </View>

            {/* Footer action bar */}
            <View style={styles.footerBar}>
              <Text style={styles.footerText}>Watch • Stats • Lineups</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }
);

MatchCenterPanel.displayName = 'MatchCenterPanel';

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
    borderRadius: SIZES.matchCard.hero.borderRadius,
    overflow: 'hidden',
  },

  gradientBase: {
    height: LAYOUT.matchCenter.height,
    borderRadius: SIZES.matchCard.hero.borderRadius,
    overflow: 'hidden',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
  },

  panelContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.subtle,
    borderRadius: SIZES.matchCard.hero.borderRadius,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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

  panelLive: {
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
    height: LAYOUT.matchCenter.headerHeight,
  },

  leagueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: DESIGN_COLORS.overlay.standard,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.light,
  },

  leagueText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
  },

  liveIndicator: {
    marginRight: SPACING.sm,
  },

  ftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: DESIGN_COLORS.overlay.standard,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.standard,
  },

  ftText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
  },

  matchState: {
    height: LAYOUT.matchCenter.stateHeight,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },

  teamColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

  scoreColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.xl,
  },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  scoreDisplay: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 32,
  },

  scoreDisplayLive: {
    ...SHADOWS.textGlowLive,
  },

  scoreSeparator: {
    fontSize: 20,
    fontWeight: '300',
    color: DESIGN_COLORS.border.light,
    marginHorizontal: SPACING.xs,
  },

  scoreSeparatorLive: {
    color: COLORS.live,
  },

  statusText: {
    ...TYPOGRAPHY.badge,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },

  footerBar: {
    borderTopWidth: 1,
    borderTopColor: DESIGN_COLORS.border.subtle,
    height: LAYOUT.matchCenter.footerHeight,
    justifyContent: 'center',
    paddingTop: SPACING.md,
  },

  footerText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
