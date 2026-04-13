import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";

import { ENV } from "@/constants/env";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import {
  authenticateWithAppleToken,
  authenticateWithGoogleIdToken,
  isFirebaseAuthConfigured,
} from "@/lib/firebase-auth";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useTranslation } from "@/lib/useTranslation";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "signin" | "signup";

const GOOGLE_PLACEHOLDER_CLIENT_ID =
  "nexora-missing-client-id.apps.googleusercontent.com";

export default function AuthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithEmail, isAuthenticated, authReady } = useNexora();
  const hasCompletedOnboarding = useOnboardingStore(
    (state) => state.hasCompletedOnboarding,
  );
  const onboardingHydrated = useOnboardingStore((state) => state.hasHydrated);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [shouldAdvanceAfterAuth, setShouldAdvanceAfterAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<
    "google" | "apple" | "email" | "biometric" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === "ios");
  const [biometricType, setBiometricType] = useState<
    "faceid" | "fingerprint" | "generic" | null
  >(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const firebaseConfigured = isFirebaseAuthConfigured();
  const hasGoogleClientId = Boolean(
    ENV.firebase.iosClientId ||
    ENV.firebase.androidClientId ||
    ENV.firebase.webClientId,
  );

  const [googleRequest, googleResponse, promptGoogleSignIn] =
    Google.useIdTokenAuthRequest({
      iosClientId: ENV.firebase.iosClientId || GOOGLE_PLACEHOLDER_CLIENT_ID,
      androidClientId:
        ENV.firebase.androidClientId ||
        ENV.firebase.webClientId ||
        GOOGLE_PLACEHOLDER_CLIENT_ID,
      webClientId: ENV.firebase.webClientId || GOOGLE_PLACEHOLDER_CLIENT_ID,
    });

  useEffect(() => {
    if (!authReady || !isAuthenticated || !shouldAdvanceAfterAuth) {
      return;
    }
    if (!onboardingHydrated) {
      return;
    }

    setShouldAdvanceAfterAuth(false);
    router.replace(
      hasCompletedOnboarding ? "/(tabs)/home" : "/onboarding/quick-start",
    );
  }, [
    authReady,
    hasCompletedOnboarding,
    isAuthenticated,
    onboardingHydrated,
    router,
    shouldAdvanceAfterAuth,
  ]);

  useEffect(() => {
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Detect biometric hardware (Face ID, Touch ID, Fingerprint)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        if (!compatible || !mounted) return;
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!enrolled || !mounted) return;
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (!mounted) return;
        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
          )
        ) {
          setBiometricType("faceid");
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          setBiometricType("fingerprint");
        } else {
          setBiometricType("generic");
        }
      } catch {
        // biometrics not available
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const completeGoogleAuth = async () => {
      if (googleResponse?.type !== "success") return;
      const idToken =
        (googleResponse.authentication as any)?.idToken ||
        (googleResponse.params as any)?.id_token ||
        "";
      const accessToken =
        (googleResponse.authentication as any)?.accessToken || null;

      if (!idToken) {
        setError("Google sign-in did not return an ID token.");
        setShouldAdvanceAfterAuth(false);
        setLoadingProvider(null);
        return;
      }

      try {
        await authenticateWithGoogleIdToken(idToken, accessToken);
      } catch (authError: any) {
        setShouldAdvanceAfterAuth(false);
        setError(String(authError?.message || "Google sign-in failed."));
      } finally {
        setLoadingProvider(null);
      }
    };

    void completeGoogleAuth();
  }, [googleResponse]);

  const topPad = useMemo(
    () => (Platform.OS === "web" ? 48 : insets.top + 14),
    [insets.top],
  );

  const handleGoogleSignIn = async () => {
    setError(null);
    if (!firebaseConfigured) {
      setShouldAdvanceAfterAuth(false);
      router.replace(
        hasCompletedOnboarding ? "/(tabs)/home" : "/onboarding/quick-start",
      );
      return;
    }
    if (!hasGoogleClientId) {
      setError("Google sign-in is niet geconfigureerd voor deze build.");
      return;
    }
    setShouldAdvanceAfterAuth(true);
    setLoadingProvider("google");
    try {
      const result = await promptGoogleSignIn();
      if (result.type !== "success") {
        setShouldAdvanceAfterAuth(false);
        setLoadingProvider(null);
      }
    } catch (authError: any) {
      setShouldAdvanceAfterAuth(false);
      setError(String(authError?.message || "Unable to start Google sign-in."));
      setLoadingProvider(null);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    if (!firebaseConfigured) {
      setShouldAdvanceAfterAuth(false);
      router.replace(
        hasCompletedOnboarding ? "/(tabs)/home" : "/onboarding/quick-start",
      );
      return;
    }
    setShouldAdvanceAfterAuth(true);
    setLoadingProvider("apple");
    try {
      const rawNonce = `${Date.now()}-${Math.random()}`;
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        throw new Error("Apple sign-in did not return an identity token.");
      }
      await authenticateWithAppleToken(credential.identityToken, rawNonce);
    } catch (authError: any) {
      setShouldAdvanceAfterAuth(false);
      if (String(authError?.code || "") !== "ERR_REQUEST_CANCELED") {
        setError(String(authError?.message || "Apple sign-in failed."));
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailAuth = async () => {
    setError(null);
    setShouldAdvanceAfterAuth(true);
    setLoadingProvider("email");
    try {
      await signInWithEmail(email.trim(), password);
    } catch (authError: any) {
      setShouldAdvanceAfterAuth(false);
      setError(String(authError?.message || "Email authentication failed."));
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleBiometricAuth = async () => {
    setError(null);
    setLoadingProvider("biometric");
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:
          biometricType === "faceid"
            ? t("auth.biometricUnlock")
            : biometricType === "fingerprint"
              ? t("auth.biometricUnlockFingerprint")
              : t("auth.biometricUnlockGeneric"),
        cancelLabel: t("auth.signIn"),
        disableDeviceFallback: false,
      });
      if (result.success) {
        setShouldAdvanceAfterAuth(false);
        router.replace(
          hasCompletedOnboarding ? "/(tabs)/home" : "/onboarding/quick-start",
        );
      } else {
        setError(t("auth.biometricFailed"));
      }
    } catch {
      setError(t("auth.biometricFailed"));
    } finally {
      setLoadingProvider(null);
    }
  };

  const biometricLabel =
    biometricType === "faceid"
      ? t("auth.biometricUnlock")
      : biometricType === "fingerprint"
        ? t("auth.biometricUnlockFingerprint")
        : t("auth.biometricUnlockGeneric");
  const biometricIcon =
    biometricType === "faceid" ? "scan-outline" : "finger-print-outline";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.hero}>
          <Text style={styles.logoN}>N</Text>
          <Text style={styles.logoWord}>EXORA</Text>
        </View>

        {authReady && isAuthenticated ? (
          <TouchableOpacity
            style={styles.resumeSessionBtn}
            onPress={() => {
              setShouldAdvanceAfterAuth(false);
              router.replace(
                hasCompletedOnboarding
                  ? "/(tabs)/home"
                  : "/onboarding/quick-start",
              );
            }}
            activeOpacity={0.88}
          >
            <Ionicons
              name="arrow-forward-circle-outline"
              size={20}
              color={COLORS.text}
            />
            <Text style={styles.resumeSessionText}>
              Doorgaan met bestaande sessie
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Biometric unlock — primary CTA for returning users */}
        {biometricType && mode === "signin" ? (
          <TouchableOpacity
            style={[
              styles.biometricBtn,
              loadingProvider === "biometric" && styles.disabledButton,
            ]}
            onPress={handleBiometricAuth}
            disabled={loadingProvider !== null}
            activeOpacity={0.85}
          >
            {loadingProvider === "biometric" ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <>
                <Ionicons
                  name={biometricIcon as any}
                  size={28}
                  color={COLORS.text}
                />
                <Text style={styles.biometricText}>{biometricLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("auth.orContinueWith")}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              setMode("signin");
              setShowEmailForm(false);
            }}
            style={[
              styles.modeChip,
              mode === "signin" && styles.modeChipActive,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === "signin" && styles.modeTextActive,
              ]}
            >
              {t("auth.signIn")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("signup")}
            style={[
              styles.modeChip,
              mode === "signup" && styles.modeChipActive,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === "signup" && styles.modeTextActive,
              ]}
            >
              {t("auth.createAccount")}
            </Text>
          </Pressable>
        </View>

        {/* Social buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[
              styles.socialBtn,
              ((firebaseConfigured && (!googleRequest || !hasGoogleClientId)) ||
                loadingProvider === "google") &&
                styles.disabledButton,
            ]}
            onPress={handleGoogleSignIn}
            disabled={
              (firebaseConfigured && (!googleRequest || !hasGoogleClientId)) ||
              loadingProvider !== null
            }
            activeOpacity={0.88}
          >
            {loadingProvider === "google" ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={COLORS.text} />
                <Text style={styles.socialBtnText}>
                  {!firebaseConfigured || hasGoogleClientId
                    ? mode === "signin"
                      ? t("auth.continueGoogle")
                      : t("auth.signUpGoogle")
                    : t("auth.googleUnavailable")}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.socialBtn,
              ((firebaseConfigured && !appleAvailable) ||
                loadingProvider === "apple") &&
                styles.disabledButton,
            ]}
            onPress={handleAppleSignIn}
            disabled={
              (firebaseConfigured && !appleAvailable) ||
              loadingProvider !== null
            }
            activeOpacity={0.85}
          >
            {loadingProvider === "apple" ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color={COLORS.text} />
                <Text style={styles.socialBtnText}>
                  {mode === "signin"
                    ? t("auth.continueApple")
                    : t("auth.signUpApple")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Email section — expandable */}
        {!showEmailForm ? (
          <TouchableOpacity
            style={styles.emailToggle}
            onPress={() => setShowEmailForm(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="mail-outline"
              size={16}
              color={COLORS.textSecondary}
            />
            <Text style={styles.emailToggleText}>
              {mode === "signin"
                ? t("auth.continueEmail")
                : t("auth.createEmail")}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.emailBlock}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.emailInput}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textMuted}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.emailInput}
              secureTextEntry
              placeholder={
                mode === "signin"
                  ? t("auth.password")
                  : t("auth.choosePassword")
              }
              placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity
              style={[
                styles.emailBtn,
                loadingProvider === "email" && styles.disabledButton,
              ]}
              onPress={handleEmailAuth}
              disabled={loadingProvider !== null}
              activeOpacity={0.88}
            >
              {loadingProvider === "email" ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={styles.emailBtnText}>
                  {mode === "signin"
                    ? t("auth.continueEmail")
                    : t("auth.createEmail")}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.emailHint}>{t("auth.emailHint")}</Text>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 20,
  },
  hero: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 8,
  },
  resumeSessionBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardElevated,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  resumeSessionText: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  logoN: {
    color: COLORS.accent,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 54,
    letterSpacing: 1,
    textShadowColor: COLORS.accentGlowStrong,
    textShadowRadius: 18,
  },
  logoWord: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3.8,
    fontSize: 34,
    marginLeft: 6,
  },

  /* Biometric */
  biometricBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  biometricText: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: 0.3,
  },

  /* Divider */
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.glassBorder,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textTransform: "lowercase",
  },

  /* Mode toggle */
  modeRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  modeChip: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    minHeight: 36,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: COLORS.glass,
  },
  modeChipActive: {
    borderColor: COLORS.accentGlowStrong,
    backgroundColor: COLORS.accentGlow,
  },
  modeText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  modeTextActive: {
    color: COLORS.text,
  },

  /* Social buttons */
  socialRow: {
    gap: 10,
  },
  socialBtn: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 14,
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  socialBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },

  /* Email toggle */
  emailToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  emailToggleText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },

  /* Email form */
  emailBlock: {
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 16,
  },
  emailInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  emailBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  emailBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  emailHint: {
    color: COLORS.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },

  /* Shared */
  disabledButton: {
    opacity: 0.65,
  },
  errorText: {
    color: COLORS.error,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textAlign: "center",
  },
});
