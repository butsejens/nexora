import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";
import {
  checkForAppUpdates,
  fallbackIfMissing,
  getDownloadUrl,
  getLatestApkMetadata,
  prepareOtaUpdate,
  reloadToLatestUpdate,
  showNativeUpdatePrompt,
  startNativeUpdate,
  validateApkAvailability,
} from "@/services/update-service";
import type { UpdateCheckResult } from "@/services/update-decision";

const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: "2.6.27",
    date: "2026-04-02",
    changes: [
      "Volledig herschreven update-flow met aparte manifest-, OTA- en APK-paden.",
      "Updateknop beslist nu expliciet tussen OTA, APK of geen app-update.",
      "Native downloadflow gebruikt alleen nog een dedicated APK-endpoint of echte .apk asset.",
    ],
  },
  {
    version: "2.6.26",
    date: "2026-04-01",
    changes: [
      "Sport-home en match center volledig vernieuwd.",
      "Oude sport-layout verwijderd en vervangen door premium cards en nieuwe tabstructuur.",
    ],
  },
  {
    version: "2.6.14",
    date: "2026-03-28",
    changes: [
      "Sport UI volledig vernieuwd: wedstrijdkaarten, timeline en smart match feed.",
      "App controleert updates automatisch bij opstarten.",
    ],
  },
];

function primaryButtonLabel(result: UpdateCheckResult | null, checking: boolean, otaReady: boolean, downloadingApk: boolean) {
  if (checking) return "Controleren...";
  if (downloadingApk) return "APK downloaden...";
  if (!result) return "Controleer op updates";
  if (result.kind === "ota") return otaReady ? "Herstart en installeer OTA" : "Download OTA";
  if (result.kind === "apk") return "Download APK";
  return "Controleer opnieuw";
}

function statusTone(result: UpdateCheckResult | null, otaReady: boolean) {
  if (otaReady) return "#22C55E";
  if (!result) return COLORS.textMuted;
  if (result.kind === "ota" || result.kind === "apk") return COLORS.accent;
  if (result.kind === "server") return "#22C55E";
  if (result.kind === "error") return "#F87171";
  return COLORS.textMuted;
}

export function AppUpdateModal({
  visible,
  currentVersion,
  onClose,
}: {
  visible: boolean;
  currentVersion: string;
  onClose: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [otaReady, setOtaReady] = useState(false);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const tone = useMemo(() => statusTone(result, otaReady), [otaReady, result]);

  async function handleCheck() {
    setChecking(true);
    setOtaReady(false);
    setDownloadingApk(false);
    setDownloadProgress(0);
    try {
      const next = await checkForAppUpdates({ currentVersion });
      setResult(next);
    } finally {
      setChecking(false);
    }
  }

  async function handlePrimaryAction() {
    if (!result || result.kind === "none" || result.kind === "server" || result.kind === "error" || result.kind === "apk-unavailable") {
      await handleCheck();
      return;
    }

    if (result.kind === "ota") {
      if (otaReady) {
        try {
          await reloadToLatestUpdate();
        } catch (error) {
          Alert.alert("OTA herstart mislukt", error instanceof Error ? error.message : "Probeer opnieuw.");
        }
        return;
      }

      setChecking(true);
      try {
        await prepareOtaUpdate();
        setOtaReady(true);
        setResult({
          ...result,
          headline: "OTA staat klaar",
          detail: "De OTA update is gedownload. Herstart de app om de nieuwe bundel te activeren.",
        });
      } catch (error) {
        Alert.alert("OTA download mislukt", error instanceof Error ? error.message : "Probeer opnieuw.");
      } finally {
        setChecking(false);
      }
      return;
    }

    if (result.kind === "apk") {
      setDownloadingApk(true);
      setDownloadProgress(0);
      try {
        const metadata = await getLatestApkMetadata();
        if (!metadata) fallbackIfMissing("Er is geen APK metadata beschikbaar.");

        const validation = await validateApkAvailability(metadata);
        const downloadUrl = getDownloadUrl(metadata, validation);
        if (!downloadUrl) fallbackIfMissing(validation.reason || "APK endpoint is ongeldig.");

        if (metadata.fileSizeBytes > 350 * 1024 * 1024) {
          Alert.alert("Download te groot", `Deze APK is ${metadata.fileSizeLabel}. Probeer wifi te gebruiken.`);
          return;
        }

        const approved = await showNativeUpdatePrompt(metadata);
        if (!approved) return;

        await startNativeUpdate(downloadUrl, setDownloadProgress);
        setResult({
          ...result,
          detail: "De Android installer is geopend. Rond de installatie af op je toestel.",
        });
      } catch (error) {
        Alert.alert("APK update mislukt", error instanceof Error ? error.message : "Probeer opnieuw.");
      } finally {
        setDownloadingApk(false);
      }
    }
  }

  const headline = result?.headline || "Controleer op updates";
  const detail = result?.detail || "OTA, native APK en serverdeploys worden nu volledig apart behandeld.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>App Updates</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.currentVersion}>Huidige appversie: {currentVersion}</Text>

          <View style={styles.summaryCard}>
            <Text style={[styles.summaryHeadline, { color: tone }]}>{headline}</Text>
            <Text style={styles.summaryDetail}>{detail}</Text>
            {result?.manifest ? (
              <View style={styles.metaGrid}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaLabel}>Native</Text>
                  <Text style={styles.metaValue}>{result.manifest.native.version}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaLabel}>Runtime</Text>
                  <Text style={styles.metaValue}>{result.manifest.ota.runtimeVersion}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaLabel}>Server</Text>
                  <Text style={styles.metaValue}>{result.manifest.server.version}</Text>
                </View>
              </View>
            ) : null}
            {downloadingApk ? (
              <>
                <Text style={styles.progressText}>Download: {Math.round(downloadProgress * 100)}%</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
                </View>
              </>
            ) : null}
          </View>

          <ScrollView style={styles.logScroll} showsVerticalScrollIndicator={false}>
            {CHANGELOG.map((entry) => (
              <View key={entry.version} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryVersion}>v{entry.version}</Text>
                  <Text style={styles.entryDate}>{entry.date}</Text>
                  {entry.version === currentVersion ? (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Huidig</Text>
                    </View>
                  ) : null}
                </View>
                {entry.changes.map((change) => (
                  <View key={change} style={styles.changeRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.changeText}>{change}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, (checking || downloadingApk) && styles.primaryBtnDisabled]}
              disabled={checking || downloadingApk}
              onPress={handlePrimaryAction}
            >
              {checking || downloadingApk ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Ionicons name={result?.kind === "apk" ? "download-outline" : otaReady ? "refresh" : "cloud-download-outline"} size={16} color={COLORS.background} />
              )}
              <Text style={styles.primaryBtnText}>{primaryButtonLabel(result, checking, otaReady, downloadingApk)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modal: {
    maxHeight: "86%",
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  currentVersion: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  summaryCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 10,
  },
  summaryHeadline: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 18,
  },
  summaryDetail: {
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 10,
  },
  metaChip: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  metaLabel: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
  },
  metaValue: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  progressText: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  logScroll: {
    maxHeight: 260,
  },
  entry: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  entryVersion: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
  },
  entryDate: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  currentBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.16)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentBadgeText: {
    color: "#22C55E",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  changeRow: {
    flexDirection: "row",
    gap: 8,
  },
  bullet: {
    color: COLORS.accent,
    fontFamily: "Inter_700Bold",
  },
  changeText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    paddingTop: 4,
  },
  primaryBtn: {
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: COLORS.background,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 14,
  },
});