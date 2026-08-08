import React from "react";
import { Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { Button } from "@/components/ui/Button";
import { GenrePill } from "@/components/ui/GenrePill";
import { Screen } from "@/components/ui/Screen";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { SafeAlert } from "@/lib/safeAlert";
import { useAuth } from "@/store/auth-store";
import { useLibrary } from "@/store/library-store";
import {
  LANGUAGES,
  useSettings,
  type LanguageCode,
  type ThemeMode,
} from "@/store/settings-store";

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export default function SettingsScreen() {
  const styles = useStyles();
  const { gutter } = useResponsive();

  const user = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);
  const sendPasswordReset = useAuth((state) => state.sendPasswordReset);

  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const language = useSettings((state) => state.language);
  const setLanguage = useSettings((state) => state.setLanguage);
  const notifications = useSettings((state) => state.notifications);
  const setNotification = useSettings((state) => state.setNotification);
  const privacy = useSettings((state) => state.privacy);
  const setPrivacy = useSettings((state) => state.setPrivacy);

  const clearHistory = useLibrary((state) => state.clearHistory);
  const resetLibrary = useLibrary((state) => state.resetLibrary);

  return (
    <>
      <SeoHead
        title="Settings"
        description="Appearance, language, notifications, privacy and account settings."
      />
      <Screen reserveBottomNav>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />

        <View style={[styles.head, { paddingHorizontal: gutter }]}>
          <Text style={styles.title} accessibilityRole="header">
            Settings
          </Text>
          <Text style={styles.subtitle}>
            Tune how CineLog looks, what it tells you and what it remembers.
          </Text>
        </View>

        <View style={[styles.sections, { paddingHorizontal: gutter }]}>
          <SettingsSection title="Profile" icon="person-circle-outline">
            <SettingsRow
              label={user ? user.displayName : "Not signed in"}
              hint={
                user
                  ? user.email
                  : "Sign in to sync your library across devices"
              }
            />
            {user ? null : (
              <Button
                label="Sign in"
                onPress={() => router.push("/auth")}
                size="sm"
              />
            )}
          </SettingsSection>

          <SettingsSection title="Appearance" icon="color-palette-outline">
            <SettingsRow
              label="Theme"
              hint="CineLog is designed dark-first; light mode keeps contrast accessible."
            />
            <View style={styles.pillRow}>
              {THEMES.map((option) => (
                <GenrePill
                  key={option.value}
                  label={option.label}
                  selected={theme === option.value}
                  onPress={() => setTheme(option.value)}
                />
              ))}
            </View>
          </SettingsSection>

          <SettingsSection title="Language" icon="language-outline">
            <View style={styles.pillRow}>
              {LANGUAGES.map((option) => (
                <GenrePill
                  key={option.code}
                  label={option.label}
                  selected={language === option.code}
                  onPress={() => setLanguage(option.code as LanguageCode)}
                />
              ))}
            </View>
          </SettingsSection>

          <SettingsSection title="Notifications" icon="notifications-outline">
            <ToggleRow
              label="New releases"
              hint="Tell me when something I follow lands"
              value={notifications.newReleases}
              onChange={(value) => setNotification("newReleases", value)}
            />
            <ToggleRow
              label="Recommendations"
              hint="Weekly picks based on what I watch"
              value={notifications.recommendations}
              onChange={(value) => setNotification("recommendations", value)}
            />
            <ToggleRow
              label="Watchlist reminders"
              hint="Nudge me about titles I saved but haven't watched"
              value={notifications.watchlistReminders}
              onChange={(value) => setNotification("watchlistReminders", value)}
            />
          </SettingsSection>

          <SettingsSection title="Privacy" icon="lock-closed-outline">
            <ToggleRow
              label="Watch history"
              hint="Let what you watch shape your recommendations"
              value={privacy.saveWatchHistory}
              onChange={(value) => setPrivacy("saveWatchHistory", value)}
            />
            <ToggleRow
              label="Profile visibility"
              hint="Let other viewers find your CineLog profile"
              value={privacy.publicProfile}
              onChange={(value) => setPrivacy("publicProfile", value)}
            />
            <Button
              label="Clear watch history"
              icon="trash-outline"
              variant="secondary"
              size="sm"
              onPress={() =>
                SafeAlert.confirm(
                  "Clear watch history",
                  "This removes everything you've watched, your episode ticks and Continue Watching.",
                  "Clear history",
                  clearHistory,
                )
              }
            />
          </SettingsSection>

          <SettingsSection title="Account" icon="key-outline">
            <Button
              label="Change password"
              icon="mail-outline"
              variant="secondary"
              size="sm"
              onPress={() => {
                if (!user) {
                  router.push("/auth");
                  return;
                }
                void sendPasswordReset(user.email);
                SafeAlert.confirm(
                  "Password reset sent",
                  `We've emailed a reset link to ${user.email}.`,
                  "Got it",
                  () => undefined,
                  { destructive: false, cancelText: "Close" },
                );
              }}
            />
            <Button
              label="Delete account data"
              icon="close-circle-outline"
              variant="danger"
              size="sm"
              onPress={() =>
                SafeAlert.confirm(
                  "Delete account data",
                  "This erases your watchlist, favourites, ratings and history from this device and signs you out.",
                  "Delete everything",
                  () => {
                    resetLibrary();
                    void signOut();
                    router.replace("/(tabs)/home");
                  },
                )
              }
            />
            {user ? (
              <Button
                label="Logout"
                icon="log-out-outline"
                variant="secondary"
                size="sm"
                onPress={() => {
                  void signOut();
                  router.replace("/(tabs)/home");
                }}
              />
            ) : null}
          </SettingsSection>
        </View>

        <Footer />
      </Screen>
    </>
  );
}

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={17} color={colors.accent} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SettingsRow({ label, hint }: { label: string; hint?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  // The Switch is the control, so the row itself must not also be pressable —
  // a checkbox inside a button is invalid DOM on web.
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: colors.surfaceHover, true: colors.accent }}
        thumbColor={colors.textPrimary}
      />
    </View>
  );
}

const useStyles = makeStyles((c, t) => ({
  head: {
    gap: SPACING.sm,
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: c.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: c.textSecondary,
    maxWidth: 480,
  },
  sections: {
    gap: SPACING.xl,
    maxWidth: 720,
  },
  section: {
    gap: SPACING.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: c.textPrimary,
  },
  sectionBody: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "flex-start",
  },
  row: {
    gap: 2,
    width: "100%",
  },
  rowLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: c.textPrimary,
  },
  rowHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
    color: c.textMuted,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.lg,
    width: "100%",
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
}));
