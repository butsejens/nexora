import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";

export default function LiveTvScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <LinearGradient
            colors={["rgba(239,68,68,0.92)", "rgba(15,23,42,0.92)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroInner}>
            <Ionicons name="construct-outline" size={34} color="#fff" />
            <Text style={styles.title}>Live TV tijdelijk niet beschikbaar</Text>
            <Text style={styles.subtitle}>
              We zijn Live TV aan het verbeteren. Deze sectie is momenteel in opbouw en komt snel terug.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
  },
  hero: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: COLORS.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  heroInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 22,
  },
  title: {
    color: "#fff",
    textAlign: "center",
    fontSize: 24,
    lineHeight: 30,
    fontFamily: "Inter_800ExtraBold",
  },
  subtitle: {
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
});
