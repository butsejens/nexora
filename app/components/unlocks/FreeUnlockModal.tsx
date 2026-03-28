import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "@/constants/colors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const { height } = Dimensions.get("window");

export interface FreeUnlockState {
  remaining: number; // remaining unlocks
  lastReset: string; // ISO timestamp of last reset
  nextReset: string; // ISO timestamp of next reset
  canUnlock: boolean;
}

export const FreeUnlockModal = React.memo(function FreeUnlockModal({
  visible,
  onDismiss,
  onUnlocked,
  isPremium,
}: {
  visible: boolean;
  onDismiss: () => void;
  onUnlocked?: () => void;
  isPremium?: boolean;
}) {
  const [state, setState] = useState<FreeUnlockState | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Load unlock state
  useEffect(() => {
    if (visible) {
      initializeUnlockState();
    }
  }, [visible]);

  // Countdown timer
  useEffect(() => {
    if (!state || unlocked) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const resetTime = new Date(state.nextReset).getTime();
      const diff = resetTime - now;

      if (diff <= 0) {
        setCountdown("Ready for next unlock!");
        setState((prev) => prev ? { ...prev, canUnlock: true } : null);
      } else {
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setCountdown(`${hours}h ${minutes}m ${secs}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [state, unlocked]);

  // Initialize unlock state
  const initializeUnlockState = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem("nexora_prediction_unlock");

      if (!stored) {
        // First time
        const nextReset = new Date();
        nextReset.setUTCHours(24, 0, 0, 0);
        setState({
          remaining: 1,
          lastReset: new Date().toISOString(),
          nextReset: nextReset.toISOString(),
          canUnlock: true,
        });
      } else {
        const parsed = JSON.parse(stored);
        const now = new Date().getTime();
        const nextResetTime = new Date(parsed.nextReset).getTime();

        // Check if reset time passed
        if (now > nextResetTime) {
          const nextReset = new Date();
          nextReset.setUTCHours(24, 0, 0, 0);
          setState({
            remaining: 1,
            lastReset: new Date().toISOString(),
            nextReset: nextReset.toISOString(),
            canUnlock: true,
          });
        } else {
          setState({
            ...parsed,
            canUnlock: parsed.remaining > 0,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load unlock state:", err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Unlock
  const handleUnlock = useCallback(async () => {
    if (!state || !state.canUnlock) return;

    try {
      setUnlocking(true);

      // Simulate rewarded ad/unlock process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Update state
      const newState = {
        ...state,
        remaining: Math.max(0, state.remaining - 1),
        lastReset: new Date().toISOString(),
        canUnlock: state.remaining > 1,
      };

      setState(newState);
      await AsyncStorage.setItem("nexora_prediction_unlock", JSON.stringify(newState));

      setUnlocked(true);
      onUnlocked?.();

      // Close after success
      setTimeout(() => {
        setUnlocked(false);
        onDismiss();
      }, 2500);
    } catch (err) {
      console.error("Unlock failed:", err);
    } finally {
      setUnlocking(false);
    }
  }, [state, onUnlocked, onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        {unlocked ? (
          // Success State
          <LinearGradient colors={[COLORS.background, "#1a1a2e"]} style={styles.successContainer}>
            <View style={styles.successContent}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={80} color={COLORS.accent} />
              </View>
              <Text style={styles.successTitle}>Prediction Unlocked!</Text>
              <Text style={styles.successText}>
                You now have access to premium predictions.{"\n"}Use them wisely!
              </Text>

              <View style={styles.nextUnlockInfo}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.textMuted} />
                <Text style={styles.nextUnlockText}>Next unlock: {countdown}</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: COLORS.accent }]} onPress={onDismiss}>
              <Text style={[styles.primaryButtonText, { color: "#fff" }]}>Continue Using App</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          // Main Unlock State
          <LinearGradient colors={[COLORS.background, "#1a1a2e"]} style={styles.container}>
            {loading ? (
              <View style={styles.centerContent}>
                <ActivityIndicator size="large" color={COLORS.accent} />
              </View>
            ) : state ? (
              <>
                {/* Header */}
                <View style={styles.header}>
                  <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={styles.headerTitle}>Free Predictions</Text>
                  <View style={{ width: 24 }} />
                </View>

                {/* Content */}
                <View style={styles.content}>
                  {/* Icon & Title */}
                  <View style={styles.titleArea}>
                    <View style={styles.iconContainer}>
                      <MaterialCommunityIcons name="target" size={48} color={COLORS.accent} />
                    </View>
                    <Text style={styles.title}>
                      {state.canUnlock && !isPremium ? "Claim Your Daily Free Unlock" : isPremium ? "Premium Predictions Unlimited" : "Unlock Expired"}
                    </Text>
                  </View>

                  {/* Status */}
                  <View style={styles.statusSection}>
                    {isPremium ? (
                      <>
                        <Text style={styles.statusText}>As a premium member, you have{"\n"}unlimited daily predictions!</Text>
                        <View style={styles.benefitsList}>
                          <BenefitItem icon="sparkles" text="Unlimited AI Predictions" />
                          <BenefitItem icon="trending-up" text="Advanced Analytics" />
                          <BenefitItem icon="history" text="Full Prediction History" />
                        </View>
                      </>
                    ) : state.canUnlock ? (
                      <>
                        <View style={styles.unlocksRemaining}>
                          <Text style={styles.unlockCount}>{state.remaining}</Text>
                          <Text style={styles.unlockLabel}>unlock available today</Text>
                        </View>

                        <Text style={styles.description}>
                          Get one free AI-powered prediction per day. After using your free unlock, you can watch ads for more or upgrade to premium for unlimited.
                        </Text>

                        <View style={styles.countdownBox}>
                          <Ionicons name="time-outline" size={20} color={COLORS.accent} />
                          <View style={styles.countdownText}>
                            <Text style={styles.countdownLabel}>Next free unlock resets in</Text>
                            <Text style={styles.countdownTime}>{countdown}</Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.expiredBox}>
                          <Ionicons name="alert-circle" size={32} color="#FFB74D" />
                          <Text style={styles.expiredText}>Daily unlocks exhausted</Text>
                        </View>
                        <Text style={styles.description}>You've used your free prediction unlock for today.</Text>
                        <View style={styles.countdownBox}>
                          <Ionicons name="time-outline" size={20} color={COLORS.accent} />
                          <View style={styles.countdownText}>
                            <Text style={styles.countdownLabel}>Reset in</Text>
                            <Text style={styles.countdownTime}>{countdown}</Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>

                  {/* Methods */}
                  {!isPremium && (
                    <View style={styles.methodsSection}>
                      <Text style={styles.methodsTitle}>Your Options</Text>

                      {state.canUnlock && (
                        <TouchableOpacity
                          style={[styles.methodCard, styles.primaryCard]}
                          onPress={handleUnlock}
                          disabled={unlocking}
                        >
                          <View style={styles.methodIcon}>
                            {unlocking ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <MaterialCommunityIcons name="gift" size={24} color="#fff" />
                            )}
                          </View>
                          <View style={styles.methodInfo}>
                            <Text style={styles.methodTitle}>Watch Ad & Unlock</Text>
                            <Text style={styles.methodDesc}>30 seconds · Get 1 free prediction</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="#fff" />
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity style={styles.methodCard}>
                        <View style={styles.methodIcon} style={{ backgroundColor: "rgba(229,9,20,0.2)" }}>
                          <MaterialCommunityIcons name="crown" size={24} color={COLORS.accent} />
                        </View>
                        <View style={styles.methodInfo}>
                          <Text style={styles.methodTitle}>Go Premium</Text>
                          <Text style={styles.methodDesc}>Unlimited predictions + more features</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Bottom CTA */}
                {state.canUnlock && !isPremium && (
                  <View style={styles.bottomAction}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: COLORS.accent, flex: 1 }]}
                      onPress={handleUnlock}
                      disabled={unlocking}
                    >
                      {unlocking ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="play" size={20} color="#fff" />
                          <Text style={[styles.primaryButtonText, { color: "#fff" }]}>Watch Ad & Unlock</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : null}
          </LinearGradient>
        )}
      </View>
    </Modal>
  );
});

// Benefit Item
function BenefitItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.benefitItem}>
      <MaterialCommunityIcons name={icon as any} size={18} color={COLORS.accent} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },

  container: { height: height * 0.9, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", flexDirection: "column" },
  successContainer: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", paddingHorizontal: 20, justifyContent: "space-between", paddingVertical: 60 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  centerContent: { flex: 1, justifyContent: "center", alignItems: "center" },

  titleArea: { alignItems: "center", marginBottom: 32 },
  iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(229,9,20,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontFamily: "Inter_800ExtraBold", fontSize: 20, color: COLORS.text, textAlign: "center" },

  statusSection: { gap: 16, marginBottom: 32 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 21 },

  unlocksRemaining: { alignItems: "center", paddingVertical: 16, backgroundColor: "rgba(229,9,20,0.12)", borderRadius: 12 },
  unlockCount: { fontFamily: "Inter_800ExtraBold", fontSize: 32, color: COLORS.accent },
  unlockLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginTop: 4 },

  description: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 19 },

  countdownBox: { flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(229,9,20,0.12)", borderWidth: 1, borderColor: "rgba(229,9,20,0.2)" },
  countdownText: { flex: 1, gap: 2 },
  countdownLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  countdownTime: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.accent },

  expiredBox: { alignItems: "center", paddingVertical: 20, gap: 8 },
  expiredText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FFB74D" },

  benefitsList: { gap: 12 },
  benefitItem: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(229,9,20,0.12)" },
  benefitText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text, flex: 1 },

  methodsSection: { gap: 12 },
  methodsTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text, marginBottom: 4 },

  methodCard: { flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: COLORS.border },
  primaryCard: { borderColor: COLORS.accent, backgroundColor: "rgba(229,9,20,0.12)" },

  methodIcon: { width: 48, height: 48, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  methodInfo: { flex: 1, gap: 2 },
  methodTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  methodDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },

  bottomAction: { paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 32, gap: 12 },
  primaryButton: { flexDirection: "row", gap: 12, justifyContent: "center", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  primaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 15 },

  // Success
  successContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  successIcon: { alignItems: "center" },
  successTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 24, color: COLORS.text, textAlign: "center" },
  successText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 21 },

  nextUnlockInfo: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(229,9,20,0.12)" },
  nextUnlockText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
});
