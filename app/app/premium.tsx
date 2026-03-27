import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { SafeHaptics } from "@/lib/safeHaptics";

type PremiumPlan = "weekly" | "monthly" | "yearly";

const PLANS: Array<{
  id: PremiumPlan;
  label: string;
  price: string;
  subtext: string;
  highlight?: string;
}> = [
  { id: "weekly", label: "Weekly", price: "€2.99", subtext: "Flexible access" },
  { id: "monthly", label: "Monthly", price: "€7.99", subtext: "Best for active users" },
  { id: "yearly", label: "Yearly", price: "€59.99", subtext: "Lowest long-term cost", highlight: "Save 40%" },
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { hasPremium, purchasePremiumSubscription, restorePremiumAccess } = useNexora();
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlan>("yearly");
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 24;
  const premiumActive = hasPremium("sport") && hasPremium("movies") && hasPremium("series") && hasPremium("livetv");
  const selected = useMemo(() => PLANS.find((plan) => plan.id === selectedPlan) || PLANS[2], [selectedPlan]);

  const handlePurchase = async () => {
    SafeHaptics.impactLight();
    setPurchaseLoading(true);
    const result = await purchasePremiumSubscription(selectedPlan);
    setPurchaseLoading(false);

    if (result.ok) {
      SafeHaptics.success();
      Alert.alert("Premium active", "Your premium subscription is active and all content is now unlocked.", [
        { text: "Continue", onPress: () => router.back() },
      ]);
      return;
    }

    if (!result.cancelled) {
      SafeHaptics.error();
      Alert.alert("Purchase failed", result.reason || "Unable to complete the subscription purchase.");
    }
  };

  const handleRestore = async () => {
    SafeHaptics.impactLight();
    setRestoreLoading(true);
    const result = await restorePremiumAccess();
    setRestoreLoading(false);

    if (result.ok) {
      SafeHaptics.success();
      Alert.alert("Purchases restored", "Your premium subscription has been restored.");
      return;
    }

    Alert.alert("Restore unavailable", result.reason || "No active purchases were found to restore.");
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        <View style={[styles.header, { paddingTop: topPad + 16 }]}> 
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} activeOpacity={0.82}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.crownBadge}>
            <MaterialCommunityIcons name="crown" size={32} color="#FFFFFF" />
          </View>

          <Text style={styles.headerTitle}>Nexora Premium</Text>
          <Text style={styles.headerSub}>Real store-backed access. No ads. Full AI depth. Everything unlocked.</Text>

          {premiumActive ? (
            <View style={styles.activePill}>
              <Ionicons name="checkmark-circle" size={14} color="#67E8A5" />
              <Text style={styles.activePillText}>Premium currently active</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.benefitCard}>
          <Text style={styles.sectionTitle}>What premium unlocks</Text>
          <Text style={styles.benefitRow}>All predictions and match insights unlocked</Text>
          <Text style={styles.benefitRow}>No rewarded ads after subscription</Text>
          <Text style={styles.benefitRow}>Extra AI data, tactical context and premium media access</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose your plan</Text>
          {PLANS.map((plan) => {
            const active = selectedPlan === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, active && styles.planCardActive, plan.id === "yearly" && styles.planCardYearly]}
                onPress={() => setSelectedPlan(plan.id)}
                activeOpacity={0.86}
              >
                <View style={styles.planMain}>
                  <View style={styles.planCopy}>
                    <View style={styles.planLabelRow}>
                      <Text style={styles.planLabel}>{plan.label}</Text>
                      {plan.highlight ? <Text style={styles.planHighlight}>{plan.highlight}</Text> : null}
                    </View>
                    <Text style={styles.planSubtext}>{plan.subtext}</Text>
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                    <Text style={styles.planPeriod}>{plan.id === "weekly" ? "/week" : plan.id === "monthly" ? "/month" : "/year"}</Text>
                  </View>
                </View>
                <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                  {active ? <View style={styles.radioInner} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Selected plan</Text>
          <Text style={styles.summaryPrice}>{selected.price}</Text>
          <Text style={styles.summarySub}>{selected.label} billing via App Store / Google Play</Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, purchaseLoading && styles.buttonDisabled]}
          onPress={handlePurchase}
          disabled={purchaseLoading}
          activeOpacity={0.88}
        >
          <Text style={styles.primaryBtnText}>{purchaseLoading ? "Processing purchase..." : `Start ${selected.label} Plan`}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, restoreLoading && styles.buttonDisabled]}
          onPress={handleRestore}
          disabled={restoreLoading}
          activeOpacity={0.84}
        >
          <Text style={styles.secondaryBtnText}>{restoreLoading ? "Restoring..." : "Restore purchases"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    alignItems: "center",
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: "#0F1016",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  crownBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A47A2B",
    borderWidth: 1,
    borderColor: "rgba(243,201,106,0.55)",
  },
  headerTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 28, color: COLORS.text, textAlign: "center" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
  activePill: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(103,232,165,0.12)",
    borderWidth: 1,
    borderColor: "rgba(103,232,165,0.28)",
  },
  activePillText: { color: "#67E8A5", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  section: { marginHorizontal: 16, marginTop: 18, gap: 10 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  benefitCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "#151722",
    borderWidth: 1,
    borderColor: "rgba(243,201,106,0.20)",
    padding: 14,
    gap: 8,
  },
  benefitRow: { color: "#D5D7E2", fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18 },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  planCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(229,9,20,0.10)",
  },
  planCardYearly: {
    borderColor: "rgba(243,201,106,0.28)",
  },
  planMain: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  planCopy: { flex: 1, gap: 3 },
  planLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  planLabel: { color: COLORS.text, fontFamily: "Inter_700Bold", fontSize: 16 },
  planHighlight: {
    color: "#F3C96A",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    backgroundColor: "rgba(243,201,106,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planSubtext: { color: COLORS.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 },
  planPriceWrap: { alignItems: "flex-end" },
  planPrice: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 20 },
  planPeriod: { color: COLORS.textMuted, fontFamily: "Inter_500Medium", fontSize: 11 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: COLORS.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 16,
    padding: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  summaryTitle: { color: COLORS.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  summaryPrice: { color: COLORS.text, fontFamily: "Inter_800ExtraBold", fontSize: 28 },
  summarySub: { color: COLORS.textMuted, fontFamily: "Inter_400Regular", fontSize: 12 },
  primaryBtn: {
    marginHorizontal: 16,
    marginTop: 18,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  secondaryBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: COLORS.text, fontFamily: "Inter_600SemiBold", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
});