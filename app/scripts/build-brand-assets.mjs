#!/usr/bin/env node
/**
 * Renders the CineLog brand PNGs from the SVG sources in assets/images.
 *
 * Run after changing any brand SVG:
 *   npm -w app run brand:assets
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const images = join(here, "..", "assets", "images");

/** `[source SVG, output PNG, pixel size]` */
const TARGETS = [
  ["logo.svg", "icon.png", 1024],
  ["logo.svg", "logo.png", 1024],
  ["logo.svg", "splash-icon.png", 1024],
  ["logo.svg", "favicon.png", 256],
  ["android-foreground.svg", "android-icon-foreground.png", 1024],
  ["android-background.svg", "android-icon-background.png", 1024],
  ["android-monochrome.svg", "android-icon-monochrome.png", 1024],
];

for (const [source, output, size] of TARGETS) {
  const svg = await readFile(join(images, source));
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(images, output), png);
  console.log(`${source} -> ${output} (${size}px, ${(png.length / 1024).toFixed(1)} kB)`);
}
