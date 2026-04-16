import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPDATE_MANIFEST_PATH = join(__dirname, "update-manifest.json");
const DOWNLOADS_DIR = join(__dirname, "public", "downloads");

function safeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function findLatestHostedApk() {
  if (!existsSync(DOWNLOADS_DIR)) return null;

  const apks = readdirSync(DOWNLOADS_DIR)
    .filter((name) => /\.apk$/i.test(name))
    .map((name) => {
      const fullPath = join(DOWNLOADS_DIR, name);
      const stats = statSync(fullPath);
      return {
        name,
        fullPath,
        sizeBytes: Number(stats.size || 0),
        mtimeMs: Number(stats.mtimeMs || 0),
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return apks[0] || null;
}

function formatSizeLabel(sizeBytes) {
  const bytes = Number(sizeBytes || 0);
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sha256File(filePath) {
  try {
    const file = readFileSync(filePath);
    return crypto.createHash("sha256").update(file).digest("hex");
  } catch {
    return null;
  }
}

function isApkFileUrl(url) {
  const value = safeString(url).toLowerCase();
  if (!value) return false;
  return /\.apk($|\?)/i.test(value) || /\/downloads\/apk\//i.test(value);
}

function buildAbsoluteUrl(req, target) {
  if (!target) return null;
  if (/^https?:\/\//i.test(target)) return target;

  const forwardedProto = safeString(req.headers["x-forwarded-proto"]).split(",")[0].trim();
  const forwardedHost = safeString(req.headers["x-forwarded-host"] || req.get("host"));
  const isCloudHost = forwardedHost.includes("onrender.com");
  const protocol = forwardedProto || (isCloudHost ? "https" : req.protocol);
  const path = target.startsWith("/") ? target : `/${target}`;
  return `${protocol}://${forwardedHost}${path}`;
}

export function loadUpdateManifest() {
  const data = readJsonFile(UPDATE_MANIFEST_PATH) || {};

  return {
    schemaVersion: Number(data.schemaVersion || 2),
    native: {
      version: safeString(data.native?.version, "0.0.0"),
      versionCode: safeNumber(data.native?.versionCode, 0),
      buildId: safeString(data.native?.buildId) || null,
      required: safeBoolean(data.native?.required, false),
      releasedAt: safeString(data.native?.releasedAt) || null,
      notes: safeArray(data.native?.notes),
      apk: {
        provider: safeString(data.native?.apk?.provider, "unconfigured"),
        url: safeString(data.native?.apk?.downloadUrl || data.native?.apk?.url) || null,
        fileName: safeString(data.native?.apk?.fileName) || null,
        fileSizeBytes: safeNumber(data.native?.apk?.fileSizeBytes, 0),
        checksumSha256: safeString(data.native?.apk?.checksumSha256) || null,
        signature: safeString(data.native?.apk?.signature) || null,
        fallbackMessage: safeString(
          data.native?.apk?.fallbackMessage,
          "Nieuwe native build gedetecteerd, maar de APK is nog niet gepubliceerd.",
        ),
      },
    },
    ota: {
      channel: safeString(data.ota?.channel, "production"),
      runtimeVersion: safeString(data.ota?.runtimeVersion, "unknown"),
      strategy: safeString(data.ota?.strategy, "expo-updates"),
      releasedAt: safeString(data.ota?.releasedAt) || null,
    },
    server: {
      version: safeString(data.server?.version, "0.0.0"),
      releasedAt: safeString(data.server?.releasedAt) || null,
      requiresAppUpdate: safeBoolean(data.server?.requiresAppUpdate, false),
      message: safeString(
        data.server?.message,
        "Server deploys are independent from OTA bundles and APK releases.",
      ),
    },
  };
}

function resolveNativeApkTargets(req, manifest) {
  const hostedApk = findLatestHostedApk();
  const configuredUrl = manifest.native.apk.url;
  const configuredIsValidFileUrl = configuredUrl ? isApkFileUrl(configuredUrl) : false;

  const hostedDownloadUrl = hostedApk
    ? buildAbsoluteUrl(req, `/downloads/apk/${encodeURIComponent(hostedApk.name)}`)
    : null;

  const downloadUrl = configuredIsValidFileUrl ? configuredUrl : hostedDownloadUrl;
  const source = configuredIsValidFileUrl ? "configured" : hostedApk ? "hosted" : "missing";
  const fileName = manifest.native.apk.fileName || hostedApk?.name || null;
  const fileSizeBytes = manifest.native.apk.fileSizeBytes > 0
    ? manifest.native.apk.fileSizeBytes
    : Number(hostedApk?.sizeBytes || 0);
  const checksumSha256 = manifest.native.apk.checksumSha256 || (hostedApk ? sha256File(hostedApk.fullPath) : null);
  const available = Boolean(downloadUrl && fileSizeBytes > 0);

  let unavailableReason = null;
  if (configuredUrl && !configuredIsValidFileUrl) {
    unavailableReason = "Configured APK URL is not a file endpoint.";
  } else if (!downloadUrl) {
    unavailableReason = "No APK file endpoint configured or hosted.";
  } else if (fileSizeBytes <= 0) {
    unavailableReason = "APK file size is invalid.";
  }

  return {
    available,
    provider: manifest.native.apk.provider,
    source,
    fileName,
    contentType: "application/vnd.android.package-archive",
    fileSizeBytes,
    fileSizeLabel: formatSizeLabel(fileSizeBytes),
    versionName: manifest.native.version,
    versionCode: manifest.native.versionCode,
    buildId: manifest.native.buildId,
    checksumSha256,
    signature: manifest.native.apk.signature,
    downloadUrl: available ? buildAbsoluteUrl(req, downloadUrl) : null,
    validatedAt: new Date().toISOString(),
    unavailableReason,
    fallbackMessage: manifest.native.apk.fallbackMessage,
  };
}

export function buildUpdateManifestResponse(req) {
  const manifest = loadUpdateManifest();
  const apk = resolveNativeApkTargets(req, manifest);

  return {
    schemaVersion: manifest.schemaVersion,
    endpoints: {
      manifestUrl: buildAbsoluteUrl(req, "/api/app-updates/manifest"),
      otaUrl: buildAbsoluteUrl(req, "/api/app-updates/ota"),
      nativeUrl: buildAbsoluteUrl(req, "/api/app-updates/native"),
      apkDownloadUrl: apk.available ? apk.downloadUrl : null,
    },
    native: {
      version: manifest.native.version,
      versionCode: manifest.native.versionCode,
      buildId: manifest.native.buildId,
      required: manifest.native.required,
      releasedAt: manifest.native.releasedAt,
      notes: manifest.native.notes,
      apk,
    },
    ota: {
      channel: manifest.ota.channel,
      runtimeVersion: manifest.ota.runtimeVersion,
      strategy: manifest.ota.strategy,
      releasedAt: manifest.ota.releasedAt,
    },
    server: {
      version: manifest.server.version,
      releasedAt: manifest.server.releasedAt,
      requiresAppUpdate: manifest.server.requiresAppUpdate,
      message: manifest.server.message,
    },
  };
}

export function buildOtaMetadataResponse(req) {
  const response = buildUpdateManifestResponse(req);
  return {
    schemaVersion: response.schemaVersion,
    endpoint: response.endpoints.otaUrl,
    ota: response.ota,
  };
}

export function buildNativeMetadataResponse(req) {
  const response = buildUpdateManifestResponse(req);
  return {
    schemaVersion: response.schemaVersion,
    endpoint: response.endpoints.nativeUrl,
    native: response.native,
  };
}