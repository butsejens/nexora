import { useEffect, useRef } from "react";

import { logSelfHealing } from "./logger";

export function useRenderWatch(scope: string, warnThreshold = 35) {
  const renders = useRef(0);
  useEffect(() => {
    renders.current += 1;
    if (renders.current === warnThreshold) {
      void logSelfHealing("warn", "PERFORMANCE", "high-render-count", {
        scope,
        renders: renders.current,
      });
    }
  });
}

export function throttle<T extends (...args: any[]) => unknown>(fn: T, waitMs = 500) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queuedArgs: any[] | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const run = (runArgs: any[]) => {
      last = Date.now();
      fn(...(runArgs as Parameters<T>));
    };

    if (now - last >= waitMs) {
      run(args);
      return;
    }
    queuedArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (queuedArgs) {
        run(queuedArgs);
        queuedArgs = null;
      }
    }, waitMs);
  };
}
