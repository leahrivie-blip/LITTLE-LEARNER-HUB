#!/usr/bin/env node
/**
 * One-off/rerunnable generator: rasterizes the existing brand SVG icons into
 * PNG app icons (192/512 + maskable-safe-zone variant) for real installability.
 *
 * iOS Safari "Add to Home Screen" and some Android install criteria are far
 * more reliable with PNG icons than inline SVG manifest icons. This does not
 * change the brand artwork — it only rasterizes the current SVGs and adds a
 * padded maskable variant so OS icon masks (circle/squircle) don't clip the
 * initials.
 *
 * Run: node scripts/generate-app-icons.js
 * Requires devDependency "sharp" (not a runtime dependency of the server).
 */
const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("sharp is not installed. Run: npm install --no-save sharp, then re-run this script.");
  process.exit(1);
}

const ICONS_DIR = path.join(__dirname, "..", "images", "icons");

const SOURCE_SVG = fs.readFileSync(path.join(ICONS_DIR, "icon-512.svg"), "utf8");

// Maskable variant: shrink the artwork onto a safe-zone (icon content kept
// within the inner ~80% so OS masks like circle/squircle never clip it) while
// the background gradient still bleeds to the full edge.
const MASKABLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5b9bd5" />
      <stop offset="100%" stop-color="#8b7cf6" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)" />
  <g transform="translate(51.2 51.2) scale(0.8)">
    <circle cx="256" cy="204" r="82" fill="#ffffff" opacity="0.18" />
    <path d="M152 162h60v188h112v54H152z" fill="#ffffff" />
    <path d="M247 162h53v134h60v54H247z" fill="#ffffff" opacity="0.96" />
  </g>
</svg>
`;

async function run() {
  const targets = [
    { file: "icon-192.png", svg: SOURCE_SVG, size: 192 },
    { file: "icon-512.png", svg: SOURCE_SVG, size: 512 },
    { file: "icon-maskable-192.png", svg: MASKABLE_SVG, size: 192 },
    { file: "icon-maskable-512.png", svg: MASKABLE_SVG, size: 512 },
    { file: "apple-touch-icon.png", svg: SOURCE_SVG, size: 180 },
    { file: "badge-72.png", svg: SOURCE_SVG, size: 72 },
  ];
  for (const target of targets) {
    const outPath = path.join(ICONS_DIR, target.file);
    await sharp(Buffer.from(target.svg), { density: 384 })
      .resize(target.size, target.size)
      .png()
      .toFile(outPath);
    console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  }
}

run().catch((error) => {
  console.error("Icon generation failed:", error);
  process.exit(1);
});
