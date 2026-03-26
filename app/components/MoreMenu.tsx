/**
 * More Menu - Bottom navigation More screen with all features
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  SectionList,
  Switch,
} from 'react-native';
import { designTokens } from '@/constants/design-tokens';
import { useModulePreferences } from '@/store/module-preferences';
import { useFollowStore } from '@/store/follow-store';
import { Ionicons } from '@expo/vector-icons';

interface MoreMenuProps {
  onNavigate: (screen: string, params?: any) => void;
}

interface MenuItem {
  id: string;
  title: string;
  icon: string;
  screen?: string;
  action?: () => void;
  badge?: number | string;
}

interface MenuSection {
  title: string;
  data: MenuItem[];
}

export function MoreMenu({ onNavigate }: MoreMenuProps) {
  const { preferences, toggleModule } = useModulePreferences();
  const { getUnreadCount } = useFollowStore();
  const unreadCount = getUnreadCount();

  const handleNavigate = (screen: string, params?: any) => {
    onNavigate(screen, params);
  };

  const menuSections: MenuSection[] = [
    {
      title: 'MEDIA',
      data: [
        ...(preferences.moviesEnabled
          ? [{ id: 'movies', title: 'Movies', icon: 'film', screen: 'vod-studio' }]
          : []),
        ...(preferences.tvShowsEnabled
          ? [{ id: 'tv-shows', title: 'TV Shows', icon: 'tv', screen: 'vod-studio' }]
          : []),
        ...(preferences.animeEnabled
          ? [{ id: 'anime', title: 'Anime', icon: 'sparkles', screen: 'vod-collection' }]
          : []),
        ...(preferences.mangaEnabled
          ? [{ id: 'manga', title: 'Manga', icon: 'document-text', screen: 'vod-collection' }]
          : []),
        ...(preferences.musicEnabled
          ? [{ id: 'music', title: 'Music', icon: 'musical-notes', screen: 'vod-studio' }]
          : []),
        ...(preferences.sportsEnabled
          ? [{ id: 'live-sports', title: 'Live Sports', icon: 'play-circle', screen: 'player' }]
          : []),
      ],
    },
    {
      title: 'USER',
      data: [
        { id: 'watchlist', title: 'Watchlist', icon: 'bookmark', screen: 'favorites' },
        { id: 'history', title: 'History', icon: 'history', screen: 'player' },
        { id: 'favorites', title: 'Favorites', icon: 'heart', screen: 'favorites' },
      ],
    },
    {
      title: 'SYSTEM',
      data: [
        {
          id: 'notifications',
          title: 'Notifications',
          icon: 'notifications',
          screen: 'notifications',
          badge: unreadCount > 0 ? unreadCount : undefined,
        },
        { id: 'settings', title: 'Settings', icon: 'settings', screen: 'settings' },
        { id: 'legal', title: 'Legal & Policies', icon: 'document-text', screen: 'profile' },
      ],
    },
  ];

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: designTokens.colors.background,
    },
    header: {
      paddingHorizontal: designTokens.spacing.lg,
      paddingVertical: designTokens.spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: designTokens.colors.border,
    },
    title: {
      ...designTokens.typography.heading2,
      color: designTokens.colors.textPrimary,
      marginBottom: designTokens.spacing.md,
    },
    moduleToggles: {
      gap: designTokens.spacing.sm,
    },
    moduleToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: designTokens.spacing.sm,
      paddingHorizontal: designTokens.spacing.md,
      backgroundColor: designTokens.colors.surface,
      borderRadius: designTokens.radius.md,
      borderWidth: 1,
      borderColor: designTokens.colors.border,
    },
    moduleToggleLabel: {
      ...designTokens.typography.body,
      color: designTokens.colors.textPrimary,
      flex: 1,
      fontWeight: '500',
    },
    modulesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: designTokens.spacing.sm,
    },

    // Menu list
    menuContent: {
      flex: 1,
    },
    sectionHeader: {
      paddingHorizontal: designTokens.spacing.lg,
      paddingTop: designTokens.spacing.lg,
      paddingBottom: designTokens.spacing.md,
      backgroundColor: designTokens.colors.background,
    },
    sectionTitle: {
      ...designTokens.typography.label,
      color: designTokens.colors.textTertiary,
      letterSpacing: 1,
      fontWeight: '600',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: designTokens.spacing.lg,
      paddingVertical: designTokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: designTokens.colors.border,
    },
    menuItemIcon: {
      width: 40,
      height: 40,
      borderRadius: designTokens.radius.md,
      backgroundColor: designTokens.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: designTokens.spacing.md,
    },
    menuItemContent: {
      flex: 1,
    },
    menuItemTitle: {
      ...designTokens.typography.body,
      color: designTokens.colors.textPrimary,
      fontWeight: '500',
    },
    badge: {
      minWidth: 24,
      height: 24,
      borderRadius: designTokens.radius.full,
      backgroundColor: designTokens.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: designTokens.spacing.sm,
    },
    badgeText: {
      ...designTokens.typography.labelSmall,
      color: designTokens.colors.background,
      fontWeight: '700',
    },
    chevron: {
      marginLeft: designTokens.spacing.md,
    },

    // Footer
    footer: {
      paddingHorizontal: designTokens.spacing.lg,
      paddingVertical: designTokens.spacing.lg,
      borderTopWidth: 1,
      borderTopColor: designTokens.colors.border,
    },
    footerText: {
      ...designTokens.typography.labelSmall,
      color: designTokens.colors.textTertiary,
      textAlign: 'center',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>

        <View style={styles.moduleToggles}>
          {preferences.sportsEnabled !== undefined && (
            <TouchableOpacity
              style={styles.moduleToggle}
              onPress={() => toggleModule('sportsEnabled')}
            >
              <Ionicons
                name={preferences.sportsEnabled ? 'eye' : 'eye-off'}
                size={20}
                color={
                  preferences.sportsEnabled ? designTokens.colors.primary : designTokens.colors.textTertiary
                }
              />
              <Text style={styles.moduleToggleLabel}>Sports</Text>
              <Switch
                value={preferences.sportsEnabled}
                onValueChange={() => toggleModule('sportsEnabled')}
                trackColor={{ false: designTokens.colors.surface, true: designTokens.colors.primaryDark }}
                thumbColor={preferences.sportsEnabled ? designTokens.colors.primary : designTokens.colors.textTertiary}
              />
            </TouchableOpacity>
          )}

          {preferences.moviesEnabled !== undefined && (
            <TouchableOpacity
              style={styles.moduleToggle}
              onPress={() => toggleModule('moviesEnabled')}
            >
              <Ionicons
                name={preferences.moviesEnabled ? 'eye' : 'eye-off'}
                size={20}
                color={
                  preferences.moviesEnabled ? designTokens.colors.primary : designTokens.colors.textTertiary
                }
              />
              <Text style={styles.moduleToggleLabel}>Movies</Text>
              <Switch
                value={preferences.moviesEnabled}
                onValueChange={() => toggleModule('moviesEnabled')}
                trackColor={{ false: designTokens.colors.surface, true: designTokens.colors.primaryDark }}
                thumbColor={preferences.moviesEnabled ? designTokens.colors.primary : designTokens.colors.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <SectionList
        sections={menuSections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => item.screen && handleNavigate(item.screen)}
          >
            <View style={styles.menuItemIcon}>
              <Ionicons name={item.icon as any} size={20} color={designTokens.colors.primary} />
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>{item.title}</Text>
            </View>
            {item.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {typeof item.badge === 'number' && item.badge > 9 ? '9+' : item.badge}
                </Text>
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={20}
              color={designTokens.colors.textTertiary}
              style={styles.chevron}
            />
          </TouchableOpacity>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        contentContainerStyle={{ flexGrow: 1 }}
        scrollIndicatorInsets={{ right: 1 }}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>NEXORA © 2024</Text>
      </View>
    </SafeAreaView>
  );
}
