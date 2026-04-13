type RealtimeTelemetryType =
  | "fetch"
  | "cache"
  | "realtime"
  | "render"
  | "startup"
  | "image";

export type RealtimeTelemetryEntry = {
  timestamp: string;
  type: RealtimeTelemetryType;
  name: string;
  details?: Record<string, unknown>;
};

const realtimeTelemetryBuffer: RealtimeTelemetryEntry[] = [];
const MAX_REALTIME_LOGS = 300;

function pushRealtimeTelemetry(entry: RealtimeTelemetryEntry) {
  realtimeTelemetryBuffer.push(entry);
  if (realtimeTelemetryBuffer.length > MAX_REALTIME_LOGS) {
    realtimeTelemetryBuffer.splice(
      0,
      realtimeTelemetryBuffer.length - MAX_REALTIME_LOGS,
    );
  }
}

export function logRealtimeEvent(
  type: RealtimeTelemetryType,
  name: string,
  details?: Record<string, unknown>,
) {
  const entry: RealtimeTelemetryEntry = {
    timestamp: new Date().toISOString(),
    type,
    name,
    details,
  };
  pushRealtimeTelemetry(entry);
  if (__DEV__) console.info(`[realtime:${type}] ${name}`, details || {});
}

export async function measureRealtimeTask<T>(
  type: RealtimeTelemetryType,
  name: string,
  run: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await run();
    logRealtimeEvent(type, `${name}:success`, {
      ...details,
      durationMs: Date.now() - startedAt,
    });
    return value;
  } catch (error) {
    logRealtimeEvent(type, `${name}:error`, {
      ...details,
      durationMs: Date.now() - startedAt,
      error:
        error instanceof Error ? error.message : String(error || "unknown"),
    });
    throw error;
  }
}

export function getRealtimeTelemetrySnapshot(): RealtimeTelemetryEntry[] {
  return [...realtimeTelemetryBuffer];
}
