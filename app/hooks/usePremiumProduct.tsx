import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNexora } from "@/context/NexoraContext";

/**
 * Complete Premium Product Manager
 * Coordinates all premium features: auth, paywall, settings, free unlocks, module visibility
 */
export const usePremiumProduct = () => {
  const context = useNexora();
  
  // Auth state
  const [authState, setAuthState] = useState<"loading" | "unauthenticated" | "authenticated">("loading");
  const [authError, setAuthError] = useState<string | null>(null);

  // Premium state
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [freeUnlockModalVisible, setFreeUnlockModalVisible] = useState(false);

  // Module visibility
  const [moduleVisibility, setModuleVisibility] = useState({
    sport: true,
    movies: true,
    series: true,
    livetv: true,
  });

  // Initialize auth state on startup
  useEffect(() => {
    initializeAuth();
  }, []);

  // Keep premium auth state in sync with the app-wide auth source of truth.
  useEffect(() => {
    if (!context.authReady) {
      setAuthState("loading");
      return;
    }
    setAuthState(context.isAuthenticated ? "authenticated" : "unauthenticated");
  }, [context.authReady, context.isAuthenticated]);

  // Load module visibility from storage
  useEffect(() => {
    loadModuleVisibility();
  }, []);

  const initializeAuth = useCallback(async () => {
    try {
      if (!context.authReady) {
        setAuthState("loading");
        return;
      }
      setAuthState(context.isAuthenticated ? "authenticated" : "unauthenticated");
      setAuthError(null);
    } catch (err) {
      console.error("Auth init failed:", err);
      setAuthState("unauthenticated");
      setAuthError("Failed to restore session");
    }
  }, [context.authReady, context.isAuthenticated]);

  const loadModuleVisibility = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem("nexora_module_visibility");
      if (stored) {
        setModuleVisibility(JSON.parse(stored));
      }
    } catch (err) {
      console.error("Failed to load module visibility:", err);
    }
  }, []);

  const updateModuleVisibility = useCallback(
    async (modules: typeof moduleVisibility) => {
      try {
        setModuleVisibility(modules);
        await AsyncStorage.setItem("nexora_module_visibility", JSON.stringify(modules));
      } catch (err) {
        console.error("Failed to update module visibility:", err);
      }
    },
    []
  );

  const handleAuthentication = useCallback(async (method: "google" | "apple" | "email") => {
    try {
      setAuthError(null);
      
      switch (method) {
        case "google":
          // TODO: Implement actual Google OAuth via expo-auth-session
          setAuthError("Google Sign-In integration coming soon");
          break;
        case "apple":
          // TODO: Implement actual Apple Sign-In via expo-apple-authentication
          setAuthError("Apple Sign-In integration coming soon");
          break;
        case "email":
          // Email handled in component
          await initializeAuth();
          break;
      }

      await initializeAuth();
    } catch (err) {
      setAuthError(String(err));
    }
  }, [initializeAuth]);

  const handleLogout = useCallback(async () => {
    try {
      await context.signOut?.();
      setAuthState("unauthenticated");
      setSettingsModalVisible(false);
      setAuthError(null);
    } catch (err) {
      setAuthError(String(err));
    }
  }, [context]);

  const handleShowPremiumPaywall = useCallback(() => {
    if (!context.isPremium) {
      setPremiumModalVisible(true);
    }
  }, [context.isPremium]);

  const handleShowSettingsHub = useCallback(() => {
    setSettingsModalVisible(true);
  }, []);

  const handleShowFreeUnlock = useCallback(() => {
    if (!context.isPremium) {
      setFreeUnlockModalVisible(true);
    }
  }, [context.isPremium]);

  const handleUnlocked = useCallback(() => {
    // Called when free unlock is successful
    // Reset any UI state that depends on unlock count
  }, []);

  return {
    // Auth
    authState,
    authError,
    isAuthenticated: authState === "authenticated",
    handleAuthentication,
    handleLogout,
    initializeAuth,
    
    // Premium
    isPremium: context.isPremium ?? false,
    premiumModalVisible,
    setPremiumModalVisible,
    handleShowPremiumPaywall,
    
    // Settings
    settingsModalVisible,
    setSettingsModalVisible,
    handleShowSettingsHub,
    
    // Free Unlocks
    freeUnlockModalVisible,
    setFreeUnlockModalVisible,
    handleShowFreeUnlock,
    handleUnlocked,
    
    // Module Visibility
    moduleVisibility,
    updateModuleVisibility,
    
    // User
    user: context.authEmail,
    
    // Context methods
    purchasePremiumSubscription: context.purchasePremiumSubscription,
    restorePremiumAccess: context.restorePremiumAccess,
  };
};

/**
 * Hook to check if specific module/content is available
 */
export const useModuleAccess = (module: "sport" | "movies" | "series" | "livetv") => {
  const { moduleVisibility } = usePremiumProduct();
  return moduleVisibility[module] ?? true;
};

/**
 * Hook to check if specific feature requires premium
 */
export const usePremiumFeature = (feature: string) => {
  const { isPremium } = usePremiumProduct();
  const features = {
    "ad-free": { requiresPremium: true },
    "offline-download": { requiresPremium: true },
    "predictions": { requiresPremium: false }, // free tier: 1/day
    "playback-speed": { requiresPremium: true },
    "multi-lang": { requiresPremium: true },
  };
  
  const featureConfig = features[feature as keyof typeof features];
  if (!featureConfig) return { requiresPremium: false, allowed: true };
  
  return {
    requiresPremium: featureConfig.requiresPremium,
    allowed: !featureConfig.requiresPremium || isPremium,
  };
};

/**
 * Export singleton instance for app-wide use
 */
export function PremiumProductProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
