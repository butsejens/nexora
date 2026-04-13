/**
 * Search Tab Screen
 */

import { SearchTab } from "@/features/search/SearchTab";
import React from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchMatch,
  prefetchTeam,
  prefetchPlayer,
} from "@/services/data-orchestrator";
import { usePageOnlyDebug } from "@/hooks/usePageOnlyDebug";

export default function SearchScreen() {
  const queryClient = useQueryClient();
  usePageOnlyDebug("search-tab");
  return (
    <SearchTab
      onSelectResult={(result) => {
        const teamName = String(result.title || "").trim();
        const teamId =
          String(result.teamId || result.id || "").trim() ||
          (teamName ? `name:${encodeURIComponent(teamName)}` : "");
        const teamEspnLeague = String(result.espnLeague || "").trim();
        // Navigate to detail based on type
        switch (result.type) {
          case "team":
            prefetchTeam(queryClient, {
              teamId,
              sport: result.sportKey || "soccer",
              league: teamEspnLeague || "eng.1",
              teamName,
            });
            router.push({
              pathname: "/team-detail",
              params: {
                teamId,
                teamName,
                league: result.league || teamEspnLeague || "eng.1",
                espnLeague: teamEspnLeague || "eng.1",
                sport: result.sportKey || "soccer",
              },
            });
            break;
          case "match":
            prefetchMatch(queryClient, {
              matchId: String(result.matchId || result.id || ""),
              espnLeague: result.espnLeague || "eng.1",
              sport: result.sportKey || "soccer",
              homeTeam: result.homeTeam || "Home",
              awayTeam: result.awayTeam || "Away",
              homeTeamLogo: result.homeTeamLogo || "",
              awayTeamLogo: result.awayTeamLogo || "",
            });
            router.push({
              pathname: "/match-detail",
              params: {
                matchId: result.matchId || result.id,
                homeTeam: result.homeTeam || "Home",
                awayTeam: result.awayTeam || "Away",
                homeTeamLogo: result.homeTeamLogo || "",
                awayTeamLogo: result.awayTeamLogo || "",
                league: result.league || "Competition",
                espnLeague: result.espnLeague || "eng.1",
                status: result.status || "upcoming",
                minute: result.minute || "",
                sport: result.sportKey || "soccer",
                venue: String(result.venue || ""),
              },
            });
            break;
          case "series":
          case "movie": {
            const rawId = result.id;
            const prefix = result.type === "movie" ? "tmdb_m_" : "tmdb_s_";
            const detailId = rawId.startsWith("tmdb_")
              ? rawId
              : `${prefix}${rawId}`;
            router.push({
              pathname: "/detail",
              params: { id: detailId, type: result.type, title: result.title },
            });
            break;
          }
          case "competition":
            router.push({
              pathname: "/competition",
              params: {
                league: result.title,
                espnLeague: result.espnLeague || "eng.1",
                sport: result.sportKey || "soccer",
              },
            });
            break;
          case "player":
            prefetchPlayer(queryClient, {
              playerId: String(result.id || ""),
              name: result.title,
              team: result.subtitle || "",
              league: result.espnLeague || result.league || "eng.1",
            });
            router.push({
              pathname: "/player-profile",
              params: {
                playerId: result.id,
                name: result.title,
                team: result.subtitle || "",
                league: result.espnLeague || result.league || "eng.1",
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
