/**
 * NEXORA Settings — Menu + Instellingen in één pagina
 * Feature cards bovenaan, premium banner, persoonlijk menu, daarna alle instellingen inline.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { UpdateModal } from "@/components/update";
import { NexoraHeader } from "@/components/NexoraHeader";
import { APP_MODULES_BY_ID } from "@/constants/module-registry";
import { COLORS } from "@/constants/colors";
import { useNexora } from "@/context/NexoraContext";
import { t as tFn } from "@/lib/i18n";
import { getActiveProviderLabels } from "@/lib/playback-engine";
import { apiRequest, queryClient } from "@/lib/query-client";
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

type MenuItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature card (grote kaart bovenaan)
// ─────────────────────────────────────────────────────────────────────────────
function FeatureCard({
  icon, title, subtitle, route, accent = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.featureCard} onPress={() => router.push(route as any)} activeOpacity={0.88}>
      <LinearGradient
        colors={accent ? ["rgba(229,9,20,0.20)", COLORS.card] : ["rgba(255,255,255,0.05)", COLORS.card]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.featureGradient}
      >
        <View style={[styles.featureIconWrap, accent && styles.featureIconAccent]}>
          <Ionicons name={icon} size={22} color={accent ? COLORS.accent : COLORS.textSecondary} />
        </View>
        <Text style={styles.featureTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.featureSubtitle} numberOfLines={2}>{subtitle}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu rij
// ─────────────────────────────────────────────────────────────────────────────
function MenuRow({ item }: { item: MenuItem }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={() => router.push(item.route as any)} activeOpacity={0.82}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={item.icon} size={17} color={COLORS.accent} />
      </View>
      <View style={styles.menuRowText}>
        <Text style={styles.menuRowTitle}>{item.title}</Text>
        <Text style={styles.menuRowSub} numberOfLines={1}>{item.subtitle}</Text>
      </View>
      {item.badge ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function MenuSection({ title, items }: { title: string; items: MenuItem[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.menuSection}>
      <Text style={styles.menuSectionTitle}>{title}</Text>
      <View style={styles.menuSectionCard}>
        {items.map((item, i) => (
          <React.Fragment key={item.id}>
            <MenuRow item={item} />
            {i < items.length - 1 ? <View style={styles.menuDivider} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

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
  const {} = useOnboardingStore();

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
  const runtimeVersion = String(Updates.runtimeVersion || "0.0.0");
  const appVersion = [nativeVersion, configVersion, runtimeVersion].sort(compareVersions).at(-1) ?? nativeVersion;
  const handleManualUpdateCheck = useCallback(() => setShowUpdateModal(true), []);

  const selectedLangLabel = LANGUAGES.find((l) => l.code === audioLanguage)?.label ?? "Auto";
  const selectedUiLang = UI_LANGUAGE_OPTIONS.find((l) => l.code === uiLanguage);
  const selectedUiLangLabel = selectedUiLang ? t(selectedUiLang.labelKey) : t("settings.languageEnglish");

  const userItems = useMemo<MenuItem[]>(() => [
    {
      id: APP_MODULES_BY_ID.myList.id,
      title: APP_MODULES_BY_ID.myList.label,
      subtitle: APP_MODULES_BY_ID.myList.subtitle,
      icon: APP_MODULES_BY_ID.myList.icon as keyof typeof Ionicons.glyphMap,
      route: APP_MODULES_BY_ID.myList.route,
    },
    {
      id: APP_MODULES_BY_ID.history.id,
      title: APP_MODULES_BY_ID.history.label,
      subtitle: APP_MODULES_BY_ID.history.subtitle,
      icon: APP_MODULES_BY_ID.history.icon as keyof typeof Ionicons.glyphMap,
      route: APP_MODULES_BY_ID.history.route,
    },
    {
      id: APP_MODULES_BY_ID.notifications.id,
      title: APP_MODULES_BY_ID.notifications.label,
      subtitle: APP_MODULES_BY_ID.notifications.subtitle,
      icon: APP_MODULES_BY_ID.notifications.icon as keyof typeof Ionicons.glyphMap,
      route: APP_MODULES_BY_ID.notifications.route,
    },
  ], []);

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
        { text: "Wissen", style: "destructive", onPress: async () => { await clearHistory(); SafeHaptics.success(); } },
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
          text: "Resetten", style: "destructive",
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
    <View style={styles.screen}>
      <View style={styles.glowBg} pointerEvents="none" />

      <NexoraHeader
        variant="module"
        title={t("menu.title")}
        titleColor={COLORS.accent}
        showSearch={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom + 90) }]}
      >
        {/* ── Profielkaart ── */}
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push("/profile")} activeOpacity={0.88}>
          <LinearGradient
            colors={["rgba(192,38,211,0.10)", COLORS.card]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} activeOpacity={0.8}>
            <View style={styles.avatar}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                : <Ionicons name="person" size={22} color={COLORS.accent} />}
            </View>
            <View style={styles.cameraChip}>
              <Ionicons name="camera" size={9} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{t("settings.mainProfile")}</Text>
            <TouchableOpacity
              style={[styles.premiumBadge, isPremium && styles.premiumBadgeActive]}
              onPress={() => router.push("/premium")}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="crown" size={10} color={isPremium ? COLORS.gold : COLORS.textMuted} />
              <Text style={[styles.premiumBadgeText, isPremium && styles.premiumBadgeTextActive]}>
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

        {/* ── Feature kaarten ── */}
        <View style={styles.featureGrid}>
          <FeatureCard
            icon={APP_MODULES_BY_ID.movies.icon as keyof typeof Ionicons.glyphMap}
            title={APP_MODULES_BY_ID.movies.label}
            subtitle={APP_MODULES_BY_ID.movies.subtitle}
            route={APP_MODULES_BY_ID.movies.route}
            accent
          />
          <FeatureCard
            icon={APP_MODULES_BY_ID.liveTV.icon as keyof typeof Ionicons.glyphMap}
            title={APP_MODULES_BY_ID.liveTV.label}
            subtitle={APP_MODULES_BY_ID.liveTV.subtitle}
            route={APP_MODULES_BY_ID.liveTV.route}
          />
        </View>

        {/* ── Nexora+ banner ── */}
        {!isPremium && (
          <TouchableOpacity style={styles.premiumBanner} onPress={() => router.push("/premium" as any)} activeOpacity={0.88}>
            <LinearGradient
              colors={["rgba(192,38,211,0.22)", "rgba(124,58,237,0.14)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.premiumBannerGradient}
            >
              <View style={styles.premiumBannerTop}>
                <View style={styles.premiumBannerIcon}>
                  <MaterialCommunityIcons name="crown" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.premiumBannerTitle}>Nexora+</Text>
                  <Text style={styles.premiumBannerSub}>Reclamevrij · 4K · Offline</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
              </View>
              <View style={styles.premiumPriceRow}>
                <View style={styles.premiumPriceChip}>
                  <Text style={styles.premiumPriceAmount}>€2,99</Text>
                  <Text style={styles.premiumPricePeriod}>/week</Text>
                </View>
                <View style={[styles.premiumPriceChip, styles.premiumPriceChipPopular]}>
                  <Text style={[styles.premiumPriceAmount, { color: COLORS.accent }]}>€7,99</Text>
                  <Text style={[styles.premiumPricePeriod, { color: COLORS.accent }]}>/maand</Text>
                  <View style={styles.popularDot} />
                </View>
                <View style={styles.premiumPriceChip}>
                  <Text style={styles.premiumPriceAmount}>€59,99</Text>
                  <Text style={styles.premiumPricePeriod}>/jaar</Text>
                </View>
              </View>
              <Text style={styles.premiumTrialNote}>7 dagen gratis proberen</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {isPremium && (
          <TouchableOpacity style={styles.premiumActiveBanner} onPress={() => router.push("/premium" as any)} activeOpacity={0.88}>
            <View style={styles.premiumActiveBannerIcon}>
              <MaterialCommunityIcons name="crown" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumActiveBannerTitle}>Nexora+ Actief</Text>
              <Text style={styles.premiumActiveBannerSub}>Je hebt toegang tot alle premium content</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        )}

        {/* ── Persoonlijk navigatie ── */}
        <MenuSection title={t("menu.personal")} items={userItems} />

        {/* ── Juridisch ── */}
        <MenuSection
          title={t("menu.system")}
          items={[{
            id: "legal",
            title: t("menu.legalDmca"),
            subtitle: t("menu.legalSub"),
            icon: "shield-checkmark-outline" as keyof typeof Ionicons.glyphMap,
            route: "/legal",
          }]}
        />

        {/* ══════════════════════════════════════════════════════════
            INSTELLINGEN — inline hieronder
        ══════════════════════════════════════════════════════════ */}

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

        {/* ── Over Nexora ── */}
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
  glowBg: {
    position: "absolute", top: -60, left: -80, width: 300, height: 300,
    borderRadius: 300, backgroundColor: "rgba(229,9,20,0.08)",
  },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },

  // Feature grid
  featureGrid: { flexDirection: "row", gap: 10 },
  featureCard: { flex: 1, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: COLORS.glassBorder },
  featureGradient: { padding: 16, minHeight: 148, gap: 6 },
  featureIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.glass, alignItems: "center", justifyContent: "center",
    marginBottom: 6, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  featureIconAccent: { backgroundColor: "rgba(229,9,20,0.16)", borderColor: "rgba(229,9,20,0.28)" },
  featureTitle: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  featureSubtitle: { color: COLORS.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },

  // Profiel
  profileCard: {
    borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.glassBorder,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.glass, borderWidth: 1, borderColor: "rgba(192,38,211,0.30)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44, borderRadius: 12 },
  cameraChip: {
    position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 6,
    backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: COLORS.background,
  },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  premiumBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: COLORS.glass, borderRadius: 99, borderWidth: 1, borderColor: COLORS.glassBorder,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  premiumBadgeActive: { backgroundColor: "rgba(255,215,0,0.06)", borderColor: "rgba(255,215,0,0.25)" },
  premiumBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textMuted },
  premiumBadgeTextActive: { color: COLORS.gold },

  // Nexora+ banner
  premiumBanner: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: COLORS.borderGlow },
  premiumBannerGradient: { padding: 16, gap: 12 },
  premiumBannerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  premiumBannerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.borderGlow,
    alignItems: "center", justifyContent: "center",
  },
  premiumBannerTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 17, color: COLORS.text },
  premiumBannerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  premiumPriceRow: { flexDirection: "row", gap: 8 },
  premiumPriceChip: {
    flex: 1, borderRadius: 10, backgroundColor: COLORS.glass,
    borderWidth: 1, borderColor: COLORS.glassBorder, paddingVertical: 10, alignItems: "center", gap: 1,
  },
  premiumPriceChipPopular: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.borderGlow },
  popularDot: { position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  premiumPriceAmount: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text },
  premiumPricePeriod: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  premiumTrialNote: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.accent, textAlign: "center" },
  premiumActiveBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.accentGlow, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderGlow,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  premiumActiveBannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(192,38,211,0.18)", alignItems: "center", justifyContent: "center",
  },
  premiumActiveBannerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  premiumActiveBannerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Menu navigatie
  menuSection: { gap: 0 },
  menuSectionTitle: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.8,
    fontFamily: "Inter_700Bold", marginLeft: 2, marginBottom: 8, textTransform: "uppercase",
  },
  menuSectionCard: {
    backgroundColor: COLORS.glass, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.glassBorder, overflow: "hidden",
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  menuIconWrap: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: "rgba(229,9,20,0.10)", borderWidth: 1, borderColor: "rgba(229,9,20,0.20)",
    alignItems: "center", justifyContent: "center",
  },
  menuRowText: { flex: 1 },
  menuRowTitle: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  menuRowSub: { color: COLORS.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium", lineHeight: 16 },
  menuDivider: { height: 1, backgroundColor: COLORS.glassBorder, marginLeft: 62 },
  badge: {
    backgroundColor: "rgba(229,9,20,0.16)", borderColor: "rgba(229,9,20,0.28)",
    borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText: { color: COLORS.accent, fontSize: 10, fontFamily: "Inter_700Bold" },

  // Settings secties
  section: { gap: 0 },
  sectionTitle: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.8,
    fontFamily: "Inter_700Bold", marginLeft: 2, marginBottom: 8, textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: COLORS.glass, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.glassBorder, overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: "rgba(192,38,211,0.10)", borderWidth: 1, borderColor: "rgba(192,38,211,0.20)",
    alignItems: "center", justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.20)" },
  rowBody: { flex: 1 },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  rowLabelDanger: { color: COLORS.live },
  rowSub: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textSecondary, lineHeight: 16, marginTop: 1 },
  rowValue: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textSecondary, flexShrink: 1, textAlign: "right", maxWidth: 120 },
  rowDivider: { height: 1, backgroundColor: COLORS.glassBorder, marginLeft: 62 },
  settingsBadge: {
    backgroundColor: "rgba(192,38,211,0.16)", borderColor: "rgba(192,38,211,0.28)",
    borderWidth: 1, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2,
  },
  settingsBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.accent },
});
