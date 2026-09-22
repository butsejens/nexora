import { dedupeKeyOf } from "./normalize.ts";
import type { NormalizedStream } from "./types.ts";

/**
 * Removes duplicate results across providers using infoHash > magnet id >
 * normalized URL (see `dedupeKeyOf`). Keeps the first occurrence encountered,
 * so callers should pass streams pre-sorted by provider priority.
 */
export function dedupeStreams(streams: NormalizedStream[]): NormalizedStream[] {
  const seen = new Set<string>();
  const out: NormalizedStream[] = [];
  for (const stream of streams) {
    const key = dedupeKeyOf(stream);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stream);
  }
  return out;
}
