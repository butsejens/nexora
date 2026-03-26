import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";
import { PulseLaunchScreen } from "@/components/brand/PulseLaunchScreen";
import { COLORS } from "@/constants/colors";
import {
  SPORT_OPTIONS,
  getCompetitionSeedsForSports,
  getSportLabel,
  getTeamSeedsForSports,
} from "@/services/onboarding-data";
import {
  detectLocaleSignals,
  getSmartCompetitionSuggestions,
  getSmartTeamSuggestions,
  searchCompetitions,
  searchTeams,
} from "@/services/onboarding-ai";
import { startOnboardingPreload } from "@/services/onboarding-preload";
import type { CompetitionPreference, SportPreferenceKey, TeamPreference } from "@/services/onboarding-storage";
import { useOnboardingStore } from "@/store/onboarding-store";

type PremiumOnboardingFlowProps = {
  mode?: "first-launch" | "editor";
  onFinished?: () => void;
};

const STEP_TOTAL = 9;

const LOADING_MESSAGES = [
  "Sequencing your premium rails",
  "Pinning favorite clubs and competitions",
  "Building a faster first home screen",
  "Tuning notifications for the right moments",
];

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.stepDots}>
      {Array.from({ length: total }).map((_, index) => {
        const active = index === step - 1;
        const complete = index < step - 1;
        return <View key={index} style={[styles.stepDot, active ? styles.stepDotActive : null, complete ? styles.stepDotComplete : null]} />;
      })}
    </View>
  );
}

function ChoiceChip({
  active,
  label,
  onPress,
  sublabel,
}: {
  active: boolean;
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceChip, active ? styles.choiceChipActive : null]}>
      <Text style={[styles.choiceChipLabel, active ? styles.choiceChipLabelActive : null]}>{label}</Text>
      {sublabel ? <Text style={[styles.choiceChipSublabel, active ? styles.choiceChipSublabelActive : null]}>{sublabel}</Text> : null}
    </Pressable>
  );
}

