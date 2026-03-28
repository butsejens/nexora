 import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
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

const LOGO_SIZE = 40;

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
    <View style={s.wrap}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
        <View style={[s.card, live && s.cardLive]}>
          <View style={s.posterBackdrop}>
            <View style={s.posterLogoLeft}>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={88} />
            </View>
            <View style={s.posterLogoRight}>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={88} />
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

          <View style={[s.topBar, { backgroundColor: barColor }]} />

          <View style={s.metaRow}>
            <View style={s.metaSpacer} />
            {onNotificationToggle ? (
              <TouchableOpacity
                style={[s.notifyQuickBtn, isNotificationOn ? s.notifyQuickBtnActive : null]}
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

          <View style={s.row}>
            <View style={s.teamCol}>
              <Text
                style={[s.teamName, homeWin && s.teamNameBold]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.homeTeam}
              </Text>
              <TeamLogo uri={match.homeTeamLogo} teamName={match.homeTeam} size={LOGO_SIZE} />
              {!upcoming && (match.redCards?.home ?? 0) > 0 ? (
                <Text style={s.cards}>{'🟥'.repeat(Math.min(match.redCards.home, 3))}</Text>
              ) : null}
            </View>

            <View style={s.center}>
              {leagueLogo ? (
                <Image
                  source={typeof leagueLogo === 'number' ? leagueLogo : { uri: leagueLogo as string }}
                  style={s.leagueLogoCenter}
                  resizeMode="contain"
                />
              ) : (
                <View style={s.leagueIconFallback}>
                  <Ionicons name="trophy-outline" size={14} color={COLORS.textMuted} />
                </View>
              )}
              <Text style={s.centerCompetitionText} numberOfLines={2}>
                {competitionBrand.name || match.league || 'Competition'}
              </Text>

              {!upcoming ? (
                <>
                  <Text style={[s.score, live && s.scoreLive]}>
                    {match.homeScore ?? 0}
                    <Text style={s.scoreSep}> : </Text>
                    {match.awayScore ?? 0}
                  </Text>
                  <View style={s.statusRow}>
                    {live ? <LivePulse /> : null}
                    <Text style={[s.statusBelow, live ? s.statusBelowLive : null, finished ? s.statusBelowFinished : null]}>{stateLabel}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.kickoffLabel}>{tFn('common.upcoming')}</Text>
                  <Text style={s.kickoff}>{stateLabel}</Text>
                </>
              )}
            </View>

            <View style={s.teamCol}>
              <Text
                style={[s.teamName, awayWin && s.teamNameBold]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.awayTeam}
              </Text>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={LOGO_SIZE} />
              {!upcoming && (match.redCards?.away ?? 0) > 0 ? (
                <Text style={s.cards}>{'🟥'.repeat(Math.min(match.redCards.away, 3))}</Text>
              ) : null}
            </View>
          </View>

          {live && match.possession ? (
            <View style={s.possRow}>
              <Text style={s.possLabel}>{match.possession.home}%</Text>
              <View style={s.possBar}>
                <View style={[s.possHome, { flex: match.possession.home }]} />
                <View style={[s.possAway, { flex: match.possession.away }]} />
              </View>
              <Text style={s.possLabel}>{match.possession.away}%</Text>
            </View>
          ) : null}

          <View style={s.momentumWrap}>
            <MomentumBar
              model={momentum}
              compact
              homeLabel={match.homeTeam.slice(0, 3).toUpperCase()}
              awayLabel={match.awayTeam.slice(0, 3).toUpperCase()}
            />
          </View>

          {showActions ? (
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
  wrap: {
    marginHorizontal: SPACING.lg,
    marginBottom: vs(12),
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: ms(18),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  posterBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  posterLogoLeft: {
    position: 'absolute',
    left: -sc(10),
    top: vs(16),
    opacity: 0.16,
    transform: [{ rotate: '-7deg' }],
  },
  posterLogoRight: {
    position: 'absolute',
    right: -sc(10),
    top: vs(16),
    opacity: 0.16,
    transform: [{ rotate: '7deg' }],
  },
  cardLive: {
    borderColor: 'rgba(255, 45, 85, 0.32)',
    shadowColor: COLORS.live,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  topBar: {
    height: vs(3),
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: sc(14),
    paddingTop: vs(11),
    paddingBottom: 0,
  },
  metaSpacer: {
    flex: 1,
  },
  notifyQuickBtn: {
    width: sc(30),
    height: sc(30),
    borderRadius: sc(15),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardElevated,
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
  teamCol: {
    flex: 5,
    alignItems: 'center',
    gap: ms(6),
    minWidth: 0,
  },
  teamName: {
    fontSize: ms(14),
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: ms(16),
    textAlign: 'center',
    letterSpacing: 0.1,
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
  leagueLogoCenter: {
    width: sc(26),
    height: sc(26),
    marginBottom: vs(2),
  },
  leagueIconFallback: {
    width: sc(26),
    height: sc(26),
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: ms(28),
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  scoreLive: {
    color: COLORS.live,
    textShadowColor: 'rgba(255,45,85,0.45)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  scoreSep: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  kickoff: {
    fontSize: ms(19),
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  kickoffLabel: {
    fontSize: ms(9),
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: vs(2),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(6),
    minHeight: vs(22),
  },
  statusBelow: {
    fontSize: ms(10),
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  statusBelowLive: {
    color: COLORS.live,
  },
  statusBelowFinished: {
    color: '#FFD34D',
  },
  pulseWrap: {
    width: sc(14),
    height: sc(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: sc(14),
    height: sc(14),
    borderRadius: sc(7),
    backgroundColor: 'rgba(255,45,85,0.22)',
  },
  pulseDot: {
    width: sc(7),
    height: sc(7),
    borderRadius: sc(3.5),
    backgroundColor: COLORS.live,
  },
  possRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sc(14),
    paddingBottom: vs(10),
    gap: ms(9),
  },
  possBar: {
    flex: 1,
    height: vs(4),
    borderRadius: ms(2),
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  possHome: {
    backgroundColor: COLORS.accent,
  },
  possAway: {
    backgroundColor: COLORS.borderLight,
  },
  possLabel: {
    fontSize: ms(9),
    fontWeight: '600',
    color: COLORS.textMuted,
    width: sc(26),
    textAlign: 'center',
  },
  momentumWrap: {
    paddingHorizontal: sc(14),
    paddingBottom: vs(10),
  },
  actions: {
    paddingHorizontal: sc(14),
    paddingBottom: vs(12),
  },
  actionsDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: vs(7),
  },
  actionsRow: {
    flexDirection: 'row',
    gap: ms(5),
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(3),
    paddingVertical: vs(6),
    borderRadius: ms(8),
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  actionBtnText: {
    fontSize: ms(9),
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
});
