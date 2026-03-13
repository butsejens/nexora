import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Modal,
  Platform,
  ActivityIndicator,
  Linking,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { COLORS } from "@/constants/colors";
import { NexoraHeader } from "@/components/NexoraHeader";
import { useNexora } from "@/context/NexoraContext";
import { apiRequest, queryClient } from "@/lib/query-client";
import { fetchM3UText } from "@/lib/fetchM3U";
import { parseM3UContentAsync } from "@/lib/parseM3U";
import { SafeHaptics } from "@/lib/safeHaptics";

const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: "2.0.39",
    date: "2026-03-09",
    changes: [
      "Nieuwe NEXORA logo branding toegepast op app-icoon, splash en opstart-intro",
      "Boot/intro screen toont nu het nieuwe logo op gsm",
      "Versie- en updateflow gesynchroniseerd voor betrouwbare update melding",
    ],
  },
  {
    version: "2.0.38",
    date: "2026-03-09",
    changes: [
      "Nieuw sport UI design: tab-navigatie met iconen, MATCH DAY hero banner, nieuwe wedstrijdkaarten",
      "RemoveChild fout volledig opgelost in film/serie speler",
      "Wedstrijdkaarten tonen nu league badge, divider en grotere teamlogo's",
    ],
  },
  {
    version: "2.0.37",
    date: "2026-03-09",
    changes: [
      "Film/serie speler crash na 5 seconden opgelost (removeChild fout)",
      "Ad-blocker minder agressief: debounce op DOM-observatie, stopt zodra video speelt",
    ],
  },
  {
    version: "2.0.36",
    date: "2026-03-08",
    changes: [
      "Server URL gecorrigeerd naar Render cloudserver (verbindingsprobleem opgelost)",
      "Update-check altijd via server + OTA gecombineerd (popup en manuele check)",
      "Server versiebestand bijgewerkt naar correcte versie",
    ],
  },
  {
    version: "2.0.4",
    date: "2026-03-08",
    changes: [
      "Sport menu tools nu backend-gedreven (Football Predictions, Daily Acca Picks, Ready to Play, Bet Builder)",
      "Extra player hardening tegen advertentie-overlays en stabielere autoplay-start",
      "Security hardening: encrypted secrets workflow + strengere env policy checks",
      "Release scripts beperkt tot geautoriseerde MacBook host",
    ],
  },
  {
    version: "2.0.3",
    date: "2026-03-08",
    changes: [
      "Premium Sport UI branding geüniformeerd naar NEXORA",
      "AI Analyse uitgebreid met nieuwe signalenkaarten (Win Tilt, Volatiliteit, Goal Expectancy, AI Band)",
      "Versieweergave in app gebruikt nu native app-versie als primaire bron",
      "Android release versie bijgewerkt naar 2.0.3",
    ],
  },
  {
    version: "2.0.2",
    date: "2026-03-08",
    changes: [
      "M3U parser verbeterd: series worden nu correct herkend (S01E01, Season, Seizoen, Episode patronen)",
      "TMDB verrijking: films & series krijgen automatisch poster, backdrop, synopsis en rating",
      "Server-side parser ook verbeterd met URL-pad, groepsnaam én naam-gebaseerde detectie",
      "Meer IPTV-groepnamen herkend voor betere categorisatie",
    ],
  },
  {
    version: "1.9.1",
    date: "2026-03-06",
    changes: [
      "Play-knop volledig verwijderd van alle poster-kaartjes",
      "Nieuwe sectie 'Gratis Films (Archief)' — gratis publiek domein films via Internet Archive",
      "Gratis films zijn direct afspeelbaar én te downloaden (echte MP4-bestanden)",
      "Gratis films verschijnen ook in zoekresultaten",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-03-06",
    changes: [
      "Play-knop verwijderd van poster-kaartjes (enkel nog op hero banner)",
      "Sport live-kaartje vergroot (285px) en tekst past nu volledig in het vak",
      "15 filmgenres + 14 seriegenres (was 11 + 9) via TMDB Discover",
      "Nieuwe 'Meer' knop per genrerij — laad onbeperkt meer content (tot 500 pagina's)",
      "Decennia-rijen: Beste films/series van de 1990s, 2000s, 2010s, 2020s",
      "Nieuwe API-endpoints: /api/movies/all, /api/series/all met paginering en jaar/decennium filter",
      "Nieuwe eindpunten /api/movies/decades en /api/series/decades",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-03-06",
    changes: [
      "Echte offline downloads naar toestel via expo-file-system",
      "Nieuw Downloads-tabblad om gedownloade content te beheren en afspelen",
      "Play-knop direct op poster-kaartjes en hero banner",
      "11 genre-rijen (Actie, Komedie, Drama, Horror, Sci-Fi…) per categorie",
      "Film & serie catalogus uitgebreid met TMDB Discover-API (2000–nu)",
      "Poster-afbeeldingen automatisch via TMDB",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-03-06",
    changes: [
      "Play/pauze knop werkt opnieuw: touch overlay herschreven",
      "Download knop werkt correct op Android",
      "18 film/serie servers (was 6): vidsrc.me, vidsrc.xyz, vidlink, multiembed, vidsrc.icu, videasy, nontongo, 111movies, smashystream, embedcc, rive, primewire",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-03-06",
    changes: [
      "Popups volledig geblokkeerd: volledig scherm interceptor + location.href override + meta refresh blokkering",
      "Download/deel knop in speler voor alle content",
      "Push melding bij nieuwe update (automatisch bij opstart)",
      "Notificatie tikt door naar update scherm",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-03-06",
    changes: [
      "Server slaapstand opgelost: automatische keep-alive ping",
      "App opstart niet meer vast op 85%",
      "Film/serie popups volledig geblokkeerd (twee-laagse beveiliging)",
      "In-app auto-update: detecteert en installeert nieuwe versie",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-03-06",
    changes: [
      "Sport UI volledig herwerkt: poster MatchCards, hero banner",
      "Belgische competitie crash opgelost",
      "Films & series afspeelknop hersteld",
      "M3U URL parsering verbeterd (Xtream, .ts streams, genres)",
      "Popup-blokkering versterkt zonder speler te breken",
      "M3U8 samengevoegd onder één 'M3U URL' tab",
      "Team- en competitielogo's: achtergrond verwijderd",
      "Jupiler / RAAL logo's gecorrigeerd",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-03-05",
    changes: [
      "Logo prioriteit: TSDB > ESPN CDN > Wikipedia",
      "Afbeeldingsproxy voor Transfermarkt CDN",
      "Speler: absoluteFill layout-fix",
      "Gratis VOD sectie verwijderd",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-03-04",
    changes: [
      "Sport UI herontwerp: poster MatchCard toegevoegd",
      "Speler popup-fix + MatchCard verbeteringen",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-01",
    changes: [
      "Eerste release van NEXORA",
      "Live TV, Films & Series via IPTV playlists",
      "Xtream Codes ondersteuning",
      "Sport-hub met wedstrijden, standen en topscorers",
    ],
  },
];

function compareVersions(a: string, b: string): number {
  const pa = String(a || "")
    .split(".")
    .map((part) => {
      const n = Number.parseInt(String(part).replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
  const pb = String(b || "")
    .split(".")
    .map((part) => {
      const n = Number.parseInt(String(part).replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function UpdateModal({
  visible,
  currentVersion,
  onClose,
}: {
  visible: boolean;
  currentVersion: string;
  onClose: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<"idle" | "uptodate" | "update" | "downloading" | "ready">("idle");
  const [apkUrl, setApkUrl] = useState("");

  const handleCheck = async () => {
    setChecking(true);
    setStatus("idle");
    try {
      // Always check server for the latest APK version
      const res = await apiRequest("GET", "/api/app-version");
      const data = await res.json() as { version: string; apkUrl: string };
      const hasNewerApk = compareVersions(data.version, currentVersion) > 0;

      // Try OTA path first (works for both EAS and non-dev builds)
      if (!__DEV__ && Updates.isEnabled) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            setStatus("downloading");
            await Updates.fetchUpdateAsync();
            setStatus("ready");
            return;
          }
        } catch {}
      }

      // No OTA update available — check server APK
      if (hasNewerApk) {
        setApkUrl(data.apkUrl);
        setStatus("update");
      } else {
        setStatus("uptodate");
      }
    } catch {
      setStatus("uptodate");
    } finally {
      setChecking(false);
    }
  };

  const handleReload = async () => {
    await Updates.reloadAsync();
  };

  const handleDownload = async () => {
    if (!apkUrl) return;
    const normalized = apkUrl.replace(/^http:\/\//i, "https://");
    try {
      const canOpen = await Linking.canOpenURL(normalized);
      if (!canOpen) throw new Error("cannot-open");
      await Linking.openURL(normalized);
    } catch {
      Alert.alert("Update openen mislukt", "Kon de downloadlink niet openen. Probeer opnieuw of open Updates in Profiel.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={updateStyles.overlay}>
        <View style={updateStyles.modal}>
          <View style={updateStyles.header}>
            <Text style={updateStyles.title}>Wat is er nieuw?</Text>
            <TouchableOpacity onPress={onClose} style={updateStyles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={updateStyles.currentVersion}>Huidige versie: {currentVersion}</Text>

          <ScrollView style={updateStyles.logScroll} showsVerticalScrollIndicator={false}>
            {CHANGELOG.map((entry) => (
              <View key={entry.version} style={updateStyles.entry}>
                <View style={updateStyles.entryHeader}>
                  <Text style={updateStyles.entryVersion}>v{entry.version}</Text>
                  <Text style={updateStyles.entryDate}>{entry.date}</Text>
                  {entry.version === currentVersion && (
                    <View style={updateStyles.currentBadge}>
                      <Text style={updateStyles.currentBadgeText}>huidig</Text>
                    </View>
                  )}
                </View>
                {entry.changes.map((c, i) => (
                  <View key={i} style={updateStyles.changeRow}>
                    <Text style={updateStyles.bullet}>•</Text>
                    <Text style={updateStyles.changeText}>{c}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={updateStyles.footer}>
            {status === "uptodate" && (
              <Text style={updateStyles.statusText}>Je hebt de nieuwste versie.</Text>
            )}
            {status === "update" && (
              <Text style={[updateStyles.statusText, { color: COLORS.accent }]}>
                Nieuwe versie beschikbaar!
              </Text>
            )}
            {status === "downloading" && (
              <Text style={updateStyles.statusText}>Update downloaden...</Text>
            )}
            {status === "ready" && (
              <Text style={[updateStyles.statusText, { color: "#22c55e" }]}>
                Update klaar — tap om te herstarten.
              </Text>
            )}

            {status === "ready" ? (
              <TouchableOpacity style={updateStyles.checkBtn} onPress={handleReload}>
                <Ionicons name="refresh" size={16} color={COLORS.background} />
                <Text style={updateStyles.checkBtnText}>Herstart en installeer</Text>
              </TouchableOpacity>
            ) : status === "update" ? (
              <TouchableOpacity style={updateStyles.checkBtn} onPress={handleDownload}>
                <Ionicons name="download-outline" size={16} color={COLORS.background} />
                <Text style={updateStyles.checkBtnText}>Download & installeer</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[updateStyles.checkBtn, checking && { opacity: 0.6 }]}
                onPress={handleCheck}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Ionicons name="cloud-download-outline" size={16} color={COLORS.background} />
                )}
                <Text style={updateStyles.checkBtnText}>
                  {checking ? "Controleren..." : "Controleer op updates"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

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

function PinModal({
  visible, onClose, onConfirm, mode,
}: {
  visible: boolean; onClose: () => void; onConfirm: (pin: string) => void; mode: "set" | "confirm";
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");

  const handleDigit = (d: string) => {
    SafeHaptics.impactLight();
    if (step === "enter" && pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4 && mode === "set") {
        setStep("confirm");
      } else if (next.length === 4 && mode === "confirm") {
        onConfirm(next);
        setPin("");
        setStep("enter");
      }
    } else if (step === "confirm" && confirmPin.length < 4) {
      const next = confirmPin + d;
      setConfirmPin(next);
      if (next.length === 4) {
        if (next === pin) {
          onConfirm(next);
          setPin("");
          setConfirmPin("");
          setStep("enter");
        } else {
          SafeHaptics.error();
          Alert.alert("PINs do not match", "Please try again");
          setConfirmPin("");
        }
      }
    }
  };

  const handleDelete = () => {
    SafeHaptics.impactLight();
    if (step === "confirm") setConfirmPin(c => c.slice(0, -1));
    else setPin(p => p.slice(0, -1));
  };

  const currentPin = step === "confirm" ? confirmPin : pin;
  const label = mode === "confirm" ? "Enter PIN" : step === "enter" ? "Set PIN (4 digits)" : "Confirm PIN";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pinStyles.overlay}>
        <View style={pinStyles.modal}>
          <Text style={pinStyles.title}>Parental Control</Text>
          <Text style={pinStyles.label}>{label}</Text>

          <View style={pinStyles.dots}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[pinStyles.dot, currentPin.length > i && pinStyles.dotFilled]} />
            ))}
          </View>

          <View style={pinStyles.numpad}>
            {["1","2","3","4","5","6","7","8","9","","0","del"].map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[pinStyles.numKey, d === "" && { opacity: 0 }]}
                onPress={d === "del" ? handleDelete : d !== "" ? () => handleDigit(d) : undefined}
                disabled={d === ""}
              >
                {d === "del" ? (
                  <Ionicons name="backspace-outline" size={22} color={COLORS.text} />
                ) : (
                  <Text style={pinStyles.numKeyText}>{d}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={pinStyles.cancelBtn} onPress={() => { onClose(); setPin(""); setConfirmPin(""); setStep("enter"); }}>
            <Text style={pinStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function LanguageModal({ visible, selected, onClose, onSelect }: {
  visible: boolean; selected: string; onClose: () => void; onSelect: (code: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={langStyles.overlay}>
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <Text style={langStyles.title}>Audio Language</Text>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={langStyles.option}
              onPress={() => { SafeHaptics.impactLight(); onSelect(lang.code); onClose(); }}
            >
              <Text style={langStyles.optionText}>{lang.label}</Text>
              {selected === lang.code && <Ionicons name="checkmark" size={18} color={COLORS.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function SettingRow({ icon, label, value, onPress, rightElement, danger }: {
  icon: string; label: string; value?: string; onPress?: () => void; rightElement?: React.ReactNode; danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !rightElement}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon as any} size={18} color={danger ? COLORS.live : COLORS.accent} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {rightElement}
        {onPress && !rightElement && <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {selectedQuality, setSelectedQuality,
    subtitlesEnabled, setSubtitlesEnabled,
    audioLanguage, setAudioLanguage,
    autoplayEnabled, setAutoplayEnabled,
    downloadOverWifi, setDownloadOverWifi,
    notificationsEnabled, setNotificationsEnabled,
    parentalPin, setParentalPin,
    activeProfile, setActiveProfile,
    profiles, playlists, addPlaylist, removePlaylist, updatePlaylist,
    favorites, watchHistory, clearHistory, iptvChannels, setIptvChannelsForPlaylist,
    isPremium, resetAll, avatarUri, setAvatarUri} = useNexora();

  const [progressVisible, setProgressVisible] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStage, setProgressStage] = useState<"download" | "parse" | "done">("download");
const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"url" | "file" | "xtream">("url");
  const [xtreamHost, setXtreamHost] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const [filePhase, setFilePhase] = useState<"reading" | "parsing" | "download" | null>(null);
  // silence eslint about unused state vars (progress only written)
  void fileProgress;
  void filePhase;
  const webFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"set" | "confirm">("set");
  const [showLangModal, setShowLangModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const qualities = ["Auto", "4K", "FHD", "HD"] as const;
  const selectedLangLabel = LANGUAGES.find(l => l.code === audioLanguage)?.label || "Auto";

  const totalChannels = iptvChannels.length;
  const liveCount = iptvChannels.filter(c => c.category === "live").length;
  const movieCount = iptvChannels.filter(c => c.category === "movie").length;
  const seriesCount = iptvChannels.filter(c => c.category === "series").length;
  const nativeVersion = String(Application.nativeApplicationVersion || "0.0.0");
  const configVersion = String(Constants.expoConfig?.version || "0.0.0");
  const runtimeVersion = String(Updates.runtimeVersion || "0.0.0");
  const appVersion = [nativeVersion, configVersion, runtimeVersion].sort(compareVersions).at(-1) || nativeVersion;

  const handleManualUpdateCheck = useCallback(() => {
    setShowUpdateModal(true);
  }, []);

  const activateParsedPlaylist = async (data: any) => {
    try {
      const all = [
        ...(Array.isArray(data?.live) ? data.live : []),
        ...(Array.isArray(data?.movies) ? data.movies : []),
        ...(Array.isArray(data?.series) ? data.series : []),
      ];
      const candidates = all
        .filter((row: any) => row?.id && row?.url)
        .slice(0, 80)
        .map((row: any) => ({ id: String(row.id), url: String(row.url) }));

      if (!candidates.length) return data;

      const res = await apiRequest("POST", "/api/playlist/activate", { channels: candidates });
      const json = await res.json();
      const mapped = json?.urls && typeof json.urls === "object" ? json.urls : {};

      const applyUrls = (arr: any[]) =>
        (Array.isArray(arr) ? arr : []).map((row) => {
          const nextUrl = mapped?.[String(row?.id || "")];
          if (!nextUrl) return row;
          return { ...row, url: nextUrl };
        });

      return {
        ...data,
        live: applyUrls(data?.live),
        movies: applyUrls(data?.movies),
        series: applyUrls(data?.series),
      };
    } catch {
      return data;
    }
  };

  const processPlaylistData = async (playlistId: string, data: any) => {
    const activatedData = await activateParsedPlaylist(data);
    const allChannels = [...(activatedData.live || []), ...(activatedData.movies || []), ...(activatedData.series || [])];
    await setIptvChannelsForPlaylist(playlistId, allChannels);
    updatePlaylist(playlistId, {
      status: "ready",
      channelCount: allChannels.length,
      liveCount: (activatedData.live || []).length,
      movieCount: (activatedData.movies || []).length,
      seriesCount: (activatedData.series || []).length,
    });
    SafeHaptics.success();
    Alert.alert(
      "Playlist Geladen",
      `${allChannels.length} kanalen:\n• ${(activatedData.live || []).length} Live\n• ${(activatedData.movies || []).length} Films\n• ${(activatedData.series || []).length} Series`
    );
  };

  const createSingleM3U8Data = (name: string, streamUrl: string) => ({
    live: [{
      id: `m3u8_${Date.now()}`,
      playlistId: "",
      name,
      title: name,
      logo: "",
      group: "HLS",
      url: streamUrl,
      category: "live",
      poster: null,
      backdrop: null,
      synopsis: "",
      year: null,
      rating: 0,
      tmdbId: null,
    }],
    movies: [],
    series: [],
  });

  const loadXtreamPlaylist = async (playlistId: string, host: string, username: string, password: string, fallbackUrl: string) => {
    setLoadingPlaylistId(playlistId);
    updatePlaylist(playlistId, { status: "loading" });
    setProgressVisible(true);
    setProgressStage("download");
    setProgressPct(10);
    try {
      // Try server-side Xtream (no CORS issues)
      try {
        const res = await apiRequest("POST", "/api/playlist/xtream", { host, username, password });
        setProgressPct(60);
        if (res.ok) {
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setProgressPct(100);
          setProgressStage("done");
          await processPlaylistData(playlistId, data);
          setTimeout(() => setProgressVisible(false), 600);
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server fout ${res.status}`);
      } catch (serverErr: any) {
        console.log("Server-side Xtream failed, trying direct URL:", serverErr.message);
      }

      // Fallback: direct URL method
      await loadPlaylist(playlistId, fallbackUrl);
    } catch (err: any) {
      setProgressVisible(false);
      updatePlaylist(playlistId, { status: "error", error: err.message || "Laden mislukt" });
      Alert.alert("Xtream fout", err.message || "Onbekende fout");
      setLoadingPlaylistId(null);
    }
  };

  const loadPlaylist = async (playlistId: string, url: string) => {
    setLoadingPlaylistId(playlistId);
    updatePlaylist(playlistId, { status: "loading" });
    setProgressVisible(true);
    setProgressStage("download");
    setProgressPct(5);
    try {
      // First try: server-side fetch with IPTV-friendly headers
      try {
        setProgressPct(15);
        const res = await apiRequest("POST", "/api/playlist/parse", { url });
        // Server returns 502 when it can't reach the URL → fall through to client-side
        if (res.status === 502 || res.status === 422) {
          const errData = await res.json();
          throw new Error(errData.error || `Server fout ${res.status}`);
        }
        if (!res.ok) throw new Error(`Server fout ${res.status}`);
        setProgressPct(60);
        setProgressStage("parse");
        const data = await res.json();
        setProgressPct(100);
        setProgressStage("done");
        await processPlaylistData(playlistId, data);
        setTimeout(() => setProgressVisible(false), 600);
        return;
      } catch (serverErr: any) {
        console.log("Server-side fetch failed, trying client-side XHR:", serverErr.message);
      }

      // Second try: direct XHR from client (bypasses server, works for many IPTV providers)
      setProgressStage("download");
      setProgressPct(10);
      let text = "";
      try {
        text = await fetchM3UText(url, 90000);
        setProgressPct(50);
      } catch (_fetchErr: any) { void _fetchErr; // ignore unused error

        throw new Error(
          `Kan URL niet laden via server of direct.\n\nProbeer:\n• Kopieer de URL en plak ze als bestand\n• Check of de URL correct is\n• Sommige IPTV servers blokkeren externe toegang`
        );
      }

      const isHls = text.includes("#EXT-X-STREAM-INF") || text.includes("#EXT-X-TARGETDURATION");
      if (isHls) {
        const fallbackName = playlistName?.trim() || "M3U8 Stream";
        const data = createSingleM3U8Data(fallbackName, url);
        await processPlaylistData(playlistId, data);
        setProgressVisible(false);
        setLoadingPlaylistId(null);
        return;
      }

      if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
        throw new Error("Geen geldig M3U bestand. Controleer de URL.");
      }

      setProgressStage("parse");
      setProgressPct(60);

      // Parse client-side with progress
      const data = await parseM3UContentAsync(text, (pct) => {
        setProgressPct(60 + Math.round(pct * 0.4));
      });

      const allChannels = [...data.live, ...data.movies, ...data.series];
      if (allChannels.length === 0) {
        throw new Error("Geen kanalen gevonden in het M3U bestand.");
      }

      await setIptvChannelsForPlaylist(playlistId, allChannels as any);
      updatePlaylist(playlistId, {
        status: "ready",
        channelCount: allChannels.length,
        liveCount: data.live.length,
        movieCount: data.movies.length,
        seriesCount: data.series.length,
      });
      setProgressPct(100);
      setProgressStage("done");
      SafeHaptics.success();
      setTimeout(() => setProgressVisible(false), 600);
      Alert.alert(
        "Playlist Geladen ✓",
        `${allChannels.length} kanalen:\n• ${data.live.length} Live\n• ${data.movies.length} Films\n• ${data.series.length} Series`
      );
    } catch (err: any) {
      setProgressVisible(false);
      updatePlaylist(playlistId, { status: "error", error: err.message || "Laden mislukt" });
      Alert.alert("Fout bij laden", err.message || "Onbekende fout");
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  const loadPlaylistFromContent = async (playlistId: string, content: string) => {
    setLoadingPlaylistId(playlistId);
    updatePlaylist(playlistId, { status: "loading" });
    setProgressVisible(true);
    setProgressStage("parse");
    setProgressPct(0);
    setFileProgress(0);
    try {
      // Parse async client-side with progress — no server round-trip, no size limits
      const data = await parseM3UContentAsync(content, (pct) => {
        setProgressPct(Math.max(5, Math.min(100, pct)));
      });
      const allChannels = [...data.live, ...data.movies, ...data.series];
      if (allChannels.length === 0) {
        throw new Error("Geen kanalen gevonden in het M3U bestand. Controleer de inhoud.");
      }
      await setIptvChannelsForPlaylist(playlistId, allChannels as any);
      updatePlaylist(playlistId, {
        status: "ready",
        channelCount: allChannels.length,
        liveCount: data.live.length,
        movieCount: data.movies.length,
        seriesCount: data.series.length,
      });
      setProgressPct(100);
      setProgressStage("done");
      SafeHaptics.success();
      const cappedNote = data.capped ? "\n\nPlaylist was erg groot — eerste 13.000 kanalen geladen." : "";
      Alert.alert(
        "Playlist Geladen",
        `${allChannels.length} kanalen geladen:\n• ${data.live.length} Live\n• ${data.movies.length} Films\n• ${data.series.length} Series${cappedNote}`
      );
    } catch (err: any) {
      updatePlaylist(playlistId, { status: "error", error: err.message || "Laden mislukt" });
      Alert.alert("Fout", `Playlist laden mislukt: ${err.message || "Onbekende fout"}`);
    } finally {
      setLoadingPlaylistId(null);
      setFilePhase(null);
      setFileProgress(0);
      setTimeout(() => setProgressVisible(false), 600);
    }
  };

  const handlePickFile = async () => {
    if (Platform.OS === "web") {
      webFileInputRef.current?.click();
      return;
    }
    try {
      setFileLoading(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;

      const MAX_MB = 300;
      const fileSizeBytes = (asset as any).size || 0;
      if (fileSizeBytes > MAX_MB * 1024 * 1024) {
        Alert.alert("Bestand te groot", `Maximum is ${MAX_MB}MB. Gebruik de URL-methode voor grotere playlists.`);
        return;
      }

      // Read file via XHR — supports onprogress for real-time % feedback
      setFilePhase("download");
      setFileProgress(0);

      const text = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", uri, true);
        xhr.responseType = "text";
        xhr.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            setFileProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          resolve(xhr.responseText || "");
        };
        xhr.onerror = () => reject(new Error("Kan bestand niet lezen"));
        xhr.send();
      });

      setFilePhase(null);

      if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
        Alert.alert("Ongeldig bestand", "Dit is geen geldig M3U bestand. Controleer of het de juiste inhoud heeft.");
        return;
      }
      setSelectedFileName(asset.name || "playlist.m3u");
      setSelectedFileContent(text);
    } catch (err: any) {
      Alert.alert("Fout", "Bestand kon niet worden geladen: " + (err.message || ""));
    } finally {
      setFileLoading(false);
      setFilePhase(null);
      setFileProgress(0);
    }
  };

  const handleWebFileChange = async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setFileLoading(true);
    try {
      const text = await file.text();
      if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
        Alert.alert("Ongeldig bestand", "Dit is geen geldig M3U bestand.");
        return;
      }
      setSelectedFileName(file.name);
      setSelectedFileContent(text);
    } catch {
      Alert.alert("Fout", "Bestand kon niet worden gelezen.");
    } finally {
      setFileLoading(false);
    }
  };

  const handleAddPlaylist = async () => {
    if (!playlistName.trim()) {
      Alert.alert("Fout", "Vul een naam in voor de playlist");
      return;
    }
    if (addMode === "url") {
      if (!playlistUrl.trim()) {
        Alert.alert("Fout", "Vul een URL in");
        return;
      }
      const name = playlistName.trim();
      const url = playlistUrl.trim();
      setPlaylistName(""); setPlaylistUrl("");
      setShowAddPlaylist(false);
      const newPl = await addPlaylist({ name, url, type: "m3u", status: "loading" });
      loadPlaylist(newPl.id, url);
    } else if (addMode === "xtream") {
      if (!xtreamHost.trim() || !xtreamUser.trim() || !xtreamPass.trim()) {
        Alert.alert("Fout", "Vul host, username en password in");
        return;
      }
      let host = xtreamHost.trim().replace(/\/$/, "");
      if (!/^https?:\/\//i.test(host)) host = "http://" + host;
      const uname = xtreamUser.trim();
      const upass = xtreamPass.trim();
      const url = `${host}/get.php?username=${encodeURIComponent(uname)}&password=${encodeURIComponent(upass)}&type=m3u_plus&output=ts`;
      const name = playlistName.trim();
      setPlaylistName("");
      setXtreamHost(""); setXtreamUser(""); setXtreamPass("");
      setShowAddPlaylist(false);
      setAddMode("url");
      const newPl = await addPlaylist({ name, url, type: "xtream", status: "loading" });
      loadXtreamPlaylist(newPl.id, host, uname, upass, url);
    } else if (addMode === "file") {
      if (!selectedFileContent) {
        Alert.alert("Fout", "Selecteer eerst een M3U bestand");
        return;
      }
      const name = playlistName.trim();
      const content = selectedFileContent;
      setPlaylistName(""); setSelectedFileName(null); setSelectedFileContent(null);
      setShowAddPlaylist(false); setAddMode("url");
      const newPl = await addPlaylist({ name, url: selectedFileName || "bestand.m3u", type: "m3u", status: "loading" });
      loadPlaylistFromContent(newPl.id, content);
    } else {
      if (!playlistUrl.trim()) {
        Alert.alert("Fout", "Vul een M3U8 stream URL in");
        return;
      }
      const name = playlistName.trim() || "M3U8 Stream";
      const url = playlistUrl.trim();
      setPlaylistName("");
      setPlaylistUrl("");
      setShowAddPlaylist(false);
      setAddMode("url");
      const newPl = await addPlaylist({ name, url, type: "m3u", status: "loading" });
      const data = createSingleM3U8Data(name, url);
      await processPlaylistData(newPl.id, data);
    }
  };

  const handleRemovePlaylist = (id: string, name: string) => {
    Alert.alert("Remove Playlist", `Remove "${name}" and all its channels?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { removePlaylist(id); SafeHaptics.impactLight(); } },
    ]);
  };

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
    Alert.alert("Clear Watch History", "This will remove all your watched content history.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        await clearHistory();
        SafeHaptics.success();
        Alert.alert("Cleared", "Watch history has been cleared.");
      }},
    ]);
  };

  const handleResetAppData = () => {
    Alert.alert(
      "Reset App Data",
      "Dit wist playlists, favorieten, geschiedenis en cache. Je moet playlists opnieuw toevoegen.",
      [
        { text: "Annuleer", style: "cancel" },
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
      setProgressVisible(false);

              Alert.alert("Fout", e?.message || "Kon app data niet resetten");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <NexoraHeader showSearch={false} showProfile   onProfile={() => router.push("/profile")}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        <Text style={styles.heroHeadline}>Jouw profiel, playlists en streaming instellingen</Text>
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={async () => {
              SafeHaptics.impactLight();
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== "granted") {
                Alert.alert("Toestemming nodig", "Geef toegang tot je foto's om een profielfoto in te stellen.");
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
            }}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={32} color={COLORS.accent} />
              )}
            </View>
            <View style={styles.glowRing} />
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>Main Profile</Text>
          <TouchableOpacity
            style={[styles.premiumBadge, isPremium && styles.premiumBadgeActive]}
            onPress={() => router.push("/premium")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="crown" size={13} color={isPremium ? "#FFD700" : COLORS.textMuted} />
            <Text style={[styles.premiumBadgeText, isPremium && styles.premiumBadgeTextActive]}>
              {isPremium ? "NEXORA Premium" : "Upgrade naar Premium"}
            </Text>
            {!isPremium && <Ionicons name="chevron-forward" size={13} color={COLORS.accent} />}
          </TouchableOpacity>
        </View>

        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{favorites.length}</Text>
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{watchHistory.length}</Text>
            <Text style={styles.statLabel}>Watched</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{playlists.length}</Text>
            <Text style={styles.statLabel}>Playlists</Text>
          </View>
        </View>

        {totalChannels > 0 && (
          <View style={styles.channelStatsBar}>
            <View style={styles.channelStat}>
              <Text style={styles.channelStatNum}>{liveCount}</Text>
              <Text style={styles.channelStatLbl}>Live</Text>
            </View>
            <View style={styles.channelStatDiv} />
            <View style={styles.channelStat}>
              <Text style={styles.channelStatNum}>{movieCount}</Text>
              <Text style={styles.channelStatLbl}>Movies</Text>
            </View>
            <View style={styles.channelStatDiv} />
            <View style={styles.channelStat}>
              <Text style={styles.channelStatNum}>{seriesCount}</Text>
              <Text style={styles.channelStatLbl}>Series</Text>
            </View>
            <View style={styles.channelStatDiv} />
            <TouchableOpacity onPress={() => router.push("/playlist-manage")} style={styles.manageQuickBtn}>
              <Ionicons name="options-outline" size={14} color={COLORS.accent} />
              <Text style={styles.manageQuickBtnText}>Manage</Text>
            </TouchableOpacity>
          </View>
        )}

        <Section title="IPTV Playlists">
          {playlists.map((pl) => {
            const isLoading = loadingPlaylistId === pl.id || pl.status === "loading";
            return (
            <View key={pl.id}>
              <View style={styles.playlistRow}>
                <View style={[styles.playlistIcon, pl.status === "error" && { backgroundColor: COLORS.liveGlow }]}>
                  {isLoading
                    ? <ActivityIndicator size="small" color={COLORS.accent} />
                    : <MaterialCommunityIcons name="playlist-play" size={18} color={pl.status === "error" ? COLORS.live : COLORS.accent} />
                  }
                </View>
                <View style={styles.playlistInfo}>
                  <View style={styles.playlistNameRow}>
                    <Text style={styles.playlistName}>{pl.name}</Text>
                    {pl.status === "ready" && (
                      <View style={styles.readyBadge}>
                        <Text style={styles.readyBadgeText}>{pl.channelCount} ch.</Text>
                      </View>
                    )}
                    {pl.status === "error" && (
                      <View style={styles.errorBadge}>
                        <Text style={styles.errorBadgeText}>Error</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.playlistUrl} numberOfLines={1}>{pl.url}</Text>
                  {isLoading && <Text style={styles.loadingText}>Loading channels...</Text>}
                  {pl.status === "ready" && (
                    <Text style={styles.channelCountText}>
                      {pl.liveCount} live · {pl.movieCount} movies · {pl.seriesCount} series
                    </Text>
                  )}
                </View>
                <View style={styles.playlistActions}>
                  {!isLoading && (
                    <TouchableOpacity onPress={() => loadPlaylist(pl.id, pl.url)} style={styles.reloadBtn}>
                      <Ionicons name="refresh-outline" size={16} color={COLORS.accent} />
                    </TouchableOpacity>
                  )}
                  {!isLoading && (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/playlist-edit", params: { playlistId: pl.id } })}
                      style={styles.reloadBtn}
                    >
                      <Ionicons name="create-outline" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleRemovePlaylist(pl.id, pl.name)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.live} />
                  </TouchableOpacity>
                </View>
              </View>
              <Divider />
            </View>
            );
          })}

          {/* Hidden web file input */}
          {Platform.OS === "web" && (
            <input
              ref={(el) => { webFileInputRef.current = el as any; }}
              type="file"
              accept=".m3u,.m3u8,text/plain,application/x-mpegurl"
              title="Selecteer M3U bestand"
              aria-label="Selecteer M3U bestand"
              hidden
              onChange={handleWebFileChange}
            />
          )}

          {showAddPlaylist ? (
            <View style={styles.addForm}>
              {/* Mode tabs */}
              <View style={styles.modeTabs}>
                <TouchableOpacity
                  style={[styles.modeTab, addMode === "url" && styles.modeTabActive]}
                  onPress={() => setAddMode("url")}
                >
                  <Ionicons name="link-outline" size={14} color={addMode === "url" ? COLORS.accent : COLORS.textMuted} />
                  <Text style={[styles.modeTabText, addMode === "url" && styles.modeTabTextActive]}>M3U URL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeTab, addMode === "xtream" && styles.modeTabActive]}
                  onPress={() => setAddMode("xtream")}
                >
                  <Ionicons name="key-outline" size={14} color={addMode === "xtream" ? COLORS.accent : COLORS.textMuted} />
                  <Text style={[styles.modeTabText, addMode === "xtream" && styles.modeTabTextActive]}>Xtream</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeTab, addMode === "file" && styles.modeTabActive]}
                  onPress={() => setAddMode("file")}
                >
                  <Ionicons name="document-outline" size={14} color={addMode === "file" ? COLORS.accent : COLORS.textMuted} />
                  <Text style={[styles.modeTabText, addMode === "file" && styles.modeTabTextActive]}>Bestand</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input} placeholder="Playlist naam" placeholderTextColor={COLORS.textMuted}
                value={playlistName} onChangeText={setPlaylistName}
              />

              {addMode === "url" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="http://server.com/get.php?username=...&password=... of https://example.com/playlist.m3u8"
                    placeholderTextColor={COLORS.textMuted}
                    value={playlistUrl} onChangeText={setPlaylistUrl}
                    autoCapitalize="none" keyboardType="url"
                  />
                  <Text style={styles.urlHint}>
                    Ondersteund: M3U, M3U8, M3U+ en Xtream Codes (get.php) URLs. Alle soorten playlist-links worden hier uitgelezen.
                  </Text>
                </>
              ) : addMode === "xtream" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Xtream host (bv. http://example.com:8080)"
                    placeholderTextColor={COLORS.textMuted}
                    value={xtreamHost}
                    onChangeText={setXtreamHost}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Username"
                    placeholderTextColor={COLORS.textMuted}
                    value={xtreamUser}
                    onChangeText={setXtreamUser}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={COLORS.textMuted}
                    value={xtreamPass}
                    onChangeText={setXtreamPass}
                    autoCapitalize="none"
                    secureTextEntry
                  />
                  <Text style={styles.urlHint}>
                    We bouwen automatisch je M3U+ link via get.php (output=ts). Dit is compatibel met de bestaande parser.
                  </Text>
                </>
              ) : (
                <TouchableOpacity style={styles.filePickBtn} onPress={handlePickFile} activeOpacity={0.8}>
                  {fileLoading ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : selectedFileName ? (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} />
                      <Text style={styles.filePickBtnTextSelected} numberOfLines={1}>{selectedFileName}</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color={COLORS.accent} />
                      <Text style={styles.filePickBtnText}>Selecteer M3U bestand (.m3u / .m3u8)</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={styles.formButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                  setShowAddPlaylist(false);
                  setAddMode("url"); setSelectedFileName(null); setSelectedFileContent(null);
                }}>
                  <Text style={styles.cancelBtnText}>Annuleer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={handleAddPlaylist}>
                  <Text style={styles.addBtnText}>Toevoegen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPlaylistBtn} onPress={() => setShowAddPlaylist(true)}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
              <Text style={styles.addPlaylistText}>M3U Playlist Toevoegen</Text>
            </TouchableOpacity>
          )}
        </Section>

        <Section title="Playback">
          <View style={styles.qualityRow}>
            <View style={styles.rowIcon}>
              <Ionicons name="videocam-outline" size={18} color={COLORS.accent} />
            </View>
            <Text style={styles.rowLabel}>Quality</Text>
            <View style={styles.qualityButtons}>
              {qualities.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.qualityBtn, selectedQuality === q && styles.qualityBtnActive]}
                  onPress={() => { SafeHaptics.impactLight(); setSelectedQuality(q); }}
                >
                  <Text style={[styles.qualityBtnText, selectedQuality === q && styles.qualityBtnTextActive]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Divider />
          <SettingRow
            icon="text-outline"
            label="Subtitles"
            rightElement={
              <Switch
                value={subtitlesEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setSubtitlesEnabled(v); }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={subtitlesEnabled ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
          <Divider />
          <SettingRow
            icon="language-outline"
            label="Audio Language"
            value={selectedLangLabel}
            onPress={() => setShowLangModal(true)}
          />
          <Divider />
          <SettingRow
            icon="play-skip-forward-outline"
            label="Autoplay Next"
            rightElement={
              <Switch
                value={autoplayEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setAutoplayEnabled(v); }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={autoplayEnabled ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
        </Section>

        <Section title="Downloads">
          <SettingRow
            icon="wifi-outline"
            label="Download over Wi-Fi only"
            rightElement={
              <Switch
                value={downloadOverWifi}
                onValueChange={(v) => { SafeHaptics.impactLight(); setDownloadOverWifi(v); }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={downloadOverWifi ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
          <Divider />
          <SettingRow
            icon="folder-outline"
            label="Offline downloads"
            value="Niet beschikbaar"
            onPress={() => Alert.alert("Downloads", "Offline downloads zijn nog niet beschikbaar in deze versie. Content streamt direct via je IPTV playlist.")}
          />
        </Section>

        <Section title="Notifications">
          <SettingRow
            icon="notifications-outline"
            label="Push Notifications"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={(v) => { SafeHaptics.impactLight(); setNotificationsEnabled(v); }}
                trackColor={{ false: COLORS.border, true: COLORS.accentGlow }}
                thumbColor={notificationsEnabled ? COLORS.accent : COLORS.textMuted}
              />
            }
          />
          <Divider />
          <SettingRow
            icon="calendar-outline"
            label="Nieuwe releases"
            value="Binnenkort"
            onPress={() => Alert.alert("Nieuwe releases", "Meldingen voor nieuwe content komen in een toekomstige update.")}
          />
        </Section>

        <Section title="Security">
          <SettingRow
            icon="lock-closed-outline"
            label="Parental Control"
            value={parentalPin ? "Active (PIN set)" : "Off"}
            onPress={handleSetPin}
          />
          <Divider />
          <SettingRow
            icon="time-outline"
            label="Kijkgeschiedenis wissen"
            value={watchHistory.length > 0 ? `${watchHistory.length} items` : "Leeg"}
            onPress={handleClearHistory}
          />
          <Divider />
          <SettingRow
            icon="refresh-outline"
            label="Reset App Data"
            danger
            onPress={handleResetAppData}
          />
        </Section>

        <Section title="About">
          <SettingRow icon="information-circle-outline" label="Version" value={appVersion} />
          <Divider />
          <SettingRow
            icon="cloud-download-outline"
            label="Check app updates"
            value={appVersion}
            onPress={handleManualUpdateCheck}
          />
          <Divider />
          <SettingRow
            icon="star-outline"
            label="Rate NEXORA"
            onPress={() => Alert.alert("Thanks!", "Your rating helps us improve. Rating will be available on release.")}
          />
          <Divider />
          <SettingRow
            icon="help-circle-outline"
            label="Support"
            onPress={() => Alert.alert("Support", "support@nexora.app\n\nResponse time: 24-48 hours")}
          />
          <Divider />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => Alert.alert("Privacy Policy", "Your data is stored locally and never shared with third parties.")}
          />
        </Section>
      </ScrollView>

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

      <UpdateModal
        visible={showUpdateModal}
        currentVersion={appVersion}
        onClose={() => setShowUpdateModal(false)}
      />

      {/* M3U Upload Progress Modal */}
      <Modal visible={progressVisible} transparent animationType="fade">
        <View style={progStyles.overlay}>
          <View style={progStyles.card}>
            <MaterialCommunityIcons
              name={progressStage === "done" ? "check-circle" : progressStage === "parse" ? "cog" : "download"}
              size={36}
              color={progressStage === "done" ? "#22c55e" : COLORS.accent}
            />
            <Text style={progStyles.title}>
              {progressStage === "done"
                ? "Klaar!"
                : progressStage === "parse"
                ? "Kanalen verwerken..."
                : "Playlist downloaden..."}
            </Text>
            <View style={progStyles.barBg}>
              <View style={[progStyles.barFill, { width: `${progressPct}%` as any }]} />
            </View>
            <Text style={progStyles.pct}>{progressPct}%</Text>
            <Text style={progStyles.hint}>Even geduld, grote lijsten kunnen even duren.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const pinStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modal: {
    backgroundColor: COLORS.cardElevated, borderRadius: 24, padding: 24, width: 300, alignItems: "center", gap: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  label: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  dots: { flexDirection: "row", gap: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.accent },
  dotFilled: { backgroundColor: COLORS.accent },
  numpad: { flexDirection: "row", flexWrap: "wrap", width: 216, gap: 8 },
  numKey: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.card,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border,
  },
  numKeyText: { fontFamily: "Inter_600SemiBold", fontSize: 22, color: COLORS.text },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.textMuted },
});

const langStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.cardElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: "70%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, marginBottom: 12 },
  option: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  optionText: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.text },
});

const styles = StyleSheet.create({
  progressOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  progressCard: { width: '100%', maxWidth: 420, backgroundColor: COLORS.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  progressTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  progressBarOuter: { height: 10, backgroundColor: COLORS.cardElevated, borderRadius: 999, overflow: 'hidden', marginTop: 14 },
  progressBarInner: { height: 10, backgroundColor: COLORS.accent, borderRadius: 999 },
  progressPct: { color: COLORS.textSecondary, marginTop: 10, fontSize: 12 },

  container: { flex: 1, backgroundColor: COLORS.background },
  heroHeadline: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
    lineHeight: 28,
    color: COLORS.text,
    textAlign: "center",
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 12,
  },
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted,
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10,
  },
  sectionContent: { backgroundColor: COLORS.overlayLight, borderRadius: 18, borderWidth: 1, borderColor: COLORS.borderLight, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.accentGlow, alignItems: "center", justifyContent: "center" },
  rowIconDanger: { backgroundColor: COLORS.liveGlow },
  rowLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.text },
  rowLabelDanger: { color: COLORS.live },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 62 },
  profileSection: { alignItems: "center", paddingVertical: 22, gap: 6 },
  avatarContainer: { position: "relative", marginBottom: 8 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.cardElevated,
    borderWidth: 2, borderColor: COLORS.accent, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.background,
  },
  glowRing: {
    position: "absolute", top: -4, left: -4, width: 88, height: 88,
    borderRadius: 44, borderWidth: 1, borderColor: COLORS.accentGlowStrong,
  },
  profileName: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 8 },
  premiumBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 7, marginBottom: 12,
  },
  premiumBadgeActive: {
    backgroundColor: "rgba(255,215,0,0.08)",
    borderColor: "rgba(255,215,0,0.4)",
  },
  premiumBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted },
  premiumBadgeTextActive: { color: "#FFD700" },
  profileSub: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.accent, marginBottom: 12 },
  statsBar: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 24, backgroundColor: COLORS.overlayLight,
    borderRadius: 18, padding: 16, justifyContent: "space-around", borderWidth: 1, borderColor: COLORS.borderLight,
  },
  statItem: { alignItems: "center", gap: 3 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.accent },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  statDivider: { width: 1, backgroundColor: COLORS.border },
  channelStatsBar: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 12, backgroundColor: COLORS.overlayLight,
    borderRadius: 16, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.borderLight,
  },
  channelStat: { flex: 1, alignItems: "center", gap: 2 },
  channelStatNum: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.accent },
  channelStatLbl: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  channelStatDiv: { width: 1, height: 30, backgroundColor: COLORS.border },
  manageQuickBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent,
  },
  manageQuickBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.accent },
  playlistRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  playlistIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.accentGlow, alignItems: "center", justifyContent: "center" },
  playlistInfo: { flex: 1 },
  playlistNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playlistName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  playlistUrl: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.accent, marginTop: 2 },
  channelCountText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  readyBadge: { backgroundColor: "#0D3", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  readyBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff" },
  errorBadge: { backgroundColor: COLORS.liveGlow, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  errorBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.live },
  playlistActions: { flexDirection: "row", alignItems: "center" },
  reloadBtn: { padding: 8 },
  removeBtn: { padding: 8 },
  addPlaylistBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  addPlaylistText: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.accent },
  addForm: { padding: 16, gap: 10 },
  input: {
    backgroundColor: COLORS.cardElevated, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  formButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.textSecondary },
  addBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: COLORS.accent },
  addBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.background },
  modeTabs: { flexDirection: "row", gap: 8, marginBottom: 2 },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 9, borderRadius: 10,
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  modeTabActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  modeTabText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted },
  modeTabTextActive: { color: COLORS.accent },
  filePickBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.cardElevated, borderRadius: 10, borderWidth: 1.5,
    borderColor: COLORS.accent, borderStyle: "dashed",
    paddingHorizontal: 14, paddingVertical: 16, justifyContent: "center",
  },
  filePickBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.accent, flex: 1 },
  filePickBtnTextSelected: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.accent, flex: 1 },
  urlHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
  qualityRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  qualityButtons: { flexDirection: "row", gap: 6 },
  qualityBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COLORS.cardElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  qualityBtnActive: { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent },
  qualityBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted },
  qualityBtnTextActive: { color: COLORS.accent },
});

const updateStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modal: {
    backgroundColor: COLORS.cardElevated, borderRadius: 20, width: "100%", maxWidth: 400,
    borderWidth: 1, borderColor: COLORS.border, maxHeight: "80%",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  closeBtn: { padding: 4 },
  currentVersion: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  logScroll: { maxHeight: 340, paddingHorizontal: 20 },
  entry: { marginBottom: 20 },
  entryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  entryVersion: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.accent },
  entryDate: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  currentBadge: {
    backgroundColor: COLORS.accentGlow, borderRadius: 6, borderWidth: 1,
    borderColor: COLORS.accent, paddingHorizontal: 6, paddingVertical: 2,
  },
  currentBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: COLORS.accent },
  changeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  bullet: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.accent, marginTop: 1 },
  changeText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 18 },
  footer: {
    padding: 20, gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  checkBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14,
  },
  checkBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.background },
});

const progStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center", justifyContent: "center",
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 28,
    alignItems: "center", gap: 14, width: 280,
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, textAlign: "center" },
  barBg: {
    width: "100%", height: 8, borderRadius: 4,
    backgroundColor: COLORS.cardElevated, overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  pct: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.accent },
  hint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center" },
});
