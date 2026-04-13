import AsyncStorage from "@react-native-async-storage/async-storage";

export type IntroVariant = "standard" | "extended";

export type IntroReason = "normal" | "first-launch" | "major-update";

export type StartupLaunchContext = {
  currentVersion: string;
  previousVersion: string | null;
  variant: IntroVariant;
  reason: IntroReason;
};

export type StartupGateInput = {
  variant: IntroVariant;
  startedAtMs: number;
  nowMs: number;
  introCompleted: boolean;
  criticalBootstrapDone: boolean;
  authReady: boolean;
  skipRequested: boolean;
};

export type StartupTimings = {
  minDurationMs: number;
  maxDurationMs: number;
  skipAfterMs: number;
};

const STARTUP_VERSION_KEY = "nexora_startup_last_seen_version_v1";

function normalizeVersion(version: string): string {
  const value = String(version || "0.0.0").trim();
  return value || "0.0.0";
}

function parseMajor(version: string): number {
  const token = normalizeVersion(version).split(".")[0] || "0";
  const major = Number.parseInt(token.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(major) ? major : 0;
}

export function resolveIntroVariant(currentVersion: string, previousVersion: string | null): StartupLaunchContext {
  const current = normalizeVersion(currentVersion);
  const previous = previousVersion ? normalizeVersion(previousVersion) : null;

  if (!previous) {
    return {
      currentVersion: current,
      previousVersion: null,
      variant: "extended",
      reason: "first-launch",
    };
  }

  const majorChanged = parseMajor(current) > parseMajor(previous);
  if (majorChanged) {
    return {
      currentVersion: current,
      previousVersion: previous,
      variant: "extended",
      reason: "major-update",
    };
  }

  return {
    currentVersion: current,
    previousVersion: previous,
    variant: "standard",
    reason: "normal",
  };
}

export function getIntroTimings(variant: IntroVariant): StartupTimings {
  if (variant === "extended") {
    return {
      minDurationMs: 3800,
      maxDurationMs: 9000,
      skipAfterMs: 2000,
    };
  }

  return {
    minDurationMs: 2200,
    maxDurationMs: 5000,
    skipAfterMs: 0,
  };
}

export function canFinishStartupGate(input: StartupGateInput): boolean {
  const elapsedMs = Math.max(0, input.nowMs - input.startedAtMs);
  const timings = getIntroTimings(input.variant);

  if (!input.criticalBootstrapDone) {
    return false;
  }

  // Safe valve: never block indefinitely on auth hydration.
  // If bootstrap is done and intro reached max duration, release to routing.
  if (elapsedMs >= timings.maxDurationMs) {
    return true;
  }

  if (!input.authReady) {
    return false;
  }

  if (input.skipRequested && input.variant === "extended") {
    return elapsedMs >= timings.skipAfterMs;
  }

  return input.introCompleted && elapsedMs >= timings.minDurationMs;
}

export function resolveEntryRoute(isAuthenticated: boolean): "/(tabs)/home" | "/auth" {
  return isAuthenticated ? "/(tabs)/home" : "/auth";
}

export async function loadStartupLaunchContext(currentVersion: string): Promise<StartupLaunchContext> {
  const previous = await AsyncStorage.getItem(STARTUP_VERSION_KEY);
  return resolveIntroVariant(currentVersion, previous);
}

export async function persistStartupLaunchContext(context: StartupLaunchContext): Promise<void> {
  await AsyncStorage.setItem(STARTUP_VERSION_KEY, context.currentVersion);
}
