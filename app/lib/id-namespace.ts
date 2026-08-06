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
 *   media:movie:550
 *   channel:france24
 *
 * Cinelog content IDs also use `tmdb_m_<id>` / `tmdb_s_<id>`. Those must be
 * normalized to the bare numeric TMDB id before API lookups and storage.
 */

export type ContentSource = "sports" | "media" | "channel";
/** TMDB movie and TV IDs are independent numbering spaces and commonly collide. */
export type MediaKind = "movie" | "series";

const PREFIX_SEPARATOR = ":";

/**
 * Parse Cinelog-prefixed TMDB ids like "tmdb_m_550" / "tmdb_s_1668".
 */
export function parseTmdbPrefixedId(
  id: string,
): { mediaKind: MediaKind; numericId: string } | null {
  const value = String(id || "").trim();
  const movie = value.match(/^tmdb_m_(\d+)$/i);
  if (movie?.[1]) return { mediaKind: "movie", numericId: movie[1] };
  const series = value.match(/^tmdb_s_(\d+)$/i);
  if (series?.[1]) return { mediaKind: "series", numericId: series[1] };
  return null;
}

/**
 * Strip tmdb_m_/tmdb_s_ prefixes (and namespacing) down to the API-ready id.
 */
export function normalizeMediaRawId(id: string | number): {
  id: string;
  mediaKind: MediaKind | null;
} {
  const idStr = typeof id === "number" ? id.toString() : String(id || "").trim();
  const namespaced = parseNamespacedId(idStr);
  const candidate = namespaced ? namespaced.id : idStr;
  const tmdb = parseTmdbPrefixedId(candidate);
  if (tmdb) {
    return {
      id: tmdb.numericId,
      mediaKind: namespaced?.mediaKind ?? tmdb.mediaKind,
    };
  }
  return {
    id: candidate,
    mediaKind: namespaced?.mediaKind ?? null,
  };
}

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
  const normalized = normalizeMediaRawId(id);
  const idStr = normalized.id;
  const kind = mediaKind ?? normalized.mediaKind ?? undefined;
  if (source === "media" && kind) {
    return `media${PREFIX_SEPARATOR}${kind}${PREFIX_SEPARATOR}${idStr}`;
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
 * Ensure an ID is namespaced (avoid double-prefixing).
 * Always normalizes tmdb_m_/tmdb_s_ ids to bare numeric TMDB ids.
 */
export function ensureNamespaced(
  source: ContentSource,
  id: string | number,
  mediaKind?: MediaKind,
): string {
  const idStr = typeof id === "number" ? id.toString() : String(id || "").trim();
  if (isNamespaced(idStr)) {
    const parsed = parseNamespacedId(idStr);
    if (!parsed) return idStr;
    const normalized = normalizeMediaRawId(parsed.id);
    const kind = mediaKind ?? parsed.mediaKind ?? normalized.mediaKind ?? undefined;
    // Rewrite legacy entries that still embed tmdb_m_/tmdb_s_ in the id segment.
    if (normalized.id !== parsed.id || (kind && parsed.mediaKind !== kind)) {
      return namespaceId(parsed.source, normalized.id, kind);
    }
    return idStr;
  }
  return namespaceId(source, idStr, mediaKind);
}

/**
 * Get original ID from either namespaced or raw ID.
 * Strips tmdb_m_/tmdb_s_ so API routes always receive a numeric TMDB id.
 */
export function getRawId(id: string): string {
  return normalizeMediaRawId(id).id;
}

/**
 * Get the known movie/series kind from a namespaced or tmdb-prefixed ID.
 */
export function getMediaKind(id: string): MediaKind | null {
  return normalizeMediaRawId(id).mediaKind;
}

/**
 * Get source from namespaced ID, or infer from type
 */
export function getSource(
  id: string,
  type?: "movie" | "series" | "channel" | "sport",
): ContentSource | null {
  const parsed = parseNamespacedId(id);
  if (parsed) return parsed.source;

  // tmdb_m_ / tmdb_s_ are always media
  if (parseTmdbPrefixedId(id)) return "media";

  // Fallback inference from type
  if (type === "sport") return "sports";
  if (type === "movie" || type === "series") return "media";
  if (type === "channel") return "channel";

  return null;
}

/**
 * Rewrite a stored favorite/history id into the canonical namespaced form.
 */
export function canonicalizeStoredMediaId(
  id: string,
  type?: "movie" | "series" | "channel" | "sport",
): string {
  const source =
    getSource(id, type) || (type === "sport" ? "sports" : "media");
  const mediaKind: MediaKind | undefined =
    type === "movie" || type === "series"
      ? type
      : getMediaKind(id) ?? undefined;
  return ensureNamespaced(source, id, mediaKind);
}
