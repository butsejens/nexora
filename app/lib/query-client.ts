import { fetch } from "expo/fetch";
import { Platform, AppState } from "react-native";
import { QueryClient, QueryFunction, focusManager } from "@tanstack/react-query";
import Constants from "expo-constants";
import { logRealtimeEvent } from "@/services/realtime-telemetry";

// ── React Native: wire React Query's focusManager to AppState ────────────────
// This keeps React Query's internal "focused" state accurate so that any query
// that opts into refetchOnWindowFocus correctly triggers on foreground resume.
// (Global queries use refetchOnWindowFocus:false, but per-query overrides work.)
focusManager.setEventListener((onFocus) => {
  const sub = AppState.addEventListener("change", (state) => {
    onFocus(state === "active");
  });
  return () => sub.remove();
});

let lastWorkingApiBase = "";
let lastWorkingSportsApiBase = "";
export const DEFAULT_RENDER_API_BASE = "https://nexora-api-8xxb.onrender.com";
const inflightJsonRequests = new Map<string, Promise<unknown>>();

function isCloudflareSportsUrl(url: string): boolean {
  return /\.workers\.dev/i.test(url) || /cloudflare/i.test(url);
}

function isRenderUrl(url: string): boolean {
  return /\.onrender\.com/i.test(url);
}

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

