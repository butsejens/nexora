import { logSelfHealing } from "./logger";

type DataRecoveryOptions<T> = {
  source: T[] | null | undefined;
  fallback: T[] | null | undefined;
  scope: string;
  onRefetch?: () => void;
};

export function recoverEmptyList<T>({
  source,
  fallback,
  scope,
  onRefetch,
}: DataRecoveryOptions<T>): T[] {
  const primary = Array.isArray(source) ? source : [];
  if (primary.length > 0) return primary;
  const safeFallback = Array.isArray(fallback) ? fallback : [];
  if (safeFallback.length > 0) {
    void logSelfHealing("warn", "DATA", "empty-data-fallback-used", {
      scope,
      count: safeFallback.length,
    });
    return safeFallback;
  }
  void logSelfHealing("warn", "DATA", "empty-data-trigger-refetch", { scope });
  onRefetch?.();
  return [];
}
