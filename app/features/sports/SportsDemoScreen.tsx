import React from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getSportsHome, getCompetitionTeams, getMatchDetail, getCompetitionStandings } from "../../lib/services/sports-service";

export function SportsDemoScreen() {
  // 1. Wedstrijden van vandaag
  const { data: home, isLoading: loadingHome, error: errorHome } = useQuery({
    queryKey: ["sports", "home-demo"],
    queryFn: getSportsHome,
  });

  // 2. Teams van Eredivisie (voorbeeld)
  const { data: teams, isLoading: loadingTeams, error: errorTeams } = useQuery({
    queryKey: ["sports", "teams-demo"],
    queryFn: () => getCompetitionTeams({ espnLeague: "ned.1" }),
  });

  // 3. Standings Eredivisie
  const { data: standings, isLoading: loadingStandings, error: errorStandings } = useQuery({
    queryKey: ["sports", "standings-demo"],
    queryFn: () => getCompetitionStandings({ espnLeague: "ned.1" }),
  });

  // 4. Detail van eerste wedstrijd (indien beschikbaar)
  const firstMatchId = home?.live?.[0]?.id || home?.upcoming?.[0]?.id;
  const { data: matchDetail, isLoading: loadingDetail, error: errorDetail } = useQuery({
    queryKey: ["sports", "match-detail-demo", firstMatchId],
    queryFn: () => firstMatchId ? getMatchDetail(firstMatchId) : null,
    enabled: !!firstMatchId,
  });

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontWeight: "bold", fontSize: 20 }}>Wedstrijden vandaag</Text>
      {loadingHome && <ActivityIndicator />}
      {errorHome && <Text style={{ color: "red" }}>Fout: {String(errorHome.message || errorHome)}</Text>}
      <FlatList
        data={home?.live || home?.upcoming || []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 8 }}>
            <Text>{item.homeTeam.name} - {item.awayTeam.name}</Text>
            <Text>Status: {item.status} | {item.startTime?.slice(11, 16) || "?"}</Text>
          </View>
        )}
        ListEmptyComponent={!loadingHome ? <Text>Geen wedstrijden gevonden.</Text> : null}
        style={{}}
      />

      <Text style={{ fontWeight: "bold", fontSize: 20 }}>Teams Eredivisie</Text>
      {loadingTeams && <ActivityIndicator />}
      {errorTeams && <Text style={{ color: "red" }}>Fout: {String(errorTeams.message || errorTeams)}</Text>}
      <FlatList
        data={teams || []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Text style={{ padding: 4 }}>{item.name}</Text>
        )}
        horizontal
        style={{}}
      />

      <Text style={{ fontWeight: "bold", fontSize: 20 }}>Stand Eredivisie</Text>
      {loadingStandings && <ActivityIndicator />}
      {errorStandings && <Text style={{ color: "red" }}>Fout: {String(errorStandings.message || errorStandings)}</Text>}
      <FlatList
        data={standings || []}
        keyExtractor={item => item.team.id}
        renderItem={({ item }) => (
          <Text style={{ padding: 4 }}>{item.rank}. {item.team.name} ({item.points}p)</Text>
        )}
        style={{}}
      />

      <Text style={{ fontWeight: "bold", fontSize: 20 }}>Wedstrijd detail</Text>
      {loadingDetail && <ActivityIndicator />}
      {errorDetail && <Text style={{ color: "red" }}>Fout: {String(errorDetail.message || errorDetail)}</Text>}
      {matchDetail && (
        <View style={{ padding: 8 }}>
          <Text>{matchDetail.match.homeTeam.name} - {matchDetail.match.awayTeam.name}</Text>
          <Text>Status: {matchDetail.match.status}</Text>
          <Text>Score: {matchDetail.match.score.home} - {matchDetail.match.score.away}</Text>
          <Text>Start: {matchDetail.match.startTime?.replace("T", " ")}</Text>
        </View>
      )}
    </View>
  );
}
