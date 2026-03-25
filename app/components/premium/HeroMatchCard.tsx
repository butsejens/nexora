/**
 * HERO MATCH CARD — Premium Featured Match (v2.2)
 *
 * Full-width immersive card for the featured match.
 * - Proper team name sizing (adjustsFontSizeToFit, no awkward wrapping)
 * - Live stats strip: possession · shots · minute
 * - Action row: Watch · Stats · Lineups
 * - Gradient background with overlay for depth
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS }  from '@/constants/colors';
import { SPACING } from '@/constants/design-system';
import { TeamLogo } from '@/components/TeamLogo';
import { LiveBadge } from '@/components/LiveBadge';

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_SIZE = 56;

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
    possession?: { home: number; away: number };
    shotsOnGoal?: { home: number; away: number };
    redCards?: { home: number; away: number };
    venue?: string;
  };
  onPress?: () => void;
  onWatchPress?: () => void;
  onStatsPress?: () => void;
  onLineupsPress?: () => void;
}

const HeroMatchCardInner = ({
  match,
  onPress,
  onWatchPress,
  onStatsPress,
  onLineupsPress,
}: HeroMatchCardProps) => {
  const live     = match.status === 'live';
  const finished = match.status === 'finished';
  const upcoming = match.status === 'upcoming';

  const gradColors = (match.heroGradient?.length >= 2
    ? match.heroGradient
    : [COLORS.cardElevated, COLORS.card]) as [string, string, ...string[]];

  const homeWin = !upcoming && (match.homeScore > match.awayScore);
  const awayWin = !upcoming && (match.awayScore > match.homeScore);
  const kickoffRaw = String(match.startTime || '').trim();
  const kickoffParsed = Date.parse(kickoffRaw);
  const kickoffDateLabel = Number.isFinite(kickoffParsed)
    ? new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: 'short' }).format(new Date(kickoffParsed))
    : (kickoffRaw.slice(0, 10) || 'TBD');
  const kickoffTimeLabel = Number.isFinite(kickoffParsed)
    ? new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(kickoffParsed))
    : (kickoffRaw.match(/(\d{1,2}:\d{2})/)?.[1] || '--:--');

  return (
    <View style={s.wrap}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
        <View style={s.card}>

          {/* Background gradient */}
          <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* Dark overlay */}
          <LinearGradient
            colors={['rgba(7,11,26,0.30)', 'rgba(7,11,26,0.72)', 'rgba(7,11,26,0.90)']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* ── Top bar: league + status ── */}
          <View style={s.topBar}>
            <View style={s.leagueBadge}>
              <Ionicons name="trophy-outline" size={11} color={COLORS.textMuted} />
              <Text style={s.leagueText} numberOfLines={1}>{match.league}</Text>
            </View>

            {live ? (
              <LiveBadge minute={match.minute} />
            ) : finished ? (
              <View style={s.statusBadgeFt}>
                <Text style={s.statusBadgeFtText}>FT</Text>
              </View>
            ) : null}
          </View>

          {/* ── Match center ── */}
          <View style={s.matchRow}>

            {/* Home */}
            <View style={s.teamSide}>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={LOGO_SIZE} />
              <Text
                style={[s.teamName, homeWin && s.teamNameWinner]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.homeTeam}
              </Text>
              {!upcoming && (match.redCards?.home ?? 0) > 0 && (
                <Text style={s.redCards}>{'🟥'.repeat(Math.min(match.redCards!.home, 3))}</Text>
              )}
            </View>

            {/* Score */}
            <View style={s.scoreSide}>
              {!upcoming ? (
                <>
                  <Text style={[s.scoreText, live && s.scoreTextLive]}>
                    {match.homeScore ?? 0}
                    <Text style={s.scoreSep}> : </Text>
                    {match.awayScore ?? 0}
                  </Text>
                  {live ? (
                    <View style={s.minutePill}>
                      <View style={s.minuteDot} />
                      <Text style={s.minuteText}>{match.minute ?? 0}&apos;</Text>
                    </View>
                  ) : (
                    <Text style={s.ftText}>FULL TIME</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={s.kickoffDateText}>{kickoffDateLabel}</Text>
                  <Text style={s.vsText}>VS</Text>
                  <Text style={s.kickoffText}>{kickoffTimeLabel}</Text>
                </>
              )}
            </View>

            {/* Away */}
            <View style={[s.teamSide, s.teamSideRight]}>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={LOGO_SIZE} />
              <Text
                style={[s.teamName, s.teamNameRight, awayWin && s.teamNameWinner]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.awayTeam}
              </Text>
              {!upcoming && (match.redCards?.away ?? 0) > 0 && (
                <Text style={[s.redCards, s.redCardsRight]}>{'🟥'.repeat(Math.min(match.redCards!.away, 3))}</Text>
              )}
            </View>

          </View>

          {/* ── Live stats strip ── */}
          {live && (match.possession || match.shotsOnGoal) && (
            <View style={s.statsStrip}>
              {match.possession && (
                <View style={s.statItem}>
                  <Text style={s.statValue}>{match.possession.home}%</Text>
                  <View style={s.statBar}>
                    <View style={[s.statBarHome, { flex: match.possession.home }]} />
                    <View style={[s.statBarAway, { flex: match.possession.away }]} />
                  </View>
                  <Text style={s.statValue}>{match.possession.away}%</Text>
                  <Text style={s.statLabel}>Possession</Text>
                </View>
              )}
              {match.shotsOnGoal && (
                <View style={s.statItem}>
                  <Text style={s.statValue}>{match.shotsOnGoal.home}</Text>
                  <Ionicons name="football-outline" size={11} color={COLORS.textMuted} style={{ marginHorizontal: 6 }} />
                  <Text style={s.statValue}>{match.shotsOnGoal.away}</Text>
                  <Text style={s.statLabel}>Shots</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Action row ── */}
          <View style={s.actionsWrap}>
            <View style={s.actionsDivider} />
            <View style={s.actionsRow}>
              <TouchableOpacity activeOpacity={0.8} onPress={onWatchPress} style={[s.actionBtn, live && s.actionBtnLive]}>
                <Ionicons name="play-circle" size={16} color={live ? '#fff' : COLORS.textSecondary} />
                <Text style={[s.actionBtnText, live && { color: '#fff' }]}>Watch</Text>
              </TouchableOpacity>
              <View style={s.actionSep} />
              <TouchableOpacity activeOpacity={0.8} onPress={onStatsPress} style={s.actionBtn}>
                <Ionicons name="bar-chart-outline" size={16} color={COLORS.textSecondary} />
                <Text style={s.actionBtnText}>Stats</Text>
              </TouchableOpacity>
              <View style={s.actionSep} />
              <TouchableOpacity activeOpacity={0.8} onPress={onLineupsPress} style={s.actionBtn}>
                <Ionicons name="people-outline" size={16} color={COLORS.textSecondary} />
                <Text style={s.actionBtnText}>Lineups</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </TouchableOpacity>
    </View>
  );
};

export const HeroMatchCard = memo(HeroMatchCardInner);
export default HeroMatchCard;

// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 200,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  leagueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: SCREEN_W * 0.5,
  },
  leagueText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  statusBadgeFt: {
    backgroundColor: 'rgba(168,176,211,0.12)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeFtText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  statusBadgeTime: {
    backgroundColor: 'rgba(255,45,85,0.12)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },

  // Match row
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  teamSide: {
    flex: 3,
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  teamSideRight: {
    alignItems: 'center',
  },
  teamName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  teamNameRight: {
    textAlign: 'center',
  },
  teamNameWinner: {
    color: COLORS.text,
  },
  redCards: {
    fontSize: 10,
  },
  redCardsRight: {
    textAlign: 'center',
  },

  // Score
  scoreSide: {
    flex: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 80,
  },
  scoreText: {
    fontSize: 38,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  scoreTextLive: {
    color: COLORS.live,
    textShadowColor: 'rgba(255,59,92,0.50)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  scoreSep: {
    color: COLORS.textMuted,
    fontWeight: '300',
    fontSize: 32,
  },
  minutePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.live,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  minuteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  minuteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  ftText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  vsText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  kickoffText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  kickoffDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 12,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    width: 26,
    textAlign: 'center',
  },
  statBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    marginHorizontal: 4,
  },
  statBarHome: {
    backgroundColor: COLORS.accent,
  },
  statBarAway: {
    backgroundColor: COLORS.borderLight,
  },
  statLabel: {
    position: 'absolute',
    bottom: -12,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '500',
    color: COLORS.textFaint,
    letterSpacing: 0.3,
  },

  // Actions
  actionsWrap: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  actionsDivider: {
    height: 1,
    backgroundColor: 'rgba(30,39,64,0.8)',
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  actionBtnLive: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    flex: 1.2,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  actionSep: {
    width: 1,
    height: 16,
    backgroundColor: COLORS.border,
  },
});
