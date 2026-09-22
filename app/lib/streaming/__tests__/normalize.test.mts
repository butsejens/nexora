import test from "node:test";
import assert from "node:assert/strict";

import {
  parseResolution,
  parseVideoCodec,
  parseAudioCodec,
  parseHdr,
  parseDolbyVision,
  parseCached,
  parseSeeders,
  parseSizeBytes,
  parseLanguages,
  normalizeAddonStream,
  dedupeKeyOf,
} from "../normalize.ts";
import type { StreamRequestContext } from "../types.ts";

const movieContext: StreamRequestContext = {
  type: "movie",
  tmdbId: 603,
  imdbId: "tt0133093",
  title: "The Matrix",
};

const seriesContext: StreamRequestContext = {
  type: "series",
  tmdbId: 1396,
  imdbId: "tt0903747",
  title: "Breaking Bad",
  seasonNumber: 1,
  episodeNumber: 2,
};

test("parseResolution recognizes common tags", () => {
  assert.equal(parseResolution("Movie.2024.2160p.WEB-DL"), "4k");
  assert.equal(parseResolution("Movie.2024.4K.HDR"), "4k");
  assert.equal(parseResolution("Movie.2024.1080p.BluRay"), "1080p");
  assert.equal(parseResolution("Movie.2024.720p"), "720p");
  assert.equal(parseResolution("Movie.2024.480p"), "480p");
  assert.equal(parseResolution("Movie.2024.DVDRip"), "unknown");
});

test("parseVideoCodec / parseAudioCodec / hdr / dolby vision", () => {
  assert.equal(parseVideoCodec("x265 HEVC"), "hevc");
  assert.equal(parseVideoCodec("x264"), "h264");
  assert.equal(parseAudioCodec("DDP5.1 Atmos DD+"), "eac3");
  assert.equal(parseAudioCodec("DTS-HD MA"), "dts-hd");
  assert.equal(parseHdr("2160p HDR10"), true);
  assert.equal(parseHdr("1080p"), false);
  assert.equal(parseDolbyVision("2160p Dolby Vision"), true);
  assert.equal(parseDolbyVision("2160p SDR"), false);
});

test("parseCached detects debrid/instant markers", () => {
  assert.equal(parseCached("⚡ Instant | RD+"), true);
  assert.equal(parseCached("Torrentio | 1080p"), false);
});

test("parseSeeders and parseSizeBytes read Torrentio-style annotations", () => {
  assert.equal(parseSeeders("👤 128 💾 4.2 GB ⚙️ YTS"), 128);
  assert.equal(parseSeeders("Seeders: 12"), 12);
  assert.equal(parseSeeders("no info"), null);

  const bytes = parseSizeBytes("👤 128 💾 4.2 GB ⚙️ YTS");
  assert.ok(bytes && Math.abs(bytes - 4.2 * 1024 ** 3) < 1024);
});

test("parseLanguages finds known tags", () => {
  assert.deepEqual(new Set(parseLanguages("MULTI Dutch English")), new Set(["multi", "nl", "en"]));
});

test("normalizeAddonStream builds a NormalizedStream from a Torrentio-shaped payload", () => {
  const stream = normalizeAddonStream(
    "torrentio",
    0,
    {
      name: "Torrentio\n1080p",
      title: "The.Matrix.1999.1080p.BluRay.x264-GROUP\n👤 50 💾 2.1 GB",
      infoHash: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    },
    movieContext,
    0,
  );

  assert.ok(stream);
  assert.equal(stream?.providerId, "torrentio");
  assert.equal(stream?.resolution, "1080p");
  assert.equal(stream?.videoCodec, "h264");
  assert.equal(stream?.infoHash, "abcdef1234567890abcdef1234567890abcdef12");
  assert.equal(stream?.seeders, 50);
});

test("normalizeAddonStream flags mismatched episode packs for series", () => {
  const wrongEpisode = normalizeAddonStream(
    "comet",
    1,
    { title: "Breaking.Bad.S01E05.1080p", url: "https://cdn.example/file.mp4" },
    seriesContext,
    0,
  );
  assert.equal(wrongEpisode?.matchesRequest, false);

  const correctEpisode = normalizeAddonStream(
    "comet",
    1,
    { title: "Breaking.Bad.S01E02.1080p", url: "https://cdn.example/file2.mp4" },
    seriesContext,
    1,
  );
  assert.equal(correctEpisode?.matchesRequest, true);
});

test("normalizeAddonStream returns null when there is nothing playable", () => {
  const stream = normalizeAddonStream("meteor", 2, { title: "no url or hash" }, movieContext, 0);
  assert.equal(stream, null);
});

test("dedupeKeyOf prefers infoHash, then magnet id, then normalized url", () => {
  const byHash = normalizeAddonStream(
    "torrentio",
    0,
    { title: "1080p", infoHash: "aaaa" },
    movieContext,
    0,
  );
  assert.equal(dedupeKeyOf(byHash!), "hash:aaaa");

  const byMagnet = normalizeAddonStream(
    "comet",
    1,
    { title: "1080p", url: "magnet:?xt=urn:btih:BBBB1234&dn=x" },
    movieContext,
    0,
  );
  assert.equal(dedupeKeyOf(byMagnet!), "magnet:bbbb1234");

  const byUrl = normalizeAddonStream(
    "meteor",
    2,
    { title: "1080p", url: "https://cdn.example.com/path/file.mp4?token=secret" },
    movieContext,
    0,
  );
  assert.equal(dedupeKeyOf(byUrl!), "url:https://cdn.example.com/path/file.mp4");
});
