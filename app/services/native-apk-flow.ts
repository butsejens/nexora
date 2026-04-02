export type LatestApkMetadata = {
  versionName: string;
  versionCode: number;
  buildId: string | null;
  fileName: string;
  fileSizeBytes: number;
  fileSizeLabel: string;
  contentType: string;
  downloadUrl: string;
  changelog: string[];
  checksumSha256: string | null;
  signature: string | null;
};

export type ApkValidationResult = {
  ok: boolean;
  reason: string | null;
  statusCode: number | null;
  resolvedContentType: string | null;
  resolvedContentLength: number | null;
};

function safeString(value: unknown, fallback = ""): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function validateApkAvailability(metadata: LatestApkMetadata): Promise<ApkValidationResult> {
  const downloadUrl = safeString(metadata.downloadUrl);
  const validUrl = /\.apk($|\?)/i.test(downloadUrl) || /\/downloads\/apk\//i.test(downloadUrl);
  if (!validUrl) {
    return {
      ok: false,
      reason: "Download URL is not an APK file endpoint.",
      statusCode: null,
      resolvedContentType: null,
      resolvedContentLength: null,
    };
  }

  if (metadata.fileSizeBytes < 5 * 1024 * 1024) {
    return {
      ok: false,
      reason: "APK file size is too small to be valid.",
      statusCode: null,
      resolvedContentType: null,
      resolvedContentLength: metadata.fileSizeBytes,
    };
  }

  if (metadata.fileSizeBytes > 700 * 1024 * 1024) {
    return {
      ok: false,
      reason: "APK file is too large for in-app download.",
      statusCode: null,
      resolvedContentType: null,
      resolvedContentLength: metadata.fileSizeBytes,
    };
  }

  const headResponse = await fetch(downloadUrl, {
    method: "HEAD",
    headers: { Accept: "application/vnd.android.package-archive" },
  }).catch(() => null);

  if (!headResponse || !headResponse.ok) {
    return {
      ok: false,
      reason: "APK endpoint is unreachable.",
      statusCode: headResponse ? headResponse.status : null,
      resolvedContentType: null,
      resolvedContentLength: null,
    };
  }

  const resolvedContentType = safeString(headResponse.headers.get("content-type")).toLowerCase() || null;
  const resolvedContentLength = safeNumber(headResponse.headers.get("content-length"), 0);
  const contentTypeOk = Boolean(resolvedContentType && resolvedContentType.includes("android.package-archive"));
  const contentLengthOk = resolvedContentLength <= 0 || Math.abs(resolvedContentLength - metadata.fileSizeBytes) < 2048;

  if (!contentTypeOk) {
    return {
      ok: false,
      reason: "APK endpoint returned an invalid content type.",
      statusCode: headResponse.status,
      resolvedContentType,
      resolvedContentLength,
    };
  }

  if (!contentLengthOk) {
    return {
      ok: false,
      reason: "APK endpoint returned a mismatched content length.",
      statusCode: headResponse.status,
      resolvedContentType,
      resolvedContentLength,
    };
  }

  return {
    ok: true,
    reason: null,
    statusCode: headResponse.status,
    resolvedContentType,
    resolvedContentLength,
  };
}

export function getDownloadUrl(metadata: LatestApkMetadata, validation: ApkValidationResult): string | null {
  if (!validation.ok) return null;
  const normalized = safeString(metadata.downloadUrl).replace(/^http:\/\//i, "https://");
  if (!normalized) return null;
  if (!/\.apk($|\?)/i.test(normalized) && !/\/downloads\/apk\//i.test(normalized)) return null;
  return normalized;
}
