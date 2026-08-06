import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Application from "expo-application";

import { cacheWarmup } from "@/lib/services/cache-service";
import { hydratePhotoCache } from "@/lib/image-resolver";
import { initializeMatchNotifications } from "@/lib/match-notifications";
import {
  primeBootstrapRealtimeData,
  realtimeCacheKeys,
} from "@/services/realtime-engine";
import {
  prepareOtaUpdate,
  reloadToLatestUpdate,
} from "@/services/update-service";
import {
  logStartupEvent,
  runStartupTask,
} from "@/services/startup-orchestrator";
import { runAutonomousStartup } from "@/src/core/autonomous/startupManager";
import { initializeStreamProviders } from "@/lib/playback-engine";

const FEATURE_FLAGS_KEY = "nexora_feature_flags_v1";
const MODULE_STATE_KEY = "nexora_module_state_v1";
const OTA_READY_KEY = "nexora_ota_ready_v1";

type OtaReadyRecord = {
  ready: boolean;
  nativeVersion: string;
  runtimeVersion: string;
  updatedAt?: string;
};

function parseOtaReadyRecord(raw: string | null): OtaReadyRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OtaReadyRecord>;
    if (!parsed || parsed.ready !== true) return null;
    return {
      ready: true,
      nativeVersion: String(parsed.nativeVersion || ""),
      runtimeVersion: String(parsed.runtimeVersion || ""),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

async function applyPendingOtaIfReady() {
  const record = parseOtaReadyRecord(await AsyncStorage.getItem(OTA_READY_KEY));
  if (!record?.ready) return;

  const currentNativeVersion = String(
    Application.nativeApplicationVersion || "unknown",
  );
  const currentRuntimeVersion = getRuntimeVersionSafe();
  const matchesRuntime = record.runtimeVersion === currentRuntimeVersion;
  const matchesNative =
    !record.nativeVersion || record.nativeVersion === currentNativeVersion;

  if (!matchesRuntime || !matchesNative) {
    await AsyncStorage.removeItem(OTA_READY_KEY).catch(() => undefined);
    return;
  }

  await AsyncStorage.removeItem(OTA_READY_KEY).catch(() => undefined);
  await reloadToLatestUpdate();
}

function getRuntimeVersionSafe(): string {
  try {
    const Updates = require("expo-updates");
    return String(Updates?.runtimeVersion || "unknown");
  } catch {
    return "unknown";
  }
}

export type BootstrapResult = {
  criticalDone: Promise<void>;
  fullDone: Promise<void>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function bootstrapCacheKeys(today: string): string[] {
  return [
    `sports:live:${today}`,
    `sports:today:${today}`,
    realtimeCacheKeys.vodHome(),
    realtimeCacheKeys.vodCollections(),
  ];
}

async function readBootstrapSnapshot() {
  const [featureFlagsRaw, moduleStateRaw] = await AsyncStorage.multiGet([
    FEATURE_FLAGS_KEY,
    MODULE_STATE_KEY,
  ]);

  return {
    featureFlagsPresent: Boolean(featureFlagsRaw?.[1]),
    moduleStatePresent: Boolean(moduleStateRaw?.[1]),
    runtimeVersion: getRuntimeVersionSafe(),
    appVersion: String(Constants.expoConfig?.version || "unknown"),
  };
}

export function runStartupBootstrap(queryClient: QueryClient): BootstrapResult {
  const today = todayIso();

  const criticalTasks = Promise.all([
    runStartupTask({
      scope: "boot",
      name: "ota-apply-pending",
      timeoutMs: 3500,
      run: async () => {
        await applyPendingOtaIfReady();
      },
    }),
    runStartupTask({
      scope: "boot",
      name: "cache-seed",
      timeoutMs: 1200,
      run: async () => {
        await cacheWarmup(bootstrapCacheKeys(today));
      },
    }),
    runStartupTask({
      scope: "boot",
      name: "runtime-check",
      timeoutMs: 1500,
      run: async () => {
        const snapshot = await readBootstrapSnapshot();
        logStartupEvent("boot", "info", "runtime-snapshot", snapshot);
      },
    }),
    runStartupTask({
      scope: "boot",
      name: "update-check",
      timeoutMs: 2000,
      run: async () => {
        const currentNativeVersion = String(
          Application.nativeApplicationVersion || "unknown",
        );
        logStartupEvent("boot", "info", "update-check-result", {
          kind: "startup-probe",
          nativeVersion: currentNativeVersion,
          runtimeVersion: getRuntimeVersionSafe(),
        });
      },
    }),
  ]).then(() => undefined);

  const backgroundTasks = Promise.all([
    runStartupTask({
      scope: "background",
      name: "provider-health-bootstrap",
      timeoutMs: 8000,
      run: async () => {
        await initializeStreamProviders();
        logStartupEvent("background", "info", "provider-health-bootstrap-finished");
      },
    }),
    runStartupTask({
      scope: "background",
      name: "ota-preload",
      timeoutMs: 30000,
      run: async () => {
        await criticalTasks;

        try {
          await prepareOtaUpdate();
          const currentNativeVersion = String(
            Application.nativeApplicationVersion || "unknown",
          );
          const currentRuntimeVersion = getRuntimeVersionSafe();
          await AsyncStorage.setItem(
            OTA_READY_KEY,
            JSON.stringify({
              ready: true,
              nativeVersion: currentNativeVersion,
              runtimeVersion: currentRuntimeVersion,
              updatedAt: new Date().toISOString(),
            }),
          );
          logStartupEvent("background", "info", "ota-update-ready", {
            runtimeVersion: currentRuntimeVersion,
            nativeVersion: currentNativeVersion,
          });
        } catch (error) {
          await AsyncStorage.removeItem(OTA_READY_KEY).catch(() => undefined);
          logStartupEvent("background", "warn", "ota-preload-failed", {
            message: error instanceof Error ? error.message : "Unknown OTA preload failure",
          });
        }
      },
    }),
    runStartupTask({
      scope: "background",
      name: "autonomous-startup-manager",
      timeoutMs: 12000,
      run: async () => {
        await runAutonomousStartup(queryClient);
      },
    }),
    runStartupTask({
      scope: "background",
      name: "prime-realtime-bootstrap",
      timeoutMs: 70000,
      run: async () => {
        await primeBootstrapRealtimeData(queryClient, today, {
          networkPrefetch: false,
        });
      },
    }),
    runStartupTask({
      scope: "background",
      name: "warm-player-images",
      timeoutMs: 10000,
      run: async () => {
        await hydratePhotoCache();
      },
    }),
    runStartupTask({
      scope: "background",
      name: "init-notifications",
      timeoutMs: 4000,
      run: async () => {
        await initializeMatchNotifications();
      },
    }),
  ]).then(() => undefined);

  return {
    criticalDone: criticalTasks,
    fullDone: Promise.all([criticalTasks, backgroundTasks]).then(
      () => undefined,
    ),
  };
}
