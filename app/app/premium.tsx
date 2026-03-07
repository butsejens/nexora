import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Platform, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import type { PremiumCategory } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";

type BillingCycle = "monthly" | "yearly";

const CATEGORIES: {
  id: PremiumCategory;
  label: string;
  icon: string;
  iconLib: "ion" | "mci";
  priceMonthly: number;
  color: string;
  features: string[];
}[] = [
  {
    id: "sport",
    label: "Sport AI",
    icon: "robot",
    iconLib: "mci",
    priceMonthly: 7.99,
    color: "#00C4E8",
    features: ["AI voorspellingen", "xG & kansen analyse", "Tactische analyse", "Vormlijn & H2H"],
  },
  {
    id: "movies",
    label: "Films",
    icon: "film",
    iconLib: "mci",
    priceMonthly: 5.99,
    color: "#FF6B6B",
    features: ["Alle films in 4K", "Duizenden titels", "TMDB catalogus", "Nieuwe releases"],
  },
  {
    id: "series",
    label: "Series",
    icon: "television-play",
    iconLib: "mci",
    priceMonthly: 5.99,
    color: "#A855F7",
    features: ["Alle series unlocked", "Seizoen overzicht", "Trending series", "Exclusieve titels"],
  },
  {
    id: "livetv",
    label: "Live TV",
    icon: "antenna",
    iconLib: "mci",
    priceMonthly: 0.99,
    color: "#F59E0B",
    features: ["Onbeperkte IPTV", "Live kanalen", "M3U/Xtream support", "HD & 4K streams"],
  },
];

