import { cacheGet, cacheSet } from "@/lib/services/cache-service";
import { apiRequestJson } from "@/lib/query-client";
import { AUTONOMOUS_CONFIG, type ServiceState } from "./autonomousConfig";
import { logAutonomousEvent } from "./autonomousLogger";
import { setMaintenanceSnapshot } from "./maintenanceMode";

const HEALTH_KEY = "autonomous:health:latest";

export type HealthReport = {
  state: ServiceState;
  tmdbOk: boolean;
  backendOk: boolean;
  cacheOk: boolean;
  adOk: boolean;
  webCompatible: boolean;
  tvCompatible: boolean;
  updatedAt: number;
};

let failures = 0;

function defaultReport(): HealthReport {
  return {
    state: "healthy",
    tmdbOk: true,
    backendOk: true,
    cacheOk: true,
    adOk: true,
    webCompatible: true,
    tvCompatible: true,
    updatedAt: Date.now(),
  };
}

export async function getLastHealthReport(): Promise<HealthReport> {
  const cached = await cacheGet<HealthReport>(HEALTH_KEY);
  return cached || defaultReport();
}

export async function runHealthCheck(): Promise<HealthReport> {
  const started = Date.now();
  try {
    const ping = await apiRequestJson<any>("/api/ping");
    const backendOk = Boolean(ping?.ok ?? true);
    const tmdbOk = backendOk;
    const report: HealthReport = {
      ...defaultReport(),
      state: backendOk ? "healthy" : "degraded",
      backendOk,
      tmdbOk,
      updatedAt: Date.now(),
    };
    failures = backendOk ? 0 : failures + 1;
    await cacheSet(HEALTH_KEY, report, AUTONOMOUS_CONFIG.cache.healthTtlMs);
    await setMaintenanceSnapshot(report.state, backendOk ? "" : "backend degraded");
    logAutonomousEvent("info", "health", "health-check-complete", {
      backendOk,
      tmdbOk,
      durationMs: Date.now() - started,
    });
    return report;
  } catch (error) {
    failures += 1;
    const degraded = failures >= AUTONOMOUS_CONFIG.health.maxConsecutiveFailuresBeforeDegraded;
    const report: HealthReport = {
      ...defaultReport(),
      state: degraded ? "degraded" : "healthy",
      backendOk: false,
      tmdbOk: false,
      updatedAt: Date.now(),
    };
    await cacheSet(HEALTH_KEY, report, AUTONOMOUS_CONFIG.cache.healthTtlMs);
    if (degraded) {
      await setMaintenanceSnapshot("degraded", "health checks failing");
    }
    logAutonomousEvent("warn", "health", "health-check-failed", {
      failures,
      degraded,
      error: String((error as any)?.message || error || "unknown"),
    });
    return report;
  }
}

