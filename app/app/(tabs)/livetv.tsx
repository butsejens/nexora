import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Platform, TextInput, ScrollView, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import type { IPTVChannel } from "@/context/NexoraContext";
import { getInitials } from "@/lib/logo-manager";

const ChannelRow = React.memo(function ChannelRow({ channel, onPress, onLongPress }: {
  channel: IPTVChannel; onPress: () => void; onLongPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(channel?.name || "TV", 2);
  return (
    <TouchableOpacity style={styles.channelRow} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.75}>
      <View style={styles.channelLogo}>
        {channel.logo && !imgError ? (
          <Image source={{ uri: channel.logo }} style={styles.channelLogoImg} resizeMode="contain" onError={() => setImgError(true)} />
        ) : (
          <Text style={styles.channelLogoInitials}>{initials}</Text>
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
        <Text style={styles.channelGroup} numberOfLines={1}>{channel.group}</Text>
      </View>
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <Ionicons name="play-circle-outline" size={26} color={COLORS.accent} />
    </TouchableOpacity>
  );
});

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <LinearGradient colors={[COLORS.card, COLORS.background]} style={styles.emptyGradient}>
        <MaterialCommunityIcons name="playlist-plus" size={56} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No Live Channels</Text>
        <Text style={styles.emptyText}>Add an M3U playlist in Settings to load your IPTV channels.</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/profile")}>
          <Ionicons name="add-circle-outline" size={16} color={COLORS.background} />
          <Text style={styles.emptyBtnText}>Add Playlist</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

export default function LiveTVScreen() {
  const insets = useSafeAreaInsets();
  const { iptvChannels, isLoadingPlaylist, isChannelVisible, toggleHideChannel, hasPremium } = useNexora();
  const isPremium = hasPremium("livetv");

  const [selectedGroup, setSelectedGroup] = useState("All");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const liveChannels = useMemo(
    () => iptvChannels.filter(c => c.category === "live" && isChannelVisible(c.id, c.group)),
    [iptvChannels, isChannelVisible]
  );

  const groups = useMemo(() => {
    const set = new Set(liveChannels.map(c => c.group));
    return ["All", ...Array.from(set).sort()];
  }, [liveChannels]);

  const filtered = useMemo(() => {
    let list = selectedGroup === "All" ? liveChannels : liveChannels.filter(c => c.group === selectedGroup);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [liveChannels, selectedGroup, search]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  const playChannel = useCallback((ch: IPTVChannel) => {
    router.push({
      pathname: "/player",
      params: { streamUrl: ch.url, title: ch.name, type: "livetv", contentId: ch.id },
    });
  }, []);

  if (!isPremium) {
    return (
      <View style={styles.container}>
        <NexoraHeader
          title="Live TV"
          showSearch={false}
          showFavorites
          showProfile
          onFavorites={() => router.push("/favorites")}
          onProfile={() => router.push("/profile")}
      />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <MaterialCommunityIcons name="crown" size={56} color="#FFD700" />
          <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 26, color: "#FFD700", textAlign: "center" }}>
            Premium Content
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 }}>
            Live TV kanalen zijn exclusief voor Premium leden. Upgrade nu voor toegang tot alle IPTV kanalen.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFD700", borderRadius: 24, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
            onPress={() => router.push("/premium")} activeOpacity={0.85}>
            <MaterialCommunityIcons name="crown" size={18} color="#000" />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" }}>Upgrade naar Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NexoraHeader
        title="Live TV"
        showSearch={false}
        showFavorites
        showProfile
        onFavorites={() => router.push("/favorites")}
        onProfile={() => router.push("/profile")}
      />

      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search channels..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearch(""); }} style={styles.cancelSearch}>
            <Text style={styles.cancelSearchText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {!showSearch && liveChannels.length > 0 && (
        <View style={styles.topBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroll}>
            {groups.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.groupChip, selectedGroup === g && styles.groupChipActive]}
                onPress={() => setSelectedGroup(g)}
              >
                <Text style={[styles.groupChipText, selectedGroup === g && styles.groupChipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.searchIcon} onPress={() => setShowSearch(true)}>
            <Ionicons name="search" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {liveChannels.length === 0 ? (
        isLoadingPlaylist ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted }}>
              Kanalen laden...
            </Text>
          </View>
        ) : <EmptyState />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              onPress={() => playChannel(item)}
              onLongPress={() => toggleHideChannel(item.id)}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!filtered.length}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.noResultsText}>No channels found</Text>
            </View>
          }
          ListHeaderComponent={
            filtered.length > 0 ? (
              <Text style={styles.countLabel}>{filtered.length} channels{search ? ` for "${search}"` : ""}</Text>
            ) : null
          }
        />
      )}

      {liveChannels.length > 0 && (
        <TouchableOpacity
          style={[styles.manageBtn, { bottom: bottomPad + 12 }]}
          onPress={() => router.push("/playlist-manage")}
        >
          <Ionicons name="options-outline" size={18} color={COLORS.background} />
          <Text style={styles.manageBtnText}>Manage</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: { flexDirection: "row", alignItems: "center", paddingRight: 12, backgroundColor: COLORS.overlayLight, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  groupScroll: { paddingHorizontal: 12, paddingVertical: 10 },
  groupChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  groupChipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  groupChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary },
  groupChipTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  searchIcon: { padding: 8 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginVertical: 8,
    backgroundColor: COLORS.overlayLight, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },
  cancelSearch: { paddingLeft: 8 },
  cancelSearchText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.accent },
  list: { paddingTop: 4 },
  countLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, paddingHorizontal: 16, paddingBottom: 8 },
  channelRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 14, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.cardElevated,
  },
  channelLogo: {
    width: 52, height: 52, borderRadius: 10, backgroundColor: COLORS.card,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    borderWidth: 1, borderColor: COLORS.border,
  },
  channelLogoImg: { width: 48, height: 48 },
  channelLogoInitials: { fontFamily: "Inter_800ExtraBold", fontSize: 16, color: COLORS.accent },
  channelInfo: { flex: 1 },
  channelName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 3 },
  channelGroup: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.liveGlow,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.live,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.live },
  liveText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.live, letterSpacing: 0.5 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyGradient: { alignItems: "center", gap: 12, padding: 32, borderRadius: 24, width: "100%" },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.background },
  noResults: { alignItems: "center", paddingTop: 60, gap: 12 },
  noResultsText: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.textMuted },
  manageBtn: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.accent, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: COLORS.accent, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  manageBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.background },
});
