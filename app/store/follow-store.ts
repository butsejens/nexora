/**
 * Follow & Notification System
 * Persistent storage of followed teams, matches, shows
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FollowedItem {
  id: string;
  type: 'team' | 'match' | 'competition' | 'show' | 'player';
  name: string;
  image?: string;
  sport?: string;
  followedAt: number;
}

export interface Notification {
  id: string;
  type: 'match_start' | 'goal' | 'match_end' | 'new_episode' | 'watchlist_reminder';
  title: string;
  message: string;
  itemId: string;
  itemType: 'match' | 'show' | 'movie';
  read: boolean;
  timestamp: number;
  data?: Record<string, any>;
}

interface FollowStore {
  followed: FollowedItem[];
  notifications: Notification[];
  isLoading: boolean;

  // Follow operations
  initializeFollows: () => Promise<void>;
  addFollow: (item: FollowedItem) => Promise<void>;
  removeFollow: (itemId: string) => Promise<void>;
  isFollowed: (itemId: string) => boolean;
  getFollowedByType: (type: FollowedItem['type']) => FollowedItem[];

  // Notification operations
  initializeNotifications: () => Promise<void>;
  addNotification: (notification: Notification) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  getUnreadCount: () => number;
}

export const useFollowStore = create<FollowStore>()(
  persist(
    (set, get) => ({
      followed: [],
      notifications: [],
      isLoading: true,

      initializeFollows: async () => {
        try {
          const stored = await AsyncStorage.getItem('nexora_follows');
          if (stored) {
            const parsed = JSON.parse(stored);
            set({ followed: parsed, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Failed to load follows:', error);
          set({ isLoading: false });
        }
      },

      addFollow: async (item) => {
        const current = get().followed;
        if (!current.find((f) => f.id === item.id)) {
          const updated = [{ ...item, followedAt: Date.now() }, ...current];
          set({ followed: updated });
          try {
            await AsyncStorage.setItem('nexora_follows', JSON.stringify(updated));
          } catch (error) {
            console.error('Failed to save follow:', error);
          }
        }
      },

      removeFollow: async (itemId) => {
        const current = get().followed;
        const updated = current.filter((f) => f.id !== itemId);
        set({ followed: updated });
        try {
          await AsyncStorage.setItem('nexora_follows', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to remove follow:', error);
        }
      },

      isFollowed: (itemId) => {
        return get().followed.some((f) => f.id === itemId);
      },

      getFollowedByType: (type) => {
        return get().followed.filter((f) => f.type === type);
      },

      initializeNotifications: async () => {
        try {
          const stored = await AsyncStorage.getItem('nexora_notifications');
          if (stored) {
            const parsed = JSON.parse(stored);
            set({ notifications: parsed });
          }
        } catch (error) {
          console.error('Failed to load notifications:', error);
        }
      },

      addNotification: async (notification) => {
        const current = get().notifications;
        const updated = [notification, ...current].slice(0, 100); // Keep last 100
        set({ notifications: updated });
        try {
          await AsyncStorage.setItem('nexora_notifications', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to save notification:', error);
        }
      },

      markAsRead: async (notificationId) => {
        const current = get().notifications;
        const updated = current.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        );
        set({ notifications: updated });
        try {
          await AsyncStorage.setItem('nexora_notifications', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to mark notification as read:', error);
        }
      },

      markAllAsRead: async () => {
        const current = get().notifications;
        const updated = current.map((n) => ({ ...n, read: true }));
        set({ notifications: updated });
        try {
          await AsyncStorage.setItem('nexora_notifications', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to mark all as read:', error);
        }
      },

      deleteNotification: async (notificationId) => {
        const current = get().notifications;
        const updated = current.filter((n) => n.id !== notificationId);
        set({ notifications: updated });
        try {
          await AsyncStorage.setItem('nexora_notifications', JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to delete notification:', error);
        }
      },

      clearAllNotifications: async () => {
        set({ notifications: [] });
        try {
          await AsyncStorage.setItem('nexora_notifications', JSON.stringify([]));
        } catch (error) {
          console.error('Failed to clear notifications:', error);
        }
      },

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.read).length;
      },
    }),
    {
      name: 'nexora-follows',
    }
  )
);
