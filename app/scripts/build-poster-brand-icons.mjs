import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { optimize } from "svgo";
import * as simpleIcons from "simple-icons";

const OUTPUT_FILE = resolve(process.cwd(), "assets/generated/poster-brand-icons.json");

const BRAND_SLUGS = [
  "adidas",
  "nike",
  "puma",
  "championsleague",
  "laliga",
  "premierleague",
  "seriea",
  "bundesliga",
  "ligue1",
];

function pickIcon(slug) {
  const direct = simpleIcons.Get(slug);
  if (direct) return direct;
  const byTitle = Object.values(simpleIcons)
    .find((icon) => icon && typeof icon === "object" && String(icon.title || "").toLowerCase().replace(/\s+/g, "") === slug);
  return byTitle || null;
}

const out = {};
for (const slug of BRAND_SLUGS) {
  const icon = pickIcon(slug);
  if (!icon) continue;
  const rawSvg = `<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"#${icon.hex}\" d=\"${icon.path}\"/></svg>`;
  const optimized = optimize(rawSvg, {
    multipass: true,
    plugins: ["preset-default", "removeDimensions"],
  });
  out[slug] = {
    title: icon.title,
    hex: `#${icon.hex}`,
    svg: optimized.data,
  };
}

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
console.log(`Generated ${Object.keys(out).length} optimized icons at ${OUTPUT_FILE}`);
