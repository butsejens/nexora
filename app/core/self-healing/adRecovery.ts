import { logSelfHealing } from "./logger";

export function recoverFromAdFailure(scope: string, reason?: string) {
  void logSelfHealing("warn", "AD", "ad-failure-skip", {
    scope,
    reason: reason || "unknown",
  });
  return { skipAd: true };
}
