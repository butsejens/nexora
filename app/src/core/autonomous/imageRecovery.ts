import { resolveImageFallbackChain } from "@/core/self-healing/imageFallback";

export function getAutonomousImageChain(
  uri: string | null | undefined,
  cachedUri?: string | null,
): string[] {
  const chain = resolveImageFallbackChain(uri);
  if (cachedUri) {
    chain.splice(Math.min(1, chain.length), 0, cachedUri);
  }
  return Array.from(new Set(chain.filter(Boolean)));
}

