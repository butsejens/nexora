import { cacheGet, cacheSet } from "@/lib/services/cache-service";
import { apiRequestJson } from "@/lib/query-client";
import { AUTONOMOUS_CONFIG, type ServiceState } from "./autonomousConfig";
import { logAutonomousEvent } from "./autonomousLogger";

const KEY = "autonomous:maintenance:state";

export type MaintenanceSnapshot = {
  state: ServiceState;
  reason?: string;
  updatedAt: number;
};

function safeSnapshot(input?: Partial<MaintenanceSnapshot>): MaintenanceSnapshot {
  return {
    state: input?.state || "healthy",
    reason: input?.reason || "",
    updatedAt: input?.updatedAt || Date.now(),
  };
}

export async function getMaintenanceSnapshot(): Promise<MaintenanceSnapshot> {
  const cached = await cacheGet<MaintenanceSnapshot>(KEY);
  if (cached) return safeSnapshot(cached);
  return safeSnapshot();
}

export async function setMaintenanceSnapshot(
  state: ServiceState,
  reason?: string,
): Promise<void> {
  const snapshot = safeSnapshot({ state, reason, updatedAt: Date.now() });
  await cacheSet(KEY, snapshot, AUTONOMOUS_CONFIG.cache.maintenanceTtlMs);
}

export async function refreshMaintenanceSnapshot(): Promise<MaintenanceSnapshot> {
  try {
    const [ping, config] = await Promise.all([
      apiRequestJson<{ ok?: boolean }>("/api/ping"),
      apiRequestJson<{ ok?: boolean; services?: { tmdb?: boolean } }>(
        "/api/config-check",
      ),
    ]);
    const backendOk = Boolean(ping?.ok);
    const tmdbOk = Boolean(config?.services?.tmdb ?? true);
    const state: ServiceState = backendOk && tmdbOk ? "healthy" : "degraded";
    const reason = !backendOk
      ? "backend unavailable"
      : !tmdbOk
        ? "tmdb unavailable"
        : "";
    await setMaintenanceSnapshot(state, reason);
    return safeSnapshot({ state, reason });
  } catch (error) {
    const fallback = await getMaintenanceSnapshot();
    if (fallback.state === "healthy") {
      await setMaintenanceSnapshot("degraded", "health endpoint unavailable");
      return safeSnapshot({
        state: "degraded",
        reason: "health endpoint unavailable",
      });
    }
    logAutonomousEvent("warn", "maintenance", "maintenance-refresh-failed", {
      error: String((error as any)?.message || error || "unknown"),
      fallbackState: fallback.state,
    });
    return fallback;
  }
}

