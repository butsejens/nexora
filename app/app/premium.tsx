import React from "react";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EnhancedPaywall } from "@/components/paywall/EnhancedPaywall";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { useTranslation } from "@/lib/useTranslation";
import { useUiStore } from "@/store/uiStore";

/** Main Premium Product Screen */
export default function PremiumScreen() {
  const closeMenu = useUiStore((state) => state.closeNexoraMenu);
  const { isPremium, activatePremium } = useNexora();
  const { t } = useTranslation();

  React.useEffect(() => {
    closeMenu();
  }, [closeMenu]);

  React.useEffect(() => {
    if (!isPremium) {
      void activatePremium();
    }
  }, [activatePremium, isPremium]);

  if (isPremium) {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark-circle" size={54} color={COLORS.accent} />
          </View>
          <Text style={styles.title}>{t("premium.premiumActive")}</Text>
          <Text style={styles.body}>
            {t("premium.allFeaturesUnlocked")}
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()} activeOpacity={0.86}>
            <Text style={styles.buttonText}>{t("premium.backToNexora")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <EnhancedPaywall visible onDismiss={() => router.back()} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
    padding: 24,
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentGlow,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
  },
  body: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  button: {
    marginTop: 4,
    minWidth: 220,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});