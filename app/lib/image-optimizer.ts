/**
 * Image optimization utilities for Nexora
 * - Size-aware caching
 * - Resolution optimization
 * - Fallback chains
 */

import { Image } from "react-native";

type ImageSize = "thumbnail" | "small" | "medium" | "large" | "full";

interface OptimizedImageUrl {
  original: string;
  optimized: {
    thumbnail: string;
    small: string;
    medium: string;
    large: string;
  };
}

/**
 * Get optimized image URL based on display size
 * Useful for responsive image loading
 */
export function getOptimizedImageUrl(
  imageUrl: string,
  targetSize: ImageSize = "medium"
): string {
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) return imageUrl;

  // ESPN headshots - optimize based on size
  if (/a\.espncdn\.com\/i\/headshots\//i.test(imageUrl)) {
    const sizeMap: Record<ImageSize, string> = {
      thumbnail: imageUrl.replace("/full/", "/170/").replace(/\.png$/i, "_170x170.png"),
      small: imageUrl,  // default is ~200px
      medium: imageUrl,
      large: imageUrl,
      full: imageUrl.replace("/full/", "/500/"),
    };
    return sizeMap[targetSize] || imageUrl;
  }

  // ui-avatars.com - adjust size parameter
  if (/ui-avatars\.com/.test(imageUrl)) {
    const sizeMap: Record<ImageSize, number> = {
      thumbnail: 64,
      small: 128,
      medium: 256,
      large: 300,
      full: 512,
    };
    const size = sizeMap[targetSize] || 256;
    return imageUrl.replace(/size=\d+/, `size=${size}`);
  }

  // TheSportsDB - add size hints
  if (/thesportsdb\.com/i.test(imageUrl)) {
    // TheSportsDB doesn't have great size optimization, just return original
    return imageUrl;
  }

  // Generic fallback
  return imageUrl;
}

/**
 * Preload a set of images for better performance
 */
export async function preloadImages(urls: string[]): Promise<void> {
  if (typeof Image === "undefined") return;

  const validUrls = urls.filter((u) => u && /^https?:\/\//.test(u));
  const batches = Math.ceil(validUrls.length / 5);

  for (let i = 0; i < batches; i++) {
    const batch = validUrls.slice(i * 5, (i + 1) * 5);
    await Promise.all(
      batch.map((url) =>
        Image.prefetch ? Image.prefetch(url).catch(() => undefined) : Promise.resolve()
      )
    );
    // Small delay between batches to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Check if image URL is likely to be valid/accessible
 */
export function isImageUrlLikelyValid(url: string | null): boolean {
  if (!url || !/^https?:\/\//.test(String(url))) return false;

  // Blocklist obviously bad URLs
  if (/\bplaceholder\b|^about:/i.test(url)) return false;
  if (/\bdata:image/.test(url)) return false; // Data URLs don't cache well
  if (url.includes("undefined") || url.includes("null")) return false;

  return true;
}

/**
 * Cache buster for forcing refresh
 */
export function addCacheBuster(imageUrl: string, version: number = 1): string {
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) return imageUrl;

  const separator = imageUrl.includes("?") ? "&" : "?";
  return `${imageUrl}${separator}v=${version}`;
}
