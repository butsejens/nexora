import assert from "node:assert/strict";
import test from "node:test";

import { validateBeforePlay } from "./playerGuard.ts";

test("accepts live content type with a valid stream URL", () => {
  const result = validateBeforePlay({
    id: "live-disney",
    type: "live",
    sourceUrl: "https://example.com/channel.m3u8",
  });

  assert.deepEqual(result, { ok: true });
});

test("rejects unknown content types", () => {
  const result = validateBeforePlay({
    id: "x-1",
    type: "unknown",
    sourceUrl: "https://example.com/channel.m3u8",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "Onbekend contenttype voor afspelen.");
  }
});
