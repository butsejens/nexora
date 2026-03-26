type StartupScope = "boot" | "hydration" | "onboarding-preload" | "background";

type StartupLogLevel = "info" | "warn" | "error";

export type StartupTaskStatus = "success" | "timeout" | "error" | "skipped";

export type StartupTaskResult<T = void> = {
  scope: StartupScope;
  name: string;
  status: StartupTaskStatus;
  durationMs: number;
  value?: T;
  error?: string;
};

type StartupLogEntry = {
  timestamp: string;
  scope: StartupScope;
  level: StartupLogLevel;
  message: string;
  details?: Record<string, unknown>;
};

type RunStartupTaskOptions<T> = {
  scope: StartupScope;
  name: string;
  timeoutMs: number;
  run: () => Promise<T> | T;
};

const startupLogBuffer: StartupLogEntry[] = [];
const MAX_STARTUP_LOGS = 200;

function pushStartupLog(entry: StartupLogEntry) {
  startupLogBuffer.push(entry);
  if (startupLogBuffer.length > MAX_STARTUP_LOGS) {
    startupLogBuffer.splice(0, startupLogBuffer.length - MAX_STARTUP_LOGS);
  }
}

export function logStartupEvent(
  scope: StartupScope,
  level: StartupLogLevel,
  message: string,
  details?: Record<string, unknown>,
) {
  const entry: StartupLogEntry = {
    timestamp: new Date().toISOString(),
    scope,
    level,
    message,
    details,
  };
  pushStartupLog(entry);
  const prefix = `[startup:${scope}] ${message}`;
  if (level === "error") {
    console.error(prefix, details || {});
    return;
  }
  if (level === "warn") {
    console.warn(prefix, details || {});
    return;
  }
  console.info(prefix, details || {});
}

export function getStartupLogSnapshot(): StartupLogEntry[] {
  return [...startupLogBuffer];
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown startup error");
}

export async function runStartupTask<T>({ scope, name, timeoutMs, run }: RunStartupTaskOptions<T>): Promise<StartupTaskResult<T>> {
  const startedAt = Date.now();
  logStartupEvent(scope, "info", `${name}:start`, { timeoutMs });

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutResult = new Promise<StartupTaskResult<T>>((resolve) => {
      timeoutHandle = setTimeout(() => {
        const durationMs = Date.now() - startedAt;
        const result: StartupTaskResult<T> = {
          scope,
          name,
          status: "timeout",
          durationMs,
          error: `Timed out after ${timeoutMs}ms`,
        };
        logStartupEvent(scope, "warn", `${name}:timeout`, { durationMs, timeoutMs });
        resolve(result);
      }, timeoutMs);
    });

    const taskResult = Promise.resolve()
      .then(run)
      .then((value) => {
        const durationMs = Date.now() - startedAt;
        const result: StartupTaskResult<T> = {
          scope,
          name,
          status: "success",
          durationMs,
          value,
        };
        logStartupEvent(scope, "info", `${name}:success`, { durationMs });
        return result;
      })
      .catch((error: unknown) => {
        const durationMs = Date.now() - startedAt;
        const message = describeError(error);
        const result: StartupTaskResult<T> = {
          scope,
          name,
          status: "error",
          durationMs,
          error: message,
        };
        logStartupEvent(scope, "warn", `${name}:error`, { durationMs, error: message });
        return result;
      });

    return await Promise.race([taskResult, timeoutResult]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}