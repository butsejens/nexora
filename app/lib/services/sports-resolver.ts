export interface SourceAttempt {
  source: string;
  ok: boolean;
  score: number;
  durationMs: number;
  reason?: string;
}

export interface ResolverMeta {
  strategy: string;
  selectedSource?: string;
  selectedScore: number;
  attempts: SourceAttempt[];
}

export interface ResolverResult<T> {
  data: T | null;
  meta: ResolverMeta;
}

export interface ResolverSource<T> {
  source: string;
  load: () => Promise<T | null | undefined>;
}

export interface ResolveFromSourcesOptions<T> {
  strategy: string;
  sources: ResolverSource<T>[];
  isUsable?: (value: T) => boolean;
  score?: (value: T) => number;
  minScore?: number;
  stopOnFirstUsable?: boolean;
  stopOnScore?: number;
  merge?: (primary: T, secondary: T) => T;
  debug?: boolean;
}

export async function resolveFromSources<T>(
  options: ResolveFromSourcesOptions<T>,
): Promise<ResolverResult<T>> {
  const isUsable = options.isUsable ?? ((value: T) => Boolean(value));
  const scoreFn = options.score ?? (() => 1);
  const minScore = options.minScore ?? 0;
  const stopOnFirstUsable = Boolean(options.stopOnFirstUsable);
  const stopOnScore =
    typeof options.stopOnScore === "number" ? options.stopOnScore : minScore;

  const attempts: SourceAttempt[] = [];
  const usable: Array<{ source: string; data: T; score: number }> = [];

  for (const entry of options.sources) {
    const started = Date.now();
    try {
      const loaded = await entry.load();
      const durationMs = Date.now() - started;
      if (loaded == null || !isUsable(loaded)) {
        attempts.push({
          source: entry.source,
          ok: false,
          score: 0,
          durationMs,
          reason: "empty",
        });
        continue;
      }
      const score = Math.max(0, Number(scoreFn(loaded)) || 0);
      attempts.push({ source: entry.source, ok: true, score, durationMs });
      usable.push({ source: entry.source, data: loaded, score });

      if (stopOnFirstUsable && score >= stopOnScore) {
        break;
      }
    } catch (err) {
      attempts.push({
        source: entry.source,
        ok: false,
        score: 0,
        durationMs: Date.now() - started,
        reason: err instanceof Error ? err.message : String(err ?? "error"),
      });
    }
  }

  usable.sort((a, b) => b.score - a.score);

  const best = usable[0];
  const second = usable[1];
  let selectedData: T | null = null;
  let selectedSource: string | undefined;
  let selectedScore = 0;

  if (best && best.score >= minScore) {
    selectedData = best.data;
    selectedSource = best.source;
    selectedScore = best.score;
    if (options.merge && second && second.score > 0) {
      selectedData = options.merge(best.data, second.data);
      selectedSource = `${best.source}+${second.source}`;
      selectedScore = Math.max(best.score, second.score);
    }
  }

  if (options.debug && __DEV__) {
    console.log(
      `[sports-resolver] ${options.strategy} source=${selectedSource || "none"} score=${selectedScore.toFixed(2)}`,
      attempts,
    );
  }

  return {
    data: selectedData,
    meta: {
      strategy: options.strategy,
      selectedSource,
      selectedScore,
      attempts,
    },
  };
}

export function scoreByFilledFields<T extends Record<string, unknown>>(
  value: T,
  fields: string[],
): number {
  if (!fields.length) return 0;
  let hits = 0;
  for (const field of fields) {
    const raw = value[field];
    if (Array.isArray(raw)) {
      if (raw.length > 0) hits += 1;
      continue;
    }
    if (typeof raw === "string") {
      if (raw.trim()) hits += 1;
      continue;
    }
    if (raw != null) hits += 1;
  }
  return hits / fields.length;
}

export function scoreByArrayBuckets(value: {
  live?: unknown[];
  upcoming?: unknown[];
  finished?: unknown[];
}): number {
  const live = Array.isArray(value.live) ? value.live.length : 0;
  const upcoming = Array.isArray(value.upcoming) ? value.upcoming.length : 0;
  const finished = Array.isArray(value.finished) ? value.finished.length : 0;
  const total = live + upcoming + finished;
  if (total <= 0) return 0;
  const diversity =
    Number(live > 0) + Number(upcoming > 0) + Number(finished > 0);
  return Math.min(1, total / 20) * 0.7 + (diversity / 3) * 0.3;
}
