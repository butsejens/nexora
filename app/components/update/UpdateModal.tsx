import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import { ChangelogEntry, type ChangelogEntryData } from "./ChangelogEntry";
import { DownloadProgressBar } from "./DownloadProgressBar";
import { UpdateStateCard, type UpdateStateType } from "./UpdateStateCard";
import { VersionInfoBlock } from "./VersionInfoBlock";

const CHANGELOG: ChangelogEntryData[] = [
  {
    version: "1.0.0",
    date: "2026-04-16",
    changes: [
      "Bugfixes en verbeteringen.",
      "Prestaties geoptimaliseerd.",
      "Stabiliteit verbeterd.",
    ],
    isCurrent: true,
  },
];

interface UpdateModalProps {
  visible: boolean;
  currentVersion: string;
  onClose: () => void;
}

export function UpdateModal({ visible, currentVersion, onClose }: UpdateModalProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [otaReady, setOtaReady] = useState(false);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Determine the primary state for display
  const displayState = useMemo((): UpdateStateType => {
    if (checking) return "checking";
    if (downloadingApk) return "downloading";
    if (!result) return "checking";

    if (result.kind === "error" || result.kind === "apk-unavailable") return "error";
    if (result.kind === "none" || result.kind === "server") return "no-update";
    if (otaReady) return "ready";
    if (result.kind === "ota") return "available";
    if (result.kind === "apk") return "available";

    return "checking";
  }, [checking, downloadingApk, result, otaReady]);

  const handleCheck = useCallback(async () => {
    setResult(null);
    setChecking(true);
    setOtaReady(false);
    setDownloadingApk(false);
    setDownloadProgress(0);
    try {
      const next = await checkForAppUpdates({ currentVersion });
      setResult(next);
    } catch (error) {
      console.error("[UpdateModal] Check failed:", error);
      setResult({
        kind: "error",
        headline: "Controleren mislukt",
        detail: error instanceof Error ? error.message : "Kon niet controleren op updates.",
        manifest: null,
        currentVersion,
        currentNativeVersion: "",
        currentRuntimeVersion: "",
        downloadUrl: null,
        serverChanged: false,
        otaAvailable: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setChecking(false);
    }
  }, [currentVersion]);

  const handlePrimaryAction = useCallback(async () => {
    // If no result yet, just check for updates
    if (!result || result.kind === "none" || result.kind === "server" || result.kind === "error" || result.kind === "apk-unavailable") {
      await handleCheck();
      return;
    }

    // OTA Update Flow
    if (result.kind === "ota") {
      if (otaReady) {
        try {
          await reloadToLatestUpdate();
        } catch (error) {
          Alert.alert(
            "OTA herstart mislukt",
            error instanceof Error ? error.message : "Kon OTA niet herstarten. Probeer opnieuw.",
            [{ text: "OK" }]
          );
          console.error("[UpdateModal] OTA reload failed:", error);
        }
        return;
      }

      // Download OTA
      setChecking(true);
      try {
        await prepareOtaUpdate();
        setOtaReady(true);
        setResult((prev) =>
          prev
            ? {
                ...prev,
                headline: "OTA klaar voor installatie",
                detail: "De snelle update is gedownload. Klik op 'Herstart en installeer' om de nieuwe versie in te schakelen.",
              }
            : prev
        );
      } catch (error) {
        console.error("[UpdateModal] OTA download failed:", error);
        Alert.alert(
          "OTA download mislukt",
          error instanceof Error ? error.message : "Kon OTA niet downloaden.",
          [{ text: "OK" }]
        );
      } finally {
        setChecking(false);
      }
      return;
    }

    // APK Update Flow
    if (result.kind === "apk") {
      setDownloadingApk(true);
      setDownloadProgress(0);
      try {
        const metadata = await getLatestApkMetadata();
        if (!metadata) {
          fallbackIfMissing("APK metadata niet beschikbaar.");
          return;
        }

        const validation = await validateApkAvailability(metadata);
        const downloadUrl = getDownloadUrl(metadata, validation);
        if (!downloadUrl) {
          fallbackIfMissing(validation.reason || "APK endpoint ongeldig.");
          return;
        }

        // Warn if download is large
        if (metadata.fileSizeBytes > 350 * 1024 * 1024) {
          Alert.alert(
            "Grote download",
            `Deze APK is ongeveer ${metadata.fileSizeLabel}. We adviseren WiFi te gebruiken.`,
            [
              { text: "Toch downloaden", onPress: () => {} }, // Continue after dismissal
              { text: "Later", onPress: () => setDownloadingApk(false) },
            ]
          );
          return;
        }

        // Show native install prompt (Android-only)
        const approved = await showNativeUpdatePrompt(metadata);
        if (!approved) {
          setDownloadingApk(false);
          return;
        }

        // Start download
        await startNativeUpdate(downloadUrl, setDownloadProgress);

        // Update display state
        setResult((prev) =>
          prev
            ? {
                ...prev,
                headline: "Installatie in voorbereiding...",
                detail: "Het android-installatieprogramma wordt geopend. Voltooi de installatie op je toestel.",
              }
            : prev
        );
      } catch (error) {
        console.error("[UpdateModal] APK download failed:", error);
        Alert.alert(
          "APK download mislukt",
          error instanceof Error ? error.message : "Kon APK niet downloaden. Probeer later opnieuw.",
          [{ text: "OK" }]
        );
      } finally {
        setDownloadingApk(false);
      }
    }
  }, [result, otaReady, handleCheck]);

  // Auto-check on open (always recheck when modal becomes visible)
  useEffect(() => {
    if (visible) {
      void handleCheck();
    }
  }, [visible, handleCheck]);

  // Determine button label and action
  const getButtonConfig = () => {
    if (checking) {
      return { label: "Controleren...", disabled: true, icon: null };
    }

    if (downloadingApk) {
      return { label: "APK downloaden...", disabled: true, icon: null };
    }

    if (!result || result.kind === "none" || result.kind === "server" || result.kind === "error" || result.kind === "apk-unavailable") {
      return { label: "Controleer op updates", disabled: false, icon: "refresh-outline" };
    }

    if (result.kind === "ota") {
      if (otaReady) {
        return { label: "Herstart en installeer", disabled: false, icon: "restart" };
      }
      return { label: "Download OTA update", disabled: false, icon: "cloud-download-outline" };
    }

    if (result.kind === "apk") {
      return { label: "Download APK update", disabled: false, icon: "package-down" };
    }

    return { label: "Controleer opnieuw", disabled: false, icon: "refresh-outline" };
  };

  const buttonConfig = getButtonConfig();

  // Render different headline/detail based on state
  const getHeadlineAndDetail = () => {
    if (!result) {
      return {
        headline: "Updates controleren",
        detail: "We controleren op beschikbare updates voor je app.",
      };
    }

    return {
      headline: result.headline || "Updates controleren",
      detail: result.detail || "Geen detail beschikbaar.",
    };
  };

  const { headline, detail } = getHeadlineAndDetail();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.title}>App Updates</Text>
              <Text style={styles.subtitle}>Houd je app altijd up-to-date</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
          >
            {/* Current Version Info */}
            <View style={styles.section}>
              <Text style={styles.label}>Je huidige versie</Text>
              <VersionInfoBlock currentVersion={currentVersion} />
            </View>

            {/* State Card */}
            <View style={styles.section}>
              <UpdateStateCard
                state={displayState}
                headline={headline}
                detail={detail}
                progress={downloadingApk ? downloadProgress : undefined}
              />
            </View>

            {/* Download Progress (if downloading) */}
            {downloadingApk ? (
              <View style={styles.section}>
                <DownloadProgressBar
                  progress={downloadProgress}
                  status="downloading"
                />
              </View>
            ) : null}

            {/* Changelog */}
            <View style={styles.section}>
              <Text style={styles.label}>Changelog</Text>
              <View style={styles.changelogContainer}>
                {CHANGELOG.map((entry) => (
                  <ChangelogEntry
                    key={entry.version}
                    entry={{
                      ...entry,
                      isCurrent: entry.version === currentVersion,
                    }}
                  />
                ))}
              </View>
            </View>

            {/* Spacer */}
            <View style={styles.spacer} />
          </ScrollView>

          {/* Footer with Primary Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                buttonConfig.disabled && styles.primaryBtnDisabled,
              ]}
              disabled={buttonConfig.disabled}
              onPress={handlePrimaryAction}
              activeOpacity={0.8}
            >
              {checking || downloadingApk ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : buttonConfig.icon ? (
                <MaterialCommunityIcons
                  name={buttonConfig.icon as any}
                  size={16}
                  color={COLORS.background}
                />
              ) : null}
              <Text style={styles.primaryBtnText}>{buttonConfig.label}</Text>
            </TouchableOpacity>

            {/* Secondary Button: Close */}
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>Sluit</Text>
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
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modal: {
    maxHeight: "88%",
    borderRadius: 28,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    flexDirection: "column",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  title: {
    color: COLORS.text,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 22,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 18,
  },
  section: {
    marginTop: 16,
  },
  label: {
    color: COLORS.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  detailsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  detailChip: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  changelogContainer: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 14,
  },
  spacer: {
    height: 20,
  },
  footer: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  primaryBtn: {
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: COLORS.background,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 15,
  },
  secondaryBtn: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  secondaryBtnText: {
    color: COLORS.text,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
