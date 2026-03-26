/**
 * NEXORA — More Menu
 *
 * Premium mega-menu with:
 *   MEDIA  — Movies · TV Shows · Anime · Manga · Music · Live Sports
 *   USER   — Watchlist · History · Favorites / Follows
 *   SYSTEM — Notifications · Settings · Legal
 *
 * Dynamically driven by sportsEnabled / moviesEnabled from onboarding store.
 */

import React, { useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useFollowState } from "@/context/UserStateContext";
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";

// ── Design tokens ──────────────────────────────────────────────────────────────
const P = {
  bg:       "#09090D",
  surface:  "#111118",
  card:     "#15151E",
  elevated: "#1C1C28",
  accent:   "#E50914",
  text:     "#FFFFFF",
  muted:    "#8E8E9E",
  border:   "rgba(255,255,255,0.07)",
  sectionLabel: "rgba(229,9,20,0.85)",
};

// ── Types ──────────────────────────────────────────────────────────────────────
type MenuRow = {
  id: string;
  icon: string;
  iconLib?: "ion" | "mci";
  label: string;
  sublabel?: string;
  badge?: string | number;
  route: () => void;
  accent?: boolean;
  disabled?: boolean;
};

type MenuSection = {
  id: string;
  title: string;
  rows: MenuRow[];
};

// ── Row component ──────────────────────────────────────────────────────────────
function MenuRowItem({ row }: { row: MenuRow }) {
  const isDisabled = row.disabled === true;

  return (
    <TouchableOpacity
      onPress={isDisabled ? undefined : row.route}
      activeOpacity={isDisabled ? 1 : 0.72}
      style={[styles.row, isDisabled && styles.rowDisabled]}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      {/* Icon bubble */}
      <View style={[styles.iconBubble, row.accent && styles.iconBubbleAccent]}>
        {row.iconLib === "mci" ? (
          <MaterialCommunityIcons
            name={row.icon as any}
            size={22}
            color={row.accent ? "#FFF" : P.accent}
          />
        ) : (
          <Ionicons
            name={row.icon as any}
            size={22}
            color={row.accent ? "#FFF" : P.accent}
          />
        )}
      </View>

      {/* Label + sublabel */}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, isDisabled && styles.rowLabelMuted]}>
          {row.label}
        </Text>
        {row.sublabel ? (
          <Text style={styles.rowSublabel}>{row.sublabel}</Text>
        ) : null}
      </View>

      {/* Badge */}
      {!!row.badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {typeof row.badge === "number" && row.badge > 99 ? "99+" : String(row.badge)}
          </Text>
        </View>
      )}

      {/* Chevron */}
      {!isDisabled && (
        <Ionicons name="chevron-forward" size={16} color={P.muted} />
      )}
    </TouchableOpacity>
  );
}

