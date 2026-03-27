/**
 * update-diagnostics.ts
 *
 * Centralized runtime diagnostics for Expo OTA update state.
 * Use getUpdateDiagnostics() to inspect the active bundle, channel, and update ID
 * from any screen (e.g. the hidden diagnostics section in Profile).
 *
 * All fields are safe to call from any JS context — no side effects.
 */

import * as Updates from "expo-updates";
import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStartupLogSnapshot } from "./startup-orchestrator";

export type UpdateSource = "embedded" | "ota" | "development";

export type UpdateDiagnostics = {
  /** Combined human-readable version string */
  displayVersion: string;
  /** App binary version (e.g. "2.5.2") */
  appVersion: string;
  /** Expo runtimeVersion embedded in the current bundle */
  runtimeVersion: string;
  /** EAS Update channel (e.g. "production") */
  channel: string;
  /** Short OTA update ID hash, or "embedded" / "development" */
  shortUpdateId: string;
  /** Full OTA update UUID, or null for embedded/dev builds */
  updateId: string | null;
  /** When this bundle was created */
  createdAt: string;
  /** Whether this bundle is the embedded fallback (i.e. no OTA active) */
  isEmbedded: boolean;
  /** Whether running in Expo Go / dev mode */
  isDevelopment: boolean;
  /** Whether expo-updates is enabled in this build */
  isEnabled: boolean;
  /** Source classification */
  source: UpdateSource;
  /** Native binary version (may differ from JS version on OTA) */
  nativeVersion: string;
  /** Startup log entries for debugging */
  startupLogs: ReturnType<typeof getStartupLogSnapshot>;
  /** Last detected rollback event (if any) */
  lastRollback: LaunchRollbackEvent | null;
};

type LaunchSnapshot = {
  timestamp: string;
  appVersion: string;
  runtimeVersion: string;
  source: UpdateSource;
  updateId: string | null;
  channel: string;
};

export type LaunchRollbackEvent = {
  detectedAt: string;
  previousUpdateId: string;
  currentUpdateId: string | null;
  previousSource: UpdateSource;
  currentSource: UpdateSource;
  previousRuntimeVersion: string;
  currentRuntimeVersion: string;
};

const LAST_LAUNCH_SNAPSHOT_KEY = "nexora_last_launch_snapshot_v1";
const LAST_ROLLBACK_EVENT_KEY = "nexora_last_rollback_event_v1";

export function getUpdateDiagnostics(): UpdateDiagnostics {
  const appVersion = String(Constants.expoConfig?.version || Application.nativeApplicationVersion || "unknown");
  const runtimeVersion = String(Updates.runtimeVersion || "unknown");
  const updateId = Updates.updateId || null;
  const shortUpdateId = updateId ? updateId.slice(0, 8) : Updates.isEmbeddedLaunch ? "embedded" : "dev";
  const channel = String(Updates.channel || "unknown");
  const isEmbedded = Boolean(Updates.isEmbeddedLaunch);
  const isDevelopment = Boolean(__DEV__);
  const isEnabled = Boolean(Updates.isEnabled);
  const nativeVersion = String(Application.nativeApplicationVersion || "unknown");

  let createdAt = "unknown";
  try {
    createdAt = Updates.createdAt?.toISOString() || "unknown";
  } catch {}

  let source: UpdateSource = "embedded";
  if (isDevelopment) source = "development";
  else if (!isEmbedded && updateId) source = "ota";

  const displayVersion = updateId
    ? `${appVersion} (OTA: ${shortUpdateId})`
    : `${appVersion} (${source})`;

  return {
    displayVersion,
    appVersion,
    runtimeVersion,
    channel,
    shortUpdateId,
    updateId,
    createdAt,
    isEmbedded,
    isDevelopment,
    isEnabled,
    source,
    nativeVersion,
    startupLogs: getStartupLogSnapshot(),
    lastRollback: null,
  };
}

async function readLastRollbackEvent(): Promise<LaunchRollbackEvent | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ROLLBACK_EVENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LaunchRollbackEvent;
  } catch {
    return null;
  }
}

export async function getUpdateDiagnosticsAsync(): Promise<UpdateDiagnostics> {
  const base = getUpdateDiagnostics();
  const rollback = await readLastRollbackEvent();
  return {
    ...base,
    lastRollback: rollback,
  };
}

