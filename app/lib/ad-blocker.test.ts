import assert from "node:assert/strict";
import test from "node:test";

import { pickBestLiveTvStream, shouldAllowLiveTvNavigation } from "./ad-blocker.ts";

test("allows the stream page but blocks popup and ad redirects for live-tv embeds", () => {
  assert.equal(shouldAllowLiveTvNavigation("https://example.com/live"), true);
  assert.equal(shouldAllowLiveTvNavigation("https://doubleclick.net/ads"), false);
  assert.equal(shouldAllowLiveTvNavigation("https://example.com/popunder"), false);
  assert.equal(shouldAllowLiveTvNavigation("https://example.com/stream?ads=1"), false);
});

test("picks the highest-priority stream source for a live-tv channel", () => {
  const best = pickBestLiveTvStream([
    { id: "fallback", label: "Fallback", url: "https://example.com/backup", priority: 3 },
    { id: "preferred", label: "Preferred", url: "https://example.com/primary", priority: 1 },
    { id: "secondary", label: "Secondary", url: "https://example.com/secondary", priority: 2 },
  ]);

  assert.ok(best);
  assert.equal(best?.id, "preferred");
  assert.equal(best?.url, "https://example.com/primary");
});
