/**
 * NEXORA SHARED UTILITIES
 *
 * Common functions used across the sports module.
 * Import from here rather than re-declaring locally.
 */

/**
 * Safely convert any value to a string — prevents [object Object] rendering.
 * Also handles null/undefined, Error objects, and nested message fields.
 */
export function safeStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    if (val instanceof Error) return val.message || "Error";
    if ("message" in val && typeof (val as any).message === "string")
      return (val as any).message;
    if ("name" in val && typeof (val as any).name === "string")
      return (val as any).name;
    try {
      return JSON.stringify(val);
    } catch {
      return "";
    }
  }
  return String(val);
}

/**
 * Clamp a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a raw percentage-like value to a rounded 0–100 integer.
 * Returns 0 if the value cannot be parsed.
 */
export function toPct(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Format milliseconds as a human-readable duration string (e.g. "2h 34m").
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Derive a flag emoji from an ISO-2 country code.
 * Returns 🏳️ for unknown codes.
 */
export function flagFromIso2(code: string): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (normalized === "SCO" || normalized === "SCOTLAND" || normalized === "GB-SCT" || normalized === "SCT") {
    return "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
  }
  if (!/^[A-Z]{2}$/.test(normalized)) return "🏳️";
  return String.fromCodePoint(
    ...normalized.split("").map((ch) => 127397 + ch.charCodeAt(0))
  );
}

/**
 * Normalize a league/team name to a lowercase ASCII key for comparison.
 */
export function normalizeKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Race a promise against a timeout.
 * Rejects with "Request timeout" if the promise does not resolve within `ms`.
 */
export function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), ms)
    ),
  ]);
}
