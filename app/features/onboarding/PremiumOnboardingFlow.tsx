import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useUserAccountStore } from "@/store/userAccountStore";
import { useProfileStore, AVATAR_COLORS } from "@/store/profileStore";
import { useTranslation } from "@/lib/useTranslation";
import type { Language } from "@/lib/i18n";

type PremiumOnboardingFlowProps = {
  mode?: "first-launch" | "editor";
  onFinished?: () => void;
};

const LANGUAGE_OPTIONS: { key: Language; label: string; flag: string }[] = [
  { key: "nl", label: "Nederlands", flag: "🇳🇱" },
  { key: "en", label: "English", flag: "🇬🇧" },
  { key: "fr", label: "Français", flag: "🇫🇷" },
  { key: "de", label: "Deutsch", flag: "🇩🇪" },
  { key: "es", label: "Español", flag: "🇪🇸" },
  { key: "pt", label: "Português", flag: "🇵🇹" },
];

const GENRE_OPTIONS = [
  { key: "action",    label: "Action",       icon: "🎬" },
  { key: "comedy",    label: "Comedy",       icon: "😂" },
  { key: "drama",     label: "Drama",        icon: "🎭" },
  { key: "thriller",  label: "Thriller",     icon: "🔪" },
  { key: "scifi",     label: "Sci-Fi",       icon: "🚀" },
  { key: "horror",    label: "Horror",       icon: "👻" },
  { key: "romance",   label: "Romance",      icon: "💕" },
  { key: "animation", label: "Animation",    icon: "🎨" },
  { key: "docs",      label: "Documentary",  icon: "📽" },
  { key: "kids",      label: "Kids",         icon: "🧒" },
  { key: "news",      label: "News",         icon: "📰" },
] as const;

const STEP_TOTAL = 3;

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.stepDots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i === step - 1 ? styles.stepDotActive : null,
            i < step - 1  ? styles.stepDotComplete : null,
          ]}
        />
      ))}
    </View>
  );
}

