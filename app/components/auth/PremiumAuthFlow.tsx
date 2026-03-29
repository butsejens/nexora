import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNexora } from "@/context/NexoraContext";
import { COLORS } from "@/constants/colors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export const PremiumAuthFlow = React.memo(function PremiumAuthFlow({
  onAuthSuccess,
}: {
  onAuthSuccess?: () => void;
}) {
  const { signInWithEmail } = useNexora();
  
  const [mode, setMode] = useState<"welcome" | "login" | "signup" | "forgot-password">("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Handle Google Sign-In
  const handleGoogleSignIn = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // TODO: Integrate actual Google OAuth via expo-auth-session
      // For now, show placeholder
      setError("Google Sign-In integration coming soon");
    } catch {
      setError("Google login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle Apple Sign-In
  const handleAppleSignIn = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // TODO: Integrate actual Apple Sign-In via expo-apple-authentication
      // For now, show placeholder
      setError("Apple Sign-In integration coming soon");
    } catch {
      setError("Apple login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle Email Login
  const handleEmailLogin = useCallback(async () => {
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await signInWithEmail(email, password);
      onAuthSuccess?.();
    } catch {
      setError("Login failed: invalid email or password");
    } finally {
      setLoading(false);
    }
  }, [email, password, signInWithEmail, onAuthSuccess]);

  // Handle Email Sign-Up
  const handleEmailSignUp = useCallback(async () => {
    if (!email || !password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email address");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await signInWithEmail(email, password);
      onAuthSuccess?.();
    } catch {
      setError("Sign up failed: email may already be in use");
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword, signInWithEmail, onAuthSuccess]);

  // Handle Forgot Password
  const handleForgotPassword = useCallback(async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      // In a real app, send password reset to backend
      await AsyncStorage.setItem("nexora_reset_email", email);
      setError(null);
      // Show success, then reset
      setTimeout(() => {
        setMode("login");
        setEmail("");
        setPassword("");
      }, 2000);
    } catch {
      setError("Password reset failed");
    } finally {
      setLoading(false);
    }
  }, [email]);

  if (mode === "welcome") {
    return (
      <LinearGradient colors={[COLORS.background, "#1a1a2e"]} style={styles.container}>
        <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
          {/* Logo */}
          <View style={styles.logoArea}>
            <MaterialCommunityIcons name="play-circle" size={64} color={COLORS.accent} />
            <Text style={styles.logoText}>Nexora Premium</Text>
            <Text style={styles.tagline}>Your premium streaming experience</Text>
          </View>

          {/* Features */}
          <View style={styles.featuresArea}>
            <FeatureItem icon="sparkles" title="Premium Content" desc="Unlock all sports, movies & series" />
            <FeatureItem icon="target" title="Smart Predictions" desc="AI-powered match insights" />
            <FeatureItem icon="play-outline" title="Ad-Free" desc="Enjoy uninterrupted streaming" />
            <FeatureItem icon="download" title="Download" desc="Watch offline anytime" />
          </View>

          {/* Auth Buttons */}
          <View style={styles.authButtons}>
            {/* Social Sign-In */}
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="google" size={20} color={COLORS.text} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleAppleSignIn}
              disabled={loading}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="apple" size={20} color={COLORS.text} />
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: COLORS.accent }]}
              onPress={() => {
                setMode("login");
                setError(null);
              }}
              disabled={loading}
            >
              <MaterialCommunityIcons name="email" size={20} color="#fff" />
              <Text style={[styles.primaryButtonText, { color: "#fff" }]}>Sign in with Email</Text>
            </TouchableOpacity>

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[styles.secondaryButton]}
              onPress={() => {
                setMode("signup");
                setError(null);
              }}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Create New Account</Text>
            </TouchableOpacity>
          </View>

          {/* Loading */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  // Email Login/SignUp Mode
  return (
    <LinearGradient colors={[COLORS.background, "#1a1a2e"]} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setMode("welcome");
              setError(null);
              setEmail("");
              setPassword("");
              setConfirmPassword("");
            }}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Title */}
          <View style={styles.titleArea}>
            <Text style={styles.title}>
              {mode === "login" ? "Welcome Back" : mode === "signup" ? "Create Account" : "Reset Password"}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "forgot-password"
                ? "Enter your email to reset your password"
                : mode === "signup"
                ? "Join millions of premium users"
                : "Sign in to your account"}
            </Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formFields}>
            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="email" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password */}
            {mode !== "forgot-password" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showPassword ? "eye" : "eye-off"}
                      size={18}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>
                {mode === "login" && (
                  <TouchableOpacity onPress={() => setMode("forgot-password")} disabled={loading}>
                    <Text style={styles.forgotLink}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Confirm Password (Sign Up) */}
            {mode === "signup" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="lock-check" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!loading}
                    secureTextEntry={!showPassword}
                  />
                </View>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#FF5252" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.primaryButton, styles.submitButton, { backgroundColor: COLORS.accent }]}
            onPress={() => {
              if (mode === "login") handleEmailLogin();
              else if (mode === "signup") handleEmailSignUp();
              else handleForgotPassword();
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={mode === "forgot-password" ? "send" : "arrow-forward"} size={20} color="#fff" />
                <Text style={[styles.primaryButtonText, { color: "#fff" }]}>
                  {mode === "login"
                    ? "Sign In"
                    : mode === "signup"
                    ? "Create Account"
                    : "Send Reset Email"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Sign Up Link */}
          {mode === "login" && (
            <View style={styles.signupLink}>
              <Text style={styles.signupText}>Don&apos;t have an account? </Text>
              <TouchableOpacity onPress={() => { setMode("signup"); setError(null); }} disabled={loading}>
                <Text style={styles.signupLinkText}>Sign up</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
});

// Feature Item Component
function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <MaterialCommunityIcons name={icon as any} size={24} color={COLORS.accent} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  welcomeContent: { paddingHorizontal: 20, paddingVertical: 40, paddingBottom: 60 },
  formContent: { paddingHorizontal: 20, paddingVertical: 20, paddingBottom: 60 },

  // Welcome Screen
  logoArea: { alignItems: "center", marginBottom: 48, marginTop: 20 },
  logoText: { fontFamily: "Inter_800ExtraBold", fontSize: 28, color: COLORS.text, marginTop: 12 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginTop: 6 },

  featuresArea: { gap: 16, marginBottom: 48 },
  featureItem: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  featureIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(229,9,20,0.12)", alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1, gap: 4 },
  featureTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  featureDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },

  authButtons: { gap: 12 },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  socialButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },

  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 15 },

  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  secondaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.accent, textAlign: "center" },

  loadingOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderRadius: 12 },

  // Form Screen
  backButton: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 32 },
  backText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },

  titleArea: { marginBottom: 32 },
  title: { fontFamily: "Inter_800ExtraBold", fontSize: 24, color: COLORS.text, marginBottom: 8 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },

  formFields: { gap: 20, marginBottom: 24 },
  fieldGroup: { gap: 8 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },

  inputWrapper: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "rgba(255,255,255,0.05)" },
  inputIcon: { marginLeft: 0 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },

  forgotLink: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.accent, marginTop: 4 },

  errorBox: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(255,82,82,0.12)", borderWidth: 1, borderColor: "rgba(255,82,82,0.3)" },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#FF5252", flex: 1 },

  submitButton: { marginBottom: 16 },

  signupLink: { flexDirection: "row", justifyContent: "center", gap: 4 },
  signupText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  signupLinkText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent },
});
