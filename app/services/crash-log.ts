/**
 * crash-log.ts
 *
 * Persists fatal JS crash information to AsyncStorage so the next app launch
 * can display a crash report instead of silently failing.
 *
 * Designed to be called from the global ErrorUtils handler (index.js) as well
 * as from React's ErrorBoundary, so every crash path is covered.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const CRASH_LOG_KEY = "nexora_crash_log_v1";

export type CrashSource =
  | "global-handler"
  | "error-boundary"
  | "unhandled-rejection";

export type CrashLogEntry = {
  /** ISO timestamp of the crash */
  timestamp: string;
  /** Human-readable error message */
  message: string;
  /** Full stack trace (may be empty on minified builds) */
  stack: string;
  /** Whether the error was flagged as fatal by React Native */
  isFatal: boolean;
  /** Which mechanism caught the error */
  source: CrashSource;
};

/** Persist a crash to AsyncStorage so the next launch can surface it. */
export async function saveCrashToStorage(
  error: unknown,
  isFatal: boolean,
  source: CrashSource,
): Promise<void> {
  try {
    const entry: CrashLogEntry = {
      timestamp: new Date().toISOString(),
      message:
        error instanceof Error
          ? error.message || "Unknown error"
          : String(error ?? "Unknown error"),
      stack:
        error instanceof Error ? (error.stack ?? "") : "",
      isFatal,
      source,
    };
    await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(entry));
  } catch {
    // If AsyncStorage itself fails, there is nothing meaningful we can do.
  }
}

/** Read (but do NOT delete) the last persisted crash. */
export async function readPendingCrash(): Promise<CrashLogEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CrashLogEntry;
  } catch {
    return null;
  }
}

/** Delete the stored crash so it is not shown again on the next launch. */
export async function clearCrashLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_LOG_KEY);
  } catch {
    // Best-effort.
  }
}
