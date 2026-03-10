/**
 * MATCH ROW CARD - Premium Horizontal Match Card
 *
 * Full-width card for displaying matches in lists below the hero section.
 * Used for live, upcoming, and finished matches with consistent styling.
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
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import { TYPOGRAPHY, SPACING, SHADOWS, DESIGN_COLORS, SIZES } from '@/constants/design-system';
import { TeamLogo } from '@/components/MatchCard';

export interface MatchRowCardProps {
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
    league?: string;
  };
  onPress?: () => void;
  onNotificationToggle?: () => void;
}

export const MatchRowCard = React.memo(
  ({ match, onPress, onNotificationToggle }: MatchRowCardProps) => {
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

    // Format score or status
    const getScoreDisplay = () => {
      if (isLive || isFinished) {
        return `${match.homeScore}:${match.awayScore}`;
      }
      return 'VS';
    };

    // Format time
    const getTimeDisplay = () => {
      if (isLive && match.minute) {
        return `${match.minute}'`;
      }
      if (isFinished) {
        return 'FT';
      }
      if (match.startTime) {
        return match.startTime;
      }
      return '--';
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
          style={[
            styles.cardContainer,
            isLive && styles.cardLive,
          ]}
        >
          {/* Left accent bar */}
          <View
            style={[
              styles.accentBar,
              isLive && styles.accentBarLive,
            ]}
          />

          {/* Home team block */}
          <View style={styles.teamBlock}>
            <TeamLogo
              uri={match.homeTeamLogo}
              teamName={match.homeTeam}
              size={32}
            />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{match.homeTeam}</Text>
              <Text style={styles.teamAbbr}>{homeAbbr}</Text>
            </View>
          </View>

          {/* Score/Status center */}
          <View style={styles.scoreCenter}>
            <Text
              style={[
                styles.scoreText,
                isLive && styles.scoreTextLive,
              ]}
            >
              {getScoreDisplay()}
            </Text>
            <Text
              style={[
                styles.timeText,
                isLive && styles.timeTextLive,
              ]}
            >
              {getTimeDisplay()}
            </Text>
          </View>

          {/* Away team block */}
          <View style={styles.teamBlock}>
            <TeamLogo
              uri={match.awayTeamLogo}
              teamName={match.awayTeam}
              size={32}
            />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{match.awayTeam}</Text>
              <Text style={styles.teamAbbr}>{awayAbbr}</Text>
            </View>
          </View>

          {/* Right action area */}
          <View style={styles.actionArea}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onNotificationToggle?.();
              }}
              style={styles.iconButton}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={COLORS.textMuted}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }
);

MatchRowCard.displayName = 'MatchRowCard';

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    height: SIZES.matchCard.row.height,
    borderRadius: SIZES.matchCard.row.borderRadius,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.md,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },

  cardLive: {
    borderColor: DESIGN_COLORS.liveGlow.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.live,
        shadowOpacity: 0.24,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  accentBar: {
    width: 4,
    height: '100%',
    backgroundColor: COLORS.accent,
    marginRight: SPACING.md,
  },

  accentBarLive: {
    backgroundColor: COLORS.live,
  },

  teamBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },

  teamInfo: {
    marginLeft: SPACING.sm,
  },

  teamName: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
  },

  teamAbbr: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  scoreCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.lg,
  },

  scoreText: {
    ...TYPOGRAPHY.cardTitle,
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 20,
  },

  scoreTextLive: {
    color: COLORS.text,
    ...SHADOWS.textGlowLive,
  },

  timeText: {
    ...TYPOGRAPHY.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  timeTextLive: {
    color: COLORS.live,
  },

  actionArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginLeft: SPACING.md,
  },

  iconButton: {
    padding: SPACING.xs,
    marginRight: SPACING.xs,
  },
});
