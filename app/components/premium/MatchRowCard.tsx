 import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/design-system';
import { ms, s as sc, vs } from '@/lib/responsive';
import { TeamLogo } from '@/components/TeamLogo';
import { resolveCompetitionBrand } from '@/lib/logo-manager';
import { resolveMatchBucket } from '@/lib/match-state';
import { t as tFn } from '@/lib/i18n';
import { calculateMomentum } from '@/lib/ai/momentum-calculator';
import { MomentumBar } from '@/components/sports/MomentumBar';

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
    espnLeague?: string;
    sport?: string;
    possession?: { home: number; away: number };
    redCards?: { home: number; away: number };
    shotsOnGoal?: { home?: number; away?: number };
    attacks?: { home: number; away: number };
    xg?: { home: number; away: number };
  };
  onPress?: () => void;
  onNotificationToggle?: () => void;
  isNotificationOn?: boolean;
  showActions?: boolean;
  onWatchPress?: () => void;
  onStatsPress?: () => void;
  onLineupsPress?: () => void;
  compact?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

const SPORT_ACCENTS: Record<string, string> = {
  football: '#4CAF82', soccer: '#4CAF82',
  basketball: '#FF6B35',
  tennis: '#8BC34A',
  mma: '#9C27B0', ufc: '#9C27B0',
  motorsport: '#FF9800', f1: '#FF9800', motogp: '#FF9800',
  baseball: '#FFC107',
  ice_hockey: '#2196F3', hockey: '#2196F3',
};

const LOGO_SIZE = ms(40);
const LOGO_SIZE_COMPACT = ms(30);
const BACKDROP_LOGO_SIZE = sc(88);

function getSportAccent(sport?: string): string {
  const key = (sport || '').toLowerCase();
  return SPORT_ACCENTS[key] || COLORS.accent;
}

function formatKickoffLabel(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return tFn('matchDetail.kickoffTBD');
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) {
    try {
      return new Intl.DateTimeFormat('nl-BE', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(parsed));
    } catch {
      return raw;
    }
  }
  const hm = raw.match(/(\d{1,2}:\d{2})/);
  return hm?.[1] || raw;
}

const LivePulse = memo(function LivePulse() {
  return (
    <View style={s.pulseWrap}>
      <View style={s.pulseRing} />
      <View style={s.pulseDot} />
    </View>
  );
});

