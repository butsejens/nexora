import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

import { ENV } from "@/constants/env";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { authenticateWithAppleToken, authenticateWithGoogleIdToken } from "@/lib/firebase-auth";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "signin" | "signup";

const GOOGLE_PLACEHOLDER_CLIENT_ID = "nexora-missing-client-id.apps.googleusercontent.com";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithEmail, isAuthenticated, authReady } = useNexora();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === "ios");
  const hasGoogleClientId = Boolean(
    ENV.firebase.iosClientId || ENV.firebase.androidClientId || ENV.firebase.webClientId,
  );

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.firebase.iosClientId || GOOGLE_PLACEHOLDER_CLIENT_ID,
    androidClientId: ENV.firebase.androidClientId || ENV.firebase.webClientId || GOOGLE_PLACEHOLDER_CLIENT_ID,
    webClientId: ENV.firebase.webClientId || GOOGLE_PLACEHOLDER_CLIENT_ID,
  });

  useEffect(() => {
    if (authReady && isAuthenticated) {
      router.replace("/(tabs)/home");
    }
  }, [authReady, isAuthenticated, router]);

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

  useEffect(() => {
    const completeGoogleAuth = async () => {
      if (googleResponse?.type !== "success") return;
      const idToken =
        (googleResponse.authentication as any)?.idToken ||
        (googleResponse.params as any)?.id_token ||
        "";
      const accessToken = (googleResponse.authentication as any)?.accessToken || null;

      if (!idToken) {
        setError("Google sign-in did not return an ID token.");
        setLoadingProvider(null);
        return;
      }

      try {
        await authenticateWithGoogleIdToken(idToken, accessToken);
      } catch (authError: any) {
        setError(String(authError?.message || "Google sign-in failed."));
      } finally {
        setLoadingProvider(null);
      }
    };

    void completeGoogleAuth();
  }, [googleResponse]);

  const topPad = useMemo(() => (Platform.OS === "web" ? 48 : insets.top + 14), [insets.top]);

  const handleGoogleSignIn = async () => {
    setError(null);
    if (!hasGoogleClientId) {
      setError("Google sign-in is niet geconfigureerd voor deze build.");
      return;
    }
    setLoadingProvider("google");
    try {
      const result = await promptGoogleSignIn();
      if (result.type !== "success") {
        setLoadingProvider(null);
      }
    } catch (authError: any) {
      setError(String(authError?.message || "Unable to start Google sign-in."));
      setLoadingProvider(null);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setLoadingProvider("apple");
    try {
      const rawNonce = `${Date.now()}-${Math.random()}`;
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
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
      if (String(authError?.code || "") !== "ERR_REQUEST_CANCELED") {
        setError(String(authError?.message || "Apple sign-in failed."));
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailAuth = async () => {
    setError(null);
    setLoadingProvider("email");
    try {
      await signInWithEmail(email.trim(), password);
    } catch (authError: any) {
      setError(String(authError?.message || "Email authentication failed."));
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.inner, { paddingTop: topPad }]}> 
        <View style={styles.hero}>
          <Text style={styles.logoN}>N</Text>
          <Text style={styles.logoWord}>EXORA</Text>
        </View>

        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setMode("signin")}
            style={[styles.modeChip, mode === "signin" && styles.modeChipActive]}
          >
            <Text style={[styles.modeText, mode === "signin" && styles.modeTextActive]}>Sign in</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("signup")}
            style={[styles.modeChip, mode === "signup" && styles.modeChipActive]}
          >
            <Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>Create account</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{mode === "signin" ? "Welcome back" : "Join Nexora"}</Text>
          <Text style={styles.panelText}>
            {mode === "signin"
              ? "Sign in to unlock your personalized streams, sports rails and premium control center."
              : "Create your account in one step and start with your premium dark Nexora experience."}
          </Text>

          <TouchableOpacity
            style={[styles.primaryCta, (!googleRequest || !hasGoogleClientId || loadingProvider === "google") && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={!googleRequest || !hasGoogleClientId || loadingProvider !== null}
            activeOpacity={0.88}
          >
            {loadingProvider === "google" ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={COLORS.text} />
                <Text style={styles.primaryCtaText}>
                  {hasGoogleClientId
                    ? (mode === "signin" ? "Continue with Google" : "Sign up with Google")
                    : "Google tijdelijk niet beschikbaar"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, (!appleAvailable || loadingProvider === "apple") && styles.disabledButton]}
            onPress={handleAppleSignIn}
            disabled={!appleAvailable || loadingProvider !== null}
            activeOpacity={0.85}
          >
            {loadingProvider === "apple" ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={18} color={COLORS.text} />
                <Text style={styles.secondaryBtnText}>{mode === "signin" ? "Continue with Apple" : "Sign up with Apple"}</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.emailBlock}>
            <Text style={styles.emailLabel}>Email</Text>
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
              placeholder={mode === "signin" ? "Password" : "Choose a password"}
              placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity
              style={[styles.emailBtn, loadingProvider === "email" && styles.disabledButton]}
              onPress={handleEmailAuth}
              disabled={loadingProvider !== null}
              activeOpacity={0.88}
            >
              {loadingProvider === "email" ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={styles.emailBtnText}>{mode === "signin" ? "Continue with Email" : "Create with Email"}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.emailHint}>Email auth creates the account automatically on first successful sign-in.</Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    gap: 18,
  },
  hero: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 6,
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
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 18,
    gap: 12,
  },
  panelTitle: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 23,
  },
  panelText: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryCta: {
    marginTop: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryCtaText: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  emailBlock: {
    marginTop: 6,
    gap: 8,
  },
  emailLabel: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  emailInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.card,
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
  disabledButton: {
    opacity: 0.65,
  },
  errorText: {
    color: COLORS.cancelled,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
