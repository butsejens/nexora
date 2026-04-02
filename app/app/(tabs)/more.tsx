/**
 * NEXORA Menu — Premium Control Center
 * Feature cards for main modules + compact grouped rows for personal/system.
 */
import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFollowState } from "@/context/UserStateContext";
import { NexoraHeader } from "@/components/NexoraHeader";
import { APP_MODULES_BY_ID } from "@/constants/module-registry";
import { COLORS } from "@/constants/colors";

type MenuItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: string;
};

// ─── Feature card (large, for primary modules) ───────────────────────────────

function FeatureCard({
  icon,
  title,
  subtitle,
  route,
  accent = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.featureCard}
      onPress={() => router.push(route as any)}
      activeOpacity={0.88}
    >
      <LinearGradient
        colors={
          accent
            ? ["rgba(229,9,20,0.20)", COLORS.card]
            : ["rgba(255,255,255,0.05)", COLORS.card]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featureGradient}
      >
        <View style={[styles.featureIconWrap, accent && styles.featureIconAccent]}>
          <Ionicons
            name={icon}
            size={22}
            color={accent ? COLORS.accent : COLORS.textSecondary}
          />
        </View>
        <Text style={styles.featureTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.featureSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Compact row (for secondary modules) ─────────────────────────────────────

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={() => router.push(item.route as any)}
      activeOpacity={0.82}
    >
      <View style={styles.menuIconWrap}>
        <Ionicons name={item.icon} size={17} color={COLORS.accent} />
      </View>
      <View style={styles.menuRowText}>
        <Text style={styles.menuRowTitle}>{item.title}</Text>
        <Text style={styles.menuRowSub} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      {item.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function MenuSection({ title, items }: { title: string; items: MenuItem[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.menuSection}>
      <Text style={styles.menuSectionTitle}>{title}</Text>
      <View style={styles.menuSectionCard}>
        {items.map((item, i) => (
          <React.Fragment key={item.id}>
            <MenuRow item={item} />
            {i < items.length - 1 ? <View style={styles.menuDivider} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { followedTeams, followedMatches } = useFollowState();
  const followCount = followedTeams.length + followedMatches.length;

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
        title: "Legal & DMCA",
        subtitle: "Privacy, rights and takedown policy",
        icon: "shield-checkmark-outline" as keyof typeof Ionicons.glyphMap,
        route: "/legal",
      },
    ],
    [],
  );

  return (
    <View style={styles.screen}>
      {/* Ambient background glow */}
      <View style={styles.glowBg} pointerEvents="none" />

      <NexoraHeader
        variant="module"
        title="MENU"
        titleColor={COLORS.accent}
        showSearch={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 98 }]}
      >
        {/* ── Primary module cards (2-column grid) */}
        <View style={styles.featureGrid}>
          <FeatureCard
            icon={APP_MODULES_BY_ID.sport.icon as keyof typeof Ionicons.glyphMap}
            title={APP_MODULES_BY_ID.sport.label}
            subtitle={APP_MODULES_BY_ID.sport.subtitle}
            route={APP_MODULES_BY_ID.sport.route}
            accent
          />
          <FeatureCard
            icon={APP_MODULES_BY_ID.filmsSeries.icon as keyof typeof Ionicons.glyphMap}
            title={APP_MODULES_BY_ID.filmsSeries.label}
            subtitle={APP_MODULES_BY_ID.filmsSeries.subtitle}
            route={APP_MODULES_BY_ID.filmsSeries.route}
          />
        </View>

        {/* ── IPTV — full-width row */}
        <TouchableOpacity
          style={styles.iptvRow}
          onPress={() => router.push(APP_MODULES_BY_ID.iptv.route as any)}
          activeOpacity={0.88}
        >
          <View style={styles.iptvIcon}>
            <Ionicons
              name={APP_MODULES_BY_ID.iptv.icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color={COLORS.cyan}
            />
          </View>
          <View style={styles.iptvText}>
            <Text style={styles.iptvTitle}>{APP_MODULES_BY_ID.iptv.label}</Text>
            <Text style={styles.iptvSub}>{APP_MODULES_BY_ID.iptv.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* ── Personal + System sections */}
        <MenuSection title="PERSOONLIJK" items={userItems} />
        <MenuSection title="SYSTEEM" items={systemItems} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  glowBg: {
    position: "absolute",
    top: -60,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(229,9,20,0.08)",
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },

  // ─ Feature grid ─
  featureGrid: {
    flexDirection: "row",
    gap: 10,
  },
  featureCard: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  featureGradient: {
    padding: 16,
    minHeight: 148,
    gap: 6,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.glass,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  featureIconAccent: {
    backgroundColor: "rgba(229,9,20,0.16)",
    borderColor: "rgba(229,9,20,0.28)",
  },
  featureTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  featureSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },

  // ─ IPTV row ─
  iptvRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iptvIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(45,212,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(45,212,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iptvText: { flex: 1 },
  iptvTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  iptvSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  // ─ Menu section ─
  menuSection: {
    gap: 8,
  },
  menuSectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    letterSpacing: 1.8,
    fontFamily: "Inter_700Bold",
    marginLeft: 2,
    textTransform: "uppercase",
  },
  menuSectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "rgba(229,9,20,0.10)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowText: { flex: 1 },
  menuRowTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  menuRowSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginLeft: 62,
  },

  // ─ Badge ─
  badge: {
    backgroundColor: "rgba(229,9,20,0.16)",
    borderColor: "rgba(229,9,20,0.28)",
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLORS.accent,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
});
