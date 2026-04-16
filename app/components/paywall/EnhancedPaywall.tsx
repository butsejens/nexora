import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNexora } from "@/context/NexoraContext";
import { COLORS } from "@/constants/colors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

type PlanType = "weekly" | "monthly" | "yearly";

const PLANS = [
  {
    id: "weekly" as PlanType,
    name: "Wekelijks",
    price: "€2,99",
    period: "/week",
    savings: null,
    popular: false,
  },
  {
    id: "monthly" as PlanType,
    name: "Maandelijks",
    price: "€7,99",
    period: "/maand",
    savings: null,
    popular: true,
  },
  {
    id: "yearly" as PlanType,
    name: "Jaarlijks",
    price: "€59,99",
    period: "/jaar",
    savings: "40% korting",
    popular: false,
  },
];

const BENEFITS = [
  { icon: "ban", text: "Reclamevrij streamen op alle content" },
  { icon: "film", text: "Onbeperkt films en series kijken" },
  { icon: "desktop-outline", text: "Tot 4K beeldkwaliteit" },
  { icon: "text", text: "Ondertitels in 30+ talen" },
  { icon: "phone-portrait-outline", text: "Streamen op 3 apparaten tegelijk" },
  { icon: "rocket-outline", text: "Vroege toegang tot nieuwe releases" },
  { icon: "speedometer-outline", text: "Afspeelsnelheid instellen (0,5x – 2x)" },
  { icon: "time-outline", text: "Kijkgeschiedenis gesynchroniseerd" },
];

type EnhancedPaywallProps = {
  visible: boolean;
  onDismiss?: () => void;
  onUpgradeSuccess?: () => void;
};

export const EnhancedPaywall = React.memo(function EnhancedPaywall({ visible, onDismiss, onUpgradeSuccess }: EnhancedPaywallProps) {
  const { purchasePremiumSubscription, restorePremiumAccess } = useNexora();
  
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Purchase
  const handlePurchase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await purchasePremiumSubscription?.(selectedPlan);
      if (result?.ok) {
        onUpgradeSuccess?.();
        onDismiss?.();
      } else if (!result?.cancelled) {
        setError(result?.reason || "Purchase failed. Please try again.");
      }
    } catch {
      setError("Purchase failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, purchasePremiumSubscription, onDismiss, onUpgradeSuccess]);

  // Handle Restore
  const handleRestore = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await restorePremiumAccess?.();
      if (result?.ok) {
        onUpgradeSuccess?.();
        onDismiss?.();
      } else {
        setError(result?.reason || "Restore failed. Please try again.");
      }
    } catch {
      setError("Restore failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [restorePremiumAccess, onDismiss, onUpgradeSuccess]);

  if (!visible) return null;

  return (
    <LinearGradient colors={[COLORS.background, "#1a1a2e"]} style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nexora+ activeren</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <LinearGradient colors={[COLORS.accent, "rgba(229,9,20,0.6)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBadge}>
            <MaterialCommunityIcons name="crown" size={32} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Alles ontgrendelen</Text>
          <Text style={styles.heroSubtitle}>Reclamevrij, 4K, offline — onbeperkt genieten</Text>
        </View>

        {/* Pricing Plans */}
        <View style={styles.plansSection}>
          <Text style={styles.sectionTitle}>Kies je abonnement</Text>

          {PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selectedPlan === plan.id && styles.planCardSelected]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>POPULAIRST</Text>
                </View>
              )}

              {plan.savings && (
                <View style={styles.savingsBadge}>
                  <MaterialCommunityIcons name="percent" size={14} color="#fff" />
                  <Text style={styles.savingsText}>{plan.savings}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.radioButton}>
                  {selectedPlan === plan.id && <View style={styles.radioButtonInner} />}
                </View>
              </View>

              <View style={styles.priceArea}>
                <Text style={styles.priceText}>{plan.price}</Text>
                <Text style={styles.periodText}>{plan.period}</Text>
              </View>

              {plan.id === "yearly" && (
                <View style={styles.costBreakdown}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.accent} />
                  <Text style={styles.costBreakdownText}>Slechts €5/maand, altijd opzegbaar</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>Dit krijg je</Text>

          <View style={styles.benefitsGrid}>
            {BENEFITS.map((benefit, idx) => (
              <View key={idx} style={styles.benefitItem}>
                <View style={styles.benefitIcon}>
                  <MaterialCommunityIcons name={benefit.icon as any} size={18} color={COLORS.accent} />
                </View>
                <Text style={styles.benefitText}>{benefit.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#FF5252" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* CTA Buttons */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: COLORS.accent }]}
            onPress={handlePurchase}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="card" size={20} color="#fff" />
                <Text style={[styles.primaryButtonText, { color: "#fff" }]}>7 dagen gratis proberen</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleRestore} disabled={loading}>
            <MaterialCommunityIcons name="refresh" size={18} color={COLORS.accent} />
            <Text style={styles.secondaryButtonText}>Aankoop herstellen</Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Eerste 7 dagen gratis, daarna {selectedPlan === "weekly" ? "€2,99/week" : selectedPlan === "monthly" ? "€7,99/maand" : "€59,99/jaar"}. Altijd opzegbaar.
          </Text>
        </View>

        {/* Legal */}
        <View style={styles.legalSection}>
          <TouchableOpacity>
            <Text style={styles.legalLink}>Privacybeleid</Text>
          </TouchableOpacity>
          <View style={styles.legalDot} />
          <TouchableOpacity>
            <Text style={styles.legalLink}>Gebruiksvoorwaarden</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },

  scrollContent: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 40 },

  heroSection: { alignItems: "center", marginBottom: 32, paddingTop: 12 },
  heroBadge: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  heroTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 24, color: COLORS.text, marginBottom: 8, textAlign: "center" },
  heroSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },

  plansSection: { marginBottom: 32, gap: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, marginBottom: 16 },

  planCard: {
    position: "relative",
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  planCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(229,9,20,0.12)",
  },

  popularBadge: {
    position: "absolute",
    top: -10,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
  },
  popularBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#fff",
  },

  savingsBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
  },
  savingsText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" },

  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  planName: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },

  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },

  priceArea: { gap: 2, marginBottom: 8 },
  priceText: { fontFamily: "Inter_800ExtraBold", fontSize: 28, color: COLORS.text },
  periodText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },

  costBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  costBreakdownText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.accent,
    flex: 1,
  },

  featuresSection: { marginBottom: 32 },
  benefitsGrid: { gap: 12 },

  benefitItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  benefitText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
    paddingTop: 2,
  },

  errorBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,82,82,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,82,82,0.3)",
    marginBottom: 20,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#FF5252", flex: 1 },

  ctaSection: { gap: 12, marginBottom: 20 },

  primaryButton: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 15 },

  secondaryButton: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  secondaryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.accent },

  disclaimer: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
  },

  legalSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  legalLink: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent },
  legalDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted },
});
