import React from "react";
import { router } from "expo-router";
import { EnhancedPaywall } from "@/components/paywall/EnhancedPaywall";
import { useUiStore } from "@/store/uiStore";

/** Main Premium Product Screen */
export default function PremiumScreen() {
  const closeMenu = useUiStore((state) => state.closeNexoraMenu);

  React.useEffect(() => {
    closeMenu();
  }, [closeMenu]);

  return <EnhancedPaywall visible onDismiss={() => router.back()} />;
}