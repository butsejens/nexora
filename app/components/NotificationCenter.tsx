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
  FlatList,
} from 'react-native';
import { designTokens } from '@/constants/design-tokens';
import { useFollowStore } from '@/store/follow-store';
import { Ionicons } from '@expo/vector-icons';

interface NotificationCenterProps {
  onClose: () => void;
  onNavigate: (screen: string, params?: any) => void;
}

export function NotificationCenter({ onClose, onNavigate }: NotificationCenterProps) {
  const {
    followed,
    notifications,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    initializeNotifications,
    removeFollow,
  } =
    useFollowStore();
  const [selectedTab, setSelectedTab] = useState<'followed' | 'alerts'>('alerts');

  useEffect(() => {
    initializeNotifications();
  }, [initializeNotifications]);

  const followedTeams = followed.filter((f) => f.type === 'team');
  const followedMatches = followed.filter((f) => f.type === 'match');
  const unreadNotifications = notifications.filter((n) => !n.read);

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleDeleteNotification = (id: string) => {
    deleteNotification(id);
  };

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

    // Notifications
    notificationsList: {
      padding: designTokens.spacing.lg,
    },
    notificationItem: {
      backgroundColor: designTokens.colors.surface,
      borderRadius: designTokens.radius.lg,
      padding: designTokens.spacing.md,
      marginBottom: designTokens.spacing.md,
      borderWidth: 1,
      borderColor: designTokens.colors.border,
    },
    notificationItemUnread: {
      borderColor: designTokens.colors.primary,
      backgroundColor: designTokens.colors.primaryDark,
    },
    notificationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: designTokens.spacing.sm,
    },
    notificationTitle: {
      ...designTokens.typography.bodyLarge,
      color: designTokens.colors.textPrimary,
      fontWeight: '600',
      flex: 1,
      marginRight: designTokens.spacing.md,
    },
    notificationBadge: {
      width: 8,
      height: 8,
      borderRadius: designTokens.radius.full,
      backgroundColor: designTokens.colors.primary,
    },
    notificationMessage: {
      ...designTokens.typography.body,
      color: designTokens.colors.textSecondary,
      marginBottom: designTokens.spacing.sm,
    },
    notificationFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    notificationTime: {
      ...designTokens.typography.labelSmall,
      color: designTokens.colors.textTertiary,
    },
    notificationActions: {
      flexDirection: 'row',
      gap: designTokens.spacing.sm,
    },
    actionButton: {
      padding: designTokens.spacing.sm,
    },

    // Mark all as read button
    markAllButton: {
      paddingHorizontal: designTokens.spacing.lg,
      paddingVertical: designTokens.spacing.md,
      borderTopWidth: 1,
      borderTopColor: designTokens.colors.border,
    },
    markAllButtonText: {
      ...designTokens.typography.body,
      color: designTokens.colors.primary,
      textAlign: 'center',
      fontWeight: '600',
    },
  });

  const renderFollowedTab = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {followedTeams.length > 0 && (
        <View style={styles.followedSection}>
          <Text style={styles.sectionTitle}>Followed Teams</Text>
          <View style={styles.followedGrid}>
            {followedTeams.map((team) => (
              <View key={team.id} style={styles.followedCard}>
                <View style={styles.followedCardImage}>
                  <Ionicons name="shield" size={24} color={designTokens.colors.primary} />
                </View>
                <Text style={styles.followedCardName} numberOfLines={2}>
                  {team.name}
                </Text>
                <TouchableOpacity
                  style={styles.unfollowButton}
                  onPress={() => removeFollow(team.id)}
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
              key={match.id}
              onPress={() => onNavigate('match-detail', { matchId: match.id })}
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
                  <Text style={styles.notificationTitle}>{match.name}</Text>
                  <Text style={styles.notificationMessage}>{match.sport}</Text>
                </View>
              </View>
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
    if (notifications.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons
            name="notifications-outline"
            size={48}
            color={designTokens.colors.textTertiary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyText}>No notifications yet</Text>
          <Text style={styles.emptySubtext}>You&apos;ll see alerts here as they happen</Text>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.notificationItem,
                !item.read && styles.notificationItemUnread,
              ]}
            >
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {!item.read && <View style={styles.notificationBadge} />}
              </View>
              <Text style={styles.notificationMessage}>{item.message}</Text>
              <View style={styles.notificationFooter}>
                <Text style={styles.notificationTime}>
                  {formatTime(item.timestamp)}
                </Text>
                <View style={styles.notificationActions}>
                  {!item.read && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleMarkAsRead(item.id)}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={designTokens.colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteNotification(item.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color={designTokens.colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={styles.notificationsList}
          scrollIndicatorInsets={{ right: 1 }}
        />
        {unreadNotifications.length > 0 && (
          <View style={styles.markAllButton}>
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.markAllButtonText}>Mark all as read</Text>
            </TouchableOpacity>
          </View>
        )}
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
              Alerts {unreadNotifications.length > 0 && `(${unreadNotifications.length})`}
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

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}
