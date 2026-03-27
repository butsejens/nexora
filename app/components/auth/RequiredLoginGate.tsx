import React, { useMemo, useState } from "react";
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
import { useNexora } from "@/context/NexoraContext";

export function RequiredLoginGate() {
  const insets = useSafeAreaInsets();
  const { signInWithProvider, signInWithEmail } = useNexora();
  const [email, setEmail] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topPad = useMemo(() => (Platform.OS === "web" ? 48 : insets.top + 12), [insets.top]);

  const handleProviderSignIn = async (provider: "google" | "apple") => {
    setError(null);
    setLoadingProvider(provider);
    try {
      await signInWithProvider(provider);
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailSignIn = async () => {
    setError(null);
    setLoadingProvider("email");
    try {
      await signInWithEmail(email);
    } catch (err: any) {
      setError(String(err?.message || "Please enter a valid email address."));
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.inner, { paddingTop: topPad }]}> 
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>NEXORA</Text>
          <Text style={styles.subtitle}>Sign in to access predictions, insights and premium tools.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Login required</Text>
          <Text style={styles.panelText}>No account means no access. Choose a sign-in option.</Text>

          <TouchableOpacity
            style={[styles.primaryCta, loadingProvider === "google" && styles.disabledButton]}
            onPress={() => handleProviderSignIn("google")}
            disabled={loadingProvider !== null}
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
            style={[styles.secondaryBtn, loadingProvider === "apple" && styles.disabledButton]}
            onPress={() => handleProviderSignIn("apple")}
            disabled={loadingProvider !== null}
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
  disabledButton: {
    opacity: 0.65,
  },
  errorText: {
    color: "#FF6B72",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
