import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Platform, TextInput, ScrollView, ActivityIndicator, Animated,
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
import { isTV } from "@/lib/platform";
import { fetchEPG, getCurrentProgramme } from "@/lib/epg-manager";
import type { EPGData } from "@/lib/epg-manager";
import { searchIPTV } from "@/lib/search-engine";

type IPTVTab = "live" | "movies" | "series";

// ── Channel Card (for Live TV grid) ─────────────────────────────────────────

const ChannelCard = React.memo(function ChannelCard({ channel, onPress, onLongPress, nowPlaying }: {
  channel: IPTVChannel; onPress: () => void; onLongPress: () => void; nowPlaying?: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(channel?.name || "TV", 2);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onFocus = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1.04, useNativeDriver: true, friction: 8 }).start();
  }, [scaleAnim]);
  const onBlur = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
    <TouchableOpacity
      style={[styles.channelCard, isTV && styles.channelCardTV]}
      onPress={onPress} onLongPress={onLongPress} activeOpacity={0.75}
      onFocus={onFocus} onBlur={onBlur}
    >
      <View style={[styles.channelLogo, isTV && styles.channelLogoTV]}>
        {channel.logo && !imgError ? (
          <Image source={{ uri: channel.logo }} style={isTV ? styles.channelLogoImgTV : styles.channelLogoImg} resizeMode="contain" onError={() => setImgError(true)} />
        ) : (
          <Text style={[styles.channelLogoInitials, isTV && { fontSize: 20 }]}>{initials}</Text>
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={[styles.channelName, isTV && styles.channelNameTV]} numberOfLines={1}>{channel.name}</Text>
        {nowPlaying ? (
          <Text style={styles.channelEpg} numberOfLines={1}>{nowPlaying}</Text>
        ) : (
          <Text style={[styles.channelGroup, isTV && { fontSize: 13 }]} numberOfLines={1}>{channel.group}</Text>
        )}
      </View>
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <Ionicons name="play-circle-outline" size={isTV ? 32 : 26} color={COLORS.accent} />
    </TouchableOpacity>
    </Animated.View>
  );
});

// ── VOD Card (for IPTV Movies / Series) ──────────────────────────────────────

