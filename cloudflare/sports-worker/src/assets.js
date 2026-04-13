/**
 * R2 asset helpers for team logos, player photos, etc.
 * Optional utility for serving/caching static assets from Cloudflare R2.
 */

export async function getAssetFromR2(r2, assetPath) {
  if (!r2) return null;
  try {
    const obj = await r2.get(assetPath);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType || "application/octet-stream",
      cacheControl: obj.httpMetadata?.cacheControl || "public, max-age=604800",
    };
  } catch (_) {
    return null;
  }
}

export async function uploadAssetToR2(r2, assetPath, file, contentType) {
  if (!r2) return false;
  try {
    await r2.put(assetPath, file, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=604800, immutable",
      },
    });
    return true;
  } catch (_) {
    return false;
  }
}

export function buildAssetUrl(r2PublicUrl, assetPath) {
  if (!r2PublicUrl) return null;
  return `${r2PublicUrl.replace(/\/$/, "")}/${assetPath}`;
}

export async function serveAssetResponse(assetData) {
  if (!assetData) return null;
  const headers = new Headers();
  headers.set("content-type", assetData.contentType);
  headers.set("cache-control", assetData.cacheControl);
  return new Response(assetData.body, { headers });
}
