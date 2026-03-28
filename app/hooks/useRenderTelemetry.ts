import { useEffect, useRef } from "react";

import { logRealtimeEvent } from "@/services/realtime-telemetry";

export function useRenderTelemetry(screenName: string, details?: Record<string, unknown>) {
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    logRealtimeEvent("render", "screen-ready", {
      screen: screenName,
      durationMs: Date.now() - startedAtRef.current,
      ...details,
    });
  }, [details, screenName]);
}