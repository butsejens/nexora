/**
 * Notification Center Screen
 * Shows followed teams, alerts, and notification history
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { designTokens } from '@/constants/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFollowState } from '@/context/UserStateContext';
import { useOnboardingStore } from '@/store/onboarding-store';

interface NotificationCenterProps {
  onClose: () => void;
  onNavigate: (screen: string, params?: any) => void;
}

export function NotificationCenter({ onClose, onNavigate }: NotificationCenterProps) {
  const { followedTeams, followedMatches, unfollowTeamAction, unfollowMatchAction } = useFollowState();
  const notificationPrefs = useOnboardingStore((state) => state.notifications);
  const [selectedTab, setSelectedTab] = useState<'followed' | 'alerts'>('alerts');

  const alertsEnabledCount = [notificationPrefs.matches, notificationPrefs.goals, notificationPrefs.lineups].filter(Boolean).length;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: designTokens.colors.background,
    },
    header: {
      paddingHorizontal: designTokens.spacing.lg,
      paddingVertical: designTokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: designTokens.colors.border,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: designTokens.spacing.md,
    },
    title: {
      ...designTokens.typography.heading2,
      color: designTokens.colors.textPrimary,
    },
    closeButton: {
      padding: designTokens.spacing.sm,
    },
    tabs: {
      flexDirection: 'row',
      gap: designTokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: designTokens.colors.border,
      marginHorizontal: -designTokens.spacing.lg,
      paddingHorizontal: designTokens.spacing.lg,
      marginTop: designTokens.spacing.md,
    },
    tab: {
      paddingVertical: designTokens.spacing.md,
      paddingHorizontal: designTokens.spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: designTokens.colors.primary,
    },
    tabText: {
      ...designTokens.typography.body,
      color: designTokens.colors.textTertiary,
      fontWeight: '500',
    },
    tabTextActive: {
      color: designTokens.colors.primary,
      fontWeight: '600',
    },
    content: {
      flex: 1,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: designTokens.spacing.xl,
    },
    emptyIcon: {
      marginBottom: designTokens.spacing.lg,
    },
    emptyText: {
      ...designTokens.typography.bodyLarge,
      color: designTokens.colors.textSecondary,
      textAlign: 'center',
      marginBottom: designTokens.spacing.sm,
    },
    emptySubtext: {
      ...designTokens.typography.body,
      color: designTokens.colors.textTertiary,
      textAlign: 'center',
    },

    // Followed items
    followedSection: {
      padding: designTokens.spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: designTokens.colors.border,
    },
    sectionTitle: {
      ...designTokens.typography.heading3,
      color: designTokens.colors.textPrimary,
      marginBottom: designTokens.spacing.md,
    },
    followedGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: designTokens.spacing.md,
    },
    followedCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: designTokens.colors.surface,
      borderRadius: designTokens.radius.lg,
      padding: designTokens.spacing.md,
      borderWidth: 1,
      borderColor: designTokens.colors.border,
      alignItems: 'center',
    },
    followedCardImage: {
      width: 48,
      height: 48,
      borderRadius: designTokens.radius.md,
      backgroundColor: designTokens.colors.primaryDark,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: designTokens.spacing.sm,
    },
    followedCardName: {
      ...designTokens.typography.bodySmall,
      color: designTokens.colors.textPrimary,
      fontWeight: '600',
      textAlign: 'center',
    },
    unfollowButton: {
      marginTop: designTokens.spacing.sm,
      paddingVertical: 4,
      paddingHorizontal: designTokens.spacing.sm,
      backgroundColor: designTokens.colors.primaryDark,
      borderRadius: designTokens.radius.md,
    },
    unfollowButtonText: {
      ...designTokens.typography.labelSmall,
      color: designTokens.colors.primary,
    },

    // Alerts summary
    alertsContent: {
      padding: designTokens.spacing.lg,
      gap: designTokens.spacing.md,
    },
    alertCard: {
      backgroundColor: designTokens.colors.surface,
      borderRadius: designTokens.radius.lg,
      padding: designTokens.spacing.md,
      borderWidth: 1,
      borderColor: designTokens.colors.border,
    },
    alertCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: designTokens.spacing.sm,
    },
    alertTitle: {
      ...designTokens.typography.bodyLarge,
      color: designTokens.colors.textPrimary,
      fontWeight: '600',
    },
    alertMessage: {
      ...designTokens.typography.body,
      color: designTokens.colors.textSecondary,
      lineHeight: 20,
    },
    manageButton: {
      marginTop: designTokens.spacing.sm,
      alignSelf: 'flex-start',
      paddingHorizontal: designTokens.spacing.md,
      paddingVertical: designTokens.spacing.sm,
      borderRadius: designTokens.radius.md,
      backgroundColor: designTokens.colors.primaryDark,
      borderWidth: 1,
      borderColor: designTokens.colors.primary,
    },
    manageButtonText: {
      ...designTokens.typography.body,
      color: designTokens.colors.primary,
      fontWeight: '600',
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: designTokens.radius.full,
      backgroundColor: designTokens.colors.primary,
    },
  });

  const renderFollowedTab = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {followedTeams.length > 0 && (
        <View style={styles.followedSection}>
          <Text style={styles.sectionTitle}>Followed Teams</Text>
          <View style={styles.followedGrid}>
            {followedTeams.map((team) => (
              <View key={String(team.teamId)} style={styles.followedCard}>
                <View style={styles.followedCardImage}>
                  <Ionicons name="shield" size={24} color={designTokens.colors.primary} />
                </View>
                <Text style={styles.followedCardName} numberOfLines={2}>
                  {team.teamName}
                </Text>
                <TouchableOpacity
                  style={styles.unfollowButton}
                  onPress={() => void unfollowTeamAction(team.teamId)}
                >
                  <Text style={styles.unfollowButtonText}>Unfollow</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {followedMatches.length > 0 && (
        <View style={styles.followedSection}>
          <Text style={styles.sectionTitle}>Followed Matches</Text>
          {followedMatches.map((match) => (
            <TouchableOpacity
              key={String(match.matchId)}
              onPress={() => onNavigate('match-detail', { matchId: String(match.matchId), espnLeague: match.espnLeague || undefined })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: designTokens.spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: designTokens.colors.border,
              }}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: designTokens.spacing.md,
                }}
              >
                <Ionicons name="play-circle" size={24} color={designTokens.colors.primary} />
                <View>
                    <Text style={styles.alertTitle}>{match.homeTeam} vs {match.awayTeam}</Text>
                    <Text style={styles.alertMessage}>{match.competition || 'Competition'}</Text>
                </View>
              </View>
                <TouchableOpacity style={styles.unfollowButton} onPress={() => void unfollowMatchAction(match.matchId)}>
                  <Text style={styles.unfollowButtonText}>Unfollow</Text>
                </TouchableOpacity>
              <Ionicons name="chevron-forward" size={20} color={designTokens.colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {followedTeams.length === 0 && followedMatches.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons
            name="star-outline"
            size={48}
            color={designTokens.colors.textTertiary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyText}>No followed teams or matches</Text>
          <Text style={styles.emptySubtext}>Follow teams to get personalized alerts</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderAlertsTab = () => {
    return (
      <View style={styles.content}>
        <ScrollView contentContainerStyle={styles.alertsContent} showsVerticalScrollIndicator={false}>
          <View style={styles.alertCard}>
            <View style={styles.alertCardHeader}>
              <Text style={styles.alertTitle}>Match alert system</Text>
              <View style={styles.statusDot} />
            </View>
            <Text style={styles.alertMessage}>
              Live notifications are now driven by your followed matches and onboarding preferences.
              Enabled categories: {alertsEnabledCount}/3.
            </Text>
            <TouchableOpacity style={styles.manageButton} onPress={() => onNavigate('follow-center')}>
              <Text style={styles.manageButtonText}>Manage followed matches</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.alertCard}>
            <View style={styles.alertCardHeader}>
              <Text style={styles.alertTitle}>Current configuration</Text>
              <Ionicons name="options" size={16} color={designTokens.colors.textSecondary} />
            </View>
            <Text style={styles.alertMessage}>
              Matches: {notificationPrefs.matches ? 'On' : 'Off'}\nGoals: {notificationPrefs.goals ? 'On' : 'Off'}\nLineups: {notificationPrefs.lineups ? 'On' : 'Off'}
            </Text>
            <TouchableOpacity style={styles.manageButton} onPress={() => onNavigate('settings')}>
              <Text style={styles.manageButtonText}>Open notification settings</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={designTokens.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'alerts' && styles.tabActive]}
            onPress={() => setSelectedTab('alerts')}
          >
            <Text style={[styles.tabText, selectedTab === 'alerts' && styles.tabTextActive]}>
              Alerts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'followed' && styles.tabActive]}
            onPress={() => setSelectedTab('followed')}
          >
            <Text style={[styles.tabText, selectedTab === 'followed' && styles.tabTextActive]}>
              Followed
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {selectedTab === 'alerts' && renderAlertsTab()}
      {selectedTab === 'followed' && renderFollowedTab()}
    </SafeAreaView>
  );
}
