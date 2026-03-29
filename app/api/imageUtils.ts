import { Image } from "expo-image";

const TRANSFERMARKT_HOST_REGEX = /(transfermarkt\.technology|img\.[a-z]\.transfermarkt|img\.a\.transfermarkt)/i;

export function proxiedImageUrl(uri?: string | null): string | null {
  const raw = String(uri || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  if (!TRANSFERMARKT_HOST_REGEX.test(raw)) return raw;
  return `/api/img?url=${encodeURIComponent(raw)}`;
}

export function buildCachedImageSource(uri?: string | null): { uri: string; cachePolicy: "disk" | "memory-disk" } | null {
  const proxied = proxiedImageUrl(uri);
  if (!proxied) return null;
  return { uri: proxied, cachePolicy: "disk" };
}

export async function prefetchImage(uri?: string | null): Promise<boolean> {
  const proxied = proxiedImageUrl(uri);
  if (!proxied) return false;
  try {
    await Image.prefetch(proxied, "disk");
    return true;
  } catch {
    return false;
  }
}
