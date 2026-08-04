import { Platform } from "react-native";

export type ServiceState = "healthy" | "degraded" | "maintenance";

export const AUTONOMOUS_CONFIG = {
  app: {
    startupBudgetMs: 9000,
    backgroundRefreshMinMs: 5 * 60 * 1000,
    maxRetryAttempts: 3,
    retryBaseDelayMs: 700,
    retryMaxDelayMs: 10_000,
  },
  cache: {
    swrStaleMs: 10 * 60 * 1000,
    contentTtlMs: 60 * 60 * 1000,
    healthTtlMs: 90 * 1000,
    maintenanceTtlMs: 30 * 1000,
  },
  health: {
    monitorIntervalMs: 60 * 1000,
    maxConsecutiveFailuresBeforeDegraded: 2,
  },
  ads: {
    enabled: true,
    prePlayTimeoutMs: 3500,
    prePlayCooldownMs: 8 * 60 * 1000,
    maxFailuresBeforeCooldownMs: 20 * 60 * 1000,
  },
  platform: {
    isWeb: Platform.OS === "web",
    isTV: Platform.isTV === true,
  },
} as const;

export const SAFE_CATEGORY_ORDER = [
  "trending",
  "popular",
  "top-rated",
  "new-releases",
  "action",
  "drama",
  "comedy",
  "horror",
  "sci-fi",
] as const;

export type SafeCategory = (typeof SAFE_CATEGORY_ORDER)[number];

