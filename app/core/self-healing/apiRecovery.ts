import { logSelfHealing } from "./logger";

const JSON_CACHE = new Map<string, unknown>();

type RecoverableApiError = {
  status: number | null;
  message: string;
  kind: "timeout" | "network" | "forbidden" | "rate_limit" | "unknown";
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeApiError(error: unknown): RecoverableApiError {
  const rawMessage = String((error as any)?.message || error || "");
  const message = rawMessage.toLowerCase();
  const statusMatch = rawMessage.match(/^(\d{3})\s*:/);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  if (status === 403) return { status, message: rawMessage, kind: "forbidden" };
  if (status === 429) return { status, message: rawMessage, kind: "rate_limit" };
  if (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("abort")
  ) {
    return { status, message: rawMessage, kind: "timeout" };
  }
  if (
    message.includes("network") ||
    message.includes("netwerk") ||
    message.includes("failed to fetch")
  ) {
    return { status, message: rawMessage, kind: "network" };
  }
  return { status, message: rawMessage, kind: "unknown" };
}

function shouldRetry(err: RecoverableApiError): boolean {
  return (
    err.kind === "timeout" ||
    err.kind === "network" ||
    err.kind === "rate_limit" ||
    err.status === 503 ||
    err.status === 502
  );
}

export async function withApiRecovery<T>(
  key: string,
  run: () => Promise<T>,
  options?: { retries?: number; retryDelayMs?: number },
): Promise<T> {
  const retries = Math.max(0, options?.retries ?? 2);
  const retryDelayMs = Math.max(250, options?.retryDelayMs ?? 700);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const value = await run();
      if (value != null) {
        JSON_CACHE.set(key, value);
      }
      if (attempt > 0) {
        void logSelfHealing("info", "API", "api-recovered-after-retry", {
          key,
          attempt,
        });
      }
      return value;
    } catch (error) {
      lastError = error;
      const normalized = normalizeApiError(error);
      void logSelfHealing("warn", "API", "api-request-failed", {
        key,
        attempt,
        status: normalized.status,
        kind: normalized.kind,
      });
      if (attempt >= retries || !shouldRetry(normalized)) break;
      await delay(retryDelayMs * (attempt + 1));
    }
  }

  if (JSON_CACHE.has(key)) {
    void logSelfHealing("warn", "API", "api-fallback-cache-hit", { key });
    return JSON_CACHE.get(key) as T;
  }

  throw lastError instanceof Error ? lastError : new Error("API request failed");
}

export function hasEmptyContent(payload: unknown): boolean {
  if (!payload) return true;
  if (Array.isArray(payload)) return payload.length === 0;
  if (typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  const arrays = Object.values(data).filter(Array.isArray) as unknown[][];
  if (arrays.length === 0) return false;
  return arrays.every((arr) => arr.length === 0);
}

export function getCachedJson<T>(key: string): T | null {
  return (JSON_CACHE.get(key) as T) ?? null;
}