function calcPrice(selected: PremiumCategory[], cycle: BillingCycle): { monthly: number; total: number; discount: number; label: string } {
  const n = selected.length;
  if (n === 0) return { monthly: 0, total: 0, discount: 0, label: "" };

  const allFour = n === 4;
  let baseMonthly = 0;
  if (allFour) {
    baseMonthly = 11.99;
  } else {
    const sum = selected.reduce((acc, id) => {
      const cat = CATEGORIES.find(c => c.id === id)!;
      return acc + cat.priceMonthly;
    }, 0);
    const discountPct = n === 2 ? 0.15 : n === 3 ? 0.25 : 0;
    baseMonthly = Math.round(sum * (1 - discountPct) * 100) / 100;
  }

  const fullMonthly = selected.reduce((acc, id) => acc + (CATEGORIES.find(c => c.id === id)?.priceMonthly || 0), 0);
  const discount = allFour ? Math.round((fullMonthly - 9.99) * 100) / 100 : 0;

  if (cycle === "yearly") {
    const monthly = Math.round(baseMonthly * 0.833 * 100) / 100;
    const total = Math.round(monthly * 12 * 100) / 100;
    return { monthly, total, discount, label: `/jaar (€${total.toFixed(2)})` };
  }
  return { monthly: baseMonthly, total: baseMonthly, discount, label: "/maand" };
}

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { premiumCategories, hasPremium, activatePremiumCategories, deactivatePremium } = useNexora();
  const [selected, setSelected] = useState<PremiumCategory[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 24;

  const pricing = calcPrice(selected, cycle);
  const allSelected = selected.length === 4;

  const toggleCategory = (id: PremiumCategory) => {
    SafeHaptics.impactLight();
    setSelected(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    SafeHaptics.impactLight();
    setSelected(allSelected ? [] : CATEGORIES.map(c => c.id));
  };

  const handleActivate = async () => {
    if (selected.length === 0) return;
    SafeHaptics.impactLight();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    await activatePremiumCategories(selected);
    setLoading(false);
    SafeHaptics.success();
    const categoryNames = selected.map(id => CATEGORIES.find(c => c.id === id)?.label).join(", ");
    Alert.alert(
      "Premium geactiveerd!",
      `Je hebt toegang tot: ${categoryNames}`,
      [{ text: "Aan de slag", onPress: () => router.back() }]
    );
  };

  const handleDeactivate = () => {
    Alert.alert(
      "Premium opzeggen",
      "Wil je alle premium abonnementen opzeggen?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Alles opzeggen",
          style: "destructive",
          onPress: async () => {
            await deactivatePremium();
            SafeHaptics.error();
          },
        },
      ]
    );
  };

  const hasAnyPremium = premiumCategories.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* Header */}
        <LinearGradient colors={["#0d1a2e", "#0A0A0F"]} style={[styles.header, { paddingTop: topPad + 16 }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <LinearGradient colors={["#FFD700", "#FF8C00"]} style={styles.crownBadge}>
            <MaterialCommunityIcons name="crown" size={32} color="#fff" />
          </LinearGradient>

          <Text style={styles.headerTitle}>NEXORA Premium</Text>
          <Text style={styles.headerSub}>Kies precies wat jij wil unlocken</Text>

          {/* Active categories */}
          {hasAnyPremium && (
            <View style={styles.activeBadgesRow}>
              {premiumCategories.map(id => {
                const cat = CATEGORIES.find(c => c.id === id)!;
                return (
                  <View key={id} style={[styles.activeCatBadge, { borderColor: `${cat.color}55`, backgroundColor: `${cat.color}18` }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={11} color={cat.color} />
                    <Text style={[styles.activeCatText, { color: cat.color }]}>{cat.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </LinearGradient>

        {/* Category tiles */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kies jouw pakket</Text>
            <TouchableOpacity onPress={toggleAll} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>{allSelected ? "Deselecteer alles" : "Alles selecteren"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.catGrid}>
            {CATEGORIES.map(cat => {
              const isOwned = hasPremium(cat.id);
              const isSelected = selected.includes(cat.id);
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catCard,
                    isSelected && { borderColor: cat.color, backgroundColor: `${cat.color}14` },
                    isOwned && { borderColor: `${cat.color}80`, opacity: 0.7 },
                  ]}
                  onPress={() => !isOwned && toggleCategory(cat.id)}
                  activeOpacity={isOwned ? 1 : 0.8}
                >
                  {isOwned && (
                    <View style={[styles.ownedBadge, { backgroundColor: cat.color }]}>
                      <Text style={styles.ownedBadgeText}>Actief</Text>
                    </View>
                  )}
                  {isSelected && !isOwned && (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark-circle" size={18} color={cat.color} />
                    </View>
                  )}

                  <LinearGradient
                    colors={[`${cat.color}22`, `${cat.color}08`]}
                    style={styles.catIconBg}
                  >
                    <MaterialCommunityIcons name={cat.icon as any} size={26} color={cat.color} />
                  </LinearGradient>

                  <Text style={styles.catLabel}>{cat.label}</Text>
                  <Text style={[styles.catPrice, { color: cat.color }]}>
                    €{cat.priceMonthly.toFixed(2)}
                    <Text style={styles.catPricePeriod}>/mnd</Text>
                  </Text>

                  {cat.features.slice(0, 2).map((f, i) => (
                    <View key={i} style={styles.catFeatureRow}>
                      <View style={[styles.catFeatureDot, { backgroundColor: cat.color }]} />
                      <Text style={styles.catFeatureText} numberOfLines={1}>{f}</Text>
                    </View>
                  ))}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Billing cycle */}
        {selected.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Facturatieperiode</Text>
            <View style={styles.cycleRow}>
              {(["monthly", "yearly"] as BillingCycle[]).map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cycleBtn, cycle === c && styles.cycleBtnActive]}
                  onPress={() => { SafeHaptics.impactLight(); setCycle(c); }}
                  activeOpacity={0.8}
                >
                  {c === "yearly" && (
                    <View style={styles.cycleSaveBadge}>
                      <Text style={styles.cycleSaveBadgeText}>2 mnd gratis</Text>
                    </View>
                  )}
                  <Text style={[styles.cycleBtnText, cycle === c && styles.cycleBtnTextActive]}>
                    {c === "monthly" ? "Maandelijks" : "Jaarlijks"}
                  </Text>
                  <Text style={[styles.cycleBtnSub, cycle === c && { color: COLORS.accent }]}>
                    {c === "monthly"
                      ? `€${calcPrice(selected, "monthly").monthly.toFixed(2)}/mnd`
                      : `€${calcPrice(selected, "yearly").monthly.toFixed(2)}/mnd`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Price summary */}
        {selected.length > 0 && (
          <View style={styles.priceSummary}>
            {selected.length > 1 && (
              <View style={styles.discountRow}>
                <MaterialCommunityIcons name="tag-outline" size={14} color="#4CAF50" />
                <Text style={styles.discountText}>
                  {selected.length === 4
                    ? "Alles-in-één bundel — bespaar €" + (CATEGORIES.reduce((a, c) => a + c.priceMonthly, 0) - 9.99).toFixed(2) + "/mnd"
                    : selected.length === 3
                    ? "3 categorieën — 25% korting"
                    : "2 categorieën — 15% korting"}
                </Text>
              </View>
            )}
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Totaal</Text>
              <View style={styles.priceTotalRight}>
                <Text style={styles.priceTotalAmount}>€{pricing.monthly.toFixed(2)}</Text>
                <Text style={styles.priceTotalPeriod}>{cycle === "yearly" ? `/mnd · €${(pricing.monthly * 12).toFixed(2)}/jaar` : "/maand"}</Text>
              </View>
            </View>
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, selected.length === 0 && styles.ctaBtnDisabled]}
          onPress={handleActivate}
          activeOpacity={0.85}
          disabled={loading || selected.length === 0}
        >
          <LinearGradient
            colors={selected.length > 0 ? ["#FFD700", "#FF8C00"] : [COLORS.card, COLORS.card]}
            style={styles.ctaBtnGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {loading ? (
              <Text style={[styles.ctaBtnText, selected.length === 0 && { color: COLORS.textMuted }]}>Activeren...</Text>
            ) : selected.length === 0 ? (
              <Text style={[styles.ctaBtnText, { color: COLORS.textMuted }]}>Selecteer een pakket</Text>
            ) : (
              <>
                <MaterialCommunityIcons name="crown" size={20} color="#fff" />
                <Text style={styles.ctaBtnText}>
                  Activeer voor €{pricing.monthly.toFixed(2)}{cycle === "yearly" ? "/mnd" : "/mnd"}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.trialNote}>✓ 7 dagen gratis proberen · Annuleer wanneer je wil</Text>

        {/* Feature detail per category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alle voordelen</Text>
          {CATEGORIES.map(cat => (
            <View key={cat.id} style={styles.featureGroup}>
              <View style={styles.featureGroupHeader}>
                <LinearGradient colors={[`${cat.color}33`, `${cat.color}11`]} style={styles.featureGroupIcon}>
                  <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
                </LinearGradient>
                <Text style={[styles.featureGroupLabel, { color: cat.color }]}>{cat.label}</Text>
                <Text style={styles.featureGroupPrice}>€{cat.priceMonthly.toFixed(2)}/mnd</Text>
              </View>
              {cat.features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={cat.color} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Cancel */}
        {hasAnyPremium && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleDeactivate}>
            <Text style={styles.cancelBtnText}>Abonnement opzeggen</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: "center", paddingBottom: 28, paddingHorizontal: 24, gap: 8 },
  closeBtn: {
    position: "absolute", top: 20, right: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center", zIndex: 10,
  },
  crownBadge: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 16,
  },
  headerTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 26, color: COLORS.text, textAlign: "center" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  activeBadgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 },
  activeCatBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  activeCatText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  section: { marginHorizontal: 16, marginBottom: 20, marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  selectAllText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catCard: {
    width: "47.5%", backgroundColor: COLORS.card, borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: COLORS.border, gap: 6, position: "relative",
  },
  ownedBadge: {
    position: "absolute", top: 10, right: 10,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  ownedBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#000" },
  checkCircle: { position: "absolute", top: 10, right: 10 },
  catIconBg: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  catLabel: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  catPrice: { fontFamily: "Inter_800ExtraBold", fontSize: 17 },
  catPricePeriod: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  catFeatureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  catFeatureDot: { width: 5, height: 5, borderRadius: 2.5 },
  catFeatureText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, flex: 1 },
  cycleRow: { flexDirection: "row", gap: 10 },
  cycleBtn: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: COLORS.border, position: "relative",
  },
  cycleBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  cycleSaveBadge: {
    position: "absolute", top: -10, alignSelf: "center",
    backgroundColor: "#4CAF50", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  cycleSaveBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff" },
  cycleBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  cycleBtnTextActive: { color: COLORS.accent },
  cycleBtnSub: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text },
  priceSummary: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 10,
  },
  discountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  discountText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#4CAF50" },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  priceTotalLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.textSecondary },
  priceTotalRight: { alignItems: "flex-end" },
  priceTotalAmount: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: COLORS.text },
  priceTotalPeriod: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  ctaBtn: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", marginBottom: 10 },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#fff" },
  trialNote: {
    textAlign: "center", fontFamily: "Inter_400Regular",
    fontSize: 12, color: COLORS.textMuted, marginBottom: 24,
  },
  featureGroup: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  featureGroupHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  featureGroupIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  featureGroupLabel: { fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 },
  featureGroupPrice: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  featureText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, flex: 1 },
  cancelBtn: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.live, alignItems: "center",
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.live },
});
