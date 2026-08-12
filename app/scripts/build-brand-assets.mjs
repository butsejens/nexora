#!/usr/bin/env node
/**
 * Renders the CineLog brand PNGs from the SVG sources in assets/images, plus the
 * web files that must keep stable, unhashed URLs (favicon, apple-touch-icon and
 * the Open Graph card) which therefore live in public/.
 *
 * Run after changing any brand SVG:
 *   npm -w app run brand:assets
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const images = join(here, "..", "assets", "images");
const publicDir = join(here, "..", "public");

/** `[source SVG, output PNG, pixel size]` */
const APP_ICONS = [
  ["logo.svg", "icon.png", 1024],
  ["logo.svg", "logo.png", 1024],
  ["logo.svg", "splash-icon.png", 1024],
  ["logo.svg", "favicon.png", 256],
  ["android-foreground.svg", "android-icon-foreground.png", 1024],
  ["android-background.svg", "android-icon-background.png", 1024],
  ["android-monochrome.svg", "android-icon-monochrome.png", 1024],
];

/** Stable-path web icons; `public/` is copied to the export root verbatim. */
const WEB_ICONS = [
  ["logo.svg", "icon.png", 512],
  ["logo.svg", "apple-touch-icon.png", 180],
];

const OG_CARD = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101216"/>
      <stop offset="1" stop-color="#08090B"/>
    </linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF3B5C"/>
      <stop offset="1" stop-color="#B00C22"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1080" cy="90" r="300" fill="#E8112D" opacity="0.10"/>
  <g transform="translate(96 214) scale(0.39)">
    <rect x="0" y="0" width="512" height="512" rx="133" fill="url(#mark)"/>
    <g fill="#F5F6F8" opacity="0.95">
      <rect x="58" y="92" width="52" height="52" rx="18"/>
      <rect x="58" y="178" width="52" height="52" rx="18"/>
      <rect x="58" y="264" width="52" height="52" rx="18"/>
      <rect x="58" y="350" width="52" height="52" rx="18"/>
    </g>
    <path d="M 397.7 176.9 A 118 118 0 1 0 397.7 335.1" fill="none" stroke="#F5F6F8" stroke-width="54" stroke-linecap="round"/>
  </g>
  <text x="320" y="308" font-family="Inter, Helvetica, Arial, sans-serif" font-size="104" font-weight="800" fill="#F5F6F8" letter-spacing="-3">Cine<tspan fill="#E8112D">Log</tspan></text>
  <text x="322" y="372" font-family="Inter, Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="#9BA1AC" letter-spacing="7">DISCOVER. TRACK. WATCH.</text>
</svg>`;

async function render(svg, size) {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

await mkdir(publicDir, { recursive: true });

for (const [source, output, size] of APP_ICONS) {
  const svg = await readFile(join(images, source), "utf8");
  const png = await render(svg, size);
  await writeFile(join(images, output), png);
  console.log(`${source} -> assets/images/${output} (${size}px)`);
}

for (const [source, output, size] of WEB_ICONS) {
  const svg = await readFile(join(images, source), "utf8");
  const png = await render(svg, size);
  await writeFile(join(publicDir, output), png);
  console.log(`${source} -> public/${output} (${size}px)`);
}

const ogCard = await sharp(Buffer.from(OG_CARD), { density: 144 })
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(join(publicDir, "og-image.png"), ogCard);
console.log(`og card -> public/og-image.png (1200x630)`);
