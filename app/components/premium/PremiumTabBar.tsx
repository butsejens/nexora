/**
 * PREMIUM TAB BAR - Floating Pill Navigation
 *
 * Modern floating navigation with glassmorphism effect.
 * Positioned above safe area with premium styling.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import { SPACING, DESIGN_COLORS, SIZES, LAYOUT } from '@/constants/design-system';

export interface TabItem {
  name: string;
  label: string;
  icon: 'home' | 'calendar' | 'tv' | 'trophy' | 'person';
}

export interface PremiumTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (tabName: string) => void;
}

export const PremiumTabBar = React.memo(
  ({ tabs, activeTab, onTabPress }: PremiumTabBarProps) => {
    const { width: screenWidth } = useWindowDimensions();

    // Calculate container width (80% of screen)
    const containerWidth = screenWidth * LAYOUT.tabBar.width - LAYOUT.tabBar.margin.horizontal;

    // Render icon based on type
    const renderIcon = (iconName: string, isActive: boolean) => {
      const color = isActive ? COLORS.accent : COLORS.textMuted;
      const size = 24;

      switch (iconName) {
        case 'home':
          return (
            <Ionicons name={isActive ? 'home' : 'home-outline'} size={size} color={color} />
          );
        case 'calendar':
          return (
            <MaterialIcons
              name={isActive ? 'calendar-month' : 'calendar-today'}
              size={size}
              color={color}
            />
          );
        case 'tv':
          return (
            <MaterialIcons
              name={isActive ? 'live-tv' : 'tv'}
              size={size}
              color={color}
            />
          );
        case 'trophy':
          return (
            <MaterialIcons
              name="emoji-events"
              size={size}
              color={color}
            />
          );
        case 'person':
          return (
            <Ionicons name={isActive ? 'person' : 'person-outline'} size={size} color={color} />
          );
        default:
          return null;
      }
    };

    return (
      <View style={styles.container}>
        <BlurView intensity={Platform.OS === 'ios' ? 90 : 85} style={styles.blurContainer}>
          <View
            style={[
              styles.tabBarInner,
              {
                width: containerWidth,
              },
            ]}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.name;

              return (
                <TouchableOpacity
                  key={tab.name}
                  onPress={() => onTabPress(tab.name)}
                  style={styles.tabButton}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconWrapper,
                      isActive && styles.iconWrapperActive,
                    ]}
                  >
                    {renderIcon(tab.icon, isActive)}
                  </View>
                  {isActive && (
                    <Text style={styles.label}>{tab.label}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    );
  }
);

PremiumTabBar.displayName = 'PremiumTabBar';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: SPACING.lg,
    pointerEvents: 'box-none',
  },

  blurContainer: {
    borderRadius: LAYOUT.tabBar.height / 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  tabBarInner: {
    height: LAYOUT.tabBar.height,
    borderWidth: 1,
    borderColor: DESIGN_COLORS.border.light,
    borderRadius: LAYOUT.tabBar.height / 2,
    backgroundColor: DESIGN_COLORS.glass,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },

  tabButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },

  iconWrapper: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: SPACING.borderRadius.circle,
  },

  iconWrapperActive: {
    backgroundColor: DESIGN_COLORS.accentGlow.subtle,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },

  label: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.accent,
    marginTop: 2,
  },
});
