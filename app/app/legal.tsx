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

const LEGAL_SECTIONS = [
  {
    title: "Content & Rights",
    body:
      "Nexora indexes metadata and third-party sources. Copyright and related rights remain with the original owners and licensors. Where required, access to content may be restricted, removed, or geo-limited.",
  },
  {
    title: "Belgium / EU Notice & Action",
    body:
      "For users in Belgium and the EEA, Nexora processes rights complaints under an EU-style notice-and-action workflow. Notices are reviewed without undue delay and may lead to temporary disablement while assessment is ongoing.",
  },
  {
    title: "DMCA / Copyright Notice",
    body:
      "A valid takedown notice should include: (1) identification of the protected work, (2) the exact title/URL/in-app path, (3) claimant name and contact details, (4) good-faith statement, and (5) declaration of accuracy and authority under penalty of perjury.",
  },
  {
    title: "Counter-Notice",
    body:
      "If you believe a takedown was incorrect, you may submit a counter-notice with your identity and contact details, the removed item identification, and a statement explaining why restoration is justified. We may restore access when legally permitted.",
  },
  {
    title: "Repeat Infringer Policy",
    body:
      "Accounts repeatedly linked to substantiated infringement reports may face escalating measures, including content removal, feature limits, suspension, or termination.",
  },
  {
    title: "Required Contact Details",
    body:
      "Rights-holder notices should include a reachable email address and optional legal representative details. If information is incomplete, Nexora may request clarification before action.",
  },
  {
    title: "Privacy & Data Use",
    body:
      "Watch history, follows, and preference signals are processed to provide recommendations, alerts, quality monitoring, and fraud prevention. Processing is limited to service operation and legitimate safety/compliance needs.",
  },
  {
    title: "Data Subject Rights (GDPR)",
    body:
      "Users in Belgium and the EEA can request access, correction, deletion, restriction, portability, and objection where applicable. You may also lodge a complaint with your supervisory authority.",
  },
  {
    title: "Jurisdiction & Compliance",
    body:
      "This page is provided for transparency and operational compliance and does not replace formal legal advice. Final processing of notices depends on applicable law, including Belgian and EU requirements.",
  },
];

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
        {LEGAL_SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
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
