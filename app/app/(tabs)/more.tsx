/**
 * CINELOG Settings — compacte instellingenpagina
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import appConfig from "@/app.json";

import { UpdateModal } from "@/components/update";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { t as tFn } from "@/lib/i18n";
import { getActiveProviderLabels } from "@/lib/playback-engine";
import { apiRequest, queryClient } from "@/lib/query-client";
import { SafeAlert } from "@/lib/safeAlert";
import { SafeHaptics } from "@/lib/safeHaptics";
import { useTranslation } from "@/lib/useTranslation";
import { compareVersions } from "@/services/update-service";
import { useUiStore } from "@/store/uiStore";

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────
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

const SERVER_ID_MAP: Record<string, string> = {
  "Server 1": "vidlinkpro",
  "Server 2": "vidfast",
  "Server 3": "videasy",
  "Server 4": "vidsrcnl",
  "Server 5": "warezcdn",
  "Server 6": "flicky",
  "Server 7": "moviesapi",
  "Server 8": "flickystream",
  "Server 9": "autoembed",
  "Server 10": "embedsu",
  "Server 11": "111movies",
  "Server 12": "vidsrcstream",
  "Server 13": "2embedorg",
};

type ServerHealth = "checking" | "online" | "slow" | "offline";


// ─────────────────────────────────────────────────────────────────────────────
// Bottom sheet wrapper
// ─────────────────────────────────────────────────────────────────────────────
function BottomSheet({
  visible, onClose, title, children,
}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheet.overlay} onPress={onClose}>
        <Pressable style={sheet.container} onPress={(e) => e.stopPropagation()}>
          <LinearGradient colors={["rgba(192,38,211,0.08)", "transparent"]} style={StyleSheet.absoluteFill} />
          <View style={sheet.handle} />
          <Text style={sheet.title}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetOption({ label, active, onPress, left }: {
  label: string; active: boolean; onPress: () => void; left?: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={[sheet.option, active && sheet.optionActive]} onPress={onPress} activeOpacity={0.7}>
      {left ?? null}
      <Text style={[sheet.optionText, active && sheet.optionTextActive]}>{label}</Text>
      {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />}
    </TouchableOpacity>
  );
}

function QualitySheet({ visible, onClose, selected, onSelect }: {
  visible: boolean; onClose: () => void; selected: string;
  onSelect: (q: (typeof QUALITY_OPTIONS)[number]["code"]) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tFn("settings.quality")}>
      {QUALITY_OPTIONS.map((q) => (
        <SheetOption key={q.code} label={tFn(q.labelKey)} active={selected === q.code}
          onPress={() => { SafeHaptics.impactLight(); onSelect(q.code); onClose(); }} />
      ))}
    </BottomSheet>
  );
}

function AudioLanguageSheet({ visible, onClose, selected, onSelect }: {
  visible: boolean; onClose: () => void; selected: string; onSelect: (lang: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tFn("settings.audioLanguage")}>
      <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
        {LANGUAGES.map((lang) => (
          <SheetOption key={lang.code} label={lang.label} active={selected === lang.code}
            onPress={() => { SafeHaptics.impactLight(); onSelect(lang.code); onClose(); }} />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function UiLanguageSheet({ visible, onClose, selected, onSelect }: {
  visible: boolean; onClose: () => void; selected: string;
  onSelect: (lang: "en" | "nl" | "fr" | "de" | "es" | "pt") => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tFn("settings.language")}>
      {UI_LANGUAGE_OPTIONS.map((lang) => (
        <SheetOption key={lang.code} label={tFn(lang.labelKey)} active={selected === lang.code}
          onPress={() => { SafeHaptics.impactLight(); onSelect(lang.code); onClose(); }} />
      ))}
    </BottomSheet>
  );
}

function HealthDot({ status }: { status: ServerHealth }) {
  if (status === "checking") return <ActivityIndicator size={10} color={COLORS.textMuted} style={{ marginRight: 8 }} />;
  const color = status === "online" ? "#22c55e" : status === "slow" ? "#f59e0b" : "#ef4444";
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 8 }} />;
}

function ServerSheet({ visible, onClose, selected, onSelect }: {
  visible: boolean; onClose: () => void; selected: string; onSelect: (server: string) => void;
}) {
  const [health, setHealth] = React.useState<Record<string, ServerHealth>>({});
  const [list, setList] = React.useState<string[]>(() => getActiveProviderLabels());

  React.useEffect(() => {
    if (!visible) return;
    const live = getActiveProviderLabels();
    setList(live);
    const init: Record<string, ServerHealth> = {};
    live.forEach((s) => { init[s] = "checking"; });
    setHealth(init);
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/streams/health");
        const json = await res.json() as {
          ok: boolean;
          data?: { active?: { details?: { id: string; healthy: boolean }[] } };
        };
        const details = json?.data?.active?.details ?? [];
        const healthById: Record<string, boolean> = {};
        details.forEach((d) => { healthById[d.id] = d.healthy; });
        setHealth((prev) => {
          const next = { ...prev };
          live.forEach((lbl) => {
            const id = SERVER_ID_MAP[lbl];
            next[lbl] = id !== undefined ? (healthById[id] === false ? "offline" : "online") : "online";
          });
          return next;
        });
      } catch {
        setHealth((prev) => {
          const next = { ...prev };
          live.forEach((lbl) => { next[lbl] = "online"; });
          return next;
        });
      }
    })();
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Streaming server">
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        {list.map((server) => (
          <SheetOption key={server} label={server} active={selected === server}
            left={<HealthDot status={health[server] ?? "checking"} />}
            onPress={() => { SafeHaptics.impactLight(); onSelect(server); onClose(); }} />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function PinModal({ visible, mode, onClose, onConfirm }: {
  visible: boolean; mode: "set" | "confirm"; onClose: () => void; onConfirm: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!visible) setPin("");
  }, [visible, mode]);

  const appendDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === 4) { onConfirm(next); setPin(""); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pin$.overlay}>
        <View style={pin$.modal}>
          <LinearGradient colors={["rgba(192,38,211,0.12)", "transparent"]} style={StyleSheet.absoluteFill} />
          <View style={pin$.iconWrap}>
            <Ionicons name="lock-closed" size={26} color={COLORS.accent} />
          </View>
          <Text style={pin$.title}>{mode === "set" ? "PIN instellen" : "PIN bevestigen"}</Text>
          <Text style={pin$.label}>Voer een 4-cijferige pincode in</Text>
          <View style={pin$.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[pin$.dot, pin.length > i && pin$.dotFilled]} />
            ))}
          </View>
          <View style={pin$.numpad}>
            {["1","2","3","4","5","6","7","8","9","0"].map((d) => (
              <TouchableOpacity key={d} style={pin$.key} onPress={() => appendDigit(d)}>
                <Text style={pin$.keyText}>{d}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={pin$.key} onPress={() => setPin((p) => p.slice(0, -1))}>
              <Ionicons name="backspace-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={pin$.key} onPress={() => setPin("")}>
              <Text style={pin$.keyText}>C</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={pin$.cancelBtn} onPress={onClose}>
            <Text style={pin$.cancelText}>Annuleren</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SettingsRow({
  icon, label, sub, value, onPress, right, danger = false, badge,
}: {
  icon: string; label: string; sub?: string; value?: string;
  onPress?: () => void; right?: React.ReactNode; danger?: boolean; badge?: string;
}) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={onPress || right ? 0.72 : 1}
      disabled={!onPress && !right} onPress={onPress}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon as any} size={17} color={danger ? COLORS.live : COLORS.accent} />
      </View>
      <View style={styles.rowBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>{label}</Text>
          {badge ? <View style={styles.settingsBadge}><Text style={styles.settingsBadgeText}>{badge}</Text></View> : null}
        </View>
        {sub ? <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {right ?? null}
      {onPress && !right ? <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} /> : null}
    </TouchableOpacity>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scherm
// ─────────────────────────────────────────────────────────────────────────────
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const closeNexoraMenu = useUiStore((state) => state.closeNexoraMenu);
  const { openUpdate } = useLocalSearchParams<{ openUpdate?: string }>();
  const {
    isPremium,
    selectedQuality, setSelectedQuality,
    subtitlesEnabled, setSubtitlesEnabled,
    audioLanguage, setAudioLanguage,
    preferredServerLabel, setPreferredServerLabel,
    autoplayEnabled, setAutoplayEnabled,
    downloadOverWifi, setDownloadOverWifi,
    notificationsEnabled, setNotificationsEnabled,
    parentalPin, setParentalPin,
    favorites, watchHistory, clearHistory,
    resetAll,
    avatarUri, setAvatarUri,
    uiLanguage, setUiLanguage,
  } = useNexora();

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"set" | "confirm">("set");
  const [showLangSheet, setShowLangSheet] = useState(false);
  const [showUiLangSheet, setShowUiLangSheet] = useState(false);
  const [showQualitySheet, setShowQualitySheet] = useState(false);
  const [showServerSheet, setShowServerSheet] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(openUpdate === "1");

  useEffect(() => {
    closeNexoraMenu();
  }, [closeNexoraMenu]);

  const nativeVersion = String(Application.nativeApplicationVersion || "0.0.0");
  const configVersion = String(Constants.expoConfig?.version || "0.0.0");
  const staticConfigVersion = String((appConfig as any)?.expo?.version || "0.0.0");
  const runtimeVersion = String(Updates.runtimeVersion || "0.0.0");
  const appVersion = [nativeVersion, configVersion, staticConfigVersion, runtimeVersion]
    .sort(compareVersions)
    .at(-1) ?? nativeVersion;
  const handleManualUpdateCheck = useCallback(() => setShowUpdateModal(true), []);

  const selectedLangLabel = LANGUAGES.find((l) => l.code === audioLanguage)?.label ?? "Auto";
  const selectedUiLang = UI_LANGUAGE_OPTIONS.find((l) => l.code === uiLanguage);
  const selectedUiLangLabel = selectedUiLang ? t(selectedUiLang.labelKey) : t("settings.languageEnglish");

  const handleSetPin = () => {
    setPinModalMode(parentalPin ? "confirm" : "set");
    setShowPinModal(true);
  };

  const handlePinConfirm = (entered: string) => {
    setShowPinModal(false);
    if (pinModalMode === "set") {
      setParentalPin(entered);
      SafeHaptics.success();
      Alert.alert("PIN ingesteld", "Ouderlijk toezicht is geactiveerd.");
    } else {
      if (entered === parentalPin) {
        setParentalPin(null);
        SafeHaptics.success();
        Alert.alert("PIN verwijderd", "Ouderlijk toezicht is uitgeschakeld.");
      } else {
        SafeHaptics.error();
        Alert.alert("Verkeerde PIN", "De ingevoerde PIN is onjuist.");
      }
    }
  };

  const handleClearHistory = () => {
    SafeAlert.confirm(
      "Kijkgeschiedenis wissen",
      "Weet je zeker dat je je kijkgeschiedenis wilt wissen? Dit kan niet ongedaan worden gemaakt.",
      "Wissen",
      async () => { await clearHistory(); SafeHaptics.success(); },
    );
  };

  const handleResetApp = () => {
    SafeAlert.confirm(
      "App data resetten",
      "Dit verwijdert favorieten, kijkgeschiedenis en cache, en start de accountinstellingen opnieuw. Weet je het zeker?",
      "Resetten",
      async () => {
        try {
          await resetAll();
          queryClient.clear();
          SafeHaptics.success();
          closeNexoraMenu();
          router.replace("/onboarding/quick-start");
        } catch (e: any) {
          Alert.alert("Fout", e?.message ?? "Kon app data niet resetten");
        }
      },
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
    <View style={styles.screen}>
      <View style={styles.backdropOrbs} pointerEvents="none">
        <LinearGradient
          colors={["rgba(192,38,211,0.18)", "rgba(5,6,10,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.orbLeft}
        />
        <LinearGradient
          colors={["rgba(34,211,238,0.10)", "rgba(5,6,10,0)"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.orbRight}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 96 },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
              return;
            }
            router.replace("/(tabs)/home");
          }}
          accessibilityRole="button"
          accessibilityLabel="Ga terug"
        >
          <Ionicons name="chevron-back" size={16} color={COLORS.text} />
          <Text style={styles.backButtonText}>Terug</Text>
        </TouchableOpacity>

        <View style={styles.homeHeader}>
          <View style={styles.homeHeaderCopy}>
            <Text style={styles.homeHeaderTitle}>Welkom terug</Text>
          </View>
          <TouchableOpacity style={styles.avatarCard} onPress={handlePickAvatar} activeOpacity={0.85}>
            <LinearGradient
              colors={["rgba(192,38,211,0.20)", "rgba(34,211,238,0.10)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.avatarInner}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                : <Ionicons name="person" size={24} color={COLORS.text} />}
            </View>
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={9} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => router.push("/profile")}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel={t("settings.mainProfile")}
          >
            <Ionicons name="person-circle-outline" size={18} color={COLORS.text} />
            <Text style={styles.quickActionTitle}>{t("settings.mainProfile")}</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => router.push("/premium")}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel={isPremium ? "Premium" : "Upgrade naar Premium"}
          >
            <MaterialCommunityIcons name="crown" size={16} color={isPremium ? COLORS.gold : COLORS.textMuted} />
            <Text style={styles.quickActionTitle}>{isPremium ? "Premium" : "Upgrade"}</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.statusStrip}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t("settings.favorites")}</Text>
            <Text style={styles.statusValue}>{favorites.length}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>History</Text>
            <Text style={styles.statusValue}>{watchHistory.length}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItemWide}>
            <Text style={styles.statusLabel}>Server</Text>
            <Text style={styles.statusValueSmall}>{preferredServerLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionIntroEyebrow}>SETTINGS</Text>

        {/* ── Afspeelbeheer ── */}
        <SettingsSection title={t("settings.playback")}>
          <SettingsRow icon="server-outline" label="Streaming server"
            value={preferredServerLabel} onPress={() => setShowServerSheet(true)} />
          <RowDivider />
          <SettingsRow icon="film-outline" label={t("settings.quality")}
            value={selectedQuality} onPress={() => setShowQualitySheet(true)} />
          <RowDivider />
          <SettingsRow icon="language-outline" label={t("settings.audioLanguage")}
            value={selectedLangLabel} onPress={() => setShowLangSheet(true)} />
          <RowDivider />
          <SettingsRow icon="text-outline" label={t("settings.subtitles")}
            right={
              <Switch value={subtitlesEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setSubtitlesEnabled(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={subtitlesEnabled ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border} />
            } />
          <RowDivider />
          <SettingsRow icon="play-skip-forward-outline" label={t("settings.autoplayNext")}
            right={
              <Switch value={autoplayEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setAutoplayEnabled(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={autoplayEnabled ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border} />
            } />
        </SettingsSection>

        {/* ── Personalisatie ── */}
        <SettingsSection title={t("settings.personalization")}>
          <SettingsRow icon="globe-outline" label={t("settings.language")}
            value={selectedUiLangLabel} onPress={() => setShowUiLangSheet(true)} />
        </SettingsSection>

        {/* ── Downloads ── */}
        <SettingsSection title={t("settings.downloadsSection")}>
          <SettingsRow icon="wifi-outline" label={t("settings.wifiOnly")}
            right={
              <Switch value={downloadOverWifi}
                onValueChange={(v) => { SafeHaptics.impactLight(); setDownloadOverWifi(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={downloadOverWifi ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border} />
            } />
          <RowDivider />
          <SettingsRow icon="cloud-download-outline" label={t("settings.offlineDownloads")}
            sub={t("settings.notAvailable")}
            onPress={() => Alert.alert(t("settings.downloadsSection"), t("settings.offlineNotAvailable"))} />
        </SettingsSection>

        {/* ── Meldingen ── */}
        <SettingsSection title={t("settings.notifications")}>
          <SettingsRow icon="notifications-outline" label={t("settings.pushNotifications")}
            right={
              <Switch value={notificationsEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setNotificationsEnabled(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={notificationsEnabled ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border} />
            } />
          <RowDivider />
          <SettingsRow icon="calendar-outline" label={t("settings.newReleases")}
            sub={t("settings.comingSoon")}
            onPress={() => Alert.alert(t("settings.newReleases"), t("settings.notifHint"))} />
        </SettingsSection>

        {/* ── Beveiliging ── */}
        <SettingsSection title={t("settings.security")}>
          <SettingsRow icon="lock-closed-outline" label={t("settings.parentalControl")}
            value={parentalPin ? t("settings.pinActive") : t("settings.pinOff")}
            onPress={handleSetPin} />
          <RowDivider />
          <SettingsRow icon="time-outline" label={t("settings.clearHistory")}
            value={watchHistory.length > 0 ? `${watchHistory.length} ${t("settings.items")}` : t("common.empty")}
            onPress={handleClearHistory} />
        </SettingsSection>

        {/* ── Over Cinelog ── */}
        <SettingsSection title={t("settings.about")}>
          <SettingsRow icon="phone-portrait-outline" label={t("settings.appVersion")} value={appVersion} />
          <RowDivider />
          <SettingsRow icon="cloud-download-outline" label={t("settings.checkUpdates")} onPress={handleManualUpdateCheck} />
          <RowDivider />
          <SettingsRow icon="star-outline" label={t("settings.rateApp")}
            onPress={() => Alert.alert(t("settings.rateTitle"), t("settings.rateMessage"))} />
          <RowDivider />
          <SettingsRow icon="help-circle-outline" label={t("settings.support")}
            onPress={() => Alert.alert(t("settings.support"), `${t("settings.supportEmail")}\n\n${t("settings.supportResponse")}`)} />
          <RowDivider />
          <SettingsRow icon="shield-checkmark-outline" label={t("settings.privacyPolicy")}
            onPress={() => Alert.alert(t("settings.privacyPolicy"), t("settings.privacyMessage"))} />
        </SettingsSection>

        {/* ── Gevaarzone ── */}
        <SettingsSection title="Gevaarzone">
          <SettingsRow icon="trash-outline" label={t("settings.resetApp")} danger onPress={handleResetApp} />
        </SettingsSection>
      </ScrollView>

      {/* Modals */}
      <PinModal visible={showPinModal} mode={pinModalMode} onClose={() => setShowPinModal(false)} onConfirm={handlePinConfirm} />
      <AudioLanguageSheet visible={showLangSheet} selected={audioLanguage} onClose={() => setShowLangSheet(false)} onSelect={setAudioLanguage} />
      <UiLanguageSheet visible={showUiLangSheet} selected={uiLanguage} onClose={() => setShowUiLangSheet(false)} onSelect={setUiLanguage} />
      <QualitySheet visible={showQualitySheet} selected={selectedQuality} onClose={() => setShowQualitySheet(false)} onSelect={setSelectedQuality} />
      <ServerSheet visible={showServerSheet} selected={preferredServerLabel} onClose={() => setShowServerSheet(false)} onSelect={setPreferredServerLabel} />
      <UpdateModal visible={showUpdateModal} currentVersion={appVersion} onClose={() => setShowUpdateModal(false)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN modal styles
// ─────────────────────────────────────────────────────────────────────────────
const pin$ = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", alignItems: "center", justifyContent: "center" },
  modal: {
    backgroundColor: COLORS.card, borderRadius: 24, padding: 24,
    width: 300, alignItems: "center", gap: 14,
    borderWidth: 1, borderColor: COLORS.glassBorder, overflow: "hidden",
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: "rgba(192,38,211,0.10)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(192,38,211,0.20)",
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  label: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  dots: { flexDirection: "row", gap: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: COLORS.accent },
  dotFilled: { backgroundColor: COLORS.accent },
  numpad: { flexDirection: "row", flexWrap: "wrap", width: 204, gap: 6 },
  key: {
    width: 62, height: 52, borderRadius: 12,
    backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder,
    alignItems: "center", justifyContent: "center",
  },
  keyText: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  cancelBtn: { marginTop: 2, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder },
  cancelText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
});

// ─────────────────────────────────────────────────────────────────────────────
// Bottom sheet styles
// ─────────────────────────────────────────────────────────────────────────────
const sheet = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "flex-end" },
  container: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: COLORS.glassBorder, paddingBottom: 36, overflow: "hidden",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.glassBorder, alignSelf: "center", marginTop: 10, marginBottom: 2,
  },
  title: {
    fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text,
    textAlign: "center", paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder,
  },
  option: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  optionActive: { backgroundColor: "rgba(192,38,211,0.07)" },
  optionText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textSecondary },
  optionTextActive: { color: COLORS.text, fontFamily: "Inter_600SemiBold" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Scherm styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  backdropOrbs: {
    ...StyleSheet.absoluteFillObject,
  },
  orbLeft: {
    position: "absolute",
    top: -120,
    left: -110,
    width: 310,
    height: 310,
    borderRadius: 310,
    opacity: 0.45,
  },
  orbRight: {
    position: "absolute",
    top: 220,
    right: -120,
    width: 240,
    height: 240,
    borderRadius: 240,
    opacity: 0.32,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.cardElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  backButtonText: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2,
  },
  homeHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  homeHeaderTitle: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickActionCard: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: "rgba(14,12,26,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickActionTitle: {
    flex: 1,
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: -0.1,
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(14,12,26,0.9)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusItem: {
    flex: 1,
    gap: 3,
  },
  statusItemWide: {
    flex: 1.3,
    gap: 3,
  },
  statusLabel: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statusValue: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 18,
    letterSpacing: -0.4,
  },
  statusValueSmall: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    lineHeight: 16,
  },
  statusDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.09)",
    marginHorizontal: 10,
  },
  heroShell: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 18,
    gap: 16,
    backgroundColor: "rgba(8,10,16,0.92)",
  },
  heroTopRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  brandStack: {
    flex: 1,
    gap: 10,
  },
  brandChip: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(192,38,211,0.10)",
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.22)",
  },
  brandChipText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 34,
    letterSpacing: -1.3,
    lineHeight: 36,
  },
  heroSubtitle: {
    color: COLORS.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280,
  },
  avatarCard: {
    width: 86,
    height: 86,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 22,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: COLORS.accent,
    borderWidth: 1.5,
    borderColor: "#05060a",
    alignItems: "center",
    justifyContent: "center",
  },
  heroProfileRow: {
    gap: 10,
  },
  heroProfileCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  heroProfileCopy: {
    gap: 8,
  },
  heroProfileLabel: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  premiumBadgeActive: {
    backgroundColor: "rgba(255,215,0,0.08)",
    borderColor: "rgba(255,215,0,0.22)",
  },
  premiumBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  premiumBadgeTextActive: {
    color: COLORS.gold,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    justifyContent: "space-between",
  },
  statCardAccent: {
    backgroundColor: "rgba(192,38,211,0.10)",
    borderColor: "rgba(192,38,211,0.20)",
  },
  statValue: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
    letterSpacing: -0.6,
  },
  statValueSmall: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    lineHeight: 15,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionIntroEyebrow: {
    color: COLORS.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    paddingTop: 8,
    paddingHorizontal: 2,
  },

  // Settings secties
  section: { gap: 8 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    letterSpacing: -0.3,
    fontFamily: "Inter_700Bold",
    marginBottom: 0,
  },
  sectionCard: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
    alignItems: "center", justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.24)" },
  rowBody: { flex: 1 },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  rowLabelDanger: { color: COLORS.live },
  rowSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginTop: 1,
  },
  rowValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textSecondary,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: 120,
  },
  rowDivider: { height: 1, backgroundColor: COLORS.border, marginLeft: 58 },
  settingsBadge: {
    backgroundColor: "rgba(192,38,211,0.16)", borderColor: "rgba(192,38,211,0.28)",
    borderWidth: 1, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2,
  },
  settingsBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.accent },
});
