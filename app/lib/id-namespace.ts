/**
 * ID Namespace Utilities
 * 
 * Prevents collision between sports IDs and media IDs (both can be numeric).
 * All IDs must be prefixed with their source domain when stored in:
 * - favorites
 * - history  
 * - cache keys
 * - AsyncStorage
 * 
 * Format: "{domain}:{id}"
 * Examples:
 *   sports:espn_12345
 *   sports:550
 *   media:550
 *   channel:france24
 */

export type ContentSource = "sports" | "media" | "channel";
/** TMDB movie and TV IDs are independent numbering spaces and commonly collide. */
export type MediaKind = "movie" | "series";

const PREFIX_SEPARATOR = ":";

/**
 * Add namespace prefix to an ID.
 * For "media" IDs, pass mediaKind so movie/series is baked into the ID —
 * TMDB movie and TV IDs overlap, so the same numeric ID can point to two
 * unrelated titles and must never be guessed at lookup time.
 * @returns Namespaced ID "source:id" or "media:movie|series:id"
 */
export function namespaceId(
  source: ContentSource,
  id: string | number,
  mediaKind?: MediaKind,
): string {
  const idStr = typeof id === "number" ? id.toString() : id;
  if (source === "media" && mediaKind) {
    return `media${PREFIX_SEPARATOR}${mediaKind}${PREFIX_SEPARATOR}${idStr}`;
  }
  return `${source}${PREFIX_SEPARATOR}${idStr}`;
}

/**
 * Extract source, mediaKind (if known) and original ID from a namespaced ID.
 * Supports both "source:id" and "media:movie|series:id" formats.
 * @param namespacedId - Prefixed ID like "sports:550", "media:550" or "media:movie:550"
 * @returns { source, id, mediaKind } or null if invalid format
 */
export function parseNamespacedId(
  namespacedId: string,
): { source: ContentSource; id: string; mediaKind: MediaKind | null } | null {
  const parts = namespacedId.split(PREFIX_SEPARATOR);

  if (parts.length === 3) {
    const [source, kind, id] = parts;
    if (source === "media" && (kind === "movie" || kind === "series") && id) {
      return { source: "media", id, mediaKind: kind };
    }
    return null;
  }

  if (parts.length === 2) {
    const [source, id] = parts;
    if (!["sports", "media", "channel"].includes(source)) return null;
    return { source: source as ContentSource, id, mediaKind: null };
  }

  return null;
}

/**
 * Check if ID is already namespaced
 */
export function isNamespaced(id: string): boolean {
  return id.includes(PREFIX_SEPARATOR) && parseNamespacedId(id) !== null;
}

/**
 * Ensure an ID is namespaced (avoid double-prefixing)
 */
export function ensureNamespaced(
  source: ContentSource,
  id: string | number,
  mediaKind?: MediaKind,
): string {
  const idStr = typeof id === "number" ? id.toString() : id;
  if (isNamespaced(idStr)) return idStr;
  return namespaceId(source, idStr, mediaKind);
}

/**
 * Get original ID from either namespaced or raw ID
 */
export function getRawId(id: string): string {
  const parsed = parseNamespacedId(id);
  return parsed ? parsed.id : id;
}

/**
 * Get the known movie/series kind from a namespaced ID, if it was recorded.
 * Returns null for legacy IDs stored before kind-tagging existed.
 */
export function getMediaKind(id: string): MediaKind | null {
  const parsed = parseNamespacedId(id);
  return parsed ? parsed.mediaKind : null;
}

/**
 * Get source from namespaced ID, or infer from type
 */
export function getSource(id: string, type?: "movie" | "series" | "channel" | "sport"): ContentSource | null {
  const parsed = parseNamespacedId(id);
  if (parsed) return parsed.source;
  
  // Fallback inference from type
  if (type === "sport") return "sports";
  if (type === "movie" || type === "series") return "media";
  if (type === "channel") return "channel";
  
  return null;
}
