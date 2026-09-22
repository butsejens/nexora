import type { ProviderStats, StreamProviderId } from "./types.ts";

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const EMPTY_STATS: ProviderStats = {
  attempts: 0,
  successes: 0,
  failures: 0,
  avgResponseMs: 0,
};

/**
 * Tracks per-provider success/failure counts and rolling average response
 * time, persisted through an injected key/value store (AsyncStorage in the
 * app, an in-memory fake in tests).
 */
export class ProviderStatsStore {
  private cache: Partial<Record<StreamProviderId, ProviderStats>> = {};
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private readonly storage: KeyValueStorage | null;
  private readonly storageKey: string;

  constructor(
    storage: KeyValueStorage | null,
    storageKey = "cinelog.streamProviderStats.v1",
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded || !this.storage) {
      this.loaded = true;
      return;
    }
    if (!this.loadPromise) {
      this.loadPromise = this.storage
        .getItem(this.storageKey)
        .then((raw) => {
          if (raw) {
            try {
              this.cache = JSON.parse(raw) as Partial<Record<StreamProviderId, ProviderStats>>;
            } catch {
              this.cache = {};
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          this.loaded = true;
        });
    }
    await this.loadPromise;
  }

  get(id: StreamProviderId): ProviderStats {
    return this.cache[id] ?? EMPTY_STATS;
  }

  getAll(): Partial<Record<StreamProviderId, ProviderStats>> {
    return { ...this.cache };
  }

  private async persist(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.setItem(this.storageKey, JSON.stringify(this.cache));
    } catch {
      // Best-effort persistence — losing stats never blocks playback.
    }
  }

  async recordOutcome(
    id: StreamProviderId,
    ok: boolean,
    elapsedMs: number,
  ): Promise<void> {
    await this.ensureLoaded();
    const current = this.cache[id] ?? EMPTY_STATS;
    const attempts = current.attempts + 1;
    const successes = current.successes + (ok ? 1 : 0);
    const failures = current.failures + (ok ? 0 : 1);
    const avgResponseMs = Math.round(
      (current.avgResponseMs * current.attempts + elapsedMs) / attempts,
    );
    this.cache[id] = { attempts, successes, failures, avgResponseMs };
    await this.persist();
  }
}
