import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Platform,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Updates from "expo-updates";

import { UpdateModal } from "@/components/update";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { PremiumOnboardingFlow } from "@/features/onboarding/PremiumOnboardingFlow";
import { t as tFn } from "@/lib/i18n";
import { PREFERRED_SERVER_LABELS } from "@/lib/playback-engine";
import { queryClient } from "@/lib/query-client";
import { SafeHaptics } from "@/lib/safeHaptics";
import { useTranslation } from "@/lib/useTranslation";
import { getUpdateDiagnosticsAsync } from "@/services/update-diagnostics";
import { compareVersions } from "@/services/update-service";
import { useOnboardingStore } from "@/store/onboarding-store";
import { useUiStore } from "@/store/uiStore";

const LANGUAGES = [
  { code: "auto", label: "Auto (System)" },
  { code: "nl", label: "Nederlands" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
  { code: "tr", label: "Türkçe" },
];

const UI_LANGUAGE_OPTIONS = [
  { code: "en" as const, labelKey: "settings.languageEnglish" },
  { code: "nl" as const, labelKey: "settings.languageDutch" },
  { code: "fr" as const, labelKey: "settings.languageFrench" },
  { code: "de" as const, labelKey: "settings.languageGerman" },
  { code: "es" as const, labelKey: "settings.languageSpanish" },
  { code: "pt" as const, labelKey: "settings.languagePortuguese" },
];

const QUALITY_OPTIONS = [
  { code: "Auto", labelKey: "settings.qualityAuto" },
  { code: "4K", labelKey: "settings.quality4k" },
  { code: "FHD", labelKey: "settings.qualityFHD" },
  { code: "HD", labelKey: "settings.qualityHD" },
] as const;

const SERVER_OPTIONS = PREFERRED_SERVER_LABELS;

function QualityModal({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (quality: (typeof QUALITY_OPTIONS)[number]["code"]) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={langStyles.overlay}>
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>{tFn("settings.quality")}</Text>
          {QUALITY_OPTIONS.map((quality) => (
            <TouchableOpacity
              key={quality.code}
              style={langStyles.option}
              onPress={() => {
                SafeHaptics.impactLight();
                onSelect(quality.code);
                onClose();
              }}
            >
              <Text style={langStyles.optionText}>{tFn(quality.labelKey)}</Text>
              {selected === quality.code ? (
                <Ionicons name="checkmark" size={18} color={COLORS.accent} />
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function LanguageModal({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (language: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={langStyles.overlay}>
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>{tFn("settings.audioLanguage")}</Text>
          {LANGUAGES.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={langStyles.option}
              onPress={() => {
                SafeHaptics.impactLight();
                onSelect(language.code);
                onClose();
              }}
            >
              <Text style={langStyles.optionText}>{language.label}</Text>
              {selected === language.code ? (
                <Ionicons name="checkmark" size={18} color={COLORS.accent} />
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function UiLanguageModal({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (language: "en" | "nl" | "fr" | "de" | "es" | "pt") => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={langStyles.overlay}>
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>{tFn("settings.language")}</Text>
          {UI_LANGUAGE_OPTIONS.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={langStyles.option}
              onPress={() => {
                SafeHaptics.impactLight();
                onSelect(language.code);
                onClose();
              }}
            >
              <Text style={langStyles.optionText}>
                {tFn(language.labelKey)}
              </Text>
              {selected === language.code ? (
                <Ionicons name="checkmark" size={18} color={COLORS.accent} />
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function ServerModal({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (server: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={langStyles.overlay}>
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>Primaire film/serieserver</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {SERVER_OPTIONS.map((server) => (
              <TouchableOpacity
                key={server}
                style={langStyles.option}
                onPress={() => {
                  SafeHaptics.impactLight();
                  onSelect(server);
                  onClose();
                }}
              >
                <Text style={langStyles.optionText}>{server}</Text>
                {selected === server ? (
                  <Ionicons name="checkmark" size={18} color={COLORS.accent} />
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PinModal({
  visible,
  mode,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  mode: "set" | "confirm";
  onClose: () => void;
  onConfirm: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!visible) {
      setPin("");
    }
  }, [visible, mode]);

  const appendDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === 4) {
      onConfirm(next);
      setPin("");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={pinStyles.overlay}>
        <View style={pinStyles.modal}>
          <Text style={pinStyles.title}>
            {mode === "set" ? "Stel pincode in" : "Bevestig pincode"}
          </Text>
          <Text style={pinStyles.label}>
            Voer een pincode van 4 cijfers in.
          </Text>

          <View style={pinStyles.dots}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  pinStyles.dot,
                  pin.length > index && pinStyles.dotFilled,
                ]}
              />
            ))}
          </View>

          <View style={pinStyles.numpad}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
              <TouchableOpacity
                key={digit}
                style={pinStyles.numKey}
                onPress={() => appendDigit(digit)}
              >
                <Text style={pinStyles.numKeyText}>{digit}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={pinStyles.numKey}
              onPress={() => setPin((current) => current.slice(0, -1))}
            >
              <Ionicons
                name="backspace-outline"
                size={20}
                color={COLORS.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={pinStyles.numKey}
              onPress={() => setPin("")}
            >
              <Text style={pinStyles.numKeyText}>C</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={pinStyles.cancelBtn} onPress={onClose}>
            <Text style={pinStyles.cancelText}>Sluiten</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  sub,
  value,
  onPress,
  right,
  danger = false,
}: {
  icon: string;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={onPress || right ? 0.72 : 1}
      disabled={!onPress && !right}
      onPress={onPress}
    >
      <View style={[s.rowIcon, danger && s.rowIconDanger]}>
        <Ionicons
          name={icon as any}
          size={18}
          color={danger ? COLORS.live : COLORS.accent}
        />
      </View>
      <View style={s.rowBody}>
        <Text
          style={[s.rowLabel, danger && s.rowLabelDanger]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sub ? (
          <Text style={s.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={s.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ?? null}
      {onPress && !right ? (
        <Ionicons name="chevron-forward" size={15} color={COLORS.textFaint} />
      ) : null}
    </TouchableOpacity>
  );
}

function Sep() {
  return <View style={s.sep} />;
}

function Group({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.group}>
      <View style={s.groupHeader}>
        {icon ? (
          <Ionicons
            name={icon as any}
            size={12}
            color={COLORS.accent}
            style={{ marginRight: 5 }}
          />
        ) : null}
        <Text style={s.groupTitle}>{title.toUpperCase()}</Text>
      </View>
      <View style={s.groupCard}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const closeNexoraMenu = useUiStore((state) => state.closeNexoraMenu);
  const { openUpdate } = useLocalSearchParams<{ openUpdate?: string }>();
  const {
    selectedQuality,
    setSelectedQuality,
    subtitlesEnabled,
    setSubtitlesEnabled,
    audioLanguage,
    setAudioLanguage,
    preferredServerLabel,
    setPreferredServerLabel,
    autoplayEnabled,
    setAutoplayEnabled,
    downloadOverWifi,
    setDownloadOverWifi,
    notificationsEnabled,
    setNotificationsEnabled,
    parentalPin,
    setParentalPin,
    favorites,
    watchHistory,
    clearHistory,
    isPremium,
    resetAll,
    avatarUri,
    setAvatarUri,
    uiLanguage,
    setUiLanguage,
  } = useNexora();
  const { t } = useTranslation();

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"set" | "confirm">("set");
  const [showLangModal, setShowLangModal] = useState(false);
  const [showUiLangModal, setShowUiLangModal] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(openUpdate === "1");
  const [showOnboardingEditor, setShowOnboardingEditor] = useState(false);
  const [lastRollbackLabel, setLastRollbackLabel] = useState(
    "Geen rollback gedetecteerd",
  );
  const {
    moviesEnabled: onboardingMoviesEnabled,
    notifications: onboardingNotifications,
    resetOnboarding,
  } = useOnboardingStore();

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const selectedLangLabel =
    LANGUAGES.find((l) => l.code === audioLanguage)?.label || "Auto";
  const selectedUiLanguage = UI_LANGUAGE_OPTIONS.find(
    (l) => l.code === uiLanguage,
  );
  const selectedUiLanguageLabel = selectedUiLanguage
    ? t(selectedUiLanguage.labelKey)
    : t("settings.languageEnglish");

  const nativeVersion = String(Application.nativeApplicationVersion || "0.0.0");
  const configVersion = String(Constants.expoConfig?.version || "0.0.0");
  const runtimeVersion = String(Updates.runtimeVersion || "0.0.0");
  const appVersion =
    [nativeVersion, configVersion, runtimeVersion]
      .sort(compareVersions)
      .at(-1) || nativeVersion;
  const softwareVersion = Updates.updateId
    ? `${configVersion}-${Updates.updateId.slice(0, 8)}`
    : configVersion;
  const notificationSummary = Object.values(onboardingNotifications).filter(
    Boolean,
  ).length;

  React.useEffect(() => {
    let mounted = true;
    void getUpdateDiagnosticsAsync().then((diagnostics) => {
      if (!mounted) return;
      const rollback = diagnostics.lastRollback;
      if (!rollback) {
        setLastRollbackLabel("Geen rollback gedetecteerd");
        return;
      }
      const current = rollback.currentUpdateId
        ? rollback.currentUpdateId.slice(0, 8)
        : "embedded";
      setLastRollbackLabel(
        `${rollback.detectedAt.slice(0, 19)} | ${rollback.previousUpdateId.slice(0, 8)} -> ${current}`,
      );
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    closeNexoraMenu();
  }, [closeNexoraMenu]);

  const handleManualUpdateCheck = useCallback(() => {
    setShowUpdateModal(true);
  }, []);

  const handleSetPin = () => {
    if (parentalPin) {
      setPinModalMode("confirm");
      setShowPinModal(true);
    } else {
      setPinModalMode("set");
      setShowPinModal(true);
    }
  };

  const handlePinConfirm = (pin: string) => {
    setShowPinModal(false);
    if (pinModalMode === "set") {
      setParentalPin(pin);
      SafeHaptics.success();
      Alert.alert("PIN Set", "Parental control PIN has been activated.");
    } else {
      if (pin === parentalPin) {
        setParentalPin(null);
        SafeHaptics.success();
        Alert.alert("PIN Removed", "Parental control has been deactivated.");
      } else {
        SafeHaptics.error();
        Alert.alert("Wrong PIN", "The PIN you entered is incorrect.");
      }
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      "Clear Watch History",
      "This will remove all your watched content history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearHistory();
            SafeHaptics.success();
            Alert.alert("Cleared", "Watch history has been cleared.");
          },
        },
      ],
    );
  };

  const handleResetAppData = () => {
    Alert.alert(
      "Reset App Data",
      "This will clear favorites, history and cache.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await resetAll();
              queryClient.clear();
              SafeHaptics.success();
              Alert.alert("Klaar", "App data is gereset.");
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Could not reset app data");
            }
          },
        },
      ],
    );
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      "Reset onboarding",
      "This will reopen the first-launch setup and clear your current onboarding selections.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            resetOnboarding();
            setShowOnboardingEditor(false);
          },
        },
      ],
    );
  };

  const handlePickAvatar = async () => {
    SafeHaptics.impactLight();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("settings.permissionNeeded"), t("settings.photoAccess"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await setAvatarUri(result.assets[0].uri);
    }
  };

  return (
    <View style={s.screen}>
      <View style={s.glowTop} />
      <View style={s.glowBottom} />
      {/* Custom header */}
      <View style={[s.customHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.headerBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t("settings.settingsTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
      >
        {/* ── Profile card ── */}
        <TouchableOpacity
          style={s.profileCard}
          onPress={() => router.push("/profile")}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={["rgba(229,9,20,0.18)", "rgba(229,9,20,0.04)"]}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            style={s.avatarBox}
            onPress={handlePickAvatar}
            activeOpacity={0.8}
          >
            <View style={s.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={s.avatarImg} />
              ) : (
                <Ionicons name="person" size={32} color={COLORS.accent} />
              )}
            </View>
            <View style={s.cameraBadge}>
              <Ionicons name="camera" size={11} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={s.profileMid}>
            <Text style={s.profileName}>{t("settings.mainProfile")}</Text>
            <TouchableOpacity
              style={[s.premiumPill, isPremium && s.premiumPillActive]}
              onPress={() => router.push("/premium")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="crown"
                size={12}
                color={isPremium ? COLORS.gold : COLORS.textMuted}
              />
              <Text
                style={[
                  s.premiumPillText,
                  isPremium && s.premiumPillTextActive,
                ]}
              >
                {isPremium
                  ? t("settings.premium")
                  : t("settings.upgradePremium")}
              </Text>
              {!isPremium && (
                <Ionicons
                  name="chevron-forward"
                  size={11}
                  color={COLORS.accent}
                />
              )}
            </TouchableOpacity>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textFaint} />
        </TouchableOpacity>

        {/* ── Stats row ── */}
        <View style={s.statsRow}>
          {[
            { label: t("settings.favorites"), val: favorites.length },
            { label: t("settings.watched"), val: watchHistory.length },
          ].map((item, i, arr) => (
            <React.Fragment key={item.label}>
              <View style={s.statItem}>
                <Text style={s.statVal}>{item.val}</Text>
                <Text style={s.statLbl}>{item.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={s.statDiv} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── Modules ── */}
        <Group title={t("settings.modules")} icon="grid-outline">
          <Row
            icon="film-outline"
            label={t("settings.moviesAndSeries")}
            sub={
              onboardingMoviesEnabled
                ? t("settings.enabled")
                : t("settings.hidden")
            }
            right={
              <Switch
                value={onboardingMoviesEnabled}
                onValueChange={(v) =>
                  useOnboardingStore.getState().setMoviesEnabled(v)
                }
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={
                  onboardingMoviesEnabled ? COLORS.accent : COLORS.textMuted
                }
              />
            }
          />
          <Sep />
          <Row
            icon="film-outline"
            label={t("home.allFilms")}
            sub={t("settings.moviesAndSeries")}
            onPress={() => router.push("/media/movies")}
          />
        </Group>

        {/* ── Personalisatie ── */}
        <Group title={t("settings.personalization")} icon="color-wand-outline">
          <Row
            icon="notifications-outline"
            label={t("settings.notificationPreferences")}
            sub={`${notificationSummary} actief`}
            onPress={() => router.push("/notifications")}
          />
          <Sep />
          <Row
            icon="settings-outline"
            label={t("settings.editOnboarding")}
            onPress={() => setShowOnboardingEditor(true)}
          />
        </Group>

        {/* ── Afspeelbeheer ── */}
        <Group title={t("settings.playback")} icon="play-circle-outline">
          <Row
            icon="server-outline"
            label="Primaire film/serieserver"
            value={preferredServerLabel}
            onPress={() => setShowServerModal(true)}
          />
          <Sep />
          <Row
            icon="videocam-outline"
            label={t("settings.quality")}
            value={selectedQuality}
            onPress={() => setShowQualityModal(true)}
          />
          <Sep />
          <Row
            icon="text-outline"
            label={t("settings.subtitles")}
            right={
              <Switch
                value={subtitlesEnabled}
                onValueChange={(v) => {
                  SafeHaptics.impactLight();
                  setSubtitlesEnabled(v);
                }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={subtitlesEnabled ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
          <Sep />
          <Row
            icon="language-outline"
            label={t("settings.audioLanguage")}
            value={selectedLangLabel}
            onPress={() => setShowLangModal(true)}
          />
          <Sep />
          <Row
            icon="play-skip-forward-outline"
            label={t("settings.autoplayNext")}
            right={
              <Switch
                value={autoplayEnabled}
                onValueChange={(v) => {
                  SafeHaptics.impactLight();
                  setAutoplayEnabled(v);
                }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={autoplayEnabled ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
        </Group>

        {/* ── Downloads ── */}
        <Group title={t("settings.downloadsSection")} icon="download-outline">
          <Row
            icon="wifi-outline"
            label={t("settings.wifiOnly")}
            right={
              <Switch
                value={downloadOverWifi}
                onValueChange={(v) => {
                  SafeHaptics.impactLight();
                  setDownloadOverWifi(v);
                }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={downloadOverWifi ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
          <Sep />
          <Row
            icon="folder-outline"
            label={t("settings.offlineDownloads")}
            sub={t("settings.notAvailable")}
            onPress={() =>
              Alert.alert(
                t("settings.downloadsSection"),
                t("settings.offlineNotAvailable"),
              )
            }
          />
        </Group>

        {/* ── Meldingen ── */}
        <Group title={t("settings.notifications")} icon="notifications-outline">
          <Row
            icon="notifications-outline"
            label={t("settings.pushNotifications")}
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={(v) => {
                  SafeHaptics.impactLight();
                  setNotificationsEnabled(v);
                }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={
                  notificationsEnabled ? COLORS.accent : COLORS.textMuted
                }
              />
            }
          />
          <Sep />
          <Row
            icon="calendar-outline"
            label={t("settings.newReleases")}
            sub={t("settings.comingSoon")}
            onPress={() =>
              Alert.alert(t("settings.newReleases"), t("settings.notifHint"))
            }
          />
        </Group>

        {/* ── Beveiliging ── */}
        <Group title={t("settings.security")} icon="shield-checkmark-outline">
          <Row
            icon="lock-closed-outline"
            label={t("settings.parentalControl")}
            value={parentalPin ? t("settings.pinActive") : t("settings.pinOff")}
            onPress={handleSetPin}
          />
          <Sep />
          <Row
            icon="time-outline"
            label={t("settings.clearHistory")}
            value={
              watchHistory.length > 0
                ? `${watchHistory.length} ${t("settings.items")}`
                : t("common.empty")
            }
            onPress={handleClearHistory}
          />
        </Group>

        {/* ── Taal ── */}
        <Group title={t("settings.language")} icon="globe-outline">
          <Row
            icon="globe-outline"
            label={t("settings.language")}
            sub="Wijzig de app interface taal"
            value={selectedUiLanguageLabel}
            onPress={() => setShowUiLangModal(true)}
          />
        </Group>

        {/* ── Over Nexora ── */}
        <Group title={t("settings.about")} icon="information-circle-outline">
          <Row
            icon="phone-portrait-outline"
            label={t("settings.appVersion")}
            value={appVersion}
          />
          <Sep />
          <Row
            icon="code-slash-outline"
            label={t("settings.softwareVersion")}
            value={softwareVersion}
          />
          <Sep />
          <Row
            icon="git-branch-outline"
            label="Update kanaal"
            value={String(Updates.channel || "unknown")}
          />
          <Sep />
          <Row
            icon="server-outline"
            label="Bundle bron"
            value={
              Updates.isEmbeddedLaunch
                ? "Embedded"
                : Updates.updateId
                  ? `OTA: ${Updates.updateId.slice(0, 8)}`
                  : "Onbekend"
            }
          />
          <Sep />
          <Row
            icon="alert-circle-outline"
            label="Laatste rollback"
            sub={lastRollbackLabel}
          />
          <Sep />
          <Row
            icon="cloud-download-outline"
            label={t("settings.checkUpdates")}
            onPress={handleManualUpdateCheck}
          />
          <Sep />
          <Row
            icon="star-outline"
            label={t("settings.rateApp")}
            onPress={() =>
              Alert.alert(t("settings.rateTitle"), t("settings.rateMessage"))
            }
          />
          <Sep />
          <Row
            icon="help-circle-outline"
            label={t("settings.support")}
            onPress={() =>
              Alert.alert(
                t("settings.support"),
                `${t("settings.supportEmail")}\n\n${t("settings.supportResponse")}`,
              )
            }
          />
          <Sep />
          <Row
            icon="shield-checkmark-outline"
            label={t("settings.privacyPolicy")}
            onPress={() =>
              Alert.alert(
                t("settings.privacyPolicy"),
                t("settings.privacyMessage"),
              )
            }
          />
        </Group>

        {/* ── Gevaarzone ── */}
        <Group title="Gevaarzone" icon="warning-outline">
          <Row
            icon="refresh-outline"
            label={t("settings.resetOnboardingLabel")}
            danger
            onPress={handleResetOnboarding}
          />
          <Sep />
          <Row
            icon="nuclear-outline"
            label={t("settings.resetApp")}
            danger
            onPress={handleResetAppData}
          />
        </Group>
      </ScrollView>

      {/* ── Modals ── */}
      <PinModal
        visible={showPinModal}
        mode={pinModalMode}
        onClose={() => setShowPinModal(false)}
        onConfirm={handlePinConfirm}
      />
      <LanguageModal
        visible={showLangModal}
        selected={audioLanguage}
        onClose={() => setShowLangModal(false)}
        onSelect={setAudioLanguage}
      />
      <UiLanguageModal
        visible={showUiLangModal}
        selected={uiLanguage}
        onClose={() => setShowUiLangModal(false)}
        onSelect={setUiLanguage}
      />
      <QualityModal
        visible={showQualityModal}
        selected={selectedQuality}
        onClose={() => setShowQualityModal(false)}
        onSelect={setSelectedQuality}
      />
      <ServerModal
        visible={showServerModal}
        selected={preferredServerLabel}
        onClose={() => setShowServerModal(false)}
        onSelect={setPreferredServerLabel}
      />
      <UpdateModal
        visible={showUpdateModal}
        currentVersion={appVersion}
        onClose={() => setShowUpdateModal(false)}
      />
      <Modal
        visible={showOnboardingEditor}
        animationType="slide"
        onRequestClose={() => setShowOnboardingEditor(false)}
      >
        <PremiumOnboardingFlow
          mode="editor"
          onFinished={() => setShowOnboardingEditor(false)}
        />
      </Modal>
    </View>
  );
}
const pinStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 24,
    padding: 24,
    width: 300,
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
  },
  dots: { flexDirection: "row", gap: 16 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  dotFilled: { backgroundColor: COLORS.accent },
  numpad: { flexDirection: "row", flexWrap: "wrap", width: 216, gap: 8 },
  numKey: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  numKeyText: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: COLORS.textMuted,
  },
});

const langStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.cardElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 32,
    overflow: "hidden",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginVertical: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  optionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: COLORS.text,
  },
});
const s = StyleSheet.create({
  // Screen
  screen: { flex: 1, backgroundColor: COLORS.background },
  customHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  glowTop: {
    position: "absolute",
    top: -120,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(229,9,20,0.10)",
  },
  glowBottom: {
    position: "absolute",
    right: -90,
    bottom: 140,
    width: 230,
    height: 230,
    borderRadius: 230,
    backgroundColor: "rgba(229,9,20,0.07)",
  },

  // Profile card
  profileCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  avatarBox: { position: "relative" },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 58, height: 58, borderRadius: 14 },
  cameraBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  profileMid: { flex: 1, gap: 5 },
  profileName: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: COLORS.text,
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: COLORS.glass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  premiumPillActive: {
    backgroundColor: "rgba(255,215,0,0.08)",
    borderColor: "rgba(255,215,0,0.35)",
  },
  premiumPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textMuted,
  },
  premiumPillTextActive: { color: COLORS.gold },

  // Stats row
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: COLORS.cardElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center", gap: 3, flex: 1 },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.accent },
  statLbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
  },
  statDiv: { width: 1, backgroundColor: COLORS.border, alignSelf: "stretch" },

  // Channel bar
  channelBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    alignItems: "center",
  },
  channelStat: { flex: 1, alignItems: "center", gap: 2 },
  channelStatNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.accent,
  },
  channelStatLbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  channelDiv: { width: 1, height: 24, backgroundColor: COLORS.border },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  manageBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.accent,
  },

  // Settings groups
  group: { marginHorizontal: 16, marginBottom: 22 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.9,
    color: COLORS.textMuted,
  },
  groupCard: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: COLORS.liveGlow },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.text },
  rowLabelDanger: { color: COLORS.live },
  rowSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  rowValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textMuted,
    flexShrink: 1,
    textAlign: "right",
    marginRight: 4,
  },
  sep: { height: 1, backgroundColor: COLORS.border, marginLeft: 62 },

  // Language rows
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  langRowActive: { backgroundColor: "rgba(229,9,20,0.07)" },
  langFlag: { fontSize: 22 },
  langLabel: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  langLabelActive: { color: COLORS.text, fontFamily: "Inter_600SemiBold" },
});
