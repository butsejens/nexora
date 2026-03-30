import React from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getSportsHome } from "../../lib/services/sports-service";
import { useNavigation } from "expo-router";

export default function SportsHomeScreen() {
  const navigation = useNavigation();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "home"],
    queryFn: getSportsHome,
  });

  if (isLoading) return <ActivityIndicator style={styles.centered} size="large" />;
  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>Fout bij laden van wedstrijden.</Text>
      <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
        <Text style={styles.retryText}>Opnieuw proberen</Text>
      </TouchableOpacity>
    </View>
  );
  if (!data?.live?.length && !data?.upcoming?.length) return (
    <View style={styles.centered}><Text>Geen wedstrijden vandaag.</Text></View>
  );

  const games = [...(data.live || []), ...(data.upcoming || [])];

  return (
    <FlatList
      data={games}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("game-detail", { id: item.id })}
        >
          <Text style={styles.teams}>{item.homeTeam.name} - {item.awayTeam.name}</Text>
          <Text style={styles.status}>{item.status} | {item.startTime?.slice(11, 16) || "?"}</Text>
          {item.score ? (
            <Text style={styles.score}>{item.score.home} - {item.score.away}</Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "red", marginBottom: 8 },
  retryBtn: { padding: 8, backgroundColor: "#eee", borderRadius: 6 },
  retryText: { color: "#333" },
  list: { padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, elevation: 2 },
  teams: { fontWeight: "bold", fontSize: 16 },
  status: { color: "#888", marginTop: 4 },
  score: { fontSize: 18, fontWeight: "bold", marginTop: 4 },
});
