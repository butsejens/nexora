/**
 * Nexora — Select Profile screen
 * Full-screen profile picker shown on first launch / logout.
 * VTM GO / Netflix style.
 */
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "@/constants/colors";
import { useProfileStore, NexoraProfile } from "@/store/profileStore";

export default function SelectProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profiles, setActiveProfile } = useProfileStore();
  const [selecting, setSelecting] = useState<string | null>(null);

  function handleSelect(profile: NexoraProfile) {
    setSelecting(profile.id);
    setActiveProfile(profile.id);
    setTimeout(() => {
      router.replace("/(tabs)/home");
    }, 240);
  }

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={[COLORS.surface, COLORS.background]}
        locations={[0, 0.6]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Subtle accent glow at top */}
      <View style={[styles.glowCircle, { top: -160 }]} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Animated.View entering={FadeIn.delay(60)} style={styles.logoRow}>
          <Text style={styles.logoText}>
            <Text style={styles.logoAccent}>N</Text>EXORA
          </Text>
        </Animated.View>

        {/* Heading */}
        <Animated.View
          entering={FadeInDown.delay(120).springify()}
          style={styles.headingBlock}
        >
          <Text style={styles.heading}>Wie kijkt er?</Text>
          <Text style={styles.subheading}>
            Kies een profiel om verder te gaan
          </Text>
        </Animated.View>

        {/* Profiles grid */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.grid}
        >
          {profiles.map((profile, i) => (
            <Animated.View
              key={profile.id}
              entering={FadeInDown.delay(200 + i * 80).springify()}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.profileCard,
                  (pressed || selecting === profile.id) &&
                    styles.profileCardPressed,
                ]}
                onPress={() => handleSelect(profile)}
              >
                <View
                  style={[
                    styles.avatarCircle,
                    { backgroundColor: profile.avatarColor },
                    selecting === profile.id && styles.avatarCircleSelected,
                  ]}
                >
                  <Text style={styles.avatarEmoji}>
                    {(profile.name.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                  {selecting === profile.id && (
                    <View style={styles.selectingOverlay}>
                      <Ionicons name="checkmark" size={28} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.profileName}>{profile.name}</Text>
                {profile.isKids && (
                  <View style={styles.kidsBadge}>
                    <Text style={styles.kidsBadgeText}>Kids</Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          ))}

          {/* Add profile */}
          <Animated.View
            entering={FadeInDown.delay(200 + profiles.length * 80).springify()}
          >
            <Pressable
              style={({ pressed }) => [
                styles.profileCard,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push("/manage-profiles")}
            >
              <View style={[styles.avatarCircle, styles.addCircle]}>
                <Ionicons name="add" size={32} color={COLORS.textMuted} />
              </View>
              <Text style={[styles.profileName, { color: COLORS.textMuted }]}>
                Profiel toevoegen
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* Manage profiles link */}
        <Animated.View
          entering={FadeInDown.delay(500)}
          style={styles.manageRow}
        >
          <Pressable
            style={({ pressed }) => [
              styles.manageBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => router.push("/manage-profiles")}
          >
            <Ionicons
              name="pencil-outline"
              size={16}
              color={COLORS.textMuted}
            />
            <Text style={styles.manageBtnText}>Profielen beheren</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const CARD_SIZE = 88;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glowCircle: {
    position: "absolute",
    left: "50%",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: COLORS.accentGlowStrong,
    transform: [{ translateX: -200 }],
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 32,
  },
  logoRow: {
    alignItems: "center",
  },
  logoText: {
    color: COLORS.text,
    fontSize: 28,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 4,
  },
  logoAccent: {
    color: COLORS.accent,
  },
  headingBlock: {
    alignItems: "center",
    gap: 8,
  },
  heading: {
    color: COLORS.text,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subheading: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 20,
  },
  profileCard: {
    alignItems: "center",
    gap: 10,
    width: CARD_SIZE + 20,
  },
  profileCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  avatarCircle: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: CARD_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  avatarCircleSelected: {
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatarEmoji: {
    fontSize: 38,
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
  },
  selectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: CARD_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  addCircle: {
    backgroundColor: COLORS.cardElevated,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
  },
  profileName: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  kidsBadge: {
    backgroundColor: COLORS.new,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  kidsBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  manageRow: {
    marginTop: 8,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  manageBtnText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
