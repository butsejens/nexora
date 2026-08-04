import type { QueryClient } from "@tanstack/react-query";
import { prefetchAutonomousContent } from "./contentSync";
import { runHealthCheck } from "./healthMonitor";
import { refreshMaintenanceSnapshot } from "./maintenanceMode";
import { logAutonomousEvent } from "./autonomousLogger";

export async function runAutonomousStartup(_queryClient: QueryClient): Promise<void> {
  const tasks = [
    runHealthCheck(),
    refreshMaintenanceSnapshot(),
    prefetchAutonomousContent(),
  ];
  const settled = await Promise.allSettled(tasks);
  const failed = settled.filter((result) => result.status === "rejected").length;
  if (failed > 0) {
    logAutonomousEvent("warn", "startup", "autonomous-startup-partial", { failed });
  } else {
    logAutonomousEvent("info", "startup", "autonomous-startup-complete");
  }
}

