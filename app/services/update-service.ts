import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Linking, Platform } from "react-native";

import { apiRequestJson } from "@/lib/query-client";
import {
  getDownloadUrl,
  type ApkValidationResult,
  type LatestApkMetadata,
  validateApkAvailability,
} from "@/services/native-apk-flow";
import {
  resolveUpdateDecision,
  type UpdateCheckResult,
  type UpdateManifest,
} from "@/services/update-decision";

const LAST_SEEN_SERVER_VERSION_KEY = "nexora_last_seen_server_version_v2";
const OTA_CHECK_TIMEOUT_MS = 8_000;
const OTA_FETCH_TIMEOUT_MS = 30_000;

function getUpdatesModule(): any | null {
  try {
    return require("expo-updates");
  } catch {
    return null;
  }
}

function getApplication(): typeof import("expo-application") | null {
  try {
    return require("expo-application") as typeof import("expo-application");
  } catch {
    return null;
  }
}

function getIntentLauncher(): typeof import("expo-intent-launcher") | null {
  try {
    return require("expo-intent-launcher") as typeof import("expo-intent-launcher");
  } catch {
    return null;
  }
}

export { getDownloadUrl, validateApkAvailability };
export type { ApkValidationResult, LatestApkMetadata };

type OtaCheckState = {
  available: boolean;
  enabled: boolean;
  errorMessage: string | null;
};

type CheckOptions = {
  currentVersion?: string;
};

function safeString(value: unknown, fallback = ""): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function safeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => safeString(item)).filter(Boolean)
    : [];
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
}

export function compareVersions(left: string, right: string): number {
  const leftParts = safeString(left, "0.0.0")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^0-9]/g, ""), 10) || 0);
  const rightParts = safeString(right, "0.0.0")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^0-9]/g, ""), 10) || 0);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function normalizeManifest(raw: unknown): UpdateManifest {
  const value = (raw || {}) as Record<string, any>;
  return {
    schemaVersion: Number(value.schemaVersion || 2),
    endpoints: {
      manifestUrl: safeString(value.endpoints?.manifestUrl) || null,
      otaUrl: safeString(value.endpoints?.otaUrl) || null,
      nativeUrl: safeString(value.endpoints?.nativeUrl) || null,
      apkDownloadUrl: safeString(value.endpoints?.apkDownloadUrl) || null,
    },
    native: {
      version: safeString(value.native?.version, "0.0.0"),
      versionCode: safeNumber(value.native?.versionCode, 0),
      buildId: safeString(value.native?.buildId) || null,
      required: safeBoolean(value.native?.required, false),
      releasedAt: safeString(value.native?.releasedAt) || null,
      notes: safeArray(value.native?.notes),
      apk: {
        available: safeBoolean(value.native?.apk?.available, false),
        provider: safeString(value.native?.apk?.provider, "unconfigured"),
        source: safeString(value.native?.apk?.source, "unknown"),
        fileName: safeString(value.native?.apk?.fileName) || null,
        contentType: safeString(value.native?.apk?.contentType) || null,
        fileSizeBytes: safeNumber(value.native?.apk?.fileSizeBytes, 0),
        fileSizeLabel: safeString(value.native?.apk?.fileSizeLabel) || null,
        versionName: safeString(value.native?.apk?.versionName) || null,
        versionCode: safeNumber(value.native?.apk?.versionCode, 0),
        buildId: safeString(value.native?.apk?.buildId) || null,
        checksumSha256: safeString(value.native?.apk?.checksumSha256) || null,
        signature: safeString(value.native?.apk?.signature) || null,
        downloadUrl: safeString(value.native?.apk?.downloadUrl || value.native?.apk?.url) || null,
        validatedAt: safeString(value.native?.apk?.validatedAt) || null,
        unavailableReason: safeString(value.native?.apk?.unavailableReason) || null,
        fallbackMessage: safeString(
          value.native?.apk?.fallbackMessage,
          "Native update detected, but no APK download is published yet.",
        ),
      },
    },
    ota: {
      channel: safeString(value.ota?.channel, "production"),
      runtimeVersion: safeString(value.ota?.runtimeVersion, "unknown"),
      strategy: safeString(value.ota?.strategy, "expo-updates"),
      releasedAt: safeString(value.ota?.releasedAt) || null,
    },
    server: {
      version: safeString(value.server?.version, "0.0.0"),
      releasedAt: safeString(value.server?.releasedAt) || null,
      requiresAppUpdate: safeBoolean(value.server?.requiresAppUpdate, false),
      message: safeString(
        value.server?.message,
        "Server deploys are independent from OTA bundles and APK releases.",
      ),
    },
  };
}

