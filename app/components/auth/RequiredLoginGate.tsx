import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";

import { ENV } from "@/constants/env";
import { useNexora } from "@/context/NexoraContext";
import { authenticateWithAppleToken, authenticateWithGoogleIdToken } from "@/lib/firebase-auth";

WebBrowser.maybeCompleteAuthSession();

export function RequiredLoginGate() {
  const insets = useSafeAreaInsets();
  const { signInWithEmail } = useNexora();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === "ios");

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.firebase.iosClientId || undefined,
    androidClientId: ENV.firebase.androidClientId || undefined,
    webClientId: ENV.firebase.webClientId || undefined,
  });

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

  const topPad = useMemo(() => (Platform.OS === "web" ? 48 : insets.top + 12), [insets.top]);

  const handleGoogleSignIn = async () => {
    setError(null);
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
      if (String(authError?.code || "") !== "ERR_REQUEST_CANCELED") {
        setError(String(authError?.message || "Apple sign-in failed."));
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailSignIn = async () => {
    setError(null);
    setLoadingProvider("email");
    try {
      await signInWithEmail(email, password);
    } catch (authError: any) {
      setError(String(authError?.message || "Email sign-in failed."));
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.inner, { paddingTop: topPad }]}> 
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>NEXORA</Text>
          <Text style={styles.subtitle}>Secure sign-in is required before the app unlocks.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Login required</Text>
          <Text style={styles.panelText}>Authentication now uses a real OAuth and store-backed access flow. No bypass.</Text>

          <TouchableOpacity
            style={[styles.primaryCta, (!googleRequest || loadingProvider === "google") && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={!googleRequest || loadingProvider !== null}
            activeOpacity={0.88}
          >
            {loadingProvider === "google" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color="#FFFFFF" />
                <Text style={styles.primaryCtaText}>Continue with Google</Text>
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
              <ActivityIndicator color="#E6E6EA" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={18} color="#E6E6EA" />
                <Text style={styles.secondaryBtnText}>Continue with Apple</Text>
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
              placeholderTextColor="#6D6E7A"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.emailInput}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#6D6E7A"
            />
            <TouchableOpacity
              style={[styles.emailBtn, loadingProvider === "email" && styles.disabledButton]}
              onPress={handleEmailSignIn}
              disabled={loadingProvider !== null}
              activeOpacity={0.88}
            >
              {loadingProvider === "email" ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.emailBtnText}>Continue with Email</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.emailHint}>New email accounts are created automatically on first sign-in.</Text>
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
    backgroundColor: "#07070B",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    gap: 18,
  },
  brandWrap: {
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  brand: {
    color: "#FFFFFF",
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 3,
    fontSize: 34,
  },
  subtitle: {
    color: "#A5A6B4",
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  panel: {
    backgroundColor: "#101018",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 18,
    gap: 12,
  },
  panelTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  panelText: {
    color: "#B7B8C5",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryCta: {
    marginTop: 6,
    backgroundColor: "#E50914",
    borderRadius: 14,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryCtaText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: "#1A1B24",
    borderRadius: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryBtnText: {
    color: "#E6E6EA",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  emailBlock: {
    marginTop: 6,
    gap: 8,
  },
  emailLabel: {
    color: "#CBCBD4",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  emailInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#11121A",
    paddingHorizontal: 12,
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  emailBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
  },
  emailBtnText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  emailHint: {
    color: "#888B98",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  disabledButton: {
    opacity: 0.65,
  },
  errorText: {
    color: "#FF6B72",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});