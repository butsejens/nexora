import assert from "node:assert/strict";
import test from "node:test";
import { tmdbMovieToNexora } from "../../lib/tmdb";
import { resolveBestPosterUri, resolveImageFallbackChain } from "./imageFallback";

test("upgrades TMDB poster urls to original first", () => {
  const result = resolveBestPosterUri("https://image.tmdb.org/t/p/w500/abc123.jpg");
  assert.equal(result, "https://image.tmdb.org/t/p/original/abc123.jpg");
});

test("upgrades bare TMDB poster paths to original first", () => {
  const result = resolveBestPosterUri("/abc123.jpg");
  assert.equal(result, "https://image.tmdb.org/t/p/original/abc123.jpg");
});

test("preserves non-TMDB urls", () => {
  const url = "https://example.com/image.jpg";
  assert.equal(resolveBestPosterUri(url), url);
});

test("returns placeholder for empty or invalid poster values", () => {
  assert.match(resolveBestPosterUri(null), /dummyimage\.com/);
  assert.match(resolveBestPosterUri(undefined), /dummyimage\.com/);
  assert.match(resolveBestPosterUri("/"), /dummyimage\.com/);
});

test("builds a best-first fallback chain for tmdb posters", () => {
  const chain = resolveImageFallbackChain("https://image.tmdb.org/t/p/w342/abc123.jpg");
  assert.deepEqual(chain.slice(0, 4), [
    "https://image.tmdb.org/t/p/original/abc123.jpg",
    "https://image.tmdb.org/t/p/w1280/abc123.jpg",
    "https://image.tmdb.org/t/p/w780/abc123.jpg",
    "https://image.tmdb.org/t/p/w500/abc123.jpg",
  ]);
});

test("maps tmdb movie images to highest quality originals", () => {
  const movie = tmdbMovieToNexora({
    id: 42,
    title: "Example",
    overview: "Example overview",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    genre_ids: [],
    vote_average: 8.4,
    release_date: "2024-01-01",
  });

  assert.equal(movie.poster, "https://image.tmdb.org/t/p/original/poster.jpg");
  assert.equal(movie.backdrop, "https://image.tmdb.org/t/p/original/backdrop.jpg");
});