/**
 * Nexora – Image Proxy & Processor (sharp)
 *
 * Provides a secure image proxy that:
 *   1. Fetches a remote image URL (allow-listed domains only)
 *   2. Resizes/converts it via sharp (WebP for speed, JPEG as fallback)
 *   3. Sets aggressive Cache-Control headers
 *
 * Endpoints:
 *   GET /api/image/proxy?url=<encoded>&w=200&h=200&format=webp
 *
 * Security:
 *   - Only allow-listed hostnames are proxied (SSRF prevention)
 *   - Max width/height capped at 800 px
 *   - Content-type validated before passing to sharp
 */

import { Router } from "express";
import sharp from "sharp";
import nodeFetch from "node-fetch";
import { createLogger } from "../shared/logger.js";

const log = createLogger("image-proxy");
const router = Router();

// ─── Allow-listed upstream domains (SSRF mitigation) ─────────────────────────
const ALLOWED_HOSTS = new Set([
  "a.espncdn.com",
  "a1.espncdn.com",
  "a2.espncdn.com",
  "a3.espncdn.com",
  "a4.espncdn.com",
  "media.api-sports.io",
  "media.footystats.org",
  "img.sofascore.com",
  "tmssl.akamaized.net", // Transfermarkt player images
  "images.fotmob.com",
  "resources.premierleague.com",
  "img.bundesliga.com",
  "assets.ligue1.fr",
  "cdn.statically.io",
  "upload.wikimedia.org",
  "raw.githubusercontent.com", // football-logos CDN
  "cdn.jsdelivr.net",
]);

const MAX_DIM = 800;
const TIMEOUT_MS = 8000;
const PROXY_CACHE_SECONDS = 86400; // 24 h

function clampDim(val, def = 200) {
  const n = parseInt(val, 10);
  if (!n || n <= 0) return def;
  return Math.min(n, MAX_DIM);
}

/**
 * Process an image buffer with sharp.
 *
 * @param {Buffer} inputBuffer
 * @param {{ width: number, height: number, format: string }} opts
 * @returns {Promise<{ data: Buffer, contentType: string }>}
 */
export async function processImage(
  inputBuffer,
  { width, height, format = "webp" } = {},
) {
  const allowedFormats = ["webp", "jpeg", "png", "avif"];
  const fmt = allowedFormats.includes(format) ? format : "webp";

  let pipeline = sharp(inputBuffer, { failOnError: false }).resize(
    width || null,
    height || null,
    { fit: "inside", withoutEnlargement: true },
  );

  switch (fmt) {
    case "webp":
      pipeline = pipeline.webp({ quality: 82 });
      break;
    case "jpeg":
      pipeline = pipeline.jpeg({ quality: 85 });
      break;
    case "png":
      pipeline = pipeline.png({ compressionLevel: 8 });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality: 70 });
      break;
  }

  const data = await pipeline.toBuffer();
  return { data, contentType: `image/${fmt}` };
}

// ─── GET /api/image/proxy ─────────────────────────────────────────────────────

router.get("/proxy", async (req, res) => {
  const rawUrl = String(req.query.url || "").trim();
  if (!rawUrl) return res.status(400).json({ error: "Missing url parameter" });

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    log.warn("blocked proxy request to non-allowed host", {
      hostname: parsed.hostname,
    });
    return res
      .status(403)
      .json({ error: "Host not allowed", hostname: parsed.hostname });
  }

  // Only http/https
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return res.status(400).json({ error: "Only http/https URLs allowed" });
  }

  const width = clampDim(req.query.w);
  const height = clampDim(req.query.h);
  const format = String(req.query.format || "webp").toLowerCase();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const upstream = await nodeFetch(rawUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Nexora-ImageProxy/1.0" },
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res
        .status(502)
        .json({ error: "Upstream did not return an image" });
    }

    const inputBuffer = Buffer.from(await upstream.arrayBuffer());
    const { data, contentType: outType } = await processImage(inputBuffer, {
      width,
      height,
      format,
    });

    res.set({
      "Content-Type": outType,
      "Cache-Control": `public, max-age=${PROXY_CACHE_SECONDS}, immutable`,
      "X-Image-Source": parsed.hostname,
    });
    return res.send(data);
  } catch (err) {
    if (err.name === "AbortError") {
      log.warn("image proxy timeout", { url: rawUrl });
      return res.status(504).json({ error: "Upstream image timeout" });
    }
    log.error("image proxy error", { url: rawUrl, message: err.message });
    return res.status(502).json({ error: "Failed to fetch or process image" });
  }
});

export { router };
export default router;
