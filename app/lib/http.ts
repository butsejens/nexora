/**
 * CineLog — HTTP client for the CineLog API.
 *
 * Handles base-URL discovery (env override, inferred Metro host in dev,
 * same-origin on web), per-request timeouts, automatic failover to the next
 * base URL and in-flight de-duplication of identical GETs.
 */

import { fetch } from "expo/fetch";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { ENV } from "@/constants/env";

/** Port the CineLog API listens on locally (see `server/index.js`). */
const LOCAL_API_PORT = 8080;

let lastWorkingBase = "";
const inflight = new Map<string, Promise<unknown>>();

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function normalizeBase(base: string): string {
  return String(base || "")
    .trim()
    .replace(/\/+$/, "");
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeBase(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function isLoopback(base: string): boolean {
  try {
    const url = new URL(base);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      // Android emulator alias for the host machine — unreachable from devices.
      url.hostname === "10.0.2.2"
    );
  } catch {
    return false;
  }
}

/** Host Metro is served from, used to reach a dev API on the same machine. */
function inferredDevHost(): string {
  try {
    const raw =
      Constants?.expoConfig?.hostUri ||
      (
        Constants as {
          manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
        }
      )?.manifest2?.extra?.expoClient?.hostUri ||
      "";
    return String(raw).split(":")[0] || "";
  } catch {
    return "";
  }
}

export function getApiBaseCandidates(): string[] {
  const explicit = normalizeBase(ENV.apiBase);
  const fallbacks = ENV.apiBases.split(",").map(normalizeBase).filter(Boolean);

  if (Platform.OS === "web") {
    const candidates: string[] = [lastWorkingBase, explicit, ...fallbacks];
    if (typeof window !== "undefined" && window.location?.origin) {
      // When Expo Web runs on its own port, same-origin points at the bundler
      // rather than the API, so offer the local API port as a candidate too.
      try {
        const url = new URL(window.location.origin);
        const isLocal =
          url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (isLocal && url.port !== String(LOCAL_API_PORT)) {
          candidates.push(`${url.protocol}//${url.hostname}:${LOCAL_API_PORT}`);
        }
      } catch {
        // Non-standard origin; skip the local hint.
      }
      candidates.push(window.location.origin);
    }
    return unique(candidates);
  }

  if (!__DEV__) {
    // Release builds have no Metro host and no business calling localhost.
    return unique([
      lastWorkingBase,
      ...[explicit, ...fallbacks].filter((base) => !isLoopback(base)),
    ]);
  }

  const host = inferredDevHost();
  const inferred = host ? `http://${host}:${LOCAL_API_PORT}` : "";
  return unique([
    lastWorkingBase,
    inferred,
    `http://localhost:${LOCAL_API_PORT}`,
    `http://10.0.2.2:${LOCAL_API_PORT}`,
    explicit,
    ...fallbacks,
  ]);
}

/**
 * Fire-and-forget backend warmup for cold-starting hosted APIs (Render, etc.).
 * This runs at app bootstrap so the first content query waits less often.
 */
export async function warmupApi(): Promise<void> {
  const bases = getApiBaseCandidates();
  for (const base of bases) {
    if (!base) continue;
    try {
      const res = await fetchWithTimeout(`${base}/health`, { method: "GET" });
      if (res.ok) {
        lastWorkingBase = base;
        return;
      }
    } catch {
      // Best-effort warmup only; failures are handled by normal request flow.
    }
  }
}

function timeoutFor(url: string): number {
  // Cold starts on free hosting tiers can take a while; local servers fail fast.
  if (isLoopback(url)) return 10_000;
  return __DEV__ ? 20_000 : 10_000;
}

interface FetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

async function fetchWithTimeout(url: string, init: FetchOptions) {
  const timeoutMs = timeoutFor(url);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return (await Promise.race([
      fetch(url, init),
      timeoutPromise,
    ])) as Response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A response we should retry against the next base URL instead of surfacing. */
function shouldFailover(res: Response): boolean {
  if (res.status === 404 || res.status >= 500) return true;
  // A misrouted API call can return the web app's HTML shell with HTTP 200.
  const contentType = String(res.headers.get("content-type") || "");
  return contentType.toLowerCase().includes("text/html");
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip in-flight de-duplication (defaults to de-duping GETs). */
  dedupe?: boolean;
  signal?: AbortSignal;
}

async function performRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const bases = getApiBaseCandidates();
  if (bases.length === 0) {
    throw new Error(
      "CineLog API base URL is not configured. Set EXPO_PUBLIC_API_BASE.",
    );
  }

  let lastError: unknown;
  for (const base of bases) {
    const url = `${base}${path}`;
    try {
      const res = await fetchWithTimeout(url, {
        method,
        ...(options.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(options.body),
            }
          : null),
      });

      if (shouldFailover(res)) {
        lastError = new HttpError(res.status, `${res.status} from ${base}`);
        continue;
      }
      if (!res.ok) {
        throw new HttpError(
          res.status,
          `${res.status} ${res.statusText}`.trim(),
        );
      }

      lastWorkingBase = base;
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof HttpError && error.status < 500) throw error;
      // Network/timeout failure — try the next base URL.
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("CineLog API is unreachable.");
}

export async function apiJson<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const dedupe = options.dedupe ?? method === "GET";
  if (!dedupe) return performRequest<T>(path, options);

  const key = `${method} ${path}`;
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = performRequest<T>(path, options).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}

/** Envelope produced by every CineLog API route (`server/shared/response.js`). */
export interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  error?: { code: string; message: string } | null;
}

/** Unwrap a CineLog API envelope, throwing a readable error on failure. */
export async function apiData<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const payload = await apiJson<ApiEnvelope<T>>(path, options);
  if (!payload?.ok || payload.data == null) {
    throw new Error(payload?.error?.message || `Request failed: ${path}`);
  }
  return payload.data;
}
