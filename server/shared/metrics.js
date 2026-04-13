/**
 * Lightweight in-process metrics collector.
 * Tracks upstream request counts, error rates, and latency per source.
 */

const counters = new Map(); // source → { ok, error, timeout, totalLatencyMs }

function getCounter(source) {
  if (!counters.has(source)) {
    counters.set(source, { ok: 0, error: 0, timeout: 0, totalLatencyMs: 0 });
  }
  return counters.get(source);
}

/**
 * Record one upstream request result.
 * @param {{ source: string, ok: boolean, isTimeout: boolean, latencyMs: number }} opts
 */
export function recordUpstreamRequest({ source, ok, isTimeout, latencyMs }) {
  const c = getCounter(String(source || "unknown"));
  if (ok) {
    c.ok += 1;
  } else if (isTimeout) {
    c.timeout += 1;
  } else {
    c.error += 1;
  }
  c.totalLatencyMs += Number(latencyMs) || 0;
}

/** Return a snapshot of all recorded counters. */
export function getMetricsSnapshot() {
  const result = {};
  for (const [source, c] of counters) {
    const total = c.ok + c.error + c.timeout;
    result[source] = {
      ...c,
      total,
      avgLatencyMs: total > 0 ? Math.round(c.totalLatencyMs / total) : 0,
    };
  }
  return result;
}

/** Reset all counters (e.g. for testing). */
export function resetMetrics() {
  counters.clear();
}