async function fetchUpdateManifest(): Promise<UpdateManifest> {
  const response = await apiRequestJson<unknown>("/api/app-updates/manifest", {
    dedupe: false,
  });
  return normalizeManifest(response);
}

async function checkOtaAvailability(): Promise<OtaCheckState> {
  const Updates = getUpdatesModule();
  if (__DEV__ || !Updates?.isEnabled) {
    return {
      available: false,
      enabled: Boolean(Updates?.isEnabled),
      errorMessage: null,
    };
  }

  try {
    const response: any = await withTimeout(Updates.checkForUpdateAsync(), OTA_CHECK_TIMEOUT_MS);
    return {
      available: Boolean(response?.isAvailable),
      enabled: true,
      errorMessage: null,
    };
  } catch (error) {
    return {
      available: false,
      enabled: true,
      errorMessage: error instanceof Error ? error.message : "OTA check failed",
    };
  }
}

async function detectServerChange(serverVersion: string): Promise<boolean> {
  const normalized = safeString(serverVersion);
  if (!normalized) return false;

  const previous = await AsyncStorage.getItem(LAST_SEEN_SERVER_VERSION_KEY);
  await AsyncStorage.setItem(LAST_SEEN_SERVER_VERSION_KEY, normalized);
  return Boolean(previous && previous !== normalized);
}

export async function checkForAppUpdates(options?: CheckOptions): Promise<UpdateCheckResult> {
  const Updates = getUpdatesModule();
  const currentVersion = safeString(options?.currentVersion, safeString(Constants.expoConfig?.version, "0.0.0"));
  const currentNativeVersion = safeString(getApplication()?.nativeApplicationVersion, currentVersion || "0.0.0");
  const currentRuntimeVersion = safeString(Updates?.runtimeVersion, "unknown");

  const [manifestResult, otaState] = await Promise.allSettled([
    fetchUpdateManifest(),
    checkOtaAvailability(),
  ]);

  const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : null;
  const ota = otaState.status === "fulfilled"
    ? otaState.value
    : { available: false, enabled: false, errorMessage: otaState.reason instanceof Error ? otaState.reason.message : "OTA check failed" };

  const manifestError = manifestResult.status === "rejected"
    ? (manifestResult.reason instanceof Error ? manifestResult.reason.message : "Manifest fetch failed")
    : null;

  const serverChanged = manifest ? await detectServerChange(manifest.server.version) : false;
  let decision = resolveUpdateDecision({
    manifest,
    currentVersion,
    currentNativeVersion,
    currentRuntimeVersion,
    serverChanged,
    otaAvailable: ota.available,
    manifestError,
    compareVersions,
  });

  if (decision.kind === "apk") {
    const metadata = await getLatestApkMetadata().catch(() => null);
    if (!metadata) {
      decision = {
        ...decision,
        kind: "apk-unavailable",
        downloadUrl: null,
        headline: "Native update nog niet downloadbaar",
        detail: manifest?.native.apk.fallbackMessage || "Geen geldige APK metadata gevonden.",
      };
    } else {
      const validation = await validateApkAvailability(metadata).catch(() => ({
        ok: false,
        reason: "APK validatie mislukt.",
        statusCode: null,
        resolvedContentType: null,
        resolvedContentLength: null,
      } as ApkValidationResult));

      const downloadUrl = getDownloadUrl(metadata, validation);
      if (!downloadUrl) {
        decision = {
          ...decision,
          kind: "apk-unavailable",
          downloadUrl: null,
          headline: "Native update nog niet downloadbaar",
          detail: validation.reason || manifest?.native.apk.fallbackMessage || "APK endpoint is niet geldig.",
        };
      } else {
        decision = {
          ...decision,
          downloadUrl,
        };
      }
    }
  }

  return decision;
}

