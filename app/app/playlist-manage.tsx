import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, TextInput, Platform, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";
import { useTranslation } from "@/lib/useTranslation";

type Tab = "groups" | "channels";

export default function PlaylistManageScreen() {
  const insets = useSafeAreaInsets();
  const {
    playlists,
    removePlaylist,
    iptvChannels, hiddenChannels, hiddenGroups,
    toggleHideChannel, toggleHideGroup, isChannelVisible,
  } = useNexora();
  const { t } = useTranslation();

  const [tab, setTab] = useState<Tab>("groups");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "live" | "movie" | "series">("all");

  const groups = useMemo(() => {
    const map = new Map<string, { count: number; category: string }>();
    for (const ch of iptvChannels) {
      if (categoryFilter !== "all" && ch.category !== categoryFilter) continue;
      const existing = map.get(ch.group);
      if (existing) existing.count++;
      else map.set(ch.group, { count: 1, category: ch.category });
    }
    return Array.from(map.entries())
      .map(([group, info]) => ({ group, ...info }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [iptvChannels, categoryFilter]);

  const channels = useMemo(() => {
    let list = iptvChannels;
    if (categoryFilter !== "all") list = list.filter(c => c.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
    }
    return list.slice(0, 200);
  }, [iptvChannels, categoryFilter, search]);

  const hiddenGroupCount = hiddenGroups.length;
  const hiddenChannelCount = hiddenChannels.length;

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const CATS: { key: "all" | "live" | "movie" | "series"; label: string }[] = [
    { key: "all", label: t("playlist.allFilter") },
    { key: "live", label: t("playlist.liveFilter") },
    { key: "movie", label: t("playlist.moviesFilter") },
    { key: "series", label: t("playlist.seriesFilter") },
  ];

  const handleUnhideAll = () => {
    Alert.alert(t("playlist.unhideAll"), t("playlist.unhideAllConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("playlist.unhideAll"), onPress: async () => {
          for (const id of [...hiddenChannels]) await toggleHideChannel(id);
          for (const g of [...hiddenGroups]) await toggleHideGroup(g);
          SafeHaptics.success();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("playlist.manageChannels")}</Text>
        {(hiddenGroupCount > 0 || hiddenChannelCount > 0) && (
          <TouchableOpacity onPress={handleUnhideAll} style={styles.unhideBtn}>
            <Text style={styles.unhideBtnText}>{t("playlist.unhideAll")}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statNum}>{iptvChannels.length}</Text>
          <Text style={styles.statLbl}>{t("playlist.total")}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statNum, { color: COLORS.live }]}>{hiddenGroupCount}</Text>
          <Text style={styles.statLbl}>{t("playlist.hiddenGroups")}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statNum, { color: COLORS.live }]}>{hiddenChannelCount}</Text>
          <Text style={styles.statLbl}>{t("playlist.hiddenChannels")}</Text>
        </View>
      </View>

      {/* Playlists management (add/edit/delete) */}
      <View style={styles.playlistsCard}>
        <View style={styles.playlistsHeader}>
          <Text style={styles.playlistsTitle}>{t("playlist.playlistsTitle")}</Text>
          <TouchableOpacity onPress={() => router.push("/profile")} style={styles.playlistsAddBtn}>
            <Ionicons name="add-circle-outline" size={16} color={COLORS.accent} />
            <Text style={styles.playlistsAddText}>{t("common.add")}</Text>
          </TouchableOpacity>
        </View>
        {playlists.length === 0 ? (
          <Text style={styles.playlistsEmpty}>{t("playlist.noPlaylistsYet")}</Text>
        ) : (
          playlists.map((pl) => (
            <View key={pl.id} style={styles.playlistRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.playlistName} numberOfLines={1}>{pl.name}</Text>
                <Text style={styles.playlistUrl} numberOfLines={1}>{pl.url}</Text>
                {pl.channelCount ? (
                  <Text style={styles.playlistMeta}>{t("playlist.channelMeta", { channels: pl.channelCount, live: pl.liveCount ?? 0, movies: pl.movieCount ?? 0, series: pl.seriesCount ?? 0 })}</Text>
                ) : null}
              </View>
              <View style={styles.playlistBtns}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/playlist-edit", params: { playlistId: pl.id } })}
                  style={styles.iconPill}
                >
                  <Ionicons name="create-outline" size={15} color={COLORS.accent} />
                  <Text style={styles.iconPillText}>{t("playlist.editBtn")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(t("common.remove"), t("playlist.removePlaylistConfirm", { name: pl.name }), [
                      { text: t("common.cancel"), style: "cancel" },
                      { text: t("common.remove"), style: "destructive", onPress: () => removePlaylist(pl.id) },
                    ])
                  }
                  style={[styles.iconPill, { backgroundColor: COLORS.liveGlow, borderColor: COLORS.live }]}
                >
                  <Ionicons name="trash-outline" size={15} color={COLORS.live} />
                  <Text style={[styles.iconPillText, { color: COLORS.live }]}>{t("playlist.deleteBtn")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.tabRow}>
        {(["groups", "channels"] as Tab[]).map(tb => (
          <TouchableOpacity
            key={tb}
            style={[styles.tabBtn, tab === tb && styles.tabBtnActive]}
            onPress={() => setTab(tb)}
          >
            <Text style={[styles.tabBtnText, tab === tb && styles.tabBtnTextActive]}>
              {tb === "groups" ? t("playlist.groups", { count: groups.length }) : t("playlist.channels", { count: `${channels.length}${channels.length === 200 ? "+" : ""}` })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        {CATS.map(c => (
          <TouchableOpacity
            key={c.key}
            style={[styles.catChip, categoryFilter === c.key && styles.catChipActive]}
            onPress={() => setCategoryFilter(c.key)}
          >
            <Text style={[styles.catChipText, categoryFilter === c.key && styles.catChipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "channels" && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={14} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("playlist.searchChannels")}
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {iptvChannels.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>{t("playlist.noChannels")}</Text>
          <Text style={styles.emptySubtext}>{t("playlist.addPlaylistFirst")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
          {tab === "groups" && groups.map(({ group, count }) => {
            const hidden = hiddenGroups.includes(group);
            return (
              <View key={group} style={styles.row}>
                <View style={[styles.catDot, { backgroundColor: getCatColor("live") }]} />
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, hidden && styles.rowNameHidden]} numberOfLines={1}>{group}</Text>
                  <Text style={styles.rowSub}>{t("playlist.channelCount", { count })}</Text>
                </View>
                <Switch
                  value={!hidden}
                  onValueChange={() => { SafeHaptics.impactLight(); toggleHideGroup(group); }}
                  trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                  thumbColor={!hidden ? COLORS.accent : COLORS.textMuted}
                />
              </View>
            );
          })}

          {tab === "channels" && channels.map(ch => {
            const hidden = !isChannelVisible(ch.id, ch.group);
            return (
              <View key={ch.id} style={styles.row}>
                <View style={[styles.catDot, { backgroundColor: getCatColor(ch.category) }]} />
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, hidden && styles.rowNameHidden]} numberOfLines={1}>{ch.name}</Text>
                  <Text style={styles.rowSub}>{ch.group}</Text>
                </View>
                <Switch
                  value={!hidden}
                  onValueChange={() => { SafeHaptics.impactLight(); toggleHideChannel(ch.id); }}
                  trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                  thumbColor={!hidden ? COLORS.accent : COLORS.textMuted}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function getCatColor(cat: string) {
  if (cat === "live") return COLORS.live;
  if (cat === "movie") return "#7C3AED";
  if (cat === "series") return "#059669";
  return COLORS.accent;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  unhideBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: COLORS.liveGlow, borderWidth: 1, borderColor: COLORS.live,
  },
  unhideBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.live },
  statsRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },

  playlistsCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  playlistsHeader: { flexDirection: "row", alignItems: "center" },
  playlistsTitle: { flex: 1, fontFamily: "Inter_700Bold", color: COLORS.text, fontSize: 14 },
  playlistsAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent },
  playlistsAddText: { fontFamily: "Inter_600SemiBold", color: COLORS.accent, fontSize: 12 },
  playlistsEmpty: { color: COLORS.textMuted, fontFamily: "Inter_400Regular", fontSize: 12 },
  playlistRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  playlistName: { color: COLORS.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  playlistUrl: { color: COLORS.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  playlistBtns: { flexDirection: "row", gap: 8 },
  iconPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 34, borderRadius: 10, justifyContent: "center", backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border },
  iconPillText: { fontSize: 11, fontFamily: "Inter_500Medium", color: COLORS.textSecondary },
  playlistMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: COLORS.textMuted, marginTop: 2 },
  statChip: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12,
    alignItems: "center", borderWidth: 1, borderColor: COLORS.border,
  },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.accent },
  statLbl: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  tabRow: {
    flexDirection: "row", marginHorizontal: 16, backgroundColor: COLORS.card,
    borderRadius: 12, padding: 4, borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  tabBtnActive: { backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent },
  tabBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  tabBtnTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  catChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  catChipTextActive: { color: COLORS.accent },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 10,
    backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text },
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  rowNameHidden: { color: COLORS.textMuted, textDecorationLine: "line-through" },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.textMuted },
  emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
});
