/**
 * MATCH ROW CARD — Premium Match Card (v2.2)
 *
 * Professional LEFT TEAM | MATCH CENTER | RIGHT TEAM layout.
 * - Team names never break awkwardly (numberOfLines + adjustsFontSizeToFit)
 * - Action buttons: Watch · Stats · Lineups · Remind
 * - Live: possession bar, minute, live pulse
 * - Dark navy design system (#070B1A / #11162A / #FF2D55)
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS }  from '@/constants/colors';
import { SPACING } from '@/constants/design-system';
import { TeamLogo } from '@/components/TeamLogo';
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

const LOGO_SIZE = 40;

// Static live dot (no animation — removeChild proof)
const LivePulse = memo(function LivePulse() {
  return (
    <View style={s.pulseWrap}>
      <View style={s.pulseRing} />
      <View style={s.pulseDot} />
    </View>
  );
});

// Single action button
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

  const homeWin = !upcoming && (match.homeScore > match.awayScore);
  const awayWin = !upcoming && (match.awayScore > match.homeScore);

  const timeLabel = live
    ? `${match.minute ?? 0}'`
    : finished ? tFn('common.ft')
    : formatKickoffLabel(match.startTime);

  return (
    <View style={s.wrap}>
      <TouchableOpacity activeOpacity={0.88} onPress={onPress}>
        <View style={[s.card, live && s.cardLive]}>

          {/* Top accent line */}
          <View style={[s.topBar, { backgroundColor: barColor }]} />

          <View style={s.metaRow}>
            <View style={s.metaLeagueWrap}>
              <Text style={s.metaLeagueLabel} numberOfLines={1}>{match.league || 'Match'}</Text>
            </View>
            <View style={s.metaActions}>
              <View style={[s.metaStatusBadge, live ? s.metaStatusBadgeLive : null]}>
                <Text style={[s.metaStatusText, live ? s.metaStatusTextLive : null]}>
                  {live ? `${tFn('common.live')} ${timeLabel}` : finished ? tFn('common.ft') : timeLabel}
                </Text>
              </View>
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
          </View>

          {/* ── Main row ── */}
          <View style={s.row}>

            {/* Home team */}
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
              {!upcoming && (match.redCards?.home ?? 0) > 0 && (
                <Text style={s.cards}>{'🟥'.repeat(Math.min(match.redCards!.home, 3))}</Text>
              )}
            </View>

            {/* Center */}
            <View style={s.center}>
              {live && <LivePulse />}

              {!upcoming ? (
                <Text style={[s.score, live && s.scoreLive]}>
                  {match.homeScore ?? 0}
                  <Text style={s.scoreSep}> : </Text>
                  {match.awayScore ?? 0}
                </Text>
              ) : (
                <>
                  <Text style={s.kickoffLabel}>{tFn('common.upcoming')}</Text>
                  <Text style={s.kickoff}>{timeLabel}</Text>
                </>
              )}
            </View>

            {/* Away team */}
            <View style={s.teamCol}>
              <Text
                style={[s.teamName, s.teamNameRight, awayWin && s.teamNameBold]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                ellipsizeMode="tail"
              >
                {match.awayTeam}
              </Text>
              <TeamLogo uri={match.awayTeamLogo} teamName={match.awayTeam} size={LOGO_SIZE} />
              {!upcoming && (match.redCards?.away ?? 0) > 0 && (
                <Text style={[s.cards, s.cardsRight]}>{'🟥'.repeat(Math.min(match.redCards!.away, 3))}</Text>
              )}
            </View>

          </View>

          {/* Possession bar (live only) */}
          {live && match.possession && (
            <View style={s.possRow}>
              <Text style={s.possLabel}>{match.possession.home}%</Text>
              <View style={s.possBar}>
                <View style={[s.possHome, { flex: match.possession.home }]} />
                <View style={[s.possAway, { flex: match.possession.away }]} />
              </View>
              <Text style={s.possLabel}>{match.possession.away}%</Text>
            </View>
          )}

          {/* Action buttons */}
          {showActions && (
            <View style={s.actions}>
              <View style={s.actionsDivider} />
              <View style={s.actionsRow}>
                <ActionBtn icon="play-circle-outline" label="Watch"   onPress={onWatchPress}       primary={live} />
                <ActionBtn icon="bar-chart-outline"   label="Stats"   onPress={onStatsPress} />
                <ActionBtn icon="people-outline"      label="Lineups" onPress={onLineupsPress} />
                <ActionBtn
                  icon={isNotificationOn ? 'notifications' : 'notifications-outline'}
                  label="Remind"
                  onPress={onNotificationToggle}
                />
              </View>
            </View>
          )}

        </View>
      </TouchableOpacity>
    </View>
  );
}

export const MatchRowCard = memo(MatchRowCardInner);
export default MatchRowCard;

// ─────────────────────────────────────────────────────────────────────────────

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
  },
  cardLive: {
    borderColor: 'rgba(255, 59, 92, 0.35)',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 6,
    gap: 8,
  },
  metaLeagueWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaLeagueLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
  metaStatusBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metaStatusBadgeLive: {
    backgroundColor: 'rgba(255, 59, 92, 0.12)',
    borderColor: 'rgba(255, 59, 92, 0.34)',
  },
  metaStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  metaStatusTextLive: {
    color: COLORS.live,
  },
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    borderColor: 'rgba(255, 59, 92, 0.36)',
    backgroundColor: COLORS.live,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 13,
    minHeight: 88,
  },

  // Teams ─────────────────────────────────────────────────────────────────────
  teamCol: {
    flex: 5,
    alignItems: 'center',
    gap: 5,
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
  teamNameRight: {
    textAlign: 'center',
  },
  teamNameBold: {
    color: COLORS.text,
    fontWeight: '700',
  },
  cards: {
    fontSize: 9,
    marginTop: 2,
  },
  cardsRight: {
    textAlign: 'right',
  },

  // Center ────────────────────────────────────────────────────────────────────
  center: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    minWidth: 92,
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
    textShadowColor: 'rgba(255, 59, 92, 0.45)',
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
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  livePill: {
    marginTop: 6,
    backgroundColor: COLORS.live,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // Live pulse dot ─────────────────────────────────────────────────────────────
  pulseWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  pulseRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 59, 92, 0.25)',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.live,
  },

  // Possession ─────────────────────────────────────────────────────────────────
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

  // Actions ─────────────────────────────────────────────────────────────────────
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
