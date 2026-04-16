// All settings UI is in app/(tabs)/more.tsx — this file keeps the /settings
// route alive so old deep-links still resolve.
import { Redirect } from "expo-router";

export default function SettingsRedirect() {
  return <Redirect href="/(tabs)/more" />;
}
*/
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
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
import { t as tFn } from "@/lib/i18n";
import { getActiveProviderLabels } from "@/lib/playback-engine";
import { apiRequest } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";
import { SafeHaptics } from "@/lib/safeHaptics";
import { useTranslation } from "@/lib/useTranslation";
import { compareVersions } from "@/services/update-service";
import { useOnboardingStore } from "@/store/onboarding-store";
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

const SERVER_DOMAIN_MAP: Record<string, string> = {
  "Server 1": "https://vidlink.pro",
  "Server 2": "https://vidfast.pro",
  "Server 3": "https://player.videasy.net",
  "Server 4": "https://player.vidsrc.nl",
  "Server 5": "https://warezcdn.com",
  "Server 6": "https://flicky.host",
  "Server 7": "https://moviesapi.club",
  "Server 8": "https://flickystream.ru",
  "Server 9": "https://autoembed.cc",
  "Server 10": "https://embed.su",
  "Server 11": "https://111movies.net",
  "Server 12": "https://vidsrc.stream",
  "Server 13": "https://www.2embed.org",
};

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
// Sheet bottom-modal wrapper
// ─────────────────────────────────────────────────────────────────────────────
function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheet.overlay} onPress={onClose}>
        <Pressable style={sheet.container} onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={["rgba(192,38,211,0.08)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={sheet.handle} />
          <Text style={sheet.title}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetOption({
  label,
  active,
  onPress,
  left,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  left?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[sheet.option, active && sheet.optionActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {left ?? null}
      <Text style={[sheet.optionText, active && sheet.optionTextActive]}>{label}</Text>
      {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality sheet
// ─────────────────────────────────────────────────────────────────────────────
function QualitySheet({
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
    <BottomSheet visible={visible} onClose={onClose} title={tFn("settings.quality")}>
      {QUALITY_OPTIONS.map((q) => (
        <SheetOption
          key={q.code}
          label={tFn(q.labelKey)}
          active={selected === q.code}
          onPress={() => { SafeHaptics.impactLight(); onSelect(q.code); onClose(); }}
        />
      ))}
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio language sheet
// ─────────────────────────────────────────────────────────────────────────────
function AudioLanguageSheet({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (lang: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tFn("settings.audioLanguage")}>
      <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
        {LANGUAGES.map((lang) => (
          <SheetOption
            key={lang.code}
            label={lang.label}
            active={selected === lang.code}
            onPress={() => { SafeHaptics.impactLight(); onSelect(lang.code); onClose(); }}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI language sheet
// ─────────────────────────────────────────────────────────────────────────────
function UiLanguageSheet({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (lang: "en" | "nl" | "fr" | "de" | "es" | "pt") => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tFn("settings.language")}>
      {UI_LANGUAGE_OPTIONS.map((lang) => (
        <SheetOption
          key={lang.code}
          label={tFn(lang.labelKey)}
          active={selected === lang.code}
          onPress={() => { SafeHaptics.impactLight(); onSelect(lang.code); onClose(); }}
        />
      ))}
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server health dot
// ─────────────────────────────────────────────────────────────────────────────
function HealthDot({ status }: { status: ServerHealth }) {
  if (status === "checking") {
    return <ActivityIndicator size={10} color={COLORS.textMuted} style={{ marginRight: 8 }} />;
  }
  const color = status === "online" ? "#22c55e" : status === "slow" ? "#f59e0b" : "#ef4444";
  return (
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 8 }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server picker sheet
// ─────────────────────────────────────────────────────────────────────────────
function ServerSheet({
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
            if (id !== undefined) {
              next[lbl] = healthById[id] === false ? "offline" : "online";
            } else {
              next[lbl] = "online";
            }
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
          <SheetOption
            key={server}
            label={server}
            active={selected === server}
            left={<HealthDot status={health[server] ?? "checking"} />}
            onPress={() => { SafeHaptics.impactLight(); onSelect(server); onClose(); }}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN modal
// ─────────────────────────────────────────────────────────────────────────────
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
    if (!visible) setPin("");
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pin$.overlay}>
        <View style={pin$.modal}>
          <LinearGradient
            colors={["rgba(192,38,211,0.12)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={pin$.iconWrap}>
            <Ionicons name="lock-closed" size={26} color={COLORS.accent} />
          </View>
          <Text style={pin$.title}>
            {mode === "set" ? "PIN instellen" : "PIN bevestigen"}
          </Text>
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

// ─────────────────────────────────────────────────────────────────────────────
// Reusable row + section building blocks
// ─────────────────────────────────────────────────────────────────────────────
function SettingsRow({
  icon,
  label,
  sub,
  value,
  onPress,
  right,
  danger = false,
  badge,
}: {
  icon: string;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={onPress || right ? 0.72 : 1}
      disabled={!onPress && !right}
      onPress={onPress}
    >
      <View style={[s.rowIcon, danger && s.rowIconDanger]}>
        <Ionicons name={icon as any} size={17} color={danger ? COLORS.live : COLORS.accent} />
      </View>
      <View style={s.rowBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[s.rowLabel, danger && s.rowLabelDanger]} numberOfLines={1}>{label}</Text>
          {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
        </View>
        {sub ? <Text style={s.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {value ? <Text style={s.rowValue} numberOfLines={1}>{value}</Text> : null}
      {right ?? null}
      {onPress && !right ? <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} /> : null}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const closeNexoraMenu = useUiStore((state) => state.closeNexoraMenu);
  const { openUpdate } = useLocalSearchParams<{ openUpdate?: string }>();
  const {
    selectedQuality, setSelectedQuality,
    subtitlesEnabled, setSubtitlesEnabled,
    audioLanguage, setAudioLanguage,
    preferredServerLabel, setPreferredServerLabel,
    autoplayEnabled, setAutoplayEnabled,
    downloadOverWifi, setDownloadOverWifi,
    notificationsEnabled, setNotificationsEnabled,
    parentalPin, setParentalPin,
    favorites, watchHistory, clearHistory,
    isPremium, resetAll,
    avatarUri, setAvatarUri,
    uiLanguage, setUiLanguage,
  } = useNexora();
  const { t } = useTranslation();

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"set" | "confirm">("set");
  const [showLangSheet, setShowLangSheet] = useState(false);
  const [showUiLangSheet, setShowUiLangSheet] = useState(false);
  const [showQualitySheet, setShowQualitySheet] = useState(false);
  const [showServerSheet, setShowServerSheet] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(openUpdate === "1");
  const {} = useOnboardingStore();

  useEffect(() => {
    closeNexoraMenu();
  }, [closeNexoraMenu]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const selectedLangLabel = LANGUAGES.find((l) => l.code === audioLanguage)?.label ?? "Auto";
  const selectedUiLang = UI_LANGUAGE_OPTIONS.find((l) => l.code === uiLanguage);
  const selectedUiLangLabel = selectedUiLang ? t(selectedUiLang.labelKey) : t("settings.languageEnglish");

  const nativeVersion = String(Application.nativeApplicationVersion || "0.0.0");
  const configVersion = String(Constants.expoConfig?.version || "0.0.0");
  const runtimeVersion = String(Updates.runtimeVersion || "0.0.0");
  const appVersion = [nativeVersion, configVersion, runtimeVersion].sort(compareVersions).at(-1) ?? nativeVersion;
  const handleManualUpdateCheck = useCallback(() => setShowUpdateModal(true), []);

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
    Alert.alert(
      "Kijkgeschiedenis wissen",
      "Weet je zeker dat je je kijkgeschiedenis wilt wissen? Dit kan niet ongedaan worden gemaakt.",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Wissen",
          style: "destructive",
          onPress: async () => {
            await clearHistory();
            SafeHaptics.success();
          },
        },
      ],
    );
  };

  const handleResetApp = () => {
    Alert.alert(
      "App data resetten",
      "Dit verwijdert favorieten, kijkgeschiedenis en cache. Weet je het zeker?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Resetten",
          style: "destructive",
          onPress: async () => {
            try {
              await resetAll();
              queryClient.clear();
              SafeHaptics.success();
            } catch (e: any) {
              Alert.alert("Fout", e?.message ?? "Kon app data niet resetten");
            }
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
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={s.headerBack}
          onPress={() => {
            try {
              if (
                typeof (router as any).canGoBack === "function" &&
                (router as any).canGoBack()
              ) {
                router.back();
                return;
              }
            } catch {}
            router.replace("/(tabs)/more" as any);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Instellingen</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad, paddingTop: 14 }}
      >
        {/* ── Profile card ── */}
        <TouchableOpacity
          style={s.profileCard}
          onPress={() => router.push("/profile")}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={["rgba(192,38,211,0.10)", COLORS.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity style={s.avatarWrap} onPress={handlePickAvatar} activeOpacity={0.8}>
            <View style={s.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={s.avatarImg} />
              ) : (
                <Ionicons name="person" size={22} color={COLORS.accent} />
              )}
            </View>
            <View style={s.cameraChip}>
              <Ionicons name="camera" size={9} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{t("settings.mainProfile")}</Text>
            <TouchableOpacity
              style={[s.premiumBadge, isPremium && s.premiumBadgeActive]}
              onPress={() => router.push("/premium")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="crown"
                size={10}
                color={isPremium ? COLORS.gold : COLORS.textMuted}
              />
              <Text style={[s.premiumBadgeText, isPremium && s.premiumBadgeTextActive]}>
                {isPremium ? "Nexora+" : "Upgrade naar Nexora+"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: "flex-end", gap: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.text }}>{favorites.length}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted }}>{t("settings.favorites")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* ── Afspeelbeheer ── */}
        <Section title={t("settings.playback")}>
          <SettingsRow
            icon="server-outline"
            label="Streaming server"
            value={preferredServerLabel}
            onPress={() => setShowServerSheet(true)}
          />
          <Divider />
          <SettingsRow
            icon="film-outline"
            label={t("settings.quality")}
            value={selectedQuality}
            onPress={() => setShowQualitySheet(true)}
          />
          <Divider />
          <SettingsRow
            icon="language-outline"
            label={t("settings.audioLanguage")}
            value={selectedLangLabel}
            onPress={() => setShowLangSheet(true)}
          />
          <Divider />
          <SettingsRow
            icon="text-outline"
            label={t("settings.subtitles")}
            right={
              <Switch
                value={subtitlesEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setSubtitlesEnabled(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={subtitlesEnabled ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
          <Divider />
          <SettingsRow
            icon="play-skip-forward-outline"
            label={t("settings.autoplayNext")}
            right={
              <Switch
                value={autoplayEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setAutoplayEnabled(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={autoplayEnabled ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
        </Section>

        {/* ── Personalisatie ── */}
        <Section title={t("settings.personalization")}>
          <SettingsRow
            icon="globe-outline"
            label={t("settings.language")}
            value={selectedUiLangLabel}
            onPress={() => setShowUiLangSheet(true)}
          />
        </Section>

        {/* ── Downloads ── */}
        <Section title={t("settings.downloadsSection")}>
          <SettingsRow
            icon="wifi-outline"
            label={t("settings.wifiOnly")}
            right={
              <Switch
                value={downloadOverWifi}
                onValueChange={(v) => { SafeHaptics.impactLight(); setDownloadOverWifi(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={downloadOverWifi ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
          <Divider />
          <SettingsRow
            icon="cloud-download-outline"
            label={t("settings.offlineDownloads")}
            sub={t("settings.notAvailable")}
            onPress={() => Alert.alert(t("settings.downloadsSection"), t("settings.offlineNotAvailable"))}
          />
        </Section>

        {/* ── Meldingen ── */}
        <Section title={t("settings.notifications")}>
          <SettingsRow
            icon="notifications-outline"
            label={t("settings.pushNotifications")}
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setNotificationsEnabled(v); }}
                trackColor={{ false: COLORS.border, true: "rgba(192,38,211,0.45)" }}
                thumbColor={notificationsEnabled ? COLORS.accent : COLORS.textMuted}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
          <Divider />
          <SettingsRow
            icon="calendar-outline"
            label={t("settings.newReleases")}
            sub={t("settings.comingSoon")}
            onPress={() => Alert.alert(t("settings.newReleases"), t("settings.notifHint"))}
          />
        </Section>

        {/* ── Beveiliging ── */}
        <Section title={t("settings.security")}>
          <SettingsRow
            icon="lock-closed-outline"
            label={t("settings.parentalControl")}
            value={parentalPin ? t("settings.pinActive") : t("settings.pinOff")}
            onPress={handleSetPin}
          />
          <Divider />
          <SettingsRow
            icon="time-outline"
            label={t("settings.clearHistory")}
            value={watchHistory.length > 0 ? `${watchHistory.length} ${t("settings.items")}` : t("common.empty")}
            onPress={handleClearHistory}
          />
        </Section>

        {/* ── Over Nexora ── */}
        <Section title={t("settings.about")}>
          <SettingsRow
            icon="phone-portrait-outline"
            label={t("settings.appVersion")}
            value={appVersion}
          />
          <Divider />
          <SettingsRow
            icon="cloud-download-outline"
            label={t("settings.checkUpdates")}
            onPress={handleManualUpdateCheck}
          />
          <Divider />
          <SettingsRow
            icon="star-outline"
            label={t("settings.rateApp")}
            onPress={() => Alert.alert(t("settings.rateTitle"), t("settings.rateMessage"))}
          />
          <Divider />
          <SettingsRow
            icon="help-circle-outline"
            label={t("settings.support")}
            onPress={() => Alert.alert(t("settings.support"), `${t("settings.supportEmail")}\n\n${t("settings.supportResponse")}`)}
          />
          <Divider />
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t("settings.privacyPolicy")}
            onPress={() => Alert.alert(t("settings.privacyPolicy"), t("settings.privacyMessage"))}
          />
        </Section>

        {/* ── Gevaarzone ── */}
        <Section title="Gevaarzone">
          <SettingsRow
            icon="trash-outline"
            label={t("settings.resetApp")}
            danger
            onPress={handleResetApp}
          />
        </Section>
      </ScrollView>

      {/* ── Modals & Sheets ── */}
      <PinModal
        visible={showPinModal}
        mode={pinModalMode}
        onClose={() => setShowPinModal(false)}
        onConfirm={handlePinConfirm}
      />
      <AudioLanguageSheet
        visible={showLangSheet}
        selected={audioLanguage}
        onClose={() => setShowLangSheet(false)}
        onSelect={setAudioLanguage}
      />
      <UiLanguageSheet
        visible={showUiLangSheet}
        selected={uiLanguage}
        onClose={() => setShowUiLangSheet(false)}
        onSelect={setUiLanguage}
      />
      <QualitySheet
        visible={showQualitySheet}
        selected={selectedQuality}
        onClose={() => setShowQualitySheet(false)}
        onSelect={setSelectedQuality}
      />
      <ServerSheet
        visible={showServerSheet}
        selected={preferredServerLabel}
        onClose={() => setShowServerSheet(false)}
        onSelect={setPreferredServerLabel}
      />
      <UpdateModal
        visible={showUpdateModal}
        currentVersion={appVersion}
        onClose={() => setShowUpdateModal(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const pin$ = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    width: 300,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(192,38,211,0.10)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.20)",
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  label: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  dots: { flexDirection: "row", gap: 14 },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.accent,
  },
  dotFilled: { backgroundColor: COLORS.accent },
  numpad: { flexDirection: "row", flexWrap: "wrap", width: 204, gap: 6 },
  key: {
    width: 62, height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  cancelBtn: {
    marginTop: 2,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  cancelText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
});

const sheet = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingBottom: 36,
    overflow: "hidden",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.glassBorder,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  optionActive: { backgroundColor: "rgba(192,38,211,0.07)" },
  optionText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  optionTextActive: { color: COLORS.text, fontFamily: "Inter_600SemiBold" },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  headerBack: {
    width: 36, height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.text,
  },

  // Profile card
  profileCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 44, height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.30)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44, borderRadius: 12 },
  cameraChip: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: COLORS.glass,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeActive: {
    backgroundColor: "rgba(255,215,0,0.06)",
    borderColor: "rgba(255,215,0,0.25)",
  },
  premiumBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textMuted },
  premiumBadgeTextActive: { color: COLORS.gold },

  // Section — identical to more.tsx menuSection
  section: { marginBottom: 14 },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    letterSpacing: 1.8,
    fontFamily: "Inter_700Bold",
    marginLeft: 18,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",
    marginHorizontal: 16,
  },

  // Row — identical to more.tsx menuRow
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowIcon: {
    width: 36, height: 36,
    borderRadius: 9,
    backgroundColor: "rgba(192,38,211,0.10)",
    borderWidth: 1,
    borderColor: "rgba(192,38,211,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDanger: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.20)",
  },
  rowBody: { flex: 1 },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  rowLabelDanger: { color: COLORS.live },
  rowSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
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
  divider: { height: 1, backgroundColor: COLORS.glassBorder, marginLeft: 62 },

  // Badge
  badge: {
    backgroundColor: "rgba(192,38,211,0.16)",
    borderColor: "rgba(192,38,211,0.28)",
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.accent },
});

