import { logSelfHealing } from "./logger";
import { recoverNavigation } from "./navigationRecovery";

let installed = false;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "unknown runtime error");
}

export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;

  const previous = (global as any).ErrorUtils?.getGlobalHandler?.();
  (global as any).ErrorUtils?.setGlobalHandler?.(
    (error: unknown, isFatal?: boolean) => {
      const message = toErrorMessage(error);
      void logSelfHealing("error", "CRASH", "global-error-captured", {
        message,
        isFatal: Boolean(isFatal),
      });
      if (isFatal) {
        recoverNavigation("fatal-runtime-error", { message });
      }
      if (typeof previous === "function") {
        try {
          previous(error, isFatal);
        } catch {
          // ignore chained handler failures
        }
      }
    },
  );
}

export function reportUiError(scope: string, error: unknown) {
  void logSelfHealing("error", "UI", "ui-error", {
    scope,
    message: toErrorMessage(error),
  });
}
