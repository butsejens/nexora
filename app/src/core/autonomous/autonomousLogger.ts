import { logSelfHealing } from "@/core/self-healing";

export type AutonomousLogCategory =
  | "api"
  | "startup"
  | "health"
  | "cache"
  | "content"
  | "ads"
  | "image"
  | "player"
  | "maintenance"
  | "performance";

export type AutonomousLogLevel = "info" | "warn" | "error";

export function logAutonomousEvent(
  level: AutonomousLogLevel,
  category: AutonomousLogCategory,
  message: string,
  context?: Record<string, unknown>,
) {
  const mappedCategory =
    category === "api" || category === "maintenance"
      ? "API"
      : category === "ads" || category === "player"
        ? "PLAYBACK"
        : category === "performance"
          ? "PERFORMANCE"
          : "UI";
  void logSelfHealing(level, mappedCategory, `[autonomous:${category}] ${message}`, context);
}