export async function getLatestApkMetadata(): Promise<LatestApkMetadata | null> {
  const manifest = await fetchUpdateManifest();
  const apk = manifest.native.apk;
  if (!apk.available || !apk.downloadUrl) return null;

  const versionCode = Number(apk.versionCode || manifest.native.versionCode || 0);
  const fileSizeBytes = Number(apk.fileSizeBytes || 0);
  const contentType = safeString(apk.contentType, "application/vnd.android.package-archive");
  const fileName = safeString(apk.fileName);
  if (!fileName || versionCode <= 0 || fileSizeBytes <= 0) return null;

  return {
    versionName: safeString(apk.versionName || manifest.native.version, "0.0.0"),
    versionCode,
    buildId: safeString(apk.buildId || manifest.native.buildId) || null,
    fileName,
    fileSizeBytes,
    fileSizeLabel: safeString(apk.fileSizeLabel) || `${Math.round(fileSizeBytes / (1024 * 1024))} MB`,
    contentType,
    downloadUrl: safeString(apk.downloadUrl),
    changelog: safeArray(manifest.native.notes),
    checksumSha256: safeString(apk.checksumSha256) || null,
    signature: safeString(apk.signature) || null,
  };
}

export async function showNativeUpdatePrompt(metadata: LatestApkMetadata): Promise<boolean> {
  return await new Promise((resolve) => {
    Alert.alert(
      `Nieuwe native build v${metadata.versionName}`,
      `Grootte: ${metadata.fileSizeLabel}\nBuild: ${metadata.versionCode}${metadata.checksumSha256 ? `\nSHA-256: ${metadata.checksumSha256.slice(0, 12)}...` : ""}`,
      [
        { text: "Niet nu", style: "cancel", onPress: () => resolve(false) },
        { text: "Download", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function fallbackIfMissing(reason?: string | null): never {
  throw new Error(reason || "Geen geldige native APK beschikbaar. Fallback naar OTA of geen update.");
}

export async function prepareOtaUpdate(): Promise<void> {
  const Updates = getUpdatesModule();
  if (__DEV__ || !Updates?.isEnabled) {
    throw new Error("OTA is not enabled in this build.");
  }

  const result: any = await withTimeout(Updates.fetchUpdateAsync(), OTA_FETCH_TIMEOUT_MS);
  if (!result || !result.isNew) {
    throw new Error("No OTA update payload could be fetched.");
  }
}

export async function reloadToLatestUpdate(): Promise<void> {
  const Updates = getUpdatesModule();
  if (__DEV__ || !Updates?.isEnabled) {
    throw new Error("OTA reload is not available in this build.");
  }

  await Updates.reloadAsync();
}

export async function startNativeUpdate(
  downloadUrl: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const normalizedUrl = safeString(downloadUrl).replace(/^http:\/\//i, "https://");
  if (!normalizedUrl) throw new Error("Missing APK download URL.");
  const isFileEndpoint = /\.apk($|\?)/i.test(normalizedUrl) || /\/downloads\/apk\//i.test(normalizedUrl);
  if (!isFileEndpoint) {
    throw new Error("Refusing to download native update from a non-file endpoint.");
  }

  if (Platform.OS !== "android") {
    await Linking.openURL(normalizedUrl);
    return;
  }

  const dir = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}updates/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);

  const fileUri = `${dir}nexora-update-${Date.now()}.apk`;
  const download = FileSystem.createDownloadResumable(
    normalizedUrl,
    fileUri,
    { headers: { Accept: "application/vnd.android.package-archive" } },
    (event) => {
      if (!onProgress || event.totalBytesExpectedToWrite <= 0) return;
      onProgress(event.totalBytesWritten / event.totalBytesExpectedToWrite);
    },
  );

  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error("Download failed before an APK file was created.");

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  const IntentLauncher = getIntentLauncher();
  if (!IntentLauncher) {
    throw new Error("IntentLauncher is not available in this build.");
  }
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
      data: contentUri,
      type: "application/vnd.android.package-archive",
      flags: 268435457,
    });
    return;
  } catch {}

  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: "application/vnd.android.package-archive",
      flags: 268435457,
    });
    return;
  } catch (error) {
    const packageId = getApplication()?.applicationId || Constants.expoConfig?.android?.package;
    if (packageId) {
      try {
        await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", {
          data: `package:${packageId}`,
        });
        Alert.alert(
          "Installatie geblokkeerd",
          "Sta installeren van onbekende apps toe voor Nexora en probeer daarna opnieuw.",
        );
        return;
      } catch {}
    }
    throw error instanceof Error ? error : new Error("Failed to launch the Android package installer.");
  }
}