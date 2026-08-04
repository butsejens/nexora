import { AUTONOMOUS_CONFIG } from "./autonomousConfig";
import { logAutonomousEvent } from "./autonomousLogger";

type RetryContext = {
  op: string;
  allowStatuses?: number[];
  maxAttempts?: number;
};

function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 429 || status >= 500;
}

function backoffDelay(attempt: number): number {
  const base = AUTONOMOUS_CONFIG.app.retryBaseDelayMs;
  const max = AUTONOMOUS_CONFIG.app.retryMaxDelayMs;
  return Math.min(base * 2 ** Math.max(0, attempt - 1), max);
}

export async function withRecovery<T>(
  fn: () => Promise<T>,
  context: RetryContext,
): Promise<T> {
  const maxAttempts = context.maxAttempts ?? AUTONOMOUS_CONFIG.app.maxRetryAttempts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.status || error?.response?.status || 0);
      const retryable = isRetryableStatus(status) || !status;
      if (!retryable || attempt >= maxAttempts) break;
      const delayMs = backoffDelay(attempt);
      logAutonomousEvent("warn", "api", "retrying-operation", {
        op: context.op,
        attempt,
        delayMs,
        status: status || null,
        error: String(error?.message || error || "unknown"),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logAutonomousEvent("error", "api", "operation-failed-after-retries", {
    op: context.op,
    error: String((lastError as any)?.message || lastError || "unknown"),
  });
  throw lastError;
}

