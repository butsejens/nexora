import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const P = {
  bg: "#09090D",
  card: "#14141D",
  text: "#FFFFFF",
  muted: "#A0A0AE",
  accent: "#E50914",
  border: "rgba(255,255,255,0.09)",
};

export default function LegalScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}> 
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={P.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Legal / DMCA</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Content Policy</Text>
          <Text style={styles.body}>
            NEXORA indexes third-party streams and metadata. Rights remain with the respective owners. Report content concerns to support for rapid review.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DMCA Notice</Text>
          <Text style={styles.body}>
            To submit a takedown notice, include identification of the copyrighted work, specific URL or title, your contact details, and a statement of good-faith use.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <Text style={styles.body}>
            Follow and personalization data are used only to improve recommendations and alerts for your account experience.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
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
  },
  title: {
    color: P.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  content: {
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.card,
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    color: P.accent,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontFamily: "Inter_700Bold",
  },
  body: {
    color: P.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
});
