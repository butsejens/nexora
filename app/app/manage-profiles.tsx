/**
 * Nexora — Manage Profiles screen
 * VTM GO / Netflix style profile management.
 */
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import {
  useProfileStore,
  NexoraProfile,
  AVATAR_COLORS,
} from "@/store/profileStore";

type Gender = "man" | "vrouw" | "x";

type EditState = {
  id: string | null;
  name: string;
  color: string;
  isKids: boolean;
  birthdate: string;
  gender: Gender | null;
};

const EMPTY_EDIT: EditState = {
  id: null,
  name: "",
  color: AVATAR_COLORS[2], // cobalt
  isKids: false,
  birthdate: "",
  gender: null,
};

function getInitial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export default function ManageProfilesScreen() {
  const insets = useSafeAreaInsets();
  const { profiles, addProfile, updateProfile, deleteProfile } =
    useProfileStore();
  const [editing, setEditing] = useState<EditState | null>(null);

  function openAdd() {
    setEditing({ ...EMPTY_EDIT });
  }

  function openEdit(p: NexoraProfile) {
    setEditing({
      id: p.id,
      name: p.name,
      color: p.avatarColor,
      isKids: p.isKids,
      birthdate: (p as any).birthdate ?? "",
      gender: (p as any).gender ?? null,
    });
  }

  function handleSave() {
    if (!editing || !editing.name.trim()) return;
    const data = {
      name: editing.name.trim(),
      avatarEmoji: getInitial(editing.name), // letter-based
      avatarColor: editing.color,
      isKids: editing.isKids,
      birthdate: editing.birthdate.trim(),
      gender: editing.gender,
    };
    if (editing.id) {
      updateProfile(editing.id, data);
    } else {
      addProfile(data);
    }
    setEditing(null);
  }

  function handleDelete(id: string) {
    Alert.alert("Profiel verwijderen", "Wil je dit profiel verwijderen?", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: () => deleteProfile(id),
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (editing ? setEditing(null) : router.back())}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {editing
            ? editing.id
              ? "Bewerk kijkprofiel"
              : "Nieuw profiel"
            : "Profielen beheren"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {editing ? (
        /* ── VTM GO–style Edit Form ── */
        <ScrollView
          contentContainerStyle={[
            styles.formScroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.formSubtitle}>
            Maak tot 5 profielen (max. 2 volwassenen)
          </Text>

          {/* Naam */}
          <Text style={styles.fieldLabel}>Naam</Text>
          <TextInput
            value={editing.name}
            onChangeText={(t) => setEditing((e) => e && { ...e, name: t })}
            style={styles.textInput}
            placeholder="Naam invoeren"
            placeholderTextColor={COLORS.textFaint}
            maxLength={24}
            autoFocus
          />

          {/* Geboortedatum */}
          <Text style={styles.fieldLabel}>Geboortedatum (dd/mm/jjjj)</Text>
          <TextInput
            value={editing.birthdate}
            onChangeText={(t) => setEditing((e) => e && { ...e, birthdate: t })}
            style={styles.textInput}
            placeholder="dd/mm/jjjj"
            placeholderTextColor={COLORS.textFaint}
            keyboardType="numeric"
            maxLength={10}
          />

          {/* Aanspreking */}
          <Text style={styles.fieldLabel}>Aanspreking</Text>
          <View style={styles.genderRow}>
            {(["man", "vrouw", "x"] as const).map((g) => (
              <Pressable
                key={g}
                style={[
                  styles.genderBtn,
                  editing.gender === g && styles.genderBtnActive,
                ]}
                onPress={() => setEditing((e) => e && { ...e, gender: g })}
              >
                <Text
                  style={[
                    styles.genderBtnText,
                    editing.gender === g && styles.genderBtnTextActive,
                  ]}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Kleur — VTM GO style circles with letter initial */}
          <Text style={styles.fieldLabel}>Selecteer je kleur</Text>
          <View style={styles.colorGrid}>
            {AVATAR_COLORS.map((col) => (
              <Pressable
                key={col}
                onPress={() => setEditing((e) => e && { ...e, color: col })}
                style={[
                  styles.colorCircle,
                  { backgroundColor: col },
                  editing.color === col && styles.colorCircleActive,
                ]}
              >
                <Text style={styles.colorCircleLetter}>
                  {getInitial(editing.name)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Kinderprofiel toggle */}
          <Pressable
            style={styles.toggleRow}
            onPress={() => setEditing((e) => e && { ...e, isKids: !e.isKids })}
          >
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleLabel}>Kinderprofiel</Text>
              <Text style={styles.toggleSub}>
                Beperkt tot kindvriendelijke content
              </Text>
            </View>
            <View
              style={[
                styles.toggleTrack,
                editing.isKids && styles.toggleTrackOn,
              ]}
            >
              <View
                style={[
                  styles.toggleThumb,
                  editing.isKids && styles.toggleThumbOn,
                ]}
              />
            </View>
          </Pressable>

          {/* Actions — VTM GO style: primary + secondary full-width */}
          <Pressable
            style={[
              styles.primaryBtn,
              !editing.name.trim() && { opacity: 0.5 },
            ]}
            onPress={handleSave}
            disabled={!editing.name.trim()}
          >
            <Text style={styles.primaryBtnText}>
              {editing.id ? "Kijkprofiel aanpassen" : "Profiel aanmaken"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => setEditing(null)}
          >
            <Text style={styles.secondaryBtnText}>Annuleer</Text>
          </Pressable>
        </ScrollView>
      ) : (
        /* ── Profiles list ── */
        <ScrollView
          contentContainerStyle={[
            styles.listScroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {profiles.map((profile, i) => (
            <Animated.View
              key={profile.id}
              entering={FadeInDown.delay(i * 60).springify()}
            >
              <View style={styles.profileRow}>
                <View
                  style={[
                    styles.rowAvatar,
                    { backgroundColor: profile.avatarColor },
                  ]}
                >
                  <Text style={styles.rowAvatarLetter}>
                    {getInitial(profile.name)}
                  </Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{profile.name}</Text>
                  {profile.isKids && (
                    <Text style={styles.rowKids}>Kinderprofiel</Text>
                  )}
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.rowAction,
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => openEdit(profile)}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={18}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                  {profiles.length > 1 && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowAction,
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={() => handleDelete(profile.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={COLORS.error}
                      />
                    </Pressable>
                  )}
                </View>
              </View>
            </Animated.View>
          ))}

          {/* Add profile button */}
          {profiles.length < 6 && (
            <Pressable
              style={({ pressed }) => [
                styles.addBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={openAdd}
            >
              <Ionicons
                name="add-circle-outline"
                size={22}
                color={COLORS.accent}
              />
              <Text style={styles.addBtnText}>Profiel toevoegen</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  listScroll: { padding: 16, gap: 8 },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  rowAvatar: {
    width: 50,
    height: 50,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatarEmoji: { fontSize: 26 },
  rowInfo: { flex: 1, gap: 3 },
  rowName: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  rowKids: { color: COLORS.new, fontSize: 12, fontFamily: "Inter_500Medium" },
  rowActions: { flexDirection: "row", gap: 6 },
  rowAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 16,
    marginTop: 6,
  },
  addBtnText: {
    color: COLORS.accent,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  // Form
  formScroll: { padding: 24, gap: 18 },
  formSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
    marginBottom: -6,
  },
  textInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // Gender buttons
  genderRow: { flexDirection: "row", gap: 10 },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  genderBtnActive: {
    borderColor: COLORS.text,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  genderBtnText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  genderBtnTextActive: { color: COLORS.text },
  // Color circles
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  colorCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorCircleActive: { borderColor: "#fff" },
  colorCircleLetter: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Inter_800ExtraBold",
  },
  // Row avatar (list view)
  rowAvatarLetter: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
  },
  // Toggle
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleLeft: { flex: 1, gap: 3 },
  toggleLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  toggleSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  toggleTrack: {
    width: 48,
    height: 27,
    borderRadius: 99,
    backgroundColor: COLORS.cardElevated,
    padding: 3,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleTrackOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  toggleThumb: {
    width: 21,
    height: 21,
    borderRadius: 99,
    backgroundColor: COLORS.textMuted,
  },
  toggleThumbOn: { backgroundColor: "#fff", alignSelf: "flex-end" },
  // Action buttons — VTM GO full-width style
  primaryBtn: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#111", fontSize: 16, fontFamily: "Inter_700Bold" },
  secondaryBtn: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
