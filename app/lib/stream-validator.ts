/**
 * Stream server validator — probes servers before presenting them to the user.
 *
 * Why black screens happen:
 * 1. Server returns HTML (ad page / captcha / Cloudflare challenge) instead of video
 * 2. Server redirects to App Store / Play Store / ad network
 * 3. Server returns 403/404/5xx
 * 4. Server is too slow (timeout)
 * 5. HLS manifest is malformed or DRM-protected without proper key exchange
 *
 * This module performs lightweight HEAD/GET probes to detect these issues
 * BEFORE the player tries to load the URL.
 */

import { streamLog } from "./stream-logger";

export type ProbeResult = {
  url: string;
  ok: boolean;
  reason:
    | "valid"
    | "html-page"
    | "redirect"
    | "http-error"
    | "timeout"
    | "network-error"
    | "blocked-domain";
  responseTimeMs: number;
  contentType?: string;
  statusCode?: number;
  finalUrl?: string;
};

/** Domains that indicate an ad redirect (not real video content) */
const REDIRECT_DOMAINS = [
  "apps.apple.com",
  "play.google.com",
  "itunes.apple.com",
  "market.android.com",
  "facebook.com/ads",
  "tiktok.com/ads",
  "doubleclick.net",
  "googlesyndication.com",
  "casino",
  "betting",
  "1xbet",
  "bet365",
  "melbet",
  "mostbet",
];

/** Content types that indicate a playable stream */
const VIDEO_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl", // HLS
  "application/x-mpegurl", // HLS
  "video/mp2t", // HLS segments
  "video/mp4",
  "video/webm",
  "video/ogg",
  "application/octet-stream", // Some servers serve HLS/MP4 as binary
  "binary/octet-stream",
];

/** Content types that indicate an HTML page (not video) */
const HTML_CONTENT_TYPES = ["text/html", "application/xhtml"];

function isRedirectDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return REDIRECT_DOMAINS.some((d) => lower.includes(d));
}

/**
 * Probe a direct stream URL (HLS/MP4) to check if it returns video content.
 * Uses a HEAD request with a short timeout.
 */
export async function probeDirectStream(
  url: string,
  timeoutMs = 6000,
): Promise<ProbeResult> {
  const start = Date.now();
  const tag = "probe";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    });

    clearTimeout(timer);
    const elapsed = Date.now() - start;
    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();
    const finalUrl = response.url || url;

    // Check for redirect to ad/store page
    if (isRedirectDomain(finalUrl)) {
      streamLog("warn", tag, `Redirect to blocked domain`, { url, finalUrl });
      return {
        url,
        ok: false,
        reason: "redirect",
        responseTimeMs: elapsed,
        finalUrl,
        statusCode: response.status,
      };
    }

    // Check HTTP status
    if (!response.ok) {
      streamLog("warn", tag, `HTTP ${response.status}`, { url });
      return {
        url,
        ok: false,
        reason: "http-error",
        responseTimeMs: elapsed,
        statusCode: response.status,
        contentType,
      };
    }

    // Check if it's an HTML page (ad page, captcha, etc.)
    if (HTML_CONTENT_TYPES.some((t) => contentType.includes(t))) {
      streamLog("warn", tag, `HTML response (not video)`, { url, contentType });
      return {
        url,
        ok: false,
        reason: "html-page",
        responseTimeMs: elapsed,
        contentType,
        statusCode: response.status,
      };
    }

    // Valid — either explicit video content-type or unknown (could be streaming)
    const isExplicitVideo = VIDEO_CONTENT_TYPES.some((t) =>
      contentType.includes(t),
    );
    streamLog(
      "info",
      tag,
      `OK${isExplicitVideo ? " (video)" : " (unknown type)"}`,
      { url, contentType, elapsed },
    );

    return {
      url,
      ok: true,
      reason: "valid",
      responseTimeMs: elapsed,
      contentType,
      statusCode: response.status,
    };
  } catch (err: any) {
    const elapsed = Date.now() - start;
    if (err?.name === "AbortError") {
      streamLog("warn", tag, `Timeout after ${timeoutMs}ms`, { url });
      return { url, ok: false, reason: "timeout", responseTimeMs: elapsed };
    }
    streamLog("error", tag, `Network error: ${err?.message}`, { url });
    return { url, ok: false, reason: "network-error", responseTimeMs: elapsed };
  }
}

/**
 * Probe an embed URL (iframe-based) — uses a lightweight GET with range to detect
 * if the server returns a real page vs a redirect/ad.
 */
