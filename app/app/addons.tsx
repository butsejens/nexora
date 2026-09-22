/**
 * CineLog — Addons.
 *
 * Torrentio, Comet and Meteor sit in one priority group above the legacy
 * embed servers (see app/lib/streaming): CineLog automatically picks the best
 * available stream across all three and only falls back to the servers below
 * when none of them produce a working source.
 */

import React from "react";
import { Platform, StatusBar, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/i18n";
import { SeoHead } from "@/components/SeoHead";
import { Footer } from "@/components/layout/Footer";
import { FloatingBackButton } from "@/components/navigation/MobileHeader";
import { GenrePill } from "@/components/ui/GenrePill";
import { Screen } from "@/components/ui/Screen";
import { LEGACY_STREAM_PROVIDER_LABELS } from "@/components/actions/TitleActions";
import { FONTS, RADIUS, SPACING } from "@/constants/theme";
import { makeStyles, useTheme } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { AUTO_PROVIDER_LABELS } from "@/lib/streaming/providers/index";
import type { ResolutionTier, StreamProviderId } from "@/lib/streaming/types";
import { useSettings } from "@/store/settings-store";

const RESOLUTION_OPTIONS: { value: ResolutionTier; label: string }[] = [
  { value: "4k", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
];

const PROVIDER_HINTS: Record<StreamProviderId, string> = {
  torrentio: "e.g. https://torrentio.strem.fun (add your own debrid keys in the URL if you have them)",
  comet: "Your personal Comet instance URL, including any debrid configuration.",
  meteor: "Your personal Meteor instance URL, including any debrid configuration.",
};

export default function AddonsScreen() {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const { gutter } = useResponsive();
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    insets.top > 0 ? insets.top : Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

  const streamPrefs = useSettings((state) => state.streamPrefs);
  const setStreamPref = useSettings((state) => state.setStreamPref);
  const streamProviders = useSettings((state) => state.streamProviders);
  const setStreamProviderEndpoint = useSettings((state) => state.setStreamProviderEndpoint);
  const setStreamProviderEnabled = useSettings((state) => state.setStreamProviderEnabled);

  const autoProviderIds: StreamProviderId[] = ["torrentio", "comet", "meteor"];

  return (
    <>
      <SeoHead
        title={t("Addons")}
        description="Configure Torrentio, Comet and Meteor and manage CineLog's automatic best-source selection."
      />
      <Screen reserveBottomNav>
        <FloatingBackButton onPress={() => router.back()} gutter={gutter} />

        <View
          style={[
            styles.head,
            { paddingHorizontal: gutter, paddingTop: statusBarHeight + SPACING.sm + 38 + SPACING.md },
          ]}
        >
          <Text style={styles.title} accessibilityRole="header">
            {t("Addons")}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              "Torrentio, Comet and Meteor rank above every other server. CineLog scores every stream and plays the best one automatically.",
            )}
          </Text>
        </View>

        <View style={[styles.sections, { paddingHorizontal: gutter }]}>
          <Section title={t("Automatic best source")} icon="flash-outline">
            <ToggleRow
              label={t("Automatically choose the best source")}
              hint={t(
                "When on, CineLog ranks Torrentio, Comet and Meteor and starts the top result without asking.",
              )}
              value={streamPrefs.autoSelectBest}
              onChange={(value) => setStreamPref("autoSelectBest", value)}
            />

            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t("Maximum resolution")}</Text>
              <View style={styles.pillRow}>
                {RESOLUTION_OPTIONS.map((option) => (
                  <GenrePill
                    key={option.value}
                    label={option.label}
                    selected={streamPrefs.maxResolution === option.value}
                    onPress={() => setStreamPref("maxResolution", option.value)}
                  />
                ))}
              </View>
            </View>

            <Field
              label={t("Preferred language (ISO code)")}
              value={streamPrefs.preferredLanguage}
              onChangeText={(value) => setStreamPref("preferredLanguage", value.trim().toLowerCase())}
              placeholder="en"
              maxLength={5}
            />

            <ToggleRow
              label={t("Allow HDR / Dolby Vision")}
              hint={t("Turn off to always prefer standard-dynamic-range sources.")}
              value={streamPrefs.allowHdr}
              onChange={(value) => setStreamPref("allowHdr", value)}
            />

            <Field
              label={t("Maximum file size (GB, empty = no limit)")}
              value={streamPrefs.maxFileSizeGb == null ? "" : String(streamPrefs.maxFileSizeGb)}
              onChangeText={(value) => {
                const trimmed = value.trim();
                if (!trimmed) {
                  setStreamPref("maxFileSizeGb", null);
                  return;
                }
                const parsed = Number(trimmed);
                if (Number.isFinite(parsed) && parsed > 0) setStreamPref("maxFileSizeGb", parsed);
              }}
              keyboardType="numeric"
              placeholder={t("No limit")}
            />
          </Section>

          <Section title={t("Torrentio, Comet & Meteor")} icon="rocket-outline">
            {autoProviderIds.map((id) => (
              <ProviderCard
                key={id}
                label={AUTO_PROVIDER_LABELS[id]}
                hint={t(PROVIDER_HINTS[id])}
                enabled={streamProviders[id].enabled}
                endpoint={streamProviders[id].endpoint}
                onToggle={(value) => setStreamProviderEnabled(id, value)}
                onEndpointChange={(value) => setStreamProviderEndpoint(id, value)}
              />
            ))}
          </Section>

          <Section title={t("Other servers")} icon="server-outline">
            <Text style={styles.rowHint}>
              {t(
                "Used only when none of Torrentio, Comet or Meteor produce a working stream, or when automatic selection is off.",
              )}
            </Text>
            <View style={styles.legacyList}>
              {LEGACY_STREAM_PROVIDER_LABELS.map((provider) => (
                <View key={provider.id} style={styles.legacyRow}>
                  <Ionicons name="film-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.legacyLabel}>{provider.label}</Text>
                </View>
              ))}
            </View>
          </Section>
        </View>

        <Footer />
      </Screen>
    </>
  );
}

function Section({
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

function Field({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.rowLabel}>{label}</Text>
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

function ProviderCard({
  label,
  hint,
  enabled,
  endpoint,
  onToggle,
  onEndpointChange,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  endpoint: string;
  onToggle: (value: boolean) => void;
  onEndpointChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.providerCard}>
      <View style={styles.toggleRow}>
        <Text style={styles.providerTitle}>{label}</Text>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          accessibilityLabel={label}
          trackColor={{ false: colors.surfaceHover, true: colors.accent }}
          thumbColor={colors.textPrimary}
        />
      </View>
      <Text style={styles.rowHint}>{hint}</Text>
      <TextInput
        value={endpoint}
        onChangeText={onEndpointChange}
        style={styles.input}
        placeholder="https://…"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`${label} endpoint URL`}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  head: {
    gap: SPACING.sm,
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
    gap: SPACING.xs,
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
  field: {
    gap: SPACING.xs,
    width: "100%",
  },
  input: {
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceHover,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: c.textPrimary,
  },
  providerCard: {
    width: "100%",
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  providerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: c.textPrimary,
  },
  legacyList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    width: "100%",
  },
  legacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  legacyLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: c.textSecondary,
  },
}));
