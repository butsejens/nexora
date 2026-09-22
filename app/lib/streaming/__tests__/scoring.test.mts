import test from "node:test";
import assert from "node:assert/strict";

import { isHardExcluded, scoreStream, sortByScore } from "../scoring.ts";
import { DEFAULT_DEVICE_CAPABILITIES, DEFAULT_STREAM_PREFERENCES } from "../config.ts";
import type { NormalizedStream, UserStreamPreferences } from "../types.ts";

function stream(overrides: Partial<NormalizedStream>): NormalizedStream {
  return {
    id: "id",
    providerId: "torrentio",
    providerPriority: 0,
    label: "stream",
    playbackUrl: "https://cdn.example.com/file.mp4",
    infoHash: null,
    magnetId: null,
    resolution: "1080p",
    videoCodec: "h264",
    audioCodec: "aac",
    isHdr: false,
    isDolbyVision: false,
    isCached: true,
    seeders: 40,
    sizeBytes: 2.2 * 1024 ** 3,
    languages: ["en"],
    matchesRequest: true,
    ...overrides,
  };
}

test("providers in the auto group (priority 0-2) always outscore legacy providers (priority 100+)", () => {
  const auto = scoreStream(
    stream({ providerPriority: 2, isCached: false, seeders: 0 }),
    DEFAULT_STREAM_PREFERENCES,
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  const legacy = scoreStream(
    stream({ providerPriority: 100, isCached: true, seeders: 500, resolution: "4k" }),
    DEFAULT_STREAM_PREFERENCES,
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  assert.ok(auto.score > legacy.score);
});

test("a reliable 1080p beats a risky, uncached 4K stream", () => {
  const reliable1080p = scoreStream(
    stream({ resolution: "1080p", isCached: true, seeders: 80 }),
    DEFAULT_STREAM_PREFERENCES,
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  const risky4k = scoreStream(
    stream({ resolution: "4k", isCached: false, seeders: 1 }),
    DEFAULT_STREAM_PREFERENCES,
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  assert.ok(reliable1080p.score > risky4k.score);
});

test("a cached, well-seeded 4K stream still beats 1080p", () => {
  const great4k = scoreStream(
    stream({ resolution: "4k", isCached: true, seeders: 200 }),
    DEFAULT_STREAM_PREFERENCES,
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  const okay1080p = scoreStream(
    stream({ resolution: "1080p", isCached: true, seeders: 40 }),
    DEFAULT_STREAM_PREFERENCES,
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  assert.ok(great4k.score > okay1080p.score);
});

test("isHardExcluded drops streams above the user's resolution cap", () => {
  const prefs: UserStreamPreferences = { ...DEFAULT_STREAM_PREFERENCES, maxResolution: "1080p" };
  assert.equal(isHardExcluded(stream({ resolution: "4k" }), prefs), true);
  assert.equal(isHardExcluded(stream({ resolution: "1080p" }), prefs), false);
});

test("isHardExcluded drops streams over the user's max file size", () => {
  const prefs: UserStreamPreferences = { ...DEFAULT_STREAM_PREFERENCES, maxFileSizeGb: 1 };
  assert.equal(isHardExcluded(stream({ sizeBytes: 3 * 1024 ** 3 }), prefs), true);
});

test("isHardExcluded drops mismatched episodes and disallowed Dolby Vision", () => {
  assert.equal(
    isHardExcluded(stream({ matchesRequest: false }), DEFAULT_STREAM_PREFERENCES),
    true,
  );
  const noHdrPrefs: UserStreamPreferences = { ...DEFAULT_STREAM_PREFERENCES, allowHdr: false };
  assert.equal(isHardExcluded(stream({ isDolbyVision: true }), noHdrPrefs), true);
});

test("Dolby Vision is penalized on devices that can't render it", () => {
  const scored = scoreStream(
    stream({ isDolbyVision: true }),
    DEFAULT_STREAM_PREFERENCES,
    { supportsDolbyVision: false, supportsHdr: true },
    undefined,
  );
  assert.ok(scored.scoreBreakdown.hdr < 0);
});

test("preferred language earns a bonus", () => {
  const withLanguage = scoreStream(
    stream({ languages: ["nl"] }),
    { ...DEFAULT_STREAM_PREFERENCES, preferredLanguage: "nl" },
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  const withoutLanguage = scoreStream(
    stream({ languages: ["fr"] }),
    { ...DEFAULT_STREAM_PREFERENCES, preferredLanguage: "nl" },
    DEFAULT_DEVICE_CAPABILITIES,
    undefined,
  );
  assert.ok(withLanguage.score > withoutLanguage.score);
});

test("provider track record shifts score up or down", () => {
  const goodHistory = scoreStream(stream({}), DEFAULT_STREAM_PREFERENCES, DEFAULT_DEVICE_CAPABILITIES, {
    attempts: 10,
    successes: 10,
    failures: 0,
    avgResponseMs: 500,
  });
  const badHistory = scoreStream(stream({}), DEFAULT_STREAM_PREFERENCES, DEFAULT_DEVICE_CAPABILITIES, {
    attempts: 10,
    successes: 1,
    failures: 9,
    avgResponseMs: 500,
  });
  assert.ok(goodHistory.score > badHistory.score);
});

test("sortByScore is deterministic and tie-breaks by priority then seeders", () => {
  const a = scoreStream(stream({ providerPriority: 1, seeders: 5 }), DEFAULT_STREAM_PREFERENCES, DEFAULT_DEVICE_CAPABILITIES, undefined);
  const b = { ...a, providerPriority: 0, seeders: 5 };
  const sorted = sortByScore([a, b]);
  assert.equal(sorted[0].providerPriority, 0);
});
