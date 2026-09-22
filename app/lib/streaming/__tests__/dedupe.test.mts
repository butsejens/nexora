import test from "node:test";
import assert from "node:assert/strict";

import { dedupeStreams } from "../dedupe.ts";
import { normalizeAddonStream } from "../normalize.ts";
import type { StreamRequestContext } from "../types.ts";

const context: StreamRequestContext = {
  type: "movie",
  tmdbId: 603,
  imdbId: "tt0133093",
  title: "The Matrix",
};

test("dedupeStreams removes cross-provider duplicates by infoHash", () => {
  const fromTorrentio = normalizeAddonStream(
    "torrentio",
    0,
    { title: "1080p", infoHash: "SAMEHASH0000000000000000000000000000000" },
    context,
    0,
  )!;
  const fromComet = normalizeAddonStream(
    "comet",
    1,
    { title: "1080p", infoHash: "samehash0000000000000000000000000000000" },
    context,
    0,
  )!;

  const deduped = dedupeStreams([fromTorrentio, fromComet]);
  assert.equal(deduped.length, 1);
  // First occurrence wins — callers pass higher-priority providers first.
  assert.equal(deduped[0].providerId, "torrentio");
});

test("dedupeStreams removes duplicates by normalized playback url", () => {
  const a = normalizeAddonStream(
    "meteor",
    2,
    { title: "1080p", url: "https://cdn.example.com/file.mp4?token=abc" },
    context,
    0,
  )!;
  const b = normalizeAddonStream(
    "meteor",
    2,
    { title: "1080p", url: "https://cdn.example.com/file.mp4?token=xyz" },
    context,
    1,
  )!;

  const deduped = dedupeStreams([a, b]);
  assert.equal(deduped.length, 1);
});

test("dedupeStreams keeps distinct streams", () => {
  const a = normalizeAddonStream("torrentio", 0, { title: "1080p", infoHash: "aaa" }, context, 0)!;
  const b = normalizeAddonStream("comet", 1, { title: "720p", infoHash: "bbb" }, context, 0)!;
  assert.equal(dedupeStreams([a, b]).length, 2);
});
