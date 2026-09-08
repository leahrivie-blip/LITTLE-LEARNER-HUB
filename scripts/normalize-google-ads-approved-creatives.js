#!/usr/bin/env node
"use strict";

// Places the owner-approved source images on exact 1200×1200 canvases without
// cropping or altering their artwork. This is intentionally separate from app
// and curriculum code.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const adsDirectory = path.join(root, "images", "google-ads");
const sourceDirectory = path.join(adsDirectory, "source", "approved-originals");
const creatives = [
  "01-hero-product.png",
  "02-lesson-plan-week.png",
  "03-print-prep-go.png",
  "04-meaningful-play.png",
  "05-product-features.png",
  "06-start-free-today.png"
];
const size = 1200;

async function normalizeCreative(filename) {
  const source = path.join(sourceDirectory, filename);
  const target = path.join(adsDirectory, filename);
  const metadata = await sharp(source).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) {
    throw new Error(`${filename} is not a readable PNG source.`);
  }

  await sharp(source)
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toFile(target);

  const output = await sharp(target).metadata();
  if (output.width !== size || output.height !== size) {
    throw new Error(`${filename} normalization did not produce ${size}×${size}.`);
  }
}

async function main() {
  fs.mkdirSync(sourceDirectory, { recursive: true });
  for (const filename of creatives) {
    const source = path.join(sourceDirectory, filename);
    const target = path.join(adsDirectory, filename);
    if (!fs.existsSync(source)) {
      fs.copyFileSync(target, source);
    }
    await normalizeCreative(filename);
  }
  console.log(`Normalized ${creatives.length} owner-approved creatives to ${size}×${size}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