export async function probeEmbedUrl(
  url: string,
  timeoutMs = 8000,
): Promise<ProbeResult> {
  const start = Date.now();
  const tag = "probe-embed";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        Range: "bytes=0-2048",
      },
    });

    clearTimeout(timer);
    const elapsed = Date.now() - start;
    const finalUrl = response.url || url;

    if (isRedirectDomain(finalUrl)) {
      streamLog("warn", tag, `Redirect to blocked domain`, { url, finalUrl });
      return {
        url,
        ok: false,
        reason: "redirect",
        responseTimeMs: elapsed,
        finalUrl,
        statusCode: response.status,
      };
    }

    if (response.status >= 400) {
      streamLog("warn", tag, `HTTP ${response.status}`, { url });
      return {
        url,
        ok: false,
        reason: "http-error",
        responseTimeMs: elapsed,
        statusCode: response.status,
      };
    }

    // Read a small chunk of the body to detect ad content
    const body = await response.text().catch(() => "");
    const bodyLower = body.toLowerCase();

    // Check for common "not found" pages from embed providers
    const notFoundPatterns = [
      "not found",
      "no sources",
      "no links found",
      "content not available",
      "video not found",
      "media not found",
      "no playable",
    ];
    if (
      body.length < 3000 &&
      notFoundPatterns.some((p) => bodyLower.includes(p))
    ) {
      streamLog("warn", tag, `Content not found page`, { url });
      return {
        url,
        ok: false,
        reason: "html-page",
        responseTimeMs: elapsed,
        statusCode: response.status,
      };
    }

    // Check for casino/gambling ad pages
    if (
      /casino|1xbet|bet365|melbet|mostbet|gambling|betting|poker|roulette|jackpot/i.test(
        bodyLower,
      )
    ) {
      const videoPresent =
        bodyLower.includes("<video") ||
        bodyLower.includes("player") ||
        bodyLower.includes(".m3u8");
      if (!videoPresent) {
        streamLog("warn", tag, `Ad/casino page detected`, { url });
        return {
          url,
          ok: false,
          reason: "blocked-domain",
          responseTimeMs: elapsed,
          statusCode: response.status,
        };
      }
    }

    streamLog("info", tag, `Embed OK`, { url, elapsed, bodyLen: body.length });
    return {
      url,
      ok: true,
      reason: "valid",
      responseTimeMs: elapsed,
      statusCode: response.status,
    };
  } catch (err: any) {
    const elapsed = Date.now() - start;
    if (err?.name === "AbortError") {
      streamLog("warn", tag, `Timeout after ${timeoutMs}ms`, { url });
      return { url, ok: false, reason: "timeout", responseTimeMs: elapsed };
    }
    streamLog("error", tag, `Network error: ${err?.message}`, { url });
    return { url, ok: false, reason: "network-error", responseTimeMs: elapsed };
  }
}

export interface ValidatedSource {
  url: string;
  type?: "stream" | "trailer" | "provider" | "direct" | "embed";
  id?: string;
  label?: string;
  quality?: string;
  providerName?: string;
  probe: ProbeResult;
}

/**
 * Validate a batch of sources concurrently with a concurrency limit.
 * Returns sources sorted by: valid first, then by response time (fastest first).
 * Stops probing once we have `minValid` working sources.
 */
export async function validateSources(
  sources: {
    url: string;
    type?: "stream" | "trailer" | "provider" | "direct" | "embed";
    id?: string;
    label?: string;
    quality?: string;
    providerName?: string;
  }[],
  options: { concurrency?: number; minValid?: number; timeoutMs?: number } = {},
): Promise<ValidatedSource[]> {
  const { concurrency = 4, minValid = 3, timeoutMs = 8000 } = options;
  const results: ValidatedSource[] = [];
  let validCount = 0;
  let index = 0;

  const tag = "validate";
  streamLog(
    "info",
    tag,
    `Validating ${sources.length} sources (need ${minValid} valid, concurrency=${concurrency})`,
  );

  async function processNext(): Promise<void> {
    while (index < sources.length && validCount < minValid + 2) {
      const current = sources[index++];
      if (!current) break;

      const isDirectStream =
        current.url.includes(".m3u8") || current.url.includes(".mp4");
      const probe = isDirectStream
        ? await probeDirectStream(current.url, timeoutMs)
        : await probeEmbedUrl(current.url, timeoutMs);

      results.push({ ...current, probe });
      if (probe.ok) validCount++;

      streamLog(
        "debug",
        tag,
        `${current.label || current.url}: ${probe.ok ? "OK" : probe.reason} (${probe.responseTimeMs}ms)`,
        {
          url: current.url,
          provider: current.providerName,
        },
      );
    }
  }

  // Run concurrent validation workers
  const workers = Array.from(
    { length: Math.min(concurrency, sources.length) },
    () => processNext(),
  );
  await Promise.all(workers);

  // Sort: valid first, then by response time
  results.sort((a, b) => {
    if (a.probe.ok && !b.probe.ok) return -1;
    if (!a.probe.ok && b.probe.ok) return 1;
    return a.probe.responseTimeMs - b.probe.responseTimeMs;
  });

  const validResults = results.filter((r) => r.probe.ok);
  streamLog(
    "info",
    tag,
    `Validation done: ${validResults.length}/${results.length} valid`,
    {
      valid: validResults.map((r) => r.label || r.url),
      invalid: results
        .filter((r) => !r.probe.ok)
        .map((r) => `${r.label || r.url}:${r.probe.reason}`),
    },
  );

  return results;
}