export async function recordLaunchSnapshot(): Promise<void> {
  try {
    const current = getUpdateDiagnostics();
    const currentSnapshot: LaunchSnapshot = {
      timestamp: new Date().toISOString(),
      appVersion: current.appVersion,
      runtimeVersion: current.runtimeVersion,
      source: current.source,
      updateId: current.updateId,
      channel: current.channel,
    };

    const prevRaw = await AsyncStorage.getItem(LAST_LAUNCH_SNAPSHOT_KEY);
    const previous = prevRaw ? (JSON.parse(prevRaw) as LaunchSnapshot) : null;

    const rollbackDetected = Boolean(
      previous?.updateId &&
      currentSnapshot.updateId !== previous.updateId &&
      previous.source === "ota" &&
      currentSnapshot.source !== "ota",
    );

    if (rollbackDetected && previous) {
      const rollbackEvent: LaunchRollbackEvent = {
        detectedAt: new Date().toISOString(),
        previousUpdateId: previous.updateId || "unknown",
        currentUpdateId: currentSnapshot.updateId,
        previousSource: previous.source,
        currentSource: currentSnapshot.source,
        previousRuntimeVersion: previous.runtimeVersion,
        currentRuntimeVersion: currentSnapshot.runtimeVersion,
      };
      await AsyncStorage.setItem(LAST_ROLLBACK_EVENT_KEY, JSON.stringify(rollbackEvent));
      console.warn("[nexora:update] rollback detected", rollbackEvent);
    }

    await AsyncStorage.setItem(LAST_LAUNCH_SNAPSHOT_KEY, JSON.stringify(currentSnapshot));
  } catch {
    // Keep startup path non-fatal.
  }
}

/**
 * Returns a concise single-line summary useful for crash reports / log tags.
 * Example: "v2.5.2 | OTA:a1b2c3d4 | ch:production | rt:2.5.2"
 */
export function getUpdateSummaryLine(): string {
  const d = getUpdateDiagnostics();
  return `v${d.appVersion} | ${d.source.toUpperCase()}:${d.shortUpdateId} | ch:${d.channel} | rt:${d.runtimeVersion}`;
}

function sanitizeToken(value: string): string {
  return String(value || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
}

export function buildDiagnosticCode(reason: string): string {
  const d = getUpdateDiagnostics();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 14);
  const source = d.source === "ota" ? "OTA" : d.source === "embedded" ? "EMB" : "DEV";
  const reasonToken = sanitizeToken(reason).slice(0, 6) || "START";
  return `NXR-${stamp}-${source}-${d.shortUpdateId}-${reasonToken}`;
}

export function buildDiagnosticReport(reason: string, error?: Error | null): string {
  const d = getUpdateDiagnostics();
  const code = buildDiagnosticCode(reason);
  const logTail = d.startupLogs.slice(-30);
  const lines: string[] = [
    `DiagnosticCode: ${code}`,
    `Reason: ${reason}`,
    `AppVersion: ${d.appVersion}`,
    `NativeVersion: ${d.nativeVersion}`,
    `RuntimeVersion: ${d.runtimeVersion}`,
    `Channel: ${d.channel}`,
    `Source: ${d.source}`,
    `UpdateId: ${d.updateId || "embedded"}`,
    `CreatedAt: ${d.createdAt}`,
    `UpdatesEnabled: ${String(d.isEnabled)}`,
    `IsEmbeddedLaunch: ${String(d.isEmbedded)}`,
    `Timestamp: ${new Date().toISOString()}`,
  ];

  if (error) {
    lines.push(`ErrorName: ${error.name || "Error"}`);
    lines.push(`ErrorMessage: ${error.message || "Unknown"}`);
    if (error.stack) {
      const compactStack = error.stack
        .split("\n")
        .slice(0, 14)
        .join("\n");
      lines.push("ErrorStack:");
      lines.push(compactStack);
    }
  }

  lines.push("StartupLogTail:");
  if (logTail.length === 0) {
    lines.push("(empty)");
  } else {
    for (const entry of logTail) {
      lines.push(
        `${entry.timestamp} | ${entry.scope} | ${entry.level} | ${entry.message}` +
          (entry.details ? ` | ${JSON.stringify(entry.details)}` : "")
      );
    }
  }

  return lines.join("\n");
}
