import type { NormalizedStream, StreamProviderId, StreamRequestContext } from "../types.ts";
import { normalizeAddonStream, type RawAddonStream } from "../normalize.ts";

function buildStreamId(context: StreamRequestContext): string | null {
  if (!context.imdbId) return null;
  if (context.type === "movie") return context.imdbId;
  if (!context.seasonNumber || !context.episodeNumber) return null;
  return `${context.imdbId}:${context.seasonNumber}:${context.episodeNumber}`;
}

/**
 * Shared client for the public Stremio "stream resource" protocol, which
 * Torrentio, Comet and Meteor all implement:
 * `GET {endpoint}/stream/{movie|series}/{id}.json` -> `{ streams: [...] }`.
 */
export async function fetchStremioAddonStreams(
  providerId: StreamProviderId,
  providerPriority: number,
  endpoint: string,
  context: StreamRequestContext,
  timeoutMs: number,
  signal?: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<NormalizedStream[]> {
  const streamId = buildStreamId(context);
  if (!streamId || !endpoint.trim()) return [];

  const base = endpoint.trim().replace(/\/+$/, "");
  const kind = context.type === "movie" ? "movie" : "series";
  const url = `${base}/stream/${kind}/${encodeURIComponent(streamId)}.json`;

  const ownController = signal ? null : new AbortController();
  const effectiveSignal = signal ?? ownController?.signal;
  const timer = ownController ? setTimeout(() => ownController.abort(), timeoutMs) : null;

  try {
    const res = await fetchFn(url, { signal: effectiveSignal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { streams?: RawAddonStream[] };
    const raw = Array.isArray(data?.streams) ? data.streams : [];
    const normalized: NormalizedStream[] = [];
    raw.forEach((entry, index) => {
      const stream = normalizeAddonStream(providerId, providerPriority, entry, context, index);
      if (stream) normalized.push(stream);
    });
    return normalized;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
