/**
 * NEXORA PLAYBACK ENGINE
 *
 * Multi-fallback streaming engine supporting:
 * - HLS (.m3u8) streams
 * - MPEG-TS streams
 * - Adaptive bitrate streams
 * - VOD streams
 *
 * Playback flow:
 * 1. Primary player attempt
 * 2. Fallback HLS mode
 * 3. Secondary compatibility mode
 *
 * Stream validation: HEAD/GET check, 3 retries before failure
 */

import { Platform } from "react-native";
import { apiRequest } from "./query-client";

export interface StreamConfig {
  url: string;
  title?: string;
  type?: "live" | "movie" | "series" | "sport";
  contentId?: string;
  deviceId?: string;
  quality?: "auto" | "4k" | "fhd" | "hd" | "sd";
  subtitlesUrl?: string;
  startPosition?: number; // Resume position in seconds
}

export interface StreamValidation {
  valid: boolean;
  finalUrl: string;
  contentType?: string;
  status?: number;
  error?: string;
}

export interface SignedStream {
  signedUrl: string;
  token: string;
  expires: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Detect stream type from URL
 */
export function detectStreamType(url: string): "hls" | "mpegts" | "mp4" | "dash" | "unknown" {
  const u = url.toLowerCase();
  if (u.includes(".m3u8") || u.includes("m3u8")) return "hls";
  if (u.includes(".ts") || u.includes("mpegts")) return "mpegts";
  if (u.includes(".mp4") || u.includes(".mkv") || u.includes(".webm")) return "mp4";
  if (u.includes(".mpd")) return "dash";
  return "unknown";
}

/**
 * Validate a stream URL before playback
 */
export async function validateStream(url: string): Promise<StreamValidation> {
  try {
    const res = await apiRequest("POST", "/api/stream/validate", { url });
    const data = await res.json();
    return {
      valid: data.valid,
      finalUrl: data.finalUrl || url,
      contentType: data.contentType,
      status: data.status,
      error: data.error,
    };
  } catch (e: any) {
    return { valid: false, finalUrl: url, error: e.message };
  }
}

/**
 * Sign a stream URL with anti-piracy HMAC token
 */
export async function signStream(url: string, deviceId?: string): Promise<SignedStream> {
  try {
    const params = new URLSearchParams({ url });
    if (deviceId) params.set("deviceId", deviceId);
    const res = await apiRequest("GET", `/api/stream/sign?${params}`);
    return await res.json();
  } catch {
    return { signedUrl: url, token: "", expires: 0 };
  }
}

/**
 * Start a playback session (for concurrent stream limiting)
 */
export async function startSession(deviceId: string, streamUrl?: string): Promise<{
  ok: boolean;
  activeStreams?: number;
  maxStreams?: number;
  error?: string;
  sharingWarning?: string;
}> {
  try {
    const res = await apiRequest("POST", "/api/session/start", { deviceId, streamUrl });
    return await res.json();
  } catch {
    return { ok: true }; // Don't block playback on network errors
  }
}

/**
 * Send session heartbeat
 */
export async function sendHeartbeat(deviceId: string): Promise<void> {
  try {
    await apiRequest("POST", "/api/session/heartbeat", { deviceId });
  } catch {
    // Silent fail
  }
}

/**
 * Stop a playback session
 */
export async function stopSession(deviceId: string): Promise<void> {
  try {
    await apiRequest("POST", "/api/session/stop", { deviceId });
  } catch {
    // Silent fail
  }
}

/**
 * Attempt stream playback with retries and fallback modes
 */
export async function resolveStreamUrl(config: StreamConfig): Promise<{
  url: string;
  type: string;
  signed: SignedStream | null;
  validation: StreamValidation | null;
  error: string | null;
  fallbackUsed: boolean;
}> {
  const streamType = detectStreamType(config.url);

  // Try validation with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const validation = await validateStream(config.url);
    if (validation.valid) {
      const signed = await signStream(validation.finalUrl, config.deviceId);
      return {
        url: validation.finalUrl,
        type: streamType,
        signed,
        validation,
        error: null,
        fallbackUsed: false,
      };
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  // Fallback: try the URL directly without validation (many IPTV streams
  // respond with 401/403 to HEAD requests but work fine in the player)
  const signed = await signStream(config.url, config.deviceId);
  return {
    url: config.url,
    type: streamType,
    signed,
    validation: null,
    error: null,
    fallbackUsed: true,
  };
}

/**
 * Get playback headers for IPTV streams
 */
export function getPlaybackHeaders(): Record<string, string> {
  return {
    "User-Agent": Platform.select({
      ios: "VLC/3.0.20 LibVLC/3.0.20",
      android: "VLC/3.0.20 LibVLC/3.0.20",
      default: "Mozilla/5.0 (compatible; NexoraPlayer/2.0)",
    }) || "VLC/3.0.20 LibVLC/3.0.20",
    Accept: "*/*",
    Connection: "keep-alive",
  };
}

/**
 * Get error message for stream failures
 */
export function getStreamErrorMessage(error: string | null): string {
  if (!error) return "Stream temporarily unavailable";
  if (error.includes("timeout") || error.includes("abort")) return "Stream connection timed out. Please try again.";
  if (error.includes("403") || error.includes("401")) return "Stream access denied. Please check your subscription.";
  if (error.includes("404")) return "Stream not found. The channel may have moved.";
  if (error.includes("network") || error.includes("fetch")) return "Network error. Please check your connection.";
  return "Stream temporarily unavailable";
}
