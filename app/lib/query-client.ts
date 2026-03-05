import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";

let lastWorkingApiBase = "";

function normalizeBase(base: string): string {
  return String(base || "").trim().replace(/\/$/, "");
}

function getInferredNativeHost(): string {
  try {
    const rawHost =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoClient?.hostUri ||
      (Constants?.manifest as any)?.debuggerHost ||
      "";
    const host = String(rawHost).split(":")[0];
    return host || "";
  } catch {
    return "";
  }
}

function isLoopbackHost(base: string): boolean {
  try {
    const u = new URL(base);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const n = normalizeBase(v);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function parseEnvBaseList(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((v) => normalizeBase(v))
    .filter(Boolean);
}

export function getApiBaseCandidates(): string[] {
  const explicit = normalizeBase(process.env.EXPO_PUBLIC_API_BASE || "");
  const explicitList = parseEnvBaseList(process.env.EXPO_PUBLIC_API_BASES || "");
  const inferredHost = getInferredNativeHost();
  const inferredNative = inferredHost ? `http://${inferredHost}:8080` : "";

  // 2) Expo native (iOS/Android) during development: try to infer host from
  //    the Metro debugger configuration. This saves the user from having to
  //    manually set EXPO_PUBLIC_API_BASE when running on a simulator or
  //    physical device.
  if (Platform.OS !== "web") {
    const iosSim = "http://localhost:8080";
    const androidEmu = "http://10.0.2.2:8080";

    // If explicit points to localhost on a physical device, inferred host should win.
    if (explicit && isLoopbackHost(explicit) && inferredNative) {
      return unique([lastWorkingApiBase, inferredNative, ...explicitList, explicit, iosSim, androidEmu]);
    }

    // Prefer inferred/localhost first so a stale EXPO_PUBLIC_API_BASE IP
    // cannot block requests for a long time in local development.
    return unique([lastWorkingApiBase, ...explicitList, inferredNative, iosSim, explicit, androidEmu]);
  }

  // 3) Web: use same-origin (useful for web deployments)
  if (Platform.OS === "web") {
    const candidates: string[] = [];
    candidates.push(...explicitList);
    if (explicit) candidates.push(explicit);
    if (typeof window !== "undefined" && window.location?.origin) {
      // DEV QUALITY-OF-LIFE:
      // When running Expo Web (often :8081 / :19006) while the Node API runs on :8080,
      // same-origin points to the web bundler, not the API.
      // If the user didn't explicitly set EXPO_PUBLIC_API_BASE, default to :8080.
      const origin = window.location.origin;
      try {
        const u = new URL(origin);
        const host = u.hostname;
        const port = u.port;
        const isLocal = host === "localhost" || host === "127.0.0.1";
        const isExpoWebPort = port === "8081" || port === "19006";
        if (isLocal && isExpoWebPort) {
          candidates.push(`${u.protocol}//${host}:8080`);
        }
      } catch {
        // ignore
      }
      candidates.push(origin);
    }
    return unique([lastWorkingApiBase, ...candidates]);
  }

  // 4) Legacy host-based config (if you ever set EXPO_PUBLIC_DOMAIN)
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) return unique([`https://${host}`]);

  // 5) No base URL configured: fall back to relative routes (may still work on web)
  return [];
}

export function getApiUrl(): string {
  return lastWorkingApiBase || getApiBaseCandidates()[0] || "";
}


async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    } catch (e: any) {
      // If res.text() itself throws (e.g. RangeError from status 0), rethrow a plain Error
      if (e instanceof RangeError) throw new Error("Netwerkfout: server niet bereikbaar");
      throw e;
    }
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, body: init?.body ?? undefined } as any);
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrls = getApiBaseCandidates();
  if (baseUrls.length === 0) {
    throw new Error(
      "API base URL is not configured. Set EXPO_PUBLIC_API_BASE or run the app in an environment where the host can be inferred (e.g. Expo simulator)."
    );
  }

  let lastError: unknown;

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}${route}`;
    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
      });

      // Wrong target (for example Metro/web origin) can return route 404.
      // Try the next candidate before failing hard.
      if (res.status === 404) {
        lastError = new Error(`404 from ${baseUrl}`);
        continue;
      }

      await throwIfResNotOk(res);
      lastWorkingApiBase = baseUrl;
      return res;
    } catch (e: any) {
      lastError = e;
      if (e instanceof RangeError) {
        continue;
      }
      const message = String(e?.message || "").toLowerCase();
      if (
        message.includes("network") ||
        message.includes("netwerk") ||
        message.includes("failed to fetch") ||
        message.includes("abort") ||
        message.includes("timed out")
      ) {
        continue;
      }
    }
  }

  if (lastError instanceof RangeError) {
    throw new Error("Netwerkfout: server niet bereikbaar");
  }
  if (lastError) throw lastError as Error;
  throw new Error("Netwerkfout: server niet bereikbaar");
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrls = getApiBaseCandidates();
    if (baseUrls.length === 0) {
      throw new Error(
        "API base URL is not configured. Set EXPO_PUBLIC_API_BASE or run the app in an environment where the host can be inferred (e.g. Expo simulator)."
      );
    }
    const path = queryKey.join("/") as string;

    let lastError: unknown;

    for (const baseUrl of baseUrls) {
      const url = `${baseUrl}${path}`;
      try {
        const res = await fetchWithTimeout(url, undefined, 5000);

        if (unauthorizedBehavior === "returnNull" && res.status === 401) {
          return null;
        }

        if (res.status === 404) {
          lastError = new Error(`404 from ${baseUrl}`);
          continue;
        }

        await throwIfResNotOk(res);
        lastWorkingApiBase = baseUrl;
        return await res.json();
      } catch (e: any) {
        lastError = e;
        if (e instanceof RangeError) continue;
        const message = String(e?.message || "").toLowerCase();
        if (
          message.includes("network") ||
          message.includes("netwerk") ||
          message.includes("failed to fetch") ||
          message.includes("abort") ||
          message.includes("timed out")
        ) {
          continue;
        }
      }
    }

    if (lastError instanceof RangeError) throw new Error("Netwerkfout: server niet bereikbaar");
    if (lastError) throw lastError as Error;
    throw new Error("Netwerkfout: server niet bereikbaar");
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
