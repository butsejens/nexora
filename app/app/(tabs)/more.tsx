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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { NexoraHeader } from "@/components/NexoraHeader";
import { APP_MODULES_BY_ID } from "@/constants/module-registry";
import { COLORS } from "@/constants/colors";
import { useTranslation } from "@/lib/useTranslation";
import { useNexora } from "@/context/NexoraContext";

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
        <View
          style={[styles.featureIconWrap, accent && styles.featureIconAccent]}
        >
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
  const { t } = useTranslation();
  const { isPremium } = useNexora();

  const userItems = useMemo<MenuItem[]>(
    () => [
      {
        id: APP_MODULES_BY_ID.myList.id,
        title: APP_MODULES_BY_ID.myList.label,
        subtitle: APP_MODULES_BY_ID.myList.subtitle,
        icon: APP_MODULES_BY_ID.myList.icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.myList.route,
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
        icon: APP_MODULES_BY_ID.notifications
          .icon as keyof typeof Ionicons.glyphMap,
        route: APP_MODULES_BY_ID.notifications.route,
      },
    ],
    [],
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
        title: t("menu.legalDmca"),
        subtitle: t("menu.legalSub"),
        icon: "shield-checkmark-outline" as keyof typeof Ionicons.glyphMap,
        route: "/legal",
      },
    ],
    [t],
  );

  return (
    <View style={styles.screen}>
      {/* Ambient background glow */}
      <View style={styles.glowBg} pointerEvents="none" />

      <NexoraHeader
        variant="module"
        title={t("menu.title")}
        titleColor={COLORS.accent}
        showSearch={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 98 },
        ]}
      >
        {/* ── Primary module cards (2-column grid) */}
        <View style={styles.featureGrid}>
          <FeatureCard
            icon={
              APP_MODULES_BY_ID.movies.icon as keyof typeof Ionicons.glyphMap
            }
            title={APP_MODULES_BY_ID.movies.label}
            subtitle={APP_MODULES_BY_ID.movies.subtitle}
            route={APP_MODULES_BY_ID.movies.route}
            accent
          />
          <FeatureCard
            icon={
              APP_MODULES_BY_ID.liveTV.icon as keyof typeof Ionicons.glyphMap
            }
            title={APP_MODULES_BY_ID.liveTV.label}
            subtitle={APP_MODULES_BY_ID.liveTV.subtitle}
            route={APP_MODULES_BY_ID.liveTV.route}
          />
        </View>

        {/* ── Nexora+ banner ── */}
        {!isPremium && (
          <TouchableOpacity
            style={styles.premiumBanner}
            onPress={() => router.push("/premium" as any)}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={["rgba(192,38,211,0.22)", "rgba(124,58,237,0.14)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumBannerGradient}
            >
              <View style={styles.premiumBannerTop}>
                <View style={styles.premiumBannerIcon}>
                  <MaterialCommunityIcons name="crown" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.premiumBannerTitle}>Nexora+</Text>
                  <Text style={styles.premiumBannerSub}>Reclamevrij · 4K · Offline</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
              </View>
              <View style={styles.premiumPriceRow}>
                <View style={styles.premiumPriceChip}>
                  <Text style={styles.premiumPriceAmount}>€2,99</Text>
                  <Text style={styles.premiumPricePeriod}>/week</Text>
                </View>
                <View style={[styles.premiumPriceChip, styles.premiumPriceChipPopular]}>
                  <Text style={[styles.premiumPriceAmount, { color: COLORS.accent }]}>€7,99</Text>
                  <Text style={[styles.premiumPricePeriod, { color: COLORS.accent }]}>/maand</Text>
                  <View style={styles.popularDot} />
                </View>
                <View style={styles.premiumPriceChip}>
                  <Text style={styles.premiumPriceAmount}>€59,99</Text>
                  <Text style={styles.premiumPricePeriod}>/jaar</Text>
                </View>
              </View>
              <Text style={styles.premiumTrialNote}>7 dagen gratis proberen</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {isPremium && (
          <TouchableOpacity
            style={styles.premiumActiveBanner}
            onPress={() => router.push("/premium" as any)}
            activeOpacity={0.88}
          >
            <View style={styles.premiumActiveBannerIcon}>
              <MaterialCommunityIcons name="crown" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumActiveBannerTitle}>Nexora+ Actief</Text>
              <Text style={styles.premiumActiveBannerSub}>Je hebt toegang tot alle premium content</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        )}

        {/* ── Personal + System sections */}
        <MenuSection title={t("menu.personal")} items={userItems} />
        <MenuSection title={t("menu.system")} items={systemItems} />
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

  // ─ Smart Feed row ─
  smartFeedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.glass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  smartFeedIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(45,212,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(45,212,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  smartFeedText: { flex: 1 },
  smartFeedTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  smartFeedSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  // ─ Nexora+ banner ─
  premiumBanner: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
  },
  premiumBannerGradient: {
    padding: 16,
    gap: 12,
  },
  premiumBannerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  premiumBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumBannerTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 17,
    color: COLORS.text,
  },
  premiumBannerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  premiumPriceRow: {
    flexDirection: "row",
    gap: 8,
  },
  premiumPriceChip: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingVertical: 10,
    alignItems: "center",
    gap: 1,
  },
  premiumPriceChipPopular: {
    backgroundColor: COLORS.accentGlow,
    borderColor: COLORS.borderGlow,
  },
  popularDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  premiumPriceAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.text,
  },
  premiumPricePeriod: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  premiumTrialNote: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.accent,
    textAlign: "center",
  },

  // ─ Already premium banner ─
  premiumActiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.accentGlow,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  premiumActiveBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(192,38,211,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumActiveBannerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.text,
  },
  premiumActiveBannerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
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
    backgroundColor: COLORS.glass,
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
