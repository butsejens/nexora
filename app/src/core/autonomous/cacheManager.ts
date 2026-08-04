import {
  cacheGet,
  cacheGetStale,
  cacheSet,
  CacheTTL,
  cacheAge,
} from "@/lib/services/cache-service";
import { AUTONOMOUS_CONFIG } from "./autonomousConfig";
import { logAutonomousEvent } from "./autonomousLogger";

type SwrOptions<T> = {
  key: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
  staleMs?: number;
  allowStale?: boolean;
};

export async function getCachedOrFetch<T>({
  key,
  fetcher,
  ttlMs = CacheTTL.HOME_RAILS,
  staleMs = AUTONOMOUS_CONFIG.cache.swrStaleMs,
  allowStale = true,
}: SwrOptions<T>): Promise<T> {
  const fresh = await cacheGet<T>(key);
  if (fresh != null) return fresh;

  if (allowStale) {
    const stale = await cacheGetStale<T>(key);
    if (stale != null) {
      void revalidateInBackground({ key, fetcher, ttlMs, staleMs });
      logAutonomousEvent("info", "cache", "served-stale-while-revalidate", { key });
      return stale;
    }
  }

  const value = await fetcher();
  await cacheSet(key, value, ttlMs);
  return value;
}

export async function revalidateInBackground<T>({
  key,
  fetcher,
  ttlMs = CacheTTL.HOME_RAILS,
  staleMs = AUTONOMOUS_CONFIG.cache.swrStaleMs,
}: Omit<SwrOptions<T>, "allowStale">): Promise<void> {
  try {
    const age = await cacheAge(key);
    if (Number.isFinite(age) && age < staleMs) return;
    const value = await fetcher();
    await cacheSet(key, value, ttlMs);
    logAutonomousEvent("info", "cache", "background-revalidation-complete", { key });
  } catch (error) {
    logAutonomousEvent("warn", "cache", "background-revalidation-failed", {
      key,
      error: String((error as any)?.message || error || "unknown"),
    });
  }
}