export function PremiumOnboardingFlow({ mode = "first-launch", onFinished }: PremiumOnboardingFlowProps) {
  const localeSignals = useMemo(() => detectLocaleSignals(), []);
  const {
    completeOnboarding,
    moviesEnabled,
    notifications,
    preload,
    selectedCompetitions,
    selectedSports,
    selectedTeams,
    setMoviesEnabled,
    setNotifications,
    setPreloadState,
    setSportsEnabled,
    sportsEnabled,
    toggleCompetition,
    toggleSport,
    toggleTeam,
  } = useOnboardingStore();
  const [step, setStep] = useState(1);
  const [teamQuery, setTeamQuery] = useState("");
  const [competitionQuery, setCompetitionQuery] = useState("");
  const [movieSignals, setMovieSignals] = useState<string[]>(["movies", "series"]);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const stepOrder = useMemo(() => {
    const allSteps = Array.from({ length: STEP_TOTAL }, (_, index) => index + 1);
    return allSteps.filter((candidate) => {
      if (!sportsEnabled && (candidate === 3 || candidate === 4 || candidate === 5)) return false;
      if (!moviesEnabled && candidate === 8) return false;
      return true;
    });
  }, [moviesEnabled, sportsEnabled]);

  const visualStep = Math.max(1, stepOrder.indexOf(step) + 1);

  const teamSuggestions = useMemo(
    () => getSmartTeamSuggestions(selectedSports, localeSignals, 8),
    [localeSignals, selectedSports],
  );
  const teamSearchResults = useMemo(
    () => (teamQuery.trim() ? searchTeams(teamQuery, selectedSports, localeSignals, 18) : getTeamSeedsForSports(selectedSports).slice(0, 18)),
    [localeSignals, selectedSports, teamQuery],
  );
  const competitionSuggestions = useMemo(
    () => getSmartCompetitionSuggestions(selectedSports, localeSignals, 8),
    [localeSignals, selectedSports],
  );
  const competitionResults = useMemo(
    () => (competitionQuery.trim()
      ? searchCompetitions(competitionQuery, selectedSports, localeSignals, 14)
      : getCompetitionSeedsForSports(selectedSports).slice(0, 14)),
    [competitionQuery, localeSignals, selectedSports],
  );

  useEffect(() => {
    if (step !== 9) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((value) => (value + 1) % LOADING_MESSAGES.length);
    }, 900);
    return () => clearInterval(interval);
  }, [step]);

  useEffect(() => {
    if (stepOrder.includes(step)) return;
    setStep(stepOrder[stepOrder.length - 1] || 1);
  }, [step, stepOrder]);

  useEffect(() => {
    if (step !== 9 || isFinishing) return;

    let cancelled = false;
    setIsFinishing(true);
    setPreloadState({ status: "running", progress: 8, message: "Starting background setup" });

    startOnboardingPreload({
      sportsEnabled,
      moviesEnabled,
      sports: selectedSports,
      competitions: selectedCompetitions,
      teams: selectedTeams,
      onProgress: (status) => {
        if (cancelled) return;
        setPreloadState({ status: "running", progress: status.progress, message: status.message });
      },
    })
      .catch(() => null)
      .finally(() => {
        const settle = 1200 + Math.round(Math.random() * 900);
        setTimeout(() => {
          if (cancelled) return;
          completeOnboarding();
          onFinished?.();
        }, settle);
      });

    return () => {
      cancelled = true;
    };
  }, [
    completeOnboarding,
    isFinishing,
    moviesEnabled,
    onFinished,
    selectedCompetitions,
    selectedSports,
    selectedTeams,
    setPreloadState,
    sportsEnabled,
    step,
  ]);

  const canAdvance = useMemo(() => {
    if (step === 1) return true;
    if (step === 2) return true;
    if (step === 3) return selectedSports.length > 0;
    if (step === 4) return selectedTeams.length > 0;
    if (step === 5) return selectedCompetitions.length > 0;
    if (step === 8) return movieSignals.length > 0;
    return step < 9;
  }, [movieSignals.length, selectedCompetitions.length, selectedSports.length, selectedTeams.length, step]);

  const next = () => {
    if (!canAdvance) return;
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex < 0 || currentIndex >= stepOrder.length - 1) return;
    setStep(stepOrder[currentIndex + 1]);
  };

  const back = () => {
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex <= 0) return;
    setStep(stepOrder[currentIndex - 1]);
  };

  if (step === 9) {
    return (
      <PulseLaunchScreen
        badge={mode === "editor" ? "Updating experience" : "Finalizing setup"}
        title="Building your premium home"
        subtitle={preload.message || LOADING_MESSAGES[loadingMessageIndex]}
        progress={preload.progress}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <StepDots step={visualStep} total={stepOrder.length} />
          {step > 1 ? (
            <Pressable onPress={back} hitSlop={8} style={styles.backButton}>
              <Ionicons name="arrow-back" size={18} color="#F4F5F7" />
            </Pressable>
          ) : null}
        </View>

        {step === 1 ? (
          <View style={styles.heroCard}>
            <PulseBrandMark size={86} subtitle="Premium media workspace" />
            <Text style={styles.heroEyebrow}>One subscription layer. Zero noise.</Text>
            <Text style={styles.heroTitle}>All your content. One place.</Text>
            <Text style={styles.heroBody}>
              Sports, live channels, movies and series tuned to how you actually watch. We will preload the essentials while you set it up.
            </Text>
            <View style={styles.heroPreviewRow}>
              <View style={styles.heroPreviewCard}>
                <Text style={styles.heroPreviewTitle}>Live Sports</Text>
                <Text style={styles.heroPreviewText}>Scores, lineups, AI recaps and your favorite clubs first.</Text>
              </View>
              <View style={styles.heroPreviewCard}>
                <Text style={styles.heroPreviewTitle}>Movies & Series</Text>
                <Text style={styles.heroPreviewText}>Continue-watching rails and premium picks ready on launch.</Text>
              </View>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 2</Text>
            <Text style={styles.sectionTitle}>Do you want sports in your app?</Text>
            <Text style={styles.sectionBody}>Turn the sports module on or off now. If you skip it, sports tabs and related rows stay hidden until you enable them later in settings.</Text>
            <View style={styles.binaryGrid}>
              <ChoiceChip active={sportsEnabled} label="Yes, enable sports" sublabel="Scores, competitions, match center" onPress={() => setSportsEnabled(true)} />
              <ChoiceChip active={!sportsEnabled} label="No, hide sports" sublabel="You can re-enable it later" onPress={() => setSportsEnabled(false)} />
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 3</Text>
            <Text style={styles.sectionTitle}>Which sports matter to you?</Text>
            <Text style={styles.sectionBody}>Choose one or more. This drives rankings, suggestions, tabs and preload focus.</Text>
            {!sportsEnabled ? <Text style={styles.skipHint}>Sports are disabled right now, so this step can be skipped.</Text> : null}
            <View style={styles.optionGrid}>
              {SPORT_OPTIONS.map((sport) => {
                const active = selectedSports.includes(sport.key);
                return (
                  <Pressable key={sport.key} onPress={() => toggleSport(sport.key)} style={[styles.sportCard, active ? styles.sportCardActive : null, !sportsEnabled ? styles.disabledCard : null]} disabled={!sportsEnabled}>
                    <Ionicons name={sport.icon as never} size={22} color={active ? "#090B10" : "#F4F5F7"} />
                    <Text style={[styles.sportLabel, active ? styles.sportLabelActive : null]}>{sport.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 4</Text>
            <Text style={styles.sectionTitle}>Choose favorite teams</Text>
            <Text style={styles.sectionBody}>Search directly, pick from trending clubs, or use the recommended picks based on your region and sport choices.</Text>
            {!sportsEnabled ? <Text style={styles.skipHint}>Sports are disabled right now, so team preferences are optional.</Text> : null}
            <TextInput
              value={teamQuery}
              onChangeText={setTeamQuery}
              editable={sportsEnabled}
              placeholder="Search clubs, drivers, fighters or players"
              placeholderTextColor="rgba(244,245,247,0.35)"
              style={styles.searchInput}
            />
            <Text style={styles.listLabel}>Suggested for you</Text>
            <View style={styles.selectionWrap}>
              {teamSuggestions.map((team) => {
                const active = selectedTeams.some((item) => item.id === team.id);
                return <ChoiceChip key={team.id} active={active} label={team.name} sublabel={team.competition || getSportLabel(team.sport)} onPress={() => toggleTeam(team)} />;
              })}
            </View>
            <Text style={styles.listLabel}>Browse all</Text>
            <View style={styles.selectionWrap}>
              {teamSearchResults.map((team) => {
                const active = selectedTeams.some((item) => item.id === team.id);
                return <ChoiceChip key={team.id} active={active} label={team.name} sublabel={team.competition || getSportLabel(team.sport)} onPress={() => toggleTeam(team)} />;
              })}
            </View>
          </View>
        ) : null}

        {step === 5 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 5</Text>
            <Text style={styles.sectionTitle}>Pick competitions to follow</Text>
            <Text style={styles.sectionBody}>Your chosen competitions shape standings, fixtures and the home feed. We bias suggestions toward {localeSignals.region}.</Text>
            {!sportsEnabled ? <Text style={styles.skipHint}>Sports are disabled right now, so competition tracking is optional.</Text> : null}
            <TextInput
              value={competitionQuery}
              onChangeText={setCompetitionQuery}
              editable={sportsEnabled}
              placeholder="Search leagues and tournaments"
              placeholderTextColor="rgba(244,245,247,0.35)"
              style={styles.searchInput}
            />
            <Text style={styles.listLabel}>Recommended competitions</Text>
            <View style={styles.selectionWrap}>
              {competitionSuggestions.map((competition) => {
                const active = selectedCompetitions.some((item) => item.id === competition.id);
                return <ChoiceChip key={competition.id} active={active} label={competition.name} sublabel={getSportLabel(competition.sport)} onPress={() => toggleCompetition(competition)} />;
              })}
            </View>
            <Text style={styles.listLabel}>Browse all</Text>
            <View style={styles.selectionWrap}>
              {competitionResults.map((competition) => {
                const active = selectedCompetitions.some((item) => item.id === competition.id);
                return <ChoiceChip key={competition.id} active={active} label={competition.name} sublabel={getSportLabel(competition.sport)} onPress={() => toggleCompetition(competition)} />;
              })}
            </View>
          </View>
        ) : null}

        {step === 6 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 6</Text>
            <Text style={styles.sectionTitle}>Notification preferences</Text>
            <Text style={styles.sectionBody}>Start with a sharp baseline. You can fine-tune these later without re-running onboarding.</Text>
            <View style={styles.preferenceList}>
              {[
                { key: "goals", label: "Goals and breaking moments" },
                { key: "matches", label: "Match start and final whistle" },
                { key: "lineups", label: "Lineups and late changes" },
                { key: "news", label: "News and release picks" },
              ].map((row) => {
                const prefKey = row.key as keyof typeof notifications;
                return (
                  <View key={row.key} style={styles.preferenceRow}>
                    <View style={styles.preferenceTextWrap}>
                      <Text style={styles.preferenceLabel}>{row.label}</Text>
                    </View>
                    <Switch
                      value={notifications[prefKey]}
                      onValueChange={(value) => setNotifications({ [prefKey]: value })}
                      trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(229,9,20,0.4)" }}
                      thumbColor={notifications[prefKey] ? COLORS.accent : "#F4F5F7"}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 7 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 7</Text>
            <Text style={styles.sectionTitle}>Enable movies and series?</Text>
            <Text style={styles.sectionBody}>If you turn this off, the entertainment tabs stay hidden until you re-enable them in settings.</Text>
            <View style={styles.binaryGrid}>
              <ChoiceChip active={moviesEnabled} label="Yes, enable entertainment" sublabel="Movies, series and continue watching" onPress={() => setMoviesEnabled(true)} />
              <ChoiceChip active={!moviesEnabled} label="No, keep it hidden" sublabel="Sports-first workspace" onPress={() => setMoviesEnabled(false)} />
            </View>
          </View>
        ) : null}

        {step === 8 ? (
          <View style={styles.contentCard}>
            <Text style={styles.sectionEyebrow}>Step 8</Text>
            <Text style={styles.sectionTitle}>What do you want to watch most?</Text>
            <Text style={styles.sectionBody}>Pick your entertainment profile. This helps tune recommendations on your home rails.</Text>
            <View style={styles.selectionWrap}>
              {[
                { key: "movies", label: "Movies", sublabel: "Cinema and new releases" },
                { key: "series", label: "Series", sublabel: "Binge and episodic picks" },
                { key: "documentaries", label: "Documentaries", sublabel: "Sports docs and true stories" },
                { key: "anime", label: "Anime", sublabel: "Popular and trending titles" },
              ].map((item) => {
                const active = movieSignals.includes(item.key);
                return (
                  <ChoiceChip
                    key={item.key}
                    active={active}
                    label={item.label}
                    sublabel={item.sublabel}
                    onPress={() => {
                      setMovieSignals((prev) => (
                        prev.includes(item.key)
                          ? prev.filter((entry) => entry !== item.key)
                          : [...prev, item.key]
                      ));
                    }}
                  />
                );
              })}
            </View>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextWrap}>
                <Text style={styles.preferenceLabel}>Notify me about new episodes and premieres</Text>
              </View>
              <Switch
                value={notifications.news}
                onValueChange={(value) => setNotifications({ news: value })}
                trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(229,9,20,0.4)" }}
                thumbColor={notifications.news ? COLORS.accent : "#F4F5F7"}
              />
            </View>
          </View>
        ) : null}

        {step < 9 ? (
          <View style={styles.footer}>
            <Text style={styles.footerHint}>
              {mode === "editor" ? "Changes apply immediately after final setup." : "This only takes a moment and improves the first load experience."}
            </Text>
            <Pressable disabled={!canAdvance} onPress={next} style={[styles.primaryButton, !canAdvance ? styles.primaryButtonDisabled : null]}>
              <Text style={styles.primaryButtonText}>{step === 1 ? "Get Started" : "Continue"}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {isFinishing && step === 9 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#FF5A5F" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundOrbTop: {
    position: "absolute",
    top: -80,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: COLORS.accentGlow,
  },
  backgroundOrbBottom: {
    position: "absolute",
    bottom: -60,
    left: -30,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: "rgba(229,9,20,0.14)",
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 34,
    paddingTop: 8,
    gap: 18,
  },
  headerRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepDots: {
    flexDirection: "row",
    gap: 8,
  },
  stepDot: {
    width: 20,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  stepDotActive: {
    backgroundColor: COLORS.accent,
    width: 34,
  },
  stepDotComplete: {
    backgroundColor: COLORS.accent,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    paddingTop: 42,
    gap: 20,
  },
  heroEyebrow: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#F7F7FB",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40,
    textAlign: "center",
  },
  heroBody: {
    color: "rgba(247,247,251,0.76)",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  heroPreviewRow: {
    gap: 12,
  },
  heroPreviewCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.card,
    padding: 18,
    gap: 8,
  },
  heroPreviewTitle: {
    color: "#F7F7FB",
    fontSize: 16,
    fontWeight: "800",
  },
  heroPreviewText: {
    color: "rgba(247,247,251,0.68)",
    lineHeight: 21,
  },
  contentCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    padding: 20,
    gap: 16,
  },
  sectionEyebrow: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: "#F7F7FB",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  sectionBody: {
    color: "rgba(247,247,251,0.72)",
    fontSize: 15,
    lineHeight: 23,
  },
  binaryGrid: {
    gap: 12,
  },
  choiceChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  choiceChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  choiceChipLabel: {
    color: "#F7F7FB",
    fontSize: 15,
    fontWeight: "800",
  },
  choiceChipLabelActive: {
    color: "#090B10",
  },
  choiceChipSublabel: {
    color: "rgba(247,247,251,0.6)",
    fontSize: 12,
  },
  choiceChipSublabelActive: {
    color: "rgba(9,11,16,0.72)",
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sportCard: {
    width: "47%",
    minHeight: 94,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.card,
    padding: 16,
    justifyContent: "space-between",
  },
  sportCardActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  disabledCard: {
    opacity: 0.45,
  },
  sportLabel: {
    color: "#F7F7FB",
    fontSize: 15,
    fontWeight: "800",
  },
  sportLabelActive: {
    color: "#090B10",
  },
  skipHint: {
    color: "rgba(246,179,108,0.86)",
    fontSize: 13,
    lineHeight: 20,
  },
  searchInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#F7F7FB",
    fontSize: 15,
  },
  listLabel: {
    color: "#F7F7FB",
    fontSize: 14,
    fontWeight: "800",
  },
  selectionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  preferenceList: {
    gap: 10,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  preferenceTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  preferenceLabel: {
    color: "#F7F7FB",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  footer: {
    marginTop: 8,
    gap: 12,
  },
  footerHint: {
    color: "rgba(247,247,251,0.58)",
    fontSize: 13,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: "#090B10",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  loadingOverlay: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
  },
});