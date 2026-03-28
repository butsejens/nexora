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
        const teamName = String(result.title || '').trim();
        const teamId = String(result.teamId || result.id || '').trim() || (teamName ? `name:${encodeURIComponent(teamName)}` : '');
        const teamEspnLeague = String(result.espnLeague || '').trim();
        // Navigate to detail based on type
        switch (result.type) {
          case 'team':
            router.push({
              pathname: '/team-detail',
              params: {
                teamId,
                teamName,
                league: result.league || teamEspnLeague || 'eng.1',
                espnLeague: teamEspnLeague || 'eng.1',
                sport: result.sportKey || 'soccer',
              },
            });
            break;
          case 'match':
            router.push({
              pathname: '/match-detail',
              params: {
                matchId: result.matchId || result.id,
                homeTeam: result.homeTeam || 'Home',
                awayTeam: result.awayTeam || 'Away',
                homeTeamLogo: result.homeTeamLogo || '',
                awayTeamLogo: result.awayTeamLogo || '',
                league: result.league || 'Competition',
                espnLeague: result.espnLeague || 'eng.1',
                status: result.status || 'upcoming',
                minute: result.minute || '',
                sport: result.sportKey || 'soccer',
              },
            });
            break;
          case 'series':
          case 'movie':
            router.push({ pathname: '/detail', params: { id: result.id, type: result.type, title: result.title } });
            break;
          case 'competition':
            router.push({
              pathname: '/competition',
              params: {
                league: result.title,
                espnLeague: result.espnLeague || 'eng.1',
                sport: result.sportKey || 'soccer',
              },
            });
            break;
          case 'player':
            router.push({
              pathname: '/player-profile',
              params: {
                playerId: result.id,
                name: result.title,
                team: result.subtitle || '',
                league: result.espnLeague || result.league || 'eng.1',
              },
            });
            break;
          case 'channel':
            router.push({
              pathname: '/detail',
              params: {
                id: result.id,
                type: 'movie',
                title: result.title,
                isIptv: 'true',
                streamUrl: '',
              },
            });
            break;
          default:
            break;
        }
      }}
    />
  );
}
