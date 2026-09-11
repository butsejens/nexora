/** CineLog — display formatting helpers. */

/** `142` → `"2h 22m"`, `48` → `"48m"`, `0` → `""`. */
export function formatRuntime(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(minutes ?? 0)));
  if (!total) return "";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** `1240` → `"1,240"` for vote counts and similar. */
export function formatCount(value: number | null | undefined): string {
  const count = Math.max(0, Math.round(Number(value ?? 0)));
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return String(count);
}

/**
 * `"2024-03-14"` → `"14 Mar 2024"`. Returns `""` for missing dates. Pass the
 * viewer's locale (see `useLocale`) so the month name matches the interface.
 */
export function formatDate(
  value: string | null | undefined,
  locale = "en-GB",
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `8.734` → `"8.7"`; returns `""` when there is no meaningful score. */
export function formatRating(value: number | null | undefined): string {
  const rating = Number(value ?? 0);
  if (!Number.isFinite(rating) || rating <= 0) return "";
  return rating.toFixed(1);
}

/** `"S03 E06"` label for a series episode. */
export function formatEpisodeCode(
  seasonNumber: number | undefined,
  episodeNumber: number | undefined,
): string {
  if (!seasonNumber || !episodeNumber) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `S${pad(seasonNumber)} E${pad(episodeNumber)}`;
}

/** Join non-empty metadata fragments with a middle dot. */
export function metaLine(
  parts: (string | number | null | undefined)[],
): string {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" • ");
}
