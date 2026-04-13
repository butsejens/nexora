/**
 * Notifications Screen - Route accessible from tab + More menu
 */

import React from 'react';
import { router } from 'expo-router';
import { NotificationCenter } from '@/components/NotificationCenter';

export default function NotificationsScreen() {
  return (
    <NotificationCenter
      onClose={() => router.back()}
      onNavigate={(screen, params) => {
        const pathname = screen.startsWith("/") ? screen : `/${screen}`;
        router.push({
          pathname: pathname as any,
          params,
        });
      }}
    />
  );
}
