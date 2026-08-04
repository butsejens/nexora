import { logSelfHealing } from "./logger";

const PLACEHOLDER =
  "https://dummyimage.com/780x1170/0f1624/9fb0cf.png&text=Cinelog";

export function resolveImageFallbackChain(uri: string | null | undefined): string[] {
  const value = String(uri || "").trim();
  if (!value) return [PLACEHOLDER];
  const chain = [value];
  if (value.includes("/original")) chain.push(value.replace("/original", "/w780"));
  if (value.includes("/w780")) chain.push(value.replace("/w780", "/w500"));
  if (value.includes("/w500")) chain.push(value.replace("/w500", "/w342"));
  chain.push(PLACEHOLDER);
  return Array.from(new Set(chain));
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
