import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { COLORS } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { useNexora } from "@/context/NexoraContext";
import { PremiumSettingsHub } from "@/components/settings/PremiumSettingsHub";
import { PremiumAuthFlow } from "@/components/auth/PremiumAuthFlow";
import { EnhancedPaywall } from "@/components/paywall/EnhancedPaywall";
import { FreeUnlockModal } from "@/components/unlocks/FreeUnlockModal";
import { usePremiumProduct } from "@/hooks/usePremiumProduct";

/** Main Premium Product Screen (Settings) */
export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const context = useNexora();
  const premium = usePremiumProduct();

  const [showPaywall, setShowPaywall] = useState(false);
  const [showFreeUnlock, setShowFreeUnlock] = useState(false);

  const handleLogout = useCallback(() => {
    premium.handleLogout();
    router.back();
  }, [premium, router]);

  const handlePremiumUpgrade = useCallback(() => {
    setShowPaywall(true);
  }, []);

  const handlePremiumUpgradeSuccess = useCallback(() => {
    setShowPaywall(false);
    // Refresh premium status (in real app, this would sync with Firebase/RevenueCat)
  }, []);

  // Show auth flow if not authenticated
  if (premium.authState === "unauthenticated") {
    return (
      <PremiumAuthFlow
        onAuthSuccess={() => {
          premium.initializeAuth();
        }}
      />
    );
  }

  // Show loading state
  if (premium.authState === "loading") {
    return (
      <LinearGradient colors={[COLORS.background, "#1a1a2e"]} style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </LinearGradient>
    );
  }

  // Show authenticated settings hub
  return (
    <View style={styles.container}>
      <PremiumSettingsHub onLogout={handleLogout} />

      {/* Paywall Modal */}
      <EnhancedPaywall visible={showPaywall} onDismiss={() => setShowPaywall(false)} />

      {/* Free Unlock Modal */}
      <FreeUnlockModal
        visible={showFreeUnlock}
        onDismiss={() => setShowFreeUnlock(false)}
        onUnlocked={() => {
          // Handle unlock success
          premium.handleUnlocked();
        }}
        isPremium={premium.isPremium}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
