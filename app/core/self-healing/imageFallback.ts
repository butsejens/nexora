import { logSelfHealing } from "./logger";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const TMDB_POSTER_SIZES = ["original", "w1280", "w780", "w500"] as const;
const TMDB_HEADER_SIZES = ["original", "w1280", "w780"] as const;
const PLACEHOLDER =
  "https://dummyimage.com/780x1170/0f1624/9fb0cf.png&text=Cinelog";

function extractTmdbPath(value: string): string | null {
  if (!value.includes("tmdb.org")) return null;
  const match = value.match(/\/t\/p\/(?:original|w1280|w780|w500|w342)(\/.*)$/i);
  return match?.[1] || null;
}

function buildTmdbPosterChain(value: string, sizes: readonly string[] = TMDB_POSTER_SIZES): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return [];

  const path = trimmed.startsWith("/")
    ? trimmed
    : extractTmdbPath(trimmed);

  if (!path) return [trimmed];

  return sizes.map((size) => `${TMDB_IMAGE_BASE}/${size}${path}`);
}

function buildTmdbHeaderChain(value: string): string[] {
  return buildTmdbPosterChain(value, TMDB_HEADER_SIZES);
}

export function resolveBestPosterUri(uri: string | null | undefined): string {
  const value = String(uri || "").trim();
  if (!value) return PLACEHOLDER;
  const chain = buildTmdbPosterChain(value);
  return chain[0] || PLACEHOLDER;
}

export function resolveImageFallbackChain(uri: string | null | undefined): string[] {
  const value = String(uri || "").trim();
  if (!value) return [PLACEHOLDER];
  const chain = buildTmdbHeaderChain(value);
  if (chain.length === 0) chain.push(value);
  chain.push(PLACEHOLDER);
  return Array.from(new Set(chain));
}

export function resolveBestHeaderUri(uri: string | null | undefined): string {
  const value = String(uri || "").trim();
  if (!value) return PLACEHOLDER;
  const chain = buildTmdbHeaderChain(value);
  return chain[0] || PLACEHOLDER;
}

export function logImageFallback(scope: string, from: string, to: string) {
  void logSelfHealing("warn", "UI", "image-fallback-applied", {
    scope,
    from,
    to,
  });
}

export function getImagePlaceholder() {
  return PLACEHOLDER;
}
