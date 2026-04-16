import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PurchasesOffering } from "react-native-purchases";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { getCurrentOffering } from "@/lib/purchases";
import { useUiStore } from "@/store/uiStore";

type PlanId = "weekly" | "monthly" | "yearly";

/** Static display config — prices are filled in at runtime from RevenueCat. */
const PLAN_CONFIG: {
  id: PlanId;
  label: string;
  sub: string;
  popular: boolean;
  savings: string | null;
  breakdown: string | null;
}[] = [
  {
    id: "weekly",
    label: "Wekelijks",
    sub: "/week",
    popular: false,
    savings: null,
    breakdown: null,
  },
  {
    id: "monthly",
    label: "Maandelijks",
    sub: "/maand",
    popular: true,
    savings: null,
    breakdown: null,
  },
  {
    id: "yearly",
    label: "Jaarlijks",
    sub: "/jaar",
    popular: false,
    savings: "Beste waarde",
    breakdown: null,
  },
];

/** Extract the localised price string for a plan from a RevenueCat offering. */
function getPlanPrice(offering: PurchasesOffering | null, planId: PlanId): string | null {
  if (!offering) return null;
  const pkg =
    planId === "yearly"
      ? offering.annual
      : planId === "monthly"
        ? offering.monthly
        : offering.weekly;
  return pkg?.product?.priceString ?? null;
}

const PERKS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "ban-outline", label: "Reclamevrij streamen op alle content" },
  { icon: "film-outline", label: "Onbeperkt films & series kijken" },
  { icon: "tv-outline", label: "Tot 4K & HDR beeldkwaliteit" },
  { icon: "text-outline", label: "Ondertitels in 30+ talen" },
  { icon: "phone-portrait-outline", label: "Streamen op 3 apparaten tegelijk" },
  { icon: "rocket-outline", label: "Vroege toegang tot nieuwe releases" },
  { icon: "speedometer-outline", label: "Afspeelsnelheid (0,5× – 2×)" },
  { icon: "sync-outline", label: "Kijkgeschiedenis gesynchroniseerd" },
];

