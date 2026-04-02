export type UpdateDecisionKind = "none" | "ota" | "apk" | "server" | "apk-unavailable" | "error";

export type UpdateManifest = {
  schemaVersion: number;
  endpoints: {
    manifestUrl: string | null;
    otaUrl: string | null;
    nativeUrl: string | null;
    apkDownloadUrl: string | null;
  };
  native: {
    version: string;
    versionCode: number;
    buildId: string | null;
    required: boolean;
    releasedAt: string | null;
    notes: string[];
    apk: {
      available: boolean;
      provider: string;
      source: string;
      fileName: string | null;
      contentType: string | null;
      fileSizeBytes: number;
      fileSizeLabel: string | null;
      versionName: string | null;
      versionCode: number;
      buildId: string | null;
      checksumSha256: string | null;
      signature: string | null;
      downloadUrl: string | null;
      validatedAt: string | null;
      unavailableReason: string | null;
      fallbackMessage: string;
    };
  };
  ota: {
    channel: string;
    runtimeVersion: string;
    strategy: string;
    releasedAt: string | null;
  };
  server: {
    version: string;
    releasedAt: string | null;
    requiresAppUpdate: boolean;
    message: string;
  };
};

export type UpdateCheckResult = {
  kind: UpdateDecisionKind;
  headline: string;
  detail: string;
  manifest: UpdateManifest | null;
  currentVersion: string;
  currentNativeVersion: string;
  currentRuntimeVersion: string;
  downloadUrl: string | null;
  serverChanged: boolean;
  otaAvailable: boolean;
  errorMessage: string | null;
};

export type ResolveUpdateDecisionInput = {
  manifest: UpdateManifest | null;
  currentVersion: string;
  currentNativeVersion: string;
  currentRuntimeVersion: string;
  serverChanged: boolean;
  otaAvailable: boolean;
  manifestError: string | null;
  compareVersions: (left: string, right: string) => number;
};

function isValidApkMetadata(manifest: UpdateManifest | null): boolean {
  if (!manifest) return false;
  const apk = manifest.native.apk;
  const hasFileUrl = typeof apk.downloadUrl === "string" && apk.downloadUrl.length > 0 && (/\.apk($|\?)/i.test(apk.downloadUrl) || /\/downloads\/apk\//i.test(apk.downloadUrl));
  const hasGoodType = typeof apk.contentType === "string" && apk.contentType.toLowerCase().includes("android.package-archive");
  const hasSize = Number(apk.fileSizeBytes) > 1024 * 1024;
  const hasVersion = Number(apk.versionCode || manifest.native.versionCode) > 0;
  return Boolean(apk.available && hasFileUrl && hasGoodType && hasSize && hasVersion);
}

function buildBaseResult(
  kind: UpdateDecisionKind,
  headline: string,
  detail: string,
  manifest: UpdateManifest | null,
  currentVersion: string,
  currentNativeVersion: string,
  currentRuntimeVersion: string,
  downloadUrl: string | null,
  serverChanged: boolean,
  otaAvailable: boolean,
  errorMessage: string | null,
): UpdateCheckResult {
  return {
    kind,
    headline,
    detail,
    manifest,
    currentVersion,
    currentNativeVersion,
    currentRuntimeVersion,
    downloadUrl,
    serverChanged,
    otaAvailable,
    errorMessage,
  };
}

export function resolveUpdateDecision(input: ResolveUpdateDecisionInput): UpdateCheckResult {
  const {
    manifest,
    currentVersion,
    currentNativeVersion,
    currentRuntimeVersion,
    serverChanged,
    otaAvailable,
    manifestError,
    compareVersions,
  } = input;

  const nativeIsNewer = manifest ? compareVersions(manifest.native.version, currentNativeVersion) > 0 : false;
  const apkDownloadUrl = manifest?.native.apk.downloadUrl || manifest?.endpoints.apkDownloadUrl || null;
  const apkMetadataValid = isValidApkMetadata(manifest);

  if (nativeIsNewer) {
    if (apkMetadataValid && apkDownloadUrl) {
      return buildBaseResult(
        "apk",
        "Nieuwe native versie beschikbaar",
        `Versie ${manifest?.native.version || "onbekend"} vereist een nieuwe APK. OTA blijft apart van native releases.`,
        manifest,
        currentVersion,
        currentNativeVersion,
        currentRuntimeVersion,
        apkDownloadUrl,
        serverChanged,
        otaAvailable,
        null,
      );
    }

    if (otaAvailable) {
      return buildBaseResult(
        "ota",
        "OTA fallback beschikbaar",
        manifest?.native.apk.fallbackMessage || "De nieuwe APK is nog niet gepubliceerd, maar er is wel een OTA update voor je huidige runtime.",
        manifest,
        currentVersion,
        currentNativeVersion,
        currentRuntimeVersion,
        null,
        serverChanged,
        true,
        null,
      );
    }

    return buildBaseResult(
      "apk-unavailable",
      "Native update nog niet downloadbaar",
      manifest?.native.apk.unavailableReason || manifest?.native.apk.fallbackMessage || "De app ziet een nieuwe native versie, maar er is nog geen geldige APK download gepubliceerd.",
      manifest,
      currentVersion,
      currentNativeVersion,
      currentRuntimeVersion,
      null,
      serverChanged,
      otaAvailable,
      null,
    );
  }

  if (otaAvailable) {
    return buildBaseResult(
      "ota",
      "OTA update beschikbaar",
      `Er is een JS/UI update beschikbaar voor runtime ${manifest?.ota.runtimeVersion || currentRuntimeVersion}.`,
      manifest,
      currentVersion,
      currentNativeVersion,
      currentRuntimeVersion,
      null,
      serverChanged,
      true,
      null,
    );
  }

  if (serverChanged) {
    return buildBaseResult(
      "server",
      "Backend bijgewerkt",
      manifest?.server.message || "De backend is vernieuwd. Er is geen app-update nodig.",
      manifest,
      currentVersion,
      currentNativeVersion,
      currentRuntimeVersion,
      null,
      true,
      false,
      null,
    );
  }

  if (manifestError) {
    const offlineMessage = /network|fetch|timeout|abort|bereikbaar/i.test(manifestError)
      ? "Updatecheck mislukt door een netwerkprobleem. OTA en release-manifest konden niet betrouwbaar worden gecontroleerd."
      : "Updatecheck mislukt. Probeer opnieuw wanneer de verbinding stabiel is.";
    return buildBaseResult(
      "error",
      "Updatecheck mislukt",
      offlineMessage,
      manifest,
      currentVersion,
      currentNativeVersion,
      currentRuntimeVersion,
      null,
      false,
      otaAvailable,
      manifestError,
    );
  }

  return buildBaseResult(
    "none",
    "Geen app-update nodig",
    "Geen OTA update gevonden en geen nieuwere native build vereist.",
    manifest,
    currentVersion,
    currentNativeVersion,
    currentRuntimeVersion,
    null,
    false,
    false,
    null,
  );
}