/**
 * Notifications Screen - Route accessible from tab + More menu
 */

import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { NotificationCenter } from '@/components/NotificationCenter';

export default function NotificationsScreen() {
  return (
    <NotificationCenter
      onClose={() => router.back()}
      onNavigate={(screen, params) => {
        router.push({
          pathname: screen,
          params,
        });
      }}
    />
  );
}
