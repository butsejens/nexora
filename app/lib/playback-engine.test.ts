import assert from "node:assert/strict";
import { FALLBACK_PROVIDERS, isSafePlaybackUrl } from "./playback-engine";

const deadProviderIds = new Set([
  "vidfast",
  "moviesapi",
  "autoembed",
  "embedsu",
  "vidsrcstream",
  "2embedorg",
]);

test("fallback provider list excludes dead server endpoints", () => {
  const ids = FALLBACK_PROVIDERS.map((provider) => provider.id);
  for (const deadId of deadProviderIds) {
    assert.equal(ids.includes(deadId), false, `dead provider should not be active: ${deadId}`);
  }
});

test("blocked ad/popunder domains are filtered out", () => {
  assert.equal(
    isSafePlaybackUrl("https://doubleclick.net/ads?foo=bar"),
    false,
  );
  assert.equal(
    isSafePlaybackUrl("https://vidlink.pro/movie/550"),
    true,
  );
});