export default function PremiumScreen() {
  const closeMenu = useUiStore((s) => s.closeNexoraMenu);
  const { isPremium, authEmail, purchasePremiumSubscription, restorePremiumAccess } =
    useNexora();
  const insets = useSafeAreaInsets();

  const [plan, setPlan] = useState<PlanId>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True right after a successful purchase — prevents brief flash back to paywall. */
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const fetchedOffering = useRef(false);

  useEffect(() => {
    closeMenu();
  }, [closeMenu]);

  useEffect(() => {
    if (fetchedOffering.current) return;
    fetchedOffering.current = true;
    getCurrentOffering()
      .then(setOffering)
      .catch(() => setOffering(null))
      .finally(() => setOfferingsLoading(false));
  }, []);

  const goBack = useCallback(() => {
    try {
      if (
        typeof (router as any).canGoBack === "function" &&
        (router as any).canGoBack()
      ) {
        router.back();
        return;
      }
    } catch {}
    router.replace("/(tabs)/home" as any);
  }, []);

  const handlePurchase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await purchasePremiumSubscription(plan);
      if (result.ok) {
        setPurchaseComplete(true);
      } else if (!result.cancelled) {
        setError(result.reason ?? "Betaling mislukt. Probeer het opnieuw.");
      }
    } catch {
      setError("Betaling mislukt. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }, [plan, purchasePremiumSubscription]);

  const handleRestore = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await restorePremiumAccess();
      if (result.ok) {
        setPurchaseComplete(true);
      } else {
        setError(result.reason ?? "Geen aankoop gevonden om te herstellen.");
      }
    } catch {
      setError("Herstel mislukt. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }, [restorePremiumAccess]);

  const selectedConfig = PLAN_CONFIG.find((p) => p.id === plan)!;
  const livePrice = getPlanPrice(offering, plan);
  const priceLabel = livePrice
    ? `${livePrice}${selectedConfig.sub}`
    : selectedConfig.sub;

  // ─── Already premium ───────────────────────────────────────────────────────
  if (isPremium || purchaseComplete) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={goBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <View style={s.activeWrap}>
          <LinearGradient
            colors={[COLORS.accentGlowStrong, COLORS.accentGlow]}
            style={s.activeBadge}
          >
            <MaterialCommunityIcons name="crown" size={44} color={COLORS.accent} />
          </LinearGradient>
          <Text style={s.activeTitle}>Nexora+ Actief</Text>
          <Text style={s.activeSub}>
            Je hebt toegang tot alle premium content
            {authEmail ? `\n${authEmail}` : ""}.
          </Text>
          <TouchableOpacity style={s.activeBtn} onPress={goBack} activeOpacity={0.86}>
            <Text style={s.activeBtnText}>Terug naar Nexora</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Paywall ───────────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={goBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Nexora+</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* Hero */}
        <LinearGradient
          colors={["rgba(192,38,211,0.18)", COLORS.background]}
          style={s.hero}
        >
          <LinearGradient
            colors={[COLORS.accent, COLORS.accentAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.heroIcon}
          >
            <MaterialCommunityIcons name="crown" size={30} color="#fff" />
          </LinearGradient>
          <Text style={s.heroTitle}>Alles ontgrendelen</Text>
          <Text style={s.heroSub}>
            Reclamevrij · 4K · Offline · Onbeperkt
          </Text>
        </LinearGradient>

        {/* Plan selector */}
        <Text style={s.sectionLabel}>Kies je abonnement</Text>

        {offeringsLoading ? (
          <View style={s.offeringsLoader}>
            <ActivityIndicator color={COLORS.accent} size="small" />
            <Text style={s.offeringsLoaderText}>Abonnementen laden…</Text>
          </View>
        ) : (
          PLAN_CONFIG.map((p) => {
            const active = plan === p.id;
            const price = getPlanPrice(offering, p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.planCard, active && s.planCardActive]}
                onPress={() => setPlan(p.id)}
                activeOpacity={0.84}
              >
                {p.popular && (
                  <View style={s.popularTag}>
                    <Text style={s.popularTagText}>MEEST GEKOZEN</Text>
                  </View>
                )}
                <View style={s.planRow}>
                  <View style={[s.radio, active && s.radioActive]}>
                    {active && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{p.label}</Text>
                    {p.savings ? (
                      <View style={s.savingsTag}>
                        <Text style={s.savingsTagText}>{p.savings}</Text>
                      </View>
                    ) : null}
                    {p.breakdown ? (
                      <Text style={s.planBreakdown}>{p.breakdown}</Text>
                    ) : null}
                  </View>
                  <View style={s.planPriceWrap}>
                    {price ? (
                      <>
                        <Text style={[s.planPrice, active && s.planPriceActive]}>
                          {price}
                        </Text>
                        <Text style={s.planPeriod}>{p.sub}</Text>
                      </>
                    ) : (
                      <Text style={[s.planPrice, active && s.planPriceActive]}>—</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Perks */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>
          Inbegrepen bij Nexora+
        </Text>
        <View style={s.perksCard}>
          {PERKS.map((perk, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={s.perkDivider} />}
              <View style={s.perkRow}>
                <View style={s.perkIcon}>
                  <Ionicons name={perk.icon} size={17} color={COLORS.accent} />
                </View>
                <Text style={s.perkLabel}>{perk.label}</Text>
                <Ionicons name="checkmark" size={16} color={COLORS.accent} />
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Error */}
        {error ? (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={17} color={COLORS.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Primary CTA */}
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={handlePurchase}
          disabled={loading}
          activeOpacity={0.86}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card-outline" size={19} color="#fff" />
              <Text style={s.primaryBtnText}>
                7 dagen gratis — dan {priceLabel}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity
          style={s.restoreBtn}
          onPress={handleRestore}
          disabled={loading}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="refresh" size={16} color={COLORS.accent} />
          <Text style={s.restoreBtnText}>Aankoop herstellen</Text>
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          Eerste 7 dagen gratis, daarna automatisch verlengd voor {priceLabel}.
          Altijd opzegbaar via de App Store of Play Store.
        </Text>

        {/* Legal */}
        <View style={s.legal}>
          <TouchableOpacity onPress={() => router.push("/legal" as any)}>
            <Text style={s.legalLink}>Privacybeleid</Text>
          </TouchableOpacity>
          <Text style={s.legalDot}>·</Text>
          <TouchableOpacity onPress={() => router.push("/legal" as any)}>
            <Text style={s.legalLink}>Gebruiksvoorwaarden</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.text,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  // Scroll
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: 32,
    marginBottom: 8,
    borderRadius: 16,
    marginTop: 12,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 26,
    color: COLORS.text,
    marginBottom: 8,
    textAlign: "center",
  },
  heroSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  // Section label
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
    marginLeft: 2,
  },

  // Offerings loading skeleton
  offeringsLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
    justifyContent: "center",
  },
  offeringsLoaderText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Plan cards
  planCard: {    position: "relative",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.glass,
    marginBottom: 10,
  },
  planCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(192,38,211,0.08)",
  },
  popularTag: {
    position: "absolute",
    top: -10,
    left: 14,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  popularTagText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
    letterSpacing: 0.8,
  },
  savingsTag: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "rgba(192,38,211,0.18)",
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  savingsTagText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.accent,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioActive: {
    borderColor: COLORS.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  planName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
  },
  planBreakdown: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 2,
  },
  planPriceWrap: {
    alignItems: "flex-end",
  },
  planPrice: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
    color: COLORS.text,
  },
  planPriceActive: {
    color: COLORS.accent,
  },
  planPeriod: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // Perks
  perksCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",
    marginBottom: 24,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  perkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.accentGlow,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  perkLabel: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
  },
  perkDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginLeft: 58,
  },

  // Error
  errorBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(248,113,113,0.10)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.error,
    flex: 1,
  },

  // CTA
  primaryBtn: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 10,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  restoreBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
    backgroundColor: COLORS.accentGlow,
    marginBottom: 16,
  },
  restoreBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.accent,
  },

  // Legal
  disclaimer: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 20,
  },
  legal: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
  },
  legalLink: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.accent,
  },
  legalDot: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Already premium state
  activeWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  activeBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  activeTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
    color: COLORS.text,
    textAlign: "center",
  },
  activeSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  activeBtn: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  activeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
});