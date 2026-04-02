import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFollowState } from "@/context/UserStateContext";
import { NexoraHeader } from "@/components/NexoraHeader";
import { APP_MODULES_BY_ID } from "@/constants/module-registry";

type MenuItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: string;
};

const P = {
  bg: "#050505",
  card: "#0B0F1A",
  accent: "#E50914",
  text: "#FFFFFF",
  muted: "#9797A5",
  border: "rgba(255,255,255,0.09)",
};

function Row({ item }: { item: MenuItem }) {
  return (
    <TouchableOpacity style={styles.row} onPress={() => router.push(item.route as any)} activeOpacity={0.84}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={item.icon} size={18} color={P.accent} />
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
      <Ionicons name="chevron-forward" size={15} color={P.muted} />
    </TouchableOpacity>
  );
}

function Section({ title, items }: { title: string; items: MenuItem[] }) {
  if (!items.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            <Row item={item} />
            {index < items.length - 1 ? <View style={styles.divider} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPadding = Math.max(12, Math.min(18, Math.round(width * 0.04)));
  const { followedTeams, followedMatches } = useFollowState();
  const followCount = followedTeams.length + followedMatches.length;

  const mediaItems = useMemo<MenuItem[]>(
    () => [
      {
        id: APP_MODULES_BY_ID.filmsSeries.id,
        title: APP_MODULES_BY_ID.filmsSeries.label,
        subtitle: APP_MODULES_BY_ID.filmsSeries.subtitle,
        icon: APP_MODULES_BY_ID.filmsSeries.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.filmsSeries.route,
      },
      {
        id: APP_MODULES_BY_ID.iptv.id,
        title: APP_MODULES_BY_ID.iptv.label,
        subtitle: APP_MODULES_BY_ID.iptv.subtitle,
        icon: APP_MODULES_BY_ID.iptv.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.iptv.route,
      },
    ],
    [],
  );

  const sportItems = useMemo<MenuItem[]>(
    () => [
      {
        id: APP_MODULES_BY_ID.sport.id,
        title: APP_MODULES_BY_ID.sport.label,
        subtitle: APP_MODULES_BY_ID.sport.subtitle,
        icon: APP_MODULES_BY_ID.sport.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.sport.route,
      },
    ],
    [],
  );

  const userItems = useMemo<MenuItem[]>(
    () => [
      {
        id: APP_MODULES_BY_ID.watchlist.id,
        title: APP_MODULES_BY_ID.watchlist.label,
        subtitle: APP_MODULES_BY_ID.watchlist.subtitle,
        icon: APP_MODULES_BY_ID.watchlist.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.watchlist.route,
      },
      {
        id: APP_MODULES_BY_ID.history.id,
        title: APP_MODULES_BY_ID.history.label,
        subtitle: APP_MODULES_BY_ID.history.subtitle,
        icon: APP_MODULES_BY_ID.history.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.history.route,
      },
      {
        id: APP_MODULES_BY_ID.notifications.id,
        title: APP_MODULES_BY_ID.notifications.label,
        subtitle: APP_MODULES_BY_ID.notifications.subtitle,
        icon: APP_MODULES_BY_ID.notifications.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.notifications.route,
        badge: followCount > 0 ? String(followCount) : undefined,
      },
    ],
    [followCount],
  );

  const systemItems = useMemo<MenuItem[]>(
    () => [
      {
        id: APP_MODULES_BY_ID.settings.id,
        title: APP_MODULES_BY_ID.settings.label,
        subtitle: APP_MODULES_BY_ID.settings.subtitle,
        icon: APP_MODULES_BY_ID.settings.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.settings.route,
      },
      {
        id: APP_MODULES_BY_ID.premium.id,
        title: APP_MODULES_BY_ID.premium.label,
        subtitle: APP_MODULES_BY_ID.premium.subtitle,
        icon: APP_MODULES_BY_ID.premium.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.premium.route,
      },
      {
        id: "legal",
        title: "Legal/DMCA",
        subtitle: "Privacy, rights and takedown policy",
        icon: "shield-checkmark-outline",
        route: "/legal",
      },
    ],
    [],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <NexoraHeader
        variant="module"
        title="MENU"
        titleColor={P.accent}
        showSearch={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 98,
          paddingHorizontal: horizontalPadding,
        }}
      >
        <Section
          title="MEDIA"
          items={mediaItems}
        />
        <Section title="SPORT" items={sportItems} />
        <Section title="USER" items={userItems} />
        <Section title="SYSTEM" items={systemItems} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
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
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: P.text,
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
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.32)",
    backgroundColor: "rgba(229,9,20,0.1)",
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