const VODCard = React.memo(function VODCard({ channel, onPress, type }: {
  channel: IPTVChannel; onPress: () => void; type: "movie" | "series";
}) {
  const [imgError, setImgError] = useState(false);
  const poster = channel.poster || channel.logo;
  const badgeLabel = type === "movie" ? "MOVIE" : "SERIES";
  const badgeBg = type === "movie" ? "rgba(229,9,20,0.25)" : "rgba(0,120,255,0.25)";
  const badgeBorder = type === "movie" ? "rgba(229,9,20,0.7)" : "rgba(80,160,255,0.7)";
  const badgeColor = type === "movie" ? COLORS.live : "#80C4FF";
  const meta = type === "movie" && channel.year ? String(channel.year) : type === "series" && channel.seasons ? `${channel.seasons} Season${channel.seasons > 1 ? "s" : ""}` : null;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onFocus = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1.08, useNativeDriver: true, friction: 8 }).start();
  }, [scaleAnim]);
  const onBlur = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={[isTV ? styles.vodCardTV : styles.vodCard, { transform: [{ scale: scaleAnim }] }]}>
    <TouchableOpacity style={{ flex: 1 }} onPress={onPress} activeOpacity={0.78}
      onFocus={onFocus} onBlur={onBlur}
    >
      <View style={styles.vodPoster}>
        {poster && !imgError ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <LinearGradient colors={[COLORS.card, COLORS.cardElevated, COLORS.background]} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}>
            <View style={styles.vodPosterInitials}>
              <Text style={styles.vodPosterInitialsText} numberOfLines={2}>{(channel.title || channel.name || "?").slice(0, 16).toUpperCase()}</Text>
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]} start={{ x: 0, y: 0.5 }} end={{ x: 0, y: 1 }}>
          <View style={styles.vodBadgeRow}>
            <View style={[styles.vodBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
              <Text style={[styles.vodBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
      <Text style={styles.vodTitle} numberOfLines={1}>{channel.title || channel.name}</Text>
      {meta ? <Text style={styles.vodMeta} numberOfLines={1}>{meta}</Text> : null}
      {channel.group && !meta ? <Text style={styles.vodGroup} numberOfLines={1}>{channel.group}</Text> : null}
    </TouchableOpacity>
    </Animated.View>
  );
});

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <LinearGradient colors={[COLORS.card, COLORS.background]} style={styles.emptyGradient}>
        <MaterialCommunityIcons name="playlist-plus" size={56} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No IPTV Content</Text>
        <Text style={styles.emptyText}>Add an M3U playlist in Settings to load your IPTV channels, movies and series.</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/profile")}>
          <Ionicons name="add-circle-outline" size={16} color={COLORS.background} />
          <Text style={styles.emptyBtnText}>Add Playlist</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function LiveTVScreen() {
  const insets = useSafeAreaInsets();
  const { iptvChannels, isLoadingPlaylist, isChannelVisible, toggleHideChannel, hasPremium } = useNexora();
  const isPremium = hasPremium("livetv");

  const [activeTab, setActiveTab] = useState<IPTVTab>("live");
  const [selectedGroup, setSelectedGroup] = useState("All");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // ── EPG data ──────────────────────────────────────────────────────────────
  const [epgData, setEpgData] = useState<EPGData | null>(null);

  useEffect(() => {
    const epgUrl = process.env.EXPO_PUBLIC_EPG_URL;
    if (!epgUrl) return;
    let cancelled = false;
    fetchEPG(epgUrl).then(data => {
      if (!cancelled && data) setEpgData(data);
    });
    // Refresh EPG every 30 min
    const interval = setInterval(() => {
      fetchEPG(epgUrl).then(data => {
        if (!cancelled && data) setEpgData(data);
      });
    }, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const getEpgForChannel = useCallback((channel: IPTVChannel): string | null => {
    if (!epgData) return null;
    const channelId = channel.epgId || channel.name;
    const prog = getCurrentProgramme(epgData, channelId);
    return prog.now?.title || null;
  }, [epgData]);

  // Separate IPTV content by category
  const liveChannels = useMemo(
    () => iptvChannels.filter(c => c.category === "live" && isChannelVisible(c.id, c.group)),
    [iptvChannels, isChannelVisible]
  );

  const iptvMovies = useMemo(
    () => iptvChannels.filter(c => c.category === "movie" && isChannelVisible(c.id, c.group)),
    [iptvChannels, isChannelVisible]
  );

  const iptvSeries = useMemo(
    () => iptvChannels.filter(c => c.category === "series" && isChannelVisible(c.id, c.group)),
    [iptvChannels, isChannelVisible]
  );

  // Current tab data
  const currentData = activeTab === "live" ? liveChannels : activeTab === "movies" ? iptvMovies : iptvSeries;

  // Groups for current tab
  const groups = useMemo(() => {
    const set = new Set(currentData.map(c => c.group));
    return ["All", ...Array.from(set).sort()];
  }, [currentData]);

  // Filtered by group + search (uses fuzzy search engine when query present)
  const filtered = useMemo(() => {
    let list = selectedGroup === "All" ? currentData : currentData.filter(c => c.group === selectedGroup);
    if (search.trim()) {
      const results = searchIPTV(search, list);
      const matchedIds = new Set(results.map(r => r.id));
      list = list.filter(c => matchedIds.has(c.id));
    }
    return list;
  }, [currentData, selectedGroup, search]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  const playChannel = useCallback((ch: IPTVChannel) => {
    const type = activeTab === "live" ? "livetv" : activeTab === "movies" ? "movie" : "series";
    router.push({
      pathname: "/player",
      params: { streamUrl: ch.url, title: ch.title || ch.name, type, contentId: ch.id },
    });
  }, [activeTab]);

  const goToDetail = useCallback((ch: IPTVChannel) => {
    if (ch.tmdbId) {
      const type = activeTab === "movies" ? "movie" : "series";
      router.push({ pathname: "/detail", params: { id: String(ch.tmdbId), type, title: ch.title || ch.name } });
    } else {
      playChannel(ch);
    }
  }, [activeTab, playChannel]);

  const totalCount = liveChannels.length + iptvMovies.length + iptvSeries.length;

  // Tab switch resets group filter
  const switchTab = useCallback((tab: IPTVTab) => {
    setActiveTab(tab);
    setSelectedGroup("All");
    setSearch("");
    setShowSearch(false);
  }, []);

  if (!isPremium) {
    return (
      <View style={styles.container}>
        <NexoraHeader title="IPTV" showSearch={false} showFavorites showProfile
          onFavorites={() => router.push("/favorites")} onProfile={() => router.push("/profile")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <MaterialCommunityIcons name="crown" size={56} color="#FFD700" />
          <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 26, color: "#FFD700", textAlign: "center" }}>
            Premium Content
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 }}>
            IPTV channels, movies and series are exclusive to Premium members.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFD700", borderRadius: 24, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
            onPress={() => router.push("/premium")} activeOpacity={0.85}>
            <MaterialCommunityIcons name="crown" size={18} color="#000" />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" }}>Upgrade to Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NexoraHeader title="IPTV" showSearch={false} showFavorites showProfile
        onFavorites={() => router.push("/favorites")} onProfile={() => router.push("/profile")} />

      {/* IPTV Tab Bar */}
      <View style={styles.tabBar}>
        {([
          { key: "live" as IPTVTab, label: "Live TV", icon: "tv-outline", count: liveChannels.length },
          { key: "movies" as IPTVTab, label: "Movies", icon: "film-outline", count: iptvMovies.length },
          { key: "series" as IPTVTab, label: "Series", icon: "layers-outline", count: iptvSeries.length },
        ]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
            onPress={() => switchTab(tab.key)}
            activeOpacity={0.75}
          >
            <Ionicons name={tab.icon as any} size={20} color={activeTab === tab.key ? COLORS.accent : COLORS.textMuted} />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
            {tab.count > 0 && (
              <View style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, activeTab === tab.key && styles.tabCountTextActive]}>
                  {tab.count > 999 ? "999+" : tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab === "live" ? "channels" : activeTab === "movies" ? "movies" : "series"}...`}
            placeholderTextColor={COLORS.textMuted}
            value={search} onChangeText={setSearch} autoFocus
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

      {/* Group Filter + Search Toggle */}
      {!showSearch && currentData.length > 0 && (
        <View style={styles.topBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroll}>
            {groups.map(g => (
              <TouchableOpacity key={g} style={[styles.groupChip, selectedGroup === g && styles.groupChipActive]}
                onPress={() => setSelectedGroup(g)}>
                <Text style={[styles.groupChipText, selectedGroup === g && styles.groupChipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.searchIcon} onPress={() => setShowSearch(true)}>
            <Ionicons name="search" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {totalCount === 0 ? (
        isLoadingPlaylist ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted }}>Loading channels...</Text>
          </View>
        ) : <EmptyState />
      ) : activeTab === "live" ? (
        /* Live TV — row layout */
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ChannelCard channel={item} onPress={() => playChannel(item)} onLongPress={() => toggleHideChannel(item.id)}
              nowPlaying={getEpgForChannel(item)} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.noResultsText}>No channels found</Text>
            </View>
          }
          ListHeaderComponent={
            filtered.length > 0 ? <Text style={styles.countLabel}>{filtered.length} channels{search ? ` for "${search}"` : ""}</Text> : null
          }
        />
      ) : (
        /* Movies / Series — grid layout */
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          numColumns={isTV ? 4 : 3}
          key={isTV ? "tv-grid" : "mobile-grid"}
          columnWrapperStyle={styles.vodGrid}
          renderItem={({ item }) => (
            <VODCard channel={item} onPress={() => goToDetail(item)} type={activeTab === "movies" ? "movie" : "series"} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.noResultsText}>No {activeTab === "movies" ? "movies" : "series"} found</Text>
            </View>
          }
          ListHeaderComponent={
            filtered.length > 0 ? <Text style={styles.countLabel}>{filtered.length} {activeTab === "movies" ? "movies" : "series"}{search ? ` for "${search}"` : ""}</Text> : null
          }
        />
      )}

      {totalCount > 0 && (
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

  // Tab Bar
  tabBar: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  tabItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 14,
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  tabItemActive: {
    backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent,
  },
  tabLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.accent },
  tabCount: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 22, alignItems: "center",
  },
  tabCountActive: { backgroundColor: `${COLORS.accent}33` },
  tabCountText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.textMuted },
  tabCountTextActive: { color: COLORS.accent },

  // Top bar / groups
  topBar: { flexDirection: "row", alignItems: "center", paddingRight: 12, backgroundColor: COLORS.overlayLight, borderBottomWidth: 1, borderColor: COLORS.border },
  groupScroll: { paddingHorizontal: 12, paddingVertical: 10 },
  groupChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  groupChipActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  groupChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary },
  groupChipTextActive: { color: COLORS.accent, fontFamily: "Inter_600SemiBold" },
  searchIcon: { padding: 8 },

  // Search
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginVertical: 8,
    backgroundColor: COLORS.overlayLight, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },
  cancelSearch: { paddingLeft: 8 },
  cancelSearchText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.accent },

  // Content lists
  list: { paddingTop: 4 },
  countLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, paddingHorizontal: 16, paddingBottom: 8 },

  // Channel card (Live TV)
  channelCard: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 14, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.cardElevated,
  },
  channelCardTV: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18,
    marginHorizontal: 20, marginBottom: 12, gap: 16,
    borderWidth: 2, borderColor: COLORS.border, borderRadius: 20, backgroundColor: COLORS.cardElevated,
  },
  channelLogo: {
    width: 52, height: 52, borderRadius: 10, backgroundColor: COLORS.card,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    borderWidth: 1, borderColor: COLORS.border,
  },
  channelLogoTV: {
    width: 68, height: 68, borderRadius: 14,
  },
  channelLogoImg: { width: 48, height: 48 },
  channelLogoImgTV: { width: 64, height: 64 },
  channelLogoInitials: { fontFamily: "Inter_800ExtraBold", fontSize: 16, color: COLORS.accent },
  channelInfo: { flex: 1 },
  channelName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 3 },
  channelNameTV: { fontSize: 18 },
  channelGroup: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  channelEpg: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.accent, marginTop: 1 },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.liveGlow,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.live,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.live },
  liveText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.live, letterSpacing: 0.5 },

  // VOD card (Movies/Series)
  vodCard: { flex: 1, marginHorizontal: 5, marginBottom: 16, maxWidth: "33%" as any },
  vodCardTV: { flex: 1, marginHorizontal: 8, marginBottom: 20, maxWidth: "25%" as any },
  vodGrid: { paddingHorizontal: 9 },
  vodPoster: {
    aspectRatio: 2 / 3, borderRadius: 12, overflow: "hidden",
    backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)",
  },
  vodPosterInitials: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 6 },
  vodPosterInitialsText: { fontFamily: "Inter_800ExtraBold", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" },
  vodBadgeRow: { padding: 6 },
  vodBadge: {
    alignSelf: "flex-start", borderWidth: 1,
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  vodBadgeText: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 0.5 },
  vodTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.text, marginTop: 6 },
  vodMeta: { fontFamily: "Inter_500Medium", fontSize: 9, color: COLORS.accent, marginTop: 1 },
  vodGroup: { fontFamily: "Inter_400Regular", fontSize: 9, color: COLORS.textMuted, marginTop: 1 },

  // Empty / No results
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

  // Manage FAB
  manageBtn: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.accent, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: COLORS.accent, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  manageBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.background },
});
