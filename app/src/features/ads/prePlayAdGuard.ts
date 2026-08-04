import { AUTONOMOUS_CONFIG } from "@/src/core/autonomous/autonomousConfig";
import { logAutonomousEvent } from "@/src/core/autonomous/autonomousLogger";
import { isAdAllowed, markAdFailure, markAdShown } from "./adCooldown";

function timeoutPromise(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
}

/**
 * Non-blocking ad guard:
 * - respects cooldown
 * - if ad provider isn't ready, resolves quickly
 * - never blocks playback forever
 */
export async function runPrePlayAdGuard(): Promise<{
  attempted: boolean;
  shown: boolean;
  skipped: boolean;
}> {
  if (!AUTONOMOUS_CONFIG.ads.enabled) {
    return { attempted: false, shown: false, skipped: true };
  }

  const allowed = await isAdAllowed();
  if (!allowed) return { attempted: false, shown: false, skipped: true };

  const timeoutMs = AUTONOMOUS_CONFIG.ads.prePlayTimeoutMs;

  try {
    const result = await Promise.race([
      Promise.resolve("skip" as const),
      timeoutPromise(timeoutMs),
    ]);

    if (result === "timeout") {
      await markAdFailure(AUTONOMOUS_CONFIG.ads.maxFailuresBeforeCooldownMs);
      logAutonomousEvent("warn", "ads", "preplay-timeout-skip");
      return { attempted: true, shown: false, skipped: true };
    }

    await markAdShown(AUTONOMOUS_CONFIG.ads.prePlayCooldownMs);
    logAutonomousEvent("info", "ads", "preplay-safely-skipped");
    return { attempted: true, shown: false, skipped: true };
  } catch (error) {
    await markAdFailure(AUTONOMOUS_CONFIG.ads.maxFailuresBeforeCooldownMs);
    logAutonomousEvent("warn", "ads", "preplay-failed-skip", {
      error: String((error as any)?.message || error || "unknown"),
    });
    return { attempted: true, shown: false, skipped: true };
  }
}

