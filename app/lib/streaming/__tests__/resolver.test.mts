import test from "node:test";
import assert from "node:assert/strict";

import { resolveAutoStreams } from "../resolver.ts";
import { DEFAULT_DEVICE_CAPABILITIES, DEFAULT_STREAM_PREFERENCES } from "../config.ts";
import type { ProviderRuntimeConfig, StreamRequestContext } from "../types.ts";

const context: StreamRequestContext = {
  type: "movie",
  tmdbId: 603,
  imdbId: "tt0133093",
  title: "The Matrix",
};

function configs(overrides: Partial<Record<string, Partial<ProviderRuntimeConfig>>> = {}) {
  const base: ProviderRuntimeConfig[] = [
    { id: "torrentio", endpoint: "https://torrentio.example", enabled: true, timeoutMs: 500 },
    { id: "comet", endpoint: "https://comet.example", enabled: true, timeoutMs: 500 },
    { id: "meteor", endpoint: "https://meteor.example", enabled: true, timeoutMs: 500 },
  ];
  return base.map((c) => ({ ...c, ...overrides[c.id] }));
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

test("fetches all three providers in parallel and requests the correct imdb-based URL", async () => {
  const requestedUrls: string[] = [];
  const fetchFn = (async (url: string) => {
    requestedUrls.push(url);
    if (url.includes("torrentio")) {
      return jsonResponse({ streams: [{ title: "1080p", infoHash: "aaa", name: "Torrentio" }] });
    }
    return jsonResponse({ streams: [] });
  }) as unknown as typeof fetch;

  await resolveAutoStreams({
    configs: configs(),
    context,
    prefs: DEFAULT_STREAM_PREFERENCES,
    device: DEFAULT_DEVICE_CAPABILITIES,
    stats: {},
    fetchFn,
  });

  assert.ok(requestedUrls.some((u) => u === "https://torrentio.example/stream/movie/tt0133093.json"));
  assert.equal(requestedUrls.length, 3);
});

test("builds season/episode ids for series requests", async () => {
  const requestedUrls: string[] = [];
  const fetchFn = (async (url: string) => {
    requestedUrls.push(url);
    return jsonResponse({ streams: [] });
  }) as unknown as typeof fetch;

  await resolveAutoStreams({
    configs: configs(),
    context: { ...context, type: "series", seasonNumber: 1, episodeNumber: 2, imdbId: "tt0903747" },
    prefs: DEFAULT_STREAM_PREFERENCES,
    device: DEFAULT_DEVICE_CAPABILITIES,
    stats: {},
    fetchFn,
  });

  assert.ok(requestedUrls.some((u) => u.endsWith("/stream/series/tt0903747%3A1%3A2.json")));
});

test("one offline provider does not block the others (timeout isolation)", async () => {
  const fetchFn = (async (url: string, init?: { signal?: AbortSignal }) => {
    if (url.includes("comet")) {
      // Simulate a provider that never responds until aborted.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }) as Promise<Response>;
    }
    return jsonResponse({ streams: [{ title: "1080p", infoHash: url }] });
  }) as unknown as typeof fetch;

  const result = await resolveAutoStreams({
    configs: configs({ comet: { timeoutMs: 50 } }),
    context,
    prefs: DEFAULT_STREAM_PREFERENCES,
    device: DEFAULT_DEVICE_CAPABILITIES,
    stats: {},
    fetchFn,
  });

  const cometOutcome = result.outcomes.find((o) => o.providerId === "comet");
  assert.equal(cometOutcome?.ok, false);
  assert.ok(result.streams.some((s) => s.providerId === "torrentio"));
  assert.ok(result.streams.some((s) => s.providerId === "meteor"));
});

test("all three providers offline returns an empty ranked list", async () => {
  const fetchFn = (async () => {
    throw new Error("network unreachable");
  }) as unknown as typeof fetch;

  const result = await resolveAutoStreams({
    configs: configs(),
    context,
    prefs: DEFAULT_STREAM_PREFERENCES,
    device: DEFAULT_DEVICE_CAPABILITIES,
    stats: {},
    fetchFn,
  });

  assert.equal(result.streams.length, 0);
  assert.ok(result.outcomes.every((o) => o.ok === false));
});

test("deduplicates across providers and ranks the best stream first", async () => {
  const fetchFn = (async (url: string) => {
    if (url.includes("torrentio")) {
      return jsonResponse({
        streams: [{ title: "1080p BluRay x264", infoHash: "shared-hash", name: "Torrentio" }],
      });
    }
    if (url.includes("comet")) {
      return jsonResponse({
        streams: [
          { title: "1080p BluRay x264", infoHash: "SHARED-HASH", name: "Comet" },
          { title: "4K HDR", url: "https://cdn.example/4k.mp4", name: "Comet 4K" },
        ],
      });
    }
    return jsonResponse({ streams: [] });
  }) as unknown as typeof fetch;

  const result = await resolveAutoStreams({
    configs: configs(),
    context,
    prefs: DEFAULT_STREAM_PREFERENCES,
    device: DEFAULT_DEVICE_CAPABILITIES,
    stats: {},
    fetchFn,
  });

  // The infoHash duplicate should only appear once, kept from torrentio
  // (fetched/scored first thanks to its higher priority).
  const hashMatches = result.streams.filter((s) => s.infoHash === "shared-hash");
  assert.equal(hashMatches.length, 1);
  assert.equal(hashMatches[0].providerId, "torrentio");
});

test("respects user resolution cap by excluding higher-tier streams", async () => {
  const fetchFn = (async () =>
    jsonResponse({
      streams: [
        { title: "4K HDR", url: "https://cdn.example/4k.mp4" },
        { title: "1080p", url: "https://cdn.example/1080p.mp4" },
      ],
    })) as unknown as typeof fetch;

  const result = await resolveAutoStreams({
    configs: configs({ comet: { enabled: false }, meteor: { enabled: false } }),
    context,
    prefs: { ...DEFAULT_STREAM_PREFERENCES, maxResolution: "1080p" },
    device: DEFAULT_DEVICE_CAPABILITIES,
    stats: {},
    fetchFn,
  });

  assert.ok(result.streams.every((s) => s.resolution !== "4k"));
});
