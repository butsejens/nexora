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

const PREFIX_SEPARATOR = ":";

/**
 * Add namespace prefix to an ID
 * @param source - Content source (sports, media, channel)
 * @param id - Original ID (can be string or number)
 * @returns Namespaced ID "source:id"
 */
export function namespaceId(source: ContentSource, id: string | number): string {
  const idStr = typeof id === "number" ? id.toString() : id;
  return `${source}${PREFIX_SEPARATOR}${idStr}`;
}

/**
 * Extract source and original ID from namespaced ID
 * @param namespacedId - Prefixed ID like "sports:550" or "media:550"
 * @returns { source, id } or null if invalid format
 */
export function parseNamespacedId(namespacedId: string): { source: ContentSource; id: string } | null {
  const parts = namespacedId.split(PREFIX_SEPARATOR);
  if (parts.length !== 2) return null;
  const [source, id] = parts;
  if (!["sports", "media", "channel"].includes(source)) return null;
  return { source: source as ContentSource, id };
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
export function ensureNamespaced(source: ContentSource, id: string | number): string {
  const idStr = typeof id === "number" ? id.toString() : id;
  if (isNamespaced(idStr)) return idStr;
  return namespaceId(source, idStr);
}

/**
 * Get original ID from either namespaced or raw ID
 */
export function getRawId(id: string): string {
  const parsed = parseNamespacedId(id);
  return parsed ? parsed.id : id;
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