const ActionBtn = memo(function ActionBtn({
  icon, label, onPress, primary,
}: { icon: string; label: string; onPress?: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[s.actionBtn, primary && s.actionBtnPrimary]}>
      <Ionicons name={icon as any} size={12} color={primary ? '#fff' : COLORS.textSecondary} />
      <Text style={[s.actionBtnText, primary && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
});

function MatchRowCardInner({
  match,
  onPress,
  onNotificationToggle,
  isNotificationOn = false,
  showActions = false,
  onWatchPress,
  onStatsPress,
  onLineupsPress,
  compact = false,
  containerStyle,
}: MatchRowCardProps) {
  const bucket = resolveMatchBucket({
    status: match.status,
    minute: match.minute,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  });
  const live = bucket === 'live';
  const finished = bucket === 'finished';
  const upcoming = bucket === 'upcoming';

  const sportAccent = getSportAccent(match.sport);
  const barColor = live ? COLORS.live : sportAccent;
  const homeWin = !upcoming && match.homeScore > match.awayScore;
  const awayWin = !upcoming && match.awayScore > match.homeScore;
  const competitionBrand = resolveCompetitionBrand({
    name: match.league || '',
    espnLeague: match.espnLeague || null,
  });
  const leagueLogo = competitionBrand.logo;
  const stateLabel = live
    ? `${match.minute ?? 0}'`
    : finished
      ? tFn('common.ft')
      : formatKickoffLabel(match.startTime);
  const teamLogoSize = compact ? LOGO_SIZE_COMPACT : LOGO_SIZE;
  const momentum = calculateMomentum({
    homeStats: {
      possession: match?.possession?.home,
      shotsOnTarget: match?.shotsOnGoal?.home,
      attacks: (match as any)?.attacks?.home,
      xg: (match as any)?.xg?.home,
    },
    awayStats: {
      possession: match?.possession?.away,
      shotsOnTarget: match?.shotsOnGoal?.away,
      attacks: (match as any)?.attacks?.away,
      xg: (match as any)?.xg?.away,
    },
  });

  return (
    <View style={[s.wrap, compact && s.wrapCompact, containerStyle]}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
        <View style={[s.card, compact && s.cardCompact, live && s.cardLive]}>
          <View style={s.posterBackdrop}>
            <View style={s.posterLogoLeft}>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={BACKDROP_LOGO_SIZE} />
            </View>
            <View style={s.posterLogoRight}>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={BACKDROP_LOGO_SIZE} />
            </View>
            <LinearGradient
              colors={[
                'rgba(10,10,18,0.36)',
                'rgba(10,10,18,0.78)',
                'rgba(10,10,18,0.96)',
              ]}
              locations={[0, 0.58, 1]}
              style={StyleSheet.absoluteFillObject}
            />
          </View>

          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.015)', 'rgba(0,0,0,0.14)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.glowOverlay}
          />

          <View style={[s.topBar, compact && s.topBarCompact, { backgroundColor: barColor }]} />

          <View style={[s.metaRow, compact && s.metaRowCompact]}>
            <View style={s.metaSpacer} />
            {onNotificationToggle ? (
              <TouchableOpacity
                style={[s.notifyQuickBtn, compact && s.notifyQuickBtnCompact, isNotificationOn ? s.notifyQuickBtnActive : null]}
                onPress={onNotificationToggle}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={isNotificationOn ? 'notifications' : 'notifications-outline'}
                  size={14}
                  color={isNotificationOn ? '#fff' : COLORS.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[s.row, compact && s.rowCompact]}>
            <View style={[s.teamCol, compact && s.teamColCompact]}>
              <Text
                style={[s.teamName, compact && s.teamNameCompact, homeWin && s.teamNameBold]}
                numberOfLines={compact ? 1 : 2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.homeTeam}
              </Text>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={teamLogoSize} />
              {!upcoming && ((match.redCards?.home ?? 0) > 0) ? (
                <Text style={s.cards}>{'🟥'.repeat(Math.min(match.redCards?.home ?? 0, 3))}</Text>
              ) : null}
            </View>

            <View style={[s.center, compact && s.centerCompact]}>
              {leagueLogo ? (
                <Image
                  source={typeof leagueLogo === 'number' ? leagueLogo : { uri: leagueLogo as string }}
                  style={[s.leagueLogoCenter, compact && s.leagueLogoCenterCompact]}
                  resizeMode="contain"
                />
              ) : (
                <View style={[s.leagueIconFallback, compact && s.leagueIconFallbackCompact]}>
                  <Ionicons name="trophy-outline" size={14} color={COLORS.textMuted} />
                </View>
              )}
              <Text style={[s.centerCompetitionText, compact && s.centerCompetitionTextCompact]} numberOfLines={compact ? 1 : 2}>
                {competitionBrand.name || match.league || 'Competition'}
              </Text>

              {!upcoming ? (
                <>
                  <Text style={[s.score, compact && s.scoreCompact, live && s.scoreLive]}>
                    {match.homeScore ?? 0}
                    <Text style={s.scoreSep}> : </Text>
                    {match.awayScore ?? 0}
                  </Text>
                  <View style={[s.statusRow, compact && s.statusRowCompact]}>
                    {live ? <LivePulse /> : null}
                    <Text style={[s.statusBelow, compact && s.statusBelowCompact, live ? s.statusBelowLive : null, finished ? s.statusBelowFinished : null]}>{stateLabel}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[s.kickoffLabel, compact && s.kickoffLabelCompact]}>{tFn('common.upcoming')}</Text>
                  <Text style={[s.kickoff, compact && s.kickoffCompact]}>{stateLabel}</Text>
                </>
              )}
            </View>

            <View style={[s.teamCol, compact && s.teamColCompact]}>
              <Text
                style={[s.teamName, compact && s.teamNameCompact, awayWin && s.teamNameBold]}
                numberOfLines={compact ? 1 : 2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.awayTeam}
              </Text>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={teamLogoSize} />
              {!upcoming && ((match.redCards?.away ?? 0) > 0) ? (
                <Text style={s.cards}>{'🟥'.repeat(Math.min(match.redCards?.away ?? 0, 3))}</Text>
              ) : null}
            </View>
          </View>

          {!compact && live && match.possession ? (
            <View style={s.possRow}>
              <Text style={s.possLabel}>{match.possession.home}%</Text>
              <View style={s.possBar}>
                <View style={[s.possHome, { flex: match.possession.home }]} />
                <View style={[s.possAway, { flex: match.possession.away }]} />
              </View>
              <Text style={s.possLabel}>{match.possession.away}%</Text>
            </View>
          ) : null}

          {!compact ? (
            <View style={s.momentumWrap}>
              <MomentumBar
                model={momentum}
                compact
                homeLabel={match.homeTeam.slice(0, 3).toUpperCase()}
                awayLabel={match.awayTeam.slice(0, 3).toUpperCase()}
              />
            </View>
          ) : null}

          {showActions && !compact ? (
            <View style={s.actions}>
              <View style={s.actionsDivider} />
              <View style={s.actionsRow}>
                <ActionBtn icon="play-circle-outline" label="Watch" onPress={onWatchPress} primary={live} />
                <ActionBtn icon="bar-chart-outline" label="Stats" onPress={onStatsPress} />
                <ActionBtn icon="people-outline" label="Lineups" onPress={onLineupsPress} />
                <ActionBtn
                  icon={isNotificationOn ? 'notifications' : 'notifications-outline'}
                  label="Remind"
                  onPress={onNotificationToggle}
                />
              </View>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export const MatchRowCard = memo(MatchRowCardInner);
export default MatchRowCard;

const s = StyleSheet.create({
    pulseWrap: {
      width: ms(18), // replaced inline-size
      height: ms(18), // replaced block-size
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: ms(6), // replaced inset-inline-end
    },
    pulseRing: {
      position: 'absolute',
      width: ms(18), // replaced inline-size
      height: ms(18), // replaced block-size
      borderRadius: ms(9),
      borderWidth: 2, // replaced inline-size
      borderColor: COLORS.live,
      opacity: 0.32,
    },
    pulseDot: {
      width: ms(8), // replaced inline-size
      height: ms(8), // replaced block-size
      borderRadius: ms(4),
      backgroundColor: COLORS.live,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.cardElevated,
      borderRadius: ms(8),
      paddingHorizontal: ms(10),
      paddingVertical: ms(6),
      marginHorizontal: ms(4),
    },
    actionBtnPrimary: {
      backgroundColor: COLORS.live,
    },
    actionBtnText: {
      marginLeft: ms(4), // replaced inset-inline-start
      fontSize: ms(12),
      color: COLORS.textSecondary,
      fontWeight: '600',
    },
    leagueIconFallback: {
      width: sc(26), // replaced inline-size
      height: sc(26), // replaced block-size
      borderRadius: sc(13),
      backgroundColor: COLORS.cardElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leagueIconFallbackCompact: {
      width: sc(18), // replaced inline-size
      height: sc(18), // replaced block-size
      borderRadius: sc(9),
    },
    score: {
      fontSize: ms(28),
      fontWeight: '700',
      color: COLORS.text,
      textAlign: 'center',
    },
    scoreCompact: {
      fontSize: ms(20),
    },
    scoreLive: {
      color: COLORS.live,
    },
    scoreSep: {
      fontSize: ms(18),
      color: COLORS.textMuted,
      marginHorizontal: ms(2),
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: vs(2), // replaced inset-block-start
    },
    statusRowCompact: {
      marginTop: 0, // replaced inset-block-start
    },
    statusBelow: {
      fontSize: ms(12),
      color: COLORS.textMuted,
      marginLeft: ms(4), // replaced inset-inline-start
    },
    statusBelowCompact: {
      fontSize: ms(10),
    },
    statusBelowLive: {
      color: COLORS.live,
      fontWeight: '700',
    },
    statusBelowFinished: {
      color: COLORS.text,
      fontWeight: '700',
    },
    kickoffLabel: {
      fontSize: ms(10),
      color: COLORS.textMuted,
      textAlign: 'center',
      marginBottom: vs(2), // replaced inset-block-end
    },
    kickoffLabelCompact: {
      fontSize: ms(8),
      marginBottom: 0, // replaced inset-block-end
    },
    kickoff: {
      fontSize: ms(16),
      color: COLORS.text,
      textAlign: 'center',
    },
    kickoffCompact: {
      fontSize: ms(12),
    },
    possRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: vs(8), // replaced inset-block-start
      marginBottom: vs(4), // replaced inset-block-end
    },
    possLabel: {
      fontSize: ms(10),
      color: COLORS.textMuted,
      width: sc(28), // replaced inline-size
      textAlign: 'center',
    },
    possBar: {
      flex: 1,
      flexDirection: 'row',
      height: vs(8), // replaced block-size
      borderRadius: ms(4),
      backgroundColor: COLORS.cardElevated,
      marginHorizontal: ms(6),
      overflow: 'hidden',
    },
    possHome: {
      backgroundColor: COLORS.accent,
      height: '100%', // replaced block-size
    },
    possAway: {
      backgroundColor: COLORS.textMuted,
      height: '100%', // replaced block-size
    },
    momentumWrap: {
      marginTop: vs(8), // replaced inset-block-start
      marginBottom: vs(4), // replaced inset-block-end
      paddingHorizontal: sc(10),
    },
    actions: {
      marginTop: vs(10), // replaced inset-block-start
      paddingHorizontal: sc(10),
    },
    actionsDivider: {
      height: 1, // replaced block-size
      backgroundColor: COLORS.border,
      marginBottom: vs(8), // replaced inset-block-end
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
  wrap: {
    marginHorizontal: SPACING.lg,
    marginBottom: vs(12), // replaced inset-block-end
  },
  wrapCompact: {
    marginHorizontal: 0,
    marginBottom: 0, // replaced inset-block-end
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: ms(18),
    overflow: 'hidden',
    borderWidth: 1, // replaced inline-size
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, // replaced inline-size/block-size
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  cardCompact: {
    minHeight: vs(126), // replaced block-size
    borderRadius: ms(14),
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  posterBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  posterLogoLeft: { // replaced inset-inline-start
    position: 'absolute',
    left: -sc(10), // replaced inset-inline-start
    top: vs(16), // replaced inset-block-start
    opacity: 0.16,
    transform: [{ rotate: '-7deg' }],
  },
  posterLogoRight: { // replaced inset-inline-end
    position: 'absolute',
    right: -sc(10), // replaced inset-inline-end
    top: vs(16), // replaced inset-block-start
    opacity: 0.16,
    transform: [{ rotate: '7deg' }],
  },
  cardLive: {
    borderColor: 'rgba(255, 45, 85, 0.32)',
    shadowColor: COLORS.live,
    shadowOffset: { width: 0, height: 2 }, // replaced inline-size/block-size
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  topBar: {
    height: vs(3), // replaced block-size
  },
  topBarCompact: {
    height: vs(2), // replaced block-size
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: sc(14),
    paddingTop: vs(11), // replaced inset-block-start
    paddingBottom: 0, // replaced inset-block-end
  },
  metaRowCompact: {
    paddingHorizontal: sc(10),
    paddingTop: vs(7), // replaced inset-block-start
  },
  metaSpacer: {
    flex: 1,
  },
  notifyQuickBtn: {
    width: sc(30), // replaced inline-size
    height: sc(30), // replaced block-size
    borderRadius: sc(15),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardElevated,
  },
  notifyQuickBtnCompact: {
    width: sc(24),
    height: sc(24),
    borderRadius: sc(12),
  },
  notifyQuickBtnActive: {
    borderColor: 'rgba(255, 45, 85, 0.36)',
    backgroundColor: COLORS.live,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sc(14),
    paddingTop: vs(6),
    paddingBottom: vs(13),
    minHeight: vs(124),
  },
  rowCompact: {
    paddingHorizontal: sc(10),
    paddingTop: vs(4),
    paddingBottom: vs(8),
    minHeight: vs(86),
  },
  teamCol: {
    flex: 5,
    alignItems: 'center',
    gap: ms(6),
    minWidth: 0,
  },
  teamColCompact: {
    gap: ms(4),
  },
  teamName: {
    fontSize: ms(14),
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: ms(16),
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  teamNameCompact: {
    fontSize: ms(11),
    lineHeight: ms(12),
  },
  teamNameBold: {
    color: COLORS.text,
    fontWeight: '700',
  },
  cards: {
    fontSize: ms(9),
    marginTop: vs(2),
  },
  center: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc(6),
    minWidth: sc(118),
    gap: ms(4),
  },
  centerCompact: {
    minWidth: sc(92),
    gap: ms(2),
    paddingHorizontal: sc(4),
  },
  centerCompetitionText: {
    color: COLORS.textMuted,
    fontSize: ms(9),
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    textAlign: 'center',
    minHeight: vs(24),
    maxWidth: sc(112),
  },
  centerCompetitionTextCompact: {
    fontSize: ms(8),
    minHeight: vs(12),
    maxWidth: sc(96),
  },
  leagueLogoCenter: {
    width: sc(26),
    height: sc(26),
    marginBottom: vs(2),
  },
  leagueLogoCenterCompact: {
    width: sc(18),
    height: sc(18),
    marginBottom: 0,
  },
  // ...restored existing code...
});
