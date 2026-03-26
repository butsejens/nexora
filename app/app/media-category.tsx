import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const P = {
  bg: "#09090D",
  card: "#161621",
  text: "#FFFFFF",
  muted: "#9D9DAA",
  accent: "#E50914",
  border: "rgba(255,255,255,0.09)",
};

export default function MediaCategoryScreen() {
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const category = String(type || "media");

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 18 }]}> 
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={20} color={P.text} />
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.kicker}>NEXORA</Text>
        <Text style={styles.title}>{category.toUpperCase()}</Text>
        <Text style={styles.subtitle}>
          This module is available through Search and personalized rails. A dedicated {category} home rail will be expanded in a future update.
        </Text>

        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push("/(tabs)/search")}
          activeOpacity={0.85}
        >
          <Ionicons name="search" size={16} color={P.bg} />
          <Text style={styles.ctaText}>Open Search</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
    paddingHorizontal: 18,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.card,
    padding: 20,
    gap: 10,
  },
  kicker: {
    color: P.accent,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: "Inter_700Bold",
  },
  title: {
    color: P.text,
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.2,
  },
  subtitle: {
    color: P.muted,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "Inter_500Medium",
  },
  cta: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: P.accent,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: {
    color: P.bg,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
