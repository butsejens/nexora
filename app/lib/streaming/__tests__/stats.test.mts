import test from "node:test";
import assert from "node:assert/strict";

import { ProviderStatsStore } from "../stats.ts";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test("records successes/failures and computes a rolling average response time", async () => {
  const store = new ProviderStatsStore(fakeStorage());
  await store.recordOutcome("torrentio", true, 100);
  await store.recordOutcome("torrentio", true, 300);
  await store.recordOutcome("torrentio", false, 200);

  const stats = store.get("torrentio");
  assert.equal(stats.attempts, 3);
  assert.equal(stats.successes, 2);
  assert.equal(stats.failures, 1);
  assert.equal(stats.avgResponseMs, 200);
});

test("persists across store instances sharing the same storage", async () => {
  const storage = fakeStorage();
  const first = new ProviderStatsStore(storage);
  await first.recordOutcome("comet", true, 500);

  const second = new ProviderStatsStore(storage);
  await second.ensureLoaded();
  assert.equal(second.get("comet").attempts, 1);
});

test("works without a storage backend (in-memory only)", async () => {
  const store = new ProviderStatsStore(null);
  await store.recordOutcome("meteor", false, 50);
  assert.equal(store.get("meteor").failures, 1);
});
