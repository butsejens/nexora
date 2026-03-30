import React from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getCompetitionStandings } from "../../lib/services/sports-service";

export default function StandingsScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "standings"],
    queryFn: () => getCompetitionStandings({ espnLeague: "ned.1" }), // Example league
  });

  if (isLoading) return <ActivityIndicator style={styles.centered} size="large" />;
  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>Fout bij laden van stand.</Text>
      <Text onPress={() => refetch()} style={styles.retryText}>Opnieuw proberen</Text>
    </View>
  );
  if (!data?.length) return <View style={styles.centered}><Text>Geen stand gevonden.</Text></View>;

  return (
    <FlatList
      data={data}
      keyExtractor={item => item.team.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={() => (
        <View style={styles.headerRow}>
          <Text style={styles.headerCell}>#</Text>
          <Text style={styles.headerCell}>Team</Text>
          <Text style={styles.headerCell}>P</Text>
          <Text style={styles.headerCell}>W</Text>
          <Text style={styles.headerCell}>D</Text>
          <Text style={styles.headerCell}>L</Text>
          <Text style={styles.headerCell}>Pts</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.cell}>{item.rank}</Text>
          <Text style={[styles.cell, styles.teamCell]}>{item.team.name}</Text>
          <Text style={styles.cell}>{item.played}</Text>
          <Text style={styles.cell}>{item.won}</Text>
          <Text style={styles.cell}>{item.drawn}</Text>
          <Text style={styles.cell}>{item.lost}</Text>
          <Text style={styles.cell}>{item.points}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "red", marginBottom: 8 },
  retryText: { color: "#333", textDecorationLine: "underline" },
  list: { padding: 16 },
  headerRow: { flexDirection: "row", marginBottom: 8 },
  headerCell: { flex: 1, fontWeight: "bold", fontSize: 14, textAlign: "center" },
  row: { flexDirection: "row", marginBottom: 4, backgroundColor: "#fff", borderRadius: 6, padding: 8 },
  cell: { flex: 1, fontSize: 13, textAlign: "center" },
  teamCell: { flex: 2, textAlign: "left" },
});
