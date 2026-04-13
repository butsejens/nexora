/**
 * Stream debug logger — centralized logging for the entire streaming pipeline.
 * Logs are kept in-memory (last 200 entries) and can be dumped via getStreamLogs().
 */

export type StreamLogLevel = "info" | "warn" | "error" | "debug";

export interface StreamLogEntry {
  ts: number;
  level: StreamLogLevel;
  tag: string;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 200;
const logs: StreamLogEntry[] = [];

export function streamLog(
  level: StreamLogLevel,
  tag: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: StreamLogEntry = { ts: Date.now(), level, tag, message, data };
  logs.push(entry);
  if (logs.length > MAX_ENTRIES) logs.shift();

  if (__DEV__) {
    const prefix = `[stream:${tag}]`;
    const extra = data ? ` ${JSON.stringify(data)}` : "";
    switch (level) {
      case "error":
        console.error(`${prefix} ${message}${extra}`);
        break;
      case "warn":
        console.warn(`${prefix} ${message}${extra}`);
        break;
      default:
        console.log(`${prefix} ${message}${extra}`);
    }
  }
}

/** Get all stream logs (newest last) */
export function getStreamLogs(): StreamLogEntry[] {
  return [...logs];
}

/** Clear all stream logs */
export function clearStreamLogs(): void {
  logs.length = 0;
}