function ChoiceChip({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PremiumOnboardingFlow({
  mode = "first-launch",
  onFinished,
}: PremiumOnboardingFlowProps) {
  const router = useRouter();
  const { completeOnboarding, moviesEnabled, setMoviesEnabled } = useOnboardingStore();
  const { updateAccountInfo, completeAccountSetup, info: accountInfo } = useUserAccountStore();
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const { language, setLanguage } = useTranslation();

  const [step, setStep]           = useState(1);
  const [genres, setGenres]       = useState<string[]>(
    accountInfo.genres?.length ? accountInfo.genres : ["action", "drama", "scifi"],
  );
  const [name, setName]           = useState(accountInfo.name);
  const [age, setAge]             = useState(accountInfo.age);
  const [email, setEmail]         = useState(accountInfo.email);
  const [accentColor, setAccentColor] = useState(accountInfo.accentColor);
  const isFinishing               = useRef(false);

  const toggleGenre = useCallback((key: string) => {
    setGenres((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key],
    );
  }, []);

  const applyAccentColor = useCallback(
    (color: string) => {
      setAccentColor(color);
      updateAccountInfo({ accentColor: color });
      updateProfile("main", { avatarColor: color });
    },
    [updateAccountInfo, updateProfile],
  );

  const applyLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      updateAccountInfo({ language: lang });
    },
    [setLanguage, updateAccountInfo],
  );

  const handleFinish = useCallback(() => {
    if (isFinishing.current) return;
    isFinishing.current = true;
    updateAccountInfo({ name: name.trim(), age: age.trim(), email: email.trim(), genres });
    if (name.trim()) {
      updateProfile("main", { name: name.trim() });
    }
    completeAccountSetup();
    completeOnboarding();
    if (onFinished) {
      onFinished();
    } else {
      router.replace("/(tabs)/home");
    }
  }, [
    age,
    completeAccountSetup,
    completeOnboarding,
    email,
    genres,
    name,
    onFinished,
    router,
    updateAccountInfo,
    updateProfile,
  ]);

  const canAdvance =
    step === 1 ? name.trim().length > 0 : step === 2 ? genres.length > 0 : true;
  const isLastStep  = step === STEP_TOTAL;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>CINELOG</Text>
          <StepDots step={step} total={STEP_TOTAL} />
        </View>

        {/* ── Step 1: Account & personalisation ── */}
        {step === 1 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>Vertel ons over jezelf</Text>
            <Text style={styles.stepSub}>
              We personaliseren de app op basis van jouw gegevens en gekozen kleur.
            </Text>

            <Text style={styles.fieldLabel}>Naam</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Jouw naam"
              placeholderTextColor={COLORS.textMuted}
              style={styles.textInput}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Leeftijd</Text>
            <TextInput
              value={age}
              onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ""))}
              placeholder="Bijv. 28"
              placeholderTextColor={COLORS.textMuted}
              style={styles.textInput}
              keyboardType="number-pad"
              maxLength={3}
            />

            <Text style={styles.fieldLabel}>E-mailadres</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="jij@voorbeeld.com"
              placeholderTextColor={COLORS.textMuted}
              style={styles.textInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Taal</Text>
            <View style={styles.chipGrid}>
              {LANGUAGE_OPTIONS.map((l) => (
                <ChoiceChip
                  key={l.key}
                  active={language === l.key}
                  label={l.label}
                  icon={l.flag}
                  onPress={() => applyLanguage(l.key)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Kleur</Text>
            <View style={styles.colorRow}>
              {AVATAR_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => applyAccentColor(color)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    accentColor === color && styles.colorSwatchActive,
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Step 2: Genre preferences ── */}
        {step === 2 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>What do you love watching?</Text>
            <Text style={styles.stepSub}>
              Pick your favourite genres and we'll build the perfect home for you.
            </Text>
            <View style={styles.chipGrid}>
              {GENRE_OPTIONS.map((g) => (
                <ChoiceChip
                  key={g.key}
                  active={genres.includes(g.key)}
                  label={g.label}
                  icon={g.icon}
                  onPress={() => toggleGenre(g.key)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Step 3: Notifications ── */}
        {step === 3 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>Stay in the loop</Text>
            <Text style={styles.stepSub}>
              Never miss a new episode, premiere, or live event.
            </Text>
            <View style={styles.noticeBox}>
              <Text style={styles.noticeIcon}>🔔</Text>
              <Text style={styles.noticeText}>
                We'll send you personalised alerts for new releases, continue watching reminders, and live TV that's starting now.
              </Text>
            </View>
            <View style={styles.noticeBox}>
              <Text style={styles.noticeIcon}>🔒</Text>
              <Text style={styles.noticeText}>
                Your data stays private. We never share your watch preferences with third parties.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            if (isLastStep) {
              handleFinish();
            } else {
              setStep((s) => s + 1);
            }
          }}
          disabled={!canAdvance}
          style={[styles.btn, !canAdvance && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>
            {isLastStep ? "Start Watching" : "Continue"}
          </Text>
        </Pressable>
        {step > 1 && (
          <Pressable onPress={() => setStep((s) => s - 1)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        )}
        {mode === "first-launch" && step === 1 && (
          <Pressable onPress={handleFinish} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  header: {
    paddingTop: 14,
    paddingBottom: 24,
    alignItems: "center",
    gap: 16,
  },
  logo: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 26,
    letterSpacing: 4,
    color: COLORS.accent,
  },
  stepDots: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  stepDotActive: {
    width: 22,
    backgroundColor: COLORS.accent,
  },
  stepDotComplete: {
    backgroundColor: COLORS.textMuted,
  },
  stepWrap: {
    gap: 8,
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: COLORS.text,
    marginBottom: 4,
  },
  stepSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 14,
    marginBottom: 8,
  },
  textInput: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: COLORS.text,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchActive: {
    borderColor: COLORS.text,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
    backgroundColor: COLORS.card,
  },
  chipActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(192,38,211,0.13)",
  },
  chipIcon: {
    fontSize: 16,
  },
  chipLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  chipLabelActive: {
    color: COLORS.accent,
  },
  noticeBox: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 12,
    alignItems: "flex-start",
  },
  noticeIcon: {
    fontSize: 22,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },
  footer: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    paddingTop: 8,
    gap: 10,
  },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.3,
  },
  backBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  backBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  skipBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
