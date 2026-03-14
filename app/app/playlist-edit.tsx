import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";

export default function PlaylistEditScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const playlistId = String(params.playlistId || "");

  const { playlists, updatePlaylist, removePlaylist } = useNexora();

  const pl = useMemo(() => playlists.find(p => p.id === playlistId), [playlists, playlistId]);
  const [name, setName] = useState(pl?.name || "");
  const [url, setUrl] = useState(pl?.url || "");

  if (!pl) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}> 
        <Text style={styles.title}>Playlist niet gevonden</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Terug</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const onSave = () => {
    if (!name.trim()) return Alert.alert("Error", "Name is required");
    if (!url.trim()) return Alert.alert("Error", "URL is required");
    updatePlaylist(pl.id, { name: name.trim(), url: url.trim() });
    SafeHaptics.success();
    Alert.alert("Opgeslagen", "Playlist bijgewerkt.");
  };

  const onDelete = () => {
    Alert.alert("Remove", `Remove playlist '${pl.name}'?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removePlaylist(pl.id);
          SafeHaptics.impactLight();
          router.back();
        },
      },
    ]);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <View style={styles.container}>
      <NexoraHeader
        title="Playlist"
        showSearch={false}
        showNotification={false}
        showProfile={false}
        rightElement={
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textSecondary}   onProfile={() => router.push("/profile")}
      />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: bottomPad }}>
        <View style={styles.card}>
          <Text style={styles.label}>Naam</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Playlist naam"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={[styles.label, { marginTop: 12 }]}>URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            placeholder="http://.../get.php?..."
            placeholderTextColor={COLORS.textMuted}
          />

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onSave}>
              <Ionicons name="save-outline" size={16} color={COLORS.text} />
              <Text style={styles.btnText}>Opslaan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color={COLORS.text} />
              <Text style={styles.btnText}>Verwijder</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.hint}>
          Tip: Voor Xtream accounts kan je ook het Xtream tabje gebruiken in Settings → IPTV Playlists.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  title: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
  },
  label: { color: COLORS.textSecondary, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnDanger: { backgroundColor: COLORS.live },
  btnText: { color: COLORS.text, fontFamily: "Inter_700Bold" },
  hint: { marginTop: 12, color: COLORS.textMuted, fontFamily: "Inter_400Regular" },
});
