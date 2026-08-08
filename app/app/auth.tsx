import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { CineLogLogo } from "@/components/brand/CineLogLogo";
import { Button } from "@/components/ui/Button";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/store/auth-store";
import { NO_WEB_OUTLINE } from "@/lib/web-style";

type Mode = "signin" | "signup" | "reset";

const COPY: Record<Mode, { title: string; body: string; cta: string }> = {
  signin: {
    title: "Welcome back",
    body: "Sign in to sync your watchlist, ratings and progress across devices.",
    cta: "Sign in",
  },
  signup: {
    title: "Create your CineLog",
    body: "One account keeps your watchlist, ratings and viewing history together.",
    cta: "Create account",
  },
  reset: {
    title: "Reset your password",
    body: "We'll email you a link to choose a new password.",
    cta: "Send reset link",
  },
};

export default function AuthScreen() {
  const styles = useStyles();
  const { gutter, isMobile } = useResponsive();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const error = useAuth((state) => state.error);
  const isSubmitting = useAuth((state) => state.isSubmitting);
  const clearError = useAuth((state) => state.clearError);
  const signIn = useAuth((state) => state.signIn);
  const register = useAuth((state) => state.register);
  const sendPasswordReset = useAuth((state) => state.sendPasswordReset);

  const copy = COPY[mode];

  const switchMode = (next: Mode) => {
    clearError();
    setResetSent(false);
    setMode(next);
  };

  const submit = async () => {
    clearError();
    if (mode === "reset") {
      const sent = await sendPasswordReset(email);
      setResetSent(sent);
      return;
    }
    const success =
      mode === "signin"
        ? await signIn(email, password)
        : await register(name, email, password);
    if (success) router.replace("/(tabs)/home");
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, isMobile ? styles.cardMobile : null]}>
          <CineLogLogo size={30} showTagline />

          <View style={styles.copy}>
            <Text style={styles.title} accessibilityRole="header">
              {copy.title}
            </Text>
            <Text style={styles.body}>{copy.body}</Text>
          </View>

          <View style={styles.form}>
            {mode === "signup" ? (
              <Field
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="How should we call you?"
                autoComplete="name"
              />
            ) : null}

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
            />

            {mode === "reset" ? null : (
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            )}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {resetSent ? (
              <Text style={styles.success} accessibilityRole="alert">
                Check your inbox for the reset link.
              </Text>
            ) : null}

            <Button
              label={copy.cta}
              onPress={() => void submit()}
              loading={isSubmitting}
              fullWidth
              size="lg"
            />
          </View>

          <View style={styles.links}>
            {mode === "signin" ? (
              <>
                <AuthLink
                  label="Create an account"
                  onPress={() => switchMode("signup")}
                />
                <AuthLink
                  label="Forgot password?"
                  onPress={() => switchMode("reset")}
                />
              </>
            ) : (
              <AuthLink
                label="Back to sign in"
                onPress={() => switchMode("signin")}
              />
            )}
            <AuthLink
              label="Continue without an account"
              onPress={() => router.replace("/(tabs)/home")}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
      />
    </View>
  );
}

function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c, t) => ({
  root: {
    flex: 1,
    backgroundColor: c.background,
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xxxl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    gap: SPACING.xl,
    padding: SPACING.xxl,
    borderRadius: RADIUS.xl,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardMobile: {
    padding: SPACING.xl,
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  copy: {
    gap: SPACING.sm,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    color: c.textPrimary,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    color: c.textSecondary,
  },
  form: {
    gap: SPACING.lg,
  },
  field: {
    gap: SPACING.sm,
  },
  fieldLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: c.textMuted,
  },
  input: {
    height: 48,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: c.textPrimary,
    ...NO_WEB_OUTLINE,
  },
  error: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.error,
  },
  success: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.success,
  },
  links: {
    gap: SPACING.md,
    alignItems: "flex-start",
  },
  link: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: c.textSecondary,
  },
}));
