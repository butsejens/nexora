/**
 * Search Tab Screen
 */

import { SearchTab } from '@/features/search/SearchTab';
import React from 'react';
import { router } from 'expo-router';

export default function SearchScreen() {
  return (
    <SearchTab
      onSelectResult={(result) => {
        // Navigate to detail based on type
        switch (result.type) {
          case 'team':
            router.push(`/team-detail?id=${result.id}`);
            break;
          case 'match':
            router.push(`/match-detail?id=${result.id}`);
            break;
          case 'show':
          case 'movie':
            router.push(`/detail?id=${result.id}&type=${result.type}`);
            break;
          case 'competition':
            router.push(`/competition?id=${result.id}`);
            break;
          default:
            break;
        }
      }}
    />
  );
}
