#!/usr/bin/env node
/**
 * Rasterize CINELOG brand SVGs into the PNG assets Expo/Android expect.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const imagesDir = resolve(__dirname, "../assets/images");

function render(svgName, pngName, width) {
  const svg = readFileSync(resolve(imagesDir, svgName), "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "transparent",
  });
  const png = resvg.render().asPng();
  writeFileSync(resolve(imagesDir, pngName), png);
  console.log(`Wrote ${pngName} (${width}px, ${png.length} bytes)`);
}

render("logo.svg", "logo.png", 1024);
render("logo.svg", "icon.png", 1024);
render("logo.svg", "splash-icon.png", 1024);
render("logo.svg", "favicon.png", 512);
render("intro.svg", "intro.png", 2048);
render("android-foreground.svg", "android-icon-foreground.png", 1024);
render("android-background.svg", "android-icon-background.png", 1024);
render("android-monochrome.svg", "android-icon-monochrome.png", 1024);

console.log("CINELOG brand assets rendered.");