// ── Section component ──────────────────────────────────────────────────────────
function MenuSectionBlock({ section }: { section: MenuSection }) {
  if (section.rows.length === 0) return null;

  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionCard}>
        {section.rows.map((row, index) => (
          <React.Fragment key={row.id}>
            <MenuRowItem row={row} />
            {index < section.rows.length - 1 && (
              <View style={styles.divider} />
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const sportsEnabled = useOnboardingStore((s) => s.sportsEnabled);
  const moviesEnabled = useOnboardingStore((s) => s.moviesEnabled);
  const { followedTeams, followedMatches } = useFollowState();

  const followCount = followedTeams.length + followedMatches.length;

  const go = useCallback((path: string) => () => router.push(path as any), []);

  // ── Build sections ────────────────────────────────────────────────────────--
  const mediaRows: MenuRow[] = [];

  if (moviesEnabled) {
    mediaRows.push(
      {
        id: "movies",
        icon: "film",
        label: "Movies",
        sublabel: "Trending & popular films",
        route: go("/(tabs)/movies"),
      },
      {
        id: "series",
        icon: "layers",
        iconLib: "ion",
        label: "TV Shows",
        sublabel: "Series, seasons & episodes",
        route: go("/(tabs)/series"),
      },
    );
  }

  mediaRows.push(
    {
      id: "livetv",
      icon: "tv",
      label: "Live TV",
      sublabel: "IPTV channels & live streams",
      route: go("/(tabs)/livetv"),
    },
  );

  if (sportsEnabled) {
    mediaRows.push({
      id: "livesports",
      icon: "soccer",
      iconLib: "mci",
      label: "Live Sports",
      sublabel: "Matches, scores & highlights",
      route: go("/(tabs)/"),
      accent: false,
    });
  }

  if (!moviesEnabled && !sportsEnabled) {
    // Both disabled — nudge user toward settings
    mediaRows.push({
      id: "enable-modules",
      icon: "add-circle",
      label: "Enable modules in Settings",
      sublabel: "Turn on Sports or Movies",
      route: go("/profile"),
      accent: true,
    });
  }

  const mediaSectionRows: MenuRow[] = [
    ...mediaRows,
    {
      id: "downloads",
      icon: "arrow-down-circle",
      label: "Downloads",
      sublabel: "Offline content",
      route: go("/(tabs)/downloads"),
    },
  ];

  const userRows: MenuRow[] = [
    {
      id: "watchlist",
      icon: "bookmark",
      label: "Watchlist",
      sublabel: "Saved for later",
      route: go("/favorites"),
    },
    {
      id: "history",
      icon: "time",
      label: "History",
      sublabel: "Recently watched",
      route: go("/favorites"),
    },
    {
      id: "follows",
      icon: "heart",
      label: "Follows & Notifications",
      sublabel: followCount > 0 ? `${followCount} item${followCount === 1 ? "" : "s"} followed` : "Teams & match alerts",
      badge: followCount > 0 ? followCount : undefined,
      route: go("/follow-center"),
    },
  ];

  const systemRows: MenuRow[] = [
    {
      id: "settings",
      icon: "settings",
      label: "Settings",
      sublabel: "Preferences, modules & account",
      route: go("/profile"),
    },
    {
      id: "legal",
      icon: "shield-checkmark",
      label: "Legal & DMCA",
      sublabel: "Privacy & content rights",
      route: go("/profile"),
    },
  ];

  const sections: MenuSection[] = [
    { id: "media", title: "MEDIA", rows: mediaSectionRows },
    { id: "user",  title: "YOUR CONTENT", rows: userRows },
    { id: "sys",   title: "SYSTEM", rows: systemRows },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: P.bg }]}>
      {/* Background aurora blobs */}
      <View style={styles.auroraTopLeft} />
      <View style={styles.auroraBottomRight} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand header ── */}
        <View style={styles.brandHeader}>
          <PulseBrandMark
            size={48}
            showWordmark={true}
            subtitle={null}
          />
          <View style={styles.moduleChips}>
            {sportsEnabled && (
              <View style={[styles.chip, styles.chipActive]}>
                <MaterialCommunityIcons name="soccer" size={11} color={P.accent} />
                <Text style={styles.chipText}>Sports</Text>
              </View>
            )}
            {moviesEnabled && (
              <View style={[styles.chip, styles.chipActive]}>
                <Ionicons name="film-outline" size={11} color={P.accent} />
                <Text style={styles.chipText}>Movies & TV</Text>
              </View>
            )}
            {!sportsEnabled && !moviesEnabled && (
              <View style={[styles.chip, styles.chipInactive]}>
                <Ionicons name="alert-circle-outline" size={11} color={P.muted} />
                <Text style={[styles.chipText, { color: P.muted }]}>No modules active</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Menu sections ── */}
        {sections.map((section) => (
          <MenuSectionBlock key={section.id} section={section} />
        ))}

        {/* ── Footer label ── */}
        <Text style={styles.footer}>NEXORA · Premium</Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  auroraTopLeft: {
    position: "absolute",
    top: -80,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 200,
    backgroundColor: "rgba(229,9,20,0.10)",
  },
  auroraBottomRight: {
    position: "absolute",
    bottom: 80,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: "rgba(229,9,20,0.07)",
  },
  scroll: {
    paddingHorizontal: 18,
    gap: 0,
  },

  // ── Brand header
  brandHeader: {
    alignItems: "center",
    gap: 16,
    marginBottom: 28,
    paddingVertical: 8,
  },
  moduleChips: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: "rgba(229,9,20,0.10)",
    borderColor: "rgba(229,9,20,0.30)",
  },
  chipInactive: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  chipText: {
    color: P.accent,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },

  // ── Section
  sectionBlock: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: P.sectionLabel,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: P.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: P.border,
    overflow: "hidden",
  },

  // ── Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBubbleAccent: {
    backgroundColor: P.accent,
    borderColor: P.accent,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: P.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  rowLabelMuted: {
    color: P.muted,
  },
  rowSublabel: {
    color: P.muted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.1,
  },

  // ── Badge
  badge: {
    backgroundColor: P.accent,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  // ── Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: P.border,
    marginLeft: 70,
  },

  // ── Footer
  footer: {
    color: "rgba(255,255,255,0.20)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 20,
    textTransform: "uppercase",
  },
});
