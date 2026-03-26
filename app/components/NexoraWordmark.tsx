import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function NexoraWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.n, compact ? styles.nCompact : null]}>N</Text>
      <Text style={[styles.word, compact ? styles.wordCompact : null]}>EXORA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  n: {
    color: "#E50914",
    fontSize: 90,
    fontWeight: "900",
    textShadowColor: "rgba(229,9,20,0.4)",
    textShadowRadius: 20,
  },
  nCompact: {
    fontSize: 64,
    textShadowRadius: 14,
  },
  word: {
    color: "#F5F5F7",
    fontSize: 72,
    fontWeight: "800",
    letterSpacing: 6,
  },
  wordCompact: {
    fontSize: 48,
    letterSpacing: 4,
  },
});