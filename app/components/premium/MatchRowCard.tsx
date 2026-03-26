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
import { TeamLogo } from '@/components/TeamLogo';
import { resolveCompetitionBrand } from '@/lib/logo-manager';
import { resolveMatchBucket } from '@/lib/match-state';
import { t as tFn } from '@/lib/i18n';

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

  return (
    <View style={s.wrap}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
        <View style={[s.card, live && s.cardLive]}>
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
                    <Text style={[s.statusBelow, live ? s.statusBelowLive : null]}>{stateLabel}</Text>
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
    marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
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
  cardLive: {
    borderColor: 'rgba(255, 45, 85, 0.32)',
    shadowColor: COLORS.live,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  topBar: {
    height: 3,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 0,
  },
  metaSpacer: {
    flex: 1,
  },
  notifyQuickBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 13,
    minHeight: 124,
  },
  teamCol: {
    flex: 5,
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 16,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  teamNameBold: {
    color: COLORS.text,
    fontWeight: '700',
  },
  cards: {
    fontSize: 9,
    marginTop: 2,
  },
  center: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    minWidth: 118,
    gap: 4,
  },
  centerCompetitionText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    textAlign: 'center',
    minHeight: 24,
    maxWidth: 112,
  },
  leagueLogoCenter: {
    width: 26,
    height: 26,
    marginBottom: 2,
  },
  leagueIconFallback: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 28,
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
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  kickoffLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 22,
  },
  statusBelow: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  statusBelowLive: {
    color: COLORS.live,
  },
  pulseWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,45,85,0.22)',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.live,
  },
  possRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 9,
  },
  possBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
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
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    width: 26,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  actionsDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 7,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  actionBtnText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
});
