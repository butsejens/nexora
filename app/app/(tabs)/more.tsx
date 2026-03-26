import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useFollowState } from "@/context/UserStateContext";

type RowItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  lib?: "ion" | "mci";
  route: string;
  disabled?: boolean;
  badge?: string;
};

const P = {
  bg: "#09090D",
  card: "#14141D",
  accent: "#E50914",
  text: "#FFFFFF",
  muted: "#9797A5",
  border: "rgba(255,255,255,0.09)",
};

function ItemRow({ item }: { item: RowItem }) {
  const disabled = Boolean(item.disabled);

  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={disabled ? undefined : () => router.push(item.route as any)}
      activeOpacity={disabled ? 1 : 0.82}
    >
      <View style={styles.iconWrap}>
        {item.lib === "mci" ? (
          <MaterialCommunityIcons name={item.icon as any} size={18} color={P.accent} />
        ) : (
          <Ionicons name={item.icon as any} size={18} color={P.accent} />
        )}
      </View>

      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
      </View>

      {item.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      ) : null}

      {!disabled && <Ionicons name="chevron-forward" size={15} color={P.muted} />}
    </TouchableOpacity>
  );
}

function Section({ title, items }: { title: string; items: RowItem[] }) {
  const visible = items.filter((item) => !item.disabled);
  if (!visible.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        {visible.map((item, index) => (
          <React.Fragment key={item.id}>
            <ItemRow item={item} />
            {index < visible.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const { followedTeams, followedMatches } = useFollowState();

  const followCount = followedTeams.length + followedMatches.length;

  const mediaItems = useMemo<RowItem[]>(
    () => [
      {
        id: "movies",
        title: "Movies",
        subtitle: "Trending films and collections",
        icon: "film-outline",
        route: "/(tabs)/movies",
        disabled: !moviesEnabled,
      },
      {
        id: "series",
        title: "TV Shows",
        subtitle: "Series and episodic rails",
        icon: "layers-outline",
        route: "/(tabs)/series",
        disabled: !moviesEnabled,
      },
      {
        id: "anime",
        title: "Anime",
        subtitle: "Curated anime recommendations",
        icon: "sparkles-outline",
        route: "/media-category?type=anime",
        disabled: !moviesEnabled,
      },
      {
        id: "manga",
        title: "Manga",
        subtitle: "Manga discovery and reads",
        icon: "book-outline",
        route: "/media-category?type=manga",
        disabled: !moviesEnabled,
      },
      {
        id: "music",
        title: "Music",
        subtitle: "Soundtracks and music picks",
        icon: "musical-notes-outline",
        route: "/media-category?type=music",
        disabled: !moviesEnabled,
      },
      {
        id: "sports",
        title: "Live Sports",
        subtitle: "Live matches and score center",
        icon: "soccer",
        lib: "mci",
        route: "/(tabs)",
        disabled: !sportsEnabled,
      },
    ],
    [moviesEnabled, sportsEnabled],
  );

  const libraryItems: RowItem[] = [
    {
      id: "watchlist",
      title: "Watchlist",
      subtitle: "Saved movies, shows and matches",
      icon: "bookmark-outline",
      route: "/favorites",
    },
    {
      id: "history",
      title: "History",
      subtitle: "Recently watched content",
      icon: "time-outline",
      route: "/profile",
    },
    {
      id: "notifications",
      title: "Notifications",
      subtitle: "Follows, alerts and match updates",
      icon: "notifications-outline",
      route: "/notifications",
      badge: followCount > 0 ? String(followCount) : undefined,
    },
  ];

  const systemItems: RowItem[] = [
    {
      id: "settings",
      title: "Settings",
      subtitle: "Modules, onboarding and preferences",
      icon: "settings-outline",
      route: "/settings",
    },
    {
      id: "legal",
      title: "Legal/DMCA",
      subtitle: "Privacy, rights and takedown policy",
      icon: "shield-checkmark-outline",
      route: "/legal",
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 98, paddingHorizontal: 16 }}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>NEXORA</Text>
          <Text style={styles.subtitle}>More</Text>
          <View style={styles.pillsRow}>
            <View style={[styles.pill, sportsEnabled ? styles.pillActive : styles.pillMuted]}>
              <Text style={styles.pillText}>Sports {sportsEnabled ? "On" : "Off"}</Text>
            </View>
            <View style={[styles.pill, moviesEnabled ? styles.pillActive : styles.pillMuted]}>
              <Text style={styles.pillText}>Media {moviesEnabled ? "On" : "Off"}</Text>
            </View>
          </View>
        </View>

        <Section title="MEDIA" items={mediaItems} />
        <Section title="LIBRARY" items={libraryItems} />
        <Section title="SYSTEM" items={systemItems} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  glowTop: {
    position: "absolute",
    top: -80,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: "rgba(229,9,20,0.11)",
  },
  glowBottom: {
    position: "absolute",
    right: -70,
    bottom: 100,
    width: 210,
    height: 210,
    borderRadius: 210,
    backgroundColor: "rgba(229,9,20,0.08)",
  },
  header: {
    marginBottom: 18,
    gap: 6,
  },
  brand: {
    color: P.text,
    fontSize: 24,
    letterSpacing: 2.6,
    fontFamily: "Inter_800ExtraBold",
  },
  subtitle: {
    color: P.muted,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontFamily: "Inter_600SemiBold",
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  pill: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillActive: {
    borderColor: "rgba(229,9,20,0.38)",
    backgroundColor: "rgba(229,9,20,0.13)",
  },
  pillMuted: {
    borderColor: P.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillText: {
    color: P.text,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: P.accent,
    fontSize: 10,
    letterSpacing: 1.9,
    marginBottom: 10,
    marginLeft: 3,
    fontFamily: "Inter_700Bold",
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.border,
    overflow: "hidden",
    backgroundColor: P.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowDisabled: {
    opacity: 0.44,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.32)",
    backgroundColor: "rgba(229,9,20,0.10)",
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: P.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rowSubtitle: {
    color: P.muted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    height: 1,
    backgroundColor: P.border,
    marginLeft: 56,
  },
  badge: {
    backgroundColor: "rgba(229,9,20,0.18)",
    borderColor: "rgba(229,9,20,0.32)",
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginRight: 4,
  },
  badgeText: {
    color: P.accent,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
});
