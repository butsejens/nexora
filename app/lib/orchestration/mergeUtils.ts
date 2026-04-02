/**
 * Nexora – Field-level merge utilities
 *
 * RULE: A source may never overwrite a valid non-empty value with
 * null / undefined / empty string / empty array.
 *
 * Priority contract (enforced by callers, not here):
 *   Primary > Secondary > AI-enrichment
 */

// ─── Validity ─────────────────────────────────────────────────────────────────

/**
 * Returns true when `value` is considered a real, usable value.
 * null / undefined / "" / [] all count as "empty".
 */
export function isValidValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Return `candidate` only when `existing` is empty/invalid.
 * Otherwise keep `existing`.
 */
export function keepOrFill<T>(existing: T | null | undefined, candidate: T | null | undefined): T | null | undefined {
  return isValidValue(existing) ? existing : candidate;
}

// ─── Image URL validation ─────────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /no[_-]?image/i,
  /default[_-]?avatar/i,
  /ui-avatars\.com/i,
  /dummy/i,
];

/**
 * Returns the URL if it looks like a real image, or null otherwise.
 */
export function validateImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string" || url.trim().length === 0) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http") && !trimmed.startsWith("/")) return null;
  for (const pat of PLACEHOLDER_PATTERNS) {
    if (pat.test(trimmed)) return null;
  }
  return trimmed;
}

/**
 * Return `candidate` only if `existing` is an invalid/placeholder image.
 */
export function mergeImageUrl(
  existing: string | null | undefined,
  candidate: string | null | undefined,
): string | null {
  if (validateImageUrl(existing)) return existing!;
  return validateImageUrl(candidate) ?? null;
}

// ─── Object merging ───────────────────────────────────────────────────────────

type PlainObject = Record<string, unknown>;

/**
 * Merge `fallback` into `primary`.
 * - Scalar fields: only fill when primary field is empty/invalid.
 * - Array fields:  only fill when primary array is empty.
 * - Nested objects: NOT deep-merged (caller must handle recursion if needed).
 * - Fields present in fallback but NOT in primary are added.
 */
export function mergeWithFallback<T extends PlainObject>(
  primary: T,
  fallback: Partial<T>,
): T {
  if (!fallback || typeof fallback !== "object") return primary;

  const result = { ...primary } as T;

  for (const key of Object.keys(fallback) as (keyof T)[]) {
    const existing = result[key];
    const candidate = (fallback as T)[key];

    if (!isValidValue(existing) && isValidValue(candidate)) {
      result[key] = candidate;
    }
  }

  return result;
}

/**
 * Merge N sources in priority order (index 0 = highest priority).
 * Each subsequent source only fills fields that are still empty.
 */
export function mergeSources<T extends PlainObject>(sources: Partial<T>[]): Partial<T> {
  if (sources.length === 0) return {};
  let result = { ...sources[0] } as T;
  for (let i = 1; i < sources.length; i++) {
    result = mergeWithFallback(result, sources[i] as Partial<T>);
  }
  return result;
}