function isLikelyPhysicalHost(host: string): boolean {
  const value = String(host || "").trim().toLowerCase();
  if (!value) return false;
  return value !== "localhost" && value !== "127.0.0.1";
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
    const isPhysicalDeviceSession = isLikelyPhysicalHost(inferredHost);

    // Standalone/test APKs have no Metro host to infer and no business
    // defaulting to localhost. Prefer the production API unless the build
    // explicitly configured something else.
    if (!__DEV__) {
      const safeExplicitList = explicitList.filter((candidate) => !isLoopbackHost(candidate));
      const safeExplicit = explicit && !isLoopbackHost(explicit) ? explicit : "";
      return unique([
        lastWorkingApiBase,
        safeExplicit,
        ...safeExplicitList,
        DEFAULT_RENDER_API_BASE,
      ]);
    }

    // Physical devices should prefer cloud API first in dev unless user gave
    // a reachable non-loopback override.
    if (isPhysicalDeviceSession) {
      const nonLoopbackExplicit = explicitList.filter((candidate) => !isLoopbackHost(candidate));
      const safeExplicit = explicit && !isLoopbackHost(explicit) ? explicit : "";
      return unique([
        lastWorkingApiBase,
        safeExplicit,
        ...nonLoopbackExplicit,
        DEFAULT_RENDER_API_BASE,
        inferredNative,
        explicit,
        iosSim,
        androidEmu,
      ]);
    }

    // If explicit points to localhost, inferred host should win for simulators.
    if (explicit && isLoopbackHost(explicit) && inferredNative) {
      return unique([lastWorkingApiBase, inferredNative, ...explicitList, explicit, iosSim, androidEmu, DEFAULT_RENDER_API_BASE]);
    }

    // Prefer a reachable production fallback before emulator loopbacks in
    // native dev, so physical devices don't burn multiple failed attempts.
    return unique([
      lastWorkingApiBase,
      ...explicitList,
      inferredNative,
      DEFAULT_RENDER_API_BASE,
      iosSim,
      explicit,
      androidEmu,
    ]);
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

export function getSportsApiBaseCandidates(): string[] {
  const explicit = normalizeBase(process.env.EXPO_PUBLIC_SPORTS_API_BASE || "");
  const explicitList = parseEnvBaseList(process.env.EXPO_PUBLIC_SPORTS_API_BASES || "");
  const hasExplicitSportsBase = Boolean(explicit) || explicitList.length > 0;

  // Dev ergonomics: if no dedicated sports base is configured, prefer local/general
  // API candidates first to avoid unnecessary edge/network hops while developing.
  if (__DEV__ && !hasExplicitSportsBase) {
    return unique([
      lastWorkingSportsApiBase,
      ...getApiBaseCandidates(),
      DEFAULT_RENDER_API_BASE,
    ]);
  }

  // Production/default: explicit edge-first for sports, then Render/general fallbacks.
  // Avoid hardcoded worker domains that can silently go stale.
  const safeExplicit = !__DEV__ && isLoopbackHost(explicit) ? "" : explicit;
  const safeExplicitList = !__DEV__
    ? explicitList.filter((candidate) => !isLoopbackHost(candidate))
    : explicitList;
  return unique([
    lastWorkingSportsApiBase,
    safeExplicit,
    ...safeExplicitList,
    DEFAULT_RENDER_API_BASE,
    ...getApiBaseCandidates(),
  ]);
}

function isSportsRoute(route: string): boolean {
  if (!route) return false;
  if (route.startsWith("http://") || route.startsWith("https://")) return false;
  return /^\/?api\/sports(?:\/|$)/i.test(route);
}

function getBaseCandidatesForRoute(route: string): string[] {
  return isSportsRoute(route) ? getSportsApiBaseCandidates() : getApiBaseCandidates();
}

function markWorkingBaseForRoute(route: string, baseUrl: string): void {
  if (isSportsRoute(route)) {
    lastWorkingSportsApiBase = baseUrl;
    return;
  }
  lastWorkingApiBase = baseUrl;
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

// Cloud URLs (https) may need to wake up from cold start → longer timeout
// Local URLs (http) are either up or not → short timeout
// Sports routes to non-deployed Cloudflare → use failfast to prioritize Render
function timeoutForUrl(url: string, isSports: boolean = false): number {
  if (isSports) {
    if (isCloudflareSportsUrl(url)) return 12000;
    if (isRenderUrl(url)) return 30000;
    return 12000;
  }
  if (isRenderUrl(url)) return 30000;
  return url.startsWith("https://") ? 25000 : 8000;
}

function shouldTryNextBase(route: string, status: number): boolean {
  if (status === 404) return true;
  if (!isSportsRoute(route)) return false;
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function shouldTryNextBaseForResponse(route: string, res: Response): boolean {
  if (shouldTryNextBase(route, res.status)) return true;
  const isApiRoute = /^\/?api\//i.test(route);
  if (!isApiRoute) return false;
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  // Misrouted API calls can return app HTML (Expo/Web) with HTTP 200.
  // Treat those as fallback candidates for all API routes.
  if (contentType.includes("text/html")) return true;
  return false;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs?: number, isSports?: boolean): Promise<Response> {
  const ms = timeoutMs ?? timeoutForUrl(url, isSports);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
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
  const startedAt = Date.now();
  if (route.startsWith("http://") || route.startsWith("https://")) {
    const isSports = isSportsRoute(route);
    const res = await fetchWithTimeout(route, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    }, undefined, isSports);
    await throwIfResNotOk(res);
    logRealtimeEvent("fetch", "api-request", {
      method,
      route,
      baseUrl: route,
      status: res.status,
      durationMs: Date.now() - startedAt,
      isSports,
      transport: "absolute",
    });
    return res;
  }

  const baseUrls = getBaseCandidatesForRoute(route);
  if (baseUrls.length === 0) {
    throw new Error(
      "API base URL is not configured. Set EXPO_PUBLIC_API_BASE or run the app in an environment where the host can be inferred (e.g. Expo simulator)."
    );
  }

  let lastError: unknown;
  const isSports = isSportsRoute(route);
  let attempt = 0;

  for (const baseUrl of baseUrls) {
    attempt += 1;
    const url = `${baseUrl}${route}`;
    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
      }, undefined, isSports);

      // Wrong targets and transient upstream/edge failures should fall through to
      // the next candidate (for example Cloudflare -> Render fallback).
      if (shouldTryNextBaseForResponse(route, res)) {
        lastError = new Error(`${res.status} from ${baseUrl}`);
        logRealtimeEvent("fetch", "api-request-fallback", {
          method,
          route,
          baseUrl,
          status: res.status,
          durationMs: Date.now() - startedAt,
          attempt,
          reason: "response-fallback",
        });
        continue;
      }

      await throwIfResNotOk(res);
      markWorkingBaseForRoute(route, baseUrl);
      logRealtimeEvent("fetch", "api-request", {
        method,
        route,
        baseUrl,
        status: res.status,
        durationMs: Date.now() - startedAt,
        attempt,
        isSports,
      });
      return res;
    } catch (e: any) {
      lastError = e;
      logRealtimeEvent("fetch", "api-request-error", {
        method,
        route,
        baseUrl,
        durationMs: Date.now() - startedAt,
        attempt,
        isSports,
        error: e instanceof Error ? e.message : String(e || "unknown"),
      });
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

type ApiJsonRequestOptions = {
  method?: string;
  data?: unknown;
  dedupe?: boolean;
  dedupeKey?: string;
};

function buildJsonDedupeKey(method: string, route: string, data?: unknown): string {
  if (data === undefined) return `${method.toUpperCase()} ${route}`;
  try {
    return `${method.toUpperCase()} ${route} ${JSON.stringify(data)}`;
  } catch {
    return `${method.toUpperCase()} ${route}`;
  }
}

export async function apiRequestJson<T>(
  route: string,
  options?: ApiJsonRequestOptions,
): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  const shouldDedupe = options?.dedupe ?? method === "GET";
  const requestKey = options?.dedupeKey || buildJsonDedupeKey(method, route, options?.data);

  const run = async (): Promise<T> => {
    const res = await apiRequest(method, route, options?.data);
    return await res.json() as T;
  };

  if (!shouldDedupe) return await run();

  const inflight = inflightJsonRequests.get(requestKey) as Promise<T> | undefined;
  if (inflight) return await inflight;

  const task = run();
  inflightJsonRequests.set(requestKey, task as Promise<unknown>);
  try {
    return await task;
  } finally {
    inflightJsonRequests.delete(requestKey);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const baseUrls = getBaseCandidatesForRoute(path);
    const isSports = isSportsRoute(path);
    if (baseUrls.length === 0) {
      throw new Error(
        "API base URL is not configured. Set EXPO_PUBLIC_API_BASE or run the app in an environment where the host can be inferred (e.g. Expo simulator)."
      );
    }

    let lastError: unknown;

    for (const baseUrl of baseUrls) {
      const url = `${baseUrl}${path}`;
      try {
        const res = await fetchWithTimeout(url, undefined, undefined, isSports);

        if (unauthorizedBehavior === "returnNull" && res.status === 401) {
          return null;
        }

        if (shouldTryNextBaseForResponse(path, res)) {
          lastError = new Error(`${res.status} from ${baseUrl}`);
          continue;
        }

        await throwIfResNotOk(res);
        markWorkingBaseForRoute(path, baseUrl);
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
