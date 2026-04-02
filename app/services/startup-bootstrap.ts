import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { cacheWarmup } from "@/lib/services/cache-service";
import { startPlayerImageWarmup } from "@/lib/player-image-system";
import { initializeMatchNotifications } from "@/lib/match-notifications";
import { primeBootstrapRealtimeData, realtimeCacheKeys } from "@/services/realtime-engine";
import { checkForAppUpdates } from "@/services/update-service";
import { logStartupEvent, runStartupTask } from "@/services/startup-orchestrator";

const FEATURE_FLAGS_KEY = "nexora_feature_flags_v1";
const MODULE_STATE_KEY = "nexora_module_state_v1";

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
    runtimeVersion: String(Updates.runtimeVersion || "unknown"),
    appVersion: String(Constants.expoConfig?.version || "unknown"),
  };
}

export function runStartupBootstrap(queryClient: QueryClient): BootstrapResult {
  const today = todayIso();

  const criticalTasks = Promise.all([
    runStartupTask({
      scope: "boot",
      name: "cache-seed",
      timeoutMs: 2500,
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
      timeoutMs: 4500,
      run: async () => {
        const result = await checkForAppUpdates();
        logStartupEvent("boot", "info", "update-check-result", {
          kind: result.kind,
          nativeVersion: result.manifest?.native?.version || null,
        });
      },
    }),
  ]).then(() => undefined);

  const backgroundTasks = Promise.all([
    runStartupTask({
      scope: "background",
      name: "prime-realtime-bootstrap",
      timeoutMs: 70000,
      run: async () => {
        await primeBootstrapRealtimeData(queryClient, today);
      },
    }),
    runStartupTask({
      scope: "background",
      name: "warm-player-images",
      timeoutMs: 10000,
      run: async () => {
        await startPlayerImageWarmup(queryClient);
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
    fullDone: Promise.all([criticalTasks, backgroundTasks]).then(() => undefined),
  };
}
