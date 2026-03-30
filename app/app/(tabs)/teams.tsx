import React from "react";
import { View, Text, FlatList, Image, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getCompetitionTeams } from "../../lib/services/sports-service";

export default function TeamsScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sports", "teams"],
    queryFn: () => getCompetitionTeams({ espnLeague: "ned.1" }), // Example league
  });

  if (isLoading) return <ActivityIndicator style={styles.centered} size="large" />;
  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>Fout bij laden van teams.</Text>
      <Text onPress={() => refetch()} style={styles.retryText}>Opnieuw proberen</Text>
    </View>
  );
  if (!data?.length) return <View style={styles.centered}><Text>Geen teams gevonden.</Text></View>;

  return (
    <FlatList
      data={data}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      numColumns={2}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.logo ? (
            <Image source={{ uri: item.logo }} style={styles.logo} />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          <Text style={styles.name}>{item.name}</Text>
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
  card: { flex: 1, alignItems: "center", margin: 8, backgroundColor: "#fff", borderRadius: 10, padding: 16, elevation: 2 },
  logo: { width: 48, height: 48, borderRadius: 24, marginBottom: 8 },
  logoPlaceholder: { width: 48, height: 48, borderRadius: 24, marginBottom: 8, backgroundColor: "#eee" },
  name: { fontWeight: "bold", fontSize: 14, textAlign: "center" },
});
