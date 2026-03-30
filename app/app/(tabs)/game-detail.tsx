import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getMatchDetail } from "../../lib/services/sports-service";

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "game-detail", id],
    queryFn: () => getMatchDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <ActivityIndicator style={styles.centered} size="large" />;
  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>Fout bij laden van wedstrijd.</Text>
      <Text onPress={() => refetch()} style={styles.retryText}>Opnieuw proberen</Text>
    </View>
  );
  if (!data) return <View style={styles.centered}><Text>Wedstrijd niet gevonden.</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.teams}>{data.match.homeTeam.name} - {data.match.awayTeam.name}</Text>
      <Text style={styles.status}>{data.match.status} | {data.match.startTime?.replace("T", " ")}</Text>
      <Text style={styles.score}>{data.match.score.home} - {data.match.score.away}</Text>
      <Text style={styles.section}>Details</Text>
      <Text>Venue: {data.match.venue || "-"}</Text>
      <Text>Competition: {String(data.match.competition || "-")}</Text>
      {/* Add more details as needed */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "red", marginBottom: 8 },
  retryText: { color: "#333", textDecorationLine: "underline" },
  teams: { fontWeight: "bold", fontSize: 20 },
  status: { color: "#888", marginTop: 4 },
  score: { fontSize: 28, fontWeight: "bold", marginTop: 8 },
  section: { marginTop: 20, fontWeight: "bold", fontSize: 16 },
});
